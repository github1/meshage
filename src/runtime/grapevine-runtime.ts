import {
  Cluster,
  ClusterMembership,
  ClusterService,
  ClusterServiceFilter
} from '../core/cluster';
import {Address} from '../core/address-parser';
import {Addresses, prepareAddresses} from './address-provider';
import {Gossiper, ServerAdapter, SocketAdapter} from '@github1/grapevine';
import debug = require('debug');

const log : debug.IDebugger = debug('meshage');

export class GrapevineClusterMembership implements ClusterMembership {
  private readonly gossiper : Gossiper;
  private readonly state : { [key : string] : {} } = {};

  constructor(gossiper : Gossiper) {
    this.gossiper = gossiper;
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
  }

  public services(filter? : ClusterServiceFilter) : Promise<ClusterService[]> {
    let allServices : ClusterService[] = [];
    const includeServices = (services : {}) => {
      if (services) {
        // merge 'local' service state
        const toInclude : ClusterService[] = Object
          .keys(services)
          .map((key : string) : ClusterService => <ClusterService>services[key]);
        toInclude.forEach((service : ClusterService) => {
          if (allServices.filter((existingService : ClusterService) => existingService.id === service.id).length === 0) {
            allServices.push(service);
          }
        });
      }
    };
    this.gossiper.livePeers()
      .forEach((addr : string) => {
        const services : {} = this.gossiper.peerValue(addr, 'services');
        // merge services from live peers
        includeServices(services);
      });
    includeServices(this.state.services);
    if (filter) {
      allServices = filter(allServices);
    }
    return Promise.resolve(allServices);
  }

  public registerService(id : string, stream : string, address : string) : Promise<void> {
    return prepareAddresses(address)
      .then((addresses : Addresses) => {
        this.state.services = this.state.services || {};
        this.state.services[id] = {
          id,
          stream,
          address: addresses.nodeAddress.toString()
        };
        this.updateState();
      });
  }

  public unregisterService(id : string) : Promise<void> {
    this.state.services = this.state.services || {};
    // tslint:disable-next-line:no-dynamic-delete
    delete this.state.services[id];
    this.updateState();
    return Promise.resolve();
  }

  public updateState() {
    Object.keys(this.state)
      .forEach((key : string) => {
        this.gossiper.setLocalState(key, this.state[key]);
      });
  }
}

export class GrapevineCluster implements Cluster {

  private readonly addresses : Promise<Addresses>;

  constructor(address : (string | number), seeds : (string | number)[] = []) {
    this.addresses = prepareAddresses(address, seeds);
  }

  public joinCluster() : Promise<ClusterMembership> {
    return new Promise<ClusterMembership>((resolve : (value : GrapevineClusterMembership) => void) => {
      this.addresses.then((addresses : Addresses) => {
        const host : string = addresses.nodeAddress.host;
        const port : number = addresses.nodeAddress.port;
        const seeds : string[] = addresses.seedAddresses.map((seed : Address) => seed.toString());
        log('Registering to Gossiper with', addresses);
        const gossiper : Gossiper = new Gossiper({
          port, seeds: seeds,
          address: host,
          newServerAdapter: () => {
            return new ServerAdapter({});
          },
          newSocketAdapter: () => {
            return new SocketAdapter({});
          }
        });
        gossiper.start(() => {
          // Ensures that updates from a restarted peer are accepted by the cluster
          // by guaranteeing the initial state version is greater than what was
          // presented in prior (pre-restart) reconciliation attempts.
          log('Gossiper started', addresses.nodeAddress);
          gossiper.my_state.max_version_seen = new Date().getTime();
          const membership : GrapevineClusterMembership = new GrapevineClusterMembership(gossiper);
          resolve(membership);
        });
      });
    });
  }

}
