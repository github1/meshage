const {DefaultMessageRouter, FakeCluster} = require('../core');

exports.createTest = (name,
                      messaging,
                      send,
                      broadcast,
                      moreTest) => {
  describe(name, () => {
    const routers = {};
    const cluster = new FakeCluster();
    beforeAll(async () => {
      for (const routerName of ['router-a', 'router-b']) {
        const port = await getPort();
        const messagingConfig = messaging(port);
        const router = await new DefaultMessageRouter(
          cluster,
          messagingConfig)
          .start();
        routers[routerName] = {port, messagingConfig, router};
        await router.register({
          stream: 'some-stream',
          messageHandler: (data, header) => {
            return {message: `hello from ${routerName}`, header};
          }
        });
      }
    });
    afterAll(() => {
      Object.keys(routers).forEach(routerName => {
        routers[routerName].messagingConfig.stop();
      });
    });
    it('invokes services', async () => {
      const routersCalled = [];
      let attempts = 100;
      while ((!routersCalled.includes('router-a') || !routersCalled.includes('router-b')) && attempts > 0) {
        const key = Math.floor(Math.random() * 1000000);
        const input = {
          stream: 'some-stream',
          partitionKey: `${key}`,
          data: 'hello'
        };
        const res = await send(routers['router-a'], input);
        expect(res.message).toMatch(/hello from router-[a-z]/);
        routersCalled.push(res.message.substring('hello from '.length).trim());
        expect(res.header.partitionKey).toBe(`${key}`);
        expect(res.header.stream).toBe('some-stream');
        attempts--;
      }
    });
    it('broadcasts requests', async () => {
      expect.assertions(6);
      const res = await broadcast(routers['router-a'], {
        stream: 'some-stream',
        partitionKey: '1234',
        data: 'hello'
      });
      expect(Array.isArray(res)).toBe(true);
      expect(res[0].message).toMatch(/hello from router-[a-z]/);
      expect(res[1].message).toMatch(/hello from router-[a-z]/);
      const allBodies = res.map(body => body.message).join(',');
      expect(allBodies).toContain('router-a');
      expect(allBodies).toContain('router-b');
      expect(res[0].message).not.toEqual(res[1].message);
    });
    if (moreTest) {
      moreTest(routers);
    }
  });
};
