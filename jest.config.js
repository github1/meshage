module.exports = {
  verbose: true,
  testEnvironment: 'node',
  globalSetup: './jestGlobalSetup.js',
  transform: {
    "^.+\\.ts$": 'ts-jest'
  },
  roots: ['<rootDir>/src'],
  moduleFileExtensions: [
    'ts',
    'js',
    'node'
  ],
  testRegex: '.*\\.test\\.ts$',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts'
  ],
  globals: {
    'ts-jest': {
      diagnostics: {
        warnOnly: true
      }
    }
  }
};
