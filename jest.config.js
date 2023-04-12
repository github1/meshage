module.exports = {
  verbose: true,
  testEnvironment: 'node',
  globalSetup: './jestGlobalSetup.js',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        diagnostics: {
          warnOnly: true,
        },
      },
    ],
  },
  roots: ['<rootDir>/src'],
  moduleFileExtensions: ['ts', 'js', 'node'],
  testRegex: process.env.TEST_REGEX || '.*\\.test\\.ts$',
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  coveragePathIgnorePatterns: ['.*(test-helper|common-test).*'],
};
