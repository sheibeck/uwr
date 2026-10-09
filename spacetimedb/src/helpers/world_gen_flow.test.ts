// Phase 51.3.1.2 (Bigger Regions), Plan 11: the two-stage region fill wired into the apply layer.
//   world_gen (2a)           the places (writeRegionPlaces), then the families job in the same transaction
//   world_gen (legacy)       a reply that still carries families (queued before the publish) completes at once
//   world_gen_families (2b)  the families (writeRegionFamilies), then finishRegionFill (COMPLETE, 7c, economy)
//   applyLlmFailure          every 2b failure is FAMILIES_ERROR, never FILL_ERROR (D-08, Pitfall 1)
//   world_gen_start          a traveller gets no milestone and no discovery line at stage 1 (owner choices)
// The mock ctx is strict and runs under the recording schema. Replies are canned; no fetch, no paid call.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

import { applyLlmResult, applyLlmFailure, type ApplyJob } from './llm_apply';
import {
  pickDiscoveryMessage,
  regionChartedPlaces,
  WORLD_START_MILESTONE_LINE,
  WORLD_FILL_FAILED_MESSAGE,
  WORLD_FAMILIES_FAILED_MESSAGE,
} from './world_gen';
import { REGION_HOLD_FAILED_LINE, regionOpenedLine } from './region_hold';
import { createMockCtx } from './test-utils';
import { snapshotDb, rowColumnProblems } from './schema_recorder';
import { SOURCE_KEYS, LLM_RESTING_LINE } from './llm_queue';
import { encodeRouteInput } from './llm_inputs';
import { patchAdminState } from './llm_admin_state';
import { utcDay } from './llm_budget';
import { placeCountFor } from '../data/region_shape';
import { familyCountFor, DENSITY_RULES } from '../data/density_rules';
import { DEFAULT_DIALS } from '../data/economy_rules';
import { LLM_PLAYER_MAX_ACTIVE_JOBS } from '../data/llm_limits';

beforeAll(async () => {
  await import('../schema/tables');
});

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// Setup: stage 1 has landed for a traveller (rows seeded directly); the state is FILLING
// ---------------------------------------------------------------------------

const T0 = 1_700_000_000_000_000n;
const ts = { microsSinceUnixEpoch: T0 };
const alice = { toHexString: () => 'a'.repeat(64) };
const bob = { toHexString: () => 'b'.repeat(64) };
const SOURCE_REGION = 30n;
const CROSSING = 50n;
const ARRIVAL = 60n;
const ELSEWHERE = 999n;
const REGION_NAME = 'Saltmarsh Reach';
const PERSONALITY = { traits: ['quiet'], speechPattern: 'slow', knowledgeDomains: ['tides'], secrets: [], affinityMultiplier: 1.0 };

/** The first region id (from 100n) whose server place count is `count` (placeCountFor, hubSeed only). */
function regionWithCount(count: number, from = 100n): bigint {
  for (let id = from; id < from + 5000n; id += 1n) if (placeCountFor(id) === count) return id;
  throw new Error(`no region id with place count ${count}`);
}
const REGION_8 = regionWithCount(8);
const REGION_9 = regionWithCount(9);
const REGION_10 = regionWithCount(10);

const NEW_PLACES = [
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

function locRow(id: bigint, name: string, regionId: bigint, over: Record<string, unknown> = {}) {
  return {
    id,
    name,
    description: `About ${name}.`,
    zone: REGION_NAME,
    regionId,
    levelOffset: 0n,
    isSafe: false,
    terrainType: 'swamp',
    bindStone: false,
    craftingAvailable: false,
    shortName: '',
    placeNoun: '',
    isHub: false,
    ...over,
  };
}

const stateRow = (regionId: bigint, over: Record<string, unknown> = {}) => ({
  id: 5n,
  playerId: alice,
  characterId: 10n,
  sourceLocationId: CROSSING,
  sourceRegionId: SOURCE_REGION,
  step: 'FILLING',
  generatedRegionId: regionId,
  createdAt: ts,
  updatedAt: ts,
  ...over,
});

const people = () => [
  // The triggering character waits at the crossing (the region is held), with a second traveller; a third is elsewhere.
  { id: 10n, ownerUserId: 7n, name: 'Aldric', race: 'Kobold', className: 'Ashweaver', level: 3n, locationId: CROSSING },
  { id: 11n, ownerUserId: 8n, name: 'Bree', race: 'Human', className: 'Warden', level: 3n, locationId: CROSSING },
  { id: 12n, ownerUserId: 9n, name: 'Corwin', race: 'Elf', className: 'Seer', level: 3n, locationId: ELSEWHERE },
];

const dialsOn = (): any[] => [{ id: 1n, ...DEFAULT_DIALS, aiEnabled: true }];

/** A world in which stage 1 of `regionId` has landed: the passage, the arrival point and the first NPC. */
function stageOneSeed(regionId: bigint, extra: Record<string, any[]> = {}): Record<string, any[]> {
  const items = ['Wood', 'Peat', 'Scrap Cloth', 'Flax', 'Herbs'].map((name, i) => ({ id: 700n + BigInt(i), name, slot: 'resource' }));
  return {
    player: [
      { id: alice, userId: 7n, activeCharacterId: 10n },
      { id: bob, userId: 8n, activeCharacterId: 11n },
    ],
    character: people(),
    region: [
      { id: SOURCE_REGION, name: 'Old Reach', dangerMultiplier: 100n, regionType: 'generated', biome: 'plains' },
      { id: regionId, name: REGION_NAME, dangerMultiplier: 150n, regionType: 'generated', biome: 'swamp', isGenerated: true, generatedByCharacterId: 10n },
    ],
    location: [
      locRow(CROSSING, `The Passage to ${REGION_NAME}`, SOURCE_REGION, { zone: 'Old Reach', terrainType: 'passage', isSafe: true }),
      locRow(ARRIVAL, 'Brinegate', regionId, { isSafe: true, terrainType: 'town' }),
    ],
    location_connection: [
      { id: 1n, fromLocationId: CROSSING, toLocationId: ARRIVAL },
      { id: 2n, fromLocationId: ARRIVAL, toLocationId: CROSSING },
    ],
    npc: [
      {
        id: 1n,
        name: 'Oswin Tarr',
        npcType: 'lore',
        locationId: ARRIVAL,
        description: 'A figure at the gate.',
        greeting: 'Well met.',
        gender: 'male',
        personalityJson: '{}',
      },
    ],
    world_gen_state: [stateRow(regionId)],
    item_template: items,
    ...extra,
  };
}

function makeCtx(regionId: bigint = REGION_9, extra: Record<string, any[]> = {}) {
  return createMockCtx({ seed: stageOneSeed(regionId, extra), sender: alice, timestampMicros: T0, strict: true });
}

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const stateOf = (ctx: any) => rows(ctx, 'world_gen_state').find((s: any) => s.id === 5n);
const jobsOf = (ctx: any, route: string) => rows(ctx, 'llm_job').filter((j: any) => j.route === route);
const chartedOf = (ctx: any, regionId: bigint) =>
  rows(ctx, 'location').filter((l: any) => l.regionId === regionId && l.terrainType !== 'uncharted');
const privateTo = (ctx: any, characterId: bigint) =>
  rows(ctx, 'event_private').filter((e: any) => e.characterId === characterId).map((e: any) => e.message);

/** The stored world_gen (2a) job: its request carries the input the job was asked with. */
function fillJob(input: Record<string, unknown> | undefined, genStateId = '5'): ApplyJob {
  const request: Record<string, unknown> = { genStateId };
  if (input) request.input = encodeRouteInput(input);
  return { domain: 'world_gen', playerId: alice, contextJson: JSON.stringify(request) };
}
const asked = (placeCount: number | undefined) =>
  fillJob({ regionName: REGION_NAME, biome: 'swamp', ...(placeCount === undefined ? {} : { placeCount }) });
const familiesJob = (genStateId = '5'): ApplyJob => ({
  domain: 'world_gen_families',
  playerId: alice,
  contextJson: JSON.stringify({ genStateId, input: { regionName: REGION_NAME } }),
});

/** A 2a reply (no families): `n` new places in a chain from the arrival point, one safe, one NPC. */
function placesReply(n: number, over: Record<string, unknown> = {}) {
  const locations = NEW_PLACES.slice(0, n).map((name, i) => ({
    name,
    shortName: name.split(' ').slice(-1)[0],
    placeNoun: 'the marsh',
    description: `About ${name}.`,
    terrainType: 'swamp',
    isHub: false,
    isSafe: i === 1,
    connectsTo: [i === 0 ? 'Brinegate' : NEW_PLACES[i - 1]],
  }));
  return {
    dominantFaction: 'The Brine Wardens',
    landmarks: ['The Salt Stair'],
    threats: ['skitterers in the reeds'],
    arrival: { shortName: 'Brinegate', placeNoun: 'the gate', isHub: true },
    locations,
    npcs: [
      { name: 'Marta Vell', gender: 'female', npcType: 'lore', locationName: 'Gull Rock', description: 'A tide reader.', greeting: 'Hm.', personality: PERSONALITY },
    ],
    ...over,
  };
}

const FAMILY_WORDS = [
  ['Skitter', 'skitterer'], ['Toll', 'tollman'], ['Bog', 'boglight'], ['Reed', 'reedhound'], ['Mire', 'mirecrow'],
  ['Salt', 'saltwight'], ['Eel', 'eelkin'], ['Fen', 'fenboar'], ['Tide', 'tidehag'], ['Silt', 'siltworm'],
  ['Lynx', 'marshlynx'], ['Rust', 'rustcrab'], ['Gloom', 'gloommoth'], ['Brine', 'brinetoad'], ['Drift', 'driftshade'],
];

/** A 2b reply: `count` families, each with three named members and a plain history. */
function familiesReply(count: number) {
  return {
    families: FAMILY_WORDS.slice(0, count).map(([base, singular]) => ({
      name: `${base} Brood`,
      singularNoun: singular,
      pluralNoun: `${singular}s`,
      creatureType: 'beast',
      iconKey: 'beast',
      temperament: 'aggressive',
      ambushVerb: 'lunge',
      ambushRest: 'from the reeds',
      members: [
        { role: 'tank', name: `${base} Warden` },
        { role: 'damage', name: `${base} Biter` },
        { role: 'caster', name: `${base} Caller` },
      ],
      fitLocations: [],
      relations: [],
      history: 'The first floods brought them here, and the reeds have hidden them since.',
      inFeud: false,
    })),
  };
}

/** Run 2a with a stored count of the region's own place count and a reply of nine places. */
function afterPlaces(regionId: bigint = REGION_9, extra: Record<string, any[]> = {}) {
  const ctx = makeCtx(regionId, extra);
  applyLlmResult(ctx, asked(placeCountFor(regionId)), JSON.stringify(placesReply(9)));
  expect(stateOf(ctx).step).toBe('FILLING_FAMILIES');
  return ctx;
}

/** Bigint-safe JSON of rows. */
const json = (value: unknown): string => JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v));

// ---------------------------------------------------------------------------
// Stage 2a
// ---------------------------------------------------------------------------

describe('stage 2a: the places, then the families job in the same transaction (D-01, D-03)', () => {
  it('placeCount 9 and 8 usable places: 9 charted places and the doorway, no family, FILLING_FAMILIES with one world_gen_families job', () => {
    const ctx = makeCtx(REGION_9);
    applyLlmResult(ctx, asked(9), JSON.stringify(placesReply(8)));

    expect(regionChartedPlaces(ctx, REGION_9)).toHaveLength(9);
    expect(rows(ctx, 'location').filter((l: any) => l.regionId === REGION_9 && l.terrainType === 'uncharted')).toHaveLength(1);
    expect(rows(ctx, 'creature_family')).toEqual([]);
    expect(rows(ctx, 'enemy_template')).toEqual([]);
    expect(rows(ctx, 'place_pool').filter((p: any) => p.kind === 'creature')).toEqual([]);

    expect(stateOf(ctx)).toMatchObject({ step: 'FILLING_FAMILIES', generatedRegionId: REGION_9 });
    expect(stateOf(ctx).errorMessage).toBeUndefined();
    const families = jobsOf(ctx, 'world_gen_families');
    expect(families).toHaveLength(1);
    expect(families[0]).toMatchObject({ status: 'pending', playerId: alice, characterId: 10n });
    expect(JSON.parse(families[0].dedupeKey)).toEqual([alice.toHexString(), 'world_gen_families', SOURCE_KEYS.worldGen(5n)]);
    expect(JSON.parse(families[0].requestJson).genStateId).toBe('5');
    expect(JSON.parse(families[0].requestJson).input.familyCount).toBe(familyCountFor(9));
    expect(rowColumnProblems('llm_job', families[0])).toEqual([]);

    expect(jobsOf(ctx, 'region_economy')).toEqual([]);
    expect(jobsOf(ctx, 'world_gen')).toEqual([]);
    const opened = regionOpenedLine(REGION_NAME);
    expect(rows(ctx, 'event_private').map((e: any) => e.message)).not.toContain(opened);
    expect(rows(ctx, 'event_private')).toEqual([]);
  });

  it('the server count rules, not the reply: a stored count of 8 on a region whose count is 9 still keeps 9 places', () => {
    const ctx = makeCtx(REGION_9);
    applyLlmResult(ctx, asked(8), JSON.stringify(placesReply(9)));
    expect(regionChartedPlaces(ctx, REGION_9)).toHaveLength(placeCountFor(REGION_9));
    expect(stateOf(ctx).step).toBe('FILLING_FAMILIES');
  });

  it('placeCount 9 and 4 usable places: FILL_ERROR, no location or connection row added, no families job', () => {
    const ctx = makeCtx(REGION_9);
    const crossingBefore = json(rows(ctx, 'location').find((l: any) => l.id === CROSSING));
    const connectionsBefore = json(rows(ctx, 'location_connection'));
    const npcsBefore = rows(ctx, 'npc').length;
    applyLlmResult(ctx, asked(9), JSON.stringify(placesReply(4)));

    expect(stateOf(ctx)).toMatchObject({ step: 'FILL_ERROR', errorMessage: WORLD_FILL_FAILED_MESSAGE });
    // No place added; the region facts are not written either (too_few returns before any write).
    expect(rows(ctx, 'location').map((l: any) => l.id)).toEqual([CROSSING, ARRIVAL]);
    expect(json(rows(ctx, 'location').find((l: any) => l.id === CROSSING))).toBe(crossingBefore);
    expect(rows(ctx, 'region').find((r: any) => r.id === REGION_9).dominantFaction).toBeUndefined();
    expect(json(rows(ctx, 'location_connection'))).toBe(connectionsBefore);
    // The only NPCs a failed fill adds are the hub services it places by rule (D-59): none from the reply.
    const added = rows(ctx, 'npc').slice(npcsBefore);
    for (const npc of added) {
      expect(npc.locationId).toBe(ARRIVAL);
      expect(['vendor', 'banker']).toContain(npc.npcType);
    }
    expect(rows(ctx, 'npc').map((n: any) => n.name)).not.toContain('Marta Vell');
    expect(jobsOf(ctx, 'world_gen_families')).toEqual([]);
    expect(rows(ctx, 'llm_job')).toEqual([]);
    expect(privateTo(ctx, 10n)).toEqual([REGION_HOLD_FAILED_LINE]);
  });

  it('a stored input without a count (queued before the publish) and 3 usable places: accepted with no floor, FILLING_FAMILIES', () => {
    for (const job of [asked(undefined), fillJob(undefined)]) {
      const ctx = makeCtx(REGION_9);
      applyLlmResult(ctx, job, JSON.stringify(placesReply(3)));
      expect(regionChartedPlaces(ctx, REGION_9)).toHaveLength(4);
      expect(stateOf(ctx).step).toBe('FILLING_FAMILIES');
      expect(jobsOf(ctx, 'world_gen_families')).toHaveLength(1);
    }
  });

  it('a stored count outside the place range or not a whole number reads as no count (no floor)', () => {
    for (const placeCount of [7, 11, 8.5, 0, -9]) {
      const ctx = makeCtx(REGION_9);
      applyLlmResult(ctx, asked(placeCount), JSON.stringify(placesReply(3)));
      expect(stateOf(ctx).step).toBe('FILLING_FAMILIES');
      expect(regionChartedPlaces(ctx, REGION_9)).toHaveLength(4);
    }
    expect(DENSITY_RULES.REGION_PLACES_MIN).toBe(8);
    expect(DENSITY_RULES.REGION_PLACES_MAX).toBe(10);
  });

  it.each([
    ['unparseable text', 'the marsh said nothing useful'],
    ['a reply without a locations array', JSON.stringify({ ...placesReply(9), locations: undefined })],
    ['a reply whose locations is not an array', JSON.stringify({ ...placesReply(9), locations: 'Reedwatch' })],
    ['JSON null', 'null'],
  ])('%s fails the fill (FILL_ERROR) with no place written and no families job', (_label, reply) => {
    const ctx = makeCtx(REGION_9);
    applyLlmResult(ctx, asked(9), reply);
    expect(stateOf(ctx)).toMatchObject({ step: 'FILL_ERROR', errorMessage: WORLD_FILL_FAILED_MESSAGE });
    expect(rows(ctx, 'location').map((l: any) => l.id)).toEqual([CROSSING, ARRIVAL]);
    expect(rows(ctx, 'llm_job')).toEqual([]);
  });

  it('a reply that still carries families (queued before the publish) completes directly: COMPLETE, families, 7c, discovery, economy, no families job', () => {
    const ctx = makeCtx(REGION_9, { economy_dials: dialsOn() });
    applyLlmResult(ctx, asked(9), JSON.stringify({ ...placesReply(3), families: familiesReply(2).families }));

    expect(stateOf(ctx)).toMatchObject({ step: 'COMPLETE', generatedRegionId: REGION_9 });
    const places = regionChartedPlaces(ctx, REGION_9).length;
    expect(places).toBe(4);
    expect(rows(ctx, 'creature_family')).toHaveLength(familyCountFor(places));
    expect(rows(ctx, 'creature_family').some((f: any) => f.name === 'Skitter Brood')).toBe(true);
    expect(jobsOf(ctx, 'world_gen_families')).toEqual([]);
    expect(jobsOf(ctx, 'region_economy')).toHaveLength(1);

    const opened = regionOpenedLine(REGION_NAME);
    expect(privateTo(ctx, 10n)).toEqual([opened, pickDiscoveryMessage(REGION_NAME, T0)]);
    expect(privateTo(ctx, 11n)).toEqual([opened]);
    expect(privateTo(ctx, 12n)).toEqual([]);
    // The old completion line is gone (finishRegionFill speaks for the region now).
    expect(rows(ctx, 'event_private').map((e: any) => e.message).join('\n')).not.toContain('settles into place');
  });

  it('a throw while starting 2b is caught: the places stay, the state is FAMILIES_ERROR and the log names the error only', () => {
    const base = makeCtx(REGION_9);
    const db = new Proxy(base.db, {
      get(target, prop, receiver) {
        if (prop === 'llm_job') throw new Error('broken llm_job with secret detail');
        return Reflect.get(target, prop, receiver);
      },
    });
    const ctx = { ...base, db };
    expect(() => applyLlmResult(ctx, asked(9), JSON.stringify(placesReply(9)))).not.toThrow();

    expect(regionChartedPlaces(base, REGION_9)).toHaveLength(9);
    expect(stateOf(base)).toMatchObject({ step: 'FAMILIES_ERROR', errorMessage: WORLD_FAMILIES_FAILED_MESSAGE });
    expect(stateOf(base).step).not.toBe('FILL_ERROR');
    expect(rows(base, 'llm_job')).toEqual([]);
    expect(privateTo(base, 10n)).toEqual([REGION_HOLD_FAILED_LINE]);
    const logged = errorSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('Error');
    expect(logged).not.toContain('secret detail');
  });

  it('a refused 2b enqueue (the ceiling): FAMILIES_ERROR with the resting line, the places stay', () => {
    const ctx = makeCtx(REGION_9);
    patchAdminState(ctx, { dailyCeilingMicroUsd: 1n });
    applyLlmResult(ctx, asked(9), JSON.stringify(placesReply(9)));
    expect(regionChartedPlaces(ctx, REGION_9)).toHaveLength(9);
    expect(stateOf(ctx)).toMatchObject({ step: 'FAMILIES_ERROR', errorMessage: LLM_RESTING_LINE });
    expect(rows(ctx, 'llm_job')).toEqual([]);
    expect(privateTo(ctx, 10n)).toEqual([`${LLM_RESTING_LINE} Type [explore] to try again.`]);
  });

  it('a player holding the most capped jobs still gets the 2b job (never refused busy)', () => {
    const held = ['world_gen', 'npc_conversation', 'skill_gen'].map((route, i) => ({
      id: 900n + BigInt(i),
      playerId: alice,
      route,
      dedupeKey: `seed-${i}`,
      status: i === 0 ? 'received' : 'pending',
      budgetDay: utcDay(ts),
    }));
    expect(held.length).toBeGreaterThanOrEqual(LLM_PLAYER_MAX_ACTIVE_JOBS);
    const ctx = makeCtx(REGION_9, { llm_job: held });
    applyLlmResult(ctx, asked(9), JSON.stringify(placesReply(9)));
    expect(stateOf(ctx).step).toBe('FILLING_FAMILIES');
    expect(jobsOf(ctx, 'world_gen_families')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Stage 2b
// ---------------------------------------------------------------------------

describe('stage 2b: the families complete the region (D-01, D-15, D-16, SC3)', () => {
  it('9 places: 13 families, 3-5 per host place, COMPLETE, 7c then discovery, one region_economy job', () => {
    const ctx = afterPlaces(REGION_9, { economy_dials: dialsOn() });
    const placesBefore = rows(ctx, 'location').length;
    applyLlmResult(ctx, familiesJob(), JSON.stringify(familiesReply(13)));

    expect(stateOf(ctx)).toMatchObject({ step: 'COMPLETE', generatedRegionId: REGION_9 });
    expect(rows(ctx, 'location')).toHaveLength(placesBefore);
    const families = rows(ctx, 'creature_family').filter((f: any) => f.regionId === REGION_9);
    expect(families).toHaveLength(13);
    const hosts = regionChartedPlaces(ctx, REGION_9).filter((l: any) => !l.isSafe && !l.isHub);
    expect(hosts.length).toBeGreaterThanOrEqual(DENSITY_RULES.MIN_HOST_PLACES);
    for (const host of hosts) {
      const pooled = rows(ctx, 'place_pool').filter((p: any) => p.locationId === host.id && p.kind === 'creature');
      expect(pooled.length, host.name).toBeGreaterThanOrEqual(3);
      expect(pooled.length, host.name).toBeLessThanOrEqual(5);
      expect(rows(ctx, 'location_enemy_template').some((l: any) => l.locationId === host.id), host.name).toBe(true);
    }

    const opened = regionOpenedLine(REGION_NAME);
    expect(privateTo(ctx, 10n)).toEqual([opened, pickDiscoveryMessage(REGION_NAME, T0)]);
    expect(privateTo(ctx, 11n)).toEqual([opened]);
    expect(privateTo(ctx, 12n)).toEqual([]);
    expect(jobsOf(ctx, 'region_economy')).toHaveLength(1);
    expect(jobsOf(ctx, 'world_gen_families')).toHaveLength(1);
    expect(jobsOf(ctx, 'world_gen')).toEqual([]);
  });

  it.each([
    [8, REGION_8, 12],
    [9, REGION_9, 13],
    [10, REGION_10, 15],
  ])('%i places (region %s) end with %i families', (places, regionId, families) => {
    const ctx = afterPlaces(regionId);
    expect(regionChartedPlaces(ctx, regionId)).toHaveLength(places);
    applyLlmResult(ctx, familiesJob(), JSON.stringify(familiesReply(15)));
    expect(stateOf(ctx).step).toBe('COMPLETE');
    expect(rows(ctx, 'creature_family').filter((f: any) => f.regionId === regionId)).toHaveLength(families);
  });

  const failures: [string, (ctx: any) => void, string][] = [
    ['a failed call', (ctx) => applyLlmFailure(ctx, { ...familiesJob(), errorCode: 'overloaded' }), WORLD_FAMILIES_FAILED_MESSAGE],
    ['the kill switch (resting code)', (ctx) => applyLlmFailure(ctx, { ...familiesJob(), errorCode: 'halted' }), LLM_RESTING_LINE],
    ['the ceiling (resting code)', (ctx) => applyLlmFailure(ctx, { ...familiesJob(), errorCode: 'ceiling' }), LLM_RESTING_LINE],
    ['an apply that failed every attempt', (ctx) => applyLlmFailure(ctx, { ...familiesJob(), errorCode: 'apply_error' }), WORLD_FAMILIES_FAILED_MESSAGE],
    ['unparseable text', (ctx) => applyLlmResult(ctx, familiesJob(), 'the reeds keep their secrets'), WORLD_FAMILIES_FAILED_MESSAGE],
    ['JSON null', (ctx) => applyLlmResult(ctx, familiesJob(), 'null'), WORLD_FAMILIES_FAILED_MESSAGE],
    ['a reply without a families array', (ctx) => applyLlmResult(ctx, familiesJob(), JSON.stringify({ creatures: [] })), WORLD_FAMILIES_FAILED_MESSAGE],
    ['a families value that is not an array', (ctx) => applyLlmResult(ctx, familiesJob(), JSON.stringify({ families: 'many' })), WORLD_FAMILIES_FAILED_MESSAGE],
    ['a reply whose families all fail validation', (ctx) => applyLlmResult(ctx, familiesJob(), JSON.stringify({ families: [null, 'x', 7] })), WORLD_FAMILIES_FAILED_MESSAGE],
    ['an empty families array', (ctx) => applyLlmResult(ctx, familiesJob(), JSON.stringify({ families: [] })), WORLD_FAMILIES_FAILED_MESSAGE],
  ];

  it.each(failures)('%s: FAMILIES_ERROR, never FILL_ERROR, the places unchanged, no family and no new world_gen job', (_label, act, message) => {
    const ctx = afterPlaces(REGION_9);
    const placesBefore = json(rows(ctx, 'location'));
    const connectionsBefore = json(rows(ctx, 'location_connection'));
    const jobsBefore = rows(ctx, 'llm_job').length;
    act(ctx);

    expect(stateOf(ctx)).toMatchObject({ step: 'FAMILIES_ERROR', errorMessage: message });
    expect(stateOf(ctx).step).not.toBe('FILL_ERROR');
    expect(json(rows(ctx, 'location'))).toBe(placesBefore);
    expect(json(rows(ctx, 'location_connection'))).toBe(connectionsBefore);
    expect(rows(ctx, 'creature_family')).toEqual([]);
    expect(rows(ctx, 'llm_job')).toHaveLength(jobsBefore);
    expect(jobsOf(ctx, 'world_gen')).toEqual([]);
    expect(jobsOf(ctx, 'world_gen_start')).toEqual([]);
    const line = message === LLM_RESTING_LINE ? `${LLM_RESTING_LINE} Type [explore] to try again.` : REGION_HOLD_FAILED_LINE;
    expect(privateTo(ctx, 10n)).toEqual([line]);
    expect(privateTo(ctx, 11n)).toEqual([line]);
    expect(privateTo(ctx, 12n)).toEqual([]);
  });

  it('a 2b failure on a state that is not FILLING_FAMILIES changes nothing', () => {
    for (const step of ['FILLING', 'COMPLETE', 'FAMILIES_ERROR', 'FILL_ERROR', 'GENERATING']) {
      const ctx = makeCtx(REGION_9, { world_gen_state: [stateRow(REGION_9, { step })] });
      const before = snapshotDb(ctx.db);
      applyLlmFailure(ctx, familiesJob());
      applyLlmResult(ctx, familiesJob(), JSON.stringify(familiesReply(13)));
      expect(snapshotDb(ctx.db)).toBe(before);
    }
  });

  it('a 2b result whose stored region is gone fails the families instead of throwing', () => {
    const ctx = afterPlaces(REGION_9);
    ctx.db.world_gen_state.id.update({ ...stateOf(ctx), generatedRegionId: 4242n });
    applyLlmResult(ctx, familiesJob(), JSON.stringify(familiesReply(13)));
    expect(stateOf(ctx)).toMatchObject({ step: 'FAMILIES_ERROR', errorMessage: WORLD_FAMILIES_FAILED_MESSAGE });
  });
});

// ---------------------------------------------------------------------------
// Idempotency and untouched regions
// ---------------------------------------------------------------------------

describe('a repeated apply is a no-op (Pitfall 4, T-51.3.1.2-37)', () => {
  it('a second 2a apply after FILLING_FAMILIES changes nothing', () => {
    const ctx = afterPlaces(REGION_9);
    const before = snapshotDb(ctx.db);
    applyLlmResult(ctx, asked(9), JSON.stringify(placesReply(9)));
    applyLlmFailure(ctx, asked(9));
    expect(snapshotDb(ctx.db)).toBe(before);
  });

  it('a second 2b apply after COMPLETE changes nothing', () => {
    const ctx = afterPlaces(REGION_9, { economy_dials: dialsOn() });
    applyLlmResult(ctx, familiesJob(), JSON.stringify(familiesReply(13)));
    expect(stateOf(ctx).step).toBe('COMPLETE');
    const before = snapshotDb(ctx.db);
    applyLlmResult(ctx, familiesJob(), JSON.stringify(familiesReply(13)));
    applyLlmFailure(ctx, familiesJob());
    applyLlmResult(ctx, asked(9), JSON.stringify(placesReply(9)));
    expect(snapshotDb(ctx.db)).toBe(before);
  });
});

describe('SC4: a new region leaves a COMPLETE region byte-identical (T-51.3.1.2-38)', () => {
  /** Every row that belongs to region `regionId`: places, connections, NPCs, families and everything under them. */
  function regionRows(ctx: any, regionId: bigint): string {
    const places = rows(ctx, 'location').filter((l: any) => l.regionId === regionId);
    const placeIds = new Set(places.map((l: any) => l.id));
    const families = rows(ctx, 'creature_family').filter((f: any) => f.regionId === regionId);
    const familyIds = new Set(families.map((f: any) => f.id));
    const members = rows(ctx, 'family_member').filter((m: any) => familyIds.has(m.familyId));
    const templateIds = new Set(members.map((m: any) => m.enemyTemplateId));
    const pools = rows(ctx, 'place_pool').filter((p: any) => p.regionId === regionId || placeIds.has(p.locationId));
    const poolIds = new Set(pools.map((p: any) => p.id));
    return json({
      region: rows(ctx, 'region').filter((r: any) => r.id === regionId),
      places,
      connections: rows(ctx, 'location_connection').filter((c: any) => placeIds.has(c.fromLocationId) || placeIds.has(c.toLocationId)),
      npcs: rows(ctx, 'npc').filter((n: any) => placeIds.has(n.locationId)),
      families,
      members,
      templates: rows(ctx, 'enemy_template').filter((t: any) => templateIds.has(t.id)),
      links: rows(ctx, 'location_enemy_template').filter((l: any) => placeIds.has(l.locationId)),
      relations: rows(ctx, 'family_relation').filter((r: any) => familyIds.has(r.familyId) || familyIds.has(r.otherFamilyId)),
      pools,
      poolLevels: rows(ctx, 'pool_level').filter((p: any) => poolIds.has(p.poolId) || placeIds.has(p.locationId)),
    });
  }

  it('the full 2a then 2b of a second region leaves every row of a 4-place COMPLETE region as it was', () => {
    // The old region: REGION_8 filled from a count-less job with three new places (4 in all), then its families.
    const OLD = REGION_8;
    const ctx = makeCtx(OLD);
    applyLlmResult(ctx, asked(undefined), JSON.stringify(placesReply(3)));
    applyLlmResult(ctx, familiesJob(), JSON.stringify(familiesReply(4)));
    expect(stateOf(ctx).step).toBe('COMPLETE');
    expect(regionChartedPlaces(ctx, OLD)).toHaveLength(4);
    expect(rows(ctx, 'creature_family').filter((f: any) => f.regionId === OLD).length).toBeGreaterThan(0);
    expect(rows(ctx, 'location_enemy_template').length).toBeGreaterThan(0);
    expect(rows(ctx, 'place_pool').length).toBeGreaterThan(0);
    const before = regionRows(ctx, OLD);

    // The new region: its stage 1 rows and a second state (id 6) at FILLING, from the same crossing.
    const NEW = REGION_9;
    ctx.db.region.insert({ id: NEW, name: 'Gloamfen', dangerMultiplier: 150n, regionType: 'generated', biome: 'swamp', isGenerated: true, generatedByCharacterId: 11n });
    const arrival = ctx.db.location.insert(locRow(0n, 'Gloam Gate', NEW, { isSafe: true, terrainType: 'town', zone: 'Gloamfen' }));
    ctx.db.location_connection.insert({ id: 0n, fromLocationId: CROSSING, toLocationId: arrival.id });
    ctx.db.location_connection.insert({ id: 0n, fromLocationId: arrival.id, toLocationId: CROSSING });
    ctx.db.world_gen_state.insert(stateRow(NEW, { id: 6n, playerId: bob, characterId: 11n }));
    const bobFill: ApplyJob = { ...fillJob({ regionName: 'Gloamfen', placeCount: placeCountFor(NEW) }, '6'), playerId: bob };
    const reply = placesReply(9, { arrival: { shortName: 'Gloam Gate', placeNoun: 'the gate', isHub: true } });
    reply.locations = reply.locations.map((l: any, i: number) => ({
      ...l,
      name: `Gloam ${l.name}`,
      connectsTo: [i === 0 ? 'Gloam Gate' : `Gloam ${NEW_PLACES[i - 1]}`],
    }));
    reply.npcs = [];
    applyLlmResult(ctx, bobFill, JSON.stringify(reply));
    expect(rows(ctx, 'world_gen_state').find((s: any) => s.id === 6n).step).toBe('FILLING_FAMILIES');
    applyLlmResult(ctx, { ...familiesJob('6'), playerId: bob }, JSON.stringify(familiesReply(15)));
    expect(rows(ctx, 'world_gen_state').find((s: any) => s.id === 6n).step).toBe('COMPLETE');
    expect(rows(ctx, 'creature_family').filter((f: any) => f.regionId === NEW)).toHaveLength(familyCountFor(9));

    expect(regionRows(ctx, OLD)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Stage 1 for a traveller (owner choices: no milestone line, the discovery line moves to 7c)
// ---------------------------------------------------------------------------

describe('stage 1 for a traveller (D-15, owner choices)', () => {
  const START_REPLY = {
    regionName: REGION_NAME,
    regionDescription: 'Salt wind over black water.',
    biome: 'swamp',
    startLocation: { name: 'Brinegate', description: 'A gate in the dyke.', terrainType: 'town', levelOffset: 0, isSafe: true },
    firstNpc: { name: 'Oswin Tarr', gender: 'male', npcType: 'lore', description: 'A figure at the gate.', greeting: 'Well met.', personality: PERSONALITY },
  };
  const startJob: ApplyJob = { domain: 'world_gen_start', playerId: alice, contextJson: JSON.stringify({ genStateId: '5' }) };

  it('writes the region, arrival point, first NPC and passage and starts 2a, but posts neither the milestone nor the discovery line', () => {
    const ctx = createMockCtx({
      seed: {
        player: [{ id: alice, userId: 7n, activeCharacterId: 10n }],
        character: people(),
        region: [{ id: SOURCE_REGION, name: 'Old Reach', dangerMultiplier: 100n, regionType: 'generated', biome: 'plains' }],
        location: [locRow(CROSSING, 'The Edge Beyond Old Reach', SOURCE_REGION, { zone: 'Uncharted', terrainType: 'uncharted', isSafe: true })],
        world_gen_state: [stateRow(0n, { step: 'GENERATING', generatedRegionId: undefined })],
      },
      sender: alice,
      timestampMicros: T0,
      strict: true,
    });
    applyLlmResult(ctx, startJob, JSON.stringify(START_REPLY));

    const region = rows(ctx, 'region').find((r: any) => r.name === REGION_NAME);
    expect(region).toBeDefined();
    const arrival = rows(ctx, 'location').find((l: any) => l.name === 'Brinegate');
    expect(arrival).toMatchObject({ regionId: region.id });
    expect(rows(ctx, 'npc').map((n: any) => n.name)).toEqual(['Oswin Tarr']);
    expect(rows(ctx, 'location').find((l: any) => l.id === CROSSING)).toMatchObject({ terrainType: 'passage', name: `The Passage to ${REGION_NAME}` });
    expect(stateOf(ctx)).toMatchObject({ step: 'FILLING', generatedRegionId: region.id });
    expect(jobsOf(ctx, 'world_gen')).toHaveLength(1);

    const messages = rows(ctx, 'event_private').map((e: any) => e.message);
    expect(messages).not.toContain(WORLD_START_MILESTONE_LINE);
    expect(messages).not.toContain(pickDiscoveryMessage(REGION_NAME, T0));
    expect(rows(ctx, 'event_private')).toEqual([]);
    // The World event line is unchanged.
    expect(rows(ctx, 'event_world')).toHaveLength(1);
    expect(rows(ctx, 'event_world')[0].message).toContain('Old Reach');
  });

  it('a starter state keeps its stage-1 lines (Plan 13 changes it): the arrival narrative, the discovery line and the milestone line', () => {
    const ctx = createMockCtx({
      seed: {
        player: [{ id: alice, userId: 7n, activeCharacterId: 10n }],
        character: [{ ...people()[0], locationId: 0n }],
        world_gen_state: [stateRow(0n, { step: 'GENERATING', generatedRegionId: undefined, sourceLocationId: 0n, sourceRegionId: 0n })],
      },
      sender: alice,
      timestampMicros: T0,
      strict: true,
    });
    applyLlmResult(ctx, startJob, JSON.stringify(START_REPLY));
    const lines = rows(ctx, 'event_private');
    expect(lines.map((e: any) => e.kind)).toEqual(['narrative', 'system', 'system']);
    expect(lines[1].message).toBe(pickDiscoveryMessage(REGION_NAME, T0));
    expect(lines[2].message).toBe(WORLD_START_MILESTONE_LINE);
  });
});
