// Uses ioredis-mock so tests don't need a real Redis server.
// jest.config.js maps 'ioredis' → this file.
import RedisMock from 'ioredis-mock';
export default RedisMock;
module.exports = RedisMock;
module.exports.default = RedisMock;
