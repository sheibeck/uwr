import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { useActionProgress } from './useActionProgress';
import type { CastRow, GatherRow } from './actionProgress';

const S = 1_000_000;
const T = 1_700_000_000 * S;

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

function setup() {
  let now = T;
  const gathers = ref<readonly GatherRow[]>([]);
  const casts = ref<readonly CastRow[]>([]);
  const inCombat = ref(false);
  const scope = effectScope();
  const result = scope.run(() =>
    useActionProgress({
      characterId: ref<bigint | null>(5n),
      gathers,
      casts,
      nodes: ref([{ id: 3n, name: 'Ironwood' }]),
      abilities: ref([{ id: 20n, name: 'Mend', kind: 'heal', castSeconds: 2n }]),
      inCombat,
      clock: { nowMicros: () => now },
    }),
  )!;
  return {
    ...result,
    gathers,
    casts,
    inCombat,
    scope,
    setNow: (value: number) => {
      now = value;
    },
  };
}

const gatherRow = (id: bigint, endsAt: number): GatherRow => ({
  id,
  characterId: 5n,
  nodeId: 3n,
  endsAtMicros: BigInt(endsAt),
});

const castRow = (id: bigint, endsAt: number): CastRow => ({
  id,
  characterId: 5n,
  abilityTemplateId: 20n,
  endsAtMicros: BigInt(endsAt),
});

describe('useActionProgress', () => {
  it('appears with a gather row', async () => {
    const h = setup();
    expect(h.action.value).toBeNull();
    expect(h.progress.value).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    h.gathers.value = [gatherRow(1n, T + 8 * S)];
    await nextTick();
    expect(h.action.value?.label).toBe('Gathering Ironwood');
    expect(h.progress.value?.seconds).toBe(8);
    expect(h.progress.value?.fraction).toBe(0);
    expect(vi.getTimerCount()).toBe(1);
    h.scope.stop();
  });

  it('ticks the seconds and the fraction', async () => {
    const h = setup();
    h.gathers.value = [gatherRow(1n, T + 8 * S)];
    await nextTick();
    h.setNow(T + 3 * S);
    vi.advanceTimersByTime(250);
    expect(h.progress.value?.seconds).toBe(5);
    expect(h.progress.value?.percent).toBe(38);
    h.scope.stop();
  });

  it('is finishing past the end while the row exists', async () => {
    const h = setup();
    h.gathers.value = [gatherRow(1n, T + 8 * S)];
    await nextTick();
    h.setNow(T + 9 * S);
    vi.advanceTimersByTime(250);
    expect(h.action.value).not.toBeNull();
    expect(h.progress.value?.finishing).toBe(true);
    h.scope.stop();
  });

  it('clears with the row, drops first-seen and stops the timer', async () => {
    const h = setup();
    h.gathers.value = [gatherRow(1n, T + 8 * S)];
    await nextTick();
    h.setNow(T + 4 * S);
    vi.advanceTimersByTime(250);
    expect(h.progress.value?.fraction).toBe(0.5);
    h.gathers.value = [];
    await nextTick();
    expect(h.action.value).toBeNull();
    expect(h.progress.value).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    h.gathers.value = [gatherRow(1n, T + 12 * S)];
    await nextTick();
    expect(h.progress.value?.fraction).toBe(0);
    expect(h.progress.value?.seconds).toBe(8);
    h.scope.stop();
  });

  it('shows a cast over a gather and returns to the gather from its first-seen start', async () => {
    const h = setup();
    h.gathers.value = [gatherRow(1n, T + 8 * S)];
    await nextTick();
    h.setNow(T + 2 * S);
    vi.advanceTimersByTime(250);
    h.casts.value = [castRow(7n, T + 4 * S)];
    await nextTick();
    expect(h.action.value?.label).toBe('Casting Mend');
    h.casts.value = [];
    await nextTick();
    expect(h.action.value?.label).toBe('Gathering Ironwood');
    // 2 s of 8 s elapsed since T.
    expect(h.progress.value?.fraction).toBe(0.25);
    h.scope.stop();
  });

  it('shows nothing and runs no timer in combat', async () => {
    const h = setup();
    h.gathers.value = [gatherRow(1n, T + 8 * S)];
    h.inCombat.value = true;
    await nextTick();
    expect(h.action.value).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    h.inCombat.value = false;
    await nextTick();
    expect(h.action.value).not.toBeNull();
    expect(vi.getTimerCount()).toBe(1);
    h.scope.stop();
  });

  it('steps once per second under reduced motion', async () => {
    stubReducedMotion(true);
    const h = setup();
    h.gathers.value = [gatherRow(1n, T + 8 * S)];
    await nextTick();
    h.setNow(T + 3 * S);
    vi.advanceTimersByTime(250);
    expect(h.progress.value?.seconds).toBe(8);
    vi.advanceTimersByTime(750);
    expect(h.progress.value?.seconds).toBe(5);
    h.scope.stop();
  });

  it('clears the interval when the scope stops', async () => {
    const h = setup();
    h.gathers.value = [gatherRow(1n, T + 8 * S)];
    await nextTick();
    expect(vi.getTimerCount()).toBe(1);
    h.scope.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
