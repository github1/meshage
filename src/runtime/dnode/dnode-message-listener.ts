/* tslint:disable:no-unsafe-any typedef */
import {
  NetworkMessageRouterListener,
  ServiceRouter,
  ClusterMembership,
  ClusterServiceEndpoint,
  Address
} from '../../core';
import dnode = require('dnode');
import debug = require('debug');

const log : debug.IDebugger = debug('meshage');

export class DnodeMessageListener extends NetworkMessageRouterListener {

  private server : { close() : void };

  constructor(address : (string | number)) {
    super(address);
  }

  public initWithAddress(address: Address, membership: ClusterMembership, serviceRouter: ServiceRouter) : Promise<ClusterServiceEndpoint> {
    return new Promise<ClusterServiceEndpoint>((resolve: (value: ClusterServiceEndpoint) => void) => {
      const d = dnode({
        handle : (message, cb) => {
          log('Handling message', message);
          serviceRouter
            .send(message)
            .then((response: {}) => {
              cb(response);
            })
            .catch((err: Error) => {
              cb({ error: err.message });
            });
        }
      });
      this.server = d.listen(address.port, () => {
        log(`Started dnode service on port ${address.port}`);
        resolve({
          endpointType: 'dnode',
          description: `${address.host}:${address.port}`
        });
      });
    });
  }

  public stop() {
    this.server.close();
  }

}