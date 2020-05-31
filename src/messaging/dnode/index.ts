import {DefaultMessageRouterConfigurator} from '../../core';
import {DnodeServiceInvoker} from './dnode-service-invoker';
import {DnodeMessageListener} from './dnode-message-listener';

export const dnodeMessaging = (address: (string | number)) => new DefaultMessageRouterConfigurator(
  new DnodeServiceInvoker(),
  new DnodeMessageListener(address));
