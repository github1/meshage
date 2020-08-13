import {
  Mesh,
  MeshInvocationError,
  MeshTimeoutError,
  SubjectMessageHeader
} from '.';

class TestMessage {
  // tslint:disable-next-line:no-any
  [key : string] : any;
}

export function commonTests(meshFactory : () => Mesh,
                            // tslint:disable-next-line:no-any
                            prepare? : () => Promise<any>,
                            // tslint:disable-next-line:no-any
                            cleanup? : (context : {m?: Mesh}) => Promise<any>) {
  const context : {m?: Mesh} = {};
  beforeEach(async () => {
    if (prepare) {
      await prepare();
    }
    context.m = meshFactory();
  }, 10000);
  afterEach(async () => {
    if (cleanup) {
      await cleanup(context);
    }
  }, 10000);
  it('can send messages without waiting for a reply', async () => {
    let called = false;
    await context.m
      .subject('a')
      .on('Foo', () => {
        setTimeout(() => called = true, 50);
      })
      .awaitRegistration();
    await context.m
      .subject('a')
      .send({name: 'Foo'}, {wait: false});
    // tslint:disable-next-line:typedef
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(called)
      .toBe(true);
  }, 10000);
  it('can send messages and get a reply', async () => {
    await context.m
      .subject('a')
      .on('Foo', () => {
        return 'reply';
      })
      .awaitRegistration();
    const reply = await context.m
      .subject('a')
      .send({name: 'Foo'}, {wait: true});
    expect(reply)
      .toBe('reply');
  }, 10000);
  it('can set a timeout to wait for a reply', async () => {
    await context.m
      .subject('a')
      .on('Foo', async () => {
        // tslint:disable-next-line:typedef
        await new Promise((resolve) => setTimeout(resolve, 200));
        return 'reply';
      })
      .awaitRegistration();
    try {
      await context.m
        .subject('a')
        .send({name: 'Foo'}, {wait: true, timeout: 1});
    } catch (err) {
      expect(err)
        .toBeInstanceOf(MeshTimeoutError);
    }
    const reply = await context.m
      .subject('a')
      .send({name: 'Foo'}, {wait: true, timeout: 500});
    expect(reply)
      .toBe('reply');
  }, 10000);
  it('can set a timeout to wait for multiple replies', async () => {
    await context.m
      .subject('a')
      .on('Foo', async () => {
        // tslint:disable-next-line:typedef
        await new Promise((resolve) => setTimeout(resolve, 200));
        return 'reply';
      })
      .awaitRegistration();
    const m1 = meshFactory();
    await m1.subject('a')
      .on('Foo', async () => {
        // tslint:disable-next-line:typedef
        await new Promise((resolve) => setTimeout(resolve, 100));
        return 'm1reply';
      })
      .awaitRegistration();
    let replies = await context.m
      .subject('a')
      .broadcast({name: 'Foo'}, {timeout: 110});
    expect(replies)
      .toEqual(['m1reply']);
    replies = await context.m
      .subject('a')
      .broadcast({name: 'Foo'}, {timeout: 210});
    expect(replies)
      .toEqual(['m1reply', 'reply']);
  }, 10000);
  it('can subscribe to messages with types', async () => {
    await context.m
      .subject('a')
      .on(TestMessage, async (message : TestMessage, {name} : SubjectMessageHeader) => {
        return [name];
      })
      .awaitRegistration();
    const reply = await context.m
      .subject('a')
      .send(new TestMessage());
    expect(reply[0])
      .toBe('TestMessage');
  }, 10000);
  it('handles local and remote errors', async () => {
    await context.m
      .subject('a')
      .on(TestMessage, () => {
        throw new Error('failed-subject-a');
      })
      .awaitRegistration();
    await meshFactory()
      .subject('b')
      .on(TestMessage, () => {
        throw new Error('failed-subject-b');
      })
      .awaitRegistration();
    // remote handler error handling
    try {
      await context.m
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
    let res : TestMessage = await context.m
      .subject('b')
      .broadcast(new TestMessage());
    expect(res[0])
      .toBeInstanceOf(MeshInvocationError);
    // local handler error handling
    try {
      await context.m
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
    res = await context.m
      .subject('a')
      .broadcast(new TestMessage());
    expect(res[0])
      .toBeInstanceOf(MeshInvocationError);
  }, 10000);
  it('a "before" handler can respond and break', async () => {
    await context.m
      .subject('a')
      .before((message : TestMessage) => {
        return message.respondInBefore === true ? 'before-handler' : undefined;
      })
      .on(TestMessage, () => {
        return 'main-handler';
      })
      .awaitRegistration();
    expect(await context.m
      .subject('a')
      .send({name: 'TestMessage', respondInBefore: true}))
      .toBe('before-handler');
    expect(await context.m
      .subject('a')
      .send({name: 'TestMessage', respondInBefore: false}))
      .toBe('main-handler');
  }, 10000);
  it('a "after" handler is always called', async () => {
    let afterCalledTimes = 0;
    await context.m
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
    await context.m
      .subject('a')
      .send({name: 'TestMessage', throwError: false});
    try {
      await context.m
        .subject('a')
        .send({name: 'TestMessage', throwError: true});
    } catch (err) {
      // ignore
    }
    expect(afterCalledTimes)
      .toBe(2);
  }, 10000);
}