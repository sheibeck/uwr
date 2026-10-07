import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { createSecondsTick } from './secondsTick';

let now = 1_000_000;
const clock = { nowMicros: () => now };

beforeEach(() => {
  vi.useFakeTimers();
  now = 1_000_000;
});
afterEach(() => {
  vi.useRealTimers();
});

describe('createSecondsTick', () => {
  it('does not run while inactive and holds the clock at creation', () => {
    const scope = effectScope();
    const tick = scope.run(() => createSecondsTick({ clock, active: ref(false) }))!;
    now = 5_000_000;
    vi.advanceTimersByTime(3000);
    expect(tick.nowMicros.value).toBe(1_000_000);
    expect(vi.getTimerCount()).toBe(0);
    scope.stop();
  });

  it('follows the clock each second while active', () => {
    const scope = effectScope();
    const active = ref(true);
    const tick = scope.run(() => createSecondsTick({ clock, active }))!;
    expect(vi.getTimerCount()).toBe(1);
    now = 2_000_000;
    vi.advanceTimersByTime(1000);
    expect(tick.nowMicros.value).toBe(2_000_000);
    now = 3_000_000;
    vi.advanceTimersByTime(1000);
    expect(tick.nowMicros.value).toBe(3_000_000);
    scope.stop();
  });

  it('stops when it turns inactive', async () => {
    const scope = effectScope();
    const active = ref(true);
    scope.run(() => createSecondsTick({ clock, active }));
    expect(vi.getTimerCount()).toBe(1);
    active.value = false;
    await nextTick();
    expect(vi.getTimerCount()).toBe(0);
    scope.stop();
  });

  it('clears the interval when the scope stops', () => {
    const scope = effectScope();
    scope.run(() => createSecondsTick({ clock, active: ref(true) }));
    expect(vi.getTimerCount()).toBe(1);
    scope.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('refresh samples the clock at once', () => {
    const scope = effectScope();
    const tick = scope.run(() => createSecondsTick({ clock, active: ref(false) }))!;
    now = 9_000_000;
    tick.refresh();
    expect(tick.nowMicros.value).toBe(9_000_000);
    scope.stop();
  });
});
