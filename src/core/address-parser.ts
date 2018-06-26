export class Address {
  constructor(public host : string, public port : number) {
  }
  public toString() : string {
    return `${this.host}:${this.port}`;
  }
}

export const parseAddress = (value : (string | number)) : Address => {
  let host : string = '127.0.0.1';
  let portString : string = `${value}`;
  if (portString.indexOf(':') > -1) {
    host = portString.split(':')[0];
    portString = portString.split(':')[1];
  }
  const port : number = parseInt(portString, 10);
  return new Address(host, port);
};
