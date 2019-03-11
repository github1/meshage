/* tslint:disable:no-unsafe-any typedef */
import {
  ClusterService,
  ClusterServiceEndpoint,
  ServiceInvoker,
  handlesEndpointType,
  Message,
  Address,
  parseAddress
} from '../../core';
import debug = require('debug');
import dnode = require('dnode');

const log : debug.IDebugger = debug('meshage');
const logError : debug.IDebugger = debug('meshage:error');

export class DnodeServiceInvoker implements ServiceInvoker {

  public handles(service : ClusterService) : boolean {
    return handlesEndpointType('dnode')(service);
  }

  public invoke(message : Message, service : ClusterService) : Promise<{}> {
    return new Promise((resolve : (value : {}) => void, reject : (err : Error) => void) => {
      const endpoint : ClusterServiceEndpoint = service.endpoints
        .filter((endpoint : ClusterServiceEndpoint) => endpoint.endpointType === 'dnode')[0];
      // tslint:disable-next-line:no-parameter-reassignment
      message = {
        ...message,
        serviceId: service.id
      };
      log('Invoking cluster endpoint', endpoint, message, service);
      const address : Address = parseAddress(endpoint.description);
      const d = dnode.connect(address.host, address.port);
      d.on('remote', (remote) => {
        remote.handle(message, (response) => {
          d.end();
          resolve(response);
        });
      })
        .on('error', (err: Error) => {
          logError(err);
          reject(err);
        });
    });
  }
}
