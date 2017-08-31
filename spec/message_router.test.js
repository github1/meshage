const router = require('../src/message_router');
const portfinder = require('portfinder');

describe('message_router', () => {

    let port;

    beforeAll(() => {
        return portfinder.getPortPromise().then((found) => {
            port = found;
        });
    });

    describe('MessageRouter', () => {
        const peer = {
            id: 'some-peer',
            self: true,
            host: 'localhost'
        };
        const fakeCluster = {
            joinCluster() {
                return new Promise((resolve) => {
                    resolve({
                        all() {
                            return [peer];
                        },
                        setState(key, value) {
                            peer[key] = value;
                        }
                    });
                });
            }
        };
        it('sends commands to cluster members', () => {
            let routerConn;
            return new Promise((resolve) => {
                new router.MessageRouter(port, fakeCluster).start((err, conn) => {
                    conn.register('something', (message) => {
                        return {echo: message};
                    });
                    resolve(routerConn = conn);
                });
            }).then((conn) => {
                return conn.send({stream: 'something', partitionKey: '12312'});
            }).then((resp) => {
                expect(resp.peer).toEqual('some-peer');
                expect(resp.echo.stream).toEqual('something');
                expect(resp.echo.partitionKey).toEqual('12312');
            }).then(() => {
                routerConn.stop();
            }).catch((err) => {
                routerConn.stop();
                throw err;
            });
        });
    });

});
