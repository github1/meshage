/* tslint:disable:no-unsafe-any typedef */
import {
  Address,
  ClusterMembership,
  ClusterServiceEndpoint,
  NetworkMessageRouterListener,
  ServiceRouter
} from '../../core';
import {
  BufferEncoders,
  RSocketServer
} from 'rsocket-core';
import {Single} from 'rsocket-flowable';
import {Payload} from 'rsocket-types';
import RSocketTCPServer from 'rsocket-tcp-server';
import debug = require('debug');

const log : debug.IDebugger = debug('meshage:rsocket');
const logError : debug.IDebugger = debug('meshage:rsocket:error');

export class RSocketMessageListener extends NetworkMessageRouterListener {

  private server : RSocketServer<Buffer, null>;

  constructor(address : (string | number)) {
    super(address);
  }

  public initWithAddress(
    address : Address,
    membership : ClusterMembership,
    serviceRouter : ServiceRouter) : Promise<ClusterServiceEndpoint> {
    return new Promise<ClusterServiceEndpoint>((resolve : (value : ClusterServiceEndpoint) => void, reject : (error : Error) => void) => {
      try {
        this.server = new RSocketServer({
          getRequestHandler: socket => {
            return {
              requestResponse(payload) : Single<Payload<Buffer, null>> {
                const message = JSON.parse(payload.data.toString());
                log('Handling message', message);
                return new Single(subscriber => {
                  serviceRouter
                    .send(message)
                    .then((response : {}) => {
                      subscriber.onComplete({
                        data: Buffer.from(JSON.stringify(response)),
                        metadata: undefined
                      });
                    })
                    .catch((err : Error) => {
                      subscriber.onComplete({
                        data: Buffer.from(JSON.stringify({error: err.message})),
                        metadata: undefined
                      });
                    });
                  subscriber.onSubscribe(undefined);
                });
              }
            };
          },
          transport: new RSocketTCPServer(address, BufferEncoders)
        });
        this.server.start();
        log(`Started rsocket-tcp-server service on port ${address.port}`);
        resolve({
          endpointType: 'rsocket',
          description: `${address.host}:${address.port}`
        });
      } catch (err) {
        logError(err);
        reject(err);
      }
    });
  }

  public stop() {
    log(`Stopping rsocket listener on ${this.address}`);
    this.server.stop();
  }

}
