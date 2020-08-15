// tslint:disable:no-any
import {
  mesh,
  Mesh
} from '../../';
import {nats} from './nats-support';
import {
  startContainer,
  stopContainersByName
} from './docker-test-helper';
import {
  commonTests,
  shutdownAll,
  store
} from '../../mesh-common-test';
import {v4} from 'uuid';

describe('nats-support', () => {
  let ports;
  let testId;
  beforeEach(async () => {
    testId = v4();
    ports = await startContainer(testId, 'nats', 'alpine3.11', '4222/tcp', '8222/tcp');
  }, 10000);
  afterEach(async () => {
    await stopContainersByName(testId);
    await shutdownAll(testId);
  });
  it('can broadcast messages and receive all replies', async () => {
    const p1 : Mesh = store(mesh(nats(`nats://localhost:${ports['4222']}`)), testId);
    for (let i = 0; i < 3; i++) {
      await store(mesh(nats(`nats://localhost:${ports['4222']}`)), testId)
        .subject('test-sub-0')
        // tslint:disable-next-line:no-any
        .on('echo', (msg : any) => ({echo: msg}))
        .awaitRegistration();
    }
    const res = await p1.subject('test-sub-0')
      .broadcast({name: 'echo'});
    expect(res.length)
      .toBe(3);
    expect(res[0])
      .toEqual({echo: {name: 'echo'}});
  }, 10000);
  it('can send messages to a member of a queue group', async () => {
    const p1 : Mesh = store(mesh(nats(`nats://localhost:${ports['4222']}`)), testId);
    for (let i = 0; i < 3; i++) {
      await store(mesh(nats(`nats://localhost:${ports['4222']}`)), testId)
        .subject('test-sub-1')
        // tslint:disable-next-line:no-any
        .on('echo', (msg : any) => ({echo: msg}))
        .awaitRegistration();
    }
    // tslint:disable-next-line:no-any
    const res : any = await p1.subject('test-sub-1')
      .send({name: 'echo'});
    expect(res.echo.name)
      .toBe('echo');
  }, 10000);
  it('can send messages partitioned', async () => {
    const p1 : Mesh = store(mesh(nats({
      servers: [`nats://localhost:${ports['4222']}`],
      monitorUrl: `http://localhost:${ports['8222']}/connz?subs=1`
    })), testId);
    for (let i = 0; i < 3; i++) {
      await store(mesh(nats(`nats://localhost:${ports['4222']}`)), testId)
        .subject('test-sub-1')
        // tslint:disable-next-line:no-any
        .on('echo', (msg : any) => ({from: i, echo: msg}))
        .awaitRegistration();
    }
    // tslint:disable-next-line:typedef
    await new Promise((resolve) => setTimeout(resolve, 1001));
    let lastResFrom = -1;
    for (let i = 0; i < 10; i++) {
      // tslint:disable-next-line:no-any
      const res : any = await p1.subject('test-sub-1')
        .send('abc', {name: 'echo'});
      if (lastResFrom === -1) {
        lastResFrom = res.from;
      } else {
        expect(res.from)
          .toBe(lastResFrom);
      }
      expect(res.echo.name)
        .toBe('echo');
    }
  }, 10000);
});

commonTests('nats-support-common',
  ({ports: commonTestPorts} : any) => mesh(nats(`nats://localhost:${commonTestPorts['4222']}`)),
  async (testId: string) => {
    return {ports: await startContainer(testId,'nats', 'alpine3.11', '4222/tcp', '8222/tcp')};
  });
