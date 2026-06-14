import { JobRetry } from '../src';

const runner = new JobRetry({
  attempts: 3,
  backoff: 'exponential',
  baseDelay: 500,
  dlq: 'file',
  dlqFilePath: './failed-jobs.json',
  onFailure: (job) => console.error(`[DLQ] Saved failed job: ${job.name} (id: ${job.id})`),
});

(async () => {
  try {
    await runner.run('fetchData', async () => {
      throw new Error('Remote API unreachable');
    });
  } catch {
    // The failed job is now in failed-jobs.json.
    // Later, after the API is back up, load it and retry:
    const all = await runner.dlq.getAll();
    if (all.length > 0) {
      console.log(`Retrying ${all.length} failed job(s)...`);
      for (const entry of all) {
        try {
          await runner.dlq.retry(entry.id, runner);
          console.log(`Replayed job ${entry.id}`);
        } catch (err) {
          console.error(`Replay failed for ${entry.id}:`, err);
        }
      }
    }
  }
})();
