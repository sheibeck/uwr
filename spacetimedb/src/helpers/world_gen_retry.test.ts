// Phase 51.3.1.2 (Bigger Regions), Plan 12: the [explore] retries retry only the failed stage.
//   retryWorldFill         in game, at the crossing or in the region: FAMILIES_ERROR re-enqueues 2b only,
//                          FILL_ERROR re-enqueues 2a as before (D-03, D-09, D-18)
//   retryStarterWorldGen   a new character waiting in creation (location 0): FILL_ERROR or FAMILIES_ERROR
//                          retries that stage alone ('fill_started'); a stage-1 ERROR starts over (D-17, D-18)
// The mock ctx is strict and runs under the recording schema. Jobs are only enqueued: no fetch, no paid call.
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
  retryWorldFill,
  WORLD_FAMILIES_FAILED_MESSAGE,
  WORLD_FILL_REFUSED_MESSAGE,
} from './world_gen';
import { REGION_HOLD_FAILED_LINE } from './region_hold';
import { createMockCtx } from './test-utils';
import { rowColumnProblems } from './schema_recorder';
import { resolveRouteInput } from './llm_inputs';
import { buildRouteLayers } from '../data/llm_layers';
import { utcDay } from './llm_budget';
import { setLlmEnabled } from './llm_admin_state';
import { LLM_RESTING_LINE } from './llm_queue';
import { LLM_PLAYER_DAILY_COST_MICRO_USD } from '../data/llm_limits';

beforeAll(async () => {
  await import('../schema/tables');
});

// ---------------------------------------------------------------------------
// Setup: a region whose 2a places are written, reached from a crossing
// ---------------------------------------------------------------------------

const T0 = 1_700_000_000_000_000n;
const ts = { microsSinceUnixEpoch: T0 };
const alice = { toHexString: () => 'a'.repeat(64) };
const bob = { toHexString: () => 'b'.repeat(64) };
const SOURCE_REGION = 30n;
const REGION = 40n;
const OTHER_REGION = 41n;
const CROSSING = 50n;
const INSIDE = 103n;

const PLACE_NAMES = ['Brinegate', 'Reedwatch', 'Saltpan Shrine', 'Gull Rock', 'Mire Steps', 'The Sunken Mill', 'Eelpool', 'Hollow Dyke', 'Tern Flats'];

function loc(id: bigint, name: string, regionId: bigint, over: Record<string, unknown> = {}) {
  return {
    id,
    name,
    description: `About ${name}.`,
    zone: 'Saltmarsh Reach',
    regionId,
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

/** Nine charted places (ids firstId..), the first a safe hub, plus the Edge Beyond doorway. */
function regionPlaces(regionId: bigint, firstId: bigint): any[] {
  const places = PLACE_NAMES.map((name, i) =>
    i === 0
      ? loc(firstId, `${name} ${regionId}`, regionId, { isSafe: true, isHub: true, terrainType: 'town' })
      : loc(firstId + BigInt(i), `${name} ${regionId}`, regionId),
  );
  const doorway = loc(firstId + 19n, `The Edge Beyond ${regionId}`, regionId, { zone: 'Uncharted', isSafe: true, terrainType: 'uncharted' });
  return [...places, doorway];
}

const regionRow = (id: bigint, name: string) => ({
  id,
  name,
  dangerMultiplier: 150n,
  regionType: 'generated',
  biome: 'swamp',
  dominantFaction: 'The Brine Wardens',
  threats: JSON.stringify(['bog lights']),
});

const stateRow = (over: Record<string, unknown> = {}) => ({
  id: 5n,
  playerId: alice,
  characterId: 10n,
  sourceLocationId: CROSSING,
  sourceRegionId: SOURCE_REGION,
  step: 'FAMILIES_ERROR',
  errorMessage: WORLD_FAMILIES_FAILED_MESSAGE,
  generatedRegionId: REGION,
  createdAt: ts,
  updatedAt: ts,
  ...over,
});

const charRow = (over: Record<string, unknown> = {}) => ({
  id: 10n,
  ownerUserId: 7n,
  name: 'Aldric',
  race: 'Kobold',
  className: 'Ashweaver',
  locationId: CROSSING,
  ...over,
});
/** The explorer: another player's character, Bree (bob's), standing at `locationId`. */
const explorerRow = (locationId: bigint) => charRow({ id: 11n, ownerUserId: 8n, name: 'Bree', locationId });

function gameCtx(opts: { explorerAt?: bigint; states?: Record<string, unknown>[]; seed?: Record<string, any[]> } = {}) {
  return createMockCtx({
    seed: {
      player: [{ id: alice, userId: 7n }, { id: bob, userId: 8n }],
      character: [charRow(), explorerRow(opts.explorerAt ?? CROSSING)],
      region: [
        { id: SOURCE_REGION, name: 'Source', dangerMultiplier: 100n, regionType: 'generated' },
        regionRow(REGION, 'Saltmarsh Reach'),
        regionRow(OTHER_REGION, 'Fen Hollow'),
      ],
      location: [
        loc(CROSSING, 'The Crossing', SOURCE_REGION, { zone: 'Source', terrainType: 'passage', isSafe: true }),
        ...regionPlaces(REGION, 101n),
        ...regionPlaces(OTHER_REGION, 201n),
      ],
      npc: [],
      world_gen_state: (opts.states ?? [{}]).map((s) => stateRow(s)),
      ...opts.seed,
    },
    sender: bob,
    timestampMicros: T0,
    strict: true,
  });
}

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const stateById = (ctx: any, id: bigint) => rows(ctx, 'world_gen_state').find((s: any) => s.id === id);
const explorer = (ctx: any) => rows(ctx, 'character').find((c: any) => c.id === 11n);
const regionLocationCount = (ctx: any, regionId: bigint) =>
  rows(ctx, 'location').filter((l: any) => l.regionId === regionId).length;
const jobRoutes = (ctx: any) => rows(ctx, 'llm_job').map((j: any) => j.route);
const exhaustDay = (ctx: any, who: any) =>
  ctx.db.llm_player_budget.insert({
    id: 0n,
    playerId: who,
    dayUtc: utcDay(ctx.timestamp),
    reservedMicroUsd: 0n,
    spentMicroUsd: LLM_PLAYER_DAILY_COST_MICRO_USD,
    calls: 1n,
  });

// ---------------------------------------------------------------------------
// retryWorldFill: the in-game retry
// ---------------------------------------------------------------------------

describe('retryWorldFill: a families failure retries the families call only (D-09, D-18)', () => {
  it.each([
    ['at the crossing', CROSSING],
    ['from a place inside the region', INSIDE],
  ])('FAMILIES_ERROR %s: started, the state handed to the explorer and FILLING_FAMILIES, one world_gen_families job, no world_gen job, the places unchanged', (_where, at) => {
    const ctx = gameCtx({ explorerAt: at });
    const placesBefore = regionLocationCount(ctx, REGION);
    const npcsBefore = rows(ctx, 'npc').length;

    expect(retryWorldFill(ctx, explorer(ctx), bob)).toBe('started');

    expect(stateById(ctx, 5n)).toMatchObject({ step: 'FILLING_FAMILIES', playerId: bob, characterId: 11n, generatedRegionId: REGION });
    expect(stateById(ctx, 5n).errorMessage).toBeUndefined();
    expect(rowColumnProblems('world_gen_state', stateById(ctx, 5n))).toEqual([]);

    expect(jobRoutes(ctx)).toEqual(['world_gen_families']);
    expect(jobRoutes(ctx)).not.toContain('world_gen');
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(1);
    const job = rows(ctx, 'llm_job')[0];
    expect(job).toMatchObject({ playerId: bob, characterId: 11n, status: 'pending' });
    expect(JSON.parse(job.dedupeKey)).toEqual([bob.toHexString(), 'world_gen_families', '5']);
    expect(JSON.parse(job.requestJson).genStateId).toBe('5');
    expect(rowColumnProblems('llm_job', job)).toEqual([]);
    const input = resolveRouteInput(ctx, job) as any;
    expect(input.regionName).toBe('Saltmarsh Reach');
    expect(input.places).toHaveLength(9);
    expect(() => buildRouteLayers('world_gen_families', input)).not.toThrow();

    // The places are never written again (T-51.3.1.2-39): same location count, no hub or NPC added.
    expect(regionLocationCount(ctx, REGION)).toBe(placesBefore);
    expect(rows(ctx, 'npc')).toHaveLength(npcsBefore);
    expect(rows(ctx, 'event_private')).toHaveLength(0);
  });

  it.each(['FILLING_FAMILIES', 'FILLING'])('busy: a matching %s state starts nothing and writes nothing', (step) => {
    const ctx = gameCtx({ states: [{ step, errorMessage: undefined }] });
    const before = { ...stateById(ctx, 5n) };
    expect(retryWorldFill(ctx, explorer(ctx), bob)).toBe('busy');
    expect(stateById(ctx, 5n)).toEqual(before);
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
    expect(rows(ctx, 'event_private')).toHaveLength(0);
  });

  it('busy wins over a failed state of another region at the same crossing', () => {
    const ctx = gameCtx({
      states: [{}, { id: 6n, step: 'FILLING_FAMILIES', errorMessage: undefined, generatedRegionId: OTHER_REGION }],
    });
    expect(retryWorldFill(ctx, explorer(ctx), bob)).toBe('busy');
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(stateById(ctx, 5n).step).toBe('FAMILIES_ERROR');
  });

  it('FILL_ERROR still re-enqueues the places call (world_gen) as before', () => {
    const ctx = gameCtx({ states: [{ step: 'FILL_ERROR', errorMessage: 'x' }] });
    expect(retryWorldFill(ctx, explorer(ctx), bob)).toBe('started');
    expect(stateById(ctx, 5n)).toMatchObject({ step: 'FILLING', playerId: bob, characterId: 11n });
    expect(jobRoutes(ctx)).toEqual(['world_gen']);
    expect(JSON.parse(rows(ctx, 'llm_job')[0].dedupeKey)).toEqual([bob.toHexString(), 'world_gen', '5']);
  });

  it('two failed regions at one crossing: the newest state wins, whichever stage failed', () => {
    const famNewest = gameCtx({
      states: [
        { step: 'FILL_ERROR', errorMessage: 'x', generatedRegionId: OTHER_REGION },
        { id: 6n, step: 'FAMILIES_ERROR' },
      ],
    });
    expect(retryWorldFill(famNewest, explorer(famNewest), bob)).toBe('started');
    expect(jobRoutes(famNewest)).toEqual(['world_gen_families']);
    expect(JSON.parse(rows(famNewest, 'llm_job')[0].requestJson).genStateId).toBe('6');
    expect(stateById(famNewest, 6n).step).toBe('FILLING_FAMILIES');
    expect(stateById(famNewest, 5n)).toMatchObject({ step: 'FILL_ERROR', playerId: alice, characterId: 10n });

    const fillNewest = gameCtx({
      states: [{}, { id: 6n, step: 'FILL_ERROR', errorMessage: 'x', generatedRegionId: OTHER_REGION }],
    });
    expect(retryWorldFill(fillNewest, explorer(fillNewest), bob)).toBe('started');
    expect(jobRoutes(fillNewest)).toEqual(['world_gen']);
    expect(JSON.parse(rows(fillNewest, 'llm_job')[0].requestJson).genStateId).toBe('6');
    expect(stateById(fillNewest, 6n).step).toBe('FILLING');
    expect(stateById(fillNewest, 5n)).toMatchObject({ step: 'FAMILIES_ERROR', playerId: alice, characterId: 10n });
  });

  it('refused (budget): FAMILIES_ERROR again with the refused message, no job, the 7d line to the explorer once, the places unchanged', () => {
    const ctx = gameCtx();
    const placesBefore = regionLocationCount(ctx, REGION);
    exhaustDay(ctx, bob);
    expect(retryWorldFill(ctx, explorer(ctx), bob)).toBe('refused');

    expect(stateById(ctx, 5n)).toMatchObject({ step: 'FAMILIES_ERROR', errorMessage: WORLD_FILL_REFUSED_MESSAGE, playerId: bob, characterId: 11n });
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'llm_player_budget')[0].reservedMicroUsd).toBe(0n);
    const lines = rows(ctx, 'event_private').filter((e: any) => e.characterId === 11n);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ kind: 'system', message: REGION_HOLD_FAILED_LINE });
    expect(regionLocationCount(ctx, REGION)).toBe(placesBefore);
    expect(rows(ctx, 'npc')).toHaveLength(0);
  });

  it('refused (halted): FAMILIES_ERROR with the resting line, posted once with the [explore] hint', () => {
    const ctx = gameCtx();
    setLlmEnabled(ctx, false);
    expect(retryWorldFill(ctx, explorer(ctx), bob)).toBe('refused');

    expect(stateById(ctx, 5n)).toMatchObject({ step: 'FAMILIES_ERROR', errorMessage: LLM_RESTING_LINE });
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    const lines = rows(ctx, 'event_private').filter((e: any) => e.characterId === 11n);
    expect(lines.map((e: any) => e.message)).toEqual([`${LLM_RESTING_LINE} Type [explore] to try again.`]);
  });

  it('none: a COMPLETE region, or an explorer elsewhere, starts nothing', () => {
    const complete = gameCtx({ states: [{ step: 'COMPLETE', errorMessage: undefined }] });
    expect(retryWorldFill(complete, explorer(complete), bob)).toBe('none');
    expect(rows(complete, 'llm_job')).toHaveLength(0);

    const away = gameCtx({ explorerAt: 999n });
    expect(retryWorldFill(away, explorer(away), bob)).toBe('none');
    expect(rows(away, 'llm_job')).toHaveLength(0);
    expect(stateById(away, 5n).step).toBe('FAMILIES_ERROR');
  });
});
