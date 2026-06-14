import { calculateDelay } from '../src/backoff';

describe('calculateDelay', () => {
  describe('fixed', () => {
    it('returns baseDelay for every attempt', () => {
      expect(calculateDelay(1, 'fixed', 1000, false)).toBe(1000);
      expect(calculateDelay(3, 'fixed', 1000, false)).toBe(1000);
      expect(calculateDelay(5, 'fixed', 1000, false)).toBe(1000);
    });
  });

  describe('linear', () => {
    it('grows by baseDelay each attempt', () => {
      expect(calculateDelay(1, 'linear', 500, false)).toBe(500);
      expect(calculateDelay(2, 'linear', 500, false)).toBe(1000);
      expect(calculateDelay(4, 'linear', 500, false)).toBe(2000);
    });
  });

  describe('exponential', () => {
    it('doubles each attempt starting from baseDelay', () => {
      expect(calculateDelay(1, 'exponential', 1000, false)).toBe(1000);
      expect(calculateDelay(2, 'exponential', 1000, false)).toBe(2000);
      expect(calculateDelay(3, 'exponential', 1000, false)).toBe(4000);
      expect(calculateDelay(4, 'exponential', 1000, false)).toBe(8000);
    });
  });

  describe('jitter', () => {
    it('returns a value between delay and 2x delay', () => {
      const base = 1000;
      for (let i = 0; i < 50; i++) {
        const result = calculateDelay(1, 'exponential', base, true);
        expect(result).toBeGreaterThanOrEqual(base);
        expect(result).toBeLessThanOrEqual(base * 2);
      }
    });
  });
});
