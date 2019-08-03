declare module '@github1/grapevine' {
  export class Gossiper {
    public on : Function;
    public start : Function;
    public stop : Function;
    public setLocalState : Function;
    public livePeers : () => string[];
    public peerValue : (peer : string, key : string) => string | {};
    public my_state : {max_version_seen : number};

    constructor(options : any);
  }
  export class ServerAdapter {
    constructor(options : any);

    public listen(port : number, address : string);
  }
  export class SocketAdapter {
    constructor(options : any);

    public connect(port : number, address : string);
  }
}
declare module 'hashring' {
  class HashRing {
    constructor(values : string[]);

    // tslint:disable-next-line
    get(key : string) : string;
  }
  export = HashRing;
}

