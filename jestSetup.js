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

