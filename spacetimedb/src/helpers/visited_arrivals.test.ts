/**
 * Visited places at the arrivals that are not a move (plan 51-01): the first spawn into a new
 * region, the reuse of an existing starter region, auto respawn and resurrection. (The respawn
 * reducer, move and set_active_character are covered by reducers/travel_visited.integration.test.ts.)
 * Each test asserts a visited_location row for the place the character was put in, with no origin.
 * New tests, so the pinned characterization snapshots stay untouched.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

// The location helper is reduced to connections; the pool seeding writes rows we do not care about here.
vi.mock('./location', () => ({
  connectLocations: (ctx: any, fromId: bigint, toId: bigint) => {
    ctx.db.location_connection.insert({ id: 0n, fromLocationId: fromId, toLocationId: toId });
    ctx.db.location_connection.insert({ id: 0n, fromLocationId: toId, toLocationId: fromId });
  },
}));
vi.mock('./families', () => ({
  ensurePoolsForLocation: () => {},
}));
vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

import { createMockCtx } from './test-utils';
import { applyWorldStartResult } from './llm_apply';
import { finishRegionFill, startWorldGeneration } from './world_gen';
import { autoRespawnDeadCharacter } from './character';
import { executeResurrect } from './corpse';

// Strict mock db: accessors come from the recorded schema, so load it before any test touches ctx.db.
beforeAll(async () => {
  await import('../schema/tables');
});

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };
const ts = { microsSinceUnixEpoch: T0 };

const charRow = (over: Record<string, unknown> = {}) => ({
  id: 10n,
  ownerUserId: 7n,
  name: 'Aldric',
  race: 'Kobold',
  className: 'Ashweaver',
  locationId: 0n,
  hp: 10n,
  maxHp: 10n,
  mana: 0n,
  maxMana: 0n,
  stamina: 10n,
  maxStamina: 10n,
  ...over,
});
const genRow = (over: Record<string, unknown> = {}) => ({
  id: 5n,
  playerId: alice,
  characterId: 10n,
  sourceLocationId: 0n,
  sourceRegionId: 0n,
  step: 'PENDING',
  createdAt: ts,
  updatedAt: ts,
  ...over,
});
const newCtx = (seed: Record<string, any[]> = {}) =>
  createMockCtx({
    seed: { player: [{ id: alice, userId: 7n }], character: [charRow()], ...seed },
    sender: alice,
    timestampMicros: T0,
    strict: true,
  });
const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const visitedFor = (ctx: any, characterId: bigint): any[] =>
  rows(ctx, 'visited_location').filter((r) => r.characterId === characterId);

describe('first spawn into a new region (Phase 51.3.1.2, D-17: placed when the region is whole)', () => {
  it('stage 1 (applyWorldStartResult) places nobody and marks nothing visited', () => {
    const ctx = newCtx({ world_gen_state: [genRow({ step: 'GENERATING' })] });
    const reply = JSON.stringify({
      regionName: 'Emberdeep',
      regionDescription: 'A cavern region.',
      biome: 'cavern',
      startLocation: { name: 'Hearthhold', description: 'A warm hall.', terrainType: 'town' },
    });
    applyWorldStartResult(
      ctx,
      { domain: 'world_gen_start', playerId: alice, contextJson: JSON.stringify({ genStateId: '5' }) } as any,
      reply,
    );
    expect(rows(ctx, 'character')[0].locationId).toBe(0n);
    expect(visitedFor(ctx, 10n)).toEqual([]);
  });

  it('completion (finishRegionFill) marks the start location visited for the placed character, with no origin', () => {
    const ctx = newCtx({
      world_gen_state: [genRow({ step: 'FILLING_FAMILIES', generatedRegionId: 1n })],
      region: [{ id: 1n, name: 'Emberdeep', dangerMultiplier: 100n, starterForRace: 'kobold', biome: 'cavern' }],
      location: [
        { id: 21n, name: 'Hearthhold', regionId: 1n, isSafe: true, isHub: true, terrainType: 'town' },
        { id: 22n, name: 'The Gate', regionId: 1n, isSafe: false, terrainType: 'cavern' },
      ],
    });
    finishRegionFill(ctx, rows(ctx, 'world_gen_state')[0]);
    const placed = rows(ctx, 'character')[0];
    expect(placed.locationId).toBe(21n);
    const mine = visitedFor(ctx, 10n);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ locationId: 21n, fromLocationId: undefined });
    expect(mine[0].firstVisitedAt).toEqual(ts);
  });
});

describe('reuse of an existing starter region (startWorldGeneration)', () => {
  it('marks the home location visited, with no origin', () => {
    const ctx = newCtx({
      world_gen_state: [genRow()],
      region: [{ id: 1n, name: 'Emberdeep', dangerMultiplier: 100n, starterForRace: 'kobold', biome: 'cavern' }],
      location: [
        { id: 20n, name: 'The Gate', regionId: 1n, isSafe: false, terrainType: 'cavern' },
        { id: 21n, name: 'Hearthhold', regionId: 1n, isSafe: true, terrainType: 'town' },
      ],
    });
    expect(startWorldGeneration(ctx, rows(ctx, 'world_gen_state')[0])).toBe('reused');
    const mine = visitedFor(ctx, 10n);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ locationId: 21n, fromLocationId: undefined });
  });
});

describe('auto respawn (autoRespawnDeadCharacter)', () => {
  it('marks the bound place visited, with no origin', () => {
    const ctx = newCtx({
      character: [charRow({ locationId: 11n, boundLocationId: 10n, hp: 0n })],
      location: [{ id: 10n, name: 'The Crossing', regionId: 1n }],
    });
    autoRespawnDeadCharacter(ctx, rows(ctx, 'character')[0]);
    const mine = visitedFor(ctx, 10n);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ locationId: 10n, fromLocationId: undefined });
  });

  it('keeps an existing row and its origin untouched', () => {
    const ctx = newCtx({
      character: [charRow({ locationId: 11n, boundLocationId: 10n, hp: 0n })],
      location: [{ id: 10n, name: 'The Crossing', regionId: 1n }],
      visited_location: [{ id: 1n, characterId: 10n, locationId: 10n, firstVisitedAt: ts, fromLocationId: 9n }],
    });
    autoRespawnDeadCharacter(ctx, rows(ctx, 'character')[0]);
    expect(visitedFor(ctx, 10n)).toEqual([
      { id: 1n, characterId: 10n, locationId: 10n, firstVisitedAt: ts, fromLocationId: 9n },
    ]);
  });
});

describe('resurrection (executeResurrect)', () => {
  it('marks the corpse place visited for the target, with no origin', () => {
    const ctx = newCtx({
      character: [
        charRow({ id: 10n, name: 'Caster', locationId: 12n }),
        charRow({ id: 11n, name: 'Fallen', ownerUserId: 8n, locationId: 10n, hp: 0n }),
      ],
      location: [{ id: 12n, name: 'The Ruin', regionId: 1n }],
    });
    const caster = rows(ctx, 'character').find((c) => c.id === 10n);
    const target = rows(ctx, 'character').find((c) => c.id === 11n);
    executeResurrect(ctx, caster, target, { id: 1n, characterId: 11n, locationId: 12n });
    expect(visitedFor(ctx, 11n)).toHaveLength(1);
    expect(visitedFor(ctx, 11n)[0]).toMatchObject({ locationId: 12n, fromLocationId: undefined });
    expect(visitedFor(ctx, 10n)).toEqual([]);
  });
});
