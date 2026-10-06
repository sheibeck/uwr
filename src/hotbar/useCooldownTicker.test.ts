import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { TICK_MS, TICK_MS_REDUCED, useCooldownTicker } from './useCooldownTicker';

function fakeClock(start = 1_000_000) {
  let now = start;
  return {
    clock: { nowMicros: () => now },
    set: (value: number) => {
      now = value;
    },
  };
}

function stubReducedMotion(reduced: boolean): void {
  vi.stubGlobal('window', {
    matchMedia: (query: string) => ({ matches: reduced && query.includes('reduce') }),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  stubReducedMotion(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useCooldownTicker', () => {
  it('exports the intervals', () => {
    expect(TICK_MS).toBe(250);
    expect(TICK_MS_REDUCED).toBe(1000);
  });

  it('starts from the clock and does not tick while inactive', () => {
    const c = fakeClock(5);
    const active = ref(false);
    const scope = effectScope();
    const ticker = scope.run(() => useCooldownTicker({ clock: c.clock, active }))!;
    expect(ticker.nowMicros.value).toBe(5);
    c.set(99);
    vi.advanceTimersByTime(5000);
    expect(ticker.nowMicros.value).toBe(5);
    expect(vi.getTimerCount()).toBe(0);
    scope.stop();
  });

  it('updates nowMicros every 250 ms while active', () => {
    const c = fakeClock(0);
    const active = ref(true);
    const scope = effectScope();
    const ticker = scope.run(() => useCooldownTicker({ clock: c.clock, active }))!;
    c.set(250_000);
    vi.advanceTimersByTime(249);
    expect(ticker.nowMicros.value).toBe(0);
    vi.advanceTimersByTime(1);
    expect(ticker.nowMicros.value).toBe(250_000);
    c.set(500_000);
    vi.advanceTimersByTime(250);
    expect(ticker.nowMicros.value).toBe(500_000);
    scope.stop();
  });

  it('ticks every 1000 ms under reduced motion', () => {
    stubReducedMotion(true);
    const c = fakeClock(0);
    const active = ref(true);
    const scope = effectScope();
    const ticker = scope.run(() => useCooldownTicker({ clock: c.clock, active }))!;
    c.set(1_000_000);
    vi.advanceTimersByTime(999);
    expect(ticker.nowMicros.value).toBe(0);
    vi.advanceTimersByTime(1);
    expect(ticker.nowMicros.value).toBe(1_000_000);
    scope.stop();
  });

  it('stops when active turns false and restarts when it turns true', async () => {
    const c = fakeClock(0);
    const active = ref(true);
    const scope = effectScope();
    const ticker = scope.run(() => useCooldownTicker({ clock: c.clock, active }))!;
    expect(vi.getTimerCount()).toBe(1);
    active.value = false;
    await nextTick();
    expect(vi.getTimerCount()).toBe(0);
    c.set(777);
    vi.advanceTimersByTime(2000);
    expect(ticker.nowMicros.value).toBe(0);
    active.value = true;
    await nextTick();
    expect(vi.getTimerCount()).toBe(1);
    expect(ticker.nowMicros.value).toBe(777);
    scope.stop();
  });

  it('keeps one interval when active is set true twice', async () => {
    const c = fakeClock(0);
    const active = ref(true);
    const scope = effectScope();
    scope.run(() => useCooldownTicker({ clock: c.clock, active }));
    active.value = false;
    active.value = true;
    await nextTick();
    expect(vi.getTimerCount()).toBe(1);
    scope.stop();
  });

  it('clears the interval when the scope stops', () => {
    const c = fakeClock(0);
    const active = ref(true);
    const scope = effectScope();
    scope.run(() => useCooldownTicker({ clock: c.clock, active }));
    expect(vi.getTimerCount()).toBe(1);
    scope.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
