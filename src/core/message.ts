export interface MessageHeader {
  readonly serviceId? : string;
  readonly stream : string;
  readonly partitionKey : string;
}

export interface Message extends MessageHeader {
  // tslint:disable-next-line:no-any
  data: any;
}

// tslint:disable-next-line:no-any
export type MessageHandler = (data : any, header: MessageHeader) => any;
