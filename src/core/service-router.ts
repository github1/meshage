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
import {Message, MessageHandler, MessageHeader} from './message';
import debug = require('debug');

const log : debug.IDebugger = debug('meshage');

export interface ServiceInvoker {
  handles(service: ClusterService): boolean;
  invoke(message : Message, service : ClusterService): Promise<{}>;
}

export const getEndpointsByType = (service : ClusterService, endpointType : string) : ClusterServiceEndpoint[] => {
  return service.endpoints
    .filter((endpoint : ClusterServiceEndpoint) => endpoint.endpointType === endpointType);
};

export const handlesEndpointType = (endpointType : string) : (service : ClusterService) => boolean => {
  return (service : ClusterService) : boolean => {
    return getEndpointsByType(service, endpointType).length > 0;
  };
};

export interface ServiceRegistration extends ClusterService {
  messageHandler: MessageHandler;
}

type ServiceRegistry = { [id : string] : ServiceRegistration };

const headerOnly = (message: Message): MessageHeader => {
  return {
    serviceId: message.serviceId,
    stream: message.stream,
    partitionKey: message.partitionKey
  };
};

export class ServiceRouter {
  private readonly serviceRegistry : ServiceRegistry;

  constructor(private readonly cluster : ClusterMembership,
              private readonly serviceInvoker : ServiceInvoker) {
    this.serviceRegistry = {};
  }

  public register(registration: ServiceRegistration) : Promise<void> {
    log(`Registering handler on stream '${registration.stream}'`);
    return this.cluster.registerService(registration)
      .then(() => {
        this.serviceRegistry[registration.id] = registration;
      });
  }

  public unregister(stream : string) : Promise<void> {
    return Promise.all(this.findLocalServicesByStream(stream)
      .map((registration : ServiceRegistration) => this.cluster.unregisterService(registration.id)))
      .then(() => undefined);
  }

  public send(message : Message) : Promise<{}> {
    if (message.serviceId) {
      if (this.serviceRegistry[message.serviceId]) {
        const serviceRegistration : ServiceRegistration = this.serviceRegistry[message.serviceId];
        return Promise.resolve(serviceRegistration.messageHandler(message.data, headerOnly(message)));
      } else {
        return Promise.reject(new Error(`Service ${message.serviceId} not found`));
      }
    } else {
      return this.sendFiltered(message, selectByHashRing(message.partitionKey));
    }
  }

  public broadcast(message : Message) : Promise<{}> {
    return this.sendFiltered(message, (services : ClusterService[]) => services);
  }

  private sendFiltered(message : Message, filter : ClusterServiceFilter) : Promise<{}> {
    return this.cluster.services(composeSelect(selectByStream(message.stream), hasEndpoints(), filter))
      .then((services : ClusterService[]) => {
        if (services.length === 0) {
          return Promise.reject(new Error(`No matching services found for '${message.stream}'`));
        } else if (services.length === 1) {
          return this.invokeService(message, services[0]);
        }
        return Promise.all(services.map((service : ClusterService) => {
          return this.invokeService(message, service);
        }));
      });
  }

  private invokeService(message : Message, service : ClusterService) : Promise<{}> {
    if (this.serviceRegistry[service.id]) {
      const serviceRegistration : ServiceRegistration = this.serviceRegistry[service.id];
      message.serviceId = serviceRegistration.id;
      return Promise.resolve(serviceRegistration.messageHandler(message.data, headerOnly(message)));
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
