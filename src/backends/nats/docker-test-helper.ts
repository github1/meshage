// tslint:disable:typedef no-implicit-dependencies no-any
import {Docker} from 'node-docker-api';
// tslint:disable-next-line:no-submodule-imports
import {execSync} from 'child_process';
import * as getPort from 'get-port';

const testId = process.env.JEST_WORKER_ID;
const testIdCounter = {};
const testContainers = {};
const testContainerPorts = {};
let fetchedImage = false;

const docker : Docker = new Docker({socketPath: '/var/run/docker.sock'});

process.on('SIGINT', () => {
  stopContainersByName([].concat.apply([], Object.keys(testContainers)
    .map((testId : string) => testContainers[testId])));
  process.exit(0);
});

function promisifyStream(stream) {
  return new Promise((resolve, reject) => {
    stream.on('data', (d) => console.log(d.toString()));
    stream.on('end', resolve);
    stream.on('error', reject);
  });
}

function stopContainersByName(...names : string[]) {
  for (const name of names) {
    execSync(`bash -c "docker ps | grep ${name} | awk '{print \\$1}' | xargs -I{} docker stop {}"`);
    execSync(`bash -c "docker ps -a | grep ${name} | awk '{print \\$1}' | xargs -I{} docker rm {}"`);
  }
}

// tslint:disable-next-line:no-any
export async function startContainer(image : string, tag : string, ...ports : string[]) : Promise<any> {
  testIdCounter[testId] = (testIdCounter[testId] || 0);
  testIdCounter[testId]++;
  const containerName = [image, tag, testId, testIdCounter[testId]].join('-')
    .replace(/[^a-z0-9]+/g, '-');
  testContainers[testId] = testContainers[testId] || [];
  testContainers[testId].push(containerName);
  testContainerPorts[containerName] = testContainerPorts[containerName] || {};
  let container = await docker.container.get(containerName);
  try {
    const containerStatus = await container.status();
    console.log('Found existing container', containerStatus);
    return {};
  } catch (err) {
    if (!fetchedImage) {
      fetchedImage = true;
      await docker.image.create({}, {fromImage: image, tag: tag})
        .then(promisifyStream)
        .then(() => docker.image.get(`${image}:${tag}`)
          .status());
    }
    const createOpts = {
      Image: `${image}:${tag}`,
      name: containerName,
      PortBindings: {}
    };
    for (const portDef of ports) {
      const parts = portDef.split('/');
      const hostPort = await getPort();
      createOpts.PortBindings[`${parts[0]}/${parts[1] || 'tcp'}`] = [{HostPort: `${hostPort}`}];
      testContainerPorts[containerName][parts[0]] = hostPort;
    }
    container = await docker.container.create(createOpts);
    await container.start();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      await container.logs({
        stdout: true,
        stderr: true
      })
        .then(promisifyStream);
    } catch (err) {
      // console.log(err);
    }
    return testContainerPorts[containerName];
  }
}

export function stopContainers() {
  stopContainersByName(...testContainers[testId]);
}
