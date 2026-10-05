import { describe, expect, it } from 'vitest';
import { BACKOFF_MS, backoffDelayMs } from './backoff';

describe('backoffDelayMs', () => {
  it('follows 1, 2, 5, 10, 20, 30 s and then holds at 30 s', () => {
    const delays = [0, 1, 2, 3, 4, 5, 6, 7].map(backoffDelayMs);
    expect(delays).toEqual([1000, 2000, 5000, 10000, 20000, 30000, 30000, 30000]);
  });

  it('treats a negative attempt as the first step', () => {
    expect(backoffDelayMs(-1)).toBe(1000);
  });

  it('exposes the schedule', () => {
    expect(BACKOFF_MS).toEqual([1000, 2000, 5000, 10000, 20000, 30000]);
  });
});
