import { Cluster } from './core/cluster';

import { MessageRouter } from './core/message-router';

import { ExpressMessageRouter } from './runtime/express-message-router';

export { Cluster } from './core/cluster';

export * from './core/message-router';

export { GrapevineCluster } from './runtime/grapevine-runtime';

export const init = (cluster : Cluster, address : (string | number)) : MessageRouter => {
  return new ExpressMessageRouter(cluster, address);
};
