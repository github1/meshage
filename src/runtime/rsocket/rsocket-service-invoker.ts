/* tslint:disable:no-unsafe-any typedef */
import {
  AbstractServiceInvoker,
  Address,
  ClusterService,
  Message
} from '../../core';
import {
  BufferEncoders,
  RSocketClient
} from 'rsocket-core';
import {Single} from 'rsocket-flowable';
import {Payload} from 'rsocket-types';
import RSocketTcpClient from 'rsocket-tcp-client';

export class RSocketServiceInvoker extends AbstractServiceInvoker {

  constructor() {
    super('rsocket');
  }

  protected doSend(address : Address, message : Message, service : ClusterService) : Promise<{}> {
    return new Promise((resolve : (value : {}) => void, reject : (err : Error) => void) => {
      const client : RSocketClient<Buffer, null> = new RSocketClient({
        setup: {
          // ms btw sending keepalive to server
          keepAlive: 60000,
          // ms timeout if no keepalive response
          lifetime: 180000,
          dataMimeType: 'application/octet-stream',
          metadataMimeType: 'application/octet-stream'
        },
        transport: new RSocketTcpClient(
          address,
          BufferEncoders
        )
      });

      client
        .connect()
        .subscribe({
          onComplete: socket => {
            const response : Single<Payload<Buffer, null>> = socket.requestResponse({
              data: Buffer.from(JSON.stringify(message)),
              metadata: undefined
            });
            response.subscribe({
              onComplete: (response : Payload<Buffer, null>) => {
                resolve(JSON.parse(response.data.toString()));
                client.close();
              },
              onError: reject,
              onSubscribe: () => { /* no op */ }
            });
          },
          onError: reject,
          onSubscribe: cancel => {/* call cancel() to abort */}
        });
    });
  }
}
