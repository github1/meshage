// tslint:disable-next-line:no-any
export type ConstructorOf<T> = new (...args: any[]) => T;

export interface HttpMessageHeader {
  headers : { [key : string] : string | string[] | undefined };
  url : string;
  publicUrl : string;
  params : { [key : string] : string };
  query : { [key : string] : string };
}

// tslint:disable-next-line:no-any
export interface SubjectMessage {
  // tslint:disable-next-line:no-any
  [key:string]: any;
}

export interface SubjectMessageOptions {
  timeout?: number;
  wait?: boolean;
  keepSignals?: boolean;
  // tslint:disable-next-line:no-any
  additionalHeaderData?: any;
}

export interface SubjectMessageHeader {
  uid: string;
  subject: string;
  name: string;
  partitionKey?: string;
  http?: HttpMessageHeader;
}

export interface SubjectMessageEnvelope {
  header: SubjectMessageHeader;
  message : SubjectMessage;
}

// tslint:disable-next-line:no-any
export type SubjectMessageHandler<T> = (data? : T, header? : SubjectMessageHeader) => any;
