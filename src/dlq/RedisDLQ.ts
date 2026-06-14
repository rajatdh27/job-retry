import type { Redis } from 'ioredis';
import type { DLQBackend, DLQEntry } from '../types';
import type { JobRetry } from '../JobRetry';

const LIST_KEY = 'job-retry:dlq:ids';
const HASH_PREFIX = 'job-retry:dlq:entry:';

export class RedisDLQ implements DLQBackend {
  constructor(private readonly redis: Redis) {}

  async push(entry: DLQEntry): Promise<void> {
    await Promise.all([
      this.redis.hset(HASH_PREFIX + entry.id, entry as unknown as Record<string, string>),
      this.redis.rpush(LIST_KEY, entry.id),
    ]);
  }

  async getAll(): Promise<DLQEntry[]> {
    const ids = await this.redis.lrange(LIST_KEY, 0, -1);
    if (ids.length === 0) return [];
    const entries = await Promise.all(ids.map((id) => this.getById(id)));
    return entries.filter((e): e is DLQEntry => e !== null);
  }

  async get(id: string): Promise<DLQEntry | null> {
    return this.getById(id);
  }

  async retry(id: string, runner: JobRetry): Promise<unknown> {
    const entry = await this.getById(id);
    if (!entry) throw new Error(`DLQ entry not found: ${id}`);
    await this.remove(id);
    return runner.run(entry.name, () => runner.replayEntry(entry));
  }

  async remove(id: string): Promise<void> {
    await Promise.all([
      this.redis.del(HASH_PREFIX + id),
      this.redis.lrem(LIST_KEY, 0, id),
    ]);
  }

  async clear(): Promise<void> {
    const ids = await this.redis.lrange(LIST_KEY, 0, -1);
    if (ids.length > 0) {
      await Promise.all(ids.map((id) => this.redis.del(HASH_PREFIX + id)));
    }
    await this.redis.del(LIST_KEY);
  }

  async size(): Promise<number> {
    return this.redis.llen(LIST_KEY);
  }

  private async getById(id: string): Promise<DLQEntry | null> {
    const raw = await this.redis.hgetall(HASH_PREFIX + id);
    if (!raw || Object.keys(raw).length === 0) return null;
    return {
      id: raw['id'],
      name: raw['name'],
      error: raw['error'],
      timestamp: Number(raw['timestamp']),
      attempts: Number(raw['attempts']),
      payload: raw['payload'] ? (JSON.parse(raw['payload']) as unknown) : undefined,
    };
  }
}
