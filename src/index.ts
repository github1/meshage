import {Cluster, DefaultMessageRouter, MessageRouter} from './core';
import {CompositeServiceInvoker} from './runtime/composite-service-invoker';
import {DnodeMessageListener, DnodeServiceInvoker} from './runtime/dnode';
import {HttpMessageListener, HttpServiceInvoker} from './runtime/http';
import {RSocketMessageListener, RSocketServiceInvoker} from './runtime/rsocket';

export * from './core';
export * from './runtime/dnode';
export * from './runtime/http';
export * from './runtime/grapevine';
export * from './runtime/consul';

export const init = (cluster : Cluster, address : (string | number) = 8080) : MessageRouter => {
  const addressStr: string = `${address}`;
  return new DefaultMessageRouter(
    cluster,
    new CompositeServiceInvoker(
      new RSocketServiceInvoker(),
      new DnodeServiceInvoker(),
      new HttpServiceInvoker()),
    new HttpMessageListener(addressStr),
    new DnodeMessageListener(`${addressStr}/find`),
    new RSocketMessageListener(`${addressStr}/find`)
  );
};
