import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import bodyParser from 'body-parser';
import ms from 'ms';
import ExpressWinston from 'express-winston';

import buildLogger from './Logger';

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
    const logger = buildLogger(config.logDirectory || process.cwd());

    app.use(compression());

    app.use(ExpressWinston.logger({winstonInstance: logger, statusLevels: true}));

    if (config.client) {
        // view engine setup
        app.set('views', config.client.views || path.join(__dirname, 'views'));
        app.set('view engine', 'jade');

        if (config.client.publicPath) {
            app.use('/', express.static(config.client.publicPath, {index: false, maxAge: NinetyDays}));
        }

        if (config.client.resourcesPath) {
            app.use('/resources', express.static(config.client.resourcesPath, {index: false, maxAge: NinetyDays}));
        }
    }

    // For API and dynamic resources
    app.use((req, res, next) => {
        res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        res.header('Expires', '-1');
        res.header('Pragma', 'no-cache');
        next();
    });

    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({extended: false}));
    app.use(cookieParser());

    //
    // APIs
    //
    if (config.api) {
        require('./ApiRequestHandler').default(app, config.api);
    }

    //
    // CLIENT APP
    //
    if (config.client) {
        const clientAppRequestHandler = require('reactjs-web-boilerplate/lib/server/ClientAppRequestHandler').default;
        app.use(clientAppRequestHandler(config.client.routes, config.client.multiInstance, config.client.properties, config.api));
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
            res.render('error', {
                message: err.message,
                error: err
            });
        });
    }

    // TODO: depending on the user agent either return REST response or page response here
    // production error handler- no stack traces leaked to user
    app.use((err, req, res) => {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: {}
        });
    });
}