import {
  mesh,
  Mesh
} from '../../';
import {http} from './http-support';
import {fake, shutdownAll} from '../fake-backend';
import fetch, {Response} from 'node-fetch';
// tslint:disable-next-line:no-implicit-dependencies
import * as getPort from 'get-port';

describe('http-support', () => {
  let p1 : Mesh;
  let port : number;
  beforeEach(async () => {
    port = await getPort();
    p1 = mesh(http(fake(), port));
  });
  afterEach(async () => {
    await shutdownAll();
  });
  it('can send messages over http', async () => {
    await p1.subject('test-sub-2')
      // tslint:disable-next-line:no-any
      .on('test-http', (msg : any) => {
        return {echo: msg};
      });
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
      });
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
      });
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
      });
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
  it('requires a message name', async () => {
    await p1.subject('test-sub-2')
      // tslint:disable-next-line:no-any
      .on('test-http', (msg : any) => {
        return {echo: msg};
      });
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
