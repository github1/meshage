const consulRuntime = require('./consul-runtime');
const os = require('os');

describe('consulRuntime', () => {
  describe('ConsulCluster', () => {
    describe('joining without seeds', () => {
      it('resolves to a ConsulClusterMembership instance with a consulClient', () => {
        const cluster = new consulRuntime.ConsulCluster(1234);
        cluster.consulRef = jest.fn(() => 'consulClient');
        return cluster
          .joinCluster()
          .then((membership) => {
            expect(membership.consulClient).toEqual('consulClient');
          });
      });
    });
    describe('joining with seeds', () => {
      it('it joins the first seed', () => {
        const cluster = new consulRuntime.ConsulCluster(1234, [2234, 3234]);
        const mockConsulClient = {
          agent: {
            join: jest.fn((seed, callback) => {
              callback();
            })
          }
        };
        cluster.consulRef = jest.fn(() => mockConsulClient);
        return cluster
          .joinCluster()
          .then((membership) => {
            expect(membership.consulClient).toBe(mockConsulClient);
            expect(mockConsulClient.agent.join.mock.calls[0][0].address).toBe(`${os.hostname()}:2234`);
          });
      });
      it('rejects if unable to join the seed', () => {
        const cluster = new consulRuntime.ConsulCluster(1234, [2234]);
        const mockConsulClient = {
          agent: {
            join: jest.fn((seed, callback) => {
              callback(new Error('failed'));
            })
          }
        };
        cluster.consulRef = jest.fn(() => mockConsulClient);
        return cluster
          .joinCluster()
          .catch(err => err)
          .then(res => {
            expect(res instanceof Error).toBe(true);
          });
      });
    });
  });
  describe('ConsulClusterMembership', () => {
    describe('listing services', () => {
      it('lists all services from the catalog', () => {
        const mockConsulClient = {
          catalog: {
            service: {
              list: jest.fn(callback => {
                callback(null, {consul: {}, foo: {}});
              }),
              nodes: jest.fn((service, callback) => {
                callback(null, [{
                  ServiceID: '12345',
                  ServiceName: 'foo',
                  ServiceAddress: '127.0.0.1',
                  ServicePort: '8080'
                }]);
              })
            }
          }
        };
        const membership = new consulRuntime.ConsulClusterMembership(mockConsulClient);
        const mockFilter = jest.fn(services => services);
        return membership
          .services(mockFilter)
          .then(services => {
            expect(mockFilter).toHaveBeenCalledWith(services);
            expect(services[0].id).toBe('12345');
            expect(services[0].stream).toBe('foo');
            expect(services[0].endpoints[0].description).toBe('127.0.0.1:8080');
          });
      });
      it('rejects if failing to list services', () => {
        const mockConsulClient = {
          catalog: {
            service: {
              list: jest.fn(callback => {
                callback(new Error('failed'));
              }),
              nodes: jest.fn()
            }
          }
        };
        return new consulRuntime.ConsulClusterMembership(mockConsulClient)
          .services()
          .catch(err => err)
          .then(res => {
            expect(res instanceof Error).toBe(true);
            expect(mockConsulClient.catalog.service.nodes).not.toHaveBeenCalled();
          });
      });
      it('rejects if failing to list nodes', () => {
        const mockConsulClient = {
          catalog: {
            service: {
              list: jest.fn(callback => {
                callback(null, {consul: {}, foo: {}});
              }),
              nodes: jest.fn((service, callback) => {
                callback(new Error('failed'));
              })
            }
          }
        };
        return new consulRuntime.ConsulClusterMembership(mockConsulClient)
          .services()
          .catch(err => err)
          .then(res => {
            expect(res instanceof Error).toBe(true);
          });
      });
    });
    describe('registering services', () => {
      it('registers services', () => {
        const mockConsulClient = {
          agent: {
            service: {
              register: jest.fn((service, callback) => {
                callback();
              })
            }
          }
        };
        return new consulRuntime.ConsulClusterMembership(mockConsulClient)
          .registerService({
            id: '1234',
            stream: 'foo',
            endpoints: [{
              endpointType: 'http',
              description: '127.0.0.1:8080'
            }]
          })
          .then(() => {
            expect(mockConsulClient.agent.service.register).toHaveBeenCalled();
          });
      });
      it('rejects when service registration fails', () => {
        const mockConsulClient = {
          agent: {
            service: {
              register: jest.fn((service, callback) => {
                callback(new Error('failed'));
              })
            }
          }
        };
        return new consulRuntime.ConsulClusterMembership(mockConsulClient)
          .registerService({ id: '1234', stream: 'foo', endpoints: [] })
          .catch(err => err)
          .then(res => {
            expect(res instanceof Error).toBe(true);
          });
      });
    });
    describe('unregistering services', () => {
      it('unregisters services', () => {
        const mockConsulClient = {
          agent: {
            service: {
              deregister: jest.fn((service, callback) => {
                callback();
              })
            }
          }
        };
        return new consulRuntime.ConsulClusterMembership(mockConsulClient)
          .unregisterService('1234')
          .then(() => {
            expect(mockConsulClient.agent.service.deregister).toHaveBeenCalled();
          });
      });
      it('rejects when service unregistration fails', () => {
        const mockConsulClient = {
          agent: {
            service: {
              deregister: jest.fn((service, callback) => {
                callback(new Error('failed'));
              })
            }
          }
        };
        return new consulRuntime.ConsulClusterMembership(mockConsulClient)
          .unregisterService('1234')
          .catch(err => err)
          .then(res => {
            expect(res instanceof Error).toBe(true);
          });
      });
    });
  });
});