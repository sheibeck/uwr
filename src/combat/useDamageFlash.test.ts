import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { barFraction } from '../frame/vitals';
import { DELTA_MS, FLASH_COLOR_MS, useDamageFlash } from './useDamageFlash';

function stubReducedMotion(reduced: boolean): void {
  vi.stubGlobal('window', {
    matchMedia: (query: string) => ({ matches: reduced && query.includes('reduce') }),
  });
}

function pct(fraction: number): string {
  return `${Math.round(fraction * 10000) / 100}%`;
}

/** Key and hp live in one ref, as they do when both come from the character row. */
function setup(initial = { key: 1n as bigint | null, hp: 200n }, maxHp = 260n) {
  const state = ref(initial);
  const scope = effectScope();
  const flash = scope.run(() =>
    useDamageFlash({ hp: () => state.value.hp, maxHp: () => maxHp, key: () => state.value.key }),
  )!;
  return { state, scope, flash };
}

beforeEach(() => {
  vi.useFakeTimers();
  stubReducedMotion(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useDamageFlash', () => {
  it('exports the timings', () => {
    expect(FLASH_COLOR_MS).toBe(600);
    expect(DELTA_MS).toBe(1500);
  });

  it('does not flash on the first value', () => {
    const { flash, scope } = setup();
    expect(flash.active.value).toBe(false);
    expect(flash.delta.value).toBeNull();
    expect(flash.ghost.value).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    scope.stop();
  });

  it('flashes on a drop: ghost chunk, delta, then clears on the two timers', () => {
    const { state, flash, scope } = setup();
    state.value = { key: 1n, hp: 178n };
    expect(flash.active.value).toBe(true);
    expect(flash.reduced.value).toBe(false);
    expect(flash.delta.value).toBe(22n);
    expect(flash.ghost.value).toEqual({ left: pct(barFraction(178n, 260n)), width: pct(22 / 260) });
    expect(flash.ghost.value!.left).toBe('68.46%');
    expect(flash.ghost.value!.width).toBe('8.46%');

    vi.advanceTimersByTime(FLASH_COLOR_MS - 1);
    expect(flash.active.value).toBe(true);
    vi.advanceTimersByTime(1);
    expect(flash.active.value).toBe(false);
    expect(flash.ghost.value).toBeNull();
    expect(flash.delta.value).toBe(22n);

    vi.advanceTimersByTime(DELTA_MS - FLASH_COLOR_MS - 1);
    expect(flash.delta.value).toBe(22n);
    vi.advanceTimersByTime(1);
    expect(flash.delta.value).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    scope.stop();
  });

  it('sums drops inside the window and restarts the delta timer', () => {
    const { state, flash, scope } = setup();
    state.value = { key: 1n, hp: 178n };
    vi.advanceTimersByTime(1000);
    state.value = { key: 1n, hp: 168n };
    expect(flash.delta.value).toBe(32n);
    expect(flash.active.value).toBe(true);
    expect(vi.getTimerCount()).toBe(2); // restarted, not stacked

    vi.advanceTimersByTime(DELTA_MS - 1);
    expect(flash.delta.value).toBe(32n);
    vi.advanceTimersByTime(1);
    expect(flash.delta.value).toBeNull();
    scope.stop();
  });

  it('starts a fresh delta for a drop after the window ended', () => {
    const { state, flash, scope } = setup();
    state.value = { key: 1n, hp: 178n };
    vi.advanceTimersByTime(DELTA_MS);
    expect(flash.delta.value).toBeNull();
    state.value = { key: 1n, hp: 170n };
    expect(flash.delta.value).toBe(8n);
    scope.stop();
  });

  it('never flashes on a heal and leaves the delta alone', () => {
    const { state, flash, scope } = setup();
    state.value = { key: 1n, hp: 178n };
    vi.advanceTimersByTime(FLASH_COLOR_MS);
    expect(flash.active.value).toBe(false);
    state.value = { key: 1n, hp: 190n };
    expect(flash.active.value).toBe(false);
    expect(flash.ghost.value).toBeNull();
    expect(flash.delta.value).toBe(22n); // a drop then a heal keeps the delta until its timer ends
    vi.advanceTimersByTime(DELTA_MS - FLASH_COLOR_MS);
    expect(flash.delta.value).toBeNull();
    scope.stop();
  });

  it('a heal then a drop compares against the healed value', () => {
    const { state, flash, scope } = setup();
    state.value = { key: 1n, hp: 250n };
    expect(flash.delta.value).toBeNull();
    state.value = { key: 1n, hp: 240n };
    expect(flash.delta.value).toBe(10n);
    scope.stop();
  });

  it('does not flash on a character switch and compares from the new value', () => {
    const { state, flash, scope } = setup();
    state.value = { key: 2n, hp: 50n };
    expect(flash.active.value).toBe(false);
    expect(flash.delta.value).toBeNull();
    expect(flash.ghost.value).toBeNull();
    state.value = { key: 2n, hp: 40n };
    expect(flash.delta.value).toBe(10n);
    expect(flash.active.value).toBe(true);
    scope.stop();
  });

  it('a switch drops a pending flash of the previous character', () => {
    const { state, flash, scope } = setup();
    state.value = { key: 1n, hp: 178n };
    state.value = { key: 2n, hp: 300n };
    expect(flash.active.value).toBe(false);
    expect(flash.delta.value).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    scope.stop();
  });

  it('treats a null key as its own character', () => {
    const { state, flash, scope } = setup({ key: null, hp: 0n });
    state.value = { key: 1n, hp: 100n };
    expect(flash.active.value).toBe(false);
    state.value = { key: 1n, hp: 90n };
    expect(flash.delta.value).toBe(10n);
    scope.stop();
  });

  it('under reduced motion uses the same timed state with the reduced flag', () => {
    stubReducedMotion(true);
    const { state, flash, scope } = setup();
    state.value = { key: 1n, hp: 178n };
    expect(flash.reduced.value).toBe(true);
    expect(flash.active.value).toBe(true);
    expect(flash.delta.value).toBe(22n);
    vi.advanceTimersByTime(FLASH_COLOR_MS);
    expect(flash.active.value).toBe(false);
    expect(flash.delta.value).toBe(22n);
    vi.advanceTimersByTime(DELTA_MS - FLASH_COLOR_MS);
    expect(flash.delta.value).toBeNull();
    scope.stop();
  });

  it('reads the reduced-motion preference at the drop, not at setup', () => {
    const { state, flash, scope } = setup();
    state.value = { key: 1n, hp: 190n };
    expect(flash.reduced.value).toBe(false);
    stubReducedMotion(true);
    state.value = { key: 1n, hp: 180n };
    expect(flash.reduced.value).toBe(true);
    scope.stop();
  });

  it('gives an empty ghost when max HP is not positive', () => {
    const { state, flash, scope } = setup({ key: 1n, hp: 20n }, 0n);
    state.value = { key: 1n, hp: 10n };
    expect(flash.ghost.value).toEqual({ left: '0%', width: '0%' });
    expect(flash.delta.value).toBe(10n);
    scope.stop();
  });

  it('clears every timer when the scope stops and changes nothing after', () => {
    const { state, flash, scope } = setup();
    state.value = { key: 1n, hp: 178n };
    expect(vi.getTimerCount()).toBe(2);
    scope.stop();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(flash.active.value).toBe(true);
    expect(flash.delta.value).toBe(22n);
  });
});
