import {
  Address,
  ClusterMembership,
  ClusterServiceEndpoint,
  Message,
  NetworkMessageRouterListener,
  ServiceRouter
} from '../../core';
import debug = require('debug');

import express = require('express');
import bodyParser = require('body-parser');

const log : debug.IDebugger = debug('meshage:http');
const logError : debug.IDebugger = debug('meshage:http:error');

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
    log(`Stopping http listener on ${this.address}`);
    this.server.close();
  }

  public async initWithAddress(address : Address, membership : ClusterMembership,
                               serviceRouter : ServiceRouter) : Promise<ClusterServiceEndpoint> {

    const app : express.Application = express();
    app.disable('x-powered-by');
    app.use(bodyParser.json());

    const requestHandler : (req : express.Request, res : express.Response) => void =
      async (req : express.Request, res : express.Response) => {
        const stream : string = getParam(req, 'stream');
        const partitionKey : string = getParam(req, 'partitionKey');
        const body : {} = <{}>req.body;
        const message : Message = {
          stream,
          partitionKey,
          serviceId: req.get('X-Service-ID'),
          data: body,
          meta: Object.keys(req.headers)
            .reduce((meta : { [key : string] : string }, header : string) => {
              meta[header] = req.header(header);
              return meta;
            }, {})
        };
        const isBroadcast : boolean = /broadcast/.test(req.path);
        log('Handling message', message);
        try {
          res.send((await (isBroadcast ? serviceRouter
            .broadcast(message) : serviceRouter
            .send(message))));
        } catch (err) {
          logError(err);
          res.status(500)
            .json({error: (<Error>err).message});
        }
      };

    app.get('/api/services', async (req : express.Request, res : express.Response) => {
      try {
        res.json(await membership.services());
      } catch (err) {
        logError(err);
        res.status(500)
          .json({error: (<Error>err).message});
      }
    });
    app.all('/api/health', (req : express.Request, res : express.Response) => {
      res.send({status: 'up'});
    });
    app.all('/api/:stream/:partitionKey', requestHandler);
    app.all('/api/broadcast/:stream/:partitionKey', requestHandler);

    return new Promise<ClusterServiceEndpoint>((resolve : (value : ClusterServiceEndpoint) => void) => {
      this.server = app.listen(address.port, address.host, () => {
        log(`Started http service on ${address.host}:${address.port}`);
        resolve({
          endpointType: 'http',
          description: `http://${address.host}:${address.port}`
        });
      });
    });
  }
}
