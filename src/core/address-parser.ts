import os = require('os');

export class Address {
  constructor(public host : string, public port : number, public portString : string) {
  }
  public toString() : string {
    return `${this.host}:${this.port}`;
  }
}

export const parseAddress = (value : (string | number)) : Address => {
  let host : string = os.hostname();
  let portString : string = `${value}`;
  if (portString.indexOf(':') > -1) {
    host = portString.split(':')[0];
    portString = portString.split(':')[1];
  }
  const port : number = parseInt(portString, 10);
  return new Address(host, isNaN(port) ? 80 : port, portString);
};

export const parseAddresses = (value : (string | number)[]) : Address[] => {
  return value
    .filter((address: (string | number)) => `${address}`.trim().length > 0)
    .map(parseAddress);
};
