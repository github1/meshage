import {
  Mesh,
  mesh,
  MeshTimeoutError
} from '.';
import {
  fake,
  shutdownAll
} from './backends/fake-backend';

// tslint:disable-next-line:typedef
// process.on('unhandledRejection', (reason, p) => { throw reason; });

describe('mesh', () => {
  let m : Mesh;
  beforeEach(() => {
    m = mesh(fake());
  });
  afterEach(shutdownAll);
  it('can send messages without waiting for a reply', async () => {
    let called = false;
    await m.subject('a')
      .on('Foo', () => {
        setTimeout(() => called = true, 1);
      })
      .awaitRegistration();
    await m.subject('a')
      .send({name: 'Foo'}, {wait: false});
    // tslint:disable-next-line:typedef
    await new Promise((resolve) => setTimeout(resolve, 2));
    expect(called)
      .toBe(true);
  });
  it('can send messages and get a reply', async () => {
    await m.subject('a')
      .on('Foo', () => {
        return 'reply';
      })
      .awaitRegistration();
    const reply = await m.subject('a')
      .send({name: 'Foo'}, {wait: true});
    expect(reply)
      .toBe('reply');
  });
  it('can set a timeout to wait for a reply', async () => {
    await m.subject('a')
      .on('Foo', async () => {
        // tslint:disable-next-line:typedef
        await new Promise((resolve) => setTimeout(resolve, 200));
        return 'reply';
      })
      .awaitRegistration();
    try {
      await m.subject('a')
        .send({name: 'Foo'}, {wait: true, timeout: 1});
    } catch (err) {
      expect(err)
        .toBeInstanceOf(MeshTimeoutError);
    }
    const reply = await m.subject('a')
      .send({name: 'Foo'}, {wait: true, timeout: 210});
    expect(reply)
      .toBe('reply');
  });
  it('can set a timeout to wait for multiple replies', async () => {
    await m.subject('a')
      .on('Foo', async () => {
        // tslint:disable-next-line:typedef
        await new Promise((resolve) => setTimeout(resolve, 200));
        return 'reply';
      })
      .awaitRegistration();
    const m1 = mesh(fake());
    await m1.subject('a')
      .on('Foo', async () => {
        // tslint:disable-next-line:typedef
        await new Promise((resolve) => setTimeout(resolve, 100));
        return 'm1reply';
      })
      .awaitRegistration();
    let replies = await m.subject('a')
      .broadcast({name: 'Foo'}, {timeout: 110});
    expect(replies)
      .toEqual(['m1reply']);
    replies = await m.subject('a')
      .broadcast({name: 'Foo'}, {timeout: 210});
    expect(replies)
      .toEqual(['m1reply', 'reply']);
  }, 10000);
  it('can subscribe to messages with types', async () => {
    await m.subject('a')
      .on(TestMessage, async (message: TestMessage) => {
        return [message];
      })
      .awaitRegistration();
    const reply = await m.subject('a')
      .send(new TestMessage());
    expect(reply[0])
      .toBeInstanceOf(TestMessage);
  });
});

// tslint:disable-next-line:no-unnecessary-class
class TestMessage {
}
