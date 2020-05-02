import {
  AbstractServiceInvoker,
  Address,
  ClusterService,
  ClusterServiceEndpoint,
  Message
} from '../../core';
import superagent = require('superagent');
import superdebug = require('superagent-debugger');
import debug = require('debug');

const log : debug.IDebugger = debug('meshage:http');

export type HttpServiceInvokerOptions = {
  secure? : boolean;
  timeout? : number;
};

export class HttpServiceInvoker extends AbstractServiceInvoker {
  constructor(private readonly options: HttpServiceInvokerOptions = {timeout: 1000}) {
    super('http');
  }
  protected doSend(
    address : Address,
    message : Message,
    service : ClusterService,
    endpoint : ClusterServiceEndpoint) : Promise<{}> {
    return new Promise((resolve : (value : {}) => void, reject : (err : Error) => void) => {
      const url = `${endpoint.description}/api/${message.stream}/${message.partitionKey}`;
      superagent
        .post(url)
        .set('X-Stream', message.stream)
        .set('X-Partition-Key', message.partitionKey)
        .set('X-Service-ID', service.id)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        // tslint:disable-next-line:no-unsafe-any
        .use(superdebug.default(log))
        .timeout(this.options.timeout)
        // tslint:disable-next-line:no-unsafe-any
        .send(message.data)
        .end((err : Error, res : { statusCode? : number; body : {}; text : string }) => {
          if (err) {
            reject(err);
          } else if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.body);
          } else {
            const err = new Error(`${res.statusCode}`);
            reject(err);
          }
        });
    });
  }
}
