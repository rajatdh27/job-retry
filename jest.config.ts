import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts'],
  moduleNameMapper: {
    '^ioredis$': '<rootDir>/tests/helpers/mock-redis.ts',
  },
};

export default config;
