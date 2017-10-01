declare module 'grapevine' {
  export class Gossiper {
    public on : Function;
    public start : Function;
    public stop : Function;
    public setLocalState : Function;
    public livePeers : () => string[];
    public peerValue : (peer : string, key : string) => string | {};

    constructor(options : any);
  }
}
declare class HashRing {
  constructor(values : string[]);

  // tslint:disable-next-line
  get(key : string) : string;
}
declare module HashRing {
}
declare module 'hashring' {
  export = HashRing;
}

