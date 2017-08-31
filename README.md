# meshage

Sharded peer based message routing for distributed services

## Install

```shell
npm install meshage --save
```

## Usage

```javascript
const meshage = require('meshage');

new meshage.MessageRouter(
    8080,
    new meshage.GossiperCluster(9742, new meshage.StaticSeedProvider([]))
).start((err, router) => {
    router.register('customers', (command) => {
        return { echo: { command } };
    });
});
```