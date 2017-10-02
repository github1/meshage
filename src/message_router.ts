import {
  Cluster,
  ClusterMembership,
  ClusterHashRing,
  HostDefinition
} from './cluster';
import * as http from 'http';
import * as express from 'express';
import * as bodyParser from 'body-parser';
import * as request from 'request';
import * as debug from 'debug';

const log : debug.IDebugger = debug('meshage');

export type MessageHandler = (message : Message) => {};

const getParam : (req : express.Request, key : string) => string = (req : express.Request, key : string) : string => {
  const params : {[key:string]:string} = (<{[key:string]:string}> req.params);
  return params[key];
};

export interface Message {
  stream : string;
  partitionKey : string;
}

export class MessageRouterConnection {

  private services : {[key:string]:MessageHandler};
  private serviceState : {[key:string]:string};
  private servicePort : string;
  private peerCluster : ClusterMembership;
  private server : http.Server;

  constructor(servicePort : string, peerCluster : ClusterMembership, server : http.Server) {
    this.services = {};
    this.serviceState = {};
    this.servicePort = servicePort;
    this.peerCluster = peerCluster;
    this.server = server;
  }

  private static PEER_FILTER : (stream : string) => (peer : HostDefinition) => boolean = (stream : string) => {
    return (peer : HostDefinition) => {
      const result : boolean = peer.services && peer.services.hasOwnProperty(stream);
      if(!result) {
        log('filtering peer', peer);
      }
      return result;
    };
  }

  public stop() {
    this.server.close();
  }

  public register(stream : string, handler : MessageHandler) {
    this.services[stream] = handler;
    this.serviceState[stream] = this.servicePort;
    this.peerCluster.setState('services', this.serviceState);
  }

  public broadcast(message : Message) : Promise<{}> {
    const peers : HostDefinition[] = this.peerCluster.all().filter(MessageRouterConnection.PEER_FILTER(message.stream));
    log('broadcasting to peers', peers);
    return Promise.all(peers.map((peer : HostDefinition) => {
      return new Promise((resolve : Function) => {
        this.sendDirect(peer, message).then((value : {}) => {
          resolve(value);
        }).catch((err : Error) => {
          resolve(err);
        });
      });
    }));
  }

  public processLocal(peer : HostDefinition, message : Message) : Promise<{}> {
    const target : HostDefinition = peer === null ? this.peerCluster.getSelf() : peer;
    const id : string = target.id;
    const host : string =  target.host;
    if (this.services[message.stream]) {
      return Promise.resolve(this.services[message.stream](message)).then((res : {[key:string]:string}) => {
        res.peer = id;
        return res;
      });
    } else {
      return Promise.reject(new Error(`No service found for stream '${message.stream}' on '${host}'`));
    }
  }

  public sendDirect(peer : HostDefinition, message : Message) : Promise<{}> {
    if (peer.self) {
      return this.processLocal(peer, message);
    } else {
      return new Promise((resolve : Function, reject : Function) => {
        const peerServicePort = peer.services[message.stream];
        request({
          url: `http://${peer.host}:${peerServicePort}/api/direct/${message.stream}/${message.partitionKey}`,
          method: 'post',
          body: message,
          json: true,
          timeout: 1000
        }, (err : Error, response : {}, body : {}) => {
          if (err) {
            reject(err);
          } else {
            resolve(body);
          }
        });
      });
    }
  }

  public send(message : Message) : Promise<{}> {
    const hashring : ClusterHashRing = new ClusterHashRing(this.peerCluster, MessageRouterConnection.PEER_FILTER(message.stream));
    return hashring.getPeer(message.partitionKey).then((peer : HostDefinition) => {
      return this.sendDirect(peer, message);
    }).catch((err : Error) => {
      if (ClusterHashRing.ERR_NO_PEERS_FOUND === err.message) {
        throw new Error(`No peers found for stream '${message.stream}'`);
      }
      throw err;
    });
  }

}

export class MessageRouter {

  private port : string;
  private serviceCluster : Cluster;

  constructor(port : string, serviceCluster : Cluster) {
    this.port = port;
    this.serviceCluster = serviceCluster;
  }

  public start(callback : (err : Error, conn : MessageRouterConnection) => void) {
    this.serviceCluster.joinCluster()
      .then((peerCluster : ClusterMembership) => {

        const app : express.Application = express();

        app.use(bodyParser.json());

        let messageRouterConnection : MessageRouterConnection;

        const handler : (req : express.Request, res : express.Response) => void = (req : express.Request, res : express.Response) => {
          const stream : string = getParam(req, 'stream');
          const partitionKey : string = getParam(req, 'id');
          const isBroadcast : boolean = req.path.indexOf('/api/broadcast/') === 0;
          const isDirect : boolean = req.path.indexOf('/api/direct/') === 0;
          const body : {} = (<{}> req.body);
          const message : Message = Object.assign(body, {
            stream,
            partitionKey
          });
          if(isBroadcast) {
            log('broadcasting message', message);
            messageRouterConnection.broadcast(message).then((result : {}) => {
              res.json(result);
            }).catch((err : Error) => {
              res.status(500);
              res.json({error: err.message});
            });
          } else if (isDirect) {
            log('processing message', message);
            messageRouterConnection.processLocal(null, message).then((result : {}) => {
              res.json(result);
            }).catch((err : Error) => {
              res.status(500);
              res.json({error: err.message});
            });
          } else {
            log('sending message', message);
            messageRouterConnection.send(message).then((result : {}) => {
              res.json(result);
            }).catch((err : Error) => {
              res.status(500);
              res.json({error: err.message});
            });
          }
        };

        app.post('/api/:stream/:id', handler);

        app.post('/api/direct/:stream/:id', handler);

        app.post('/api/broadcast/:stream/:id', handler);

        const server = app.listen(this.port, () => {
          console.log(`listening on ${this.port}`);
          callback(null, messageRouterConnection = new MessageRouterConnection(this.port, peerCluster, server));
        });
      });
  }

}
