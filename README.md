# meshage

A simple peer-to-peer service mesh for HTTP based message handlers. Messages sent within the service mesh are consistently partitioned across members of the cluster. 

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
        // Initialize the cluster to join
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

## JS API

### Init 
Configure the cluster to join.

**init(cluster : Cluster) : MessageRouter**
- `cluster` - accepts an instance of `Cluster` which is responsible for advertising and discovering message handler.

```javascript
const node = meshage.init(cluster);
```

#### *Provided cluster implementations:*

#### GrapevineCluster

Leverages an implementation of the Gossip protocol to discover nodes and services.

**GrapevineCluster(address : (string | number), seeds : (string | number)[])**
- `address` - accepts a *host:port* pair (string) or simply a numeric port (number). If only a port is provided, the host defaults to `127.0.0.1`.
- `seeds` - accepts an array of `address` values (following the same behavior as the *address* argument).

```javascript
// The initial node in the cluster will not have seeds
new meshage.GrapevineCluster(9473);
// Subsequent nodes in the cluster need to specify at least one existing node as a seed
new meshage.GrapevineCluster(9474, [9473]);
```

## Register

Registers message handlers on the node.

**register(stream : string, handler : (message : Message) => any) : MessageRouter**
- `stream` - the stream name to accept messages for.
- `handler` - accepts a message handler function.

```javascript
node.register('someStream', message => {
    return {};
});
```

## Start

Joins the cluster and begins advertising the nodes message handlers.

**start(callback : (router : ConnectedMessageRouter) => void)**
- `callback` - accepts a function which is invoked once the node joins the cluster.  The callback function is provided a router instance which can be used to send or broadcast messages.

```javascript
node.start(router => {
   router
    .send({ stream: 'echo', partitionKey: 'c6c5e7f3-6228-41ce-a7ea-23ac24a08a32', data: 'hello' })
    .then(res => {
      console.log(res);
    });  
});
```

The `router` instanced passed to  type exposes two methods:
 
### Send

Sends a message to be handled consistently by a registered handler for the specified stream. Depending on how the message is routed, it could be handled by the node itself.

**send(message : Message) : Promise<{}>**
- `message` - the message to send

### Broadcast

Sends a message to all registered handlers for the specified stream.

**broadcast(message : Message) : Promise<{}>**
- `message` - the message to send

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details