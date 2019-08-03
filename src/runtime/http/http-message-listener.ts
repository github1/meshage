import {
  NetworkMessageRouterListener,
  ClusterMembership,
  ClusterService,
  ClusterServiceEndpoint,
  ServiceRouter,
  Message,
  Address
} from '../../core';
import debug = require('debug');

import express = require('express');
import bodyParser = require('body-parser');

const log : debug.IDebugger = debug('meshage');
const logError : debug.IDebugger = debug('meshage:error');

const getParam : (req : express.Request, key : string) => string = (req : express.Request, key : string) : string => {
  const params : { [key : string] : string } = (<{ [key : string] : string }>req.params);
  return params[key];
};

export class HttpMessageListener extends NetworkMessageRouterListener {

  private server : { close() : void };

  constructor(address : (string | number)) {
    super(address);
  }

  public stop() {
    this.server.close();
  }

  public initWithAddress(address : Address, membership : ClusterMembership,
                         serviceRouter : ServiceRouter) : Promise<ClusterServiceEndpoint> {

    const app : express.Application = express();
    app.disable('x-powered-by');
    app.use(bodyParser.json());

    const requestHandler : (req : express.Request, res : express.Response) => void =
      (req : express.Request, res : express.Response) => {
        const stream : string = getParam(req, 'stream');
        const partitionKey : string = getParam(req, 'partitionKey');
        const body : {} = <{}>req.body;
        const message : Message = {
          stream,
          partitionKey,
          serviceId: req.get('X-Service-ID'),
          data: body
        };
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
              .json({error: err.message});
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

    return new Promise<ClusterServiceEndpoint>((resolve : (value : ClusterServiceEndpoint) => void) => {
      this.server = app.listen(address.port, () => {
        log(`Started http service on port ${address.port}`);
        resolve({
          endpointType: 'http',
          description: `http://${address.host}:${address.port}`
        });
      });
    });
  }
}
