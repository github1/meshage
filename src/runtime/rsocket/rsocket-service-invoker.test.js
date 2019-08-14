const RSocketServiceInvoker = require('./rsocket-service-invoker').RSocketServiceInvoker;

describe('RSocketServiceInvoker', () => {
  describe('handles', () => {
    it('returns true for rsocket endpoints', () => {
      expect(new RSocketServiceInvoker().handles({
        stream: 'some-stream',
        endpoints: [{
          endpointType: 'rsocket',
          description: ''
        }]
      })).toBe(true);
    });
    it('returns false for non-rsocket endpoints', () => {
      expect(new RSocketServiceInvoker().handles({
        stream: 'some-stream',
        endpoints: [{
          endpointType: 'http',
          description: ''
        }]
      })).toBe(false);
    });
    it('returns false for empty endpoints', () => {
      expect(new RSocketServiceInvoker().handles({
        stream: 'some-stream',
        endpoints: []
      })).toBe(false);
    });
  });
});
