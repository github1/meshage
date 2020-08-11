# meshage

A simple service mesh. Messages sent within the service mesh can be consistently partitioned across members of the cluster. 

[![build status](https://img.shields.io/travis/github1/meshage/master.svg?style=flat-square)](https://travis-ci.org/github1/meshage)
[![npm version](https://img.shields.io/npm/v/meshage.svg?style=flat-square)](https://www.npmjs.com/package/meshage)
[![npm downloads](https://img.shields.io/npm/dm/meshage.svg?style=flat-square)](https://www.npmjs.com/package/meshage)

## Install

```shell
npm install meshage --save
```

## Usage

Initialize some nodes and define a handler for a subject & message:

```javascript
const {mesh, nats} from 'meshage';
const n1 = mesh(nats('nats://localhost:4222'));

await n1.subject('something')
    .on(SomeMessage, (message: SomeMessage) => {
        return 'reply';
    })
    .awaitRegistration();

const reply = await mesh(nats('nats://localhost:4222'))
    .subject('something')
    .send(new SomeMessage(), {
        wait: true | false, // Whether to wait for a reply or just fire the message.
        timeout: 1000 // Time in milliseconds to wait for a reply.
    });
```

## Nats Support

To enable consistent hashing / partitioned message support one node in the "cluster" should be configured with the `monitorUrl` for the nats servers where subscription information can be obtained from. This will cause the node to periodically broadcast subscription data used to consistently hash & partition requests:

```javascript
const n1 = mesh(nats({
    server: 'nats://localhost:4222',
    monitorUrl: 'http://localhost:8222'
}));
```

## HTTP Support

Messages may also optionally be sent & received with an HTTP listener by wrapping the supplied backend:

```javascript
const {mesh, nats, http} from 'meshage';
const n1 = mesh(http(nats('nats://localhost:4222'), 8080));
n1.subject('something')
    .on(SomeMessage, (message: SomeMessage) => {
        return 'reply';
    });
```

### HTTP API

#### Send

Sends a message to be handled by a registered handler for the specified subject/message.

**Path** : `/api/:subject/:partitionKey?`

**Path params** :
- `subject` - The logical name for the message handler subject.
- `partitionKey` - _(Optional)_ Identifier used to consistently partition the request to known handlers.

**Query params**:
- `messageName` - _(Dependant)_ The name of message. If the `messageName` is not supplied via this param, then it must be provided in the message body as a top-level key called `name` - e.g. `{"name": "SomeMessage", ...}` 
- `wait` - _(Optional)_ Whether to wait for a reply or just fire the message.
- `timeout` - _(Optional)_ Time in milliseconds to wait for a reply.

**Example**:

*Request:*

```shell
curl -sX POST http://localhost:8080/api/some-subject/$RANDOM?messageName=echo \
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

Sends a message to all registered handlers for the specified subject/name pair.

**URL** : `/api/broadcast/:subject`

**Path params** :
- `subject` - The logical name for the message handler subject.

**Query params**:
- `messageName` - _(Dependant)_ The name of message. If the `messageName` is not supplied via this param, then it must be provided in the message body as a top-level key called `name` - e.g. `{"name": "SomeMessage", ...}` 
- `wait` - _(Optional)_ Whether to wait for a reply or just fire the message.
- `timeout` - _(Optional)_ Time in milliseconds to wait for replies. Replies not received before the timeout of omitted.

**Example** :

*Request:*

```shell
curl -sX POST http://localhost:8080/api/broadcast/some-subject?messageName=echo \
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

## License
[MIT](LICENSE.md)