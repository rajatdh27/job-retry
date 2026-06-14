import { randomUUID } from 'crypto';
import { calculateDelay } from './backoff';
import { withTimeout } from './timeout';
import { MaxAttemptsExceededError } from './errors';
import { MemoryDLQ } from './dlq/MemoryDLQ';
import { FileDLQ } from './dlq/FileDLQ';
import { RedisDLQ } from './dlq/RedisDLQ';
import type { RetryOptions, DLQBackend, DLQEntry } from './types';

const DEFAULTS = {
  attempts: 3,
  backoff: 'exponential',
  baseDelay: 1000,
  jitter: false,
} as const;

export class JobRetry {
  private readonly opts: Required<Pick<RetryOptions, 'attempts' | 'backoff' | 'baseDelay' | 'jitter'>> & RetryOptions;
  readonly dlq: DLQBackend;

  // Stores the fn for replay when a DLQ entry is retried
  private replayFns: Map<string, () => Promise<unknown>> = new Map();

  constructor(opts: RetryOptions = {}) {
    this.opts = { ...DEFAULTS, ...opts };
    this.dlq = this.resolveDLQ(opts);
  }

  async run<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const maxAttempts = this.opts.attempts ?? DEFAULTS.attempts;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const promise = this.opts.timeout
          ? withTimeout(fn(), this.opts.timeout)
          : fn();
        const result = await promise as T;

        if (attempt > 1) {
          this.opts.onSuccess?.(result, attempt);
        }
        return result;
      } catch (err) {
        lastError = err;

        if (attempt < maxAttempts) {
          this.opts.onRetry?.(err, attempt);
          const delay = calculateDelay(
            attempt,
            this.opts.backoff ?? DEFAULTS.backoff,
            this.opts.baseDelay ?? DEFAULTS.baseDelay,
            this.opts.jitter ?? DEFAULTS.jitter,
          );
          await sleep(delay);
        }
      }
    }

    const entry: DLQEntry = {
      id: randomUUID(),
      name,
      error: errorMessage(lastError),
      timestamp: Date.now(),
      attempts: maxAttempts,
    };

    // Store fn for later replay via dlq.retry()
    this.replayFns.set(entry.id, fn as () => Promise<unknown>);

    await this.dlq.push(entry);
    this.opts.onFailure?.(entry);

    throw new MaxAttemptsExceededError(maxAttempts, lastError instanceof Error ? lastError : undefined);
  }

  replayEntry(entry: DLQEntry): Promise<unknown> {
    const fn = this.replayFns.get(entry.id);
    if (!fn) {
      throw new Error(
        `No replay function found for job "${entry.name}" (id: ${entry.id}). ` +
        'Replay is only available within the same process that originally ran the job.',
      );
    }
    this.replayFns.delete(entry.id);
    return fn();
  }

  private resolveDLQ(opts: RetryOptions): DLQBackend {
    const backend = opts.dlq;

    if (!backend || backend === 'memory') return new MemoryDLQ();
    if (backend === 'file') return new FileDLQ(opts.dlqFilePath);
    if (backend === 'redis') {
      if (!opts.dlqRedisClient) {
        throw new Error('dlqRedisClient is required when dlq is "redis"');
      }
      return new RedisDLQ(opts.dlqRedisClient);
    }
    // Custom backend passed directly
    return backend;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
