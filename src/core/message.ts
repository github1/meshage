export interface Message {
  serviceId? : string;
  stream : string;
  partitionKey : string;
  data? : {};
}

export type MessageHandler = (message : Message) => {};
