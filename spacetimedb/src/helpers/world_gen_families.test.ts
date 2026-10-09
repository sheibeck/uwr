// Phase 51.3.1.2 (Bigger Regions), Plan 08: the stage-2b state machine pieces in helpers/world_gen.ts.
//   buildWorldFamiliesInput  the 2b input, read back from the stored rows after the 2a write (D-01, D-66, D-70)
//   startWorldFamilies       one world_gen_families job, step FILLING_FAMILIES; a refusal is FAMILIES_ERROR (D-08)
// The mock ctx is strict and runs under the recording schema. No fetch, no paid call.
import { describe, it, expect, vi, beforeAll } from 'vitest';
// This tsconfig has no @types/node; vitest runs the file in Node, so the built-ins resolve at runtime.
// @ts-ignore
import { readFileSync } from 'node:fs';
// @ts-ignore
import * as nodeFs from 'node:fs';
// The prompt-draft tool is plain .mjs with no types; vitest resolves it at runtime.
// @ts-ignore
import { findPhaseFile } from '../../../scripts/llm/prompt_draft.mjs';
// @ts-ignore
import { fileURLToPath } from 'node:url';

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
  failWorldFamilies,
  failWorldFill,
  finishRegionFill,
  pickDiscoveryMessage,
  WORLD_FAMILIES_FAILED_MESSAGE,
  WORLD_FILL_FAILED_MESSAGE,
  WORLD_FILL_REFUSED_MESSAGE,
} from './world_gen';
import { REGION_HOLD_FAILED_LINE, regionOpenedLine } from './region_hold';
import { DEFAULT_DIALS } from '../data/economy_rules';
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

// ---------------------------------------------------------------------------
// The families error state and the hold-aware failure lines (D-08, D-09, D-15, D-18)
// ---------------------------------------------------------------------------

/**
 * Section 5 as the owner chose it (the Alternative): the `chosen` output of
 * `node scripts/llm/prompt_draft.mjs chosen .planning/phases/51.3.1.2-bigger-regions/51.3.1.2-PROMPT-DRAFT.md`.
 */
const CHOSEN_5 = 'The land is remembered, but not yet what lives in it. Type [explore] to try again.';
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url)); // spacetimedb/src/helpers -> repo root
// The draft is in the phase folder until the milestone is archived, then in a *-phases archive; findPhaseFile
// searches both (code review B, WR-05).
const DRAFT_PATH: string = findPhaseFile(
  REPO_ROOT.replace(/[\\/]$/, ''),
  '51.3.1.2-bigger-regions',
  '51.3.1.2-PROMPT-DRAFT.md',
  nodeFs,
);
const DRAFT = readFileSync(REPO_ROOT + DRAFT_PATH, 'utf8') as string;
const RESTING_EXPLORE = `${LLM_RESTING_LINE} Type [explore] to try again.`;
const IN_REGION = 105n;

/** The tables a failure must never change, as JSON (bigints as strings). */
const worldRows = (ctx: any): string =>
  JSON.stringify(
    ['region', 'location', 'location_connection', 'npc'].map((t) => rows(ctx, t)),
    (_k, v) => (typeof v === 'bigint' ? v.toString() : v),
  );

const people = () => [
  // The triggering character, inside the new region (wherever he is), and two more at the crossing.
  { id: 10n, ownerUserId: 7n, name: 'Aldric', race: 'Kobold', className: 'Ashweaver', locationId: IN_REGION },
  { id: 11n, ownerUserId: 8n, name: 'Bree', race: 'Human', className: 'Warden', locationId: CROSSING },
  { id: 12n, ownerUserId: 9n, name: 'Corwin', race: 'Elf', className: 'Seer', locationId: CROSSING },
  // Elsewhere: never told.
  { id: 13n, ownerUserId: 6n, name: 'Dagny', race: 'Dwarf', className: 'Smith', locationId: ELSEWHERE },
];

const privateLines = (ctx: any) =>
  rows(ctx, 'event_private').map((e: any) => ({ characterId: e.characterId, kind: e.kind, message: e.message }));

describe('WORLD_FAMILIES_FAILED_MESSAGE (D-09, D-18: the owner\'s section 5 Alternative)', () => {
  it('is the approved sentence before the [explore] hint, and the whole line is in the approved draft', () => {
    expect(WORLD_FAMILIES_FAILED_MESSAGE).toBe('The land is remembered, but not yet what lives in it.');
    expect(`${WORLD_FAMILIES_FAILED_MESSAGE} Type [explore] to try again.`).toBe(CHOSEN_5);
    expect(DRAFT).toMatch(/^Status: APPROVED \d{4}-\d{2}-\d{2}/m);
    expect(DRAFT).toContain(CHOSEN_5);
  });

  it('carries no digit, no budget word and no it or they (it is stored on the public state)', () => {
    expect(WORLD_FAMILIES_FAILED_MESSAGE).not.toMatch(/\d/);
    expect(WORLD_FAMILIES_FAILED_MESSAGE).not.toMatch(/budget|limit|daily|ceiling|anthropic|claude/i);
  });
});

describe('failWorldFamilies (D-08, D-09)', () => {
  it('sets FAMILIES_ERROR with the message and changes no region, place, connection or NPC row', () => {
    const ctx = makeCtx({ seed: { world_gen_state: [stateRow({ step: 'FILLING_FAMILIES' })] } });
    const before = worldRows(ctx);
    failWorldFamilies(ctx, stateOf(ctx), WORLD_FAMILIES_FAILED_MESSAGE);
    expect(stateOf(ctx)).toMatchObject({ step: 'FAMILIES_ERROR', errorMessage: WORLD_FAMILIES_FAILED_MESSAGE, generatedRegionId: REGION });
    expect(stateOf(ctx).step).not.toBe('FILL_ERROR');
    expect(rowColumnProblems('world_gen_state', stateOf(ctx))).toEqual([]);
    expect(worldRows(ctx)).toBe(before);
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
  });

  it('a second failure leaves it FAMILIES_ERROR with the newer message, still never FILL_ERROR', () => {
    const ctx = makeCtx({ seed: { world_gen_state: [stateRow({ step: 'FILLING_FAMILIES' })] } });
    failWorldFamilies(ctx, stateOf(ctx), WORLD_FAMILIES_FAILED_MESSAGE);
    failWorldFamilies(ctx, stateOf(ctx), LLM_RESTING_LINE);
    expect(stateOf(ctx)).toMatchObject({ step: 'FAMILIES_ERROR', errorMessage: LLM_RESTING_LINE });
  });
});

describe.each([
  ['failWorldFamilies', failWorldFamilies, WORLD_FAMILIES_FAILED_MESSAGE, 'FAMILIES_ERROR', 'FILLING_FAMILIES'],
  ['failWorldFill', failWorldFill, WORLD_FILL_FAILED_MESSAGE, 'FILL_ERROR', 'FILLING'],
] as const)('%s: the failure lines follow the hold (D-15, D-18)', (_name, fail, message, errorStep, runningStep) => {
  const placedCtx = () =>
    makeCtx({ seed: { character: people(), world_gen_state: [stateRow({ step: runningStep })] } });

  it('everyone at the crossing and the triggering character, wherever he is, get the 7d line once; nobody else', () => {
    const ctx = placedCtx();
    fail(ctx, stateOf(ctx), message);
    expect(stateOf(ctx)).toMatchObject({ step: errorStep, errorMessage: message });
    const lines = privateLines(ctx);
    expect(lines.map((l: any) => l.characterId).sort()).toEqual([10n, 11n, 12n]);
    for (const line of lines) expect(line).toMatchObject({ kind: 'system', message: REGION_HOLD_FAILED_LINE });
    expect(rows(ctx, 'event_creation')).toHaveLength(0);
  });

  it('the triggering character standing at the crossing is told once', () => {
    const ctx = placedCtx();
    ctx.db.character.id.update({ ...rows(ctx, 'character')[0], locationId: CROSSING });
    fail(ctx, stateOf(ctx), message);
    const lines = privateLines(ctx);
    expect(lines.filter((l: any) => l.characterId === 10n)).toHaveLength(1);
    expect(lines).toHaveLength(3);
  });

  it('the kill switch or ceiling: the resting line with the [explore] hint instead of 7d', () => {
    const ctx = placedCtx();
    fail(ctx, stateOf(ctx), LLM_RESTING_LINE);
    expect(stateOf(ctx)).toMatchObject({ step: errorStep, errorMessage: LLM_RESTING_LINE });
    const lines = privateLines(ctx);
    expect(lines).toHaveLength(3);
    for (const line of lines) expect(line.message).toBe(RESTING_EXPLORE);
  });

  it('any other refusal message still gives the 7d line at the crossing', () => {
    const ctx = placedCtx();
    fail(ctx, stateOf(ctx), WORLD_FILL_REFUSED_MESSAGE);
    expect(stateOf(ctx)).toMatchObject({ step: errorStep, errorMessage: WORLD_FILL_REFUSED_MESSAGE });
    expect(privateLines(ctx)).toHaveLength(3);
    for (const line of privateLines(ctx)) expect(line.message).toBe(REGION_HOLD_FAILED_LINE);
  });

  it('a new character waiting in creation (a starter state, location 0) gets one creation_error line and no private line', () => {
    const ctx = makeCtx({
      seed: {
        character: [
          { id: 10n, ownerUserId: 7n, name: 'Aldric', race: 'Kobold', className: 'Ashweaver', locationId: 0n },
          // Someone standing at location 0 is never "at the crossing".
          { id: 14n, ownerUserId: 5n, name: 'Edda', race: 'Human', className: 'Warden', locationId: 0n },
        ],
        world_gen_state: [stateRow({ step: runningStep, sourceLocationId: 0n, sourceRegionId: 0n })],
      },
    });
    fail(ctx, stateOf(ctx), message);
    expect(stateOf(ctx).step).toBe(errorStep);
    const creation = rows(ctx, 'event_creation');
    expect(creation).toHaveLength(1);
    expect(creation[0]).toMatchObject({ kind: 'creation_error', playerId: alice });
    expect(creation[0].message).toBe(
      fail === failWorldFamilies ? CHOSEN_5 : `${WORLD_FILL_FAILED_MESSAGE} Type [explore] to try again.`,
    );
    expect(rows(ctx, 'event_private')).toHaveLength(0);
  });
});

it('failWorldFamilies in creation with the resting message: the resting line with the [explore] hint', () => {
  const ctx = makeCtx({
    seed: {
      character: [{ id: 10n, ownerUserId: 7n, name: 'Aldric', race: 'Kobold', className: 'Ashweaver', locationId: 0n }],
      world_gen_state: [stateRow({ step: 'FILLING_FAMILIES', sourceLocationId: 0n, sourceRegionId: 0n })],
    },
  });
  failWorldFamilies(ctx, stateOf(ctx), LLM_RESTING_LINE);
  const creation = rows(ctx, 'event_creation');
  expect(creation).toHaveLength(1);
  expect(creation[0].message).toBe(RESTING_EXPLORE);
});

it('failWorldFill keeps its rule hub placement: the hubs of a region with none get their vendor and banker', () => {
  const ctx = makeCtx({ seed: { character: people() } });
  const arrival = rows(ctx, 'location').find((l: any) => l.id === 101n);
  ctx.db.location.id.update({ ...arrival, isHub: false });
  failWorldFill(ctx, stateOf(ctx), WORLD_FILL_FAILED_MESSAGE);
  expect(stateOf(ctx)).toMatchObject({ step: 'FILL_ERROR', errorMessage: WORLD_FILL_FAILED_MESSAGE });
  const hubs = rows(ctx, 'location').filter((l: any) => l.regionId === REGION && l.isHub === true);
  expect(hubs.length).toBeGreaterThan(0);
  for (const hub of hubs) {
    const services = rows(ctx, 'npc').filter((n: any) => n.locationId === hub.id).map((n: any) => n.npcType).sort();
    expect(services).toEqual(expect.arrayContaining(['banker', 'vendor']));
  }
});

it('no families path ever sets FILL_ERROR (every failure case checks the step, T-51.3.1.2-25)', () => {
  const steps: string[] = [];
  const unbuildable = makeCtx({ seed: { world_gen_state: [stateRow({ generatedRegionId: undefined })] } });
  startWorldFamilies(unbuildable, stateOf(unbuildable));
  steps.push(stateOf(unbuildable).step);
  const halted = makeCtx();
  setLlmEnabled(halted, false);
  startWorldFamilies(halted, stateOf(halted));
  steps.push(stateOf(halted).step);
  const budget = makeCtx();
  exhaustDay(budget);
  startWorldFamilies(budget, stateOf(budget));
  steps.push(stateOf(budget).step);
  const direct = makeCtx({ seed: { world_gen_state: [stateRow({ step: 'FILLING_FAMILIES' })] } });
  failWorldFamilies(direct, stateOf(direct), WORLD_FAMILIES_FAILED_MESSAGE);
  steps.push(stateOf(direct).step);
  expect(steps).toEqual(['FAMILIES_ERROR', 'FAMILIES_ERROR', 'FAMILIES_ERROR', 'FAMILIES_ERROR']);
});

// ---------------------------------------------------------------------------
// finishRegionFill: the hold ends and the economy starts after it (D-15, D-16)
// ---------------------------------------------------------------------------

describe('finishRegionFill (D-15, D-16; the discovery line moves to 7c)', () => {
  const dialsOn = (): any[] => [{ id: 1n, ...DEFAULT_DIALS, aiEnabled: true }];
  const dialsOff = (): any[] => [{ id: 1n, ...DEFAULT_DIALS, aiEnabled: false }];
  const econJobs = (ctx: any): any[] => rows(ctx, 'llm_job').filter((j: any) => j.route === 'region_economy');
  const OPENED = regionOpenedLine('Saltmarsh Reach');
  const DISCOVERY = pickDiscoveryMessage('Saltmarsh Reach', T0);

  const finishing = (step: string, seed: Record<string, any[]> = {}) =>
    makeCtx({ seed: { character: people(), world_gen_state: [stateRow({ step })], ...seed } });

  it.each(['FILLING_FAMILIES', 'FILLING'])(
    'a %s state becomes COMPLETE; the crossing and the triggering character get 7c, then he gets the discovery line',
    (step) => {
      const ctx = finishing(step, { world_gen_state: [stateRow({ step, errorMessage: 'stale' })] });
      finishRegionFill(ctx, stateOf(ctx));
      expect(stateOf(ctx)).toMatchObject({ step: 'COMPLETE', generatedRegionId: REGION });
      expect(stateOf(ctx).errorMessage).toBeUndefined();
      expect(rowColumnProblems('world_gen_state', stateOf(ctx))).toEqual([]);

      const lines = privateLines(ctx);
      expect(lines.filter((l: any) => l.characterId === 10n).map((l: any) => l.message)).toEqual([OPENED, DISCOVERY]);
      expect(lines.filter((l: any) => l.characterId === 11n).map((l: any) => l.message)).toEqual([OPENED]);
      expect(lines.filter((l: any) => l.characterId === 12n).map((l: any) => l.message)).toEqual([OPENED]);
      expect(lines.filter((l: any) => l.characterId === 13n)).toEqual([]);
      for (const line of lines) expect(line.kind).toBe('system');
      expect(OPENED).toContain('Beyond it lies Saltmarsh Reach, and the way in is open.');
      expect(rows(ctx, 'event_creation')).toHaveLength(0);
    },
  );

  it('the triggering character standing at the crossing gets 7c once, then the discovery line', () => {
    const ctx = finishing('FILLING_FAMILIES');
    ctx.db.character.id.update({ ...rows(ctx, 'character')[0], locationId: CROSSING });
    finishRegionFill(ctx, stateOf(ctx));
    const mine = privateLines(ctx).filter((l: any) => l.characterId === 10n).map((l: any) => l.message);
    expect(mine).toEqual([OPENED, DISCOVERY]);
  });

  it('with the AI economy switch on, one region_economy job for the state\'s player and character, after COMPLETE', () => {
    const ctx = finishing('FILLING_FAMILIES', { economy_dials: dialsOn() });
    finishRegionFill(ctx, stateOf(ctx));
    expect(stateOf(ctx).step).toBe('COMPLETE');
    const jobs = econJobs(ctx);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ playerId: alice, characterId: 10n });
    expect(JSON.parse(jobs[0].requestJson)).toMatchObject({ regionId: REGION.toString(), mode: 'region' });
  });

  it.each([
    ['missing economy_dials row', {}],
    ['aiEnabled false', { economy_dials: dialsOff() }],
  ])('with the switch off (%s) no economy job is enqueued', (_name, seed) => {
    const ctx = finishing('FILLING_FAMILIES', seed);
    finishRegionFill(ctx, stateOf(ctx));
    expect(stateOf(ctx).step).toBe('COMPLETE');
    expect(econJobs(ctx)).toHaveLength(0);
    expect(rows(ctx, 'region_economy')).toHaveLength(0);
  });

  it('a throw inside the economy start is caught and logged by name only; the region is still COMPLETE and opened', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const base = finishing('FILLING_FAMILIES', { economy_dials: dialsOn() });
      const db = new Proxy(base.db, {
        get(target, prop, receiver) {
          if (prop === 'economy_dials') throw new Error('broken economy_dials');
          return Reflect.get(target, prop, receiver);
        },
      });
      const ctx = { ...base, db };
      expect(() => finishRegionFill(ctx, stateOf(base))).not.toThrow();
      expect(stateOf(base).step).toBe('COMPLETE');
      expect(privateLines(base).filter((l: any) => l.message === OPENED)).toHaveLength(3);
      expect(econJobs(base)).toHaveLength(0);
      const logged = error.mock.calls.map((c) => String(c[0]));
      expect(logged).toContain(`Region economy start failed for region ${REGION}: Error`);
      expect(logged.join('\n')).not.toContain('broken economy_dials');
    } finally {
      error.mockRestore();
    }
  });

  it('a starter state (sourceLocationId 0n): COMPLETE, the economy starts, and the waiting character is placed (arrival and discovery, no 7c) (51.3.1.2-13)', () => {
    const ctx = makeCtx({
      seed: {
        character: [{ id: 10n, ownerUserId: 7n, name: 'Aldric', race: 'Kobold', className: 'Ashweaver', locationId: 0n }],
        world_gen_state: [stateRow({ step: 'FILLING_FAMILIES', sourceLocationId: 0n, sourceRegionId: 0n })],
        economy_dials: dialsOn(),
      },
    });
    finishRegionFill(ctx, stateOf(ctx));
    expect(stateOf(ctx).step).toBe('COMPLETE');
    expect(econJobs(ctx)).toHaveLength(1);
    const OPENED_HERE = regionOpenedLine('Saltmarsh Reach');
    const priv = rows(ctx, 'event_private');
    expect(priv.map((r: any) => r.kind)).toEqual(['narrative', 'system']);
    expect(priv.map((r: any) => r.message)).not.toContain(OPENED_HERE);
    expect(rows(ctx, 'event_creation')).toHaveLength(0);
  });

  it('a state that is already COMPLETE is left as it is: no second line and no second job', () => {
    const ctx = finishing('FILLING_FAMILIES', { economy_dials: dialsOn() });
    finishRegionFill(ctx, stateOf(ctx));
    const linesBefore = privateLines(ctx).length;
    const stateBefore = { ...stateOf(ctx) };
    finishRegionFill(ctx, stateOf(ctx));
    expect(privateLines(ctx)).toHaveLength(linesBefore);
    expect(econJobs(ctx)).toHaveLength(1);
    expect(stateOf(ctx)).toEqual(stateBefore);
  });

  it.each(['FAMILIES_ERROR', 'FILL_ERROR', 'ERROR', 'GENERATING', 'PENDING'])(
    'a %s state is not a finishing state: nothing changes',
    (step) => {
      const ctx = finishing(step, { economy_dials: dialsOn() });
      finishRegionFill(ctx, stateOf(ctx));
      expect(stateOf(ctx).step).toBe(step);
      expect(privateLines(ctx)).toHaveLength(0);
      expect(econJobs(ctx)).toHaveLength(0);
    },
  );
});
