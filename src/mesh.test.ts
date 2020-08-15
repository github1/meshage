import {mesh} from '.';
import {fake} from './backends/fake-backend';
import {commonTests} from './mesh-common-test';

commonTests('mesh-common', () => mesh(fake()));
