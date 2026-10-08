/**
 * Phase 51.3 Plan 12: the region economy job chained into the game (SC1, SC6). On the strict mock db
 * under the recording schema, through the real apply layer (helpers/llm_apply.ts):
 * - off by default: with economy_dials missing or aiEnabled false, a completed region fill writes no
 *   region_economy row and no region_economy job (spend safety);
 * - on: one job per region (budget phase_only, sourceKey region:<id>) and one pending row; a second
 *   fill completion, a refused enqueue and a throwing economy start never add rows or break the fill;
 * - starter-region reuse never enqueues;
 * - late enemies (npc_conversation quest effect, and enemies without entries after a region apply)
 *   get one enemy-mode job only when the switch is on and the region is complete;
 * - applyLlmResult and applyLlmFailure dispatch the region_economy domain;
 * - end to end through the real executor with a scripted http.fetch (no network).
 * Replies are canned fixtures. No LLM call is made.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
// The tsconfig has no @types/node; vitest runs the file in Node, so the built-ins resolve at runtime.
// @ts-ignore
import { readFileSync } from 'node:fs';
// @ts-ignore
import { join } from 'node:path';
// @ts-ignore
import { fileURLToPath } from 'node:url';
import { ScheduleAt } from 'spacetimedb';
import { createMockCtx, createMockProcCtx, defaultLlmAdminStateRow } from './test-utils';
import { encodeRouteInput } from './llm_inputs';
import { DEFAULT_DIALS } from '../data/economy_rules';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

let econ: typeof import('./region_economy');
let apply: typeof import('./llm_apply');
let worldGen: typeof import('./world_gen');
let executor: typeof import('./llm_executor');

beforeAll(async () => {
  await import('../schema/tables');
  econ = await import('./region_economy');
  apply = await import('./llm_apply');
  worldGen = await import('./world_gen');
  executor = await import('./llm_executor');
}, 120_000);

afterEach(() => {
  vi.restoreAllMocks();
});

const ECON_DIR = fileURLToPath(new URL('./__fixtures__/economy/', import.meta.url));
const CLAUDE_DIR = fileURLToPath(new URL('./__fixtures__/claude/', import.meta.url));
const replyText = (name: string): string => readFileSync(join(ECON_DIR, `${name}.reply.json`), 'utf8');

const T0 = 1_700_000_000_000_000n;
const ts = (micros: bigint) => ({ microsSinceUnixEpoch: micros });
const alice = { toHexString: () => 'a'.repeat(64) };
type Seed = Record<string, any[]>;

const ctxFor = (seed: Seed) => createMockCtx({ seed, sender: alice, strict: true, timestampMicros: T0 } as any);
const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const econJobs = (ctx: any): any[] => rows(ctx, 'llm_job').filter((j: any) => j.route === 'region_economy');
const econDispatches = (ctx: any): any[] => {
  const ids = new Set(econJobs(ctx).map((j: any) => j.id));
  return rows(ctx, 'llm_dispatch').filter((d: any) => ids.has(d.jobId));
};
const requestOf = (job: any): any => JSON.parse(job.requestJson);
const dialsOn = (): any[] => [{ id: 1n, ...DEFAULT_DIALS, aiEnabled: true }];
const dialsOff = (): any[] => [{ id: 1n, ...DEFAULT_DIALS, aiEnabled: false }];

// ---------------------------------------------------------------------------
// World fill fixtures (the characterization test's Cinderfall fill)
// ---------------------------------------------------------------------------

const GEN_CTX = JSON.stringify({ genStateId: '5' });
const fillJob = () => ({ domain: 'world_gen', playerId: alice, contextJson: GEN_CTX });

const REGION_FILL_JSON = {
  dominantFaction: 'Ash Court',
  landmarks: ['The Slag Spire'],
  threats: ['ember wolves'],
  locations: [
    { name: 'Slag Road', description: 'A cracked road.', terrainType: 'plains', isSafe: false, levelOffset: 0, connectsTo: ['Ember Hollow', 'Ashen Pit'] },
    { name: 'Ashen Pit', description: 'A smoking crater.', terrainType: 'mountains', isSafe: false, levelOffset: 1, connectsTo: ['Slag Road'] },
  ],
  npcs: [
    { name: 'Old Brann', gender: 'male', npcType: 'lore', locationName: 'Ember Hollow', description: 'A hermit.', greeting: 'Hm.', personality: { traits: ['gruff'], speechPattern: 'slow', knowledgeDomains: ['ash'], secrets: [], affinityMultiplier: 1.0 } },
  ],
  enemies: [
    { name: 'Ember Wolf', creatureType: 'beast', role: 'melee', terrainTypes: 'plains', groupMin: 1, groupMax: 2, level: 1 },
    { name: 'Slag Caster', creatureType: 'humanoid', role: 'caster', terrainTypes: 'mountains', groupMin: 1, groupMax: 1, level: 1 },
  ],
};
const FILL_TEXT = JSON.stringify(REGION_FILL_JSON);

/** Stage 1 has landed for region 1 (Cinderfall); the state is FILLING. */
function fillSeed(extra: Seed = {}): Seed {
  return {
    player: [{ id: alice, userId: 7n, activeCharacterId: 10n }],
    world_gen_state: [
      { id: 5n, playerId: alice, characterId: 10n, sourceLocationId: 0n, sourceRegionId: 0n, step: 'FILLING', generatedRegionId: 1n, createdAt: ts(T0 - 10n), updatedAt: ts(T0 - 10n) },
    ],
    character: [{ id: 10n, ownerUserId: 7n, name: 'Tester', race: 'Ashkin', className: 'Emberblade', level: 1n, locationId: 1n, boundLocationId: 1n }],
    region: [
      { id: 1n, name: 'Cinderfall', dangerMultiplier: 100n, regionType: 'generated', biome: 'volcanic', generatedByCharacterId: 10n, isGenerated: true },
    ],
    location: [
      { id: 1n, name: 'Ember Hollow', description: 'A sheltered town.', zone: 'Cinderfall', regionId: 1n, levelOffset: 0n, isSafe: true, terrainType: 'town', bindStone: true, craftingAvailable: true },
    ],
    npc: [
      { id: 1n, name: 'Vessa', npcType: 'vendor', locationId: 1n, description: 'A soot-streaked trader.', greeting: 'Buy something.', gender: 'female', personalityJson: '{}' },
    ],
    ...extra,
  };
}

const genStep = (ctx: any) => rows(ctx, 'world_gen_state')[0].step;
const completionLine = 'The rest of Cinderfall settles into place. Try [travel] to see where the roads lead.';

// ---------------------------------------------------------------------------
// Task 1: the fill hook
// ---------------------------------------------------------------------------

describe('fill hook: off by default (SC6, spend safety)', () => {
  it.each([
    ['missing economy_dials row', {}],
    ['aiEnabled false', { economy_dials: dialsOff() }],
  ])('%s: the fill completes and writes no region_economy row, job or dispatch', (_label, extra) => {
    const ctx = ctxFor(fillSeed(extra as Seed));
    apply.applyLlmResult(ctx, fillJob(), FILL_TEXT);
    expect(genStep(ctx)).toBe('COMPLETE');
    expect(rows(ctx, 'region_economy')).toHaveLength(0);
    expect(econJobs(ctx)).toHaveLength(0);
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
  });
});

describe('fill hook: on', () => {
  it('enqueues one region-mode job (phase_only, region:<id>) and writes the pending row', () => {
    const ctx = ctxFor(fillSeed({ economy_dials: dialsOn() }));
    apply.applyLlmResult(ctx, fillJob(), FILL_TEXT);
    expect(genStep(ctx)).toBe('COMPLETE');

    const jobs = econJobs(ctx);
    expect(jobs).toHaveLength(1);
    const job = jobs[0];
    expect(job).toMatchObject({ status: 'pending', characterId: 10n, playerId: alice });
    expect(JSON.parse(job.dedupeKey)).toEqual(['a'.repeat(64), 'region_economy', 'region:1']);
    // phase_only: no player day was charged.
    expect(job.budgetDay).toBe('');
    expect(rows(ctx, 'llm_player_budget')).toHaveLength(0);

    const req = requestOf(job);
    expect(req).toMatchObject({ regionId: '1', mode: 'region', enemyTemplateId: '0', characterId: '10' });
    const expected = encodeRouteInput(econ.buildRegionEconomyInput(ctx, ctx.db.region.id.find(1n), 'region'));
    expect(req.input).toEqual(JSON.parse(JSON.stringify(expected)));
    expect(req.input.enemies.map((e: any) => e.name)).toEqual(['Ember Wolf', 'Slag Caster']);

    expect(econDispatches(ctx)).toHaveLength(1);
    const econRows = rows(ctx, 'region_economy');
    expect(econRows).toHaveLength(1);
    expect(econRows[0]).toMatchObject({ regionId: 1n, status: 'pending', jobId: job.id, otherRegionIds: '[]' });

    // The fill itself is unchanged: the completion line is still written.
    expect(rows(ctx, 'event_private').map((e: any) => e.message)).toContain(completionLine);
  });

  it('adjacency: a second fill completion for the same region does not enqueue a second job', () => {
    const ctx = ctxFor(fillSeed({ economy_dials: dialsOn() }));
    apply.applyLlmResult(ctx, fillJob(), FILL_TEXT);
    // A FILL_ERROR retry completing later: the state is FILLING again and the fill applies again.
    const state = rows(ctx, 'world_gen_state')[0];
    ctx.db.world_gen_state.id.update({ ...state, step: 'FILLING' });
    apply.applyLlmResult(ctx, fillJob(), FILL_TEXT);
    expect(genStep(ctx)).toBe('COMPLETE');
    expect(econJobs(ctx)).toHaveLength(1);
    expect(rows(ctx, 'region_economy')).toHaveLength(1);
    // And a direct second start says the row exists.
    expect(econ.startRegionEconomy(ctx, ctx.db.region.id.find(1n), { playerId: alice, characterId: 10n })).toBe('exists');
    expect(econJobs(ctx)).toHaveLength(1);
  });

  it('a halted game (kill switch) refuses the enqueue: the fill completes, no row or job is written', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const ctx = ctxFor(fillSeed({ economy_dials: dialsOn(), llm_admin_state: [{ ...defaultLlmAdminStateRow(), llmEnabled: false }] }));
    apply.applyLlmResult(ctx, fillJob(), FILL_TEXT);
    expect(genStep(ctx)).toBe('COMPLETE');
    expect(rows(ctx, 'region_economy')).toHaveLength(0);
    expect(econJobs(ctx)).toHaveLength(0);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
    const lines = info.mock.calls.map((c) => String(c[0]));
    expect(lines.some((l) => l.includes('region_economy') && l.includes('halted') && l.includes('1'))).toBe(true);
    // No identity in the log line.
    expect(lines.some((l) => l.includes('a'.repeat(16)))).toBe(false);
  });

  it('a throw inside the economy start never fails the region fill', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const base = ctxFor(fillSeed({ economy_dials: dialsOn() }));
    const db = new Proxy(base.db, {
      get(target, prop, receiver) {
        if (prop === 'economy_dials') throw new Error('broken economy_dials');
        return Reflect.get(target, prop, receiver);
      },
    });
    const ctx = { ...base, db };
    apply.applyLlmResult(ctx, fillJob(), FILL_TEXT);
    expect(genStep(base)).toBe('COMPLETE');
    expect(rows(base, 'event_private').map((e: any) => e.message)).toContain(completionLine);
    expect(rows(base, 'region_economy')).toHaveLength(0);
    expect(econJobs(base)).toHaveLength(0);
    expect(error.mock.calls.map((c) => String(c[0]))).toContain('Region economy start failed for region 1: Error');
  });
});

describe('starter-region reuse', () => {
  it('never enqueues an economy job, even with the switch on', () => {
    const ctx = ctxFor({
      player: [{ id: alice, userId: 7n }],
      character: [{ id: 10n, ownerUserId: 7n, name: 'Aldric', race: 'Kobold', className: 'Ashweaver', locationId: 0n }],
      world_gen_state: [{ id: 5n, playerId: alice, characterId: 10n, sourceLocationId: 0n, sourceRegionId: 0n, step: 'PENDING', createdAt: ts(T0), updatedAt: ts(T0) }],
      region: [{ id: 1n, name: 'Emberdeep', dangerMultiplier: 100n, starterForRace: 'kobold', biome: 'cavern' }],
      location: [
        { id: 20n, name: 'The Gate', regionId: 1n, isSafe: false, terrainType: 'cavern' },
        { id: 21n, name: 'Hearthhold', regionId: 1n, isSafe: true, terrainType: 'town' },
      ],
      npc: [{ id: 30n, name: 'Varek', npcType: 'vendor', locationId: 21n }],
      economy_dials: dialsOn(),
    });
    expect(worldGen.startWorldGeneration(ctx, rows(ctx, 'world_gen_state')[0])).toBe('reused');
    expect(rows(ctx, 'region_economy')).toHaveLength(0);
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Task 1: the late-enemy hook (npc_conversation quest effect)
// ---------------------------------------------------------------------------

const NPC_CTX = JSON.stringify({ characterId: '10', npcId: '20', memoryId: '30' });
const npcJob = () => ({ domain: 'npc_conversation', playerId: alice, contextJson: NPC_CTX });
const EMPTY_MEMORY = JSON.stringify({ topics: [], questsCompleted: [], secretsShared: [], giftsGiven: [], lastConversationSummary: '' });

function npcSeed(econStatus: string | null, dials: any[]): Seed {
  return {
    player: [{ id: alice, userId: 7n, activeCharacterId: 10n }],
    character: [{ id: 10n, ownerUserId: 7n, name: 'Tester', race: 'Ashkin', className: 'Emberblade', level: 3n, xp: 0n, gold: 0n, locationId: 100n, boundLocationId: 100n, cha: 10n }],
    npc: [{ id: 20n, name: 'Marta', npcType: 'lore', locationId: 100n, description: 'A baker.', greeting: 'Hello.', gender: 'female', personalityJson: JSON.stringify({ affinityMultiplier: 1.0 }) }],
    npc_memory: [{ id: 30n, characterId: 10n, npcId: 20n, memoryJson: EMPTY_MEMORY, lastUpdated: ts(T0 - 10n) }],
    npc_affinity: [{ id: 40n, characterId: 10n, npcId: 20n, affinity: 0n, lastInteraction: ts(T0 - 10n), giftsGiven: 0n, conversationCount: 0n }],
    region: [{ id: 1n, name: 'Kesterlane Basin', dangerMultiplier: 100n, biome: 'coastal' }],
    location: [
      { id: 100n, name: 'Market Square', regionId: 1n, isSafe: true, terrainType: 'town' },
      { id: 101n, name: 'Old Mill', regionId: 1n, isSafe: false, terrainType: 'plains' },
    ],
    location_connection: [
      { id: 1n, fromLocationId: 100n, toLocationId: 101n },
      { id: 2n, fromLocationId: 101n, toLocationId: 100n },
    ],
    region_economy: econStatus === null ? [] : [{ regionId: 1n, status: econStatus, jobId: 1n, otherRegionIds: '[]', createdAt: ts(T0 - 10n), updatedAt: ts(T0 - 10n) }],
    economy_dials: dials,
  };
}

const killOffer = JSON.stringify({
  dialogue: 'Rats again.',
  effects: [{ type: 'offer_quest', questName: 'Rats in the Cellar', targetEnemyName: 'Cellar Undead Rat', targetCount: 3, questDescription: 'Clear the cellar.', rewardXp: 80 }],
  memoryUpdate: {},
  internalThought: '',
});

describe('late-enemy hook: npc_conversation creates an enemy type', () => {
  it('switch on and region complete: one enemy-mode job (enemy:<id>, phase_only)', () => {
    const ctx = ctxFor(npcSeed('complete', dialsOn()));
    apply.applyLlmResult(ctx, npcJob(), killOffer);
    const et = rows(ctx, 'enemy_template');
    expect(et).toHaveLength(1);
    const jobs = econJobs(ctx);
    expect(jobs).toHaveLength(1);
    expect(JSON.parse(jobs[0].dedupeKey)[2]).toBe(`enemy:${et[0].id}`);
    expect(jobs[0].budgetDay).toBe('');
    const req = requestOf(jobs[0]);
    expect(req).toMatchObject({ regionId: '1', mode: 'enemy', enemyTemplateId: String(et[0].id) });
    expect(req.input.enemies.map((e: any) => e.name)).toEqual(['Cellar Undead Rat']);
    // The region row is not touched by an enemy job.
    expect(rows(ctx, 'region_economy')[0]).toMatchObject({ status: 'complete', jobId: 1n });
  });

  it.each([
    ['region pending', 'pending', dialsOn()],
    ['region failed', 'failed', dialsOn()],
    ['region with no economy', null, dialsOn()],
    ['switch off', 'complete', dialsOff()],
    ['no economy_dials row', 'complete', []],
  ])('%s: no job', (_label, status, dials) => {
    const ctx = ctxFor(npcSeed(status as string | null, dials as any[]));
    apply.applyLlmResult(ctx, npcJob(), killOffer);
    expect(rows(ctx, 'enemy_template')).toHaveLength(1);
    expect(rows(ctx, 'quest_template')).toHaveLength(1);
    expect(econJobs(ctx)).toHaveLength(0);
  });

  it('startEnemyLoot refuses an enemy that already has loot entries', () => {
    const seed = npcSeed('complete', dialsOn());
    seed.enemy_template = [{ id: 60n, name: 'Wolf', level: 3n, creatureType: 'beast' }];
    seed.enemy_loot_entry = [{ id: 1n, enemyTemplateId: 60n, regionId: 1n, itemTemplateId: 5n, role: 'drop', weight: 1n }];
    const ctx = ctxFor(seed);
    expect(econ.startEnemyLoot(ctx, ctx.db.enemy_template.id.find(60n), 1n, { playerId: alice, characterId: 10n })).toBe('exists');
    expect(econJobs(ctx)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Task 1: dispatch and the follow-up after a region apply
// ---------------------------------------------------------------------------

/** Kesterlane Basin (region 1): two enemies (101, 102) for the region_k0 reply, and 103 joins while pending. */
function kesterlaneSeed(extra: Seed = {}): Seed {
  const enemy = (id: bigint, name: string, creatureType: string, level: bigint) => ({
    id, name, role: 'damage', roleDetail: '', abilityProfile: '', terrainTypes: 'swamp', creatureType, timeOfDay: 'any',
    socialGroup: '', socialRadius: 0n, awareness: 'normal', groupMin: 1n, groupMax: 1n, armorClass: 10n, level, maxHp: 20n, baseDamage: 3n, xpReward: 10n,
  });
  return {
    player: [{ id: alice, userId: 7n, activeCharacterId: 10n }],
    character: [{ id: 10n, ownerUserId: 7n, name: 'Tester', locationId: 10n }],
    region: [{ id: 1n, name: 'Kesterlane Basin', dangerMultiplier: 100n, regionType: 'wild', biome: 'coastal', dominantFaction: 'The Brine Wardens', landmarks: '[]', threats: '[]' }],
    location: [
      { id: 10n, name: 'Pans', regionId: 1n, terrainType: 'swamp', isSafe: false },
      { id: 12n, name: 'Undercroft', regionId: 1n, terrainType: 'dungeon', isSafe: false },
    ],
    location_connection: [],
    location_enemy_template: [
      { id: 1n, locationId: 10n, enemyTemplateId: 101n },
      { id: 2n, locationId: 12n, enemyTemplateId: 102n },
    ],
    enemy_template: [enemy(101n, 'Salt-Crust Skitterer', 'beast', 1n), enemy(102n, 'Brine Sentinel', 'construct', 2n), enemy(103n, 'Drowned Tollman', 'undead', 2n)],
    ...extra,
  };
}

/** Starts the region job through startRegionEconomy (the real enqueue) and returns the stored job row. */
function startedRegion(dials: any[] = dialsOn()) {
  const ctx = ctxFor(kesterlaneSeed({ economy_dials: dialsOn() }));
  expect(econ.startRegionEconomy(ctx, ctx.db.region.id.find(1n), { playerId: alice, characterId: 10n })).toBe('enqueued');
  const job = econJobs(ctx)[0];
  // The switch for what follows the region apply.
  ctx.db._tables.economy_dials = dials;
  return { ctx, job };
}

const toApply = (job: any) => ({ domain: job.route, playerId: job.playerId, contextJson: job.requestJson });

describe('applyLlmResult / applyLlmFailure dispatch region_economy', () => {
  it('a success writes the region economy (status complete) and no player line', () => {
    const { ctx, job } = startedRegion();
    apply.applyLlmResult(ctx, toApply(job), replyText('region_k0'));
    expect(rows(ctx, 'region_economy')[0]).toMatchObject({ regionId: 1n, status: 'complete', jobId: job.id });
    expect(rows(ctx, 'economy_item').length).toBeGreaterThan(0);
    expect(rows(ctx, 'recipe_template').length).toBe(3);
    expect(rows(ctx, 'event_private')).toHaveLength(0);
  });

  it('a failure sets the row to failed and writes no player line', () => {
    const { ctx, job } = startedRegion();
    apply.applyLlmFailure(ctx, { ...toApply(job), errorCode: 'refusal' });
    expect(rows(ctx, 'region_economy')[0]).toMatchObject({ regionId: 1n, status: 'failed' });
    expect(rows(ctx, 'event_private')).toHaveLength(0);
  });

  it('follow-up: an enemy that joined while the region was pending gets one enemy-mode job after the apply', () => {
    const { ctx, job } = startedRegion();
    // The Drowned Tollman (103) moves in while the job is pending.
    ctx.db._tables.location_enemy_template.push({ id: 3n, locationId: 12n, enemyTemplateId: 103n });
    apply.applyLlmResult(ctx, toApply(job), replyText('region_k0'));
    expect(rows(ctx, 'region_economy')[0].status).toBe('complete');
    const enemyJobs = econJobs(ctx).filter((j: any) => requestOf(j).mode === 'enemy');
    expect(enemyJobs).toHaveLength(1);
    expect(JSON.parse(enemyJobs[0].dedupeKey)[2]).toBe('enemy:103');
    expect(requestOf(enemyJobs[0])).toMatchObject({ regionId: '1', enemyTemplateId: '103', characterId: '10' });
    expect(enemyJobs[0].characterId).toBe(10n);
    // 101 and 102 got loot entries from the region apply: no job for them.
    expect(econJobs(ctx)).toHaveLength(2);
  });

  it('follow-up: none when the switch is off', () => {
    const { ctx, job } = startedRegion(dialsOff());
    ctx.db._tables.location_enemy_template.push({ id: 3n, locationId: 12n, enemyTemplateId: 103n });
    apply.applyLlmResult(ctx, toApply(job), replyText('region_k0'));
    expect(rows(ctx, 'region_economy')[0].status).toBe('complete');
    expect(econJobs(ctx)).toHaveLength(1);
  });
});

describe('startRegionEconomy gates', () => {
  it("'off' with no dials row; 'no_region' for a region with no locations; retryFailed revives a failed row", () => {
    const off = ctxFor(kesterlaneSeed());
    expect(econ.startRegionEconomy(off, off.db.region.id.find(1n), { playerId: alice, characterId: 10n })).toBe('off');
    expect(rows(off, 'llm_job')).toHaveLength(0);

    const empty = ctxFor(kesterlaneSeed({ economy_dials: dialsOn(), location: [] }));
    expect(econ.startRegionEconomy(empty, empty.db.region.id.find(1n), { playerId: alice, characterId: 10n })).toBe('no_region');
    expect(rows(empty, 'llm_job')).toHaveLength(0);
    expect(rows(empty, 'region_economy')).toHaveLength(0);

    const failed = ctxFor(kesterlaneSeed({
      economy_dials: dialsOn(),
      region_economy: [{ regionId: 1n, status: 'failed', jobId: 77n, otherRegionIds: '[]', createdAt: ts(T0 - 10n), updatedAt: ts(T0 - 10n) }],
    }));
    const region = failed.db.region.id.find(1n);
    expect(econ.startRegionEconomy(failed, region, { playerId: alice, characterId: 10n })).toBe('exists');
    expect(econ.startRegionEconomy(failed, region, { playerId: alice, characterId: 10n }, { retryFailed: true })).toBe('enqueued');
    const job = econJobs(failed)[0];
    expect(rows(failed, 'region_economy')[0]).toMatchObject({ status: 'pending', jobId: job.id });
    expect(econ.startRegionEconomy(failed, region, { playerId: alice, characterId: 10n }, { retryFailed: true })).toBe('exists');
    expect(econJobs(failed)).toHaveLength(1);
  });
});

