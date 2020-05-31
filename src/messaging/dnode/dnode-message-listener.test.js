const {dnodeMessaging} = require('./');
const {createTest} = require('../message-listener-test-helper');

createTest('DnodeMessageListener',
  port => dnodeMessaging(port),
  (router, message) =>
    router.router.send(message),
  (router, message) =>
    router.router.broadcast(message));
