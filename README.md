# job-retry

[![npm version](https://img.shields.io/npm/v/job-retry.svg)](https://www.npmjs.com/package/job-retry)
[![npm downloads](https://img.shields.io/npm/dm/job-retry.svg)](https://www.npmjs.com/package/job-retry)
[![license](https://img.shields.io/npm/l/job-retry.svg)](https://github.com/rajatdh27/job-retry/blob/main/LICENSE)
[![node](https://img.shields.io/node/v/job-retry.svg)](https://www.npmjs.com/package/job-retry)

> Retry any async function with exponential backoff, per-attempt timeouts, and a dead letter queue — so nothing fails silently in production.

```ts
import { JobRetry } from 'job-retry';

const runner = new JobRetry({ attempts: 5, backoff: 'exponential', baseDelay: 1000, jitter: true });

const result = await runner.run('sendEmail', () => sendEmail(user));
```

---

## Why job-retry?

Most retry libraries just retry. **job-retry goes further:**

| Feature | job-retry | p-retry | async-retry |
|---|:---:|:---:|:---:|
| Exponential backoff | ✅ | ✅ | ✅ |
| Per-attempt timeout | ✅ | ❌ | ❌ |
| Dead letter queue | ✅ | ❌ | ❌ |
| Redis DLQ backend | ✅ | ❌ | ❌ |
| Retry hooks | ✅ | ✅ | ✅ |
| Zero core dependencies | ✅ | ❌ | ✅ |
| TypeScript built-in | ✅ | ✅ | ❌ |

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
  attempts: 5,           // try up to 5 times
  backoff: 'exponential', // wait 1s, 2s, 4s, 8s between attempts
  baseDelay: 1000,
  timeout: 5000,         // kill any attempt that hangs > 5s
  jitter: true,          // spread retries to avoid thundering herd
  dlq: 'memory',         // save permanently failed jobs here

  onRetry:   (err, attempt) => console.log(`Attempt ${attempt} failed`, err),
  onFailure: (job)           => console.error('Gave up on job', job),
  onSuccess: (result, n)     => console.log(`Succeeded after ${n} tries`),
});

try {
  const result = await runner.run('sendEmail', () => sendEmail(user));
  console.log('Done:', result);
} catch {
  // all attempts exhausted — job is now in the DLQ
  const failed = await runner.dlq.getAll();
  console.log('Failed jobs:', failed);
}
```

---

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `attempts` | `number` | `3` | Max attempts before moving the job to the DLQ |
| `backoff` | `'fixed' \| 'linear' \| 'exponential'` | `'exponential'` | Delay strategy between retries |
| `baseDelay` | `number` | `1000` | Base delay in milliseconds |
| `timeout` | `number` | — | Per-attempt timeout in ms. Hanging attempts are killed automatically |
| `jitter` | `boolean` | `false` | Randomises delay to prevent multiple jobs retrying at the same instant |
| `dlq` | `'memory' \| 'file' \| 'redis' \| DLQBackend` | `'memory'` | Where to store permanently failed jobs |
| `dlqFilePath` | `string` | `'./job-retry-dlq.json'` | File path — only used when `dlq: 'file'` |
| `dlqRedisClient` | `Redis` | — | ioredis client — only used when `dlq: 'redis'` |
| `onRetry` | `(error, attempt) => void` | — | Called after each failed attempt except the last |
| `onFailure` | `(job: DLQEntry) => void` | — | Called when a job is moved to the DLQ |
| `onSuccess` | `(result, attempts) => void` | — | Called on success when at least one retry was needed |

---

## Backoff strategies

### Exponential *(recommended)*
Doubles the wait each attempt. Best for most cases.
```
attempt 1 → wait 1s
attempt 2 → wait 2s
attempt 3 → wait 4s
attempt 4 → wait 8s
```

### Linear
Adds `baseDelay` each attempt.
```
attempt 1 → wait 1s
attempt 2 → wait 2s
attempt 3 → wait 3s
```

### Fixed
Same wait every time.
```
every attempt → wait 1s
```

### Jitter
Adds `random(0, delay)` on top of any strategy. Prevents multiple jobs from all retrying at the same millisecond after a shared outage.

---

## Dead letter queue

When a job exhausts all attempts, it's saved to the DLQ with full context — name, error message, timestamp, and attempt count. Nothing is silently dropped.

```ts
// Inspect what failed
const failed = await runner.dlq.getAll();
console.log(failed);
// [{ id, name, error, timestamp, attempts }]

// Retry a specific job after you've fixed the issue
await runner.dlq.retry(failed[0].id, runner);

// Remove or clear
await runner.dlq.remove(failed[0].id);
await runner.dlq.clear();

// Count
const count = await runner.dlq.size();
```

---

## DLQ backends

### Memory *(default)*

```ts
new JobRetry({ dlq: 'memory' })
```

In-process array. Lost on restart. Perfect for development and testing.

---

### File

```ts
new JobRetry({
  dlq: 'file',
  dlqFilePath: './failed-jobs.json',
})
```

Persists to a JSON file. Survives restarts. Good for single-server apps.

---

### Redis *(production)*

```ts
import Redis from 'ioredis';

new JobRetry({
  dlq: 'redis',
  dlqRedisClient: new Redis({ host: 'localhost', port: 6379 }),
})
```

Stored as Redis hashes. Shared across multiple servers, survives restarts. Built for production.

---

### Custom backend

Implement the `DLQBackend` interface and pass it directly:

```ts
import type { DLQBackend, DLQEntry, JobRetry } from 'job-retry';

class PostgresDLQ implements DLQBackend {
  async push(entry: DLQEntry)                          { /* INSERT */ }
  async getAll()                                       { /* SELECT */ }
  async get(id: string)                                { /* SELECT WHERE id */ }
  async retry(id: string, runner: JobRetry)            { /* remove + runner.run */ }
  async remove(id: string)                             { /* DELETE */ }
  async clear()                                        { /* TRUNCATE */ }
  async size()                                         { /* COUNT */ }
}

new JobRetry({ dlq: new PostgresDLQ() })
```

---

## Error handling

```ts
import { MaxAttemptsExceededError, TimeoutError } from 'job-retry';

try {
  await runner.run('myJob', fn);
} catch (err) {
  if (err instanceof MaxAttemptsExceededError) {
    console.log(`Failed after ${err.attempts} attempts`);
    console.log('Last error:', err.cause); // the underlying error
  }
}
```

`TimeoutError` is thrown internally when a per-attempt timeout fires. It becomes `err.cause` on `MaxAttemptsExceededError`.

---

## TypeScript

Full types ship with the package — no `@types/job-retry` needed.

```ts
import type {
  RetryOptions,
  DLQEntry,
  DLQBackend,
  BackoffStrategy,
} from 'job-retry';
```

---

## DLQ API reference

| Method | Returns | Description |
|---|---|---|
| `dlq.getAll()` | `Promise<DLQEntry[]>` | All entries in the queue |
| `dlq.get(id)` | `Promise<DLQEntry \| null>` | Single entry by ID |
| `dlq.retry(id, runner)` | `Promise<unknown>` | Re-runs the original fn, removes entry on success |
| `dlq.remove(id)` | `Promise<void>` | Deletes one entry |
| `dlq.clear()` | `Promise<void>` | Empties the entire queue |
| `dlq.size()` | `Promise<number>` | Number of entries |

---

## License

MIT © [Rajat Thakur](https://github.com/rajatdh27)
