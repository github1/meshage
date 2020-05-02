const {RSocketMessageListener, RSocketServiceInvoker} = require('./');
const {createTest} = require('../message-listener-test-helper');

createTest('RSocketMessageListener',
  port => new RSocketMessageListener(port), new RSocketServiceInvoker(),
  (router, message) =>
    router.router.send(message),
  (router, message) =>
    router.router.broadcast(message));
