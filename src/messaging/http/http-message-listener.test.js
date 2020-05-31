const {httpMessaging} = require('./');
const {promisify} = require('util');
const {get, post} = require('superagent');
const getP = promisify(get);
const postP = promisify(post);
const {createTest} = require('../message-listener-test-helper');

createTest('HttpMessageListener',
  port => httpMessaging(`localhost:${port}`),
  async (router, message) =>
    (await postP(`http://localhost:${router.port}/api/${message.stream}/${message.partitionKey}`)).body,
  async (router, message) =>
    (await postP(`http://localhost:${router.port}/api/broadcast/${message.stream}/${message.partitionKey}`)).body,
  (routers) => {
    it('lists services', async () => {
      const res = await getP(`http://localhost:${routers['router-a'].port}/api/services`);
      expect(res.body.length).toBe(2);
      expect(res.body[0].stream).toBe('some-stream');
    });
  });
