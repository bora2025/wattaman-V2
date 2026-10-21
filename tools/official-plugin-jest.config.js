'use strict';

module.exports = {
  rootDir: '..',
  roots: ['<rootDir>/plugins'],
  modulePathIgnorePatterns: ['<rootDir>/tmp/', '<rootDir>/apps/platform-admin/.next/'],
  testEnvironment: 'node',
  testRegex: ['[\\\\/]plugins[\\\\/].*[\\\\/]tests[\\\\/].*\\.spec\\.ts$'],
  transform: {
    '^.+\\.ts$': ['<rootDir>/apps/marketplace-api/node_modules/@swc/jest', {
      jsc: {
        parser: { syntax: 'typescript', decorators: false },
        target: 'es2022'
      },
      module: { type: 'commonjs' }
    }]
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  clearMocks: true
};
