import {
  Cluster,
  DefaultMessageRouter,
  MessageRouter,
  MessageRouterConfigurator
} from './core';
import {dnodeMessaging} from './messaging/dnode';
import {httpMessaging} from './messaging/http';
import {rsocketMessaging} from './messaging/rsocket';

export * from './core';
export * from './messaging/dnode';
export * from './messaging/http';
export * from './messaging/rsocket';
export * from './backend/grapevine';
export * from './backend/consul';

export function init(cluster : Cluster, address : (string | number)) : MessageRouter;
export function init(cluster : Cluster, ...messagingConfig : MessageRouterConfigurator[]) : MessageRouter;
export function init(cluster : Cluster, ...config : (string | number | MessageRouterConfigurator)[]) : MessageRouter {
  if (config.length > 0) {
    if (typeof config[0] === 'string') {
      const addressStr : string = `${config[0]}`;
      return new DefaultMessageRouter(
        cluster,
        httpMessaging(addressStr),
        dnodeMessaging(`${addressStr}/find`),
        rsocketMessaging(`${addressStr}/find`)
      );
    }
  }
  return new DefaultMessageRouter(
    cluster,
    ...(<MessageRouterConfigurator[]>config));
}
