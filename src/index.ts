import { Cluster } from './core/cluster';

import { MessageRouter } from './core/message-router';

import { ExpressMessageRouter } from './runtime/express-message-router';

export { Cluster } from './core/cluster';

export * from './core/message-router';

export { GrapevineCluster } from './runtime/grapevine-runtime';

export const init = (cluster : Cluster, port : number, host? : string) : MessageRouter => {
  return new ExpressMessageRouter(cluster, port, host);
};
