import {
  MeshBackendBase,
  MeshBackendProvider,
  SubjectMessageEnvelope,
  SubjectMessageOptions
} from '../';
import * as EventEmitter from 'events';
import {v4} from 'uuid';

const eventEmitter : EventEmitter = new EventEmitter();

interface EventData {
  replySubject : string;
  payload : SubjectMessageEnvelope;
}

export function fake() : MeshBackendProvider {
  return () => new FakeBackend();
}

const instanceSubscriptionIds : { [key : string] : string[] } = {};
const instances : { [key : string] : FakeBackend[] } = {};

export function shutdownAll() {
  return instances[process.env.JEST_WORKER_ID].forEach(async (instance : FakeBackend) => {
    await instance.shutdown();
  });
}

class FakeBackend extends MeshBackendBase {

  constructor() {
    super();
    instances[process.env.JEST_WORKER_ID] = instances[process.env.JEST_WORKER_ID] || [];
    instances[process.env.JEST_WORKER_ID].push(this);
  }

  public get subscriptionIds() : string[] {
    return instanceSubscriptionIds[process.env.JEST_WORKER_ID];
  }

  public async shutdown() : Promise<void> {
    instanceSubscriptionIds[process.env.JEST_WORKER_ID] = instanceSubscriptionIds[process.env.JEST_WORKER_ID]
      .filter((sub : string) => sub.indexOf(this.instanceId) < 0);
    instances[process.env.JEST_WORKER_ID] = instances[process.env.JEST_WORKER_ID]
      .filter((instance : FakeBackend) => instance !== this);
    this.handlers = {};
    eventEmitter
      .eventNames()
      .forEach((eventName : string) => {
        eventEmitter
          .listeners(eventName)
          // tslint:disable-next-line:no-any
          .filter((listener : any) => listener.owner === this)
          // tslint:disable-next-line:no-any
          .forEach((listener : any) => eventEmitter.removeListener(eventName, listener));
      });
    return Promise.resolve();
  }

  public unregister(subject : string) : Promise<void> {
    instanceSubscriptionIds[process.env.JEST_WORKER_ID] = instanceSubscriptionIds[process.env.JEST_WORKER_ID]
      .filter((sub : string) => sub.startsWith(`${subject}-`) && sub.indexOf(this.instanceId) > -1);
    eventEmitter
      .eventNames()
      .filter((eventName : string) => eventName.startsWith(`${subject}-`))
      .forEach((eventName : string) => {
        eventEmitter
          .listeners(eventName)
          // tslint:disable-next-line:no-any
          .filter((listener : any) => listener.owner === this)
          // tslint:disable-next-line:no-any
          .forEach((listener : any) => eventEmitter.removeListener(eventName, listener));
      });
    // tslint:disable-next-line:no-dynamic-delete
    delete this.handlers[subject];
    return Promise.resolve(undefined);
  }

  protected doRegistrations() : Promise<void> {
    Object.keys(this.handlers)
      .forEach((subject : string) => {
        Object.keys(this.handlers[subject])
          .forEach((name : string) => {
            this.handlers[subject][name].registered = true;
            const eventListener = async (data : EventData) => {
              const result = await this.invokeHandler(data.payload);
              //console.log(data.replySubject);
              if (data.replySubject) {
                eventEmitter.emit(data.replySubject, result);
              }
            };
            eventListener.owner = this;
            // tslint:disable-next-line:no-any
            eventEmitter.on(`${subject}-${name}`, eventListener);
            eventEmitter.on(`${subject}-${name}-${this.instanceId}`, eventListener);
            instanceSubscriptionIds[process.env.JEST_WORKER_ID] = instanceSubscriptionIds[process.env.JEST_WORKER_ID] || [];
            instanceSubscriptionIds[process.env.JEST_WORKER_ID].push(`${subject}-${name}-${this.instanceId}`);
          });
      });
    return Promise.resolve();
  }

  protected doSend(address : string,
                   envelope : SubjectMessageEnvelope,
                   options : SubjectMessageOptions,
                   // tslint:disable-next-line:no-any
                   broadcast : boolean) : Promise<any> {
    const replySubject : string = v4();
    const eventData : EventData = {
      replySubject,
      payload: envelope
    };
    let resPromise;
    let eventName = address;
    if (!eventName) {
      if (broadcast) {
        eventName = `${envelope.header.subject}-${envelope.message.name}`;
      } else {
        const subIdsForSub = instanceSubscriptionIds[process.env.JEST_WORKER_ID]
          .filter((sub : string) => {
            return sub.startsWith(`${envelope.header.subject}-${envelope.message.name}`);
          });
        eventName = subIdsForSub[Math.floor(Math.random() * subIdsForSub.length)];
      }
    }
    if (options.wait) {
      if (broadcast) {
        const responses = [];
        // simulate nats here collect array of responses with timeout
        // tslint:disable-next-line:typedef no-any
        resPromise = new Promise<any[]>((resolve) => {
          setTimeout(() => {
            resolve(responses);
          }, options.timeout || 100);
          // tslint:disable-next-line:typedef
          eventEmitter.on(eventData.replySubject, (data) => {
            responses.push(data);
          });
        });
      } else {
        // tslint:disable-next-line:typedef
        resPromise = new Promise((resolve) => {
          // tslint:disable-next-line:typedef
          eventEmitter.once(eventData.replySubject, (data) => {
            resolve(data);
          });
        });
      }
    } else {
      resPromise = Promise.resolve();
    }
    eventEmitter.emit(eventName, eventData);
    return resPromise;
  }

}