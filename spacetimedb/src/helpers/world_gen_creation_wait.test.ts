// Phase 51.3.1.2 (Bigger Regions), Plan 13: a new character waits in creation until its first region's
// places AND families are in (D-15, D-17, D-18, owner choices 7e and the arrival message ending).
//   stage 1 (world_gen_start)   the character stays at location 0; the creation console gets the 7e line once
//   stage 2a (world_gen)        still at location 0, FILLING_FAMILIES
//   stage 2b (world_gen_families) finishRegionFill places the character at the arrival point with the moved
//                               stage-1 arrival message (the stored regionDescription) and the discovery line
// The mock ctx is strict and runs under the recording schema. Replies are canned; no fetch, no paid call.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

import { applyLlmResult, applyLlmFailure, type ApplyJob } from './llm_apply';
import * as worldGen from './world_gen';
import {
  pickDiscoveryMessage,
  WORLD_START_MILESTONE_LINE,
  WORLD_FILL_FAILED_MESSAGE,
  WORLD_FAMILIES_FAILED_MESSAGE,
  WORLD_FILL_REFUSED_MESSAGE,
  findRegionStart,
  startWorldGeneration,
  retryStarterWorldGen,
  retryWorldFill,
  regionFillHint,
} from './world_gen';
import { regionHoldState } from './region_hold';
import { LLM_PLAYER_DAILY_COST_MICRO_USD } from '../data/llm_limits';
import { createMockCtx } from './test-utils';
import { buildDedupeKey, SOURCE_KEYS, LLM_RESTING_LINE } from './llm_queue';
import { utcDay } from './llm_budget';
import { npcGender, npcNoticeLine } from '../data/npc_gender';
import { placeCountFor } from '../data/region_shape';
import { DEFAULT_DIALS } from '../data/economy_rules';

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
// Setup: a brand-new character (location 0) whose starter state is GENERATING
// ---------------------------------------------------------------------------

const T0 = 1_700_000_000_000_000n;
const ts = { microsSinceUnixEpoch: T0 };
const alice = { toHexString: () => 'a'.repeat(64) };
const bob = { toHexString: () => 'b'.repeat(64) };
const REGION_NAME = 'Saltmarsh Reach';
const REGION_DESCRIPTION = 'Salt wind over black water.';
const PERSONALITY = { traits: ['quiet'], speechPattern: 'slow', knowledgeDomains: ['tides'], secrets: [], affinityMultiplier: 1.0 };

/** The owner's approved 7e line (PROMPT-DRAFT, Recommended), pinned as a literal. */
const LINE_7E =
  'The Keeper clears his throat. A region is taking shape around the place you will first stand; its roads and its creatures are still being remembered.';
/** The approved ending of the arrival message (moved from the starter-reuse arrival). */
const ARRIVAL_ENDING = 'Try [look] to examine your surroundings, or [travel] to move.';

const START_REPLY = {
  regionName: REGION_NAME,
  regionDescription: REGION_DESCRIPTION,
  biome: 'swamp',
  startLocation: { name: 'Brinegate', description: 'A gate in the dyke.', terrainType: 'town', levelOffset: 0, isSafe: true },
  firstNpc: { name: 'Oswin Tarr', gender: 'male', npcType: 'lore', description: 'A figure at the gate.', greeting: 'Well met.', personality: PERSONALITY },
};

const NEW_PLACES = ['Reedwatch', 'Saltpan Shrine', 'Gull Rock', 'Mire Steps', 'The Sunken Mill', 'Eelpool', 'Hollow Dyke', 'Tern Flats', 'Weir End'];

/** A 2a reply (no families): `n` new places in a chain from the arrival point, one safe, one NPC. */
function placesReply(n: number) {
  return {
    dominantFaction: 'The Brine Wardens',
    landmarks: ['The Salt Stair'],
    threats: ['skitterers in the reeds'],
    arrival: { shortName: 'Brinegate', placeNoun: 'the gate', isHub: true },
    locations: NEW_PLACES.slice(0, n).map((name, i) => ({
      name,
      shortName: name.split(' ').slice(-1)[0],
      placeNoun: 'the marsh',
      description: `About ${name}.`,
      terrainType: 'swamp',
      isHub: false,
      isSafe: i === 1,
      connectsTo: [i === 0 ? 'Brinegate' : NEW_PLACES[i - 1]],
    })),
    npcs: [
      { name: 'Marta Vell', gender: 'female', npcType: 'lore', locationName: 'Gull Rock', description: 'A tide reader.', greeting: 'Hm.', personality: PERSONALITY },
    ],
  };
}

const FAMILY_WORDS = [
  ['Skitter', 'skitterer'], ['Toll', 'tollman'], ['Bog', 'boglight'], ['Reed', 'reedhound'], ['Mire', 'mirecrow'],
  ['Salt', 'saltwight'], ['Eel', 'eelkin'], ['Fen', 'fenboar'], ['Tide', 'tidehag'], ['Silt', 'siltworm'],
  ['Lynx', 'marshlynx'], ['Rust', 'rustcrab'], ['Gloom', 'gloommoth'], ['Brine', 'brinetoad'], ['Drift', 'driftshade'],
];

/** A 2b reply: `count` families, each with three named members. */
function familiesReply(count = 15) {
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

const starterState = (over: Record<string, unknown> = {}) => ({
  id: 5n,
  playerId: alice,
  characterId: 10n,
  sourceLocationId: 0n,
  sourceRegionId: 0n,
  step: 'GENERATING',
  createdAt: ts,
  updatedAt: ts,
  ...over,
});

const newCharacter = (over: Record<string, unknown> = {}) => ({
  id: 10n,
  ownerUserId: 7n,
  name: 'Aldric',
  race: 'Kobold',
  className: 'Ashweaver',
  level: 1n,
  locationId: 0n,
  boundLocationId: 0n,
  ...over,
});

/** The stored stage-1 job: its reply carries the regionDescription read back at completion. */
const stageOneJob = (over: Record<string, unknown> = {}) => ({
  id: 800n,
  playerId: alice,
  characterId: 10n,
  route: 'world_gen_start',
  dedupeKey: buildDedupeKey(alice, 'world_gen_start', SOURCE_KEYS.worldGen(5n)),
  status: 'completed',
  attempt: 1n,
  requestJson: JSON.stringify({ genStateId: '5' }),
  resultText: JSON.stringify(START_REPLY),
  inputTokens: 0n,
  outputTokens: 0n,
  cacheWriteTokens: 0n,
  cacheReadTokens: 0n,
  createdAt: ts,
  budgetDay: utcDay(ts),
  ...over,
});

const dialsOn = (): any[] => [{ id: 1n, ...DEFAULT_DIALS, aiEnabled: true }];

function starterCtx(extra: Record<string, any[]> = {}, opts: { withStageOneJob?: boolean } = {}) {
  const items = ['Wood', 'Peat', 'Scrap Cloth', 'Flax', 'Herbs'].map((name, i) => ({ id: 700n + BigInt(i), name, slot: 'resource' }));
  return createMockCtx({
    seed: {
      player: [{ id: alice, userId: 7n, activeCharacterId: 10n }],
      character: [newCharacter()],
      world_gen_state: [starterState()],
      item_template: items,
      llm_job: opts.withStageOneJob === false ? [] : [stageOneJob()],
      ...extra,
    },
    sender: alice,
    timestampMicros: T0,
    strict: true,
  });
}

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const stateOf = (ctx: any, id = 5n) => rows(ctx, 'world_gen_state').find((s: any) => s.id === id);
const charOf = (ctx: any, id = 10n) => rows(ctx, 'character').find((c: any) => c.id === id);
const jobsOf = (ctx: any, route: string) => rows(ctx, 'llm_job').filter((j: any) => j.route === route);
const privateOf = (ctx: any, characterId = 10n) => rows(ctx, 'event_private').filter((e: any) => e.characterId === characterId);
const creationOf = (ctx: any, who: any = alice) =>
  rows(ctx, 'event_creation').filter((e: any) => e.playerId === who).map((e: any) => [e.kind, e.message]);
const theRegion = (ctx: any) => rows(ctx, 'region').find((r: any) => r.name === REGION_NAME);

const startJob: ApplyJob = { domain: 'world_gen_start', playerId: alice, contextJson: JSON.stringify({ genStateId: '5' }) };
const fillJobFor = (regionId: bigint): ApplyJob => ({
  domain: 'world_gen',
  playerId: alice,
  contextJson: JSON.stringify({ genStateId: '5', input: { regionName: REGION_NAME, placeCount: placeCountFor(regionId) } }),
});
const familiesJob: ApplyJob = {
  domain: 'world_gen_families',
  playerId: alice,
  contextJson: JSON.stringify({ genStateId: '5', input: { regionName: REGION_NAME } }),
};

/** Stage 1 then 2a: the region's places are in, the families job is pending. */
function throughPlaces(ctx: any) {
  applyLlmResult(ctx, startJob, JSON.stringify(START_REPLY));
  applyLlmResult(ctx, fillJobFor(theRegion(ctx).id), JSON.stringify(placesReply(9)));
  expect(stateOf(ctx).step).toBe('FILLING_FAMILIES');
}

/** The arrival message the character must get at completion, with `paragraph` as the region description. */
function expectedArrival(ctx: any, paragraph: string): string {
  const region = theRegion(ctx);
  const arrival = findRegionStart(ctx, region.id);
  const people = rows(ctx, 'npc')
    .filter((n: any) => n.locationId === arrival.id)
    .map((n: any) => ({ name: n.name, gender: npcGender(n) }));
  let msg = `You open your eyes in ${arrival.name}, ${region.name}.\n\n${paragraph}`;
  if (people.length > 0) msg += '\n\n' + npcNoticeLine(people);
  return msg + `\n\n${ARRIVAL_ENDING}`;
}

// ---------------------------------------------------------------------------
// The lines
// ---------------------------------------------------------------------------

describe('the 7e line and the removed completion line (owner choices)', () => {
  it('WORLD_START_MILESTONE_LINE is the approved 7e text', () => {
    expect(WORLD_START_MILESTONE_LINE).toBe(LINE_7E);
  });

  it('worldFillCompleteLine no longer exists', () => {
    expect((worldGen as any).worldFillCompleteLine).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Task 1: stage 1 no longer places; placement at completion
// ---------------------------------------------------------------------------

describe('stage 1 for a new character waiting in creation (D-17)', () => {
  it('the character stays at location 0, the creation console gets the 7e line once, no private line for anyone; FILLING with one world_gen job', () => {
    const ctx = starterCtx();
    applyLlmResult(ctx, startJob, JSON.stringify(START_REPLY));

    expect(charOf(ctx)).toMatchObject({ locationId: 0n, boundLocationId: 0n });
    expect(rows(ctx, 'visited_location')).toEqual([]);
    expect(creationOf(ctx)).toEqual([['creation', LINE_7E]]);
    expect(rows(ctx, 'event_private')).toEqual([]);
    const region = theRegion(ctx);
    expect(region).toBeDefined();
    expect(stateOf(ctx)).toMatchObject({ step: 'FILLING', generatedRegionId: region.id });
    expect(jobsOf(ctx, 'world_gen')).toHaveLength(1);
  });

  it('after the 2a apply the character is still at location 0 and nothing new is posted', () => {
    const ctx = starterCtx();
    throughPlaces(ctx);

    expect(charOf(ctx)).toMatchObject({ locationId: 0n, boundLocationId: 0n });
    expect(creationOf(ctx)).toEqual([['creation', LINE_7E]]);
    expect(rows(ctx, 'event_private')).toEqual([]);
    expect(jobsOf(ctx, 'world_gen_families')).toHaveLength(1);
  });
});

describe('placement when the families land (finishRegionFill, D-17)', () => {
  it('places the character at the arrival point with the stored description, the approved ending, then the discovery line; COMPLETE and the economy job', () => {
    const ctx = starterCtx({ economy_dials: dialsOn() });
    throughPlaces(ctx);
    applyLlmResult(ctx, familiesJob, JSON.stringify(familiesReply()));

    const region = theRegion(ctx);
    const arrival = findRegionStart(ctx, region.id);
    expect(arrival.name).toBe('Brinegate');
    expect(arrival.isHub).toBe(true);
    expect(stateOf(ctx).step).toBe('COMPLETE');
    expect(charOf(ctx)).toMatchObject({ locationId: arrival.id, boundLocationId: arrival.id });

    const visited = rows(ctx, 'visited_location').filter((v: any) => v.characterId === 10n);
    expect(visited).toHaveLength(1);
    expect(visited[0].locationId).toBe(arrival.id);
    expect(visited[0].fromLocationId).toBeUndefined();
    const resourcePools = rows(ctx, 'place_pool').filter((p: any) => p.locationId === arrival.id && p.kind === 'resource');
    expect(resourcePools.length).toBeGreaterThan(0);

    const lines = privateOf(ctx);
    expect(lines.map((e: any) => e.kind)).toEqual(['narrative', 'system']);
    expect(lines[0].message).toBe(expectedArrival(ctx, REGION_DESCRIPTION));
    expect(lines[0].message.endsWith(ARRIVAL_ENDING)).toBe(true);
    expect(lines[0].message).not.toContain('still being remembered');
    expect(lines[0].segments?.length ?? 0).toBeGreaterThan(0);
    expect(lines[1].message).toBe(pickDiscoveryMessage(REGION_NAME, T0));

    // The creation console got only the 7e line; no 7c line for a starter.
    expect(creationOf(ctx)).toEqual([['creation', LINE_7E]]);
    expect(jobsOf(ctx, 'region_economy')).toHaveLength(1);
  });

  it('the NPC notice names the people at the arrival point', () => {
    const ctx = starterCtx();
    throughPlaces(ctx);
    applyLlmResult(ctx, familiesJob, JSON.stringify(familiesReply()));
    expect(privateOf(ctx)[0].message).toContain('Oswin Tarr');
  });

  it('when the stage-1 job row cannot be found the paragraph is the fallback "A {biome} region."', () => {
    const ctx = starterCtx({}, { withStageOneJob: false });
    throughPlaces(ctx);
    applyLlmResult(ctx, familiesJob, JSON.stringify(familiesReply()));
    expect(privateOf(ctx)[0].message).toBe(expectedArrival(ctx, 'A swamp region.'));
  });

  it('a stage-1 reply that cannot be read or has no description also gives the fallback', () => {
    for (const resultText of ['not json', JSON.stringify({ ...START_REPLY, regionDescription: '' })]) {
      const ctx = starterCtx({}, { withStageOneJob: false });
      ctx.db.llm_job.insert(stageOneJob({ id: 0n, resultText }));
      throughPlaces(ctx);
      applyLlmResult(ctx, familiesJob, JSON.stringify(familiesReply()));
      expect(privateOf(ctx)[0].message).toBe(expectedArrival(ctx, 'A swamp region.'));
    }
  });

  it('reads the newest completed stage-1 job (a failed or older row is not used)', () => {
    const ctx = starterCtx({}, { withStageOneJob: false });
    ctx.db.llm_job.insert(stageOneJob({ id: 0n, resultText: JSON.stringify({ ...START_REPLY, regionDescription: 'An old telling.' }), createdAt: { microsSinceUnixEpoch: T0 - 10n } }));
    ctx.db.llm_job.insert(stageOneJob({ id: 0n, status: 'failed', resultText: JSON.stringify({ ...START_REPLY, regionDescription: 'A failed telling.' }), createdAt: { microsSinceUnixEpoch: T0 + 10n } }));
    ctx.db.llm_job.insert(stageOneJob({ id: 0n }));
    throughPlaces(ctx);
    applyLlmResult(ctx, familiesJob, JSON.stringify(familiesReply()));
    expect(privateOf(ctx)[0].message).toBe(expectedArrival(ctx, REGION_DESCRIPTION));
  });

  it('a legacy one-reply fill (families in the 2a reply) places the waiting character too', () => {
    const ctx = starterCtx();
    applyLlmResult(ctx, startJob, JSON.stringify(START_REPLY));
    const legacy = { ...placesReply(3), families: familiesReply(3).families };
    applyLlmResult(ctx, { ...fillJobFor(theRegion(ctx).id), contextJson: JSON.stringify({ genStateId: '5' }) }, JSON.stringify(legacy));

    expect(stateOf(ctx).step).toBe('COMPLETE');
    const arrival = findRegionStart(ctx, theRegion(ctx).id);
    expect(charOf(ctx).locationId).toBe(arrival.id);
    expect(privateOf(ctx).map((e: any) => e.kind)).toEqual(['narrative', 'system']);
  });

  it('an in-flight starter whose character was placed at stage 1 (before the publish) completes with no second placement or arrival message', () => {
    const ctx = starterCtx();
    throughPlaces(ctx);
    const arrival = findRegionStart(ctx, theRegion(ctx).id);
    // Placed by the old stage-1 code, then moved on (a later trip).
    const elsewhere = rows(ctx, 'location').find((l: any) => l.regionId === arrival.regionId && l.id !== arrival.id && l.terrainType !== 'uncharted');
    ctx.db.character.id.update({ ...charOf(ctx), locationId: elsewhere.id, boundLocationId: arrival.id });
    applyLlmResult(ctx, familiesJob, JSON.stringify(familiesReply()));

    expect(stateOf(ctx).step).toBe('COMPLETE');
    expect(charOf(ctx)).toMatchObject({ locationId: elsewhere.id, boundLocationId: arrival.id });
    expect(privateOf(ctx)).toEqual([]);
    expect(rows(ctx, 'visited_location')).toEqual([]);
  });

  it('a second finishRegionFill call adds nothing (no second placement)', () => {
    const ctx = starterCtx();
    throughPlaces(ctx);
    applyLlmResult(ctx, familiesJob, JSON.stringify(familiesReply()));
    const before = rows(ctx, 'event_private').length;
    worldGen.finishRegionFill(ctx, stateOf(ctx));
    expect(rows(ctx, 'event_private')).toHaveLength(before);
  });

  it('another player is never told (the arrival and discovery go only to the waiting character)', () => {
    const ctx = starterCtx({
      player: [{ id: alice, userId: 7n, activeCharacterId: 10n }, { id: bob, userId: 8n, activeCharacterId: 11n }],
      character: [newCharacter(), newCharacter({ id: 11n, ownerUserId: 8n, name: 'Bree', race: 'Human', locationId: 999n })],
    });
    throughPlaces(ctx);
    applyLlmResult(ctx, familiesJob, JSON.stringify(familiesReply()));
    expect(privateOf(ctx, 11n)).toEqual([]);
    expect(creationOf(ctx, bob)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Task 2: a second new character of the same race waits on a held starter region (HELD)
// ---------------------------------------------------------------------------

const B_STATE = 6n;
const B_CHAR = 11n;

/** Bob's new character (same race as Aldric) and his fresh starter state, as creation inserts them. */
function addSecond(ctx: any, over: Record<string, unknown> = {}): any {
  ctx.db.player.insert({ id: bob, userId: 8n, activeCharacterId: B_CHAR });
  ctx.db.character.insert(newCharacter({ id: B_CHAR, ownerUserId: 8n, name: 'Bree', ...over }));
  return ctx.db.world_gen_state.insert(starterState({ id: B_STATE, playerId: bob, characterId: B_CHAR, step: 'PENDING' }));
}
const failureLine = (message: string) => ['creation_error', `${message} Type [explore] to try again.`];

/** The reuse arrival message at the region's home place (its hub), as reuseStarterRegion writes it. */
function expectedReuseArrival(ctx: any): string {
  const region = theRegion(ctx);
  const home = findRegionStart(ctx, region.id);
  const people = rows(ctx, 'npc')
    .filter((n: any) => n.locationId === home.id)
    .map((n: any) => ({ name: n.name, gender: npcGender(n) }));
  let msg = `You open your eyes in ${home.name}, ${region.name}.`;
  if (people.length > 0) msg += '\n\n' + npcNoticeLine(people);
  return msg + `\n\n${ARRIVAL_ENDING}`;
}

describe('a second new character on a starter region that is still being built (HELD, D-15, D-17)', () => {
  it.each([
    ['FILLING', (ctx: any) => applyLlmResult(ctx, startJob, JSON.stringify(START_REPLY))],
    ['FILLING_FAMILIES', (ctx: any) => throughPlaces(ctx)],
  ])('while the region is %s: HELD with the region, no model call, the 7e line once, still at location 0', (step, upTo) => {
    const ctx = starterCtx();
    upTo(ctx);
    expect(stateOf(ctx).step).toBe(step);
    const jobsBefore = rows(ctx, 'llm_job').length;
    const b = addSecond(ctx);

    expect(startWorldGeneration(ctx, b)).toBe('held');
    expect(stateOf(ctx, B_STATE)).toMatchObject({ step: 'HELD', generatedRegionId: theRegion(ctx).id });
    expect(charOf(ctx, B_CHAR)).toMatchObject({ locationId: 0n, boundLocationId: 0n });
    expect(rows(ctx, 'llm_job')).toHaveLength(jobsBefore);
    expect(rows(ctx, 'llm_player_budget').filter((r: any) => r.playerId === bob)).toEqual([]);
    expect(creationOf(ctx, bob)).toEqual([['creation', LINE_7E]]);
    expect(privateOf(ctx, B_CHAR)).toEqual([]);
    // A HELD state never holds the region itself, and the generating state is untouched.
    expect(regionHoldState(ctx, theRegion(ctx).id)).toBe('held');
    expect(stateOf(ctx).step).toBe(step);
  });

  it('when the families land both wait no longer: Aldric at the arrival point, Bree at the home place with the reuse arrival; both states COMPLETE', () => {
    const ctx = starterCtx();
    throughPlaces(ctx);
    startWorldGeneration(ctx, addSecond(ctx));
    applyLlmResult(ctx, familiesJob, JSON.stringify(familiesReply()));

    const home = findRegionStart(ctx, theRegion(ctx).id);
    expect(home.isHub).toBe(true);
    expect(stateOf(ctx).step).toBe('COMPLETE');
    expect(stateOf(ctx, B_STATE).step).toBe('COMPLETE');
    expect(charOf(ctx)).toMatchObject({ locationId: home.id, boundLocationId: home.id });
    expect(charOf(ctx, B_CHAR)).toMatchObject({ locationId: home.id, boundLocationId: home.id });
    expect(privateOf(ctx).map((e: any) => e.kind)).toEqual(['narrative', 'system']);
    const bree = privateOf(ctx, B_CHAR);
    expect(bree.map((e: any) => e.kind)).toEqual(['narrative']);
    expect(bree[0].message).toBe(expectedReuseArrival(ctx));
    const visited = rows(ctx, 'visited_location').filter((v: any) => v.characterId === B_CHAR);
    expect(visited).toHaveLength(1);
    expect(visited[0]).toMatchObject({ locationId: home.id, fromLocationId: undefined });
    // Bree's console got only the 7e line.
    expect(creationOf(ctx, bob)).toEqual([['creation', LINE_7E]]);
  });

  it('an open (COMPLETE) starter region places a new character at once, as today (reused)', () => {
    const ctx = starterCtx();
    throughPlaces(ctx);
    applyLlmResult(ctx, familiesJob, JSON.stringify(familiesReply()));
    const b = addSecond(ctx);

    expect(startWorldGeneration(ctx, b)).toBe('reused');
    const home = findRegionStart(ctx, theRegion(ctx).id);
    expect(stateOf(ctx, B_STATE)).toMatchObject({ step: 'COMPLETE', generatedRegionId: theRegion(ctx).id });
    expect(charOf(ctx, B_CHAR).locationId).toBe(home.id);
    expect(privateOf(ctx, B_CHAR)[0].message).toBe(expectedReuseArrival(ctx));
    expect(creationOf(ctx, bob)).toEqual([]);
  });

  it('a failed starter region (FAMILIES_ERROR) when the second character arrives: HELD, the 7e line, then the failure line naming [explore]', () => {
    const ctx = starterCtx();
    throughPlaces(ctx);
    applyLlmFailure(ctx, familiesJob);
    expect(stateOf(ctx).step).toBe('FAMILIES_ERROR');

    expect(startWorldGeneration(ctx, addSecond(ctx))).toBe('held');
    expect(stateOf(ctx, B_STATE).step).toBe('HELD');
    expect(charOf(ctx, B_CHAR).locationId).toBe(0n);
    expect(creationOf(ctx, bob)).toEqual([['creation', LINE_7E], failureLine(WORLD_FAMILIES_FAILED_MESSAGE)]);
  });

  it('a different race never waits on this region', () => {
    const ctx = starterCtx();
    throughPlaces(ctx);
    const jobsBefore = rows(ctx, 'llm_job').length;
    expect(startWorldGeneration(ctx, addSecond(ctx, { race: 'Human' }))).toBe('enqueued');
    expect(stateOf(ctx, B_STATE).step).toBe('GENERATING');
    expect(rows(ctx, 'llm_job')).toHaveLength(jobsBefore + 1);
    expect(creationOf(ctx, bob)).toEqual([]);
  });
});

describe('a failure while new characters wait reaches every waiting console (D-18)', () => {
  it('a places failure (2a): the generating player and the HELD player get today\'s line; both stay at location 0', () => {
    const ctx = starterCtx();
    applyLlmResult(ctx, startJob, JSON.stringify(START_REPLY));
    startWorldGeneration(ctx, addSecond(ctx));
    applyLlmFailure(ctx, fillJobFor(theRegion(ctx).id));

    expect(stateOf(ctx).step).toBe('FILL_ERROR');
    expect(stateOf(ctx, B_STATE).step).toBe('HELD');
    expect(creationOf(ctx, alice)).toEqual([['creation', LINE_7E], failureLine(WORLD_FILL_FAILED_MESSAGE)]);
    expect(creationOf(ctx, bob)).toEqual([['creation', LINE_7E], failureLine(WORLD_FILL_FAILED_MESSAGE)]);
    expect(charOf(ctx).locationId).toBe(0n);
    expect(charOf(ctx, B_CHAR).locationId).toBe(0n);
    expect(rows(ctx, 'event_private')).toEqual([]);
  });

  it('a families failure (2b): both consoles get the approved section 5 line', () => {
    const ctx = starterCtx();
    throughPlaces(ctx);
    startWorldGeneration(ctx, addSecond(ctx));
    applyLlmFailure(ctx, familiesJob);

    expect(stateOf(ctx).step).toBe('FAMILIES_ERROR');
    expect(creationOf(ctx, alice).slice(-1)).toEqual([failureLine(WORLD_FAMILIES_FAILED_MESSAGE)]);
    expect(creationOf(ctx, bob)).toEqual([['creation', LINE_7E], failureLine(WORLD_FAMILIES_FAILED_MESSAGE)]);
    expect(charOf(ctx, B_CHAR).locationId).toBe(0n);
  });

  it('a HELD character who is no longer waiting (placed elsewhere) gets no failure line', () => {
    const ctx = starterCtx();
    throughPlaces(ctx);
    startWorldGeneration(ctx, addSecond(ctx));
    ctx.db.character.id.update({ ...charOf(ctx, B_CHAR), locationId: 999n });
    applyLlmFailure(ctx, familiesJob);
    expect(creationOf(ctx, bob)).toEqual([['creation', LINE_7E]]);
  });
});

describe('[explore] from a HELD character\'s creation console (retryStarterWorldGen, D-18)', () => {
  function heldOn(step: 'FILL_ERROR' | 'FAMILIES_ERROR' | 'FILLING_FAMILIES' | 'COMPLETE') {
    const ctx = starterCtx();
    if (step === 'FILL_ERROR') {
      applyLlmResult(ctx, startJob, JSON.stringify(START_REPLY));
      startWorldGeneration(ctx, addSecond(ctx));
      applyLlmFailure(ctx, fillJobFor(theRegion(ctx).id));
    } else {
      throughPlaces(ctx);
      startWorldGeneration(ctx, addSecond(ctx));
      if (step === 'FAMILIES_ERROR') applyLlmFailure(ctx, familiesJob);
      if (step === 'COMPLETE') {
        applyLlmResult(ctx, familiesJob, JSON.stringify(familiesReply()));
        // Bree missed the completion (a state left HELD): her own [explore] places her.
        ctx.db.world_gen_state.id.update({ ...stateOf(ctx, B_STATE), step: 'HELD' });
        ctx.db.character.id.update({ ...charOf(ctx, B_CHAR), locationId: 0n, boundLocationId: 0n });
      }
    }
    expect(stateOf(ctx).step).toBe(step);
    expect(stateOf(ctx, B_STATE).step).toBe('HELD');
    return ctx;
  }

  it.each([
    ['FAMILIES_ERROR', 'world_gen_families', 'FILLING_FAMILIES'],
    ['FILL_ERROR', 'world_gen', 'FILLING'],
  ] as const)('%s: only the failed stage is re-enqueued on the generating state, charged to the asker; Aldric stays the character of the state', (step, route, running) => {
    const ctx = heldOn(step);
    const before = rows(ctx, 'llm_job').filter((j: any) => j.route === route).length;
    expect(retryStarterWorldGen(ctx, charOf(ctx, B_CHAR), bob)).toBe('fill_started');

    expect(stateOf(ctx)).toMatchObject({ step: running, playerId: bob, characterId: 10n });
    expect(stateOf(ctx, B_STATE).step).toBe('HELD');
    const jobs = jobsOf(ctx, route);
    expect(jobs).toHaveLength(before + 1);
    expect(jobs[jobs.length - 1]).toMatchObject({ status: 'pending', playerId: bob, characterId: 10n });
    expect(jobsOf(ctx, 'world_gen_start').filter((j: any) => j.status === 'pending')).toEqual([]);
    expect(rows(ctx, 'world_gen_state')).toHaveLength(2);
    expect(charOf(ctx, B_CHAR).locationId).toBe(0n);
  });

  it('while the region is in progress: busy, nothing written', () => {
    const ctx = heldOn('FILLING_FAMILIES');
    const jobsBefore = rows(ctx, 'llm_job').length;
    const statesBefore = JSON.stringify(rows(ctx, 'world_gen_state'), (_k, v) => (typeof v === 'bigint' ? `${v}` : v));
    expect(retryStarterWorldGen(ctx, charOf(ctx, B_CHAR), bob)).toBe('busy');
    expect(rows(ctx, 'llm_job')).toHaveLength(jobsBefore);
    expect(JSON.stringify(rows(ctx, 'world_gen_state'), (_k, v) => (typeof v === 'bigint' ? `${v}` : v))).toBe(statesBefore);
  });

  it('the region is COMPLETE but she is still waiting: she is placed now (reused) and her state is COMPLETE', () => {
    const ctx = heldOn('COMPLETE');
    expect(retryStarterWorldGen(ctx, charOf(ctx, B_CHAR), bob)).toBe('reused');
    const home = findRegionStart(ctx, theRegion(ctx).id);
    expect(charOf(ctx, B_CHAR).locationId).toBe(home.id);
    expect(stateOf(ctx, B_STATE).step).toBe('COMPLETE');
    expect(privateOf(ctx, B_CHAR).slice(-1)[0].message).toBe(expectedReuseArrival(ctx));
  });

  it('a refused retry (the asker\'s day is spent): refused, the error step again, one creation_error line for the asker', () => {
    const ctx = heldOn('FAMILIES_ERROR');
    ctx.db.llm_player_budget.insert({
      id: 0n,
      playerId: bob,
      dayUtc: utcDay(ctx.timestamp),
      reservedMicroUsd: 0n,
      spentMicroUsd: LLM_PLAYER_DAILY_COST_MICRO_USD,
      calls: 1n,
    });
    const bobLinesBefore = creationOf(ctx, bob).length;
    expect(retryStarterWorldGen(ctx, charOf(ctx, B_CHAR), bob)).toBe('refused');
    expect(stateOf(ctx)).toMatchObject({ step: 'FAMILIES_ERROR', errorMessage: WORLD_FILL_REFUSED_MESSAGE });
    const added = creationOf(ctx, bob).slice(bobLinesBefore);
    expect(added).toEqual([failureLine(WORLD_FAMILIES_FAILED_MESSAGE)]);
  });

  it('the resting line (kill switch) reaches the HELD console too', () => {
    const ctx = starterCtx();
    throughPlaces(ctx);
    startWorldGeneration(ctx, addSecond(ctx));
    applyLlmFailure(ctx, { ...familiesJob, errorCode: 'halted' });
    expect(creationOf(ctx, bob).slice(-1)).toEqual([['creation_error', `${LLM_RESTING_LINE} Type [explore] to try again.`]]);
  });
});

describe('HELD is never a hold, a hint or a lock', () => {
  it('a COMPLETE region with a HELD state is open; regionFillHint is null; retryWorldFill in the region finds nothing', () => {
    const ctx = starterCtx();
    throughPlaces(ctx);
    applyLlmResult(ctx, familiesJob, JSON.stringify(familiesReply()));
    addSecond(ctx);
    ctx.db.world_gen_state.id.update({ ...stateOf(ctx, B_STATE), step: 'HELD', generatedRegionId: theRegion(ctx).id });

    const region = theRegion(ctx);
    expect(regionHoldState(ctx, region.id)).toBe('open');
    expect(regionFillHint(ctx, region.id)).toBeNull();
    // Aldric stands in the region and types [explore]: nothing to retry.
    const jobsBefore = rows(ctx, 'llm_job').length;
    expect(retryWorldFill(ctx, charOf(ctx), alice)).toBe('none');
    expect(rows(ctx, 'llm_job')).toHaveLength(jobsBefore);
    expect(stateOf(ctx, B_STATE).step).toBe('HELD');
  });
});

// ---------------------------------------------------------------------------
// Review A WR-02: a placement throw never rolls back the paid families
// ---------------------------------------------------------------------------

/** Make the visited-place insert throw for one character (a placement side effect), until disarmed. */
function throwOnVisit(ctx: any, characterId: bigint): () => void {
  const realDb = ctx.db;
  ctx.db = new Proxy(realDb, {
    get: (_t: any, name: string) => {
      const table = realDb[name];
      if (name !== 'visited_location') return table;
      return new Proxy(table, {
        get: (tt: any, prop: string) =>
          prop === 'insert'
            ? (row: any) => {
                if (row.characterId === characterId) throw new TypeError('placement exploded');
                return tt.insert(row);
              }
            : tt[prop],
      });
    },
  });
  return () => {
    ctx.db = realDb;
  };
}

describe('a placement that throws at completion (review A WR-02)', () => {
  it("the starter's own character: the families, COMPLETE and the economy stay; he waits at location 0; his [explore] places him later", () => {
    const ctx = starterCtx({ economy_dials: dialsOn() });
    throughPlaces(ctx);
    const disarm = throwOnVisit(ctx, 10n);
    expect(() => applyLlmResult(ctx, familiesJob, JSON.stringify(familiesReply()))).not.toThrow();
    disarm();

    expect(stateOf(ctx).step).toBe('COMPLETE');
    expect(rows(ctx, 'creature_family').length).toBeGreaterThan(0);
    expect(jobsOf(ctx, 'region_economy')).toHaveLength(1);
    expect(regionHoldState(ctx, theRegion(ctx).id)).toBe('open');
    // Not half-placed: still at location 0, no arrival line.
    expect(charOf(ctx)).toMatchObject({ locationId: 0n, boundLocationId: 0n });
    expect(privateOf(ctx)).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith('Waiting character placement failed for state 5: TypeError');

    // His [explore] from the creation console places him now, with the arrival message; no call.
    const jobsBefore = rows(ctx, 'llm_job').length;
    expect(retryStarterWorldGen(ctx, charOf(ctx), alice)).toBe('reused');
    const arrival = findRegionStart(ctx, theRegion(ctx).id);
    expect(charOf(ctx)).toMatchObject({ locationId: arrival.id, boundLocationId: arrival.id });
    expect(privateOf(ctx)[0].message).toBe(expectedArrival(ctx, REGION_DESCRIPTION));
    expect(rows(ctx, 'llm_job')).toHaveLength(jobsBefore);
  });

  it('one HELD character: the region, the families and the starter character are unaffected; her state stays HELD and her [explore] places her', () => {
    const ctx = starterCtx();
    throughPlaces(ctx);
    startWorldGeneration(ctx, addSecond(ctx));
    const disarm = throwOnVisit(ctx, B_CHAR);
    expect(() => applyLlmResult(ctx, familiesJob, JSON.stringify(familiesReply()))).not.toThrow();
    disarm();

    const home = findRegionStart(ctx, theRegion(ctx).id);
    expect(stateOf(ctx).step).toBe('COMPLETE');
    expect(rows(ctx, 'creature_family').length).toBeGreaterThan(0);
    expect(charOf(ctx).locationId).toBe(home.id);
    expect(stateOf(ctx, B_STATE).step).toBe('HELD');
    expect(charOf(ctx, B_CHAR)).toMatchObject({ locationId: 0n, boundLocationId: 0n });
    expect(privateOf(ctx, B_CHAR)).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith('Held placement failed for state 6: TypeError');

    expect(retryStarterWorldGen(ctx, charOf(ctx, B_CHAR), bob)).toBe('reused');
    expect(charOf(ctx, B_CHAR).locationId).toBe(home.id);
    expect(stateOf(ctx, B_STATE).step).toBe('COMPLETE');
    expect(privateOf(ctx, B_CHAR)[0].message).toBe(expectedReuseArrival(ctx));
  });
});
