// tslint:disable:no-any
import {mesh} from '../../';
import {nats} from './nats-support';
import {
  startContainer,
  stopContainersByName
} from './docker-test-helper';
import {commonTests} from '../../mesh-common-test';

commonTests('nats-support',
  [
    ({ports: commonTestPorts} : any) => mesh(nats({
      servers: [`nats://localhost:${commonTestPorts['4222']}`],
      monitorUrl: `http://localhost:${commonTestPorts['8222']}/connz?subs=1`
    })),
    ({ports: commonTestPorts} : any) => mesh(nats(`nats://localhost:${commonTestPorts['4222']}`))
  ],
  async (testId : string) => {
    return {ports: await startContainer(testId, 'nats', 'alpine3.11', '4222/tcp', '8222/tcp')};
  }, async (testId : string) => {
    stopContainersByName(testId);
  });
