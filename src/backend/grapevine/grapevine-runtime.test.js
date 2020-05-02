const {GrapevineCluster} = require('./');

jasmine.DEFAULT_TIMEOUT_INTERVAL = 100000;

describe('grapevineRuntime', () => {
  let nodes;
  let aggregateState = {};

  beforeEach(() => {
    nodes = {};
    return promiseSerial(['a', 'b']
      .map(nodeName => {
        return () => new Promise(resolve => {
          getPort().then(foundPort => {
            const node = {
              name: nodeName,
              port: foundPort,
              address: `127.0.0.1:${foundPort}`
            };
            const joinedNodes = Object.keys(nodes)
              .map(nodeName => nodes[nodeName])
              .filter(node => node)
              .map(node => node.address);
            node.cluster = new GrapevineCluster(node.address, joinedNodes);
            node.name = nodeName;
            nodes[nodeName] = node;
            node.cluster.joinCluster()
              .then(membership => {
                nodes[nodeName].membership = membership;
                // listen for gossiper message updates
                nodes[nodeName].membership.gossiper.on('update', (name, key, value) => {
                  if (key !== '__heartbeat__') {
                    aggregateState[key] = Object.assign({}, aggregateState[key] || {}, value);
                  }
                });
                resolve();
              });
          });
        });
      }));
  });

  afterEach(() => {
    return Promise.all(Object.keys(nodes)
      .map(nodeName => nodes[nodeName])
      .map(node => new Promise(resolve => {
        node.membership ? node.membership.gossiper.stop(() => resolve(node.name)) : resolve();
      })));
  });

  it('a', () => {
  });

  describe('service registration', () => {
    beforeEach(() => {
      return Promise.all([
        nodes.a.membership.registerService({ id: 'node-a-svc-1', stream: 'test-stream', endpoints: [] }),
        nodes.b.membership.registerService({ id: 'node-b-svc-1', stream: 'test-stream', endpoints: [] })
      ]).then(() => delayUntil(() => {
        return aggregateState.services
          && aggregateState.services['node-a-svc-1']
          && aggregateState.services['node-b-svc-1']
          && nodes.a.membership.gossiper.livePeers().length === 1
          && nodes.b.membership.gossiper.livePeers().length === 1
      }));
    });
    it('node-a can see node-b\'s services', () => {
      return nodes.a.membership.services().then(services => {
        expect(services.length).toBe(2);
        expect(services.filter(service => service.id === 'node-a-svc-1')[0].stream).toBe('test-stream');
        expect(services.filter(service => service.id === 'node-b-svc-1')[0].stream).toBe('test-stream');
      });
    });
    it('node-b can see node-a\'s services', () => {
      return nodes.b.membership.services().then(services => {
        expect(services.length).toBe(2);
        expect(services.filter(service => service.id === 'node-a-svc-1')[0].stream).toBe('test-stream');
        expect(services.filter(service => service.id === 'node-b-svc-1')[0].stream).toBe('test-stream');
      });
    });
    it('unregisters services', () => {
      return nodes.b.membership.unregisterService('node-b-svc-1')
        .then(() => {
          return nodes.b.membership.services().then(services => {
            expect(services.length).toBe(1);
            expect(services.filter(service => service.id === 'node-a-svc-1')[0].stream).toBe('test-stream');
          });
        });
    });
  });

});
