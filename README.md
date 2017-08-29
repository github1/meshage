# meshage

Sharded peer based message routing for distributed services

## Install

```shell
npm install meshage --save
```

## Usage

```javascript
const meshage = require('meshage');

new meshage.router.MessageRouter(
    8080,
    new meshage.cluster.GossiperCluster(9742, new meshage.cluster.StaticSeedProvider([]))
).start((err, router) => {
    router.register('customers', (command) => {
        return { echo: { command } };
    });
});
```