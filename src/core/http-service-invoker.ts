import { ClusterService } from './cluster';
import { Message } from './message';
import { ServiceInvoker } from './service-router';
import request = require('superagent');

export type HttpServiceInvokerOptions = {
  secure?: boolean,
  timeout?: number
};

export const httpServiceInvoker = (opts : HttpServiceInvokerOptions = {}) : ServiceInvoker => {
  return (message : Message, service : ClusterService) : Promise<{}> => {
    return new Promise((resolve : (value : {}) => void, reject : (err : Error) => void) => {
      const protocol = opts.secure ? 'https' : 'http';
      const url = `${protocol}://${service.address}/api/${message.stream}/${message.partitionKey}`;
      try {
        request
          .post(url)
          .send(message)
          .set('X-Service-ID', service.id)
          .set('Content-Type', 'application/json')
          .set('Accept', 'application/json')
          .end((err : Error, res : { statusCode? : number, body: {} }) => {
            if (err) {
              reject(err);
            } else if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(res.body);
            } else {
              reject(new Error(`${res.statusCode}`));
            }
          });
      } catch (err) {
        reject(new Error(`failed`));
      }
    });
  };
};
