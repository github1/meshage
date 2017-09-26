# meshage

Sharded peer based message routing for distributed services

## Install

```shell
npm install meshage --save
```

## Usage

Define a service:

```javascript
const meshage = require('meshage');

const staticNodes = [{
    id: `node-${process.env.CLUSTER_PORT}`,
    self: true,
    host: 'localhost',
    port: process.env.CLUSTER_PORT
}];
if(process.env.CLUSTER_SEED_PORT) {
    staticNodes.push({
        id: `node-${process.env.CLUSTER_SEED_PORT}`,
        self: false,
        host: 'localhost',
        port: process.env.CLUSTER_SEED_PORT
    });
}

new meshage.MessageRouter(
    process.env.SERVICE_PORT,
    new meshage.GossiperCluster(process.env.CLUSTER_PORT, new meshage.StaticPeerProvider(staticNodes))
).start((err, router) => {
    router.register('customers', (command) => {
        return { echo: { command } };
    });
});
```

Start one or more instances:

```shell
# first
CLUSTER_PORT=9742 SERVICE_PORT=8080 node index.js
# second
CLUSTER_PORT=9743 CLUSTER_SEED_PORT=9742 SERVICE_PORT=8081 node index.js
```

Send a message to any of the nodes using its http api:

```shell
curl http://localhost:8080/api/customers/$RANDOM -d '{"key":"value}'
```

The message will be invoked consistently on one of the nodes in the cluster:

```json
{
  "echo": {
    "command": {
      "key": "value",
      "stream": "customers",
      "partitionKey": "32413815"
    }
  },
  "peer": "primary"
}
```