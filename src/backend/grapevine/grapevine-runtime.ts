import {
  AbstractServiceInvoker,
  Address,
  Cluster,
  ClusterMembership,
  ClusterService,
  ClusterServiceEndpoint,
  ClusterServiceFilter,
  Message,
  MessageRouterConfigurator,
  MessageRouterConfiguration,
  MessageRouterListener,
  ServiceRouter,
  Addresses,
  prepareAddresses
} from '../../core';
import {
  Gossiper,
  GossiperOptions,
  GossipMessage,
  PeerState
} from '@github1/grapevine';
import {v4} from 'uuid';
import debug = require('debug');

const log : debug.IDebugger = debug('meshage:grapevine');

interface ClusterServices {
  [key : string] : ClusterService;
}

export class GrapevineClusterMembership implements ClusterMembership {
  private readonly gossiper : Gossiper;
  private readonly state : { [key : string] : {} } = {};

  constructor(gossiper : Gossiper) {
    this.gossiper = gossiper;
    gossiper.on('update', (name : string, key : string, value : {}) => {
      if (key !== '__heartbeat__') {
        log('update', name, key, JSON.stringify(value, undefined, 2));
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
    const includeServices = (services : ClusterServices) => {
      if (services) {
        // merge 'local' service state
        const toInclude : ClusterService[] = Object
          .keys(services)
          .map((key : string) : ClusterService => services[key]);
        toInclude.forEach((service : ClusterService) => {
          if (allServices.filter((existingService : ClusterService) => existingService.id === service.id).length === 0) {
            allServices.push(service);
          }
        });
      }
    };
    this.gossiper.livePeers()
      .forEach((livePeer : PeerState) => {
        const services : ClusterServices = this.gossiper.peerValue(livePeer.name, 'services');
        // merge services from live peers
        includeServices(services);
      });
    includeServices(this.state.services);
    if (filter) {
      allServices = filter(allServices);
    }
    return Promise.resolve(allServices);
  }

  public registerService(registration : ClusterService) : Promise<void> {
    this.state.services = this.state.services || {};
    this.state.services[registration.id] = JSON.parse(JSON.stringify(registration));
    this.updateState();
    return Promise.resolve();
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

interface GrapevinePromiseDeferred {
  resolve(val? : {}): void;
  reject(error? : Error): void;
}

interface GrapevineMessage extends GossipMessage {
  gvmid: string;
}

class GrapevineServiceInvoker extends AbstractServiceInvoker implements MessageRouterListener {
  private readonly promises : { [key : string] : GrapevinePromiseDeferred } = {};

  constructor(private readonly gossiper : Gossiper) {
    super('grapevine');
  }

  public init(membership : ClusterMembership, serviceRouter : ServiceRouter) : Promise<ClusterServiceEndpoint> {
    this.gossiper.on('custom_message', (msg : GrapevineMessage) => {
      const gvmid = msg.gvmid;
      const deferred : GrapevinePromiseDeferred = this.promises[gvmid];
      if (deferred) {
        // resolve response message
        // tslint:disable-next-line
        delete this.promises[gvmid];
        deferred.resolve(<Message>msg.message);
      } else {
        serviceRouter
          .send(<Message>msg.message)
          .then((response: {}) => {
            return this.gossiper
              .sendCustomMessage(msg.from, response, {gvmid: gvmid});
          })
          .catch((err: Error) => {
            log(err);
          });
      }
    });
    return Promise.resolve({
      endpointType: 'grapevine',
      description: this.gossiper.peerName
    });
  }

  protected doSend(
    address : Address,
    message : Message,
    service : ClusterService,
    endpoint : ClusterServiceEndpoint) : Promise<{}> {
    const targetSeed = endpoint.description;
    const gvmid = v4();
    // tslint:disable-next-line
    const promise = new Promise((resolve: (res: any) => void, reject: (err: Error) => void) => {
      this.promises[gvmid] = {resolve, reject};
    });
    this.gossiper
      .sendCustomMessage(targetSeed, message, { gvmid })
      .catch((err: Error) => {
        const deferred : GrapevinePromiseDeferred = this.promises[gvmid];
        if (deferred) {
          // tslint:disable-next-line
          delete this.promises[gvmid];
          deferred.reject(err);
        }
      });
    return promise;
  }
}

export class GrapevineCluster implements Cluster, MessageRouterConfigurator {

  private readonly addresses : Promise<Addresses>;
  private readonly gossiperOptions : GossiperOptions;
  private gossiper : Gossiper;
  private messaging : GrapevineServiceInvoker;

  constructor(options: GossiperOptions)
  constructor(options: number | GossiperOptions) {
    this.gossiperOptions = typeof options === 'number' ? {port: options} : options;
    let address = `${options}`;
    let seeds: string[] = [];
    if (typeof options !== 'number') {
      address = options.address ? `${options.address}:${options.port}` : `${options.port}`;
      seeds = options.seeds;
    }
    this.addresses = prepareAddresses(address, seeds);
  }

  public joinCluster() : Promise<ClusterMembership> {
    return new Promise<ClusterMembership>((resolve : (value : GrapevineClusterMembership) => void) => {
      this.addresses.then((addresses : Addresses) => {
        const host : string = addresses.nodeAddress.host;
        const port : number = addresses.nodeAddress.port;
        const seeds : string[] = addresses.seedAddresses.map((seed : Address) => seed.toString());
        log('Registering to Gossiper with', addresses);
        this.gossiperOptions.address = host;
        this.gossiperOptions.port = port;
        this.gossiperOptions.seeds = seeds;
        // Set initialVersion to current time to ensures that updates from a restarted peer are accepted by the cluster
        // by guaranteeing the initial state version is greater than what was
        // presented in prior (pre-restart) reconciliation attempts.
        this.gossiperOptions.initialVersion = new Date().getTime();
        this.gossiper = new Gossiper(this.gossiperOptions);
        this.messaging = new GrapevineServiceInvoker(this.gossiper);
        this.gossiper.start(() => {
          log('Gossiper started', addresses.nodeAddress);
          const membership : GrapevineClusterMembership = new GrapevineClusterMembership(this.gossiper);
          resolve(membership);
        });
      });
    });
  }

  public stop() {
    this.gossiper.stop(() => {
      // nothing
    });
  }

  public configure(config : MessageRouterConfiguration) {
    config(this.messaging, this.messaging);
  }

}
