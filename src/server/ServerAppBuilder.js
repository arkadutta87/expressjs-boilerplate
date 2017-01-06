import express from 'express';
import expressHandleBars from 'express-handlebars';
import path from 'path';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import bodyParser from 'body-parser';
import ms from 'ms';
import ExpressWinston from 'express-winston';
import sessionStore from 'connect-mongo';
import expressSession from 'express-session';
import passwordless from 'passwordless';
import MongoStore from 'passwordless-mongostore';
import flash from 'connect-flash';

import emailJs from 'emailjs';
//import mongo from 'mongodb';
import monk from 'monk';
import ses from 'node-ses';

import buildLogger from './Logger';
import apiRequestHandler from './ApiRequestHandler';

const NinetyDays = ms('90 days');

//
// config
//      client
//          views - directory where jade views are there, only required view is 'index'
//          routes - react router routes
//          publicPath
//          resourcesPath
//      api
//          services - service instances, that also implement registry methods
//
export default function (app, config) {
    //node ses code
    const loginContext = config.login_config;
    let sesKey = null;
    let sesSecret = null;
    let awsInstance = null;
    let sesClient = null;
    let sesFromMailID = null;
    let mailSubject = null;

    let mongoHost = null;
    let mongoPort = null;
    let databaseMongo = null;
    let userDataBase = null;
    let pathToMongoDb = null;
    let db = null;
    let passwordlessSecret = null;

    let MongoStoreSession = null;
    let host = null;

    let successRedirectURL = null;

    if (loginContext) {
        sesKey = loginContext.email_config.ses_key;
        sesSecret = loginContext.email_config.ses_secret;
        awsInstance = loginContext.email_config.ses_aws;
        sesClient = ses.createClient({key: sesKey, secret: sesSecret, amazon: awsInstance});
        sesFromMailID = loginContext.email_config.ses_mail_id;
        host = loginContext.email_config.host_index_link;
        mailSubject = loginContext.email_config.mail_subject;

        //mongo configs
        mongoHost = loginContext.mongo_config.mongo_host;
        mongoPort = loginContext.mongo_config.mongo_port;
        databaseMongo = loginContext.mongo_config.passwordless_db;
        userDataBase = loginContext.mongo_config.login_db;


        pathToMongoDb = `mongodb://${mongoHost}:${mongoPort}/${databaseMongo}`;
        db = monk(`${mongoHost}:${mongoPort}/${userDataBase}`);

        MongoStoreSession = sessionStore(expressSession);

        //passwordless config
        passwordlessSecret = loginContext.passwordless_config.session_secret;
        successRedirectURL = loginContext.passwordless_config.success_redirect;

        // Setup of Passwordless
        passwordless.init(new MongoStore(pathToMongoDb, {
            server: {
                auto_reconnect: true
            },
            mongostore: {
                collection: 'token'
            }
        }));

        //delivery mechanism for passwordless
        passwordless.addDelivery(
            (tokenToSend, uidToSend, recipient, callback) => {
                console.log(`$$$$$$$$$$$--------- Token Send : ${tokenToSend} , uidToSend : ${uidToSend} , recipient : ${recipient}`);
                sesClient.sendEmail({
                    to: recipient,
                    from: sesFromMailID,
                    subject: mailSubject,
                    message: `Hello!
                You can now access your account here: ${host}?token=${tokenToSend}&uid=${encodeURIComponent(uidToSend)}`
                }, (err, data, res) => {
                    if (err) {
                        console.log(err);
                    }
                    callback(err);
                });
            });
    }
    const logger = buildLogger(config.logDirectory || process.cwd());

    app.use(compression());

    // log body too
    ExpressWinston.requestWhitelist.push('params');
    ExpressWinston.requestWhitelist.push('cookies');
    ExpressWinston.requestWhitelist.push('body');

    ExpressWinston.responseWhitelist.push('_headers');

    app.use(ExpressWinston.logger({winstonInstance: logger, statusLevels: true}));

    if (config.client) {
        // view engine setup
        const viewsDirectory = config.client.views || path.join(__dirname, 'views');
        const layoutsDirectory = path.join(viewsDirectory, 'layouts');

        const hbsEngine = expressHandleBars.create({
            layoutsDir: layoutsDirectory,
            defaultLayout: 'default'
        });

        app.set('views', viewsDirectory);
        app.engine('handlebars', hbsEngine.engine);
        app.set('view engine', 'handlebars');

        if (config.client.publicPath) {
            app.use(config.client.multiInstance ? '/:instanceName' : '/', express.static(config.client.publicPath, {
                index: false,
                maxAge: NinetyDays
            }));
        }

        if (config.client.resourcesPath) {
            app.use(config.client.multiInstance ? '/:instanceName/resources' : '/resources', express.static(config.client.resourcesPath, {
                index: false,
                maxAge: NinetyDays
            }));
        }
    }

    // For API and dynamic resources
    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
        res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        res.header('Expires', '-1');
        res.header('Pragma', 'no-cache');
        next();
    });

    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({extended: false}));
    app.use(cookieParser());

    if (loginContext) {
        app.use(expressSession(
            {
                secret: passwordlessSecret,
                saveUninitialized: false,
                resave: false,
                cookie: {maxAge: 365 * 24 * 60 * 60 * 1000},
                store: new MongoStoreSession({
                    db: databaseMongo,
                    host: mongoHost,
                    port: mongoPort,
                    collection: 'session',
                    auto_reconnect: true,
                    url: `mongodb://${mongoHost}:${mongoPort}/${databaseMongo}`
                })
            }
        ));

        app.use(flash());
        app.use(passwordless.sessionSupport());
        app.use(passwordless.acceptToken({successRedirect: successRedirectURL}));//'/'

        const stringFailedLogin = 'FAILED-LOGIN';

        /* GET login screen. */
        app.get('/login', (req, res) => {
            //let error = null;
            const error = req.flash('passwordless');
            console.log(`\n\n$$$$$$----- flash messages : ${JSON.stringify(error)}\n\n`);
            if (req.user) {
                res.redirect('/');
            } else if (error.length !== 0) {
                res.render('login', {loginFailed: true});
            } else {
                res.render('login', {user: req.user});
            }
        });


        /* POST login screen. */
        app.post('/sendtoken',
            passwordless.requestToken(
                // Simply accept every user
                (user, delivery, callback, req) => {
                    console.log(`User Object : ${JSON.stringify(user)}`);
                    console.log(`request object : ${JSON.stringify(req.body)}`);

                    //const dbInst = req.db;
                    const userName = req.body.user;
                    const instanceName = req.body.instanceName;

                    // Fetch from 'users' collection
                    const loginCollection = db.get('login');
                    loginCollection.findOne({username: userName, instanceName, isEnabled: true}, (e, doc) => {
                        if (e) {
                            console.log(e);
                            req.loginStatus = false;
                            callback(null, null);
                        } else if (doc) {
                            console.log(JSON.stringify(doc));
                            //req.name = doc.name;
                            callback(null, doc._id);
                        } else {
                            req.loginFailed = true;
                            callback(null, null);
                        }
                    });
                }, {failureRedirect: '/login', failureFlash: stringFailedLogin}),
            (req, res) => {
                res.render('login', {tokenSent: true});
            });


        app.use((req, res, next) => {
            console.log('\n\n$$$$$$ ---- Inside The Code for Arka ----- $$$$$$$$ \n\n');
            if (req.user) {
                console.log('$$$$$ ---- Inside the code to set __userContext__ ');
                const loginCollection = db.get('login');
                loginCollection.findById(req.user, (error, user) => {
                    console.log(`User returned from ID --- : ${JSON.stringify(user)}`);
                    req.__userContext__ = user;
                    next();
                });
            } else {
                next();
            }
        });


        app.all('/*', passwordless.restricted({failureRedirect: '/login'}), (req, res, next) => {
            next();
        });


        app.get('/logout', passwordless.logout(),
            (req, res) => {
                res.redirect('/login');
            });
    }
    //
    // APIs
    //
    if (config.api) {
        app.use(apiRequestHandler(config.api));
    }

    //
    // CLIENT APP
    //
    if (config.client) {
        // eslint-disable-next-line import/no-unresolved, import/no-extraneous-dependencies
        const clientAppRequestHandler = require('reactjs-web-boilerplate/lib/server/ClientAppRequestHandler').default;

        app.use(config.client.multiInstance ? '/:instanceName' : '/', clientAppRequestHandler(config.client.routes, config.client.multiInstance, config.client.properties, config.api));
    }

    // TODO: depending on the user agent either return REST response or page response here
    // catch 404 and forward to error handler
    app.use((req, res, next) => {
        const err = new Error('404::Not Found');
        err.status = 404;
        next(err);
    });

    app.use(ExpressWinston.errorLogger({winstonInstance: logger}));

    //
    // ERROR HANDLERS
    //

    // TODO: depending on the user agent either return REST response or page response here
    // development error handler - will print stacktrace
    if (app.get('env') === 'development') {
        app.use((err, req, res) => {
            res.status(err.status || 500);
            // res.render('error', {
            //     message: err.message,
            //     error: err
            // });
            res.send({message: err.message, status: err.status, error: err});
        });
    }

    // TODO: depending on the user agent either return REST response or page response here
    // production error handler- no stack traces leaked to user
    app.use((err, req, res) => {
        res.status(err.status || 500);
        // res.render('error', {
        //     message: err.message,
        //     error: {}
        // });
        res.send({message: err.message, status: err.status});
    });
}