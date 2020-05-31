import {DefaultMessageRouterConfigurator} from '../../core';
import {RSocketServiceInvoker} from './rsocket-service-invoker';
import {RSocketMessageListener} from './rsocket-message-listener';

export const rsocketMessaging = (address: (string | number)) => new DefaultMessageRouterConfigurator(
  new RSocketServiceInvoker(),
  new RSocketMessageListener(address));
