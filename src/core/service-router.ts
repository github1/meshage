import {
  ClusterMembership,
  ClusterService,
  ClusterServiceEndpoint,
  ClusterServiceFilter,
  composeSelect,
  hasEndpoints,
  selectByHashRing,
  selectByStream
} from './cluster';
import {
  Message,
  MessageHandler,
  MessageHeader
} from './message';
import {
  Address,
  parseAddress
} from './address-parser';
import debug = require('debug');

const log : debug.IDebugger = debug('meshage:service-router');
const logError : debug.IDebugger = debug('meshage:service-router:error');

export const getEndpointsByType = (service : ClusterService, endpointType : string) : ClusterServiceEndpoint[] => {
  return service.endpoints
    .filter((endpoint : ClusterServiceEndpoint) => endpoint.endpointType === endpointType);
};

export const handlesEndpointType = (endpointType : string) : (service : ClusterService) => boolean => {
  return (service : ClusterService) : boolean => {
    return getEndpointsByType(service, endpointType).length > 0;
  };
};

export interface ServiceInvoker {
  handles(service : ClusterService) : boolean;

  invoke(message : Message, service : ClusterService) : Promise<{}>;
}

export class AbstractServiceInvoker implements ServiceInvoker {
  constructor(private readonly endpointType : string) {
  }

  public handles(service : ClusterService) : boolean {
    return handlesEndpointType(this.endpointType)(service);
  }

  public async invoke(message : Message, service : ClusterService) : Promise<{}> {
    const endpoint : ClusterServiceEndpoint = service.endpoints
      .filter((endpoint : ClusterServiceEndpoint) => endpoint.endpointType === this.endpointType)[0];
    // tslint:disable-next-line:no-parameter-reassignment
    message = {
      ...message,
      serviceId: service.id
    };
    log('Invoking cluster endpoint', endpoint, message, service);
    const address : Address = parseAddress(endpoint.description);
    try {
      return await this.doSend(address, message, service, endpoint);
    } catch (err) {
      logError(err);
      throw err;
    }
  }

  protected doSend(
    address : Address,
    message : Message,
    service : ClusterService,
    endpoint : ClusterServiceEndpoint) : Promise<{}> {
    return Promise.reject(new Error('Not implemented'));
  }
}

export interface ServiceRegistration extends ClusterService {
  messageHandler : MessageHandler;
}

type ServiceRegistry = { [id : string] : ServiceRegistration };

const headerOnly = (message : Message) : MessageHeader => {
  return {
    serviceId: message.serviceId,
    stream: message.stream,
    partitionKey: message.partitionKey,
    meta: message.meta
  };
};

export class ServiceRouter {
  private readonly serviceRegistry : ServiceRegistry;

  constructor(private readonly cluster : ClusterMembership,
              private readonly serviceInvoker : ServiceInvoker) {
    this.serviceRegistry = {};
  }

  public async register(registration : ServiceRegistration) : Promise<void> {
    log(`Registering service '${registration.id}' on stream '${registration.stream}'`);
    await this.cluster.registerService(registration);
    this.serviceRegistry[registration.id] = registration;
  }

  public async unregister(stream : string) : Promise<void> {
    await Promise.all(this.findLocalServicesByStream(stream)
      .map((registration : ServiceRegistration) => this.cluster.unregisterService(registration.id)));
    return undefined;
  }

  public send(message : Message) : Promise<{}> {
    if (message.serviceId) {
      if (this.serviceRegistry[message.serviceId]) {
        const serviceRegistration : ServiceRegistration = this.serviceRegistry[message.serviceId];
        log('Executing local service', serviceRegistration, message);
        return Promise.resolve(serviceRegistration.messageHandler(message.data, headerOnly(message)));
      } else {
        const errorMessage : string = `Service ${message.serviceId} not found`;
        log(errorMessage, message);
        return Promise.reject(new Error(errorMessage));
      }
    } else {
      return this.sendFiltered(message, selectByHashRing(message.partitionKey));
    }
  }

  public broadcast(message : Message) : Promise<{}> {
    return this.sendFiltered(message, (services : ClusterService[]) => services);
  }

  private async sendFiltered(message : Message, filter : ClusterServiceFilter) : Promise<{}> {
    const services : ClusterService[] = await this.cluster
      .services(
        composeSelect(
          selectByStream(message.stream), hasEndpoints(), filter));
    if (services.length === 0) {
      return Promise.reject(new Error(`No matching services found for '${message.stream}'`));
    } else if (services.length === 1) {
      return this.invokeService(message, services[0]);
    }
    return Promise.all(services.map((service : ClusterService) => this.invokeService(message, service)));
  }

  private invokeService(message : Message, service : ClusterService) : Promise<{}> {
    if (this.serviceRegistry[service.id]) {
      const serviceRegistration : ServiceRegistration = this.serviceRegistry[service.id];
      const newMessage : Message = {
        ...message,
        serviceId: serviceRegistration.id
      };
      return Promise.resolve(serviceRegistration.messageHandler(newMessage.data, headerOnly(newMessage)));
    } else {
      return this.serviceInvoker.invoke(message, service);
    }
  }

  private findLocalServicesByStream(stream : string) : ServiceRegistration[] {
    return Object.keys(this.serviceRegistry)
      .map((id : string) => this.serviceRegistry[id])
      .filter((registration : ServiceRegistration) => registration.stream === stream);
  }

}
