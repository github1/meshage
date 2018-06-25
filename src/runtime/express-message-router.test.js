const expressMessageRouter = require('./express-message-router');

describe('ExpressMessageRouter', () => {
  let services = [];
  let routers = {};
  beforeEach(() => {

    services = [];
    routers = {};

    const fakeClusterMembership = {
      services: (filter) => {
        return Promise.resolve(filter(services));
      },
      registerService: (id, stream, address) => {
        services.push({id, stream, address});
        return Promise.resolve();
      },
      unregisterService: () => {
        return Promise.resolve()
      }
    };

    const fakeCluster = {
      joinCluster: () => Promise.resolve(fakeClusterMembership)
    };

    return promiseSerial(['a', 'b'].map(serviceName => {
      return () => new Promise(resolve => {
        getPort()
          .then(foundPort => {
            new expressMessageRouter.ExpressMessageRouter(fakeCluster, foundPort)
              .register('test-stream', message => {
                //return [serviceName, message.stream, message.data].join('-');
                return {
                  serviceName,
                  stream: message.stream,
                  data: message.data
                };
              })
              .start((err, router) => {
                routers[serviceName] = router;
                resolve();
              });
          });
      });
    }));

  });
  describe('when a message is sent', () => {
    it('sends the message to a node', () => {
      return routers.a
        .send({stream: 'test-stream', partitionKey: '123', data: 'hi'})
        .then(res => {
          expect(res.serviceName).toMatch(/^(a|b)$/);
          expect(res.data).toBe('hi');
          expect(res.stream).toBe('test-stream');
        })
    });
    it('broadcasts messages to all nodes', () => {
      return routers.a
        .broadcast({stream: 'test-stream', partitionKey: '123', data: 'hi'})
        .then(res => {
          expect(res).toEqual([{
            'data': 'hi',
            'serviceName': 'a',
            'stream': 'test-stream'
          },
            {
              'data': 'hi',
              'serviceName': 'b',
              'stream': 'test-stream'
            }]);
        })
    });
  });
});
