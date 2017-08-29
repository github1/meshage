const debug = require('debug')('meshage');
const os = require('os');
const request = require('request');
const Gossiper = require('gossiper').Gossiper;
const hashring = require('hashring');

module.exports.GossiperCluster = class {

    constructor(port, seedProvider) {
        this.port = port;
        this.seedProvider = seedProvider;
    }

    joinCluster() {
        return new Promise((resolve) => {
            this.seedProvider.provide().then((hosts) => {
                const self = hosts.filter((host) => host.self)[0];
                const seeds = hosts.filter((host) => {
                    if (self.host.indexOf('_1') > -1) {
                        return false;
                    }
                    return !host.self;
                });
                const isLoopback = /^(127\.0\.0\.1|localhost)$/.test(self.host);
                const gossiper = new Gossiper(self.port || this.port, seeds.map((seed) => {
                    return `${seed.host}:${seed.port || this.port}`;
                }), isLoopback ? self.host : [][1]);
                gossiper.on('update', function (name, key, value) {
                    if (key !== '__heartbeat__') {
                        debug('update', name, key, value);
                    }
                });
                gossiper.on('new_peer', function (name) {
                    debug('new_peer', name);
                });
                gossiper.on('peer_alive', function (name) {
                    debug('peer_alive', name);
                });
                gossiper.on('peer_failed', function (name) {
                    debug('peer_failed', name);
                });
                gossiper.start(() => {
                    gossiper.setLocalState('id', self.id);
                    gossiper.setLocalState('host', self.host);
                    resolve({
                        leave() {
                            gossiper.stop();
                        },
                        peers() {
                            return gossiper.livePeers().map((addr) => {
                                const peerId = gossiper.peerValue(addr, 'id');
                                const peerServices = gossiper.peerValue(addr, 'services');
                                const peerHost = gossiper.peerValue(addr, 'host');
                                return {
                                    id: peerId,
                                    self: peerId === self.id,
                                    host: peerHost,
                                    services: peerServices || {}
                                }
                            }).filter((peer) => peer.id);
                        },
                        all() {
                            return this.peers();
                        },
                        setState(key, value) {
                            gossiper.setLocalState(key, value);
                        }
                    });
                });
            });
        });
    }

};

module.exports.StaticPeerProvider = class {
    constructor(hosts) {
        this.hosts = hosts;
    }

    provide() {
        return Promise.resolve(this.hosts);
    }
};

module.exports.DockerPeerProvider = class {

    constructor(url, selector) {
        this.url = url;
        this.selector = selector;
    }

    provide() {
        return new Promise((resolve, reject) => {
            request({
                url: this.url,
                method: 'get',
                json: true
            }, (err, response, body) => {
                if (err) {
                    reject(err);
                } else {
                    const self = body.filter((container) => {
                        return container.Id.indexOf(os.hostname()) > -1;
                    })[0];
                    resolve(body
                        .filter((container) => {
                            return this.selector ? this.selector(container) : false;
                        })
                        .map((container) => {
                            return {
                                id: container.Names.join(''),
                                self: self.Id === container.Id,
                                host: container.Names[0].substring(1)
                            }
                        }));
                }
            });
        });
    }

};

module.exports.ClusterHashRing = class ClusterHashRing {

    static get ERR_NO_PEERS_FOUND() {
        return 'no_peers_found';
    }

    constructor(cluster, filter) {
        this.cluster = cluster;
        this.filter = filter || (()=>true);
    }

    get(key) {
        return new Promise((resolve, reject) => {
            const mapping = {};
            const peers = this.cluster.all().map((peer) => {
                mapping[peer.id] = peer;
                return peer.id;
            }).filter((peer) => {
                return this.filter(mapping[peer]);
            });
            const ch = new hashring(peers);
            const selected = mapping[ch.get(key)];
            if (selected) {
                resolve(selected);
            } else {
                reject(new Error(ClusterHashRing.ERR_NO_PEERS_FOUND));
            }
        });
    }

};

