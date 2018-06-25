import { MessageHandler, Message } from './message';

export interface ConnectedMessageRouter {
  send(message : Message) : Promise<{}>;
  broadcast(message : Message) : Promise<{}>;
}

export type MessageRouterStartHandler = (err : Error, router? : ConnectedMessageRouter) => void;

export interface MessageRouter {
  register(stream : string, handler : MessageHandler) : MessageRouter;
  start(handler? : MessageRouterStartHandler) : void;
}
