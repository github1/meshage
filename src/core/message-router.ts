import {Message, MessageHandler} from './message';
import {
  ServiceInvoker,
  ServiceRegistration,
  ServiceRouter
} from './service-router';
import {Address} from './address-parser';
import {Addresses, prepareAddresses} from '../messaging/address-provider';
import {Cluster, ClusterMembership, ClusterServiceEndpoint} from './cluster';
import {v4} from 'uuid';

export type HandlerRegistration = {
  stream : string;
  messageHandler : MessageHandler;
};

export interface MessageRouterRegistrar {
  register(... registrations: HandlerRegistration[]) : Promise<void>;
}

export interface ConnectedMessageRouter extends MessageRouterRegistrar {
  send(message : Message) : Promise<{}>;

  broadcast(message : Message) : Promise<{}>;
}

export interface MessageRouter {
  start() : Promise<ConnectedMessageRouter>;
}

export class DefaultConnectedMessageRouter implements ConnectedMessageRouter {
  constructor(private readonly serviceRouter : ServiceRouter,
              private readonly endpoints : ClusterServiceEndpoint[]) {
  }

  public async register(... registrations: HandlerRegistration[]) : Promise<void> {
    for (const registration of registrations) {
      const serviceRegistration : ServiceRegistration = {
        id: v4(),
        stream: registration.stream,
        messageHandler: registration.messageHandler,
        endpoints: this.endpoints
      };
      await this.serviceRouter.register(serviceRegistration);
    }
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
  protected readonly address : (string | number);

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

  public async start() : Promise<ConnectedMessageRouter> {
    const membership : ClusterMembership = await this.cluster.joinCluster();
    const serviceRouter : ServiceRouter = new ServiceRouter(membership, this.serviceInvoker);
    const listeners : MessageRouterListener[] = this.listeners.slice();
    const endpoints : ClusterServiceEndpoint[] = [];
    for (const listener of listeners) {
      const endpoint: ClusterServiceEndpoint = await listener.init(membership, serviceRouter);
      endpoints.push(endpoint);
    }
    for (const handlerRegistration of this.handlers) {
      const serviceRegistration : ServiceRegistration = {
        id: v4(),
        ...handlerRegistration,
        endpoints
      };
      await serviceRouter.register(serviceRegistration);
    }
    return new DefaultConnectedMessageRouter(serviceRouter, endpoints);
  }
}
