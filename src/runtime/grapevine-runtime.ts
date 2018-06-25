import {
  Cluster,
  ClusterMembership,
  ClusterService,
  ClusterServiceFilter
} from '../core/cluster';
import {
  Gossiper,
  ServerAdapter,
  SocketAdapter
} from 'grapevine';
import debug = require('debug');

const log : debug.IDebugger = debug('meshage');

export class GrapevineClusterMembership implements ClusterMembership {
  private gossiper : Gossiper;
  private state : {[key:string]:{}} = {};

  constructor(gossiper : Gossiper) {
    this.gossiper = gossiper;
  }

  public services(filter? : ClusterServiceFilter) : Promise<ClusterService[]> {
    let allServices : ClusterService[] = [];
    const includeServices = (services : {}) => {
      if (services) {
        const toInclude : ClusterService[] = Object
          .keys(services)
          .map((key : string) : ClusterService => <ClusterService> services[key]);
        toInclude.forEach((service : ClusterService) => {
          if (allServices.filter((existingService : ClusterService) => existingService.id === service.id).length === 0) {
            allServices.push(service);
          }
        });
      }
    };
    this.gossiper.livePeers().forEach((addr : string) => {
      const services : {} = this.gossiper.peerValue(addr, 'services');
      includeServices(services);
    });
    includeServices(this.state.services);
    if (filter) {
      allServices = filter(allServices);
    }
    return Promise.resolve(allServices);
  }

  public registerService(id : string, stream : string, address : string) : Promise<void> {
    this.state.services = this.state.services || {};
    this.state.services[id] = {id, stream, address};
    this.updateState();
    return Promise.resolve();
  }

  public unregisterService(id : string) : Promise<void> {
    delete this.state.services[id];
    this.updateState();
    return Promise.resolve();
  }

  public updateState() {
    Object.keys(this.state).forEach((key : string) => {
      this.gossiper.setLocalState(key, this.state[key]);
    });
  }
}

const prepareAddress = (address : string) : string => address.indexOf(':') > -1 ? address : `127.0.0.1:${address}`;

export class GrapevineCluster implements Cluster {

  private address : string;
  private seeds : string[];

  constructor(address : object, seeds : string[] = []) {
    this.address = prepareAddress(`${address}`);
    this.seeds = seeds.map(prepareAddress);
  }

  public joinCluster() : Promise<ClusterMembership> {
    const host : string = this.address.split(':')[0];
    const port : number = parseInt(this.address.split(':')[1], 10);
    return new Promise<ClusterMembership>((resolve : (value : GrapevineClusterMembership) => void) => {
      const gossiper : Gossiper = new Gossiper({
        port, seeds: this.seeds,
        address: host,
        newServerAdapter: () => {
          return new ServerAdapter({});
        },
        newSocketAdapter: () => {
          return new SocketAdapter({});
        }
      });
      gossiper.on('update', (name : string, key : string, value : {}) => {
        if (key !== '__heartbeat__') {
          log('update', name, key, value);
        }
      });
      gossiper.on('new_peer', (name : string) => {
        log('new_peer', name);
      });
      gossiper.on('peer_alive', (name : string) => {
        log('peer_alive', name);
      });
      gossiper.on('peer_failed', (name : string) => {
        log('peer_failed', name);
      });
      gossiper.start(() => {
        const membership : GrapevineClusterMembership = new GrapevineClusterMembership(gossiper);
        resolve(membership);
      });
    });
  }

}
