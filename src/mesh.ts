import {
  PSEUDO_MESSAGE_AFTER,
  PSEUDO_MESSAGE_BEFORE,
  PSEUDO_MESSAGE_NS,
  Subject,
  SubjectBase
} from './subject';
import {
  ConstructorOf,
  SubjectMessage,
  SubjectMessageEnvelope,
  SubjectMessageHandler,
  SubjectMessageHeader,
  SubjectMessageOptions
} from './messages';
import * as HashRing from 'hashring';
import * as LRUCache from 'lru-cache';
import * as debug from 'debug';
import {v4} from 'uuid';

const log : debug.Debugger = debug('meshage')
  .extend('mesh');

export type MeshState = 'running' | 'stopping' | 'stopped';

export interface Mesh {
  readonly status : MeshState;

  subject(name : string) : Subject;

  shutdown() : Promise<void>;
}

export interface MeshBackend {
  subscriptionIds : string[];

  // tslint:disable-next-line:no-any
  register(subject : string, name : string | ConstructorOf<any>, handler : SubjectMessageHandler<any>) : void;

  unregister(subject : string) : Promise<void>;

  isRegistered(subject : string) : Promise<void>;

  shutdown() : Promise<void>;

  // tslint:disable-next-line:no-any
  send<T>(subject : string,
          partitionKey : string,
          message : SubjectMessage,
          options : SubjectMessageOptions,
          broadcast : boolean) : Promise<T>;

}

export interface MeshErrorSerializedCause {
  message : string;
  stack : string;
}

export interface MeshErrorSerialized {
  ns : string;
  // tslint:disable-next-line:no-reserved-keywords
  type : string;
  cause? : MeshErrorSerializedCause;
}

// tslint:disable-next-line:no-unnecessary-class
export class MeshError {
  private static readonly MESH_ERROR_NAMESPACE : string = 'meshage.error';

  // tslint:disable-next-line:no-any
  readonly [key:string]: any;

  // tslint:disable-next-line:no-any
  public static IS_ERROR(value : any) : boolean {
    // tslint:disable-next-line:no-unsafe-any
    return value && value.ns && value.ns.startsWith(MeshError.MESH_ERROR_NAMESPACE);
  }

  public serialize() : MeshErrorSerialized {
    return {ns: MeshError.MESH_ERROR_NAMESPACE, type: this.constructor.name};
  }
}

// tslint:disable-next-line:no-unnecessary-class
export class MeshTimeoutError extends MeshError {
}

// tslint:disable-next-line:no-unnecessary-class
export class MeshRegistrationTimeoutError extends MeshError {
}

// tslint:disable-next-line:no-unnecessary-class
export class MeshDuplicateMessageError extends MeshError {
}

// tslint:disable-next-line:no-unnecessary-class
export class MeshInvocationError extends MeshError {
  constructor(public readonly cause : Error) {
    super();
  }

  public serialize() : MeshErrorSerialized {
    return {
      ...super.serialize(),
      cause: {message: this.cause.message, stack: this.cause.stack}
    };
  }
}

export function deserializeMeshError(value : MeshErrorSerialized) : MeshError {
  switch (value.type) {
    case 'MeshError':
      return new MeshError();
    case 'MeshTimeoutError':
      return new MeshTimeoutError();
    case 'MeshRegistrationTimeoutError':
      return new MeshRegistrationTimeoutError();
    case 'MeshDuplicateMessageError':
      return new MeshDuplicateMessageError();
    case 'MeshInvocationError':
      return new MeshInvocationError(value.cause as Error);
    default:
      return new MeshError();
  }
}

export class MeshBase implements Mesh {

  // tslint:disable-next-line:variable-name
  protected _status : MeshState = 'running';

  constructor(private readonly meshPrivate : MeshBackend) {
  }

  public get status() : MeshState {
    return this._status;
  }

  public subject(name : string) : Subject {
    return new SubjectBase(name, this.meshPrivate);
  }

  public async shutdown() : Promise<void> {
    this._status = 'stopping';
    await this.meshPrivate.shutdown();
    this._status = 'stopped';
  }

}

// tslint:disable-next-line:no-any
export type MessagePrivateBaseMessageHandler = (err : Error, message : SubjectMessageEnvelope) => Promise<any>;

// tslint:disable-next-line:no-any
export type MeshSubjectHandlers = { [subject : string] : { [name : string] : MeshSubjectHandlerRegistration } };

export interface MeshSubjectHandlerRegistration {
  subject : string;
  messageName : string;
  // tslint:disable-next-line:no-any
  handler : MessagePrivateBaseMessageHandler;
  registered : boolean;
}

export abstract class MeshBackendBase implements MeshBackend {

  protected readonly instanceId : string = v4();
  protected handlers : MeshSubjectHandlers = {};
  protected lruCache : LRUCache<string, void>;

  public abstract get subscriptionIds() : string[];

  protected get allHandlers() : MeshSubjectHandlerRegistration[] {
    return Object.keys(this.handlers)
      .reduce((meshSubjectHandlerRegistrations : MeshSubjectHandlerRegistration[], subject : string) => {
        return [...meshSubjectHandlerRegistrations,
          ...Object.keys(this.handlers[subject])
            .map((messageName : string) => this.handlers[subject][messageName])];
      }, []);
  }

  public async isRegistered(subject : string) : Promise<void> {
    let attempts = 300;
    const hasSubscription = () => this.allHandlers
      .filter((meshSubjectHandlerRegistration : MeshSubjectHandlerRegistration) => {
        return meshSubjectHandlerRegistration.subject === subject;
      })
      .reduce((isRegistered : boolean, meshSubjectHandlerRegistration : MeshSubjectHandlerRegistration) => {
        return meshSubjectHandlerRegistration.registered && isRegistered;
      }, true);
    while (attempts > 0 && !hasSubscription()) {
      if (hasSubscription()) {
        return;
      } else {
        attempts--;
        if (attempts === 0) {
          throw new MeshRegistrationTimeoutError();
        } else {
          await new Promise((resolve : () => void) => setTimeout(resolve, 100));
        }
      }
    }
  }

  // tslint:disable-next-line:no-any
  public register(subject : string, name : string | ConstructorOf<any>, handler : SubjectMessageHandler<any>) : void {
    this.handlers[subject] = this.handlers[subject] || {};
    const strName : string = typeof name === 'string' ? name : name.name;
    // tslint:disable-next-line:no-any
    const messagePrivateBaseMessageHandler : MessagePrivateBaseMessageHandler = async (err : Error, envelope : SubjectMessageEnvelope) => {
      if (err) {
        throw err;
      }
      return handler(envelope.message, envelope.header);
    };
    this.handlers[subject][strName] = {
      subject,
      messageName: strName,
      handler: messagePrivateBaseMessageHandler,
      registered: strName.startsWith(PSEUDO_MESSAGE_NS)
    };
    setTimeout(async () => this.doRegistrations(), 1);
  }

  // tslint:disable-next-line:no-any
  public async send<T>(subject : string,
                       partitionKey : string,
                       message : SubjectMessage,
                       options : SubjectMessageOptions,
                       broadcast : boolean) : Promise<T> {
    const messageHeader : SubjectMessageHeader = {
      uid: v4(),
      subject,
      // tslint:disable-next-line:no-unsafe-any
      name: message.name || message.constructor.name,
      partitionKey
    };
    const messageEnvelope : SubjectMessageEnvelope = {
      header: messageHeader,
      message
    };
    // tslint:disable-next-line:no-parameter-reassignment
    options = options || {};
    if (options.wait === undefined) {
      options.wait = true;
    }
    let responsePromise : Promise<T>;
    if (partitionKey && !broadcast) {
      const candidateSubscriptionIds : string[] = this.subscriptionIds
        .filter((subscriptionId : string) => {
          return subscriptionId.indexOf(`${subject}-${messageHeader.name}`) === 0;
        });
      if (candidateSubscriptionIds.length > 0) {
        const subscriptionId = new HashRing(candidateSubscriptionIds).get(partitionKey);
        if (subscriptionId.indexOf(this.instanceId) === -1) {
          // the subscriptionId here is the backends subscription id, not the logical subject name
          responsePromise = this.doSend(subscriptionId, messageEnvelope, options, false);
        } else {
          // the subscriptionId is local
          responsePromise = this.invokeHandler(messageEnvelope);
        }
      }
    } else {
      responsePromise = this.doSend(undefined, messageEnvelope, options, broadcast);
    }
    // tslint:disable-next-line:typedef
    return new Promise(async (resolve, reject) => {
      let responseTimeout : NodeJS.Timer;
      if (!broadcast && options.wait && options.timeout > 0) {
        responseTimeout = setTimeout(() => {
          reject(new MeshTimeoutError());
        }, options.timeout);
      }
      responsePromise
        .then((response : T) => {
          if (responseTimeout) {
            clearTimeout(responseTimeout);
          }
          if (broadcast) {
            // tslint:disable-next-line:no-any
            const multiResponse : T[] = response as any as T[] || [];
            // tslint:disable-next-line:no-any
            resolve(multiResponse.map((item: any) => {
              // tslint:disable-next-line:no-unsafe-any
              return MeshError.IS_ERROR(item) ? deserializeMeshError(item) : item;
              // tslint:disable-next-line:no-any
            }) as any as T);
          } else {
            if (MeshError.IS_ERROR(response)) {
              // tslint:disable-next-line:no-any
              reject(deserializeMeshError(response as any));
            } else {
              resolve(response);
            }
          }
        })
        .catch((err : Error) => {
          if (responseTimeout) {
            clearTimeout(responseTimeout);
          }
          reject(err);
        });
    });
  }

  public abstract shutdown() : Promise<void>;

  public abstract unregister(subject : string) : Promise<void>;

  protected abstract doSend<T>(address : string,
                               envelope : SubjectMessageEnvelope,
                               options : SubjectMessageOptions,
                               // tslint:disable-next-line:no-any
                               broadcast : boolean) : Promise<T>;

  protected abstract doRegistrations() : Promise<void>;

  // tslint:disable-next-line:no-any
  protected async invokeHandler<T>(message : SubjectMessageEnvelope,
                                   callback? : (err? : MeshError, result? : T) => void) : Promise<T> {
    const localLog : debug.Debugger = log.extend(`MeshBackendBase.handler.${message.header.subject}.${message.header.name}`);
    if (!this.lruCache) {
      this.lruCache = new LRUCache({
        max: 1000,
        maxAge: 1000 * 60 * 3
      });
    }
    if (this.lruCache.has(message.header.uid)) {
      localLog('Received duplicate message %o', message.header);
      if (callback) {
        callback(new MeshDuplicateMessageError(), undefined);
        return undefined;
      } else {
        throw new MeshDuplicateMessageError();
      }
    } else {
      this.lruCache.set(message.header.uid, undefined);
      let response : T;
      let error : MeshInvocationError;
      try {
        // tslint:disable-next-line:no-any
        if (this.handlers[message.header.subject][PSEUDO_MESSAGE_BEFORE]) {
          // tslint:disable-next-line:no-unsafe-any
          response = await this.handlers[message.header.subject][PSEUDO_MESSAGE_BEFORE].handler(undefined, message);
        }
        if (response === undefined) {
          // tslint:disable-next-line:no-unsafe-any
          response = await this.handlers[message.header.subject][message.header.name].handler(undefined, message);
        }
      } catch (err) {
        localLog(`Error invoking handler - %o`, message, err);
        error = new MeshInvocationError(err as Error);
        if (!callback) {
          throw error;
        }
      } finally {
        if (this.handlers[message.header.subject] && this.handlers[message.header.subject][PSEUDO_MESSAGE_AFTER]) {
          // tslint:disable-next-line:no-unsafe-any
          await this.handlers[message.header.subject][PSEUDO_MESSAGE_AFTER].handler(undefined, message);
        }
      }
      if (callback) {
        callback(error, response);
      }
      return response;
    }
  }
}

export interface MeshBackendProvision {
  backend : MeshBackend;

  callback?(mesh : Mesh);
}

export type MeshBackendProvided = MeshBackend | MeshBackendProvision;

export type MeshBackendProvider = () => MeshBackendProvided;

export function toMeshBackendProvision(provided : MeshBackendProvided) : MeshBackendProvision {
  let provision : MeshBackendProvision;
  // tslint:disable-next-line:no-any
  if ((provided as any).backend) {
    provision = provided as MeshBackendProvision;
  } else {
    provision = {
      backend: provided as MeshBackend
    };
  }
  return provision;
}

export function mesh(meshBackendProvider : MeshBackendProvider) : Mesh {
  const provision : MeshBackendProvision = toMeshBackendProvision(meshBackendProvider());
  const mesh : Mesh = new MeshBase(provision.backend);
  if (provision.callback) {
    provision.callback(mesh);
  }
  return mesh;
}
