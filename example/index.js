const meshage = require(process.env.LIB || '../dist/src');
const os = require('os');

const serviceHost = process.env.SERVICE_HOST || os.hostname();
const servicePort = process.env.SERVICE_PORT || '8080/find';
const serviceAddress = `${serviceHost}:${servicePort}`;

const clusterType = process.env.CLUSTER_TYPE;
const clusterHost = process.env.CLUSTER_HOST || serviceHost;
const initClusterPort = `${parseInt(servicePort, 10) - 10}`;
const clusterPort = process.env.CLUSTER_PORT || `${initClusterPort}/find`;
const clusterAddress = `${clusterHost}:${clusterPort}`;

const delayStartupMs = process.env.DELAY_STARTUP_MS || 0;

const seeds = (process.env.SEED || `${clusterHost}:${initClusterPort}`).split(/,/);

console.log(`starting on ${clusterAddress} in ${delayStartupMs} ms with ${seeds.length} seed(s) ${seeds}`.trim());

setTimeout(() => {

  let cluster;
  if (clusterType === 'consul') {
    cluster = new meshage.ConsulCluster(clusterAddress, seeds);
  } else {
    cluster = new meshage.GrapevineCluster(clusterAddress, seeds);
  }

  meshage
    .init(cluster, serviceAddress)
    .register('echo', message => ({echo: message}))
    .start();

}, delayStartupMs);

process.on('unhandledRejection', error => {
  console.log('unhandledRejection', error);
});
