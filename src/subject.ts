import {
  ConstructorOf,
  SubjectMessage,
  SubjectMessageOptions,
  SubjectMessageHandler
} from './messages';
import { MeshBackend } from './mesh';

export interface Subject {

  /**
   * Registers a handler.
   */
  on<T>(name : (string | ConstructorOf<T>), handler : SubjectMessageHandler<T>) : Subject;

  /**
   * Sends a message to all handlers.
   */
  broadcast<T>(message : SubjectMessage, options?: SubjectMessageOptions) : Promise<T[]>;

  /**
   * Sends a message to be processed by any one handler.
   */
  // tslint:disable-next-line:no-any
  send<T>(message : any, options?: SubjectMessageOptions) : Promise<T>;

  /**
   * Sends a message consistently to a handler based on the partitionKey.
   */
  send<T>(partitionKey : string, message : SubjectMessage, options?: SubjectMessageOptions) : Promise<T>;

  /**
   * Awaits all registrations to complete.
   */
  awaitRegistration() : Promise<void>;

  /**
   * Unregisters all handlers.
   */
  unbind() : Promise<void>;
}

export class SubjectBase implements Subject {
  constructor(private readonly subjectName : string,
              private readonly meshPrivate : MeshBackend) {
  }

  public before<T>(handler : SubjectMessageHandler<T>) : Subject {
    this.meshPrivate.register(this.subjectName, '::before', handler);
    return this;
  }

  public on<T>(name : string | ConstructorOf<T>, handler : SubjectMessageHandler<T>) : Subject {
    this.meshPrivate.register(this.subjectName, name, handler);
    return this;
  }

  public after<T>(handler : SubjectMessageHandler<T>) : Subject {
    this.meshPrivate.register(this.subjectName, '::after', handler);
    return this;
  }

  public async broadcast<T>(message : SubjectMessage, options?: SubjectMessageOptions) : Promise<T[]> {
    return this.meshPrivate.send(this.subjectName, undefined, message, options, true);
  }

  public async send<T>(message : SubjectMessage, options?: SubjectMessageOptions) : Promise<T>;
  public async send<T>(partitionKey : string, message : SubjectMessage, options?: SubjectMessageOptions) : Promise<T>;
  public async send<T>(messageOrPartitionKey : SubjectMessage | string,
                       messageOrOptions? : SubjectMessage | SubjectMessageOptions,
                       options? : SubjectMessageOptions) : Promise<T> {
    let partitionKey : string;
    let message : SubjectMessage;
    let optionsToSend = options;
    if (typeof messageOrPartitionKey === 'string') {
      partitionKey = messageOrPartitionKey;
      message = messageOrOptions as SubjectMessage;
      optionsToSend = options;
      // return this.meshPrivate
      //   .send(this.subjectName, messageOrPartitionKey, messageOrOptions as SubjectMessage, options, false);
    } else {
      message = messageOrPartitionKey;
      optionsToSend = messageOrOptions as SubjectMessageOptions;
    }
    if (!message.name) {
      message.name = message.constructor.name;
    }
    return this.meshPrivate
      .send(this.subjectName, partitionKey, message, optionsToSend, false);
  }

  public async awaitRegistration() : Promise<void> {
    return this.meshPrivate.isRegistered(this.subjectName);
  }

  public async unbind() : Promise<void> {
    return this.meshPrivate.unregister(this.subjectName);
  }
}
