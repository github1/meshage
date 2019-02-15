import { MessageHandler, Message } from './message';
import { ServiceRouter } from './service-router';

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
  constructor(private readonly address : string, private readonly serviceRouter : ServiceRouter) {
  }
  public register(stream : string, handler : MessageHandler) : ConnectedMessageRouter {
    this.serviceRouter.register(stream, this.address, handler);
    return this;
  }
  public send(message : Message) : Promise<{}> {
    return this.serviceRouter.send(message);
  }
  public broadcast(message : Message) : Promise<{}> {
    return this.serviceRouter.broadcast(message);
  }
}
