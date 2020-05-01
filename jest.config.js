module.exports = {
  verbose: true,
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jestSetup.js'],
  transform: {
    "^.+\\.ts$": 'ts-jest'
  },
  roots: ['<rootDir>/src'],
  moduleFileExtensions: [
    'ts',
    'js',
    'node'
  ],
  testRegex: '.*\\.test\\.(js|ts)$',
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
