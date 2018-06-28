import {
  Cluster,
  ClusterMembership,
  ClusterService,
  ClusterServiceFilter
} from '../core/cluster';
import consul = require('consul');
import { Address, parseAddress } from '../core/address-parser';
import debug = require('debug');

const log : debug.IDebugger = debug('meshage');

type ConsulService = {
  ServiceID? : string;
  ServiceName? : string;
  ServiceAddress? : string,
  ServicePort? : string
};

export class ConsulClusterMembership implements ClusterMembership {

  constructor(private consulClient : consul.Consul) {
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
                        address: `${consulService.ServiceAddress}:${consulService.ServicePort}`
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

  public registerService(id : string, stream : string, address : string) : Promise<void> {
    return new Promise((resolve : () => void, reject : (err : Error) => void) => {
      const addr : Address = parseAddress(address);
      this.consulClient.agent.service.register({
        id,
        name: stream,
        address: addr.host,
        port: addr.port,
        check: {
          http: `http://${addr.host}:${addr.port}/api/health`,
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
    return Promise.reject(new Error('Not implemented yet'));
  }

}

export class ConsulCluster implements Cluster {

  private address : Address;
  private seeds : Address[];
  private consulRef : consul.ConsulStatic = consul;

  constructor(address : (string | number), seeds : (string | number)[] = []) {
    this.address = parseAddress(address);
    this.seeds = seeds.map(parseAddress);
  }

  public joinCluster() : Promise<ClusterMembership> {
    return new Promise((resolve : (membership : ClusterMembership) => void, // tslint:disable-line:promise-must-complete
                        reject : (err : Error) => void) => {
      const host : string = this.address.host;
      const port : number = this.address.port;
      const consulClient : consul.Consul = this.consulRef({
        host,
        port: `${port}`
      });
      if (this.seeds.length > 0) {
        consulClient.agent.join({address: this.seeds[0].toString()}, (err : Error) => {
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
  }

}
