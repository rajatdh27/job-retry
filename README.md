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

For the Redis DLQ backend, add `ioredis` as well:

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

const result = await runner.run('sendEmail', () => sendEmail(user));

// Inspect the dead letter queue
const failed = await runner.dlq.getAll();

// Retry a failed job after fixing the underlying issue
await runner.dlq.retry(failed[0].id, runner);

// Remove or clear
await runner.dlq.remove(failed[0].id);
await runner.dlq.clear();
```

---

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `attempts` | `number` | `3` | Maximum number of attempts before the job is moved to the DLQ |
| `backoff` | `'fixed' \| 'linear' \| 'exponential'` | `'exponential'` | Delay strategy between retries |
| `baseDelay` | `number` | `1000` | Base delay in milliseconds |
| `timeout` | `number` | none | Per-attempt timeout in ms. Hanging attempts throw `TimeoutError` |
| `jitter` | `boolean` | `false` | Adds random delay (up to 1× baseDelay) to prevent thundering herd |
| `dlq` | `'memory' \| 'file' \| 'redis' \| DLQBackend` | `'memory'` | Dead letter queue backend |
| `dlqFilePath` | `string` | `'./job-retry-dlq.json'` | Path for the file backend |
| `dlqRedisClient` | `Redis` | — | `ioredis` client instance for the Redis backend |
| `onRetry` | `(error, attempt) => void` | — | Called after each failed attempt (not the last) |
| `onFailure` | `(job: DLQEntry) => void` | — | Called when the job is moved to the DLQ |
| `onSuccess` | `(result, attempts) => void` | — | Called on success when retries were needed |

---

## Backoff strategies

**Fixed** — waits `baseDelay` every attempt.

**Linear** — waits `baseDelay × attempt` (500ms, 1s, 1.5s, …).

**Exponential** — waits `baseDelay × 2^(attempt-1)` (1s, 2s, 4s, 8s, …).

**Jitter** — adds `random(0, delay)` to the computed delay. Prevents multiple jobs from retrying at the same instant after a shared failure.

---

## Dead letter queue backends

### Memory (default)

```ts
new JobRetry({ dlq: 'memory' })
```

Stored in a plain in-process array. Lost on restart. Good for development.

### File

```ts
new JobRetry({ dlq: 'file', dlqFilePath: './failed-jobs.json' })
```

Persisted to a JSON file. Survives restarts. Good for single-server deployments.

### Redis

```ts
import Redis from 'ioredis';

new JobRetry({
  dlq: 'redis',
  dlqRedisClient: new Redis(),
})
```

Stored as Redis hashes with a list key for ordering. Shared across multiple servers, survives restarts. Production-ready.

### Custom backend

Implement the `DLQBackend` interface and pass it directly:

```ts
new JobRetry({ dlq: myCustomBackend })
```

```ts
interface DLQBackend {
  push(entry: DLQEntry): Promise<void>;
  getAll(): Promise<DLQEntry[]>;
  get(id: string): Promise<DLQEntry | null>;
  retry(id: string, runner: JobRetry): Promise<unknown>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
  size(): Promise<number>;
}
```

---

## Error types

```ts
import { MaxAttemptsExceededError, TimeoutError } from 'job-retry';

try {
  await runner.run('job', fn);
} catch (err) {
  if (err instanceof MaxAttemptsExceededError) {
    console.log(`Failed after ${err.attempts} attempts`);
  }
  if (err instanceof TimeoutError) {
    console.log(`Timed out after ${err.timeoutMs}ms`);
  }
}
```

---

## License

MIT
