import { describe, expect, it } from 'vitest';
import { createServerClock } from './serverClock';

describe('createServerClock', () => {
  it('starts with no skew and reports the client time in microseconds', () => {
    const clock = createServerClock(() => 1000);
    expect(clock.skewMicros.value).toBe(0);
    expect(clock.nowMicros()).toBe(1_000_000);
  });

  it('estimates skew from a server sample', () => {
    const clock = createServerClock(() => 1000);
    clock.sample(1_500_000n);
    expect(clock.skewMicros.value).toBe(500_000);
    expect(clock.nowMicros()).toBe(1_500_000);
  });

  it('lets the latest sample win and tracks the client clock', () => {
    let t = 1000;
    const clock = createServerClock(() => t);
    clock.sample(1_500_000n);
    t = 2000;
    expect(clock.nowMicros()).toBe(2_500_000);
    clock.sample(1_900_000n);
    expect(clock.skewMicros.value).toBe(-100_000);
    expect(clock.nowMicros()).toBe(1_900_000);
  });

  it('defaults to Date.now', () => {
    const clock = createServerClock();
    const before = Date.now() * 1000;
    const value = clock.nowMicros();
    expect(value).toBeGreaterThanOrEqual(before);
    expect(value).toBeLessThan(before + 5_000_000);
  });
});
