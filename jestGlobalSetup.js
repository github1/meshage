if (process.env.LEAKED_HANDLES) {
  require('leaked-handles').set({
    fullStack: true
  });
}
const {execSync} = require('child_process');

let listenerAdded = false;

module.exports = function () {
  if (!listenerAdded) {
    listenerAdded = true;
    console.log('Configuring exit listener');
    process.on('exit', () => {
      console.log('Removing test containers');
      execSync(`bash -c "docker ps | grep jest-test-container | awk '{print \\$1}' | xargs -I{} docker stop {}"`);
      execSync(`bash -c "docker ps -a | grep jest-test-container | awk '{print \\$1}' | xargs -I{} docker rm {}"`);
    });
  }
};
