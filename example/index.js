const meshage = require(process.env.LIB || '../dist/src');

const args = process.argv.slice(2);
const clusterPort = args[0] || 9473;
const clusterSeedHost = process.env.SEED ? process.env.SEED.split(':')[0] : 'localhost';
const clusterSeedPort = process.env.SEED ? process.env.SEED.split(':')[1] : (args[0] ? 9473 : [][1]);
const servicePort = parseInt(clusterPort) + 1;

const staticNodes = [{
    id: `node-${clusterPort}`,
    self: true,
    host: 'localhost',
    port: clusterPort
}];
if(clusterSeedPort) {
    staticNodes.push({
        id: `node-${clusterSeedPort}`,
        self: false,
        host: clusterSeedHost,
        port: clusterSeedPort
    });
}

console.log(staticNodes);

new meshage.MessageRouter(
    servicePort,
    new meshage.GossiperCluster(clusterPort, new meshage.StaticPeerProvider(staticNodes))
).start((err, router) => {
    router.register('customers', (command) => {
        return { echo: { command } };
    });
});

// log unhandled rejections
process.on('unhandledRejection', error => {
  console.log('unhandledRejection', error);
});
