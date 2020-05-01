const HttpServiceInvoker = require('./http-service-invoker').HttpServiceInvoker;
const express = require('express');
const bodyParser = require('body-parser');

describe('HttpServiceInvoker', () => {
  describe('invoke', () => {
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
      return new HttpServiceInvoker().invoke({
        stream: 'http-service-invoker-test-stream',
        partitionKey: '123',
        data: {
          some: 'value'
        }
      }, {
        id: 'service-1',
        stream: 'http-service-invoker-test-stream',
        endpoints: [{
          endpointType: 'http',
          description: `http://127.0.0.1:${port}`
        }]
      }).then(() => {
        expect(handlerSpy).toHaveBeenCalled();
        const req = handlerSpy.mock.calls[0][0];
        expect(req.params.stream).toBe('http-service-invoker-test-stream');
        expect(req.params.partitionKey).toBe('123');
        expect(req.body.some).toBe('value');
        expect(req.header('x-service-id')).toBe('service-1');
        expect(req.header('x-partition-key')).toBe('123');
      });
    });
  });
  describe('handles', () => {
    it('returns true for http endpoints', () => {
      expect(new HttpServiceInvoker().handles({
        stream: 'some-stream',
        endpoints: [{
          endpointType: 'http',
          description: ''
        }]
      })).toBe(true);
    });
    it('returns false for non-http endpoints', () => {
      expect(new HttpServiceInvoker().handles({
        stream: 'some-stream',
        endpoints: [{
          endpointType: 'asd',
          description: ''
        }]
      })).toBe(false);
    });
    it('returns false for empty endpoints', () => {
      expect(new HttpServiceInvoker().handles({
        stream: 'some-stream',
        endpoints: []
      })).toBe(false);
    });
  });
});
