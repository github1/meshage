const httpServiceInoker = require('./http-service-invoker');
const express = require('express');
const bodyParser = require('body-parser');

describe('httpServiceInvoker', () => {
  let app;
  let port;
  let handlerSpy;
  let server;
  beforeEach(() => {
    handlerSpy = jest.fn();
    return new Promise(resolve => {
      app = express();
      app.use(bodyParser.json());
      app.all('/api/:stream/:partitionKey', (req, res) => {
        handlerSpy(req);
        res.send({});
      });
      getPort().then(foundPort => {
        port = foundPort;
        server = app.listen(port, () => {
          resolve();
        });
      });
    });
  });
  afterEach(() => {
    server.close();
  });
  it('sends http requests', () => {
    return httpServiceInoker.httpServiceInvoker()({
      stream: 'http-service-invoker-test-stream',
      partitionKey: '123',
      data: {
        some: 'value'
      }
    }, {
      id: 'service-1',
      stream: 'http-service-invoker-test-stream',
      address: `127.0.0.1:${port}`
    }).then(() => {
      expect(handlerSpy).toHaveBeenCalled();
      const req = handlerSpy.mock.calls[0][0];
      expect(req.params.stream).toBe('http-service-invoker-test-stream');
      expect(req.params.partitionKey).toBe('123');
      expect(req.body.stream).toBe('http-service-invoker-test-stream');
      expect(req.body.partitionKey).toBe('123');
      expect(req.body.data.some).toBe('value');
      expect(req.header('x-service-id')).toBe('service-1');
    });
  });
});
