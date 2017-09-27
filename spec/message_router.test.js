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
    const peers = [{
      id: 'peer-1',
      self: true,
      host: 'localhost'
    }, {
      id: 'peer-2',
      self: true,
      host: 'localhost'
    }];
    const fakeCluster = {
      joinCluster() {
        return new Promise((resolve) => {
          resolve({
            all() {
              return peers;
            },
            setState(key, value) {
              peers.forEach((peer) => {
                peer[key] = value;
              });
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
        return conn.send({stream: 'something', partitionKey: '123123'});
      }).then((resp) => {
        expect(resp.peer).toEqual('peer-2');
        expect(resp.echo.stream).toEqual('something');
        expect(resp.echo.partitionKey).toEqual('123123');
      }).then(() => {
        routerConn.stop();
      }).catch((err) => {
        routerConn.stop();
        throw err;
      });
    });
    it('sends broadcasts to cluster members', () => {
      let routerConn;
      return new Promise((resolve) => {
        new router.MessageRouter(port, fakeCluster).start((err, conn) => {
          conn.register('something', (message) => {
            return {echo: message};
          });
          resolve(routerConn = conn);
        });
      }).then((conn) => {
        return conn.broadcast({stream: 'something', partitionKey: '123123'});
      }).then((resp) => {
        expect(resp.length).toEqual(2);
        expect(resp.map((res) => res.peer).indexOf('peer-1') > -1).toEqual(true);
        expect(resp.map((res) => res.peer).indexOf('peer-2') > -1).toEqual(true);
      }).then(() => {
        routerConn.stop();
      }).catch((err) => {
        routerConn.stop();
        throw err;
      });
    });
  });

});
