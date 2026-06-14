# job-retry

Retry any async function with exponential backoff, per-attempt timeout control, and a dead letter queue so permanently failed jobs are never silently lost.

```ts
import { JobRetry } from 'job-retry';

const runner = new JobRetry({ attempts: 5, backoff: 'exponential', baseDelay: 1000, jitter: true });

const result = await runner.run('sendEmail', () => sendEmail(user));
```

---

## Install

```bash
npm install job-retry
```

For the Redis DLQ backend, also install ioredis:

```bash
npm install ioredis
```

---

## Quick start

```ts
import { JobRetry } from 'job-retry';

const runner = new JobRetry({
  attempts: 5,
  backoff: 'exponential',
  baseDelay: 1000,
  timeout: 5000,
  jitter: true,
  dlq: 'memory',
  onRetry: (error, attempt) => console.log(`Attempt ${attempt} failed`, error),
  onFailure: (job) => console.error('Job permanently failed', job),
  onSuccess: (result, attempts) => console.log(`Succeeded after ${attempts} tries`),
});

// Run a job — retries automatically on failure
const result = await runner.run('sendEmail', () => sendEmail(user));

// Inspect the dead letter queue
const failed = await runner.dlq.getAll();

// Retry a failed job after you've fixed the underlying issue
await runner.dlq.retry(failed[0].id, runner);

// Remove a single entry or wipe everything
await runner.dlq.remove(failed[0].id);
await runner.dlq.clear();
```

---

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `attempts` | `number` | `3` | Maximum attempts before the job is moved to the DLQ |
| `backoff` | `'fixed' \| 'linear' \| 'exponential'` | `'exponential'` | Delay strategy between retries |
| `baseDelay` | `number` | `1000` | Base delay in milliseconds |
| `timeout` | `number` | none | Per-attempt timeout in ms — hanging attempts throw `TimeoutError` |
| `jitter` | `boolean` | `false` | Adds random delay (up to 1× baseDelay) to prevent thundering herd |
| `dlq` | `'memory' \| 'file' \| 'redis' \| DLQBackend` | `'memory'` | Dead letter queue backend |
| `dlqFilePath` | `string` | `'./job-retry-dlq.json'` | File path for the file backend |
| `dlqRedisClient` | `Redis` | — | ioredis client instance for the Redis backend |
| `onRetry` | `(error, attempt) => void` | — | Called after each failed attempt except the last |
| `onFailure` | `(job: DLQEntry) => void` | — | Called when the job is moved to the DLQ |
| `onSuccess` | `(result, attempts) => void` | — | Called on success when retries were needed |

---

## Backoff strategies

**Fixed** — waits `baseDelay` every attempt.

**Linear** — waits `baseDelay × attempt` (1s, 2s, 3s, …).

**Exponential** — waits `baseDelay × 2^(attempt−1)` (1s, 2s, 4s, 8s, …).

**Jitter** — adds `random(0, delay)` to the computed delay. Prevents multiple jobs from retrying at the exact same instant after a shared outage (thundering herd).

---

## Dead letter queue backends

### Memory (default)

```ts
new JobRetry({ dlq: 'memory' })
```

Stored in an in-process array. Lost on restart. Good for development and testing.

### File

```ts
new JobRetry({
  dlq: 'file',
  dlqFilePath: './failed-jobs.json',
})
```

Persisted to a JSON file on disk. Survives restarts. Good for single-server apps.

### Redis

```ts
import Redis from 'ioredis';

new JobRetry({
  dlq: 'redis',
  dlqRedisClient: new Redis(),
})
```

Stored as Redis hashes with a list for ordering. Shared across multiple servers, survives restarts. Production-ready.

### Custom backend

Implement the `DLQBackend` interface and pass the instance directly:

```ts
import type { DLQBackend, DLQEntry } from 'job-retry';

class MyDLQ implements DLQBackend {
  async push(entry: DLQEntry): Promise<void> { /* ... */ }
  async getAll(): Promise<DLQEntry[]> { /* ... */ }
  async get(id: string): Promise<DLQEntry | null> { /* ... */ }
  async retry(id: string, runner: JobRetry): Promise<unknown> { /* ... */ }
  async remove(id: string): Promise<void> { /* ... */ }
  async clear(): Promise<void> { /* ... */ }
  async size(): Promise<number> { /* ... */ }
}

new JobRetry({ dlq: new MyDLQ() })
```

---

## DLQ API

| Method | Description |
|---|---|
| `dlq.getAll()` | Returns all entries in the queue |
| `dlq.get(id)` | Returns a single entry by ID, or null |
| `dlq.retry(id, runner)` | Re-runs the original function and removes the entry on success |
| `dlq.remove(id)` | Deletes an entry from the queue |
| `dlq.clear()` | Empties the entire queue |
| `dlq.size()` | Returns the number of entries |

---

## Error types

```ts
import { MaxAttemptsExceededError, TimeoutError } from 'job-retry';

try {
  await runner.run('job', fn);
} catch (err) {
  if (err instanceof MaxAttemptsExceededError) {
    console.log(`Failed after ${err.attempts} attempts`);
    // err.cause holds the last underlying error
  }
}
```

`TimeoutError` is thrown internally when a per-attempt timeout fires. It becomes the `cause` on `MaxAttemptsExceededError`.

---

## TypeScript

Full types ship with the package — no `@types/job-retry` needed.

```ts
import type { RetryOptions, DLQEntry, DLQBackend, BackoffStrategy } from 'job-retry';
```

---

## License

MIT
