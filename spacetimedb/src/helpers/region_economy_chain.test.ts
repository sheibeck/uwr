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

/** One family of the stage-2b (world_gen_families) reply, with the member names the old enemies carried. */
const familyItem = (name: string, singular: string, creatureType: string, member: { role: string; name: string }) => ({
  name,
  singularNoun: singular,
  pluralNoun: `${singular}s`,
  creatureType,
  iconKey: creatureType,
  temperament: 'aggressive',
  ambushVerb: 'lunge',
  ambushRest: 'out of the ash',
  members: [member],
  fitLocations: [],
  relations: [],
});
const FAMILIES_TEXT = JSON.stringify({
  families: [
    familyItem('Ember Wolves', 'ember wolf', 'beast', { role: 'damage', name: 'Ember Wolf' }),
    familyItem('Slag Casters', 'slag caster', 'humanoid', { role: 'caster', name: 'Slag Caster' }),
  ],
});
const familiesJob = () => ({ domain: 'world_gen_families', playerId: alice, contextJson: GEN_CTX });

/**
 * Phase 51.3.1.2 (D-01): the region fill is two replies. The places (world_gen, stage 2a) start the families
 * job; the families (world_gen_families, stage 2b) complete the region, and the economy starts after that.
 * `between` runs after 2a (for example to halt the game before 2b lands).
 */
function fillRegion(ctx: any, between: (ctx: any) => void = () => {}): void {
  apply.applyLlmResult(ctx, fillJob(), FILL_TEXT);
  between(ctx);
  apply.applyLlmResult(ctx, familiesJob(), FAMILIES_TEXT);
}
/** The jobs other than the families job the 2a apply enqueued. */
const otherJobs = (ctx: any): any[] => rows(ctx, 'llm_job').filter((j: any) => j.route !== 'world_gen_families');

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
    fillRegion(ctx);
    expect(genStep(ctx)).toBe('COMPLETE');
    expect(rows(ctx, 'region_economy')).toHaveLength(0);
    expect(econJobs(ctx)).toHaveLength(0);
    // Only the families job stage 2a enqueued (and its dispatch row): nothing for the economy.
    expect(otherJobs(ctx)).toHaveLength(0);
    const familiesIds = new Set(rows(ctx, 'llm_job').map((j: any) => j.id));
    expect(rows(ctx, 'llm_dispatch').filter((d: any) => !familiesIds.has(d.jobId))).toHaveLength(0);
  });
});

describe('fill hook: on', () => {
  it('enqueues one region-mode job (phase_only, region:<id>) and writes the pending row', () => {
    const ctx = ctxFor(fillSeed({ economy_dials: dialsOn() }));
    fillRegion(ctx);
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
    // Plan 25: the job speaks in families (the fill's rule families with their members), no 51.3 enemies.
    expect(req.input.enemies).toEqual([]);
    const memberNames = req.input.families.flatMap((f: any) => f.members.map((m: any) => m.name));
    expect(memberNames).toEqual(expect.arrayContaining(['Ember Wolf', 'Slag Caster']));
    expect(req.ruleFamilyIds).toEqual([]);

    expect(econDispatches(ctx)).toHaveLength(1);
    const econRows = rows(ctx, 'region_economy');
    expect(econRows).toHaveLength(1);
    expect(econRows[0]).toMatchObject({ regionId: 1n, status: 'pending', jobId: job.id, otherRegionIds: '[]' });

    // Phase 51.3.1.2: the old completion line is gone; a starter state gets no line at COMPLETE (Plan 13).
    expect(rows(ctx, 'event_private').map((e: any) => e.message)).not.toContain(completionLine);
  });

  it('adjacency: a second fill completion for the same region does not enqueue a second job', () => {
    const ctx = ctxFor(fillSeed({ economy_dials: dialsOn() }));
    fillRegion(ctx);
    // A FAMILIES_ERROR retry completing later: the state is FILLING_FAMILIES again and the families apply again.
    const state = rows(ctx, 'world_gen_state')[0];
    ctx.db.world_gen_state.id.update({ ...state, step: 'FILLING_FAMILIES' });
    apply.applyLlmResult(ctx, familiesJob(), FAMILIES_TEXT);
    expect(genStep(ctx)).toBe('COMPLETE');
    expect(econJobs(ctx)).toHaveLength(1);
    expect(rows(ctx, 'region_economy')).toHaveLength(1);
    // And a direct second start says the row exists.
    expect(econ.startRegionEconomy(ctx, ctx.db.region.id.find(1n), { playerId: alice, characterId: 10n })).toBe('exists');
    expect(econJobs(ctx)).toHaveLength(1);
  });

  it('a halted game (kill switch) refuses the enqueue: the fill completes, no row or job is written', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const ctx = ctxFor(fillSeed({ economy_dials: dialsOn() }));
    // Phase 51.3.1.2: the game halts after the places landed and the families job was queued (a halt
    // before 2a would refuse the families job itself); the families reply then completes the region.
    fillRegion(ctx, (c) => {
      const gate = rows(c, 'llm_admin_state')[0];
      c.db.llm_admin_state.id.update({ ...gate, llmEnabled: false });
    });
    expect(genStep(ctx)).toBe('COMPLETE');
    expect(rows(ctx, 'region_economy')).toHaveLength(0);
    expect(econJobs(ctx)).toHaveLength(0);
    expect(otherJobs(ctx)).toHaveLength(0);
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
    fillRegion(ctx);
    expect(genStep(base)).toBe('COMPLETE');
    expect(rows(base, 'event_private').map((e: any) => e.message)).not.toContain(completionLine);
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

describe('quest family hook: npc_conversation invents a kill target (D-54)', () => {
  it('switch on and region complete: one family-mode job for its family of one (family:<id>, phase_only)', () => {
    const ctx = ctxFor(npcSeed('complete', dialsOn()));
    apply.applyLlmResult(ctx, npcJob(), killOffer);
    const et = rows(ctx, 'enemy_template');
    expect(et).toHaveLength(1);
    const family = rows(ctx, 'creature_family').find((f: any) => f.key === `quest:${et[0].id}`);
    expect(family).toBeTruthy();
    const jobs = econJobs(ctx);
    expect(jobs).toHaveLength(1);
    expect(JSON.parse(jobs[0].dedupeKey)[2]).toBe(`family:${family.id}`);
    expect(jobs[0].budgetDay).toBe('');
    const req = requestOf(jobs[0]);
    expect(req).toMatchObject({ regionId: '1', mode: 'family', familyId: String(family.id), characterId: '10' });
    expect(req.input.families.map((f: any) => f.members.map((m: any) => m.name))).toEqual([['Cellar Undead Rat']]);
    // The region row is not touched by a family job.
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

  it('startFamilyLoot refuses a family whose members all have loot entries', () => {
    const seed = npcSeed('complete', dialsOn());
    seed.enemy_template = [{ id: 60n, name: 'Wolf', level: 3n, creatureType: 'beast' }];
    seed.creature_family = [{ id: 7n, regionId: 1n, key: '1:beast', name: 'Wolves', singularNoun: 'wolf', pluralNoun: 'wolves', temperament: 'wary', iconKey: 'beast', creatureType: 'beast', ambushVerb: '', ambushRest: '', fitTerrains: 'plains' }];
    seed.family_member = [{ id: 1n, familyId: 7n, enemyTemplateId: 60n, role: 'damage', filler: false }];
    seed.enemy_loot_entry = [{ id: 1n, enemyTemplateId: 60n, regionId: 1n, itemTemplateId: 5n, role: 'drop', weight: 1n }];
    const ctx = ctxFor(seed);
    expect(econ.startFamilyLoot(ctx, ctx.db.creature_family.id.find(7n), 1n, { playerId: alice, characterId: 10n })).toBe('exists');
    expect(econJobs(ctx)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Task 1: dispatch and the follow-up after a region apply
// ---------------------------------------------------------------------------

const familyRow = (id: bigint, name: string) => ({
  id, regionId: 1n, key: `1:f${id}`, name, singularNoun: 'creature', pluralNoun: 'creatures', temperament: 'aggressive',
  iconKey: 'beast', creatureType: 'beast', ambushVerb: '', ambushRest: '', fitTerrains: 'swamp',
});

/**
 * Kesterlane Basin (region 1): two families of one, the Skitterers (1: 101) and the Sentinels (2: 102),
 * for a family reply; the Tollmen (3: 103) can join while the region job is pending.
 */
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
    creature_family: [familyRow(1n, 'Salt-Crust Skitterers'), familyRow(2n, 'Brine Sentinels')],
    family_member: [
      { id: 1n, familyId: 1n, enemyTemplateId: 101n, role: 'damage', filler: false },
      { id: 2n, familyId: 2n, enemyTemplateId: 102n, role: 'damage', filler: false },
    ],
    ...extra,
  };
}

/** A family-shape reply (draft B3) for a stored region input: names from fixed lists, gear for every member. */
function familyReplyFor(input: any): string {
  const DROPS = ['Skitter Chitin', 'Sentinel Rivet', 'Ember Hide', 'Slag Rivet'];
  const TROPHIES = ['Skitterer Eyestalk', 'Tide Seal', 'Ember Fang', 'Slag Eye'];
  const GEAR = ['Pincer Blade', 'Halberd Axe', 'Ember Claw', 'Slag Wand', 'Ash Greaves', 'Cinder Boots', 'Coal Jerkin', 'Soot Pants'];
  let g = 0;
  const families = input.families.map((f: any, i: number) => ({
    family: f.ref,
    drop: { name: DROPS[i], kind: 'hide', description: 'A drop.' },
    trophy: { name: TROPHIES[i], description: 'A trophy.' },
    gear: f.members.map((m: any) => ({ member: m.ref, name: GEAR[g++] ?? '', slot: 'weapon', weaponType: 'sword', armorType: 'none', description: 'Gear.' })),
  }));
  return JSON.stringify({
    region: {
      gatherables: [
        { name: 'Panlight Salt', kind: 'base', terrain: input.terrains[0], description: 'Salt.' },
        { name: 'Brinewort', kind: 'edible', terrain: input.terrains[0], description: 'A leaf.' },
        { name: 'Undercroft Quartz', kind: 'trinket', terrain: input.terrains[0], description: 'A stone.' },
      ],
      families,
      recipes: [
        { name: 'Chitin Jerkin', category: 'armor', description: 'A jerkin.', materials: ['D:E1', 'G1'] },
        { name: 'Brinewort Broth', category: 'consumable', description: 'A broth.', materials: ['G2', 'G1'] },
        { name: 'Quartz Pendant', category: 'accessory', description: 'A pendant.', materials: ['G3', 'G1'] },
      ],
    },
    lateFamily: null,
  });
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
    apply.applyLlmResult(ctx, toApply(job), familyReplyFor(requestOf(job).input));
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

  it('follow-up: a family that joined while the region was pending gets one family-mode job after the apply', () => {
    const { ctx, job } = startedRegion();
    // The Tollmen (family 3: 103 and a filler mender 104) join while the job is pending.
    ctx.db._tables.enemy_template.push({ ...ctx.db._tables.enemy_template[2], id: 104n, name: 'Drowned Mender', role: 'healer' });
    ctx.db._tables.creature_family.push(familyRow(3n, 'Drowned Tollmen'));
    ctx.db._tables.family_member.push(
      { id: 3n, familyId: 3n, enemyTemplateId: 103n, role: 'damage', filler: false },
      { id: 4n, familyId: 3n, enemyTemplateId: 104n, role: 'healer', filler: true },
    );
    apply.applyLlmResult(ctx, toApply(job), familyReplyFor(requestOf(job).input));
    expect(rows(ctx, 'region_economy')[0].status).toBe('complete');
    const familyJobs = econJobs(ctx).filter((j: any) => requestOf(j).mode === 'family');
    // One job for the family, not one per member.
    expect(familyJobs).toHaveLength(1);
    expect(JSON.parse(familyJobs[0].dedupeKey)[2]).toBe('family:3');
    expect(requestOf(familyJobs[0])).toMatchObject({ regionId: '1', familyId: '3', characterId: '10' });
    expect(familyJobs[0].characterId).toBe(10n);
    // Families 1 and 2 got loot entries from the region apply: no job for them.
    expect(econJobs(ctx)).toHaveLength(2);
  });

  it('follow-up: none when the switch is off', () => {
    const { ctx, job } = startedRegion(dialsOff());
    ctx.db._tables.creature_family.push(familyRow(3n, 'Drowned Tollmen'));
    ctx.db._tables.family_member.push({ id: 3n, familyId: 3n, enemyTemplateId: 103n, role: 'damage', filler: false });
    apply.applyLlmResult(ctx, toApply(job), familyReplyFor(requestOf(job).input));
    expect(rows(ctx, 'region_economy')[0].status).toBe('complete');
    expect(econJobs(ctx)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Phase 51.3.1.2 Plan 07 (D-11): one late-family loot job per family past the design cap; rule loot
// only when that job fails, its reply is unusable, its start is refused, or the switch is off
// ---------------------------------------------------------------------------

const BIG_FAMILIES = 13;
/** Distinct name words (item names drop digits): family n uses BIG_WORDS[n - 1]. */
const BIG_WORDS = ['Ash', 'Brine', 'Cinder', 'Dusk', 'Ember', 'Fen', 'Gloam', 'Hollow', 'Iron', 'Jade', 'Kelp', 'Loam', 'Mire'];
const bigMember = (n: number): bigint => 400n + BigInt(n);

/** Kesterlane Basin (region 1) with 13 one-member families (ids 1..13, members 401..413), no feuds, no pools. */
function bigRegionSeed(extra: Seed = {}): Seed {
  const enemy = (id: bigint, name: string) => ({
    id, name, role: 'damage', roleDetail: '', abilityProfile: '', terrainTypes: 'swamp', creatureType: 'beast', timeOfDay: 'any',
    socialGroup: '', socialRadius: 0n, awareness: 'normal', groupMin: 1n, groupMax: 1n, armorClass: 10n, level: 1n, maxHp: 20n, baseDamage: 3n, xpReward: 10n,
  });
  const families: any[] = [];
  const members: any[] = [];
  const templates: any[] = [];
  for (let n = 1; n <= BIG_FAMILIES; n++) {
    families.push(familyRow(BigInt(n), `Kin Family ${n}`));
    templates.push(enemy(bigMember(n), `Kin ${n}`));
    members.push({ id: BigInt(n), familyId: BigInt(n), enemyTemplateId: bigMember(n), role: 'damage', filler: false });
  }
  return {
    player: [{ id: alice, userId: 7n, activeCharacterId: 10n }],
    character: [{ id: 10n, ownerUserId: 7n, name: 'Tester', locationId: 10n }],
    region: [{ id: 1n, name: 'Kesterlane Basin', dangerMultiplier: 100n, regionType: 'wild', biome: 'coastal', dominantFaction: 'The Brine Wardens', landmarks: '[]', threats: '[]' }],
    location: [
      { id: 10n, name: 'Pans', regionId: 1n, terrainType: 'swamp', isSafe: false },
      { id: 12n, name: 'Undercroft', regionId: 1n, terrainType: 'dungeon', isSafe: false },
    ],
    location_connection: [],
    enemy_template: templates,
    creature_family: families,
    family_member: members,
    family_relation: [],
    place_pool: [],
    economy_dials: dialsOn(),
    llm_job: [],
    ...extra,
  };
}

/** A family-shape region reply that designs every listed family (one member each). */
function bigRegionReplyFor(input: any): string {
  const families = input.families.map((f: any, i: number) => ({
    family: f.ref,
    drop: { name: `${BIG_WORDS[i]} Hide`, kind: 'hide', description: 'A drop.' },
    trophy: { name: `${BIG_WORDS[i]} Tooth`, description: 'A trophy.' },
    gear: f.members.map((m: any) => ({ member: m.ref, name: `${BIG_WORDS[i]} Claw`, slot: 'weapon', weaponType: 'sword', armorType: 'none', description: 'Gear.' })),
  }));
  return JSON.stringify({
    region: {
      gatherables: [
        { name: 'Panlight Salt', kind: 'base', terrain: input.terrains[0], description: 'Salt.' },
        { name: 'Brinewort', kind: 'edible', terrain: input.terrains[0], description: 'A leaf.' },
        { name: 'Undercroft Quartz', kind: 'trinket', terrain: input.terrains[0], description: 'A stone.' },
      ],
      families,
      recipes: [],
    },
    lateFamily: null,
  });
}

const bigWho = { playerId: alice, characterId: 10n };
const lootRows = (ctx: any, templateId: bigint): any[] => rows(ctx, 'enemy_loot_entry').filter((e: any) => e.enemyTemplateId === templateId);
const familyJobs = (ctx: any): any[] => econJobs(ctx).filter((j: any) => requestOf(j).mode === 'family');
const familyEconRow = (ctx: any, role: string, familyId: bigint) =>
  rows(ctx, 'economy_item').find((r: any) => r.role === role && r.familyId === familyId);

/** Rule loot for a family of one: its drop, trophy and member gear rows, and the member's loot table naming them. */
function expectRuleLoot(ctx: any, n: number): void {
  const familyId = BigInt(n);
  const drop = familyEconRow(ctx, 'drop', familyId);
  const trophy = familyEconRow(ctx, 'trophy', familyId);
  const gear = rows(ctx, 'economy_item').find((r: any) => r.role === 'gear' && r.enemyTemplateId === bigMember(n));
  expect([drop, trophy, gear].every((x) => x !== undefined)).toBe(true);
  const dropName = rows(ctx, 'item_template').find((t: any) => t.id === drop.itemTemplateId).name;
  expect(dropName).toMatch(/^Kesterlane Basin /);
  const loot = lootRows(ctx, bigMember(n));
  expect(loot.filter((e: any) => e.role === 'drop').map((e: any) => e.itemTemplateId)).toEqual([drop.itemTemplateId]);
  expect(loot.filter((e: any) => e.role === 'trophy').map((e: any) => e.itemTemplateId)).toEqual([trophy.itemTemplateId]);
  expect(loot.filter((e: any) => e.role === 'gear').map((e: any) => e.itemTemplateId)).toEqual([gear.itemTemplateId]);
}

const countsOf = (ctx: any): number[] =>
  ['item_template', 'economy_item', 'enemy_loot_entry', 'llm_job', 'recipe_template'].map((t) => rows(ctx, t).length);

/** Starts the region job of the 13-family region (dials on) and returns the stored job row. */
function bigStarted(extra: Seed = {}) {
  const ctx = ctxFor(bigRegionSeed(extra));
  expect(econ.startRegionEconomy(ctx, ctx.db.region.id.find(1n), bigWho)).toBe('enqueued');
  return { ctx, job: econJobs(ctx)[0] };
}

/** The 13-family region after the region apply with the switch on: 7 designed, 6 late-family jobs queued. */
function bigApplied() {
  const { ctx, job } = bigStarted();
  apply.applyLlmResult(ctx, { ...toApply(job), jobId: job.id }, bigRegionReplyFor(requestOf(job).input));
  return { ctx, job };
}

describe('a region past the design cap: one late-family loot job per remaining family (Phase 51.3.1.2, D-11)', () => {
  it('the region job designs 7 families and sends no rule-family list', () => {
    const { job } = bigStarted();
    const request = requestOf(job);
    expect(request.input.families.map((f: any) => f.familyId)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(request.ruleFamilyIds).toEqual([]);
    expect(econJobs(bigStarted().ctx)).toHaveLength(1);
  });

  it('the region apply writes the 7 designed families, no rule loot for the other 6, and queues 6 phase_only family jobs', () => {
    const { ctx } = bigApplied();
    expect(rows(ctx, 'region_economy')[0].status).toBe('complete');
    for (let n = 1; n <= 7; n++) {
      expect(lootRows(ctx, bigMember(n)).length).toBeGreaterThan(0);
      const drop = familyEconRow(ctx, 'drop', BigInt(n));
      expect(rows(ctx, 'item_template').find((t: any) => t.id === drop.itemTemplateId).name).toBe(`${BIG_WORDS[n - 1]} Hide`);
    }
    for (let n = 8; n <= BIG_FAMILIES; n++) {
      expect(lootRows(ctx, bigMember(n))).toEqual([]);
      expect(familyEconRow(ctx, 'drop', BigInt(n))).toBeUndefined();
    }
    const jobs = familyJobs(ctx);
    expect(jobs.map((j: any) => JSON.parse(j.dedupeKey)[2])).toEqual(['family:8', 'family:9', 'family:10', 'family:11', 'family:12', 'family:13']);
    expect(jobs.every((j: any) => j.budgetDay === '')).toBe(true);
    for (const j of jobs) expect(requestOf(j)).toMatchObject({ regionId: '1', mode: 'family', characterId: '10' });
  });

  it('a failed late-family job writes rule loot for its family once; a second failure writes nothing new', () => {
    const { ctx } = bigApplied();
    const job = familyJobs(ctx).find((j: any) => requestOf(j).familyId === '9');
    apply.applyLlmFailure(ctx, { ...toApply(job), errorCode: 'refusal' });
    expectRuleLoot(ctx, 9);
    // Only family 9 changed.
    for (const n of [8, 10, 11, 12, 13]) expect(lootRows(ctx, bigMember(n))).toEqual([]);
    expect(rows(ctx, 'region_economy')[0].status).toBe('complete');
    const once = countsOf(ctx);
    apply.applyLlmFailure(ctx, { ...toApply(job), errorCode: 'apply_error' });
    expect(countsOf(ctx)).toEqual(once);
  });

  it('an unusable late-family reply writes rule loot for that family once', () => {
    for (const reply of ['not json', JSON.stringify({ region: null, lateFamily: null })]) {
      const { ctx } = bigApplied();
      const job = familyJobs(ctx).find((j: any) => requestOf(j).familyId === '8');
      apply.applyLlmResult(ctx, toApply(job), reply);
      expectRuleLoot(ctx, 8);
      for (const n of [9, 10, 11, 12, 13]) expect(lootRows(ctx, bigMember(n))).toEqual([]);
      const once = countsOf(ctx);
      apply.applyLlmResult(ctx, toApply(job), reply);
      expect(countsOf(ctx)).toEqual(once);
    }
  });

  it('a usable late-family reply writes AI-named loot and no rule loot', () => {
    const { ctx } = bigApplied();
    const job = familyJobs(ctx).find((j: any) => requestOf(j).familyId === '8');
    const reply = JSON.stringify({
      region: null,
      lateFamily: {
        family: 'E1',
        drop: { name: 'Kin Pelt', kind: 'hide', description: 'A pelt.' },
        trophy: { name: 'Kin Fang', description: 'A fang.' },
        gear: [{ member: 'E1.damage', name: 'Kin Hook', slot: 'weapon', weaponType: 'dagger', armorType: 'none', description: 'A hook.' }],
      },
    });
    apply.applyLlmResult(ctx, toApply(job), reply);
    const drop = familyEconRow(ctx, 'drop', 8n);
    expect(rows(ctx, 'item_template').find((t: any) => t.id === drop.itemTemplateId).name).toBe('Kin Pelt');
    expect(lootRows(ctx, bigMember(8)).length).toBeGreaterThan(0);
  });

  it('a refused late-family start (kill switch) writes rule loot for each remaining family at once', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { ctx, job } = bigStarted();
    ctx.db._tables.llm_admin_state = [{ ...defaultLlmAdminStateRow(), llmEnabled: false }];
    apply.applyLlmResult(ctx, { ...toApply(job), jobId: job.id }, bigRegionReplyFor(requestOf(job).input));
    expect(rows(ctx, 'region_economy')[0].status).toBe('complete');
    expect(familyJobs(ctx)).toEqual([]);
    for (let n = 8; n <= BIG_FAMILIES; n++) expectRuleLoot(ctx, n);
    expect(info.mock.calls.some((c) => String(c[0]).includes('halted'))).toBe(true);
  });

  it('with the AI economy switch off at apply time, every family still lacking loot gets rule loot and no job', () => {
    const { ctx, job } = bigStarted();
    // Family 14 joins while the region job is pending, then the switch goes off.
    ctx.db._tables.enemy_template.push({ ...ctx.db._tables.enemy_template[0], id: bigMember(14), name: 'Kin 14' });
    ctx.db._tables.creature_family.push(familyRow(14n, 'Kin Family 14'));
    ctx.db._tables.family_member.push({ id: 14n, familyId: 14n, enemyTemplateId: bigMember(14), role: 'damage', filler: false });
    ctx.db._tables.economy_dials = dialsOff();
    apply.applyLlmResult(ctx, { ...toApply(job), jobId: job.id }, bigRegionReplyFor(requestOf(job).input));
    expect(rows(ctx, 'region_economy')[0].status).toBe('complete');
    expect(familyJobs(ctx)).toEqual([]);
    for (let n = 8; n <= 14; n++) expectRuleLoot(ctx, n);
    for (let n = 1; n <= 7; n++) {
      const drop = familyEconRow(ctx, 'drop', BigInt(n));
      expect(rows(ctx, 'item_template').find((t: any) => t.id === drop.itemTemplateId).name).toBe(`${BIG_WORDS[n - 1]} Hide`);
    }
  });

  it('a stored region job that still carries ruleFamilyIds (queued before this change) writes those families by rule', () => {
    const { ctx, job } = bigStarted();
    const legacy = { ...requestOf(job), ruleFamilyIds: ['8', '9', '10', '11', '12', '13'] };
    const legacyJob = { ...toApply(job), contextJson: JSON.stringify(legacy), jobId: job.id };
    apply.applyLlmResult(ctx, legacyJob, bigRegionReplyFor(legacy.input));
    expect(rows(ctx, 'region_economy')[0].status).toBe('complete');
    for (let n = 8; n <= BIG_FAMILIES; n++) expectRuleLoot(ctx, n);
    // Every family has loot: no late job.
    expect(familyJobs(ctx)).toEqual([]);
  });

  it('a region whose economy is already complete is untouched by every path', () => {
    const { ctx, job } = bigApplied();
    for (const j of familyJobs(ctx)) apply.applyLlmFailure(ctx, { ...toApply(j), errorCode: 'refusal' });
    const done = countsOf(ctx);
    const snapshot = JSON.stringify(rows(ctx, 'enemy_loot_entry'), (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    // A second start, a late region failure, a repeated region apply and repeated family failures.
    expect(econ.startRegionEconomy(ctx, ctx.db.region.id.find(1n), bigWho)).toBe('exists');
    apply.applyLlmFailure(ctx, { ...toApply(job), jobId: job.id, errorCode: 'refusal' });
    apply.applyLlmResult(ctx, { ...toApply(job), jobId: job.id }, bigRegionReplyFor(requestOf(job).input));
    for (const j of familyJobs(ctx)) apply.applyLlmFailure(ctx, { ...toApply(j), errorCode: 'refusal' });
    for (let n = 1; n <= BIG_FAMILIES; n++) econ.writeRuleLootForFamily(ctx, 1n, BigInt(n));
    expect(countsOf(ctx)).toEqual(done);
    expect(JSON.stringify(rows(ctx, 'enemy_loot_entry'), (_k, v) => (typeof v === 'bigint' ? v.toString() : v))).toBe(snapshot);
    expect(rows(ctx, 'region_economy')[0].status).toBe('complete');
  });

  it('writeRuleLootForFamily writes nothing while the region economy is not complete', () => {
    const { ctx } = bigStarted();
    const before = countsOf(ctx);
    expect(econ.writeRuleLootForFamily(ctx, 1n, 9n)).toBe(false);
    expect(countsOf(ctx)).toEqual(before);
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

// ---------------------------------------------------------------------------
// Task 2: end to end through the real executor with a scripted fetch (no network)
// ---------------------------------------------------------------------------

/** A fake key built from fragments so no key-shaped literal appears in the source. */
const FAKE_KEY = ['sk', '-ant-', 'api03-', 'CHAINTESTKEY'.repeat(4)].join('');

/** The ok_json Claude response with its text replaced by the region_k0 reply. */
function claudeReply(text: string): any {
  const fixture = JSON.parse(readFileSync(join(CLAUDE_DIR, 'ok_json.json'), 'utf8'));
  return { ...fixture, body: { ...fixture.body, content: [{ type: 'text', text }] } };
}

describe('end to end: fill, then the real llm_run path with a scripted fetch', () => {
  it("writes the region's economy (status complete); the scripted fetch was the only fetch", () => {
    // A probe fill on a plain context builds the same stored region input (same seed, same clock).
    const probe = ctxFor(fillSeed({ economy_dials: dialsOn() }));
    fillRegion(probe);
    const probeInput = requestOf(econJobs(probe)[0]).input;
    const proc = createMockProcCtx({
      seed: fillSeed({ economy_dials: dialsOn(), llm_config: [{ id: 1n, apiKey: FAKE_KEY, updatedAt: ts(T0) }] }),
      timestampMicros: T0,
      // The canned family reply answers the stored input (the probe fill above builds the same one); the
      // route schema's top-level keys are region and lateFamily (claude_request fails a reply missing one).
      responses: [claudeReply(familyReplyFor(probeInput))],
      strict: true,
    });
    proc.ctx.withTx((tx: any) => fillRegion(tx));
    const prow = (t: string): any[] => proc.db._tables[t] ?? [];
    expect(prow('world_gen_state')[0].step).toBe('COMPLETE');
    const jobs = prow('llm_job').filter((j: any) => j.route === 'region_economy');
    expect(jobs).toHaveLength(1);
    expect(requestOf(jobs[0]).input).toEqual(probeInput);
    expect(prow('region_economy')[0]).toMatchObject({ regionId: 1n, status: 'pending', jobId: jobs[0].id });

    // What the scheduler does before running llm_run: delete the dispatch row and hand it over.
    const list = prow('llm_dispatch');
    const i = list.findIndex((r: any) => r.jobId === jobs[0].id);
    expect(i).toBeGreaterThanOrEqual(0);
    const arg = list.splice(i, 1)[0];
    expect(arg.scheduledAt).toBeDefined();
    void ScheduleAt;

    const outcome = executor.runLlmJob(proc.ctx, arg, {
      nowMs: () => Number(proc.clock.now() / 1000n),
      apply: apply.applyLlmResult,
      applyFailure: apply.applyLlmFailure,
      log: () => {},
    });
    expect(outcome).toBe('completed');
    expect(proc.http.calls).toHaveLength(1);
    expect(proc.http.remaining()).toBe(0);
    expect(prow('llm_job').find((j: any) => j.id === jobs[0].id).status).toBe('completed');
    expect(prow('region_economy')[0]).toMatchObject({ regionId: 1n, status: 'complete' });
    expect(prow('economy_item').filter((r: any) => r.regionId === 1n).length).toBeGreaterThanOrEqual(9);
    expect(prow('enemy_loot_entry').length).toBeGreaterThan(0);
    expect(prow('region_recipe')).toHaveLength(3);
    // Every family (fillers included) was designed: no follow-up job, so nothing else can call out.
    expect(prow('llm_job').filter((j: any) => j.route === 'region_economy')).toHaveLength(1);
  });
});
