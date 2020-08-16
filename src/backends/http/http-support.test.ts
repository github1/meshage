import {
  mesh,
  Mesh,
  SubjectMessageHeader
} from '../../';
import {http} from './http-support';
import {fake} from '../fake-backend';
import {store, shutdownAll} from '../../mesh-common-test';
import fetch, {Response} from 'node-fetch';
// tslint:disable-next-line:no-implicit-dependencies
import * as getPort from 'get-port';
import {v4} from 'uuid';

describe('http-support', () => {
  let testId : string;
  let p1 : Mesh;
  let port : number;
  beforeEach(async () => {
    testId = v4();
    port = await getPort();
    p1 = store(mesh(http(fake(testId), port)), testId);
  });
  afterEach(async () => {
    await shutdownAll(testId);
  });
  it('can send messages over http', async () => {
    await p1.subject('test-sub-2')
      // tslint:disable-next-line:no-any
      .on('test-http', (msg : any) => {
        return {echo: msg};
      })
      .awaitRegistration();
    const res : Response = await fetch(`http://localhost:${port}/api/test-sub-2/123`,
      {
        headers: {
          'content-type': 'application/json'
        },
        method: 'post',
        body: JSON.stringify({name: 'test-http'})
      });
    const resJson = await res.json();
    expect(resJson.echo.name)
      .toBe('test-http');
  });
  it('can send the message name as a query param', async () => {
    await p1.subject('test-sub-2')
      // tslint:disable-next-line:no-any
      .on('test-http', (msg : any) => {
        return {echo: msg};
      })
      .awaitRegistration();
    const res : Response = await fetch(`http://localhost:${port}/api/test-sub-2/123?messageName=test-http`,
      {
        headers: {
          'content-type': 'application/json'
        },
        method: 'post',
        body: '{}'
      });
    const resJson = await res.json();
    expect(resJson.echo.name)
      .toBe('test-http');
  });
  it('can broadcast messages', async () => {
    await p1.subject('test-sub-2')
      // tslint:disable-next-line:no-any
      .on('test-http', (msg : any) => {
        return {echo: msg};
      })
      .awaitRegistration();
    const res : Response = await fetch(`http://localhost:${port}/api/broadcast/test-sub-2?messageName=test-http`,
      {
        headers: {
          'content-type': 'application/json'
        },
        method: 'post',
        body: '{}'
      });
    const resJson = await res.json();
    expect(resJson.length)
      .toBe(1);
  });
  it('can send messages without waiting for a reply', async () => {
    let handlerCalled = false;
    await p1.subject('test-sub-2')
      // tslint:disable-next-line:no-any
      .on('test-http', (msg : any) => {
        handlerCalled = true;
        return {echo: msg};
      })
      .awaitRegistration();
    const res : Response = await fetch(`http://localhost:${port}/api/broadcast/test-sub-2?messageName=test-http&wait=false`,
      {
        headers: {
          'content-type': 'application/json'
        },
        method: 'post',
        body: '{}'
      });
    const resJson = await res.json();
    expect(resJson.length)
      .toBe(0);
    expect(handlerCalled)
      .toBe(true);
  });
  it('can send parameters which are extracted from the body', async () => {
    await p1.subject('test-sub-2')
      // tslint:disable-next-line:no-any
      .on('some-val', (msg : any, header : SubjectMessageHeader) => {
        return { name: header.name, pk: header.partitionKey };
      })
      .awaitRegistration();
    const res : Response = await fetch(`http://localhost:${port}/api/test-sub-2/{body.key}-123?messageName={body.something}`,
      {
        headers: {
          'content-type': 'application/json'
        },
        method: 'post',
        body: JSON.stringify({key: 'abc', something: 'some-val'})
      });
    const resJson = await res.json();
    expect(resJson.name)
      .toBe('some-val');
    expect(resJson.pk)
      .toBe('abc-123');
  });
  it('requires a message name', async () => {
    await p1.subject('test-sub-2')
      // tslint:disable-next-line:no-any
      .on('test-http', (msg : any) => {
        return {echo: msg};
      })
      .awaitRegistration();
    const res : Response = await fetch(`http://localhost:${port}/api/test-sub-2/123`,
      {
        headers: {
          'content-type': 'application/json'
        },
        method: 'post',
        body: '{}'
      });
    expect(res.status)
      .toBe(400);
  });
});
