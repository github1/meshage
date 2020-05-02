const {ServiceRouter, AbstractServiceInvoker} = require('./service-router');

describe('ServiceRouter', () => {
  let svcs;
  let clusterMembership;
  let serviceInvoker;
  let router;
  beforeEach(() => {
    svcs = [{
      id: 'svc-1',
      stream: 'stream-a',
      endpoints: [{}]
    }, {
      id: 'svc-2',
      stream: 'stream-a',
      endpoints: [{}]
    }, {
      id: 'svc-3',
      stream: 'stream-b',
      endpoints: [{}]
    }];
    clusterMembership = {
      services(filter) {
        return Promise.resolve(filter(svcs));
      },
      registerService: jest.fn(() => Promise.resolve()),
      unregisterService: jest.fn(() => Promise.resolve())
    };
    serviceInvoker = {
      invoke: jest.fn((message, service) => Promise.resolve(service.id))
    };
    router = new ServiceRouter(clusterMembership, serviceInvoker);
  });
  describe('message sending', () => {
    it('sends using a hash ring', () => {
      return router.send({stream: 'stream-a', partitionKey: '123'})
        .then(() => {
          expect(serviceInvoker.invoke).toHaveBeenCalled();
          expect(serviceInvoker.invoke.mock.calls[0][0].stream).toBe('stream-a');
          expect(serviceInvoker.invoke.mock.calls[0][0].partitionKey).toBe('123');
          expect(serviceInvoker.invoke.mock.calls[0][1].id).toBe('svc-1');
        });
    });
    it('broadcasts to all services', () => {
      return router.broadcast({stream: 'stream-a', partitionKey: '123'})
        .then(() => {
          expect(serviceInvoker.invoke).toHaveBeenCalled();
          expect(serviceInvoker.invoke.mock.calls.length).toBe(2);
          expect(serviceInvoker.invoke.mock.calls[0][1].id).toBe('svc-1');
          expect(serviceInvoker.invoke.mock.calls[1][1].id).toBe('svc-2');
        });
    });
    it('returns an error if no matching services are found', () => {
      return router.send({
        stream: 'non-existent',
        partitionKey: '123'
      }).catch((err) => {
        expect(serviceInvoker.invoke).not.toHaveBeenCalled();
        expect(err.message).toBe('No matching services found for \'non-existent\'');
      });
    });
    describe('when a service is registered on the current process', () => {
      let registeredServiceMessageHandler = jest.fn(() => Promise.resolve());
      beforeEach(() => {
        return router.register({
            id: '12345',
            stream: 'test-stream',
            messageHandler: registeredServiceMessageHandler }).then(() => {
          svcs.push({
            id: '12345',
            stream: 'test-stream',
            endpoints: [{}]
          });
        });
      });
      it('invokes the message handler', () => {
        return router.send({
          stream: 'test-stream',
          partitionKey: '123'
        }).then(() => {
          expect(serviceInvoker.invoke).not.toHaveBeenCalled();
          expect(registeredServiceMessageHandler).toHaveBeenCalled();
          expect(registeredServiceMessageHandler.mock.calls[0][1].stream).toBe('test-stream');
          expect(registeredServiceMessageHandler.mock.calls[0][1].partitionKey).toBe('123');
        });
      });
    });
  });
  describe('service registration', () => {
    beforeEach(() => {
      router.register({ id: '12345', stream: 'test-stream', messageHandler: (message) => {}});
    });
    it('registers services to the cluster', () => {
      expect(clusterMembership.registerService).toHaveBeenCalled();
      expect(clusterMembership.registerService.mock.calls[0][0].id).toMatch(/[0-9a-z\-]+/i);
      expect(clusterMembership.registerService.mock.calls[0][0].stream).toBe('test-stream');
    });
    it('can unregister services', () => {
      router.unregister('test-stream');
      expect(clusterMembership.unregisterService).toHaveBeenCalled();
      expect(clusterMembership.unregisterService.mock.calls[0][0]).toMatch(/[0-9a-z\-]+/i);
    });
  });
  describe('abstract service invoker', () => {
    it('does not implement doSend', async () => {
      expect.assertions(1);
      try {
        await new AbstractServiceInvoker('foo').doSend()
      } catch (err) {
        expect(err.message).toMatch(/Not implemented/);
      }
    });
  });
});
