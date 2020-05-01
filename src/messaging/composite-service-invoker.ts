import {
  ClusterService,
  Message,
  ServiceInvoker
} from '../core';

export class CompositeServiceInvoker implements ServiceInvoker {
  private readonly serviceInvokers : ServiceInvoker[];
  constructor(...serviceInvokers : ServiceInvoker[]) {
    this.serviceInvokers = serviceInvokers;
  }
  public handles(service: ClusterService): boolean {
    return true;
  }
  public invoke(message : Message, service : ClusterService): Promise<{}> {
    return new Promise((resolve : (value : {}) => void, reject: (err : Error) => void) => {
      let found : boolean = false;
      for (const serviceInvoker of this.serviceInvokers) {
        if (serviceInvoker.handles(service)) {
          found = true;
          resolve(serviceInvoker.invoke(message, service));
          break;
        }
      }
      if (!found) {
        reject(new Error(`No compatible service invokers found for service ${JSON.stringify(service)}`));
      }
    });
  }
}
