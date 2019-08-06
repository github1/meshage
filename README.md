# @github1/meshage

[description] 

[badges]

## Install

```shell
npm install @github1/meshage --save
```

## Usage

Initialize a node:

```javascript
const meshage = require('@github1/meshage');
meshage
    .init(
        // Initialize the cluster to join (Grapevine or Consul)
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

Each node exposes an HTTP endpoint which accepts messages for registered streams. When a request is received by any instance registered to the cluster, a consistent hashing algorithm is used to determine which node should handle the request. If the node which receives the initial HTTP request is the designated handler it will respond directly, otherwise the receiving node will route the request to the designated node within the cluster.

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
     "hello": "world"
   }
 }, 
 {
   "echoed": {
     "hello": "world"
   }
 }
]
```

## JS API

### Init 
Configure the cluster to join.

**init(cluster : Cluster) : MessageRouter**
- `cluster` - an instance of `Cluster` which is responsible for advertising and discovering message handlers.
- `address` - (optional) an *host:port* pair (string) or simply a numeric port (number) to listen for HTTP requests on 

```javascript
const node = meshage.init(cluster, 8080);
```

#### *Cluster Implementations:*

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

#### ConsulCluster

Connects to a consul agent/cluster for service registration.

**ConsulCluster(address : (string | number), seeds : (string | number)[])**
- `address` - an *host:port* pair (string) or simply a numeric port (number). *The cluster address should point to the associated consul agents HTTP API (typically port 8500)*.
- `seeds` - an array of `address` values (following the same behavior as the *address* argument). *The seed address should be point to a consul agents serf_lan port (typically port 8301)*.

```javascript
new meshage.ConsulCluster('127.0.0.1:8500');
```

#### Custom Implementations

Custom cluster types may be provided by implementing the `core/cluster/Cluster` interface.

## Register

Registers a message handler on the node.

**register(stream : string, handler : (message : Message) => any) : MessageRouter**
- `stream` - the stream name to accept messages for.
- `handler` - the message handler function.

```javascript
node.register('someStream', message => {
    return {};
});
```

## Start

Joins the cluster and begins advertising the nodes message handlers.

**start(callback : (router : ConnectedMessageRouter) => void)**
- `callback` - (optional) accepts a callback function which is provided a router instance. The router instance can be used to send or broadcast messages to nodes in the cluster.

```javascript
node.start(router => {
   router
    .send({ stream: 'echo', partitionKey: 'c6c5e7f3-6228-41ce-a7ea-23ac24a08a32', data: 'hello' })
    .then(res => {
      console.log(res);
    });
});
```

The `router` instance passed to the `start` callback exposes two methods:
 
### Send

Sends a message to be handled consistently by a registered handler for the specified stream. Depending on how the message is routed, it could be handled by the node itself.

**send(message : Message) : Promise<{}>**
- `message` - the message to send

### Broadcast

Sends a message to all registered handlers for the specified stream.

**broadcast(message : Message) : Promise<{}>**
- `message` - the message to send

## Address Formats

Address may be supplied in the following formats:

### Host and port string

The host and port separated by a colon.

_Example_

`localhost:8080`

### Port number

Just the port (as a number or string). If no explicit hostname is provided, `os.hostname()` is used to determine the host.

_Example_

`8080`

### Finding open ports

By suffixing the address with the keyword `find`, the library will attempt to find an open port to listen on.

_Example_

- `localhost:find` - use localhost, but find an open port
- `localhost:8080/find` - use localhost and port 8080 if available, otherwise find an open port
- `8080/find` - use port 8080 if available, otherwise find an open port
- `find` - find any open port

## License
[license]