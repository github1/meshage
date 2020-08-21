import {
  MeshBackend,
  MeshBackendBase,
  MeshBackendProvider,
  MeshBackendProvision,
  MeshVoidResponse,
  SubjectMessage,
  SubjectMessageEnvelope,
  SubjectMessageHeader,
  SubjectMessageOptions,
  toMeshBackendProvision
} from '../../';
import * as express from 'express';
import * as bodyParser from 'body-parser';
import * as debug from 'debug';
import * as httplib from 'http';
import * as urllib from 'url';
import * as normalizeUrl from 'normalize-url';

const log : debug.Debugger = debug('meshage')
  .extend('http');

interface PreparedHttpMessage {
  message : SubjectMessage;
  headerData : SubjectMessageHeader;
}

class HttpMeshBackend extends MeshBackendBase {

  private app : express.Express;
  private server : httplib.Server;

  constructor(private readonly meshPrivateInternal : MeshBackend, private readonly port : number) {
    super();
    // tslint:disable-next-line:no-unsafe-any
    this.handlers = this.meshPrivateInternal['handlers'];
  }

  private static processParameters(reqParams : { [key : string] : string } = {}, reqBody : {}) : { [key : string] : string } {
    return Object.keys(reqParams)
      .reduce((params : { [key : string] : string }, key : string) => {
        params[key] = reqParams[key].replace(/{([^}]+)}/g, (m : string, token : string) => {
          // tslint:disable-next-line:no-parameter-reassignment
          token = token.replace(/^body\./, '');
          // tslint:disable-next-line:no-unsafe-any
          return reqBody[token] || token;
        });
        return params;
      }, {});
  }

  private static prepareHttpMessage<T>(req : express.Request) : PreparedHttpMessage {
    // tslint:disable-next-line:no-any
    let reqUrl : string;
    if (process.env.PUBLIC_URL) {
      reqUrl = normalizeUrl([process.env.PUBLIC_URL, req.originalUrl].join('/'));
    } else {
      reqUrl = urllib.format({
        protocol: req.protocol,
        host: req.headers.host,
        pathname: req.originalUrl
      });
      if (req.originalUrl.search(/\?/) >= 0) {
        reqUrl = reqUrl.replace(/%3F/g, '?');
      }
    }
    // tslint:disable-next-line:no-unsafe-any
    const params : { [key : string] : string } = this.processParameters(req.params, req.body);
    // tslint:disable-next-line:no-unsafe-any no-any
    const query : { [key : string] : string } = this.processParameters(req.query as any, req.body);
    // tslint:disable-next-line:no-unsafe-any
    const messageName : string = query.messageName ? `${query.messageName}` : req.body.name;
    return {
      message: {...req.body},
      headerData: {
        uid: '', // replaced later,
        subject: params.subject,
        partitionKey: params.partitionKey || query.partitionKey,
        name: messageName,
        http: {
          headers: req.headers,
          url: req.url,
          publicUrl: reqUrl,
          params,
          query
        }
      }
    };
  }

  // tslint:disable-next-line:no-any
  private static prepareHttpResponse(result : any, res : express.Response) {
    let status = 200;
    const resultToSend = result || {};
    let body = resultToSend;
    // tslint:disable-next-line:no-unsafe-any
    if (resultToSend.http) {
      // tslint:disable-next-line:no-unsafe-any
      if (resultToSend.http.status) {
        // tslint:disable-next-line:no-unsafe-any
        status = resultToSend.http.status;
      }
      // tslint:disable-next-line:no-unsafe-any
      if (resultToSend.http.headers) {
        // tslint:disable-next-line:no-unsafe-any
        res.set(resultToSend.http.headers);
      }
      // tslint:disable-next-line:no-unsafe-any
      if (resultToSend.http.body) {
        // tslint:disable-next-line:no-unsafe-any
        body = resultToSend.http.body;
      }
    }
    if (result instanceof MeshVoidResponse) {
      status = 404;
    }
    log.extend('prepareHttpResponse')('Sending %o', body);
    // tslint:disable-next-line:no-unsafe-any
    delete resultToSend.http;
    res.status(status)
      .send(body);
  }

  public get subscriptionIds() : string[] {
    return this.meshPrivateInternal.subscriptionIds;
  }

  public async shutdown() : Promise<void> {
    try {
      await this.meshPrivateInternal.shutdown();
    } catch (err) {
      // ignore
    }
    if (this.server) {
      try {
        // tslint:disable-next-line:typedef
        await new Promise((resolve, reject) => {
          this.server.close((err : Error) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      } catch (err) {
        log(`Failed to close server on port ${this.port}`);
      }
    }
  }

  public unregister(subject : string) : Promise<void> {
    return this.meshPrivateInternal.unregister(subject);
  }

  protected async doRegistrations() : Promise<void> {
    if (!this.app) {
      this.app = express();
      this.app.use(bodyParser.json());
      this.app.use(bodyParser.urlencoded({extended: true}));
      if (process.env.JEST_WORKER_ID) {
        this.app.use((req : express.Request, res : express.Response, next : express.NextFunction) => {
          res.set('Connection', 'close');
          next();
        });
      }
      this.app.post('/api/broadcast/:subject',
        async (req : express.Request, res : express.Response) => {
          try {
            const httpMessage : PreparedHttpMessage = HttpMeshBackend.prepareHttpMessage(req);
            if (!httpMessage.headerData.name) {
              res.status(400)
                .send({error: 'Missing message name'});
            } else {
              const result = await this.send(httpMessage.headerData.subject,
                undefined,
                httpMessage.message,
                {
                  wait: httpMessage.headerData.http.query.wait === 'true' || httpMessage.headerData.http.query.wait === undefined,
                  timeout: httpMessage.headerData.http.query.timeout === undefined ? undefined : parseInt(`${httpMessage.headerData.http.query.timeout}`, 10),
                  additionalHeaderData: httpMessage.headerData
                }, true);
              HttpMeshBackend.prepareHttpResponse(result, res);
            }
          } catch (err) {
            res.status(500)
              .send({error: (err as Error).message});
          }
        });
      this.app.post('/api/:subject/:partitionKey?',
        async (req : express.Request, res : express.Response) => {
          try {
            const httpMessage : PreparedHttpMessage = HttpMeshBackend.prepareHttpMessage(req);
            if (!httpMessage.headerData.name) {
              res.status(400)
                .send({error: 'Missing message name'});
            } else {
              const result = await this.send(
                httpMessage.headerData.subject,
                httpMessage.headerData.partitionKey,
                httpMessage.message,
                {
                  wait: httpMessage.headerData.http.query.wait === 'true' || httpMessage.headerData.http.query.wait === undefined,
                  timeout: httpMessage.headerData.http.query.timeout === undefined ? undefined : parseInt(`${httpMessage.headerData.http.query.timeout}`, 10),
                  keepSignals: true,
                  additionalHeaderData: httpMessage.headerData
                },
                false);
              HttpMeshBackend.prepareHttpResponse(result, res);
            }
          } catch (err) {
            res.status(500)
              .send({error: (err as Error).message});
          }
        });
      // tslint:disable-next-line:typedef
      await new Promise((resolve, reject) => {
        try {
          if (this.server) {
            resolve();
          } else {
            this.server = this.app.listen(this.port, () => {
              log(`Started http listener on ${this.port}`);
              resolve();
            });
          }
        } catch (err) {
          reject(err);
        }
      });
    }
    // tslint:disable-next-line:no-unsafe-any
    await this.meshPrivateInternal['doRegistrations']();
  }

  protected doSend<T>(address : string,
                      envelope : SubjectMessageEnvelope,
                      options : SubjectMessageOptions,
                      broadcast : boolean) : Promise<T> {
    // tslint:disable-next-line:no-unsafe-any
    return this.meshPrivateInternal['doSend'](address, envelope, options, broadcast);
  }

}

export function http(provider : MeshBackendProvider, port : number) : MeshBackendProvider {
  return () => {
    const provision : MeshBackendProvision = toMeshBackendProvision(provider());
    return {
      backend: new HttpMeshBackend(provision.backend, port),
      callback: provision.callback
    };
  };
}
