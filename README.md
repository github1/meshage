# meshage

Consistent hash routing for HTTP message handlers

## Install

```shell
npm install meshage --save
```

## Usage

Define a service node:

```javascript
const meshage = require('meshage');
meshage
    .init(
        new meshage.GrapevineCluster(
            process.env.CLUSTER_PORT,
            (process.env.SEEDS || '').split(',')
        ), 
        process.env.HTTP_PORT
    )
    .register('echo', message => {
      // Register a message handler on 'echo' stream
      return {echoed: message, clusterAddress};
    })
    .start(membership => {
      
      // Make calls programmatically
      membership
        .send({ stream: 'echo', partitionKey: '1123123' })
        .then(response => {
            ...
        });
      
    });
```

Start one or more instances:

```shell

# First node
CLUSTER_PORT=9742 SERVICE_PORT=8080 node index.js

# Second node (reference the first node as a seed)
CLUSTER_PORT=9743 SEEDS=127.0.0.1:9742 HTTP_PORT=8081 node index.js
```

Send a message to any of the nodes using it's http api:

```shell
curl http://localhost:8080/api/echo/$RANDOM -d '{"hello":"world}'
```

The message will be consistently invoked on one of the nodes in the cluster. In this example the message is echoed back:

```json
{
  "echoed": {
    "stream": "echo",
    "partitionKey": "4985",
    "serviceId": "f15cc216-e9a8-4570-a875-233e213081d6",
    "data": {
      "hello": "world"
    }
  }
}
```