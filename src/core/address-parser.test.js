const parseAddress = require('./address-parser').parseAddress;

describe('parseAddress', () => {
  it('splits the host and port into an address object', () => {
    expect(parseAddress('foo:80').host).toBe('foo');
    expect(parseAddress('foo:80').port).toBe(80);
  });
  it('defaults the host to 127.0.0.1', () => {
    expect(parseAddress('80').host).toBe('127.0.0.1');
    expect(parseAddress('80').port).toBe(80);
  });
  it('takes a numeric port', () => {
    expect(parseAddress(80).host).toBe('127.0.0.1');
    expect(parseAddress(80).port).toBe(80);
  });
  it('can be printed as a sring', () => {
    expect(parseAddress('foo:80').toString()).toBe('foo:80');
  });
});
