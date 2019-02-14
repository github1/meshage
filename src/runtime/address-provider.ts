import {Address, parseAddress, parseAddresses} from '../core/address-parser';
// tslint:disable-next-line:no-var-requires
const findPort = require('get-port');

export interface Addresses {
  nodeAddress : Address;
  seedAddresses : Address[];
}

export const prepareAddresses = (address : (string | number), seeds : (string | number)[] = []) : Promise<Addresses> => {
  const nodeAddress : Address = parseAddress(address);
  let promi : Promise<Address> = Promise.resolve(nodeAddress);
  if (/find$/.test(nodeAddress.portString)) {
    const defaultPort : number = parseInt(nodeAddress.portString.replace(/[^0-9]/i, ''), 10);
    // tslint:disable-next-line:no-unsafe-any
    promi = findPort({port: defaultPort})
      .then((foundPort: number) => {
        return new Address(nodeAddress.host, foundPort, `${foundPort}`);
      });
  }
  return promi.then((value : Address) => {
    return {
      nodeAddress: value,
      seedAddresses: parseAddresses(seeds)
        .filter((address: Address) => address.toString() !== value.toString())
    };
  });
};
