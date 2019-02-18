import HashRing = require('hashring'); // tslint:disable-line

export interface ClusterServiceEndpoint {
  endpointType: string;
  description: string;
}

export interface ClusterService {
  id : string;
  stream : string;
  endpoints: ClusterServiceEndpoint[];
}

export type ClusterServiceFilter = (services : ClusterService[]) => ClusterService[];

export interface ClusterMembership {
  services(filter? : ClusterServiceFilter) : Promise<ClusterService[]>;
  registerService(registration: ClusterService) : Promise<void>;
  unregisterService(id : string) : Promise<void>;
}

export interface Cluster {
  joinCluster() : Promise<ClusterMembership>;
}

export const composeSelect = (...selectors : ClusterServiceFilter[]) : ClusterServiceFilter => {
  return (services : ClusterService[]) : ClusterService[] => {
    return selectors.reduce((filteredServices : ClusterService[], filter : ClusterServiceFilter) => {
      return filter(filteredServices);
    }, services);
  };
};

export const selectByStream = (stream : string) : ClusterServiceFilter => {
  return (services : ClusterService[]) : ClusterService[] => {
    return services.filter((service : ClusterService) => service.stream === stream);
  };
};

export const selectByHashRing = (key : string) : ClusterServiceFilter => {
  return (services : ClusterService[]) : ClusterService[] => {
    type ServiceMapping = {[key:string]:ClusterService};
    const mapping : ServiceMapping = services.reduce((mapping : ServiceMapping, service : ClusterService) => {
      mapping[service.id] = service;
      return mapping;
    }, {});
    const hashRing : HashRing = new HashRing(Object.keys(mapping));
    const found : ClusterService = mapping[hashRing.get(key)];
    return found ? [found] : [];
  };
};
