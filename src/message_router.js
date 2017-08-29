const cluster = require('./cluster');
const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');

class MessageRouterConnection {
    constructor(servicePort, peerCluster, server) {
        this.services = {};
        this.serviceState = {};
        this.servicePort = servicePort;
        this.peerCluster = peerCluster;
        this.server = server;
    }
    stop() {
        this.server.close();
    }
    register(stream, handler) {
        this.services[stream] = handler;
        this.serviceState[stream] = this.servicePort;
        this.peerCluster.setState('services', this.serviceState)
    }
    send(message) {
        const hashring = new cluster.ClusterHashRing(this.peerCluster, (peer) => {
            return peer.services && peer.services[message.stream];
        });
        return hashring.get(message.partitionKey).then((peer) => {
            if(peer.self) {
                if(this.services[message.stream]) {
                    return Promise.resolve(this.services[message.stream](message)).then((res) => {
                        res.peer = peer.id;
                        return res;
                    });
                } else {
                    return Promise.reject(new Error(`No service found for stream '${message.stream}' on '${peer.host}'`));
                }
            } else {
                return new Promise((resolve, reject) => {
                    const peerServicePort = peer.services[message.stream];
                    request({
                        url: `http://${peer.host}:${peerServicePort}/api/${message.stream}/${message.partitionKey}`,
                        method: 'post',
                        body: message,
                        json: true,
                        timeout: 1000
                    }, (err, response, body) => {
                        if(err) {
                            reject(err);
                        } else {
                            resolve(body);
                        }
                    })
                });
            }
        }).catch((err) => {
            if(cluster.ClusterHashRing.ERR_NO_PEERS_FOUND === err.message) {
                throw new Error(`No peers found for stream '${message.stream}'`);
            }
            throw err;
        });
    }
}

module.exports.MessageRouter = class {

    constructor(port, serviceCluster) {
        this.port = port;
        this.serviceCluster = serviceCluster;
    }

    start(callback) {
        this.serviceCluster.joinCluster()
            .then((peerCluster) => {

                const app = express();

                app.use(bodyParser.json());

                let messageRouterConnection;

                app.post('/api/:stream/:id', (req, res) => {
                    const stream = req.params.stream;
                    const partitionKey = req.params.id;
                    const body = req.body;
                    const message = Object.assign(body, {
                        stream,
                        partitionKey
                    });
                    messageRouterConnection.send(message).then((result) => {
                        res.json(result);
                    }).catch((error) => {
                        res.status(500);
                        res.json({ error : error.message });
                    });
                });

                const server = app.listen(this.port, () => {
                    console.log(`listening on ${this.port}`);
                    callback(null, messageRouterConnection = new MessageRouterConnection(this.port, peerCluster, server));
                });
            });
    }

};