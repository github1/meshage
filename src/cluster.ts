///<reference path="./typings/index.d.ts" />

import * as debug from 'debug';
import * as os from 'os';
import * as request from 'request';
import { Gossiper } from 'grapevine';
import * as HashRing from 'hashring';

const log : debug.IDebugger = debug('meshage');

export interface ClusterMembership {
  leave();
  peers() : HostDefinition[];
  all() : HostDefinition[];
  setState(key : string, value : {});
}

export interface Cluster {
  joinCluster() : Promise<ClusterMembership>;
}

class GossiperClusterMembership implements ClusterMembership {

  private gossiper : Gossiper;
  private self : HostDefinition;
  private state : {[key:string]:{}} = {};

  constructor(gossiper : Gossiper, self : HostDefinition) {
    this.gossiper = gossiper;
    this.self = self;
  }

  public leave() {
    this.gossiper.stop(() => {
      // do nothing
    });
  }

  public peers() : HostDefinition[] {
    const peers = this.gossiper.livePeers().map((addr : string) => {
      const peerId : string = <string> this.gossiper.peerValue(addr, 'id');
      const peerHost : string = <string> this.gossiper.peerValue(addr, 'host');
      const peerServices : {} = this.gossiper.peerValue(addr, 'services');
      log('peer', peerId, peerHost, peerServices);
      return {
        id: peerId,
        self: peerId === this.self.id,
        host: peerHost,
        services: peerServices || {}
      };
    }).filter((peer : HostDefinition) => peer.id);
    peers.unshift(Object.assign({}, {
      id: this.self.id,
      self: true,
      host: this.self.host,
      services: {}
    }, this.state));
    return peers;
  }

  public all() : HostDefinition[] {
    return this.peers();
  }

  public setState(key : string, value : {}) {
    this.state[key] = value;
    this.updateState();
  }

  public updateState() {
    Object.keys(this.state).forEach((key : string) => {
      this.gossiper.setLocalState(key, this.state[key]);
    });
  }
}

export class GossiperCluster implements Cluster {

  private port : string;
  private peerProvider : PeerProvider;

  constructor(port : string, peerProvider : PeerProvider) {
    this.port = port;
    this.peerProvider = peerProvider;
  }

  public joinCluster() : Promise<ClusterMembership> {
    return new Promise((resolve : Function) => {
      this.peerProvider.provide().then((hosts : HostDefinition[]) => {
        const self : HostDefinition = hosts.filter((host : HostDefinition) => host.self)[0];
        const seeds : HostDefinition[] = hosts.filter((host : HostDefinition) => {
          if (self.host.indexOf('_1') > -1) { // TODO remove this hackery
            return false;
          }
          return !host.self;
        });
        const isLoopback = /^(127\.0\.0\.1|localhost)$/.test(self.host);
        /*-
        const gossiper : Gossiper = new Gossiper(self.port || this.port, seeds.map((seed : HostDefinition) => {
          return `${seed.host}:${seed.port || this.port}`;
        }), isLoopback ? self.host : [][1]);
        */
        const gossiper : Gossiper = new Gossiper({
          port: parseInt(self.port, 10) || this.port, seeds: seeds.map((seed : HostDefinition) => {
            return `${seed.host}:${seed.port || this.port}`;
          }),
          address: isLoopback ? self.host : [][1]
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
          const membership : GossiperClusterMembership = new GossiperClusterMembership(gossiper, self);
          membership.setState('id', self.id);
          membership.setState('host', self.host);
          resolve(membership);
        });
      });
    });
  }

}

export interface HostDefinition {
  id : string;
  self : boolean;
  host: string;
  port?: string;
  services?: {[key:string]:string};
}

export interface PeerProvider {
  provide() : Promise<HostDefinition[]>;
}

export class StaticPeerProvider implements PeerProvider {
  private hosts : HostDefinition[];

  constructor(hosts : HostDefinition[]) {
    this.hosts = hosts;
  }

  public provide() : Promise<HostDefinition[]> {
    return Promise.resolve(this.hosts);
  }
}

export type DockerContainer = {Id:string,Names:string[]};

export class DockerPeerProvider implements PeerProvider {

  private url : string;
  private selector : (container : DockerContainer) => boolean;

  constructor(url : string, selector : (container : DockerContainer) => boolean) {
    this.url = url;
    this.selector = selector;
  }

  public provide() : Promise<HostDefinition[]> {
    return new Promise((resolve : Function, reject : Function) => {
      request({
        url: this.url,
        method: 'get',
        json: true
      }, (err : Error, response : {}, body : DockerContainer[]) => {
        if (err) {
          reject(err);
        } else {
          const self = body.filter((container : DockerContainer) => {
            return container.Id.indexOf(os.hostname()) > -1;
          })[0];
          resolve(body
            .filter((container : DockerContainer) => {
              return this.selector ? this.selector(container) : false;
            })
            .map((container : DockerContainer) => {
              return {
                id: container.Names.join(''),
                self: self.Id === container.Id,
                host: container.Names[0].substring(1)
              };
            }));
        }
      });
    });
  }

}

export class ClusterHashRing {

  public static ERR_NO_PEERS_FOUND : string = 'no_peers_found';
  private cluster : ClusterMembership;
  private filter : (host : HostDefinition) => boolean;

  constructor(cluster : ClusterMembership, filter : (host : HostDefinition) => boolean) {
    this.cluster = cluster;
    this.filter = filter || (()=>true);
  }

  public getPeer(key : string) : Promise<HostDefinition> {
    return new Promise((resolve : Function, reject : Function) => {
      const mapping : {[key:string]:HostDefinition} = {};
      const peers : string[] = this.cluster.all().map((peer : HostDefinition) => {
        mapping[peer.id] = peer;
        return peer.id;
      }).filter((peer : string) => {
        return this.filter(mapping[peer]);
      });
      const ch : HashRing = new HashRing(peers);
      const selected : HostDefinition = mapping[ch.get(key)];
      if (selected) {
        resolve(selected);
      } else {
        reject(new Error(ClusterHashRing.ERR_NO_PEERS_FOUND));
      }
    });
  }

}
