// tslint:disable:no-any

import {
  mesh,
  Mesh,
  SubjectMessageHeader
} from '../../';
import {http} from './http-support';
import {fake} from '../fake-backend';
import {
  shutdownAll,
  store
} from '../../mesh-common-test';
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
      .on('test-http', (msg : any, header : SubjectMessageHeader) => {
        return {
          echo: {
            msg,
            header
          }
        };
      })
      .awaitRegistration();
    const res : Response = await sendHttp(`${port}/api/test-sub-2/123`, {name: 'test-http'});
    expect(res.status)
      .toBe(200);
    const resJson = await res.json();
    expect(resJson.echo.msg.name)
      .toBe('test-http');
    expect(resJson.echo.header.http.headers['content-type'])
      .toBe('application/json');
    const resDirect : any = await p1.subject('test-sub-2')
      .send({name:'test-http'});
    expect(resDirect.echo.msg.name)
      .toBe('test-http');
  });
  it('can set the http response status in the handler', async () => {
    await p1.subject('test-sub-2')
      // tslint:disable-next-line:no-any
      .on('test-http', () => {
        return {
          http: {
            status: 202,
            headers: {
              'x-something': 'foo'
            }
          }
        };
      })
      .awaitRegistration();
    const res : Response = await sendHttp(`${port}/api/test-sub-2/123`, {name: 'test-http'});
    expect(res.status)
      .toBe(202);
    expect(res.headers.get('x-something'))
      .toBe('foo');
  });
  it('returns status 404 if there are no handlers', async () => {
    await p1.subject('test-sub-2')
      // tslint:disable-next-line:no-any
      .on('test-http', (msg : any) => {
        return {echo: msg};
      })
      .awaitRegistration();
    let res : Response = await sendHttp(`${port}/api/no-sub/123`, {name: 'test-http'});
    expect(res.status)
      .toBe(404);
    res = await fetch(`http://localhost:${port}/api/broadcast/no-sub`,
      {
        headers: {
          'content-type': 'application/json'
        },
        method: 'post',
        body: JSON.stringify({name: 'test-http'})
      });
    expect(await (res.json()))
      .toEqual([]);
  });
  it('can send the message name as a query param', async () => {
    await p1.subject('test-sub-2')
      // tslint:disable-next-line:no-any
      .on('test-http', (msg : any) => {
        return {echo: msg};
      })
      .awaitRegistration();
    const res : Response = await sendHttp(`${port}/api/test-sub-2/123?messageName=test-http`, {});
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
    const res : Response = await sendHttp(`${port}/api/broadcast/test-sub-2?messageName=test-http`, {});
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
    const res : Response = await sendHttp(`${port}/api/broadcast/test-sub-2?messageName=test-http&wait=false`, {});
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
        return {name: header.name, pk: header.partitionKey};
      })
      .awaitRegistration();
    const res : Response = await sendHttp(`${port}/api/test-sub-2/{body.key}-123?messageName={body.something}`, {
      key: 'abc',
      something: 'some-val'
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
    const res : Response = await sendHttp(`${port}/api/test-sub-2/123`, {});
    expect(res.status)
      .toBe(400);
  });
});

function sendHttp(path : string, body : any) {
  return fetch(`http://localhost:${path}`,
    {
      headers: {
        'content-type': 'application/json'
      },
      method: 'post',
      body: JSON.stringify(body)
    });
}
