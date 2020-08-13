import {mesh} from '.';
import {
  fake,
  shutdownAll
} from './backends/fake-backend';
import {commonTests} from './mesh-common-test';

describe('mesh', () => {
  afterEach(shutdownAll);
  commonTests(() => mesh(fake()));
});
