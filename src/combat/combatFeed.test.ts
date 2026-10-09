import { describe, expect, it } from 'vitest';
import { effectScope, ref, shallowRef } from 'vue';
import type { CombatData } from '../game/context';
import { createServerClock } from '../game/serverClock';
import { createFeedStore } from '../console/feedStore';
import { bindTable } from '../net/bindTable';
import type { ConnLike, TableLike } from '../net/bindTable';
import { wireCombatFeed } from './combatFeed';

// A synchronous schedule makes every ingest flush at once, so tests read the store directly.
function setup(overrides: Record<string, unknown> = {}) {
  const feed = createFeedStore({ schedule: (fn) => fn() });
  feed.setCharacter(5n);
  const clock = createServerClock(() => 7_000);
  const selfId = ref<bigint | null>(5n);
  const refs = {
    combatId: shallowRef<bigint | null>(10n),
    castsApplied: shallowRef(false),
    rounds: shallowRef<readonly any[]>([]),
    casts: shallowRef<readonly any[]>([]),
    enemies: shallowRef<readonly any[]>([{ id: 2n, combatId: 10n, enemyTemplateId: 3n, displayName: 'Rotfang' }]),
    enemyAbilities: shallowRef<readonly any[]>([
      { enemyTemplateId: 3n, abilityKey: 'bile_spray', name: 'Bile Spray' },
    ]),
    narratives: shallowRef<readonly any[]>([]),
    characterNames: shallowRef<ReadonlyMap<bigint, string>>(new Map([[5n, 'Hero'], [8n, 'Ally']])),
    petNames: shallowRef<ReadonlyMap<bigint, string>>(new Map()),
  };
  const combat = { ...refs, ...overrides } as unknown as CombatData;
  const scope = effectScope();
  const stop = scope.run(() => wireCombatFeed({ combat, feed, clock, selfId }))!;
  const keys = () => feed.entries.value.map((entry) => entry.key);
  return { feed, clock, refs, stop, scope, keys, selfId };
}

const round = (roundNumber: number, state: string, startedAt: number, combatId = 10n) => ({
  id: BigInt(roundNumber),
  combatId,
  roundNumber: BigInt(roundNumber),
  state,
  startedAtMicros: BigInt(startedAt),
});

const cast = (id: number, extra: Record<string, unknown> = {}) => ({
  id: BigInt(id),
  combatId: 10n,
  enemyId: 2n,
  abilityKey: 'bile_spray',
  targetCharacterId: 5n,
  targetPetId: undefined,
  announcedRound: 4n,
  landsAtRound: 6n,
  ...extra,
});

describe('wireCombatFeed: round headers', () => {
  it('adds one header for the open round of a first snapshot and none for resolved rows', () => {
    const t = setup();
    t.refs.rounds.value = [round(1, 'resolved', 100), round(2, 'action_select', 200)];
    expect(t.keys()).toEqual(['round:10:2']);
    expect(t.feed.entries.value[0].createdAtMicros).toBe(200n);
  });

  it('adds the next header when the round advances and nothing on a repeated update', () => {
    const t = setup();
    t.refs.rounds.value = [round(1, 'resolved', 100), round(2, 'action_select', 200)];
    t.refs.rounds.value = [round(2, 'resolved', 200), round(3, 'action_select', 300)];
    expect(t.keys()).toEqual(['round:10:2', 'round:10:3']);
    t.refs.rounds.value = [round(2, 'resolved', 200), round(3, 'action_select', 300)];
    expect(t.keys()).toEqual(['round:10:2', 'round:10:3']);
  });

  it('shows a Round 1 header at the fight start', () => {
    const t = setup();
    t.refs.rounds.value = [round(1, 'action_select', 100)];
    expect(t.keys()).toEqual(['round:10:1']);
    expect(t.feed.entries.value[0].message).toBe('Round 1');
  });

  it('adds nothing for a round whose startedAt is 0', () => {
    const t = setup();
    t.refs.rounds.value = [round(1, 'action_select', 0)];
    expect(t.keys()).toEqual([]);
  });

  it('stops watching when the stop function is called', () => {
    const t = setup();
    t.stop();
    t.refs.rounds.value = [round(1, 'action_select', 100)];
    expect(t.keys()).toEqual([]);
  });
});

describe('wireCombatFeed: wind-up blocks', () => {
  it('adds nothing for a row present before the cast subscription applied', () => {
    const t = setup();
    t.refs.casts.value = [cast(6)];
    expect(t.keys()).toEqual([]);
  });

  it('treats the rows present when the subscription applies as the snapshot', () => {
    const t = setup();
    t.refs.casts.value = [cast(6)];
    t.refs.castsApplied.value = true;
    expect(t.keys()).toEqual([]);
  });

  it('adds one block per new cast id after the snapshot, with the announcement N', () => {
    const t = setup();
    t.refs.casts.value = [cast(6)];
    t.refs.castsApplied.value = true;
    t.refs.casts.value = [cast(6), cast(7)];
    expect(t.keys()).toEqual(['windup:7']);
    const entry = t.feed.entries.value[0];
    expect(entry.message).toBe('Rotfang winds up Bile Spray → you · lands in 2 rounds');
    expect(entry.windup).toEqual({
      lead: 'Rotfang winds up ',
      ability: 'Bile Spray',
      tail: ' → you · lands in 2 rounds',
    });
    // The same id again, or a new array holding it, adds nothing.
    t.refs.casts.value = [cast(6), cast(7)];
    t.refs.casts.value = [cast(7)];
    expect(t.keys()).toEqual(['windup:7']);
  });

  it('names an ally target and says this round for a cast that lands at once', () => {
    const t = setup();
    t.refs.castsApplied.value = true;
    t.refs.casts.value = [cast(7, { targetCharacterId: 8n, announcedRound: 4n, landsAtRound: 4n })];
    expect(t.feed.entries.value[0].message).toBe('Rotfang winds up Bile Spray → Ally · lands this round');
  });

  it("names the enemy ally of a heal wind-up, never 'the party' (WR-01)", () => {
    const t = setup();
    t.refs.enemies.value = [
      { id: 2n, combatId: 10n, enemyTemplateId: 3n, displayName: 'Rotfang' },
      { id: 4n, combatId: 10n, enemyTemplateId: 3n, displayName: 'Goblin Brute' },
    ];
    t.refs.castsApplied.value = true;
    t.refs.casts.value = [cast(7, { targetCharacterId: undefined, targetEnemyId: 4n })];
    expect(t.feed.entries.value[0].message).toBe('Rotfang winds up Bile Spray → Goblin Brute · lands in 2 rounds');
    expect(t.feed.entries.value[0].message).not.toContain('the party');
  });

  it('places the block at the start of round announcedRound + 1 when that row is present', () => {
    const t = setup();
    t.refs.castsApplied.value = true;
    t.refs.rounds.value = [round(5, 'action_select', 5_000)];
    t.refs.casts.value = [cast(7)];
    const block = t.feed.entries.value.find((entry) => entry.key === 'windup:7')!;
    expect(block.createdAtMicros).toBe(5_000n);
  });

  it('places the block at the server clock now when round announcedRound + 1 is not in the rows', () => {
    const t = setup();
    t.refs.castsApplied.value = true;
    t.refs.casts.value = [cast(7)];
    const block = t.feed.entries.value[0];
    expect(typeof block.createdAtMicros).toBe('bigint');
    expect(block.createdAtMicros).toBe(7_000_000n);
  });

  it('seeds its own snapshot for a new combat id', () => {
    const t = setup();
    t.refs.castsApplied.value = true;
    t.refs.casts.value = [cast(7)];
    expect(t.keys()).toEqual(['windup:7']);
    t.refs.combatId.value = 11n;
    t.refs.castsApplied.value = false;
    t.refs.casts.value = [cast(9, { combatId: 11n })];
    t.refs.castsApplied.value = true;
    expect(t.keys()).toEqual(['windup:7']);
    t.refs.casts.value = [cast(9, { combatId: 11n }), cast(10, { combatId: 11n })];
    expect(t.keys()).toEqual(['windup:7', 'windup:10']);
  });

  it('ignores a cast row that belongs to another combat', () => {
    const t = setup();
    t.refs.castsApplied.value = true;
    t.refs.casts.value = [cast(7, { combatId: 99n })];
    expect(t.keys()).toEqual([]);
  });

  it('keeps ids already seen when the subscription re-applies', () => {
    const t = setup();
    t.refs.casts.value = [cast(6)];
    t.refs.castsApplied.value = true;
    t.refs.castsApplied.value = false;
    t.refs.castsApplied.value = true;
    expect(t.keys()).toEqual([]);
  });

  it('keeps markup in names as literal text', () => {
    const t = setup();
    t.refs.enemies.value = [
      { id: 2n, combatId: 10n, enemyTemplateId: 3n, displayName: '<img src=x onerror=alert(1)>' },
    ];
    t.refs.castsApplied.value = true;
    t.refs.casts.value = [cast(7)];
    expect(t.feed.entries.value[0].message).toBe(
      '<img src=x onerror=alert(1)> winds up Bile Spray → you · lands in 2 rounds',
    );
  });
});

describe('wireCombatFeed: wind-up blocks through the real bindTable', () => {
  // The SDK updates its cache, emits 'applied', and only then dispatches the row callbacks.
  function sdkOrderedCasts(initial: any[]) {
    const cache: any[] = [...initial];
    const inserts = new Set<(...args: unknown[]) => void>();
    let onApplied: (() => void) | null = null;
    const table: TableLike<any> = {
      iter: () => cache[Symbol.iterator](),
      onInsert: (cb) => void inserts.add(cb),
      removeOnInsert: (cb) => void inserts.delete(cb),
      onDelete: () => {},
      removeOnDelete: () => {},
    };
    const builder = {
      onApplied(cb: () => void) {
        onApplied = cb;
        return builder;
      },
      onError: () => builder,
      subscribe: () => ({ unsubscribe: () => {}, isActive: () => true, isEnded: () => false }),
    };
    const conn: ConnLike = { subscriptionBuilder: () => builder };
    const binding = bindTable<ConnLike, any>({ table: () => table, sql: ['SELECT * FROM combat_enemy_cast'] });
    binding.attach(conn);
    return {
      binding,
      // SubscribeApplied: applied first, then one insert callback per snapshot row.
      deliverSnapshot() {
        onApplied?.();
        for (const row of initial) inserts.forEach((cb) => cb({}, row));
      },
      arrive(row: any) {
        cache.push(row);
        inserts.forEach((cb) => cb({}, row));
      },
    };
  }

  function wired(initial: any[]) {
    const sdk = sdkOrderedCasts(initial);
    // The live rows follow the binding, as game/gameData.ts exposes them.
    const t = setup({ casts: sdk.binding.rows, castsApplied: sdk.binding.applied });
    return { ...t, sdk };
  }

  it('does not announce the casts already present when the subscription applies', () => {
    const t = wired([cast(6), cast(8)]);
    t.sdk.deliverSnapshot();
    expect(t.keys()).toEqual([]);
  });

  it('still announces a cast that arrives after the snapshot', () => {
    const t = wired([cast(6)]);
    t.sdk.deliverSnapshot();
    t.sdk.arrive(cast(7));
    expect(t.keys()).toEqual(['windup:7']);
  });
});

describe('wireCombatFeed: narrated rounds', () => {
  const narrationEntry = (id: number, createdAt: number, message: string) => ({
    id: BigInt(id),
    kind: 'combat_narration',
    message,
    createdAt: { microsSinceUnixEpoch: BigInt(createdAt) },
    characterId: 5n,
  });
  const narrative = (createdAt: number, text: string, roundNumber: number) => ({
    id: 1n,
    combatId: 10n,
    roundNumber: BigInt(roundNumber),
    narrativeText: text,
    createdAt: { microsSinceUnixEpoch: BigInt(createdAt) },
  });

  it('stamps the entry with the round of the narrative row with equal time and text', () => {
    const t = setup();
    t.feed.ingest('private', narrationEntry(9, 5000, 'Steel rings.'));
    t.refs.narratives.value = [narrative(5000, 'Steel rings.', 3)];
    expect(t.feed.entries.value.find((e) => e.key === 'private:9')?.narratedRound).toBe(3n);
  });

  it('works when the narrative row arrives before the event', () => {
    const t = setup();
    t.refs.narratives.value = [narrative(5000, 'Steel rings.', 3)];
    t.feed.ingest('private', narrationEntry(9, 5000, 'Steel rings.'));
    expect(t.feed.entries.value.find((e) => e.key === 'private:9')?.narratedRound).toBe(3n);
  });

  it('adds no tag for different text or a different time', () => {
    const t = setup();
    t.feed.ingest('private', narrationEntry(9, 5000, 'Steel rings.'));
    t.feed.ingest('private', narrationEntry(10, 6000, 'Steel rings.'));
    t.refs.narratives.value = [narrative(5000, 'Another line.', 3)];
    expect(t.feed.entries.value.every((e) => e.narratedRound === undefined)).toBe(true);
  });

  it('matches each entry at most once and ignores other kinds', () => {
    const t = setup();
    t.feed.ingest('private', { ...narrationEntry(9, 5000, 'Steel rings.'), kind: 'system' });
    t.feed.ingest('private', narrationEntry(10, 5000, 'Steel rings.'));
    t.refs.narratives.value = [narrative(5000, 'Steel rings.', 3)];
    const first = t.feed.entries.value;
    expect(first.find((e) => e.key === 'private:9')?.narratedRound).toBeUndefined();
    expect(first.find((e) => e.key === 'private:10')?.narratedRound).toBe(3n);
    t.refs.narratives.value = [narrative(5000, 'Steel rings.', 3), narrative(5000, 'Steel rings.', 4)];
    expect(t.feed.entries.value).toBe(first);
  });

  it('still matches during the linger after the fight ends', () => {
    const t = setup();
    t.refs.narratives.value = [narrative(5000, 'The last blow.', 6)];
    t.refs.combatId.value = null;
    t.feed.ingest('private', narrationEntry(11, 5000, 'The last blow.'));
    expect(t.feed.entries.value.find((e) => e.key === 'private:11')?.narratedRound).toBe(6n);
  });
});
