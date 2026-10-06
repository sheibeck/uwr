import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { createActionFirstSeen } from './actionFirstSeen';
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
  const skew = ref(0);
  const characterId = ref<bigint | null>(5n);
  const gathers = ref<readonly GatherRow[]>([]);
  const casts = ref<readonly CastRow[]>([]);
  const inCombat = ref(false);
  const clock = { skewMicros: skew, nowMicros: () => now + skew.value };
  // The data-layer first-seen map, in client time; shared by every composable of the test.
  const seen = createActionFirstSeen({ gathers, casts, now: () => now });
  const scope = effectScope();
  const mountComposable = (owner = scope) =>
    owner.run(() =>
      useActionProgress({
        characterId,
        gathers,
        casts,
        nodes: ref([{ id: 3n, name: 'Ironwood' }]),
        abilities: ref([{ id: 20n, name: 'Mend', kind: 'heal', castSeconds: 2n }]),
        inCombat,
        clock,
        firstSeen: seen.firstSeen,
      }),
    )!;
  const result = mountComposable();
  return {
    ...result,
    gathers,
    casts,
    characterId,
    inCombat,
    scope,
    skew,
    seen,
    mountComposable,
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

  it('re-bases first-seen when the skew is sampled after the row arrived', async () => {
    const h = setup();
    // The client reads T while the server reads T + 5 s; no event row has been sampled yet (skew 0).
    // The server inserted the row now, so it ends 8 s after the true server time.
    h.gathers.value = [gatherRow(1n, T + 5 * S + 8 * S)];
    await nextTick();
    expect(h.progress.value?.seconds).toBe(13);
    // The first event row samples the skew: the bar must not jump.
    h.skew.value = 5 * S;
    expect(h.progress.value?.seconds).toBe(8);
    expect(h.progress.value?.fraction).toBe(0);
    h.setNow(T + 4 * S);
    vi.advanceTimersByTime(250);
    expect(h.progress.value?.seconds).toBe(4);
    expect(h.progress.value?.fraction).toBe(0.5);
    h.scope.stop();
  });

  it('does not stay stuck at 0 when the client clock is ahead and the skew arrives late', async () => {
    const h = setup();
    // Client T, server T - 10 s: the row ends at server time T - 10 s + 8 s.
    h.gathers.value = [gatherRow(1n, T - 10 * S + 8 * S)];
    await nextTick();
    expect(h.progress.value?.finishing).toBe(true);
    h.skew.value = -10 * S;
    expect(h.progress.value?.finishing).toBe(false);
    expect(h.progress.value?.seconds).toBe(8);
    h.setNow(T + 2 * S);
    vi.advanceTimersByTime(250);
    expect(h.progress.value?.seconds).toBe(6);
    expect(h.progress.value?.fraction).toBe(0.25);
    h.scope.stop();
  });

  it('never reads more seconds than the total when a new action replaces a running one', async () => {
    stubReducedMotion(true);
    const h = setup();
    h.gathers.value = [gatherRow(1n, T + 8 * S)];
    await nextTick();
    // The clock moves on but the 1 s reduced-motion ticker has not fired yet.
    h.setNow(T + 1 * S);
    h.casts.value = [castRow(7n, T + 4 * S)];
    await nextTick();
    expect(h.action.value?.label).toBe('Casting Mend');
    // A 3 s window (seen at T + 1 s, ends at T + 4 s): at most 3s, bar at the start.
    expect(h.progress.value?.seconds).toBe(3);
    expect(h.progress.value?.fraction).toBe(0);
    h.scope.stop();
  });

  it('keeps the start across a remount of the consumer', async () => {
    const h = setup();
    h.gathers.value = [gatherRow(1n, T + 8 * S)];
    await nextTick();
    h.setNow(T + 4 * S);
    vi.advanceTimersByTime(250);
    expect(h.progress.value?.fraction).toBe(0.5);
    // FeedShell remounts (the desktop breakpoint): a new composable on the same data-layer map.
    h.scope.stop();
    expect(vi.getTimerCount()).toBe(0);
    const again = h.mountComposable(effectScope());
    expect(again.progress.value?.fraction).toBe(0.5);
    expect(again.progress.value?.seconds).toBe(4);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('keeps the start across a combat toggle', async () => {
    const h = setup();
    h.gathers.value = [gatherRow(1n, T + 8 * S)];
    await nextTick();
    h.setNow(T + 2 * S);
    h.inCombat.value = true;
    await nextTick();
    expect(h.progress.value).toBeNull();
    h.setNow(T + 4 * S);
    h.inCombat.value = false;
    await nextTick();
    expect(h.progress.value?.fraction).toBe(0.5);
    expect(h.progress.value?.seconds).toBe(4);
    h.scope.stop();
  });

  it('starts a cast seen mid-cast above 0 at once', async () => {
    const h = setup();
    // Mend takes 2 s; the row is first seen with 1 s left.
    h.casts.value = [castRow(7n, T + 1 * S)];
    await nextTick();
    expect(h.progress.value?.seconds).toBe(1);
    expect(h.progress.value?.fraction).toBe(0.5);
    h.setNow(T + 500_000);
    vi.advanceTimersByTime(250);
    expect(h.progress.value?.fraction).toBe(0.75);
    h.scope.stop();
  });

  it('measures an action that appears after mount from its own arrival', async () => {
    const h = setup();
    h.setNow(T + 30 * S);
    vi.advanceTimersByTime(5000);
    await nextTick();
    h.gathers.value = [gatherRow(1n, T + 38 * S)];
    await nextTick();
    expect(h.progress.value?.seconds).toBe(8);
    expect(h.progress.value?.fraction).toBe(0);
    h.setNow(T + 32 * S);
    vi.advanceTimersByTime(250);
    expect(h.progress.value?.seconds).toBe(6);
    expect(h.progress.value?.fraction).toBe(0.25);
    h.scope.stop();
  });

  it('shows nothing for another character and for logout, and resumes for the first', async () => {
    const h = setup();
    h.gathers.value = [gatherRow(1n, T + 8 * S)];
    await nextTick();
    // A character swap: the previous character's rows are still in the cache until the new binding applies.
    h.characterId.value = 6n;
    await nextTick();
    expect(h.action.value).toBeNull();
    expect(h.progress.value).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    h.characterId.value = null;
    await nextTick();
    expect(h.action.value).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    h.setNow(T + 2 * S);
    h.characterId.value = 5n;
    await nextTick();
    expect(h.action.value?.label).toBe('Gathering Ironwood');
    expect(h.progress.value?.fraction).toBe(0.25);
    h.scope.stop();
  });

  it('starts afresh after the first-seen map is reset (logout)', async () => {
    const h = setup();
    h.gathers.value = [gatherRow(1n, T + 8 * S)];
    await nextTick();
    h.setNow(T + 4 * S);
    vi.advanceTimersByTime(250);
    expect(h.progress.value?.fraction).toBe(0.5);
    h.gathers.value = [];
    h.seen.reset();
    await nextTick();
    expect(h.seen.firstSeen.value.size).toBe(0);
    h.gathers.value = [gatherRow(1n, T + 12 * S)];
    await nextTick();
    expect(h.progress.value?.fraction).toBe(0);
    expect(h.progress.value?.seconds).toBe(8);
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
