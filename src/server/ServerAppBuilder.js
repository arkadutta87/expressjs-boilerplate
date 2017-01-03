import express from 'express';
import expressHandleBars from 'express-handlebars';
import path from 'path';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import bodyParser from 'body-parser';
import ms from 'ms';
import ExpressWinston from 'express-winston';
import expressSession from 'express-session';
import passwordless from 'passwordless';
import MongoStore from 'passwordless-mongostore';
import emailJs from 'emailjs';
//import mongo from 'mongodb';
import monk from 'monk';

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
    // TODO; enabled only when passwordless
    // TODO: email setup (has to be changed)
    const yourEmail = 'arkadutta0504@gmail.com';
    const yourPwd = 'ise2009006shalmoli';
    const yourSmtp = 'smtp.gmail.com';
    const smtpServer = emailJs.server.connect({
        user: yourEmail,
        password: yourPwd,
        host: yourSmtp,
        ssl: true
    });

    const mongoHost = 'localhost';
    const mongoPort = '27017';
    const databaseMongo = 'passwordless-simple-mail';
    const userDataBase = 'humane-cockpit-login-db';

    // TODO: MongoDB setup (given default can be used)
    const pathToMongoDb = `mongodb://${mongoHost}:${mongoPort}/${databaseMongo}`;

    const db = monk(`${mongoHost}:${mongoPort}/${userDataBase}`);

    // TODO: Path to be send via email -- to be configurable
    const host = 'http://localhost/';

    // Setup of Passwordless
    passwordless.init(new MongoStore(pathToMongoDb));
    passwordless.addDelivery(
        (tokenToSend, uidToSend, recipient, callback) => {
            console.log(`$$$$$$$$$$$--------- Token Send : ${tokenToSend} , uidToSend : ${uidToSend}`);
            // Send out token
            smtpServer.send({
                text: `Hello!
                You can now access your account here: ${host}?token=${tokenToSend}&uid=${encodeURIComponent(uidToSend)}`,
                from: yourEmail,
                to: recipient,
                subject: `Token for ${host}`
            }, (err, message) => {
                if (err) {
                    console.log(err);
                }
                callback(err);
            });
        });


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
    app.use(expressSession({secret: '#4ghvdjs^&9BBJJsd', saveUninitialized: false, resave: false}));

    //adding mongo handle to req
    // Make our db accessible to our router
    /*app.use((req, res, next) => {
        req.db = db;
        next();
    });*/

    // TODO; >>>>>> enabled only when passwordless
    //passwordless code
    app.use(passwordless.sessionSupport());
    app.use(passwordless.acceptToken({successRedirect: '/'}));

    // const router = express.Router();

    /* GET login screen. */
    app.get('/login', (req, res) => {
        if (req.user) {
            res.redirect('/');
        } else if (req.loginFailed) {
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
                // usually you would want something like:
            }, {failureRedirect: '/login'}),
        (req, res) => {
            res.render('login', {tokenSent: true});
        });

    app.use(passwordless.restricted({failureRedirect: '/login'}));

    app.use((req, res, next) => {
        console.log('\n\n$$$$$$ ---- Inside The Code for Arka ----- $$$$$$$$ \n\n');
        if (req.user) {
            console.log('$$$$$ ---- Inside the code to set __userContext__ ');

            //const dbInst = req.db;
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

    /* GET logout. */
    app.get('/logout', passwordless.logout(),
        (req, res) => {
            res.redirect('/login');
        });

    // TODO; <<<<< enabled only when passwordless

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