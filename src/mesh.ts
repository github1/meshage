import {
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
  status : MeshState;

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

// tslint:disable-next-line:no-unnecessary-class
export class MeshTimeoutError {
}

// tslint:disable-next-line:no-unnecessary-class
export class MeshRegistrationTimeoutError {
}

// tslint:disable-next-line:no-unnecessary-class
export class MeshInvocationError {
  constructor(public readonly cause : Error) {
  }
}

const meshes : MeshBase[] = [];

export class MeshBase implements Mesh {

  // tslint:disable-next-line:variable-name
  protected _status : MeshState = 'running';

  constructor(private readonly meshPrivate : MeshBackend) {
    meshes.push(this);
  }

  public static async shutdownAll() {
    for (const mesh of meshes) {
      await mesh.shutdown();
    }
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
        return meshSubjectHandlerRegistration.subject === subject && meshSubjectHandlerRegistration.registered;
      }).length > 0;
    while (attempts > 0 && !hasSubscription()) {
      if (hasSubscription()) {
        return;
      } else {
        attempts--;
        if (attempts === 0) {
          throw new MeshRegistrationTimeoutError();
        } else {
          // tslint:disable-next-line:typedef
          await new Promise((resolve) => setTimeout(resolve, 100));
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
      const localLog : debug.Debugger = log.extend(`MeshPrivateBase.handler.${{
        subject,
        messageName: strName,
        handler: messagePrivateBaseMessageHandler,
        registered: false
      }.subject}.${{
        subject,
        messageName: strName,
        handler: messagePrivateBaseMessageHandler,
        registered: false
      }.messageName}`);
      if (!this.lruCache) {
        this.lruCache = new LRUCache({
          max: 1000,
          maxAge: 1000 * 60 * 3
        });
      }
      if (this.lruCache.has(envelope.header.uid)) {
        localLog('Received duplicate message %o', envelope.header);
        return;
      }
      this.lruCache.set(envelope.header.uid, undefined);
      return handler(envelope.message, envelope.header);
    };
    this.handlers[subject][strName] = {
      subject,
      messageName: strName,
      handler: messagePrivateBaseMessageHandler,
      registered: false
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
          return subscriptionId.indexOf(`${subject}-${message.name}`) === 0;
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
        responseTimeout = setTimeout(() => { reject(new MeshTimeoutError()); }, options.timeout);
      }
      // tslint:disable-next-line:no-any no-unsafe-any
      const response : T = await responsePromise;
      if (responseTimeout) {
        clearTimeout(responseTimeout);
      }
      resolve(response);
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
  protected async invokeHandler<T>(message : SubjectMessageEnvelope) : Promise<T> {
    const localLog : debug.Debugger = log.extend(`MeshBackendBase.handler.${message.header.subject}.${message.message.name}`);
    try {
      // tslint:disable-next-line:no-any
      let response : T;
      try {
        if (this.handlers[message.header.subject]['::before']) {
          // tslint:disable-next-line:no-unsafe-any
          response = await this.handlers[message.header.subject]['::before'].handler(undefined, message);
        }
        if (response === undefined) {
          // tslint:disable-next-line:no-unsafe-any
          response = await this.handlers[message.header.subject][message.message.name].handler(undefined, message);
        }
        return response;
      } finally {
        if (this.handlers[message.header.subject]['::after']) {
          // tslint:disable-next-line:no-unsafe-any
          await this.handlers[message.header.subject]['::after'].handler(undefined, message);
        }
      }
    } catch (err) {
      localLog(`Error invoking handler - %o`, message, err);
      throw new MeshInvocationError(err as Error);
    }
  }
}

export interface MeshBackendProvision {
  backend : MeshBackend;

  callback?(mesh : Mesh);
}

export type MeshBackendProvided = MeshBackend | MeshBackendProvision;

export type MeshBackendProvider = () => MeshBackendProvided;

export function toMeshBackendProvision(provided : MeshBackendProvided): MeshBackendProvision {
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
