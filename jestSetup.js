const portfinder = require('portfinder-sync');

let lastPort = 9999;

global.testLog = (...message) => {
  try {
    message = JSON.stringify(message, null, 2);
  } catch (err) {
    message = message.join(' ');
  }
  require('fs').appendFileSync('/tmp/meshage.log', message + '\n');
};

global.getPort = () => {
  lastPort = portfinder.getPort(lastPort + 1);
  return Promise.resolve(lastPort);
};

global.promiseSerial = funcs =>
  funcs.reduce((promise, func) =>
      promise.then(result => func().then(Array.prototype.concat.bind(result))),
    Promise.resolve([]));

global.delayUntil = (func, opts) => {
  opts = opts || {};
  let interval = opts.interval || 1000;
  let attempts = opts.attempts || 10;
  return new Promise((resolve, reject) => {
    const check = () => {
      let result = func();
      if(result) {
        resolve(result);
      } else {
        if(attempts-- > 0) {
          setTimeout(() => check(), interval);
        } else {
          reject(new Error('timeout'));
        }
      }
    };
    check();
  });
};

