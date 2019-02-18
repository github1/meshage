import {ClusterService, ClusterServiceEndpoint} from '../../core/cluster';
import {Message} from '../../core/message';
import {ServiceInvoker, handlesEndpointType} from '../../core/service-router';
import superagent = require('superagent');
import superdebug = require('superagent-debugger');
import debug = require('debug');

const log : debug.IDebugger = debug('meshage');
const logError : debug.IDebugger = debug('meshage:error');

export type HttpServiceInvokerOptions = {
  secure? : boolean;
  timeout? : number;
};

export class HttpServiceInvoker implements ServiceInvoker {
  constructor(private readonly options: HttpServiceInvokerOptions = {timeout: 1000}) {
  }
  public handles(service: ClusterService): boolean {
    return handlesEndpointType('http')(service);
  }
  public invoke(message : Message, service : ClusterService): Promise<{}> {
    return new Promise((resolve : (value : {}) => void, reject : (err : Error) => void) => {
      const endpoint : ClusterServiceEndpoint = service.endpoints
        .filter((endpoint : ClusterServiceEndpoint) => endpoint.endpointType === 'http')[0];
      const url = `${endpoint.description}/api/${message.stream}/${message.partitionKey}`;
      log(`Invoking cluster endpoint ${url}`, message, service);
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
            logError(err);
            reject(err);
          } else if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.body);
          } else {
            const err = new Error(`${res.statusCode}`);
            logError(err);
            reject(err);
          }
        });
    });
  }
}
