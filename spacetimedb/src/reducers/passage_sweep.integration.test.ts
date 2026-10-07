/**
 * The guarded passage sweep (plan 51-03), through the real sweep_passages scheduled handler and
 * the real clientConnected handler on the strict mock db. Local passage 6 shape: own places 3 and
 * 5 (region 1), passage 6 (region 1, terrainType 'passage'), far place 4097 (region 4097). The
 * first tick is also the one-time cleanup of passages that existed before this phase: an empty
 * passage collapses on it. An offline character is returned to its own side (the place it came
 * from when that is an own-side neighbour, else the lowest-id own-side neighbour, never across the
 * border); an online character is never moved and keeps the passage open.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { MODULE } from '../helpers/combat_fight_fixture';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };
const bob = { toHexString: () => 'b'.repeat(64) };

let sweep: (...args: any[]) => any;
let onConnect: (...args: any[]) => any;
let sweepPassages: typeof import('../helpers/passages').sweepPassages;
let PASSAGE_SWEEP_INTERVAL_MICROS: bigint;

beforeAll(async () => {
  await import('../index');
  const grab = (name: string) => {
    const h = capturedReducer(name);
    if (typeof h !== 'function') {
      throw new Error(`capturedReducer('${name}') is not a function: STOP and report; never edit production code to fix this.`);
    }
    return h;
  };
  sweep = grab('sweep_passages');
  onConnect = grab('__client_connected__');
  const mod = await import('../helpers/passages');
  sweepPassages = mod.sweepPassages;
  PASSAGE_SWEEP_INTERVAL_MICROS = mod.PASSAGE_SWEEP_INTERVAL_MICROS;
}, 120_000);

const place = (id: bigint, name: string, regionId: bigint, terrainType = 'plains') => ({
  id,
  name,
  description: `${name} lies here.`,
  zone: 'z',
  regionId,
  isSafe: true,
  bindStone: false,
  craftingAvailable: false,
  terrainType,
  levelOffset: 0n,
});

const link = (a: bigint, b: bigint) => [
  { id: 1000n + a * 10n + b, fromLocationId: a, toLocationId: b },
  { id: 1000n + b * 10n + a, fromLocationId: b, toLocationId: a },
];

// Online means the stored flag (plan 51.1-01); seeds that hold a character in a player row also
// set online: true, and every other character reads offline.
const character = (id: bigint, locationId: bigint, online = false) => ({
  id,
  ownerUserId: 7n + id,
  name: `Char${id}`,
  locationId,
  boundLocationId: 5n,
  online,
  lastOnlineAtMicros: 0n,
});

const visit = (id: bigint, characterId: bigint, locationId: bigint, fromLocationId?: bigint) => ({
  id,
  characterId,
  locationId,
  firstVisitedAt: { microsSinceUnixEpoch: 5n },
  fromLocationId,
});

function newCtx(seed: Record<string, any[]> = {}, sender: any = MODULE) {
  return createMockCtx({
    seed: {
      location: [
        place(3n, 'Lowest Own', 1n),
        place(5n, 'Own Place', 1n),
        place(6n, 'The Narrows', 1n, 'passage'),
        place(4097n, 'Far Place', 4097n),
      ],
      location_connection: [...link(3n, 6n), ...link(5n, 6n), ...link(6n, 4097n)],
      ...seed,
    },
    sender,
    timestampMicros: T0,
    strict: true,
  });
}

const run = (ctx: any) => sweep(ctx, { arg: { scheduledId: 1n } });
const table = (ctx: any, name: string): any[] => ctx.db._tables[name] ?? [];
const where = (ctx: any, id: bigint) => table(ctx, 'character').find((c) => c.id === id).locationId;
const locationIds = (ctx: any): bigint[] => table(ctx, 'location').map((r) => r.id);
const edges = (ctx: any): string[] =>
  table(ctx, 'location_connection').map((r) => `${r.fromLocationId}>${r.toLocationId}`).sort();

describe('sweep_passages: re-arm and the one-time cleanup', () => {
  it('one tick re-arms exactly one passage_sweep_tick at now + 300 s', () => {
    const ctx = newCtx();
    run(ctx);
    expect(PASSAGE_SWEEP_INTERVAL_MICROS).toBe(300_000_000n);
    const ticks = table(ctx, 'passage_sweep_tick');
    expect(ticks).toHaveLength(1);
    expect(ticks[0].scheduledAt.value.microsSinceUnixEpoch).toBe(T0 + 300_000_000n);
  });

  it('an empty passage collapses on the tick', () => {
    const ctx = newCtx();
    run(ctx);
    expect(locationIds(ctx)).toEqual([3n, 5n, 4097n]);
    expect(edges(ctx)).toEqual(['3>4097', '4097>3', '4097>5', '5>4097']);
  });

  it('a forged client call touches nothing', () => {
    const ctx = newCtx({}, alice);
    run(ctx);
    expect(table(ctx, 'passage_sweep_tick')).toHaveLength(0);
    expect(locationIds(ctx)).toEqual([3n, 5n, 6n, 4097n]);
  });
});

describe('sweep_passages: offline characters go back to their own side', () => {
  it('goes to the place it came from when that is an own-side neighbour, then the passage collapses', () => {
    const ctx = newCtx({ character: [character(1n, 6n)], visited_location: [visit(1n, 1n, 6n, 5n)] });
    run(ctx);
    expect(where(ctx, 1n)).toBe(5n);
    expect(locationIds(ctx)).toEqual([3n, 5n, 4097n]);
  });

  it('a character that crossed in from the far side goes to the lowest-id own-side neighbour, never across', () => {
    const ctx = newCtx({ character: [character(1n, 6n)], visited_location: [visit(1n, 1n, 6n, 4097n)] });
    run(ctx);
    expect(where(ctx, 1n)).toBe(3n);
    expect(locationIds(ctx)).toEqual([3n, 5n, 4097n]);
  });

  it('a character with no visited row goes to the lowest-id own-side neighbour', () => {
    const ctx = newCtx({ character: [character(1n, 6n)] });
    run(ctx);
    expect(where(ctx, 1n)).toBe(3n);
    expect(locationIds(ctx)).toEqual([3n, 5n, 4097n]);
  });

  it('a moved character gets a visited row for its new place with no origin, and no feed line', () => {
    const ctx = newCtx({ character: [character(1n, 6n)], visited_location: [visit(1n, 1n, 6n, 5n)] });
    run(ctx);
    const arrived = table(ctx, 'visited_location').find((r) => r.characterId === 1n && r.locationId === 5n);
    expect(arrived).toBeDefined();
    expect(arrived.fromLocationId).toBeUndefined();
    expect(table(ctx, 'visited_location').filter((r) => r.locationId === 6n)).toEqual([]);
    expect(table(ctx, 'event_private')).toEqual([]);
    expect(table(ctx, 'event_location')).toEqual([]);
    expect(table(ctx, 'event_world')).toEqual([]);
  });
});

describe('sweep_passages: online characters keep the passage open', () => {
  it('an online character is not moved and the passage stays', () => {
    const ctx = newCtx({
      player: [{ id: alice, userId: 8n, activeCharacterId: 1n }],
      character: [character(1n, 6n, true)],
    });
    run(ctx);
    expect(where(ctx, 1n)).toBe(6n);
    expect(locationIds(ctx)).toEqual([3n, 5n, 6n, 4097n]);
  });

  it('an online and an offline character together: the offline one moves, the passage stays', () => {
    const ctx = newCtx({
      player: [{ id: alice, userId: 8n, activeCharacterId: 1n }],
      character: [character(1n, 6n, true), character(2n, 6n)],
      visited_location: [visit(1n, 2n, 6n, 5n)],
    });
    run(ctx);
    expect(where(ctx, 1n)).toBe(6n);
    expect(where(ctx, 2n)).toBe(5n);
    expect(locationIds(ctx)).toEqual([3n, 5n, 6n, 4097n]);
  });

  it('a player row with no active character does not count as online (the stored flag reads false)', () => {
    const ctx = newCtx({
      player: [{ id: bob, userId: 9n, activeCharacterId: undefined }],
      character: [character(1n, 6n)],
    });
    run(ctx);
    expect(where(ctx, 1n)).toBe(3n);
  });
});

describe('sweep_passages: a fight pins the passage (review CR-01)', () => {
  const encounter = (state: string) => ({
    id: 1n,
    locationId: 6n,
    state,
    addCount: 0n,
    pendingAddCount: 0n,
    createdAt: { microsSinceUnixEpoch: T0 },
  });
  const participant = { id: 1n, combatId: 1n, characterId: 1n, status: 'active', nextAutoAttackAt: 0n };

  it('an offline occupant in an active fight is not moved, and the passage and its fight stay', () => {
    const ctx = newCtx({
      character: [character(1n, 6n)],
      combat_encounter: [encounter('active')],
      combat_participant: [participant],
      enemy_spawn: [{ id: 1n, locationId: 6n, enemyTemplateId: 1n, name: 'Wolves', state: 'engaged', lockedCombatId: 1n, groupCount: 1n }],
    });
    run(ctx);
    expect(where(ctx, 1n)).toBe(6n);
    expect(locationIds(ctx)).toEqual([3n, 5n, 6n, 4097n]);
    expect(table(ctx, 'combat_encounter')[0].locationId).toBe(6n);
    expect(table(ctx, 'enemy_spawn').map((r) => r.id)).toEqual([1n]);
  });

  it('an empty passage with an active encounter at it does not collapse', () => {
    const ctx = newCtx({ combat_encounter: [encounter('active')] });
    run(ctx);
    expect(locationIds(ctx)).toEqual([3n, 5n, 6n, 4097n]);
    expect(table(ctx, 'combat_encounter')[0].locationId).toBe(6n);
  });

  it('an offline bystander who is not in the fight is not moved while the fight goes on', () => {
    const ctx = newCtx({
      character: [character(1n, 6n), character(2n, 6n)],
      combat_encounter: [encounter('active')],
      combat_participant: [participant],
    });
    expect(sweepPassages(ctx)).toEqual({ moved: 0, collapsed: 0 });
    expect(where(ctx, 2n)).toBe(6n);
  });

  it('once the fight ends, a later sweep moves the occupant and collapses the passage', () => {
    const ctx = newCtx({
      character: [character(1n, 6n)],
      combat_encounter: [encounter('active')],
      combat_participant: [participant],
    });
    run(ctx);
    expect(where(ctx, 1n)).toBe(6n);
    ctx.db._tables.combat_encounter[0] = { ...ctx.db._tables.combat_encounter[0], state: 'resolved' };
    run(ctx);
    expect(where(ctx, 1n)).toBe(3n);
    expect(locationIds(ctx)).toEqual([3n, 5n, 4097n]);
    // The finished encounter is history and is re-homed with the other rows.
    expect(table(ctx, 'combat_encounter')[0].locationId).toBe(3n);
  });
});

describe('sweep_passages: edge cases and ordering', () => {
  it('a passage with no own-side neighbour keeps its offline occupant and stays', () => {
    const ctx = newCtx({ character: [character(1n, 6n)] });
    ctx.db._tables.location_connection.length = 0;
    ctx.db._tables.location_connection.push(...link(6n, 4097n));
    run(ctx);
    expect(where(ctx, 1n)).toBe(6n);
    expect(locationIds(ctx)).toEqual([3n, 5n, 6n, 4097n]);
  });

  it('a passage with no far-side neighbour cannot collapse, so its offline occupant is not moved (review WR-03)', () => {
    const ctx = newCtx({ character: [character(1n, 6n)] });
    ctx.db._tables.location_connection.length = 0;
    ctx.db._tables.location_connection.push(...link(3n, 6n), ...link(5n, 6n));
    expect(sweepPassages(ctx)).toEqual({ moved: 0, collapsed: 0 });
    expect(where(ctx, 1n)).toBe(6n);
    expect(locationIds(ctx)).toEqual([3n, 5n, 6n, 4097n]);
  });

  it('two passages are both handled in id order and the counts match', () => {
    const seed = {
      location: [
        place(3n, 'Lowest Own', 1n),
        place(5n, 'Own Place', 1n),
        place(6n, 'The Narrows', 1n, 'passage'),
        place(8n, 'The Gap', 1n, 'passage'),
        place(4097n, 'Far Place', 4097n),
        place(4098n, 'Far Two', 4097n),
      ],
      location_connection: [...link(3n, 6n), ...link(6n, 4097n), ...link(5n, 8n), ...link(8n, 4098n)],
      // Seeded high id first, so id order is proven, not assumed.
      character: [character(2n, 8n), character(1n, 6n)],
    };
    const ctx = newCtx(seed);
    const counts = sweepPassages(ctx);
    expect(counts).toEqual({ moved: 2, collapsed: 2 });
    expect(where(ctx, 1n)).toBe(3n);
    expect(where(ctx, 2n)).toBe(5n);
    expect(locationIds(ctx)).toEqual([3n, 5n, 4097n, 4098n]);
    // Passage 6 was handled before passage 8: its traveller's visited row was inserted first.
    expect(table(ctx, 'visited_location').map((r) => r.characterId)).toEqual([1n, 2n]);
  });

  it('counts only what it did: an empty world and an occupied online passage', () => {
    const empty = newCtx({ location: [place(5n, 'Own Place', 1n)], location_connection: [] });
    expect(sweepPassages(empty)).toEqual({ moved: 0, collapsed: 0 });
    const held = newCtx({
      player: [{ id: alice, userId: 8n, activeCharacterId: 1n }],
      character: [character(1n, 6n, true)],
    });
    expect(sweepPassages(held)).toEqual({ moved: 0, collapsed: 0 });
  });
});

describe('the sweep is armed when a client connects', () => {
  it('inserts one tick due now when none is pending, and a second connect adds none', () => {
    const ctx = newCtx({}, alice);
    onConnect(ctx);
    const ticks = table(ctx, 'passage_sweep_tick');
    expect(ticks).toHaveLength(1);
    expect(ticks[0].scheduledAt.value.microsSinceUnixEpoch).toBe(T0);
    onConnect(ctx);
    expect(table(ctx, 'passage_sweep_tick')).toHaveLength(1);
  });

  it('adds none when a tick is already pending', () => {
    const existing = { scheduledId: 5n, scheduledAt: { tag: 'Time', value: { microsSinceUnixEpoch: T0 + 5n } } };
    const ctx = newCtx({ passage_sweep_tick: [existing] }, alice);
    onConnect(ctx);
    expect(table(ctx, 'passage_sweep_tick')).toEqual([existing]);
  });
});
