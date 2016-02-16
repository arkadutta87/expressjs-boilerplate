import _ from 'lodash';
import express from 'express';
import Promise from 'bluebird';
import Table from 'cli-table2';
import URL from 'url';
import QueryString from 'qs';

import performanceNow from 'performance-now';

const ApiPathPrefix = 'api';

const printRoutes = _.once(routes => {
    const table = new Table({head: ['', 'Name', 'Path']});

    for (const key in routes) {
        if (routes.hasOwnProperty(key)) {
            let val = routes[key];
            if (val.route) {
                val = val.route;
                table.push({
                    [val.stack[0].method]: [val.path, val.path]
                });
            }
        }
    }

    console.log('API Routes :');
    console.log(table.toString());
});

function wrap(req, res, api, apiObj) {
    const startTime = performanceNow();

    const query = URL.parse(req.originalUrl).query;
    let queryObject = {};
    if (query && !_.isEmpty(query)) {
        queryObject = QueryString.parse(query, {allowDots: true});
    }

    const data = _.extend({}, req.body, queryObject, req.params);

    return Promise.resolve(api.call(apiObj, req, data))
      .then((result) => {
          if (result) {
              result.requestTime = req.body.requestTime;
              result.serviceTimeTaken = (performanceNow() - startTime).toFixed(3);
          }

          return res.json(result);
      })
      .catch((error) => {
          console.error('post:Error: ', error);
          return res.status(500).json(error);
      });
}

function buildRoute(api, key, value, router) {
    const path = `/${ApiPathPrefix}/${key}`;
    const method = _.lowerCase(value.method) || 'post';

    router[method](path, (req, res) => {
        wrap(req, res, value.handler, api);
    });
}

function buildRoutes(apiOrBuilder, router) {
    // if it's a builder function, build it...
    const api = _.isFunction(apiOrBuilder) ? apiOrBuilder() : apiOrBuilder;

    _.forEach(api.registry(), (value, key) => {
        if (_.isArray(value)) {
            _.forEach(value, (item) => buildRoute(api, key, item, router));
        } else {
            buildRoute(api, key, value, router);
        }
    });
}

export default (apiOrApiArray) => {
    const router = express.Router();

    if (_.isArray(apiOrApiArray)) {
        _.forEach(apiOrApiArray, api => buildRoutes(api, router));
    } else {
        buildRoutes(apiOrApiArray, router);
    }

    printRoutes(router.stack);

    return router;
};