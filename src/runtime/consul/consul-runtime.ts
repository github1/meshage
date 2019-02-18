import {
  Cluster,
  ClusterMembership,
  ClusterService,
  ClusterServiceFilter
} from '../../core';
import {Address, parseAddress} from '../../core/address-parser';
import {Addresses, prepareAddresses} from '../address-provider';
import consul = require('consul');
import debug = require('debug');

const log : debug.IDebugger = debug('meshage');

type ConsulService = {
  ServiceID? : string;
  ServiceName? : string;
  ServiceAddress? : string;
  ServicePort? : string;
};

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
                  log(data);
                  const services : ClusterService[] = data
                    .map((consulService : ConsulService) => {
                      return {
                        id: consulService.ServiceID,
                        stream: consulService.ServiceName,
                        endpoints: [{
                          endpointType: 'http',
                          description: `${consulService.ServiceAddress}:${consulService.ServicePort}`
                        }]
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
            resolve(filter(services));
          })
          .catch(reject);
      });
    });
  }

  public registerService(registration : ClusterService) : Promise<void> {
    return new Promise((resolve : () => void, reject : (err : Error) => void) => {
      const address: Address = parseAddress(registration.endpoints[0].description);
      this.consulClient.agent.service.register({
        id: registration.id,
        name: registration.stream,
        address: address.host,
        port: address.port,
        check: {
          http: `http://${address.host}:${address.port}/api/health`,
          interval: '5s',
          notes: 'http service check',
          status: 'critical'
        }
      }, (err : Error) => {
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
