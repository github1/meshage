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
      return peer.services && peer.services.hasOwnProperty(stream);
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

  public sendDirect(peer : HostDefinition, message : Message) : Promise<{}> {
    if (peer.self) {
      if (this.services[message.stream]) {
        return Promise.resolve(this.services[message.stream](message)).then((res : {[key:string]:string}) => {
          res.peer = peer.id;
          return res;
        });
      } else {
        return Promise.reject(new Error(`No service found for stream '${message.stream}' on '${peer.host}'`));
      }
    } else {
      return new Promise((resolve : Function, reject : Function) => {
        const peerServicePort = peer.services[message.stream];
        request({
          url: `http://${peer.host}:${peerServicePort}/api/${message.stream}/${message.partitionKey}`,
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

        app.post('/api/:stream/:id', (req : express.Request, res : express.Response) => {
          const stream : string = getParam(req, 'stream');
          const partitionKey : string = getParam(req, 'id');
          const body : {} = (<{}> req.body);
          const message : Message = Object.assign(body, {
            stream,
            partitionKey
          });
          messageRouterConnection.send(message).then((result : {}) => {
            res.json(result);
          }).catch((err : Error) => {
            res.status(500);
            res.json({error: err.message});
          });
        });

        const server = app.listen(this.port, () => {
          console.log(`listening on ${this.port}`);
          callback(null, messageRouterConnection = new MessageRouterConnection(this.port, peerCluster, server));
        });
      });
  }

}
