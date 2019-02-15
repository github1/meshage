export interface Message {
  serviceId? : string;
  serviceAddress?: string;
  stream : string;
  partitionKey : string;
  data? : {};
}

export type MessageHandler = (message : Message) => {};
