import {
  Client,
  connect,
  Msg,
  MsgCallback,
  NatsError,
  Subscription,
  SubscriptionOptions
} from 'ts-nats';
import * as debug from 'debug';
import {v4} from 'uuid';
import {
  Mesh,
  MeshBackendBase,
  MeshBackendProvider,
  MeshError,
  MeshSubjectHandlerRegistration,
  SubjectMessageEnvelope,
  SubjectMessageOptions
} from '../../';
import fetch, {Response} from 'node-fetch';

const log : debug.Debugger = debug('meshage')
  .extend('nats');

const SUBJECT_NATS_MONITOR = '::nats-monitor';
const SUBJECT_NATS_MONITOR_SUBSCRIPTIONS_MESSAGE_NAME = 'subscriptions';

export interface NatsBackendConfig {
  servers : string[];
  monitorUrl? : string;
}

class NatsMeshBackend extends MeshBackendBase {

  private natsConnection : Client;
  private readonly subscriptions : { [stream : string] : Subscription } = {};
  private hasReceivedSubscriptionIds : boolean = false;
  private partitionSubscriptionIds : string[] = [];
  private readonly registeredSubjects : string[] = [];

  constructor(private readonly natsServers : string[]) {
    super();
    if (!this.natsServers || this.natsServers.length === 0) {
      throw new Error('No nat servers provided');
    }
  }

  public get subscriptionIds() : string[] {
    return [...new Set([...this.partitionSubscriptionIds, ...Object.keys(this.subscriptions)
      .filter((subscriptionId : string) => subscriptionId.includes(this.instanceId))])];
  }

  public async shutdown() : Promise<void> {
    const localLog : debug.Debugger = log.extend('NatsMeshBackend.shutdown');
    if (this.natsConnection) {
      try {
        localLog('Closing nats connection', this.instanceId);
        await this.natsConnection.drain();
        this.natsConnection.close();
        this.natsConnection = undefined;
      } catch (err) {
        localLog('Failed to close nats connection', err);
      }
    }
  }

  public async unregister(subject : string) : Promise<void> {
    const localLog : debug.Debugger = log.extend('NatsMeshBackend.unregister');
    // tslint:disable-next-line:no-dynamic-delete
    delete this.handlers[subject];
    for (const subscriptionSubject of Object
      .keys(this.subscriptions)
      .filter((subscriptionSubject : string) => subscriptionSubject.indexOf(`${subject}-`) === 0)) {
      localLog(`Draining subject ${subscriptionSubject}`);
      await this.subscriptions[subscriptionSubject].drain();
      // tslint:disable-next-line:no-dynamic-delete
      delete this.subscriptions[subscriptionSubject];
      const index = this.registeredSubjects.indexOf(subject);
      if (index > -1) {
        this.registeredSubjects.splice(index, 1);
      }
      localLog(`Unregistered subject ${subscriptionSubject}`);
    }
  }

  // tslint:disable-next-line:no-any
  protected async doSend<T>(address : string,
                            envelope : SubjectMessageEnvelope,
                            options : SubjectMessageOptions,
                            broadcast : boolean) : Promise<T> {
    const localLog : debug.Debugger = log.extend('NatsMeshBackend.send');
    localLog('Sending to %s', envelope);
    if (this.hasReceivedSubscriptionIds) {
      // has received subscription information from other nodes
      if (this.subscriptionIds.filter((s: string) => s.indexOf(`${envelope.header.subject}-`) === 0).length === 0) {
        // and there are no known subscriptions for this subject
        return (broadcast ? [] : undefined) as unknown as T;
      }
    }
    await this.initNatsConnection();
    let natsSubjectToUse : string = address;
    if (!address) {
      if (broadcast) {
        natsSubjectToUse = `${envelope.header.subject}-broadcast`;
      } else {
        natsSubjectToUse = `${envelope.header.subject}-queue-group`;
      }
    }
    if (!options.wait) {
      this.natsConnection.publish(natsSubjectToUse, JSON.stringify(envelope));
      return undefined;
    }
    if (broadcast) {
      const replySubject = v4();
      return new Promise<T>(async (resolve : (value : T) => void, reject : (error : Error) => void) => {
        const replies : T[] = [];
        const replySubscription = await this.natsConnection.subscribe(replySubject, (err : Error, msg : Msg) => {
          if (err) {
            reject(err);
          } else if (msg.data) {
            try {
              // tslint:disable-next-line:no-unsafe-any
              replies.push(JSON.parse(msg.data));
            } catch (err) {
              localLog(`Error parsing data - %s`, msg.data);
              reject(new Error(`Error parsing data - ${msg.data}`));
            }
          }
        });
        this
          .natsConnection
          .publish(natsSubjectToUse, JSON.stringify(envelope), replySubject);
        setTimeout(() => {
          replySubscription.unsubscribe();
          // tslint:disable-next-line:no-any
          resolve(replies as any as T);
        }, options.timeout || 1000);
      });
    } else {
      const msg : Msg = await this.natsConnection.request(natsSubjectToUse, options.timeout || 30000, JSON.stringify(envelope));
      localLog.extend('debug')('Received reply to %o - %o', envelope.header, msg);
      try {
        // tslint:disable-next-line:no-unsafe-any
        return (msg.data && msg.data.length > 0 ? JSON.parse(msg.data) : undefined);
      } catch (err) {
        localLog(`Error parsing data: %o - %o`, msg.data, err);
        throw err;
      }
    }
  }

  protected async doRegistrations() : Promise<void> {
    const localLog = log.extend('NatsBackend.doRegistrations');
    try {
      await this.initNatsConnection();
      const toRegister : MeshSubjectHandlerRegistration[] = this.allHandlers
        .filter((registration : MeshSubjectHandlerRegistration) => {
          return !registration.registered;
        });
      for (const registration of toRegister) {
        registration.registered = true;
        const msgCallback : MsgCallback = async (err : NatsError | null, msg : Msg) => {
          // tslint:disable-next-line:no-unsafe-any
          const subjectMessageEnvelope : SubjectMessageEnvelope = JSON.parse(msg.data);
          // tslint:disable-next-line:no-any
          await this.invokeHandler(subjectMessageEnvelope, (error : MeshError, result : any) => {
            if (msg.reply) {
              this.natsConnection.publish(msg.reply, JSON.stringify(error ? error.serialize() : result));
            }
          });
        };
        if (!this.registeredSubjects.includes(registration.subject)) {
          this.registeredSubjects.push(registration.subject);
          // Should only be subscribed once per subject
          await this.makeSubscription(`${registration.subject}-broadcast`, msgCallback);
          await this.makeSubscription(`${registration.subject}-queue-group`, msgCallback, {queue: `${registration.subject}-qg`});
        }
        await this.makeSubscription(`${registration.subject}-${registration.messageName}-subid-${this.instanceId}`, msgCallback);
      }
    } catch (err) {
      localLog('Error creating subscriptions', err);
    }
  }

  private async makeSubscription(name : string, msgCallback : MsgCallback, opts? : SubscriptionOptions) {
    if (!this.subscriptions[name]) {
      this.subscriptions[name] = await this.natsConnection.subscribe(name, msgCallback, opts);
    }
  }

  private async initNatsConnection() : Promise<Client> {
    const localLog : debug.Debugger = log.extend('NatsMeshBackend.initNatsConnection');
    let attempts = 100;
    while (!this.natsConnection && attempts > 0) {
      try {
        localLog('Connecting to nats servers %o', this.natsServers);
        this.natsConnection = await connect({servers: this.natsServers});
      } catch (err) {
        attempts--;
        localLog('Failed to connect to nats servers %o', this.natsServers, err);
        if (attempts === 0) {
          throw err;
        } else {
          await new Promise((resolve : () => void) => setTimeout(resolve, 500));
        }
      }
      this.register(SUBJECT_NATS_MONITOR, SUBJECT_NATS_MONITOR_SUBSCRIPTIONS_MESSAGE_NAME, (msg : { subscriptions : string[] }) => {
        this.partitionSubscriptionIds = msg.subscriptions;
        this.hasReceivedSubscriptionIds = true;
      });
    }
    return this.natsConnection;
  }

}

function reportSubscriptions(mesh : Mesh, monitorUrl : string) {
  const localLog : debug.Debugger = log.extend('NatsMeshBackend.reportSubscriptions');
  let errorCount : number = 0;
  const interval : NodeJS.Timer = setInterval(async () => {
    if (mesh.status !== 'running') {
      clearInterval(interval);
      return;
    }
    try {
      type NatsSubscriptionInfo = { subscriptions_list : string[] };
      type NatsMonitorInfo = { connections : NatsSubscriptionInfo[] };
      // tslint:disable-next-line:no-unsafe-any
      const subs : NatsMonitorInfo = await fetch(monitorUrl, {headers: {accept: 'application/json'}})
        .then((res : Response) => res.json());
      const subscriptions : string[] = subs.connections.reduce((nodeSubs : string[], conn : NatsSubscriptionInfo) => {
        nodeSubs.push(...(conn.subscriptions_list || []).filter((sub : string) => /-subid-/.test(sub)));
        return nodeSubs;
      }, []);
      await mesh.subject(SUBJECT_NATS_MONITOR)
        .broadcast({
          name: SUBJECT_NATS_MONITOR_SUBSCRIPTIONS_MESSAGE_NAME,
          subscriptions
        });
    } catch (err) {
      localLog('Failed to get subscriptions', err);
      if (errorCount > 120) {
        localLog('Terminating subscription poll', err);
        clearInterval(interval);
        return;
      }
      errorCount++;
    }
  }, 1000);
}

export function nats(...servers : string[]) : MeshBackendProvider;
export function nats(config : NatsBackendConfig) : MeshBackendProvider;
// tslint:disable-next-line:no-any
export function nats(...opts : any[]) : MeshBackendProvider {
  let config : NatsBackendConfig;
  if (typeof opts[0] === 'string') {
    config = {
      servers: opts as string[]
    };
  } else {
    config = opts[0] as NatsBackendConfig;
  }
  return () => ({
    backend: new NatsMeshBackend(config.servers),
    callback(mesh : Mesh) {
      if (config.monitorUrl) {
        reportSubscriptions(mesh, config.monitorUrl);
      }
    }
  });
}
