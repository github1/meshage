const { DnodeServiceInvoker } = require('./dnode-service-invoker');

describe('DnodeServiceInvoker', () => {
  describe('handles', () => {
    it('returns true for dnode endpoints', () => {
      expect(new DnodeServiceInvoker().handles({
        stream: 'some-stream',
        endpoints: [{
          endpointType: 'dnode',
          description: ''
        }]
      })).toBe(true);
    });
    it('returns false for non-dnode endpoints', () => {
      expect(new DnodeServiceInvoker().handles({
        stream: 'some-stream',
        endpoints: [{
          endpointType: 'http',
          description: ''
        }]
      })).toBe(false);
    });
    it('returns false for empty endpoints', () => {
      expect(new DnodeServiceInvoker().handles({
        stream: 'some-stream',
        endpoints: []
      })).toBe(false);
    });
  });
});
