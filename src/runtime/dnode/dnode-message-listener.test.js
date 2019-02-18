const DefaultMessageRouter = require('../../core/message-router').DefaultMessageRouter;
const DnodeMessageListener = require('./dnode-message-listener').DnodeMessageListener;
const DnodeServiceInvoker = require('./dnode-service-invoker').DnodeServiceInvoker;
const dnode = require('dnode');

describe('DnodeMessageListener', () => {
  let services = [];
  let routers = {};
  beforeEach(() => {

    services = [];
    routers = {};

    const createClusterMembership = () => {
      return {
        services: (filter) => {
          return Promise.resolve(filter ? filter(services) : services);
        },
        registerService: (registration) => {
          services.push(registration);
          return Promise.resolve();
        },
        unregisterService: () => {
          return Promise.resolve()
        }
      };
    };

    const fakeCluster = {
      joinCluster: () => Promise.resolve(createClusterMembership())
    };

    return Promise.all(['router-a', 'router-b'].map((routerName) => {
      return new Promise((resolve) => {
        getPort()
          .then((port) => {
            const listener = new DnodeMessageListener(port);
            new DefaultMessageRouter(
              fakeCluster,
              new DnodeServiceInvoker(),
              listener)
              .start((err, router) => {
                router.register('some-stream', (data, header) => {
                  return {message: `hello from ${routerName}`, header};
                });
                routers[routerName] = {port, listener};
                resolve();
              });
          });
      })
    }));
  });
  afterEach(() => {
    Object.keys(routers).forEach(routerName => {
      routers[routerName].listener.stop();
    });
  });
  it('invokes services', () => {
    return new Promise((resolve) => {
      const input = {
        stream: 'some-stream',
        partitionKey: '1234',
        data: 'hello'
      };
      const d = dnode.connect(routers['router-a'].port);
      d.on('remote', (remote) => {
        remote.handle(input, (res) => {
          d.end();
          resolve(res);
        });
      });
    }).then((res) => {
      expect(res.message).toMatch(/hello from router\-[a-z]/);
      expect(res.header.stream).toBe('some-stream');
      expect(res.header.partitionKey).toBe('1234');
    });
  });
});
