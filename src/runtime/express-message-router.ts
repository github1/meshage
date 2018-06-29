import { MessageRouter, MessageRouterStartHandler } from '../core/message-router';
import { ServiceRouter } from '../core/service-router';
import { MessageHandler, Message } from '../core/message';
import { Cluster, ClusterMembership } from '../core/cluster';
import { httpServiceInvoker } from '../core/http-service-invoker';
import { parseAddress, Address } from '../core/address-parser';
import debug = require('debug');

import express = require('express');
import bodyParser = require('body-parser');

const log : debug.IDebugger = debug('meshage');

type HandlerRegistration = { stream : string, messageHandler : MessageHandler };

const getParam : (req : express.Request, key : string) => string = (req : express.Request, key : string) : string => {
  const params : {[key:string]:string} = (<{[key:string]:string}> req.params);
  return params[key];
};

const noop : () => void = (() => {
  // noop
});

export class ExpressMessageRouter implements MessageRouter {

  private handlers : HandlerRegistration[] = [];
  private host : string;
  private port : number;
  private server : { close() : void };

  constructor(private cluster : Cluster,
              address : (string | number)) {
    const addr : Address = parseAddress(address);
    this.host = addr.host;
    this.port = addr.port;
  }

  public register(stream : string, messageHandler : MessageHandler) : MessageRouter {
    this.handlers.push({stream, messageHandler});
    return this;
  }

  public start(handler : MessageRouterStartHandler = noop) : void {
    this.cluster.joinCluster()
      .then((membership : ClusterMembership) => {

        const serviceRouter : ServiceRouter = new ServiceRouter(membership, httpServiceInvoker());

        const app : express.Application = express();
        app.use(bodyParser.json());

        const requestHandler : (req : express.Request, res : express.Response) => void =
          (req : express.Request, res : express.Response) => {
            const stream : string = getParam(req, 'stream');
            const partitionKey : string = getParam(req, 'partitionKey');
            const body : {} = <{}> req.body;
            const message : Message = {stream, partitionKey, ...body};
            if (req.get('X-Service-ID')) {
              message.serviceId = req.get('X-Service-ID');
            }
            const isBroadcast : boolean = /broadcast/.test(req.path);

            const serviceRouterCall : Promise<{}> = isBroadcast ? serviceRouter
              .broadcast(message) : serviceRouter
              .send(message);

            serviceRouterCall.then((response : {}) => {
                res.send(response);
              })
              .catch((err : Error) => {
                console.log(err);
                res.sendStatus(500);
              });
          };

        app.all('/api/health', (req : express.Request, res : express.Response) => {
          res.send({status: 'up'});
        });
        app.all('/api/:stream/:partitionKey', requestHandler);
        app.all('/api/broadcast/:stream/:partitionKey', requestHandler);

        this.server = app.listen(this.port, () => {
          log(`Started http service on port ${this.port}`);
          Promise.all(this.handlers.map((handlerRegistration : HandlerRegistration) => {
              return serviceRouter.register(handlerRegistration.stream, `${this.host}:${this.port}`, handlerRegistration.messageHandler);
            }))
            .then(() => {
              handler(null, serviceRouter);
            })
            .catch((err : Error) => {
              handler(err);
            });
        });
      });
  }

  public stop() {
    this.server.close();
  }
}
