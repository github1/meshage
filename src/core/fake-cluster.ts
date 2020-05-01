import {
  Cluster,
  ClusterMembership,
  ClusterService
} from './cluster';

class FakeClusterMemberShip implements ClusterMembership {
  private registeredServices : ClusterService[] = [];

  public registerService(registration : ClusterService) : Promise<void> {
    this.registeredServices.push(registration);
    return Promise.resolve();
  }

  public services(filter? : (services : ClusterService[]) => ClusterService[]) : Promise<ClusterService[]> {
    return Promise.resolve(filter ? filter(this.registeredServices) : this.registeredServices);
  }

  public unregisterService(id : string) : Promise<void> {
    this.registeredServices = this.registeredServices
      .filter((service : ClusterService) => service.id !== id);
    return Promise.resolve();
  }
}

export class FakeCluster implements Cluster {

  private readonly clusterMembership : FakeClusterMemberShip = new FakeClusterMemberShip();

  public joinCluster() : Promise<ClusterMembership> {
    return Promise.resolve(this.clusterMembership);
  }
}
