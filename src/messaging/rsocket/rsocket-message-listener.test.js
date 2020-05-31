const {rsocketMessaging} = require('./');
const {createTest} = require('../message-listener-test-helper');

createTest('RSocketMessageListener',
  port => rsocketMessaging(port),
  (router, message) =>
    router.router.send(message),
  (router, message) =>
    router.router.broadcast(message));
