import {Cluster, DefaultMessageRouter, MessageRouter} from './core';
import {CompositeServiceInvoker} from './messaging/composite-service-invoker';
import {DnodeMessageListener, DnodeServiceInvoker} from './messaging/dnode';
import {HttpMessageListener, HttpServiceInvoker} from './messaging/http';
import {RSocketMessageListener, RSocketServiceInvoker} from './messaging/rsocket';

export * from './core';
export * from './messaging/dnode';
export * from './messaging/http';
export * from './messaging/rsocket';
export * from './backend/grapevine';
export * from './backend/consul';

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
