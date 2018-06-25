const meshage = require(process.env.LIB || '../dist/src');

const args = process.argv.slice(2);
const clusterHost = process.env.CLUSTER_HOST || 'localhost';
const clusterPort = args[0] || 9473;
const clusterAddress = `${clusterHost}:${clusterPort}`;
const servicePort = parseInt(clusterPort) + 1;
const delayStartupMs = process.env.DELAY_STARTUP_MS || 0;

const seeds = [];

if (process.env.SEED) {
  seeds.push(process.env.SEED);
}

console.log(`starting on ${clusterAddress} in ${delayStartupMs} ms with ${seeds.length} seed(s) ${seeds}`.trim());

setTimeout(() => {

  meshage
    .init(new meshage.GrapevineCluster(clusterAddress, seeds), servicePort)
    .register('echo', message => ({echo: message, clusterAddress}))
    .start();

}, delayStartupMs);

// log unhandled rejections
process.on('unhandledRejection', error => {
  console.log('unhandledRejection', error);
});
