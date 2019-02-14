const prepareAddresses = require('./address-provider').prepareAddresses;
const http = require('http');

describe('address-provider', () => {
  it('parses and provides address', () => {
    expect.assertions(4);
    return prepareAddresses('localhost:8080', ['localhost:8181']).then((addresses) => {
      expect(addresses.nodeAddress.host).toBe('localhost');
      expect(addresses.nodeAddress.port).toBe(8080);
      expect(addresses.seedAddresses[0].host).toBe('localhost');
      expect(addresses.seedAddresses[0].port).toBe(8181);
    });
  });
  it('can find open ports', () => {
    expect.assertions(2);
    return prepareAddresses('localhost:find', []).then((addresses) => {
      expect(addresses.nodeAddress.host).toBe('localhost');
      expect(addresses.nodeAddress.port).toBeGreaterThan(1000);
    });
  });
  it('can try a port then find open ports', () => {
    expect.assertions(3);
    let server;
    return new Promise((resolve) => {
      getPort().then(foundPort => {
        server = http.createServer().listen(foundPort, () => {
          resolve(foundPort);
        });
      });
    }).then(foundPort => {
      return prepareAddresses(`localhost:${foundPort}/find`, [])
        .then((addresses) => {
          server.close();
          expect(addresses.nodeAddress.host).toBe('localhost');
          expect(addresses.nodeAddress.port).not.toEqual(foundPort);
          expect(addresses.nodeAddress.port).toBeGreaterThan(1000);
        });
    });
  });
});
