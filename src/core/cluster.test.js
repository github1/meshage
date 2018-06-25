const cluster = require('./cluster');

describe('cluster', () => {
  let svcs;
  beforeEach(() => {
    svcs = [{
      id: 'svc-1',
      stream: 'a'
    }, {
      id: 'svc-2',
      stream: 'b'
    }];
  });
  describe('composeSelect', () => {
    it('selects ClusterService with matching stream', () => {
      const selection = cluster.composeSelect(
        cluster.selectByStream('a'),
        cluster.selectByHashRing('someKey'))(svcs);
      expect(selection[0].id).toBe('svc-1');
    });
  });
  describe('selectByStream', () => {
    it('selects ClusterService with matching stream', () => {
      expect(cluster.selectByStream('a')(svcs)[0].id).toBe('svc-1');
      expect(cluster.selectByStream('b')(svcs)[0].id).toBe('svc-2');
    });
  });
  describe('selectByHashRing', () => {
    it('consistently returns a ClusterService instance', () => {
      const selection = cluster.selectByHashRing('someKey')(svcs)[0];
      expect(selection.id).toBe('svc-1');
    });
  });
});
