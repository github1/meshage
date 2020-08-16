import {mesh} from '.';
import {fake} from './backends/fake-backend';
import {commonTests} from './mesh-common-test';

// tslint:disable-next-line:typedef
commonTests('mesh-common', ({testId}) => mesh(fake(testId)));
