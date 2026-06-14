export type BackoffStrategy = 'fixed' | 'linear' | 'exponential';

export interface DLQEntry {
  id: string;
  name: string;
  error: string;
  timestamp: number;
  attempts: number;
  payload?: unknown;
}

export interface DLQBackend {
  push(entry: DLQEntry): Promise<void>;
  getAll(): Promise<DLQEntry[]>;
  get(id: string): Promise<DLQEntry | null>;
  retry(id: string, runner: import('./JobRetry').JobRetry): Promise<unknown>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
  size(): Promise<number>;
}

export type DLQType = 'memory' | 'file' | 'redis';

export interface RetryOptions {
  attempts?: number;
  backoff?: BackoffStrategy;
  baseDelay?: number;
  timeout?: number;
  jitter?: boolean;
  dlq?: DLQType | DLQBackend;
  dlqFilePath?: string;
  dlqRedisClient?: import('ioredis').Redis;
  onRetry?: (error: unknown, attempt: number) => void;
  onFailure?: (job: DLQEntry) => void;
  onSuccess?: (result: unknown, attempts: number) => void;
}
