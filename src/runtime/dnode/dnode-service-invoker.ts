/* tslint:disable:no-unsafe-any typedef */
import {
  AbstractServiceInvoker,
  Address,
  ClusterService,
  Message
} from '../../core';
import dnode = require('dnode');

export class DnodeServiceInvoker extends AbstractServiceInvoker {

  constructor() {
    super('dnode');
  }

  protected doSend(address : Address, message : Message, service : ClusterService) : Promise<{}> {
    return new Promise((resolve : (value : {}) => void, reject : (err : Error) => void) => {
      const d = dnode(undefined, {weak: false})
        .connect(address.host, address.port);
      d.on('remote', (remote) => {
        remote.handle(message, (response) => {
          d.end();
          resolve(response);
        });
      })
        .on('error', (err : Error) => {
          reject(err);
        });
    });
  }
}
