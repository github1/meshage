import {
  Cluster,
  ClusterMembership,
  ClusterService,
  ClusterServiceEndpoint,
  ClusterServiceFilter,
  getEndpointsByType,
  Address,
  parseAddress,
  Addresses,
  prepareAddresses
} from '../../core';
import consul = require('consul');
import debug = require('debug');

const log : debug.IDebugger = debug('meshage:consul');

type ConsulService = {
  ServiceID? : string;
  ServiceName? : string;
  ServiceAddress? : string;
  ServicePort? : string;
  ServiceTags? : string[];
};

const endpointRegex = /^endpoint~([a-z]+)~(.*)$/;

export class ConsulClusterMembership implements ClusterMembership {

  constructor(private readonly consulClient : consul.Consul) {
  }

  public services(filter? : ClusterServiceFilter) : Promise<ClusterService[]> {
    return new Promise((resolve : (services : ClusterService[]) => void,
                        reject : (err : Error) => void) => {
      this.consulClient.catalog.service.list((err : Error, data : {}) => {
        if (err) {
          reject(err);
        }
        Promise.all(Object.keys(data)
          .filter((key : string) => key !== 'consul')
          .map((key : string) => {
            return new Promise((resolve : (services : ClusterService[]) => void,
                                reject : (err : Error) => void) => {
              this.consulClient.catalog.service.nodes(key, (err : Error, data : ConsulService[]) => {
                if (err) {
                  reject(err);
                } else {
                  const services : ClusterService[] = data
                    .map((consulService : ConsulService) => {
                      return {
                        id: consulService.ServiceID,
                        stream: consulService.ServiceName,
                        endpoints: consulService.ServiceTags
                          .filter((tag : string) => endpointRegex.test(tag))
                          .map((tag : string) => {
                            const parts = endpointRegex.exec(tag);
                            return {
                              endpointType: parts[1],
                              description: parts[2]
                            };
                          })
                      };
                    });
                  resolve(services);
                }
              });
            });
          }))
          .then((results : ClusterService[][]) => {
            const services : ClusterService[] = results
              .reduce((services : ClusterService[], serviceSet : ClusterService[]) => {
                return services.concat(serviceSet);
              }, []);
            resolve(filter ? filter(services) : services);
          })
          .catch(reject);
      });
    });
  }

  public registerService(registration : ClusterService) : Promise<void> {
    return new Promise((resolve : () => void, reject : (err : Error) => void) => {
      const httpEndpoint : ClusterServiceEndpoint = getEndpointsByType(registration, 'http')[0];
      const address: Address = parseAddress(registration.endpoints[0].description);
      const opts = {
        id: registration.id,
        name: registration.stream,
        address: address.host,
        port: address.port,
        tags: registration.endpoints
          .map((endpoint: ClusterServiceEndpoint) => {
            return `endpoint~${endpoint.endpointType}~${endpoint.description}`;
          }),
        check: {
          http: `${httpEndpoint.description}/api/health`,
          interval: '5s',
          notes: 'http service check',
          status: 'critical'
        }
      };
      this.consulClient.agent.service.register(opts, (err : Error) => {
        if (err) {
          log(err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  public unregisterService(id : string) : Promise<void> {
    return new Promise((resolve : () => void, reject : (err : Error) => void) => {
      this.consulClient.agent.service.deregister({id}, (err : Error) => {
        if (err) {
          log(err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

}

export class ConsulCluster implements Cluster {

  private readonly addresses : Promise<Addresses>;
  private readonly consulRef : consul.ConsulStatic = consul;

  constructor(address : (string | number), seeds : (string | number)[] = []) {
    this.addresses = prepareAddresses(address, seeds);
  }

  public joinCluster() : Promise<ClusterMembership> {
    return new Promise((resolve : (membership : ClusterMembership) => void, // tslint:disable-line:promise-must-complete
                        reject : (err : Error) => void) => {
      this.addresses.then((addresses : Addresses) => {
        const host : string = addresses.nodeAddress.host;
        const port : number = addresses.nodeAddress.port;
        const seeds : Address[] = addresses.seedAddresses;
        const consulClient : consul.Consul = this.consulRef({
          host,
          port: `${port}`
        });
        if (seeds.length > 0) {
          consulClient.agent.join({address: seeds[0].toString()}, (err : Error) => {
            if (err) {
              reject(err);
            } else {
              resolve(new ConsulClusterMembership(consulClient));
            }
          });
        } else {
          resolve(new ConsulClusterMembership(consulClient));
        }
      });
    });
  }

}
