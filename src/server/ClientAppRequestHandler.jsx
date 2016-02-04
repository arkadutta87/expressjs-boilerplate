/*
 * ____________________
 *
 * 360fy CONFIDENTIAL
 * ____________________
 *
 * [2015] - [2016] 360fy Technologies Private Limited
 * All Rights Reserved.
 *
 * NOTICE:  All information contained herein is, and remains
 * the property of 360fy Technologies Private Limited and its partners,
 * if any.  The intellectual and technical concepts contained
 * herein are proprietary to 360fy Technologies Private Limited
 * and its partners and may be covered by India and Foreign Patents,
 * patents in process, and are protected by trade secret or copyright law.
 * Dissemination of this information or reproduction of this material
 * is strictly forbidden unless prior written permission is obtained
 * from Adobe Systems Incorporated.
 *
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { match, RouterContext } from 'react-router';

import FluxController from 'reactjs-web-boilerplate/lib/app/flux/FluxController';
import ProxyRestClient from './ProxyRestClient';

import createHistory from 'history/lib/createMemoryHistory';

const ApiProxyRegistry = function () {
    const _registry = {
        get: [],
        post: []
    };

    function buildRoute(basePath, route) {
        if (!route.method) {
            route.method = 'get';
        }

        const routes = _registry[route.method];
        let path = basePath + route.path;
        if (!path.match(/\/$/g)) {
            path = `${path}/`;
        }

        if (routes) {
            routes.push({path, handler: route.handler});
        }
    }

    return {
        register(path, routes) {
            for (let i = 0; i < routes.length; i++) {
                buildRoute(path, routes[i]);
            }

            return this;
        },

        handle(req) {
            const deferred = Promise.defer();

            //console.log("Registry handle: ", req);

            const method = req.method || 'get';
            let path = req.path || '';
            if (!path.match(/\/$/g)) {
                path = `${path}/`;
            }

            const session = req.session;
            const user = req.user;
            const data = req.data;

            const routes = _registry[method];

            let matchingRoute = null;
            for (let i = 0; i < routes.length; i++) {
                const route = routes[i];
                if (path === route.path) {
                    matchingRoute = route;
                    break;
                }
            }

            if (!matchingRoute) {
                deferred.reject({statusCode: 500, entity: `No matching route for path: ${path}`});
            } else {
                const proxyRequest = {session, user, body: data};

                let _statusCode;

                const proxyResponse = {
                    status(statusCode) {
                        _statusCode = statusCode;
                        return this;
                    },

                    json(obj) {
                        deferred.resolve({
                            statusCode: _statusCode,
                            entity: obj
                        });
                        return this;
                    }
                };

                matchingRoute.handler(proxyRequest, proxyResponse);
            }

            return deferred.promise;
        }
    };
};

export default (routes, properties, api) => (req, res) => {
    const fluxController = new FluxController(properties);
    const fluxContext = fluxController.fluxContext;
    fluxContext.restClient = new ProxyRestClient(req, api);

    // Note that req.url here should be the full URL path from
    // the original request, including the query string.
    //const routes = appRoutes();

    match({routes, location: req.url}, (error, redirectLocation, renderProps) => {
        if (error) {
            res.status(500).send(error.message);
        } else if (redirectLocation) {
            res.redirect(302, redirectLocation.pathname + redirectLocation.search);
        } else if (renderProps) {
            const createFluxComponent = (Component, props) => <Component {...props} fluxController={fluxController}/>;

            const markup = renderToString(<RouterContext {...renderProps} history={createHistory()} createElement={createFluxComponent}/>);
            res.render('index', {pageContent: markup, fluxStoreContent: fluxController.renderToString()});
        } else {
            res.status(404).send('Not found');
        }
    });
};