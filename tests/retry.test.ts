import { JobRetry, MaxAttemptsExceededError } from '../src';

jest.useFakeTimers();

describe('JobRetry', () => {
  describe('successful runs', () => {
    it('returns the result on first attempt', async () => {
      const runner = new JobRetry({ baseDelay: 0 });
      const result = await runner.run('test', async () => 42);
      expect(result).toBe(42);
    });

    it('retries and succeeds on a later attempt', async () => {
      const runner = new JobRetry({ attempts: 3, baseDelay: 10 });
      let calls = 0;
      const promise = runner.run('test', async () => {
        calls++;
        if (calls < 3) throw new Error('not yet');
        return 'ok';
      });
      await jest.runAllTimersAsync();
      expect(await promise).toBe('ok');
      expect(calls).toBe(3);
    });

    it('fires onSuccess with attempt count when retries were needed', async () => {
      const onSuccess = jest.fn();
      const runner = new JobRetry({ attempts: 3, baseDelay: 10, onSuccess });
      let calls = 0;
      const promise = runner.run('test', async () => {
        calls++;
        if (calls < 2) throw new Error('fail');
        return 'done';
      });
      await jest.runAllTimersAsync();
      await promise;
      expect(onSuccess).toHaveBeenCalledWith('done', 2);
    });

    it('does not fire onSuccess on first-attempt success', async () => {
      const onSuccess = jest.fn();
      const runner = new JobRetry({ baseDelay: 0, onSuccess });
      await runner.run('test', async () => 'hi');
      expect(onSuccess).not.toHaveBeenCalled();
    });
  });

  describe('permanent failure', () => {
    it('throws MaxAttemptsExceededError after all attempts', async () => {
      const runner = new JobRetry({ attempts: 3, baseDelay: 10 });
      const promise = runner.run('test', async () => {
        throw new Error('always fails');
      });
      promise.catch(() => {});
      await jest.runAllTimersAsync();
      await expect(promise).rejects.toBeInstanceOf(MaxAttemptsExceededError);
    });

    it('pushes the job to the DLQ on permanent failure', async () => {
      const runner = new JobRetry({ attempts: 2, baseDelay: 10 });
      const promise = runner.run('myJob', async () => {
        throw new Error('boom');
      });
      promise.catch(() => {});
      await jest.runAllTimersAsync();
      await expect(promise).rejects.toThrow();

      const all = await runner.dlq.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].name).toBe('myJob');
      expect(all[0].error).toBe('boom');
      expect(all[0].attempts).toBe(2);
    });

    it('fires onFailure with the DLQ entry', async () => {
      const onFailure = jest.fn();
      const runner = new JobRetry({ attempts: 2, baseDelay: 10, onFailure });
      const promise = runner.run('job', async () => {
        throw new Error('nope');
      });
      promise.catch(() => {});
      await jest.runAllTimersAsync();
      await expect(promise).rejects.toThrow();
      expect(onFailure).toHaveBeenCalledTimes(1);
      expect(onFailure.mock.calls[0][0]).toMatchObject({ name: 'job' });
    });

    it('fires onRetry for each intermediate failure', async () => {
      const onRetry = jest.fn();
      const runner = new JobRetry({ attempts: 3, baseDelay: 10, onRetry });
      const promise = runner.run('job', async () => {
        throw new Error('x');
      });
      promise.catch(() => {});
      await jest.runAllTimersAsync();
      await expect(promise).rejects.toThrow();
      expect(onRetry).toHaveBeenCalledTimes(2);
    });
  });

  describe('timeout', () => {
    it('throws MaxAttemptsExceededError wrapping a TimeoutError when attempt hangs', async () => {
      const runner = new JobRetry({ attempts: 1, timeout: 100, baseDelay: 0 });
      const promise = runner.run('slow', () => new Promise(() => {}));
      promise.catch(() => {});
      await jest.runAllTimersAsync();
      await expect(promise).rejects.toBeInstanceOf(MaxAttemptsExceededError);
    });
  });

  describe('DLQ retry', () => {
    it('re-runs the original fn and removes the entry from DLQ', async () => {
      const runner = new JobRetry({ attempts: 1, baseDelay: 0 });
      let fixed = false;

      const promise = runner.run('job', async () => {
        if (!fixed) throw new Error('not fixed yet');
        return 'fixed!';
      });
      promise.catch(() => {});
      await jest.runAllTimersAsync();
      await expect(promise).rejects.toThrow();

      const [entry] = await runner.dlq.getAll();
      fixed = true;
      const result = await runner.dlq.retry(entry.id, runner);
      expect(result).toBe('fixed!');

      expect(await runner.dlq.size()).toBe(0);
    });
  });
});
