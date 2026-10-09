// Phase 51.3.1.2 (Bigger Regions), Plan 08: the stage-2b state machine pieces in helpers/world_gen.ts.
//   buildWorldFamiliesInput  the 2b input, read back from the stored rows after the 2a write (D-01, D-66, D-70)
//   startWorldFamilies       one world_gen_families job, step FILLING_FAMILIES; a refusal is FAMILIES_ERROR (D-08)
// The mock ctx is strict and runs under the recording schema. No fetch, no paid call.
import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('./location', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./location')>()),
  connectLocations: (ctx: any, fromId: bigint, toId: bigint) => {
    ctx.db.location_connection.insert({ id: 0n, fromLocationId: fromId, toLocationId: toId });
    ctx.db.location_connection.insert({ id: 0n, fromLocationId: toId, toLocationId: fromId });
  },
}));
vi.mock('./families', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./families')>()),
  ensurePoolsForLocation: () => {},
}));
vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

import {
  buildWorldFamiliesInput,
  startWorldFamilies,
  WORLD_FAMILIES_FAILED_MESSAGE,
  WORLD_FILL_REFUSED_MESSAGE,
} from './world_gen';
import { familyCountFor, familySeed, feudCountFor } from '../data/density_rules';
import { createMockCtx } from './test-utils';
import { rowColumnProblems } from './schema_recorder';
import { resolveRouteInput } from './llm_inputs';
import { buildRouteLayers } from '../data/llm_layers';
import { utcDay } from './llm_budget';
import { setLlmEnabled, patchAdminState } from './llm_admin_state';
import { LLM_RESTING_LINE } from './llm_queue';
import { LLM_PLAYER_DAILY_COST_MICRO_USD, LLM_PLAYER_MAX_ACTIVE_JOBS } from '../data/llm_limits';

beforeAll(async () => {
  await import('../schema/tables');
});

// ---------------------------------------------------------------------------
// Setup: a region whose 2a places are written (rows seeded directly)
// ---------------------------------------------------------------------------

const T0 = 1_700_000_000_000_000n;
const ts = { microsSinceUnixEpoch: T0 };
const alice = { toHexString: () => 'a'.repeat(64) };
const SOURCE_REGION = 30n;
const REGION = 40n;
const CROSSING = 50n;
const ELSEWHERE = 999n;
const DOORWAY = 120n;

const PLACE_NAMES = [
  'Brinegate',
  'Reedwatch',
  'Saltpan Shrine',
  'Gull Rock',
  'Mire Steps',
  'The Sunken Mill',
  'Eelpool',
  'Hollow Dyke',
  'Tern Flats',
  'Weir End',
];

function loc(id: bigint, name: string, over: Record<string, unknown> = {}) {
  return {
    id,
    name,
    description: `About ${name}.`,
    zone: 'Saltmarsh Reach',
    regionId: REGION,
    levelOffset: 0n,
    isSafe: false,
    terrainType: 'marsh',
    bindStone: false,
    craftingAvailable: false,
    shortName: '',
    placeNoun: '',
    isHub: false,
    ...over,
  };
}

/**
 * `count` charted places (ids 101..), the arrival point 101 a safe hub, 103 safe and not a hub, the rest
 * ordinary; the Edge Beyond doorway 120 (uncharted). Seeded out of id order so the sort is exercised.
 */
function regionPlaces(count: number): any[] {
  const places = PLACE_NAMES.slice(0, count).map((name, i) => {
    const id = 101n + BigInt(i);
    if (i === 0) return loc(id, name, { isSafe: true, isHub: true, terrainType: 'town' });
    if (i === 2) return loc(id, name, { isSafe: true });
    return loc(id, name);
  });
  const doorway = loc(DOORWAY, 'The Edge Beyond Saltmarsh Reach', { zone: 'Uncharted', isSafe: true, terrainType: 'uncharted' });
  return [doorway, ...places.slice(1).reverse(), places[0]];
}

const stateRow = (over: Record<string, unknown> = {}) => ({
  id: 5n,
  playerId: alice,
  characterId: 10n,
  sourceLocationId: CROSSING,
  sourceRegionId: SOURCE_REGION,
  step: 'FILLING',
  generatedRegionId: REGION,
  createdAt: ts,
  updatedAt: ts,
  ...over,
});

const regionRow = (over: Record<string, unknown> = {}) => ({
  id: REGION,
  name: 'Saltmarsh Reach',
  dangerMultiplier: 150n,
  regionType: 'generated',
  biome: 'swamp',
  dominantFaction: 'The Brine Wardens',
  threats: JSON.stringify(['skitterers in the reeds', 'bog lights']),
  ...over,
});

function makeCtx(opts: { places?: number; seed?: Record<string, any[]> } = {}) {
  return createMockCtx({
    seed: {
      player: [{ id: alice, userId: 7n }],
      character: [
        { id: 10n, ownerUserId: 7n, name: 'Aldric', race: 'Kobold', className: 'Ashweaver', locationId: CROSSING },
      ],
      region: [{ id: SOURCE_REGION, name: 'Source', dangerMultiplier: 100n, regionType: 'generated' }, regionRow()],
      location: [
        loc(CROSSING, 'The Crossing', { regionId: SOURCE_REGION, zone: 'Source', terrainType: 'passage', isSafe: true }),
        ...regionPlaces(opts.places ?? 9),
      ],
      world_gen_state: [stateRow()],
      ...opts.seed,
    },
    sender: alice,
    timestampMicros: T0,
    strict: true,
  });
}

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const stateOf = (ctx: any) => rows(ctx, 'world_gen_state')[0];
const exhaustDay = (ctx: any) =>
  ctx.db.llm_player_budget.insert({
    id: 0n,
    playerId: alice,
    dayUtc: utcDay(ctx.timestamp),
    reservedMicroUsd: 0n,
    spentMicroUsd: LLM_PLAYER_DAILY_COST_MICRO_USD,
    calls: 1n,
  });

// ---------------------------------------------------------------------------
// buildWorldFamiliesInput
// ---------------------------------------------------------------------------

describe('buildWorldFamiliesInput (D-01, D-66, D-70)', () => {
  it('reads a region of 9 charted places back from the stored rows: arrival first, doorway left out, flags as they stand', () => {
    const ctx = makeCtx();
    const input = buildWorldFamiliesInput(ctx, stateOf(ctx));
    const flagOf = (i: number) => (i === 0 ? 'hub' : i === 2 ? 'safe' : 'ordinary');
    const terrainOf = (i: number) => (i === 0 ? 'town' : 'marsh');
    expect(input).toEqual({
      regionName: 'Saltmarsh Reach',
      biome: 'swamp',
      dominantFaction: 'The Brine Wardens',
      threats: ['skitterers in the reeds', 'bog lights'],
      places: PLACE_NAMES.slice(0, 9).map((name, i) => ({ name, terrainType: terrainOf(i), flag: flagOf(i) })),
      hubNames: ['Brinegate'],
      familyCount: 13,
      feudCount: feudCountFor(13, familySeed(REGION)),
    });
    expect(input.places.map((p) => p.name)).not.toContain('The Edge Beyond Saltmarsh Reach');
    expect(() => buildRouteLayers('world_gen_families', input)).not.toThrow();
  });

  it('counts the real places: 8 places ask for 12 families, 10 places for 15', () => {
    for (const [count, families] of [[8, 12], [10, 15]] as const) {
      const ctx = makeCtx({ places: count });
      const input = buildWorldFamiliesInput(ctx, stateOf(ctx));
      expect(input.places).toHaveLength(count);
      expect(input.familyCount).toBe(families);
      expect(input.familyCount).toBe(familyCountFor(count));
      expect(input.feudCount).toBe(feudCountFor(families, familySeed(REGION)));
    }
  });

  it('a hub that is not the arrival point is flagged hub and named; hub beats safe', () => {
    const ctx = makeCtx();
    const reed = rows(ctx, 'location').find((l: any) => l.name === 'Reedwatch');
    ctx.db.location.id.update({ ...reed, isHub: true, isSafe: true });
    const input = buildWorldFamiliesInput(ctx, stateOf(ctx));
    expect(input.places[1]).toEqual({ name: 'Reedwatch', terrainType: 'marsh', flag: 'hub' });
    expect(input.hubNames).toEqual(['Brinegate', 'Reedwatch']);
  });

  it('unreadable threats read as none; a missing faction is left out', () => {
    for (const threats of ['wolves', '{"a":1}', '', undefined]) {
      const ctx = makeCtx({ seed: { region: [regionRow({ threats, dominantFaction: undefined })] } });
      const input = buildWorldFamiliesInput(ctx, stateOf(ctx));
      expect(input.threats).toEqual([]);
      expect(input.dominantFaction).toBeUndefined();
    }
    const mixed = makeCtx({ seed: { region: [regionRow({ threats: JSON.stringify(['eels', 3, null, 'fog']) })] } });
    expect(buildWorldFamiliesInput(mixed, stateOf(mixed)).threats).toEqual(['eels', 'fog']);
  });

  it('throws a plain Error when the region or its arrival point is missing', () => {
    const ctx = makeCtx();
    expect(() => buildWorldFamiliesInput(ctx, { ...stateOf(ctx), generatedRegionId: undefined })).toThrow(/region is missing/);
    expect(() => buildWorldFamiliesInput(ctx, { ...stateOf(ctx), generatedRegionId: 77n })).toThrow(/region is missing/);
    const bare = makeCtx({ seed: { location: [regionPlaces(9)[0]] } });
    expect(() => buildWorldFamiliesInput(bare, stateOf(bare))).toThrow(/no start location/);
  });
});

// ---------------------------------------------------------------------------
// startWorldFamilies
// ---------------------------------------------------------------------------

describe('startWorldFamilies (D-01, D-08)', () => {
  it('enqueues one world_gen_families job keyed by the state and moves the state to FILLING_FAMILIES', () => {
    const ctx = makeCtx();
    expect(startWorldFamilies(ctx, stateOf(ctx))).toBe('enqueued');

    const jobs = rows(ctx, 'llm_job');
    expect(jobs).toHaveLength(1);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ route: 'world_gen_families', playerId: alice, characterId: 10n, status: 'pending' });
    expect(JSON.parse(jobs[0].dedupeKey)).toEqual([alice.toHexString(), 'world_gen_families', '5']);
    expect(JSON.parse(jobs[0].requestJson).genStateId).toBe('5');
    expect(rowColumnProblems('llm_job', jobs[0])).toEqual([]);
    expect(resolveRouteInput(ctx, jobs[0])).toEqual(buildWorldFamiliesInput(ctx, stateOf(ctx)));

    expect(stateOf(ctx)).toMatchObject({ step: 'FILLING_FAMILIES', generatedRegionId: REGION });
    expect(stateOf(ctx).errorMessage).toBeUndefined();
    expect(rowColumnProblems('world_gen_state', stateOf(ctx))).toEqual([]);
  });

  it('a second call while the job is active is a duplicate with one job', () => {
    const ctx = makeCtx();
    expect(startWorldFamilies(ctx, stateOf(ctx))).toBe('enqueued');
    expect(startWorldFamilies(ctx, stateOf(ctx))).toBe('duplicate');
    expect(rows(ctx, 'llm_job')).toHaveLength(1);
    expect(stateOf(ctx).step).toBe('FILLING_FAMILIES');
  });

  it('is never refused busy: a player holding the most capped jobs still gets the families job', () => {
    const held = ['world_gen', 'npc_conversation', 'skill_gen'].map((route, i) => ({
      id: 900n + BigInt(i),
      playerId: alice,
      route,
      dedupeKey: `seed-${i}`,
      status: i === 0 ? 'received' : 'pending',
      budgetDay: utcDay({ microsSinceUnixEpoch: T0 }),
    }));
    expect(held.length).toBeGreaterThanOrEqual(LLM_PLAYER_MAX_ACTIVE_JOBS);
    const ctx = makeCtx({ seed: { llm_job: held } });
    expect(startWorldFamilies(ctx, stateOf(ctx))).toBe('enqueued');
    expect(rows(ctx, 'llm_job').filter((j: any) => j.route === 'world_gen_families')).toHaveLength(1);
  });

  it.each([
    ['halted', (ctx: any) => setLlmEnabled(ctx, false), LLM_RESTING_LINE],
    ['ceiling', (ctx: any) => patchAdminState(ctx, { dailyCeilingMicroUsd: 1n }), LLM_RESTING_LINE],
    ['daily budget', (ctx: any) => exhaustDay(ctx), WORLD_FILL_REFUSED_MESSAGE],
  ])('a %s refusal is FAMILIES_ERROR with its line, never FILL_ERROR, and enqueues nothing', (_name, trip, message) => {
    const ctx = makeCtx();
    trip(ctx);
    expect(startWorldFamilies(ctx, stateOf(ctx))).toBe('refused');
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(stateOf(ctx)).toMatchObject({ step: 'FAMILIES_ERROR', errorMessage: message });
    expect(stateOf(ctx).step).not.toBe('FILL_ERROR');
  });

  it('an input that cannot be built is FAMILIES_ERROR with the families failed message and enqueues nothing', () => {
    const ctx = makeCtx({ seed: { world_gen_state: [stateRow({ generatedRegionId: undefined })] } });
    expect(startWorldFamilies(ctx, stateOf(ctx))).toBe('refused');
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(stateOf(ctx)).toMatchObject({ step: 'FAMILIES_ERROR', errorMessage: WORLD_FAMILIES_FAILED_MESSAGE });
    expect(rows(ctx, 'llm_job').filter((j: any) => j.route === 'world_gen')).toHaveLength(0);
  });
});
