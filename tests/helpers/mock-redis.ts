// Uses ioredis-mock so tests don't need a real Redis server.
// jest.config.ts maps 'ioredis' → this file.
export { default } from 'ioredis-mock';
export * from 'ioredis-mock';
