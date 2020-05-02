const {DnodeMessageListener, DnodeServiceInvoker} = require('./');
const {createTest} = require('../message-listener-test-helper');

createTest('DnodeMessageListener',
  port => new DnodeMessageListener(port), new DnodeServiceInvoker(),
  (router, message) =>
    router.router.send(message),
  (router, message) =>
    router.router.broadcast(message));
