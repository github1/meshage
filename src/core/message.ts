export interface Message {
  serviceId? : string;
  stream : string;
  partitionKey : string;
}

export type MessageHandler = (message : Message) => {};
