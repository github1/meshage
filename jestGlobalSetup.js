if (process.env.LEAKED_HANDLES) {
  require('leaked-handles').set({
    fullStack: true
  });
}
const {execSync} = require('child_process');

module.exports = function () {
  process.on('SIGINT', () => {
    execSync(`bash -c "docker ps | grep jest-test-container | awk '{print \\$1}' | xargs -I{} docker stop {}"`);
    execSync(`bash -c "docker ps -a | grep jest-test-container | awk '{print \\$1}' | xargs -I{} docker rm {}"`);
    process.exit(0);
  });
};
