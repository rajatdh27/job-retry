export class MaxAttemptsExceededError extends Error {
  readonly attempts: number;

  constructor(attempts: number, cause?: unknown) {
    super(`Job failed after ${attempts} attempt${attempts === 1 ? '' : 's'}`);
    this.name = 'MaxAttemptsExceededError';
    this.attempts = attempts;
    if (cause instanceof Error) {
      (this as unknown as { cause: Error }).cause = cause;
    }
  }
}

export class TimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Job timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}
