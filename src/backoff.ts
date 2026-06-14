import type { BackoffStrategy } from './types';

export function calculateDelay(
  attempt: number,
  strategy: BackoffStrategy,
  baseDelay: number,
  jitter: boolean,
): number {
  let delay: number;

  switch (strategy) {
    case 'fixed':
      delay = baseDelay;
      break;
    case 'linear':
      delay = baseDelay * attempt;
      break;
    case 'exponential':
      delay = baseDelay * Math.pow(2, attempt - 1);
      break;
  }

  if (jitter) {
    delay = delay + Math.random() * delay;
  }

  return Math.round(delay);
}
