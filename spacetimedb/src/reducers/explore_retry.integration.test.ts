// Phase 51.3.1.2 (Bigger Regions), Plan 12: [explore] retries only the failed stage, through the REAL
// captured reducers (submit_intent in game, submit_creation_input in the creation console) on a strict
// mock db. Jobs are only enqueued: no fetch, no paid call (D-09, D-17, D-18, SC2, SC6).
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { capturedReducer, rowColumnProblems } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { utcDay } from '../helpers/llm_budget';
import { LLM_PLAYER_DAILY_COST_MICRO_USD } from '../data/llm_limits';
import {
  STARTER_RETRY_MESSAGES,
  WORLD_FAMILIES_FAILED_MESSAGE,
  WORLD_FILL_REFUSED_MESSAGE,
  WORLD_FILL_RETRY_LINE,
} from '../helpers/world_gen';
import { REGION_HOLD_FAILED_LINE } from '../helpers/region_hold';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const T = { microsSinceUnixEpoch: T0 };
const alice = { toHexString: () => 'a'.repeat(64) };
const bob = { toHexString: () => 'b'.repeat(64) };

const handlers: Record<string, (...args: any[]) => any> = {};

beforeAll(async () => {
  await import('../index');
  for (const name of ['submit_intent', 'submit_creation_input']) {
    const h = capturedReducer(name);
    if (typeof h !== 'function') {
      throw new Error(`capturedReducer('${name}') is not a function: STOP and report; never edit production code to fix this.`);
    }
    handlers[name] = h;
  }
}, 120_000);

let randomSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.42);
});
afterEach(() => {
  randomSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// World: a source region with a crossing (10), a held region (40) of nine places and a doorway
// ---------------------------------------------------------------------------

const SOURCE_REGION = 1n;
const REGION = 40n;
const CROSSING = 10n;
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

const regionPlaces = (): any[] => [
  ...PLACE_NAMES.map((name, i) =>
    i === 0
      ? loc(101n, name, REGION, { isSafe: true, isHub: true, terrainType: 'town' })
      : loc(101n + BigInt(i), name, REGION),
  ),
  loc(120n, 'The Edge Beyond Saltmarsh Reach', REGION, { zone: 'Uncharted', isSafe: true, terrainType: 'uncharted' }),
];

const regions = () => [
  { id: SOURCE_REGION, name: 'Ashen Reach', dangerMultiplier: 100n, regionType: 'wild', biome: 'volcanic' },
  {
    id: REGION,
    name: 'Saltmarsh Reach',
    dangerMultiplier: 150n,
    regionType: 'generated',
    biome: 'swamp',
    dominantFaction: 'The Brine Wardens',
    threats: JSON.stringify(['bog lights']),
  },
];

const character = (over: Record<string, unknown> = {}) => ({
  id: 1n,
  ownerUserId: 7n,
  name: 'Aldric',
  race: 'Kobold',
  className: 'Ashweaver',
  locationId: CROSSING,
  stamina: 100n,
  maxStamina: 100n,
  perception: 0n,
  level: 1n,
  combatTargetEnemyId: undefined,
  ...over,
});

const genRow = (over: Record<string, unknown> = {}) => ({
  id: 5n,
  playerId: alice,
  characterId: 1n,
  sourceLocationId: CROSSING,
  sourceRegionId: SOURCE_REGION,
  step: 'FAMILIES_ERROR',
  errorMessage: WORLD_FAMILIES_FAILED_MESSAGE,
  generatedRegionId: REGION,
  createdAt: T,
  updatedAt: T,
  ...over,
});

function newCtx(seed: Record<string, any[]>, sender: any = alice) {
  return createMockCtx({ seed, sender, timestampMicros: T0, strict: true });
}

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const jobRoutes = (ctx: any) => rows(ctx, 'llm_job').map((j: any) => j.route);
const systemLines = (ctx: any): string[] =>
  rows(ctx, 'event_private').filter((e: any) => e.kind === 'system').map((e: any) => e.message);
const creationLines = (ctx: any) => rows(ctx, 'event_creation').map((e: any) => [e.kind, e.message]);
const regionLocationCount = (ctx: any) => rows(ctx, 'location').filter((l: any) => l.regionId === REGION).length;
const exhaustDay = (ctx: any, who: any = alice) =>
  ctx.db.llm_player_budget.insert({
    id: 0n,
    playerId: who,
    dayUtc: utcDay(ctx.timestamp),
    reservedMicroUsd: 0n,
    spentMicroUsd: LLM_PLAYER_DAILY_COST_MICRO_USD,
    calls: 1n,
  });

// ---------------------------------------------------------------------------
// In game: submit_intent [explore] at the crossing
// ---------------------------------------------------------------------------

describe('submit_intent [explore] at the crossing of a held region (D-09, D-18)', () => {
  const gameSeed = (state: Record<string, unknown> = {}) => ({
    player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
    region: regions(),
    location: [loc(CROSSING, 'The Crossing', SOURCE_REGION, { zone: 'Ashen', terrainType: 'passage', isSafe: true }), ...regionPlaces()],
    character: [character()],
    world_gen_state: [genRow(state)],
  });
  const explore = (ctx: any) => handlers.submit_intent(ctx, { characterId: 1n, text: 'explore' });

  it('FAMILIES_ERROR: WORLD_FILL_RETRY_LINE, one world_gen_families job, no world_gen job, FILLING_FAMILIES, the places unchanged', () => {
    const ctx = newCtx(gameSeed());
    const before = regionLocationCount(ctx);
    explore(ctx);

    expect(systemLines(ctx)).toEqual([WORLD_FILL_RETRY_LINE]);
    expect(jobRoutes(ctx)).toEqual(['world_gen_families']);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(1);
    expect(rowColumnProblems('llm_job', rows(ctx, 'llm_job')[0])).toEqual([]);
    expect(rows(ctx, 'world_gen_state')).toHaveLength(1);
    expect(rows(ctx, 'world_gen_state')[0]).toMatchObject({ step: 'FILLING_FAMILIES', playerId: alice, characterId: 1n });
    expect(regionLocationCount(ctx)).toBe(before);
  });

  it('FILLING_FAMILIES: the busy line and nothing enqueued', () => {
    const ctx = newCtx(gameSeed({ step: 'FILLING_FAMILIES', errorMessage: undefined }));
    explore(ctx);

    expect(systemLines(ctx)).toEqual([STARTER_RETRY_MESSAGES.busy]);
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('FILLING_FAMILIES');
  });

  it('FILL_ERROR: the places call (world_gen) is re-enqueued as before, with WORLD_FILL_RETRY_LINE', () => {
    const ctx = newCtx(gameSeed({ step: 'FILL_ERROR', errorMessage: 'x' }));
    explore(ctx);

    expect(systemLines(ctx)).toEqual([WORLD_FILL_RETRY_LINE]);
    expect(jobRoutes(ctx)).toEqual(['world_gen']);
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('FILLING');
  });

  it('a refused families retry: FAMILIES_ERROR again, the 7d line once and no second line, no job', () => {
    const ctx = newCtx(gameSeed());
    exhaustDay(ctx);
    explore(ctx);

    expect(systemLines(ctx)).toEqual([REGION_HOLD_FAILED_LINE]);
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'world_gen_state')[0]).toMatchObject({ step: 'FAMILIES_ERROR', errorMessage: WORLD_FILL_REFUSED_MESSAGE });
  });
});

// ---------------------------------------------------------------------------
// Creation console: a new character still at location 0 whose first region failed at 2a or 2b
// ---------------------------------------------------------------------------

describe('[explore] for a new character waiting in creation (D-17, D-18)', () => {
  const STARTER = REGION;
  const completeState = () => ({ id: 1n, playerId: alice, step: 'COMPLETE', characterName: 'Aldric', createdAt: T, updatedAt: T });
  const starterSeed = (states: Record<string, unknown>[]) => ({
    player: [{ id: alice, userId: 7n, activeCharacterId: 1n }, { id: bob, userId: 7n }],
    region: [regions()[1]],
    location: regionPlaces(),
    character: [character({ locationId: 0n })],
    character_creation_state: [completeState()],
    world_gen_state: states.map((s, i) =>
      genRow({ id: BigInt(i + 1), sourceLocationId: 0n, sourceRegionId: 0n, generatedRegionId: STARTER, ...s }),
    ),
  });
  const submitCreation = (ctx: any, text: string) => handlers.submit_creation_input(ctx, { text });

  it.each([
    ['FILL_ERROR', 'world_gen', 'FILLING'],
    ['FAMILIES_ERROR', 'world_gen_families', 'FILLING_FAMILIES'],
  ])('%s: the creation console shows WORLD_FILL_RETRY_LINE and only that stage is re-enqueued', (step, route, running) => {
    const ctx = newCtx(starterSeed([{ step, errorMessage: 'x' }]));
    const before = regionLocationCount(ctx);
    submitCreation(ctx, '[explore]');

    expect(creationLines(ctx)).toEqual([['creation', WORLD_FILL_RETRY_LINE]]);
    expect(jobRoutes(ctx)).toEqual([route]);
    expect(rows(ctx, 'world_gen_state')).toHaveLength(1);
    expect(rows(ctx, 'world_gen_state')[0]).toMatchObject({ step: running, playerId: alice, characterId: 1n });
    expect(regionLocationCount(ctx)).toBe(before);
    expect(rows(ctx, 'character_creation_state')[0].step).toBe('COMPLETE');
  });

  it('another identity of the same user retries the failed stage and the job is charged to that identity', () => {
    const ctx = newCtx(starterSeed([{}]), bob);
    submitCreation(ctx, 'explore');

    expect(rows(ctx, 'event_creation').map((e: any) => [e.playerId, e.message])).toEqual([[bob, WORLD_FILL_RETRY_LINE]]);
    expect(rows(ctx, 'llm_job')[0]).toMatchObject({ route: 'world_gen_families', playerId: bob, characterId: 1n });
    expect(rows(ctx, 'world_gen_state')[0]).toMatchObject({ step: 'FILLING_FAMILIES', playerId: bob, characterId: 1n });
  });

  it.each(['FILLING', 'FILLING_FAMILIES'])('while %s runs the console shows the busy line and nothing is enqueued', (step) => {
    const ctx = newCtx(starterSeed([{ step, errorMessage: undefined }]));
    submitCreation(ctx, 'explore');

    expect(creationLines(ctx)).toEqual([['creation', STARTER_RETRY_MESSAGES.busy]]);
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
  });

  it('a stage-1 ERROR keeps the fresh-start retry and its line', () => {
    const ctx = newCtx(starterSeed([{ step: 'ERROR', errorMessage: 'y', generatedRegionId: undefined }]));
    submitCreation(ctx, 'explore');

    expect(creationLines(ctx)).toEqual([['creation', STARTER_RETRY_MESSAGES.started]]);
    expect(jobRoutes(ctx)).toEqual(['world_gen_start']);
    expect(rows(ctx, 'world_gen_state')).toHaveLength(2);
  });

  it('no starter state: the none line, as today', () => {
    const ctx = newCtx(starterSeed([]));
    submitCreation(ctx, 'explore');

    expect(creationLines(ctx)).toEqual([['creation_error', STARTER_RETRY_MESSAGES.none]]);
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
  });

  it('a refused families retry: one creation_error line with the [explore] hint and no retry line', () => {
    const ctx = newCtx(starterSeed([{}]));
    exhaustDay(ctx);
    submitCreation(ctx, 'explore');

    expect(creationLines(ctx)).toEqual([['creation_error', `${WORLD_FAMILIES_FAILED_MESSAGE} Type [explore] to try again.`]]);
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('FAMILIES_ERROR');
  });

  it('submit_intent [explore] from location 0 maps fill_started to WORLD_FILL_RETRY_LINE too', () => {
    const ctx = newCtx(starterSeed([{}]));
    handlers.submit_intent(ctx, { characterId: 1n, text: 'explore' });

    expect(systemLines(ctx)).toEqual([WORLD_FILL_RETRY_LINE]);
    expect(jobRoutes(ctx)).toEqual(['world_gen_families']);
  });
});
