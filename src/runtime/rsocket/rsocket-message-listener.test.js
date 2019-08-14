const DefaultMessageRouter = require('../../core').DefaultMessageRouter;
const RSocketMessageListener = require('./rsocket-message-listener').RSocketMessageListener;
const RSocketServiceInvoker = require('./rsocket-service-invoker').RSocketServiceInvoker;

describe('RSocketMessageListener', () => {
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
            const listener = new RSocketMessageListener(port);
            new DefaultMessageRouter(
              fakeCluster,
              new RSocketServiceInvoker(),
              listener)
              .start((err, router) => {
                router.register('some-stream', (data, header) => {
                  return {message: `hello from ${routerName}`, header};
                });
                routers[routerName] = {port, listener, router};
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
    const input = {
      stream: 'some-stream',
      partitionKey: '1234',
      data: 'hello'
    };
    return routers['router-b'].router
      .send(input)
      .then((res) => {
        expect(res.message).toMatch(/hello from router-[a-z]/);
        expect(res.header.stream).toBe('some-stream');
        expect(res.header.partitionKey).toBe('1234');
      });
  });
});
