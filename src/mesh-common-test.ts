import {
  Mesh,
  MeshDuplicateMessageError,
  MeshInvocationError,
  MeshTimeoutError,
  SubjectMessageHeader
} from '.';
import {v4} from 'uuid';

class TestMessage {
  // tslint:disable-next-line:no-any
  [key : string] : any;
}

const instances : { [key : string] : Mesh[] } = {};

export function testLog(msg : string) {
  if (process.env.TEST_LOG) {
    // tslint:disable-next-line:no-unsafe-any
    require('fs')
      // tslint:disable-next-line:no-unsafe-any
      .appendFileSync('/tmp/testlogs', `${msg}\n`);
  }
}

export function store(mesh : Mesh, id? : string) : Mesh {
  // tslint:disable-next-line:no-parameter-reassignment
  id = id || process.env.JEST_WORKER_ID;
  testLog(`storing ${id}`);
  instances[id] = instances[id] || [];
  instances[id].push(mesh);
  return mesh;
}

export async function shutdownAll(id? : string) {
  // tslint:disable-next-line:no-parameter-reassignment
  id = id || process.env.JEST_WORKER_ID;
  testLog(`shutdown ${id}`);
  if (instances[id]) {
    await instances[id].map((instance : Mesh) => instance.shutdown());
    // tslint:disable-next-line:no-dynamic-delete
    instances[id] = [];
  }
}

// tslint:disable-next-line:no-any
type MeshFactory = (opts? : any) => Mesh;

export function commonTests(description : string, meshFactory : MeshFactory | MeshFactory[],
                            // tslint:disable-next-line:no-any
                            prepare? : (testId? : string) => Promise<any>,
                            // tslint:disable-next-line:no-any
                            cleanup? : (testId? : string) => Promise<any>) {
  describe(description, () => {
    let testId : string;
    // tslint:disable-next-line:no-any
    let prepared : any;
    let meshFact : () => Mesh;
    let meshCount : number;
    let m : Mesh;
    const meshFactories : MeshFactory[] = Array.isArray(meshFactory) ? meshFactory : [meshFactory];
    beforeEach(async () => {
      testId = v4();
      prepared = { testId };
      meshCount = 0;
      if (prepare) {
        prepared = {...prepared, ...(await prepare(testId))};
      }
      meshFact = () => {
        const mesh : Mesh = store(meshFactories[meshCount](prepared), testId);
        if (meshCount < meshFactories.length - 1) {
          meshCount++;
        }
        return mesh;
      };
      m = meshFact();
    }, 10000);
    afterEach(async () => {
      await shutdownAll(testId);
      if (cleanup) {
        await cleanup(testId);
      }
    }, 10000);
    it('can send messages partitioned', async () => {
      for (let i = 0; i < 3; i++) {
        await meshFact()
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
        const res : any = await m.subject('test-sub-1')
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
    it('invokes a local handler if current node is the partition', async () => {
      await m.subject('test-sub-1')
        .on('abc', () => {
          return 'reply';
        })
        .awaitRegistration();
      const res = await m
        .subject('test-sub-1')
        .send('123', {name: 'abc'});
      expect(res)
        .toBe('reply');
    }, 10000);
    it('can broadcast messages and receive all replies', async () => {
      for (let i = 0; i < 3; i++) {
        await meshFact()
          .subject('test-sub-0')
          // tslint:disable-next-line:no-any
          .on('echo', (msg : any) => ({echo: msg}))
          .awaitRegistration();
      }
      const res = await m.subject('test-sub-0')
        .broadcast({name: 'echo'});
      expect(res.length)
        .toBe(3);
      expect(res[0])
        .toEqual({echo: {name: 'echo'}});
    }, 10000);
    it('can send messages to a member of a queue group', async () => {
      for (let i = 0; i < 3; i++) {
        await meshFact()
          .subject('test-sub-1')
          // tslint:disable-next-line:no-any
          .on('echo', (msg : any) => ({echo: msg}))
          .awaitRegistration();
      }
      // tslint:disable-next-line:no-any
      const res : any = await m.subject('test-sub-1')
        .send({name: 'echo'});
      expect(res.echo.name)
        .toBe('echo');
    }, 10000);
    it('invokes a local handler if current node is the partition', async () => {
      await m.subject('test-sub-1')
        .on('abc', () => {
          return 'reply';
        })
        .awaitRegistration();
      const res = await m
        .subject('test-sub-1')
        .send('123', {name: 'abc'});
      expect(res)
        .toBe('reply');
    }, 10000);
    it('can send messages without waiting for a reply', async () => {
      let called = false;
      await m
        .subject('a')
        .on('Foo', () => {
          setTimeout(() => called = true, 50);
        })
        .awaitRegistration();
      await m
        .subject('a')
        .send({name: 'Foo'}, {wait: false});
      // tslint:disable-next-line:typedef
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(called)
        .toBe(true);
    }, 10000);
    it('can send messages and get a reply', async () => {
      await m
        .subject('a')
        .on('Foo', () => {
          return 'reply';
        })
        .awaitRegistration();
      const reply = await m
        .subject('a')
        .send({name: 'Foo'}, {wait: true});
      expect(reply)
        .toBe('reply');
    }, 10000);
    it('can set a timeout to wait for a reply', async () => {
      await m
        .subject('a')
        .on('Foo', async () => {
          // tslint:disable-next-line:typedef
          await new Promise((resolve) => setTimeout(resolve, 200));
          return 'reply';
        })
        .awaitRegistration();
      try {
        await m
          .subject('a')
          .send({name: 'Foo'}, {wait: true, timeout: 1});
      } catch (err) {
        expect(err)
          .toBeInstanceOf(MeshTimeoutError);
      }
      const reply = await m
        .subject('a')
        .send({name: 'Foo'}, {wait: true, timeout: 500});
      expect(reply)
        .toBe('reply');
    }, 10000);
    it('can set a timeout to wait for multiple replies', async () => {
      await m
        .subject('a')
        .on('Foo', async () => {
          // tslint:disable-next-line:typedef
          await new Promise((resolve) => setTimeout(resolve, 200));
          return 'reply';
        })
        .awaitRegistration();
      const m1 = meshFact();
      await m1.subject('a')
        .on('Foo', async () => {
          // tslint:disable-next-line:typedef
          await new Promise((resolve) => setTimeout(resolve, 100));
          return 'm1reply';
        })
        .awaitRegistration();
      let replies = await m
        .subject('a')
        .broadcast({name: 'Foo'}, {timeout: 110});
      expect(replies)
        .toEqual(['m1reply']);
      replies = await m
        .subject('a')
        .broadcast({name: 'Foo'}, {timeout: 500});
      expect(replies)
        .toEqual(['m1reply', 'reply']);
    }, 10000);
    it('can subscribe to messages with types', async () => {
      await m
        .subject('a')
        .on(TestMessage, async (message : TestMessage, {name} : SubjectMessageHeader) => {
          return [name];
        })
        .awaitRegistration();
      const reply = await m
        .subject('a')
        .send(new TestMessage());
      expect(reply[0])
        .toBe('TestMessage');
    }, 10000);
    it('handles local and remote errors', async () => {
      await m
        .subject('a')
        .on(TestMessage, () => {
          throw new Error('failed-subject-a');
        })
        .awaitRegistration();
      await meshFact()
        .subject('b')
        .on(TestMessage, () => {
          throw new Error('failed-subject-b');
        })
        .awaitRegistration();
      // remote handler error handling
      try {
        await m
          .subject('b')
          .send(new TestMessage());
        expect('')
          .toBe('Expected MeshInvocationError');
      } catch (err) {
        expect(err)
          .toBeInstanceOf(MeshInvocationError);
        expect(err.cause.message)
          .toBe('failed-subject-b');
      }
      // remote handler error handling (broadcast)
      let res : TestMessage = await m
        .subject('b')
        .broadcast(new TestMessage());
      expect(res[0])
        .toBeInstanceOf(MeshInvocationError);
      // local handler error handling
      try {
        await m
          .subject('a')
          .send(new TestMessage());
        expect('')
          .toBe('Expected MeshInvocationError');
      } catch (err) {
        expect(err)
          .toBeInstanceOf(MeshInvocationError);
        expect(err.cause.message)
          .toBe('failed-subject-a');
      }
      // local handler error handling (broadcast)
      res = await m
        .subject('a')
        .broadcast(new TestMessage());
      expect(res[0])
        .toBeInstanceOf(MeshInvocationError);
    }, 10000);
    it('a "before" handler can respond and break', async () => {
      await m
        .subject('a')
        .before((message : TestMessage) => {
          return message.respondInBefore === true ? 'before-handler' : undefined;
        })
        .on(TestMessage, () => {
          return 'main-handler';
        })
        .awaitRegistration();
      expect(await m
        .subject('a')
        .send({name: 'TestMessage', respondInBefore: true}, {timeout: 1000}))
        .toBe('before-handler');
      expect(await m
        .subject('a')
        .send({name: 'TestMessage', respondInBefore: false}, {timeout: 1000}))
        .toBe('main-handler');
      expect(await m
        .subject('a')
        .send({
          name: 'AnotherTypeOfMessage',
          respondInBefore: true
        }, {timeout: 1000}))
        .toBe('before-handler');
    }, 10000);
    it('a "after" handler is always called', async () => {
      let afterCalledTimes = 0;
      await m
        .subject('a')
        .on(TestMessage, (msg : TestMessage) => {
          if (msg.throwError) {
            throw new Error('failed');
          }
          return 'main-handler';
        })
        .after(() => {
          afterCalledTimes++;
        })
        .awaitRegistration();
      await m
        .subject('a')
        .send({name: 'TestMessage', throwError: false});
      try {
        await m
          .subject('a')
          .send({name: 'TestMessage', throwError: true});
      } catch (err) {
        // ignore
      }
      expect(afterCalledTimes)
        .toBe(2);
    }, 10000);
    it('treats void response signals as undefined', async () => {
      let errorReceived;
      await m
        .subject('a')
        .before(() => {
          // nothing
        })
        .awaitRegistration();
      let res;
      try {
        res = await m
          .subject('a')
          .send({name: 'TestMessage'}, {timeout: 1000});
      } catch (err) {
        errorReceived = err;
      }
      expect(res)
        .toBeUndefined();
      expect(errorReceived)
        .toBeUndefined();
    }, 10000);
    it('excludes void response signals from broadcast responses', async () => {
      let errorReceived;
      await m
        .subject('a')
        .before(() => {
          // nothing
        })
        .awaitRegistration();
      await meshFact()
        .subject('a')
        .on(TestMessage, () => {
          return 'a-response';
        })
        .awaitRegistration();
      let res;
      try {
        res = await m
          .subject('a')
          .broadcast({name: 'TestMessage'}, {timeout: 1000});
      } catch (err) {
        errorReceived = err;
      }
      expect(errorReceived)
        .toBeUndefined();
      expect(res.length)
        .toBe(1);
      expect(res[0])
        .toBe('a-response');
    }, 10000);
    it('doest not throw MeshDuplicateMessageError if there are multiple message handlers for the same subject', async () => {
      await m
        .subject('a')
        .before(() => {
          // before
        })
        .on('meshage-a', () => {
          return 'res-a';
        })
        .on('meshage-b', () => {
          return 'res-b';
        })
        .awaitRegistration();
      const res = await m
        .subject('a')
        .broadcast({name: 'meshage-a'}, {timeout: 1000});
      // tslint:disable-next-line:no-any
      expect(res.filter((item : any) => item instanceof MeshDuplicateMessageError).length)
        .toBe(0);
    }, 10000);
    it('can unregister and re-register a handler', async () => {
      let handlerCalled = 0;
      // Register
      await m.subject('a')
        .on('foo', () => {
          handlerCalled++;
        })
        .awaitRegistration();
      await m.subject('a')
        .send({name: 'foo'});
      expect(handlerCalled)
        .toBe(1);
      // Unregister
      await m.subject('a')
        .unbind();
      try {
        await m.subject('a')
          .send({name: 'foo'}, {timeout: 500});
      } catch (err) {
        // timeout
      }
      expect(handlerCalled)
        .toBe(1);
      // Register
      await m.subject('a')
        .on('foo', () => {
          handlerCalled++;
        })
        .awaitRegistration();
      await m.subject('a')
        .send({name: 'foo'});
      expect(handlerCalled)
        .toBe(2);
    }, 10000);
    it('returns quickly for messages without handlers', async () => {
      // tslint:disable-next-line:typedef
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const res = await m.subject('a')
        .send({name: 'none'}, {timeout: 100});
      expect(res)
        .toBeUndefined();
    }, 10000);
  });
}
