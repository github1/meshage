# meshage

A simple service mesh. Messages sent within the service mesh can be consistently partitioned across members of the cluster. 

[![build status](https://img.shields.io/travis/github1/meshage/master.svg?style=flat-square)](https://travis-ci.org/github1/meshage)
[![npm version](https://img.shields.io/npm/v/meshage.svg?style=flat-square)](https://www.npmjs.com/package/meshage)
[![npm downloads](https://img.shields.io/npm/dm/meshage.svg?style=flat-square)](https://www.npmjs.com/package/meshage)

## Install

```shell
npm install meshage --save
```

## Example

Initialize a cluster/node:

```javascript
const {init, GrapevineCluster} from 'meshage';
const conn = await init(
        // Initialize the cluster to join
        new GrapevineCluster(
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

Given the above example, create a cluster of nodes:

_Start a seed node_

```bash
CLUSTER_PORT=9742 HTTP_PORT=8080 node index.js
```

_Start other nodes referencing the seed address to join the cluster_
```bash
CLUSTER_PORT=9743 SEEDS=127.0.0.1:9742 HTTP_PORT=8081 node index.js
```

Each node exposes an HTTP endpoint which accepts messages for registered 
streams. When a request is received by any instance registered to the cluster, 
a consistent hashing algorithm is used to determine which node should handle 
the request. If the node which receives the initial HTTP request is the 
designated handler it will respond directly, otherwise the receiving node will 
route the request to the designated node within the cluster.

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

## Supported protocols

Nodes in a cluster will automatically negotiate a protocol to use to 
send/receive messages. The following protocols are registered for each node 
by default.

- [http](https://tools.ietf.org/html/rfc2616) 
- [rsocket](https://github.com/rsocket/rsocket-js)
- [dnode](https://github.com/substack/dnode#readme)

You may configure a router with specific protocols as follows:

_The below example uses only the `RSocket` protocol._

```javascript
const router = return new meshage.DefaultMessageRouter(
    cluster,
    new RSocketServiceInvoker(),
    new RSocketMessageListener(`${addressStr}/find`)
  );
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
Configures the cluster to join.

**init(cluster : Cluster) : MessageRouter**
- `cluster` - an instance of `Cluster` which is responsible for advertising and discovering message handlers.
- `address` - (optional) an *host:port* pair (string) or simply a numeric port (number) to listen for HTTP requests on 

```javascript
const conn = await init(cluster, 8080).start();
```

#### Cluster Implementations:

##### GrapevineCluster

Leverages an implementation of the Gossip protocol to discover nodes and services.

**GrapevineCluster(address : (string | number), seeds : (string | number)[])**
- `address` - accepts a *host:port* pair (string) or simply a numeric port (number). If only a port is provided, the host defaults to `127.0.0.1`.
- `seeds` - accepts an array of `address` values (following the same behavior as the *address* argument).

```javascript
// The initial node in the cluster will not have seeds
new GrapevineCluster(9473);
// Subsequent nodes in the cluster need to specify at least one existing node as a seed
new GrapevineCluster(9474, [9473]);
```

##### ConsulCluster

Connects to a consul agent/cluster for service registration.

**ConsulCluster(address : (string | number), seeds : (string | number)[])**
- `address` - an *host:port* pair (string) or simply a numeric port (number). *The cluster address should point to the associated consul agents HTTP API (typically port 8500)*.
- `seeds` - an array of `address` values (following the same behavior as the *address* argument). *The seed address should be point to a consul agents serf_lan port (typically port 8301)*.

```javascript
new ConsulCluster('127.0.0.1:8500');
```

##### Custom cluster implementations

Custom cluster types may be provided by implementing the `core/cluster/Cluster` interface.

### Register

Registers a message handler on the node.

**register(stream : string, handler : (message : Message) => any) : MessageRouter**
- `stream` - the stream name to accept messages for.
- `handler` - the message handler function.

```javascript
node.register('someStream', message => {
    return {};
});
```

### Start

Joins the cluster and begins advertising the nodes message handlers.

**start(callback : (router : ConnectedMessageRouter) => void)**
- `callback` - (optional) accepts a callback function which is provided a router instance. The router instance can be used to send or broadcast messages to nodes in the cluster.

```javascript
const conn = await init(...).start();
const res = await conn.send({ stream: 'echo', partitionKey: 'c6c5e7f3-6228-41ce-a7ea-23ac24a08a32', data: 'hello' });
console.log(res);
```

The `router` instance passed to the `start` callback exposes two methods:
 
### Send

Sends a message to be handled consistently by a registered handler for the 
specified stream. Depending on how the message is routed, it could be handled 
by the node itself.

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
[MIT](LICENSE.md)