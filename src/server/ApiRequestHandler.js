import _ from 'lodash';
import Promise from 'bluebird';
import URL from 'url';
import QueryString from 'qs';
import performanceNow from 'performance-now';

import Winston from 'winston';

const apiErrorsLogger = Winston.loggers.get('API_ERRORS');

const ApiPathPrefix = 'api';

//import Table from 'cli-table2';
//const printRoutes = _.once(routes => {
//    const table = new Table({head: ['', 'Name', 'Path']});
//
//    for (const key in routes) {
//        if (routes.hasOwnProperty(key)) {
//            let val = routes[key];
//            if (val.route) {
//                val = val.route;
//                table.push({
//                    [val.stack[0].method]: [val.path, val.path]
//                });
//            }
//        }
//    }
//
//    console.log('API Routes :');
//    console.log(table.toString());
//});

function wrap(req, res, api, apiObj) {
    const startTime = performanceNow();

    const query = URL.parse(req.originalUrl).query;
    let queryObject = {};
    if (query && !_.isEmpty(query)) {
        queryObject = QueryString.parse(query, {allowDots: true});
    }

    const data = _.extend({}, req.body, queryObject, req.params);

    let promise = null;
    try {
        promise = api.call(apiObj, req, data);
    } catch (error) {
        promise = Promise.reject(error);
    }

    return Promise.resolve(promise)
      .then((result) => {
          if (result) {
              result.requestTime = req.body.requestTime;
              result.serviceTimeTaken = (performanceNow() - startTime).toFixed(3);
          }

          return res.json(result);
      })
      .catch((error) => {
          if (error && _.isObject(error)) {
              error._errorId = Date.now();

              apiErrorsLogger.error(_.omit(error, 'stack'));

              return res.status(error._status ? error._status : 500).json(error.name === 'InternalServiceError' ? _.omit(error, 'details') : error);
          }

          apiErrorsLogger.error(error);

          return res.status(500).json(error);
      });
}

function buildRoute(app, api, key, value, pathPrefix) {
    let path = null;

    if (pathPrefix) {
        path = `${pathPrefix}/${key}`;
    } else {
        path = `/${ApiPathPrefix}/${key}`;
    }

    const method = _.lowerCase(value.method) || 'post';

    app[method](path, (req, res) => {
        wrap(req, res, value.handler, api);
    });

    // emit event here
}

// should build a catch all route for pathPrefix ??
function buildRoutes(app, apiOrBuilder) {
    // if it's a builder function, build it...
    let pathPrefix = null;
    let api = null;
    let registry = null;
    if (_.isObject(apiOrBuilder)) {
        pathPrefix = apiOrBuilder.path;
        api = apiOrBuilder.api;
        registry = apiOrBuilder.registry;
    } else {
        api = apiOrBuilder;
    }

    if (_.isFunction(api)) {
        api = api();
    }

    if (!registry && _.isFunction(api.registry)) {
        registry = api.registry();
    }

    if (!registry) {
        // print errors here
        return;
    }

    _.forEach(registry, (value, key) => {
        if (_.isArray(value)) {
            _.forEach(value, (item) => buildRoute(app, api, key, item, pathPrefix));
        } else {
            buildRoute(app, api, key, value, pathPrefix);
        }
    });
}

//function registerApi(app, api) {
//
//}
//
//function unRegisterApi(app, api) {
//
//}

export default (app, config) => {
    //if (config && config.watch) {
    //
    //}

    const apiOrApiArray = config.services;
    if (apiOrApiArray) {
        _.forEach(_.isArray(apiOrApiArray) ? apiOrApiArray : [apiOrApiArray], api => buildRoutes(app, api));
    }
};