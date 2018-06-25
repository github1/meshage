const portfinder = require('portfinder-sync');

global.testLog = (...message) => {
  try {
    message = JSON.stringify(message, null, 2);
  } catch (err) {
    message = message.join(' ');
  }
  require('fs').appendFileSync('/tmp/meshage.log', message + '\n');
};

global.getPort = () => {
  return Promise.resolve(portfinder.getPort(9999));
};

global.promiseSerial = funcs =>
  funcs.reduce((promise, func) =>
      promise.then(result => func().then(Array.prototype.concat.bind(result))),
    Promise.resolve([]));

