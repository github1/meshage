const { DnodeMessageListener } = require('./dnode-message-listener');
const { DnodeServiceInvoker } = require('./dnode-service-invoker');
const {createTest} = require('../message-listener-test-helper');

createTest('DnodeMessageListener',
  port => new DnodeMessageListener(port), new DnodeServiceInvoker(),
  (router, message) =>
    router.router.send(message),
  (router, message) =>
    router.router.broadcast(message));
