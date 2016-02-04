import Http from 'http';
import Cluster from 'cluster';
import EnvConfig from 'config';
import _ from 'lodash';
import express from 'express';

import buildServerApp from './ServerAppBuilder';

//var SocketIO = require('socket.io');

/**
 * Normalize a port into a number, string, or false.
 */
function normalizePort(val) {
    const port = parseInt(val, 10);

    if (isNaN(port)) {
        // named pipe
        return val;
    }

    if (port >= 0) {
        // port number
        return port;
    }

    return false;
}

/**
 * Event listener for HTTP server "error" event.
 */

function onError(error, bind) {
    if (error.syscall !== 'listen') {
        throw error;
    }

    // handle specific listen errors with friendly messages
    switch (error.code) {
        case 'EACCES':
            console.error(`${bind} requires elevated privileges`);
            process.exit(1);
            break;
        case 'EADDRINUSE':
            console.error(`${bind} is already in use`);
            process.exit(1);
            break;
        default:
            throw error;
    }
}

function master() {
    // Count the machine's CPUs
    const cpuCount = require('os').cpus().length;

    // Create a worker for each CPU
    for (let i = 0; i < cpuCount; i += 1) {
        Cluster.fork();
    }
}

function worker(config) {
    const app = express();

    // TODO: make this configurable
    //if (EnvConfig.util.getEnv('NODE_ENV') !== 'production' && EnvConfig.util.getEnv('NODE_ENV') !== 'staging') {
    //    (function () {
    //        // Step 1: Create & configure a webpack compiler
    //        const webpack = require('webpack');
    //        const webpackConfig = require(process.env.WEBPACK_CONFIG ? process.env.WEBPACK_CONFIG : './../webpack.config');
    //        const compiler = webpack(webpackConfig);
    //
    //        // Step 2: Attach the dev middleware to the compiler & the server
    //        app.use(require('webpack-dev-middleware')(compiler, {
    //            noInfo: true, publicPath: webpackConfig.output.publicPath
    //        }));
    //
    //        // Step 3: Attach the hot middleware to the compiler & the server
    //        app.use(require('webpack-hot-middleware')(compiler, {
    //            log: console.log, path: '/__webpack_hmr', heartbeat: 10 * 1000
    //        }));
    //    })();
    //}

    buildServerApp(app, config);

    let port = null;
    if (EnvConfig.has('PORT')) {
        port = normalizePort(EnvConfig.get('PORT'));
    } else {
        port = 3000; // default value
    }

    app.set('port', port);

    const server = Http.createServer(app);

    // TODO: make this configurable
    //var io = SocketIO(server);

    server.listen(port);

    const address = server.address();
    const bind = _.isString(address) ? `Pipe ${address}` : `port ${address.port}`;

    server.on('error', (error) => onError(error, bind));
    server.on('listening', () => {
        console.log(`Server Listening on: ${bind}`);
    });

    // TODO: make this configurable - but also solve cluster issue with web-sockets
    // initialize sockets
    //require('../dist/server/WebSockets.js')(io);
}

export default function (config) {
    if (EnvConfig.util.getEnv('NODE_ENV') !== 'production' && EnvConfig.util.getEnv('NODE_ENV') !== 'staging') {
        worker(config);
    } else {
        if (Cluster.isMaster) {
            master();
        } else {
            worker(config);
        }
    }
}
