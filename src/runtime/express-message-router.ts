import {
  ConnectedMessageRouter,
  DefaultConnectedMessageRouter,
  MessageRouter,
  MessageRouterStartHandler
} from '..';
import {ServiceRouter} from '../core/service-router';
import {Message, MessageHandler} from '../core/message';
import {Cluster, ClusterMembership, ClusterService} from '../core/cluster';
import {httpServiceInvoker} from './http-service-invoker';
import {Addresses, prepareAddresses} from './address-provider';
import debug = require('debug');

import express = require('express');
import bodyParser = require('body-parser');

const log : debug.IDebugger = debug('meshage');
const logError : debug.IDebugger = debug('meshage:error');

type HandlerRegistration = { stream : string; messageHandler : MessageHandler };

const getParam : (req : express.Request, key : string) => string = (req : express.Request, key : string) : string => {
  const params : { [key : string] : string } = (<{ [key : string] : string }>req.params);
  return params[key];
};

const noop : () => void = (() => {
  // noop
});

export class ExpressMessageRouter implements MessageRouter {

  private readonly handlers : HandlerRegistration[] = [];
  private readonly addresses : Promise<Addresses>;
  private server : { close() : void };

  constructor(private readonly cluster : Cluster,
              address : (string | number)) {
    this.addresses = prepareAddresses(address);
  }

  public register(stream : string, messageHandler : MessageHandler) : MessageRouter {
    this.handlers.push({stream, messageHandler});
    return this;
  }

  public start(handler : MessageRouterStartHandler = noop) : void {
    this.addresses.then((addresses : Addresses) => {
      this.cluster.joinCluster()
        .then((membership : ClusterMembership) => {

          const host : string = addresses.nodeAddress.host;
          const port : number = addresses.nodeAddress.port;

          const serviceRouter : ServiceRouter = new ServiceRouter(membership, httpServiceInvoker());

          const app : express.Application = express();
          app.use(bodyParser.json());

          const requestHandler : (req : express.Request, res : express.Response) => void =
            (req : express.Request, res : express.Response) => {
              const stream : string = getParam(req, 'stream');
              const partitionKey : string = getParam(req, 'partitionKey');
              const body : {} = <{}>req.body;
              const message : Message = {stream, partitionKey, ...body};
              if (req.get('X-Service-ID')) {
                message.serviceId = req.get('X-Service-ID');
              }
              const isBroadcast : boolean = /broadcast/.test(req.path);

              log('Handling message', message);

              const serviceRouterCall : Promise<{}> = isBroadcast ? serviceRouter
                .broadcast(message) : serviceRouter
                .send(message);

              serviceRouterCall.then((response : {}) => {
                res.send(response);
              })
                .catch((err : Error) => {
                  logError(err);
                  res.status(500)
                    .json({ error: err.message });
                });
            };

          app.get('/api/services', (req : express.Request, res : express.Response) => {
            membership.services()
              .then((services : ClusterService[]) => {
                res.json(services);
              })
              .catch((err : Error) => {
                logError(err);
                res.status(500)
                  .json({error: err.message});
              });
          });
          app.all('/api/health', (req : express.Request, res : express.Response) => {
            res.send({status: 'up'});
          });
          app.all('/api/:stream/:partitionKey', requestHandler);
          app.all('/api/broadcast/:stream/:partitionKey', requestHandler);

          this.server = app.listen(port,() => {
            log(`Started http service on port ${port}`);
            const connectedMessageRouter : ConnectedMessageRouter =
              new DefaultConnectedMessageRouter(`${host}:${port}`, serviceRouter);
            Promise.all(this.handlers.map((handlerRegistration : HandlerRegistration) => {
              return connectedMessageRouter.register(handlerRegistration.stream, handlerRegistration.messageHandler);
            }))
              .then(() => {
                handler(undefined, connectedMessageRouter);
              })
              .catch((err : Error) => {
                handler(err);
              });
          });
        });
    });
  }

  public stop() {
    this.server.close();
  }
}
