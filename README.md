# meshage

A simple peer-to-peer service mesh for HTTP services. Messages sent within the service mesh are consistently partitioned across members of the cluster. 

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
        // Select a cluster implementation
        new meshage.GrapevineCluster(
            process.env.CLUSTER_PORT, 
            (process.env.SEEDS || '').split(',')), 
        process.env.HTTP_PORT
    )
    .register('echo', message => {
      // Register a message handler on the 'echo' stream
      return { echoed: message };
    })
    .start();
```

Start one or more instances:

```shell
CLUSTER_PORT=9742 SERVICE_PORT=8080 node index.js
CLUSTER_PORT=9743 SEEDS=127.0.0.1:9742 HTTP_PORT=8081 node index.js
```

Each node exposes an HTTP endpoint which accepts arbitrary messages. When a request is received by any instance registered to the cluster cluster a consistent hashing algorithm is used to determine which node should actually handle the request. If the node which receives the initial HTTP request is the designated handler it will respond directly, otherwise the receiving node will re-dispatch the request to the designated node within the cluster.

*Request:*

```shell
curl -sX POST http://localhost:8080/api/echo/$RANDOM \
     -H 'Content-Type: application/json' \
     -d '{"hello":"world"}'
```

*Response:*

```json
{
  "echoed": {
    "stream": "echo",
    "partitionKey": "4985",
    "hello": "world"
  }
}
```

## HTTP API

### Send

Sends a message to be handled consistently by a registered handler for the specified stream.

**URL** : `/api/:stream/:partitionKey`

**URL Parameters** :
- `stream` - the logical name for the message handler.
- `partitionKey` - the identifier for the `entity` receiving the message.

**Example** :

*Request:*

```shell
curl -sX POST http://localhost:8080/api/echo/$RANDOM \
     -H 'Content-Type: application/json' \
     -d '{"hello":"world"}'
```

*Response:*

```json
{
  "echoed": {
    "stream": "echo",
    "partitionKey": "4985",
    "hello": "world"
  }
}
```

### Broadcast

Sends a message to all registered handlers for the specified stream.

**URL** : `/api/broadcast/:stream/:partitionKey`

**URL Parameters** :
- `stream` - the logical name for the message handler.
- `partitionKey` - the identifier for the `entity` receiving the message.

**Example** :

*Request:*

```shell
curl -sX POST http://localhost:8080/api/broadcast/echo/$RANDOM \
     -H 'Content-Type: application/json' \
     -d '{"hello":"world"}'
```

*Response:*

```json
[
 {
   "echoed": {
     "stream": "echo",
     "partitionKey": "4985",
     "hello": "world"
   }
 }, 
 {
   "echoed": {
     "stream": "echo",
     "partitionKey": "4985",
     "hello": "world"
   }
 }
]
```