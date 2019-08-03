import {Message, MessageHandler} from './message';
import {
  ServiceInvoker,
  ServiceRegistration,
  ServiceRouter
} from './service-router';
import {Address} from './address-parser';
import {Addresses, prepareAddresses} from '../runtime/address-provider';
import {Cluster, ClusterMembership, ClusterServiceEndpoint} from './cluster';
import {v4} from 'uuid';

export interface MessageRouterRegistrar {
  register(stream : string, handler : MessageHandler) : MessageRouterRegistrar;
}

export interface ConnectedMessageRouter extends MessageRouterRegistrar {
  send(message : Message) : Promise<{}>;

  broadcast(message : Message) : Promise<{}>;
}

export type MessageRouterStartHandler = (err : Error, router? : ConnectedMessageRouter) => void;

export interface MessageRouter extends MessageRouterRegistrar {
  start(handler? : MessageRouterStartHandler) : void;
}

export class DefaultConnectedMessageRouter implements ConnectedMessageRouter {
  constructor(private readonly serviceRouter : ServiceRouter,
              private readonly endpoints : ClusterServiceEndpoint[]) {
  }

  public register(stream : string, messageHandler : MessageHandler) : ConnectedMessageRouter {
    const serviceRegistration : ServiceRegistration = {
      id: v4(),
      stream,
      messageHandler,
      endpoints: this.endpoints
    };
    this.serviceRouter
      .register(serviceRegistration)
      .catch((err : Error) => {
        throw err;
      });
    return this;
  }

  public send(message : Message) : Promise<{}> {
    return this.serviceRouter.send(message);
  }

  public broadcast(message : Message) : Promise<{}> {
    return this.serviceRouter.broadcast(message);
  }
}

export interface MessageRouterListener {
  init(membership : ClusterMembership, serviceRouter : ServiceRouter) : Promise<ClusterServiceEndpoint>;
}

export abstract class NetworkMessageRouterListener implements MessageRouterListener {
  private readonly address : (string | number);

  protected constructor(address : (string | number)) {
    this.address = address;
  }

  public init(membership : ClusterMembership, serviceRouter : ServiceRouter) : Promise<ClusterServiceEndpoint> {
    return prepareAddresses(this.address)
      .then((addresses : Addresses) => {
        const address : Address = addresses.nodeAddress;
        return this.initWithAddress(address, membership, serviceRouter);
      });
  }

  protected abstract initWithAddress(address : Address, membership : ClusterMembership,
                                     serviceRouter : ServiceRouter) : Promise<ClusterServiceEndpoint>;
}

export type HandlerRegistration = {
  stream : string;
  messageHandler : MessageHandler;
};

export class DefaultMessageRouter implements MessageRouter {
  private readonly handlers : HandlerRegistration[] = [];
  private readonly listeners : MessageRouterListener[];

  constructor(private readonly cluster : Cluster,
              private readonly serviceInvoker : ServiceInvoker, ...listeners : MessageRouterListener[]) {
    this.listeners = listeners;
  }

  public register(stream : string, messageHandler : MessageHandler) : MessageRouter {
    this.handlers.push({stream, messageHandler});
    return this;
  }

  public start(handler? : MessageRouterStartHandler) : void {
    this.cluster
      .joinCluster()
      .then((membership : ClusterMembership) => {
        const serviceRouter : ServiceRouter = new ServiceRouter(membership, this.serviceInvoker);
        const listeners : MessageRouterListener[] = this.listeners.slice();
        const startListeners = new Promise<ClusterServiceEndpoint[]>(
          (resolve : (endpoints: ClusterServiceEndpoint[]) => void, reject : (err : Error) => void) => {
          const endpoints : ClusterServiceEndpoint[] = [];
          const listenNext = () => {
            if (listeners.length > 0) {
              const listener : MessageRouterListener = listeners.shift();
              listener
                .init(membership, serviceRouter)
                .then((endpoint: ClusterServiceEndpoint) => {
                  endpoints.push(endpoint);
                  listenNext();
                })
                .catch((err : Error) => {
                  reject(err);
                });
            } else {
              resolve(endpoints);
            }
          };
          listenNext();
        });
        startListeners
          .then((endpoints : ClusterServiceEndpoint[]) => {
            Promise.all(
              this.handlers.map((handlerRegistration : HandlerRegistration) => {
                const serviceRegistration : ServiceRegistration = {
                  id: v4(),
                  ...handlerRegistration,
                  endpoints
                };
                return serviceRouter.register(serviceRegistration);
              }))
              .then(() => {
                if (handler) {
                  handler(undefined, new DefaultConnectedMessageRouter(serviceRouter, endpoints));
                }
              })
              .catch((err : Error) => {
                if (handler) {
                  handler(err);
                } else {
                  throw err;
                }
              });
          });
      });
  }
}
