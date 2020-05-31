import {DefaultMessageRouterConfigurator} from '../../core';
import {HttpServiceInvoker} from './http-service-invoker';
import {HttpMessageListener} from './http-message-listener';

export const httpMessaging = (address: (string | number)) => new DefaultMessageRouterConfigurator(
  new HttpServiceInvoker(),
  new HttpMessageListener(address));
