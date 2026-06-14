// Requires: npm install ioredis
// Requires a running Redis server at localhost:6379
import Redis from 'ioredis';
import { JobRetry } from '../src';

const redis = new Redis();

const runner = new JobRetry({
  attempts: 4,
  backoff: 'exponential',
  baseDelay: 1000,
  jitter: true,
  dlq: 'redis',
  dlqRedisClient: redis,
  onRetry: (_err, attempt) => console.log(`Retry #${attempt}...`),
  onFailure: (job) => console.error(`Job "${job.name}" moved to Redis DLQ (id: ${job.id})`),
});

(async () => {
  try {
    await runner.run('processOrder', async () => {
      throw new Error('Payment service unavailable');
    });
  } catch {
    const size = await runner.dlq.size();
    console.log(`DLQ now has ${size} entry(ies) stored in Redis`);
  } finally {
    await redis.quit();
  }
})();
