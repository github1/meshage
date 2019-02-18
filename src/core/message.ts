export interface MessageHeader {
  serviceId? : string;
  stream : string;
  partitionKey : string;
}

export interface Message extends MessageHeader {
  // tslint:disable-next-line:no-any
  data: any;
}

// tslint:disable-next-line:no-any
export type MessageHandler = (data : any, header: MessageHeader) => {};
