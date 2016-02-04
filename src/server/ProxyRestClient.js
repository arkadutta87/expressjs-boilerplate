export default class ProxyRestClient {
    constructor(req, routesRegistry) {
        this.req = req;
        this.routesRegistry = routesRegistry;
    }

    get(path) {
        return this.routesRegistry.handle({path, method: 'get', session: this.req.session, user: this.req.user});
    }

    post(path, data) {
        return this.routesRegistry.handle({path, method: 'post', session: this.req.session, user: this.req.user, data});
    }
}