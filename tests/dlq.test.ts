import path from 'path';
import fs from 'fs';
import os from 'os';
import { MemoryDLQ } from '../src/dlq/MemoryDLQ';
import { FileDLQ } from '../src/dlq/FileDLQ';
import { RedisDLQ } from '../src/dlq/RedisDLQ';
import type { DLQEntry } from '../src/types';
import Redis from 'ioredis';

function makeEntry(overrides: Partial<DLQEntry> = {}): DLQEntry {
  return {
    id: 'abc-123',
    name: 'testJob',
    error: 'something failed',
    timestamp: Date.now(),
    attempts: 3,
    ...overrides,
  };
}

function runSuite(label: string, factory: () => { dlq: MemoryDLQ | FileDLQ | RedisDLQ; teardown?: () => void }) {
  describe(label, () => {
    let dlq: MemoryDLQ | FileDLQ | RedisDLQ;
    let teardown: (() => void) | undefined;

    beforeEach(() => {
      const created = factory();
      dlq = created.dlq;
      teardown = created.teardown;
    });

    afterEach(async () => {
      await dlq.clear();
      teardown?.();
    });

    it('push and getAll', async () => {
      const e = makeEntry();
      await dlq.push(e);
      const all = await dlq.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe(e.id);
    });

    it('get by id', async () => {
      const e = makeEntry({ id: 'xyz' });
      await dlq.push(e);
      const found = await dlq.get('xyz');
      expect(found?.name).toBe('testJob');
    });

    it('get returns null for unknown id', async () => {
      expect(await dlq.get('nope')).toBeNull();
    });

    it('remove', async () => {
      const e = makeEntry();
      await dlq.push(e);
      await dlq.remove(e.id);
      expect(await dlq.size()).toBe(0);
    });

    it('clear empties all entries', async () => {
      await dlq.push(makeEntry({ id: '1' }));
      await dlq.push(makeEntry({ id: '2' }));
      await dlq.clear();
      expect(await dlq.size()).toBe(0);
    });

    it('size reflects entry count', async () => {
      expect(await dlq.size()).toBe(0);
      await dlq.push(makeEntry({ id: 'a' }));
      await dlq.push(makeEntry({ id: 'b' }));
      expect(await dlq.size()).toBe(2);
    });
  });
}

runSuite('MemoryDLQ', () => ({ dlq: new MemoryDLQ() }));

runSuite('FileDLQ', () => {
  const tmpFile = path.join(os.tmpdir(), `dlq-test-${Date.now()}.json`);
  return {
    dlq: new FileDLQ(tmpFile),
    teardown: () => { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); },
  };
});

runSuite('RedisDLQ', () => {
  const redis = new Redis();
  return {
    dlq: new RedisDLQ(redis),
    teardown: () => { void redis.quit(); },
  };
});
