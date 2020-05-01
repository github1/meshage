const CompositeServiceInvoker = require('./composite-service-invoker').CompositeServiceInvoker;

describe('CompositeServiceInvoker', () => {
  it('uses the first eligible service invoker', () => {
    const serviceInvokerA = createFakeServiceInvoker(false);
    const serviceInvokerB = createFakeServiceInvoker(true);
    const compositeServiceInvoker = new CompositeServiceInvoker(serviceInvokerA, serviceInvokerB);
    return compositeServiceInvoker.invoke({
      stream: 'some-stream',
      partitionKey: '1234'
    }, {
      stream: 'some-stream',
      endpoints: []
    }).then(() => {
      expect(serviceInvokerB.invoke).toHaveBeenCalled();
    });
  });
});

const createFakeServiceInvoker = (handles) => {
  return {
    handles: () => handles,
    invoke: jest.fn(() => Promise.resolve())
  }
};
