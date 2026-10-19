'use strict';

module.exports = {
  rootDir: '..',
  roots: ['<rootDir>/plugins'],
  modulePathIgnorePatterns: ['<rootDir>/tmp/', '<rootDir>/apps/platform-admin/.next/'],
  testEnvironment: 'node',
  testMatch: ['<rootDir>/plugins/*/tests/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['<rootDir>/apps/marketplace-api/node_modules/ts-jest', {
      diagnostics: false,
      tsconfig: {
        target: 'ES2022',
        module: 'commonjs',
        esModuleInterop: true,
        strict: false,
        skipLibCheck: true
      }
    }]
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  clearMocks: true
};
