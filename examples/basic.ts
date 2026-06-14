import { JobRetry } from '../src';

async function sendEmail(_to: string): Promise<string> {
  if (Math.random() < 0.7) throw new Error('SMTP connection refused');
  return 'sent';
}

const runner = new JobRetry({
  attempts: 5,
  backoff: 'exponential',
  baseDelay: 1000,
  timeout: 5000,
  jitter: true,
  dlq: 'memory',
  onRetry: (error, attempt) => console.log(`Attempt ${attempt} failed:`, error),
  onFailure: (job) => console.error('Job permanently failed:', job),
  onSuccess: (_result, attempts) => console.log(`Succeeded after ${attempts} tries`),
});

(async () => {
  try {
    const result = await runner.run('sendEmail', () => sendEmail('user@example.com'));
    console.log('Result:', result);
  } catch {
    console.log('All attempts exhausted. Checking DLQ...');
    const failed = await runner.dlq.getAll();
    console.log('DLQ entries:', failed.length);
  }
})();
