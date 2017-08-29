const cluster = require('../src/cluster');
const portfinder = require('portfinder');

describe('cluster', () => {

    let memberPorts = [65500, 65501];

    let memberships = [];

    beforeAll(() => {
        return Promise.all(memberPorts.map((port) => {
            const members = memberPorts.map((_port) => {
                return {
                    id: `node-${_port}`,
                    host: 'localhost',
                    self: _port === port,
                    port: _port
                };
            });
            return new cluster.GossiperCluster(port, new cluster.StaticPeerProvider(members)).joinCluster();
        })).then((ms) => {
            memberships = memberships.concat(ms);
            let attempts = 0;
            return new Promise((resolve, reject) => {
                const check = () => {
                    if (attempts > 100) {
                        reject(new Error('peers not joined in time'));
                    } else {
                        if (memberships.map((membership) => membership.peers().length).reduce((a, c) => {
                                return a + c;
                            }, 0) < (memberPorts.length * memberPorts.length)) {
                            setTimeout(() => {
                                attempts++;
                                check();
                            }, 100);
                        } else {
                            resolve();
                        }
                    }
                };
                check();
            });
        });
    });

    afterAll(() => {
        memberships.forEach(membership => membership.leave());
    });

    describe('GossiperCluster', () => {
        it('joins a cluster', () => {
            expect(memberships.length).toEqual(2);
        });
        it('connects peers', () => {
            expect(memberships[0].peers()[0].id).toEqual(`node-${memberPorts[0]}`);
            expect(memberships[0].peers()[1].id).toEqual(`node-${memberPorts[1]}`);
            expect(memberships[1].peers()[0].id).toEqual(`node-${memberPorts[1]}`);
            expect(memberships[1].peers()[1].id).toEqual(`node-${memberPorts[0]}`);
        });
    });

    describe('ClusterHashRing', () => {
        it('consistently determines a peer based on the supplied key', () => {
            return new cluster.ClusterHashRing(memberships[0]).get('foo').then((peer) => {
                expect(peer.id).toEqual('node-65501');
            });
        });
        it('throws an error if no peers found', () => {
            return new cluster.ClusterHashRing(memberships[0], () => false).get('foo').then((peer) => {
                expect(true).toEqual(false);
            }).catch((err) => {
                expect(err.message).toEqual(cluster.ClusterHashRing.ERR_NO_PEERS_FOUND);
            });
        });
    });

});
