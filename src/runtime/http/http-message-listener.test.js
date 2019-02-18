const DefaultMessageRouter = require('../../core/message-router').DefaultMessageRouter;
const HttpMessageListener = require('./http-message-listener').HttpMessageListener;
const HttpServiceInvoker = require('./http-service-invoker').HttpServiceInvoker;
const superagent = require('superagent');

describe('HttpMessageListener', () => {

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
            const listener = new HttpMessageListener(port);
            new DefaultMessageRouter(
              fakeCluster,
              new HttpServiceInvoker(),
              listener)
              .start((err, router) => {
                router.register('some-stream', (data, header) => {
                  return { message: `hello from ${routerName}`, header };
                });
                routers[routerName] = { port, listener };
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
  it('lists services', () => {
    return promiseOf(superagent
      .get(`http://localhost:${routers['router-a'].port}/api/services`)
      .send())
      .then((res) => {
        expect(res.body.length).toBe(2);
        expect(res.body[0].stream).toBe('some-stream');
      });
  });

  it('invokes services', () => {
    expect.assertions(3);
    return promiseOf(superagent
      .post(`http://localhost:${routers['router-a'].port}/api/some-stream/1234`)
      .send())
      .then((res) => {
        expect(res.body.message).toMatch(/hello from router\-[a-z]/);
        expect(res.body.header.partitionKey).toBe('1234');
        expect(res.body.header.stream).toBe('some-stream');
      });
  });

  it('broadcasts requests', () => {
    expect.assertions(4);
    return promiseOf(superagent
      .post(`http://localhost:${routers['router-a'].port}/api/broadcast/some-stream/1234`)
      .send())
      .then((res) => {
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body[0].message).toMatch(/hello from router\-[a-z]/);
        expect(res.body[1].message).toMatch(/hello from router\-[a-z]/);
        expect(res.body[0].message).not.toEqual(res.body[1].message);
      });
  });

});

const promiseOf = (req) => {
  return new Promise((resolve, reject) => {
    req.end((err, res) => {
      if (err) {
        reject(err);
      } else {
        resolve(res);
      }
    });
  });
};
