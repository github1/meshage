import {
  ClusterMembership,
  ClusterService,
  ClusterServiceFilter,
  selectByHashRing,
  selectByStream,
  composeSelect
} from './cluster';
import { ConnectedMessageRouter } from './message-router';
import { MessageHandler, Message } from './message';
import { v4 } from 'uuid';
import debug = require('debug');

const log : debug.IDebugger = debug('meshage');

export type ServiceInvoker = (message : Message, service : ClusterService) => Promise<{}>;

type ServiceRegistration = { id : string, stream : string, address : string, messageHandler : MessageHandler };
type ServiceRegistry = { [id : string] : ServiceRegistration };

export class ServiceRouter implements ConnectedMessageRouter {
  private cluster : ClusterMembership;
  private serviceInvoker : ServiceInvoker;
  private serviceRegistry : ServiceRegistry;

  constructor(cluster : ClusterMembership, serviceInvoker : ServiceInvoker) {
    this.cluster = cluster;
    this.serviceInvoker = serviceInvoker;
    this.serviceRegistry = {};
  }

  public register(stream : string, address : string, messageHandler : MessageHandler) : Promise<string> {
    const id : string = v4();
    log(`Registering handler on stream '${stream}' with address '${address}'`);
    return this.cluster.registerService(id, stream, address)
      .then(() => {
        this.serviceRegistry[id] = {id, stream, address, messageHandler};
        return id;
      });
  }

  public unregister(stream : string) : Promise<void> {
    return Promise.all(this.findLocalServicesByStream(stream)
      .map((registration : ServiceRegistration) => this.cluster.unregisterService(registration.id))).then(() => {
      // void
    });
  }

  public send(message : Message) : Promise<{}> {
    if (message.serviceId) {
      if (this.serviceRegistry[message.serviceId]) {
        return Promise.resolve(this.serviceRegistry[message.serviceId].messageHandler(message));
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
    return this.cluster.services(composeSelect(selectByStream(message.stream), filter))
      .then((services : ClusterService[]) => {
        if (services.length === 1) {
          return this.invokeService(message, services[0]);
        }
        return Promise.all(services.map((service : ClusterService) => {
          return this.invokeService(message, service).catch((err : Error) => {
            return { err: err.message };
          });
        }));
      });
  }

  private invokeService(message : Message, service : ClusterService) : Promise<{}> {
    if (this.serviceRegistry[service.id]) {
      return Promise.resolve(this.serviceRegistry[service.id].messageHandler(message));
    } else {
      return this.serviceInvoker(message, service);
    }
  }

  private findLocalServicesByStream(stream : string) : ClusterService[] {
    return Object.keys(this.serviceRegistry)
      .map((id : string) => this.serviceRegistry[id])
      .filter((registration : ServiceRegistration) => registration.stream === stream);
  }

}
