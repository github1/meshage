const grapevineRuntime = require('./grapevine-runtime');

jasmine.DEFAULT_TIMEOUT_INTERVAL = 100000;

describe('grapevineRuntime', () => {
  let nodes = {};

  beforeEach(() => {
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
              node.cluster = new grapevineRuntime.GrapevineCluster(node.address, joinedNodes);
              nodes[nodeName] = node;
              node.cluster.joinCluster()
                .then(membership => {
                  nodes[nodeName].membership = membership;
                  resolve();
                });
            });
        });
      }));
  });

  describe('service registration', () => {
    beforeEach(() => {
      nodes.a.membership.registerService('node-a-svc-1', 'test-stream', 'anAddress');
      nodes.b.membership.registerService('node-b-svc-1', 'test-stream', 'anAddress');
    });
    it('node-a can see node-b\'s services', () => {
      return getServices(nodes.a.membership, 1).then(services => {
        expect(services.length).toBe(2);
        expect(services.filter(service => service.id === 'node-b-svc-1')[0].stream).toBe('test-stream');
      });
    });
    it('node-b can see node-a\'s services', () => {
      return getServices(nodes.b.membership, 1).then(services => {
        expect(services.length).toBe(2);
        expect(services.filter(service => service.id === 'node-a-svc-1')[0].stream).toBe('test-stream');
      });
    });
  });

});


const getServices = (membership, threshold = 0) => {
  return new Promise(resolve => {
    const check = () => {
      membership.services().then(services => {
        if (services.length > threshold) {
          resolve(services);
        } else {
          setTimeout(() => check(), 1);
        }
      });
    };
    check();
  });
};
