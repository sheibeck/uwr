import { afterEach, describe, expect, it, vi } from 'vitest';
import { TRIP_LAPSE_MS, createTripGuard } from './tripGuard';

afterEach(() => {
  vi.useRealTimers();
});

describe('createTripGuard', () => {
  it('lets one trip start and refuses a second while it is pending', () => {
    vi.useFakeTimers();
    const guard = createTripGuard();
    expect(guard.pending.value).toBe(false);
    expect(guard.begin()).toBe(true);
    expect(guard.pending.value).toBe(true);
    expect(guard.begin()).toBe(false);
  });

  it('end releases at once', () => {
    vi.useFakeTimers();
    const guard = createTripGuard();
    guard.begin();
    guard.end();
    expect(guard.pending.value).toBe(false);
    expect(guard.begin()).toBe(true);
  });

  it('lapses by itself after TRIP_LAPSE_MS (a refused trip leaves the place unchanged)', () => {
    vi.useFakeTimers();
    const guard = createTripGuard();
    guard.begin();
    vi.advanceTimersByTime(TRIP_LAPSE_MS - 1);
    expect(guard.pending.value).toBe(true);
    vi.advanceTimersByTime(1);
    expect(guard.pending.value).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('an end before the lapse leaves no timer behind', () => {
    vi.useFakeTimers();
    const guard = createTripGuard();
    guard.begin();
    guard.end();
    expect(vi.getTimerCount()).toBe(0);
  });
});
