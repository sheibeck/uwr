/**
 * Phase 51.3 Plan 10: the region economy job's server side (helpers/region_economy.ts) on the strict
 * mock db under the recording schema. Covers the input builder (region facts, terrains, enemies,
 * recipe tier slots and the cross-region offer), the stored-context reader, the idempotent region
 * apply (re-run, partial write then re-run, not-pending, unusable reply), the failure and pending
 * helpers, the late-creature apply and the loot roll over the written tables. Replies are the canned
 * Plan 04 fixtures; no LLM call is made.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
// The tsconfig has no @types/node; vitest runs the file in Node, so the built-ins resolve at runtime.
// @ts-ignore
import { readFileSync } from 'node:fs';
// @ts-ignore
import { join } from 'node:path';
// @ts-ignore
import { fileURLToPath } from 'node:url';
import { createMockCtx } from './test-utils';
import { encodeRouteInput } from './llm_inputs';
import { REGION_ECONOMY_BIGINT_PATHS, type RegionEconomyInput } from '../data/economy_design_rules';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

let econ: typeof import('./region_economy');
let recorder: typeof import('./schema_recorder');

beforeAll(async () => {
  await import('../schema/tables');
  recorder = await import('./schema_recorder');
  econ = await import('./region_economy');
}, 120_000);

const FIXTURE_DIR = fileURLToPath(new URL('./__fixtures__/economy/', import.meta.url));
const replyText = (name: string): string => readFileSync(join(FIXTURE_DIR, `${name}.reply.json`), 'utf8');

const T0 = 1_700_000_000_000_000n;
type Seed = Record<string, any[]>;

const ctxFor = (seed: Seed, ts: bigint = T0) => createMockCtx({ seed, strict: true, timestampMicros: ts } as any);
const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];

// ---------------------------------------------------------------------------
// World fixtures
// ---------------------------------------------------------------------------

const regionRow = (id: bigint, name: string, extra: Record<string, any> = {}) => ({
  id,
  name,
  dangerMultiplier: 100n,
  regionType: 'wild',
  biome: 'coastal',
  dominantFaction: 'The Brine Wardens',
  landmarks: '["Mother Pan Undercroft","The Salt Stair"]',
  threats: '["Crust sickness in the low pans"]',
  ...extra,
});

const locationRow = (id: bigint, regionId: bigint, terrainType: string, extra: Record<string, any> = {}) => ({
  id,
  name: `Place ${id}`,
  description: '',
  zone: '',
  regionId,
  levelOffset: 0n,
  isSafe: false,
  terrainType,
  bindStone: false,
  craftingAvailable: false,
  ...extra,
});

const enemyRow = (id: bigint, name: string, creatureType: string, level: bigint, extra: Record<string, any> = {}) => ({
  id,
  name,
  role: 'damage',
  roleDetail: '',
  abilityProfile: '',
  terrainTypes: 'swamp',
  creatureType,
  timeOfDay: 'any',
  socialGroup: '',
  socialRadius: 0n,
  awareness: 'normal',
  groupMin: 1n,
  groupMax: 1n,
  armorClass: 10n,
  level,
  maxHp: 20n,
  baseDamage: 3n,
  xpReward: 10n,
  ...extra,
});

const itemRow = (id: bigint, name: string, extra: Record<string, any> = {}) => ({
  id,
  name,
  slot: 'material',
  rarity: 'common',
  tier: 1n,
  isJunk: false,
  requiredLevel: 1n,
  armorClassBonus: 0n,
  ...extra,
});

const econItem = (itemTemplateId: bigint, regionId: bigint, role: string, rarity: string, kind: string, extra: Record<string, any> = {}) => ({
  itemTemplateId,
  regionId,
  role,
  slotKey: `${role}:${itemTemplateId}`,
  kind,
  rarity,
  terrain: role === 'gather' ? 'woods' : '',
  timeOfDay: 'any',
  enemyTemplateId: 0n,
  ...extra,
});

const econRow = (regionId: bigint, status: string, extra: Record<string, any> = {}) => ({
  regionId,
  status,
  jobId: 1n,
  otherRegionIds: '[]',
  createdAt: { microsSinceUnixEpoch: T0 - 10n },
  updatedAt: { microsSinceUnixEpoch: T0 - 10n },
  ...extra,
});

const SKITTERER = enemyRow(101n, 'Salt-Crust Skitterer', 'beast', 1n);
const SENTINEL = enemyRow(102n, 'Brine Sentinel', 'construct', 2n);
const TOLLMAN = enemyRow(103n, 'Drowned Tollman', 'undead', 2n);

/** Region 1 (Kesterlane Basin): swamp x2, dungeon, town; enemies 102 (twice) and 101. Region 2 and 4 border it. */
function baseWorld(): Seed {
  return {
    region: [
      regionRow(1n, 'Kesterlane Basin'),
      regionRow(2n, 'Ashfall Basin', { biome: 'volcanic' }),
      regionRow(3n, 'Harrow Fen', { biome: 'swamp' }),
      regionRow(4n, 'Varrow Teeth', { biome: 'mountains' }),
      regionRow(5n, 'Dunmere Flats', { biome: 'plains' }),
      regionRow(6n, 'Trophy Hollow'),
      regionRow(7n, 'Pending Reach'),
      regionRow(8n, 'Failed Marsh'),
      regionRow(9n, 'Empty Waste', { landmarks: 'not json', threats: '{"a":1}' }),
    ],
    location: [
      locationRow(10n, 1n, 'swamp'),
      locationRow(11n, 1n, 'Swamp'),
      locationRow(12n, 1n, 'dungeon'),
      locationRow(13n, 1n, 'town', { isSafe: true }),
      locationRow(20n, 2n, 'woods'),
      locationRow(30n, 3n, 'swamp'),
      locationRow(40n, 4n, 'mountains'),
      locationRow(50n, 5n, 'plains'),
    ],
    location_connection: [
      { id: 1n, fromLocationId: 10n, toLocationId: 20n },
      { id: 2n, fromLocationId: 40n, toLocationId: 12n },
      { id: 3n, fromLocationId: 11n, toLocationId: 12n },
    ],
    location_enemy_template: [
      { id: 1n, locationId: 10n, enemyTemplateId: 102n },
      { id: 2n, locationId: 11n, enemyTemplateId: 101n },
      { id: 3n, locationId: 12n, enemyTemplateId: 102n },
      { id: 4n, locationId: 20n, enemyTemplateId: 999n },
    ],
    enemy_template: [SKITTERER, SENTINEL, TOLLMAN],
    item_template: [],
    region_economy: [],
    economy_item: [],
  };
}

/** Adds a complete economy to `regionId` with the given material rows (templates created alongside). */
function withEconomy(seed: Seed, regionId: bigint, status: string, mats: Array<[bigint, string, string, string, string]>): Seed {
  seed.region_economy.push(econRow(regionId, status));
  for (const [id, name, role, rarity, kind] of mats) {
    seed.item_template.push(itemRow(id, name, { rarity }));
    seed.economy_item.push(econItem(id, regionId, role, rarity, kind));
  }
  return seed;
}

function oneNeighbor(): Seed {
  return withEconomy(baseWorld(), 2n, 'complete', [
    [500n, 'Ember Moss', 'gather', 'uncommon', 'edible'],
    [501n, 'Ashglass Shard', 'gather', 'rare', 'trinket'],
    [502n, 'Cinder Hide', 'drop', 'common', 'hide'],
    [503n, 'Ash Hound Fang', 'trophy', 'common', 'trophy'],
  ]);
}

function fourOthers(): Seed {
  const seed = oneNeighbor();
  withEconomy(seed, 3n, 'complete', [[600n, 'Fen Reed', 'gather', 'common', 'cloth']]);
  withEconomy(seed, 4n, 'complete', [
    [700n, 'Teeth Ore', 'gather', 'common', 'metal'],
    [701n, 'Climber Moss', 'gather', 'uncommon', 'edible'],
    [702n, 'Frost Quartz', 'gather', 'rare', 'trinket'],
    [703n, 'Grit Hide', 'drop', 'common', 'hide'],
    [704n, 'Pine Resin', 'drop', 'uncommon', 'wood'],
  ]);
  withEconomy(seed, 5n, 'complete', [[800n, 'Flat Salt', 'gather', 'common', 'base']]);
  // Not candidates: only a trophy, pending, failed.
  withEconomy(seed, 6n, 'complete', [[900n, 'Hollow Skull', 'trophy', 'common', 'trophy']]);
  withEconomy(seed, 7n, 'pending', [[910n, 'Pending Herb', 'gather', 'common', 'edible']]);
  withEconomy(seed, 8n, 'failed', [[920n, 'Failed Herb', 'gather', 'common', 'edible']]);
  return seed;
}

const region = (ctx: any, id: bigint) => ctx.db.region.id.find(id);

// ---------------------------------------------------------------------------
// Task 1: buildRegionEconomyInput and readEconomyJobContext
// ---------------------------------------------------------------------------

describe('buildRegionEconomyInput: region facts', () => {
  it('copies the region facts and orders terrains by count then name (lowercase)', () => {
    const ctx = ctxFor(baseWorld());
    const input = econ.buildRegionEconomyInput(ctx, region(ctx, 1n), 'region');
    expect(input.mode).toBe('region');
    expect(input.regionId).toBe(1n);
    expect(input.regionName).toBe('Kesterlane Basin');
    expect(input.biome).toBe('coastal');
    expect(input.areaLevel).toBe(1);
    expect(input.dominantFaction).toBe('The Brine Wardens');
    expect(input.landmarks).toEqual(['Mother Pan Undercroft', 'The Salt Stair']);
    expect(input.threats).toEqual(['Crust sickness in the low pans']);
    expect(input.terrains).toEqual(['swamp', 'dungeon', 'town']);
    expect(input.existingMaterials).toEqual([]);
  });

  it('a region with no locations has terrains [plains] and no enemies', () => {
    const ctx = ctxFor(baseWorld());
    const input = econ.buildRegionEconomyInput(ctx, region(ctx, 9n), 'region');
    expect(input.terrains).toEqual(['plains']);
    expect(input.enemies).toEqual([]);
  });

  it('malformed or non-array landmarks and threats give []', () => {
    const ctx = ctxFor(baseWorld());
    const input = econ.buildRegionEconomyInput(ctx, region(ctx, 9n), 'region');
    expect(input.landmarks).toEqual([]);
    expect(input.threats).toEqual([]);
  });

  it('the area level comes from the danger multiplier', () => {
    const seed = baseWorld();
    seed.region[0] = regionRow(1n, 'Kesterlane Basin', { dangerMultiplier: 600n });
    const ctx = ctxFor(seed);
    expect(econ.buildRegionEconomyInput(ctx, region(ctx, 1n), 'region').areaLevel).toBe(6);
  });
});

describe('buildRegionEconomyInput: enemies', () => {
  it('lists the distinct enemy templates of the region, by template id, as E1, E2', () => {
    const ctx = ctxFor(baseWorld());
    const input = econ.buildRegionEconomyInput(ctx, region(ctx, 1n), 'region');
    expect(input.enemies).toEqual([
      { ref: 'E1', templateId: 101n, name: 'Salt-Crust Skitterer', creatureType: 'beast', level: 1 },
      { ref: 'E2', templateId: 102n, name: 'Brine Sentinel', creatureType: 'construct', level: 2 },
    ]);
  });
});

describe('buildRegionEconomyInput: recipe tiers and foreign offer', () => {
  it('with no other complete region: common, common, uncommon and no foreign material', () => {
    const ctx = ctxFor(baseWorld());
    const input = econ.buildRegionEconomyInput(ctx, region(ctx, 1n), 'region');
    expect(input.recipeSlots).toEqual([
      { tier: 'common', foreignRegionIndexes: [] },
      { tier: 'common', foreignRegionIndexes: [] },
      { tier: 'uncommon', foreignRegionIndexes: [] },
    ]);
    expect(input.foreignRegions).toEqual([]);
    expect(input.foreign).toEqual([]);
  });

  it('with one complete neighbor: common, uncommon, rare; the rare slot uses region 0; a trophy is never offered', () => {
    const ctx = ctxFor(oneNeighbor());
    const input = econ.buildRegionEconomyInput(ctx, region(ctx, 1n), 'region');
    expect(input.recipeSlots.map((s) => s.tier)).toEqual(['common', 'uncommon', 'rare']);
    expect(input.recipeSlots[2].foreignRegionIndexes).toEqual([0]);
    expect(input.recipeSlots[0].foreignRegionIndexes).toEqual([]);
    expect(input.foreignRegions).toEqual([{ regionId: 2n, name: 'Ashfall Basin' }]);
    expect(input.foreign).toEqual([
      { ref: 'F1', templateId: 501n, regionIndex: 0, name: 'Ashglass Shard', kind: 'trinket' },
      { ref: 'F2', templateId: 500n, regionIndex: 0, name: 'Ember Moss', kind: 'edible' },
      { ref: 'F3', templateId: 502n, regionIndex: 0, name: 'Cinder Hide', kind: 'hide' },
    ]);
    expect(input.foreign.some((f) => f.templateId === 503n)).toBe(false);
  });

  it('with four complete other regions: uncommon, epic, legendary; 3 regions neighbors first; legendary uses three distinct regions', () => {
    const ctx = ctxFor(fourOthers());
    const input = econ.buildRegionEconomyInput(ctx, region(ctx, 1n), 'region');
    expect(input.recipeSlots.map((s) => s.tier)).toEqual(['uncommon', 'epic', 'legendary']);
    expect(input.recipeSlots[1].foreignRegionIndexes).toEqual([0, 1]);
    expect(input.recipeSlots[2].foreignRegionIndexes).toEqual([0, 1, 2]);
    // Neighbors 2 and 4 first; then the rest [3, 5] rotated by 1 mod 2 = 1, so 5.
    expect(input.foreignRegions.map((r) => r.regionId)).toEqual([2n, 4n, 5n]);
    const legendaryRegions = input.recipeSlots[2].foreignRegionIndexes.map((i) => input.foreignRegions[i].regionId);
    expect(new Set(legendaryRegions).size).toBe(3);
    // Region 4 offers at most 4 of its 5 materials, rarest first.
    expect(input.foreign.filter((f) => f.regionIndex === 1).map((f) => f.templateId)).toEqual([702n, 701n, 704n, 700n]);
    expect(input.foreign.map((f) => f.ref)).toEqual(input.foreign.map((_, i) => `F${i + 1}`));
    expect(input.foreign.map((f) => f.regionIndex)).toEqual([...input.foreign].map((f) => f.regionIndex).sort());
    // Never a trophy, never region 3 (not picked), never a pending or failed region.
    expect(input.foreign.some((f) => [503n, 600n, 900n, 910n, 920n].includes(f.templateId))).toBe(false);
  });

  it('a complete region with only a trophy, a pending region and a failed region are not candidates', () => {
    const seed = baseWorld();
    withEconomy(seed, 6n, 'complete', [[900n, 'Hollow Skull', 'trophy', 'common', 'trophy']]);
    withEconomy(seed, 7n, 'pending', [[910n, 'Pending Herb', 'gather', 'common', 'edible']]);
    withEconomy(seed, 8n, 'failed', [[920n, 'Failed Herb', 'gather', 'common', 'edible']]);
    const ctx = ctxFor(seed);
    const input = econ.buildRegionEconomyInput(ctx, region(ctx, 1n), 'region');
    expect(input.recipeSlots.map((s) => s.tier)).toEqual(['common', 'common', 'uncommon']);
    expect(input.foreignRegions).toEqual([]);
  });

  it('the region itself is never its own foreign region', () => {
    const seed = oneNeighbor();
    withEconomy(seed, 1n, 'complete', [[950n, 'Own Salt', 'gather', 'common', 'base']]);
    const ctx = ctxFor(seed);
    const input = econ.buildRegionEconomyInput(ctx, region(ctx, 1n), 'region');
    expect(input.foreignRegions.map((r) => r.regionId)).toEqual([2n]);
  });

  it('regionNeighborIds walks connections in both directions', () => {
    const ctx = ctxFor(baseWorld());
    expect([...econ.regionNeighborIds(ctx, 1n)].sort()).toEqual([2n, 4n]);
    expect([...econ.regionNeighborIds(ctx, 3n)]).toEqual([]);
  });
});

describe('buildRegionEconomyInput: enemy mode', () => {
  it('returns one enemy (E1), no recipe slots and the region gather and drop materials', () => {
    const seed = baseWorld();
    withEconomy(seed, 1n, 'complete', [
      [960n, 'Panlight Salt', 'gather', 'common', 'base'],
      [961n, 'Skitter Chitin', 'drop', 'common', 'hide'],
      [962n, 'Skitterer Eyestalk', 'trophy', 'common', 'trophy'],
      [963n, 'Brinewort', 'gather', 'uncommon', 'edible'],
    ]);
    withEconomy(seed, 2n, 'complete', [[500n, 'Ember Moss', 'gather', 'uncommon', 'edible']]);
    const ctx = ctxFor(seed);
    const input = econ.buildRegionEconomyInput(ctx, region(ctx, 1n), 'enemy', TOLLMAN);
    expect(input.mode).toBe('enemy');
    expect(input.enemies).toEqual([
      { ref: 'E1', templateId: 103n, name: 'Drowned Tollman', creatureType: 'undead', level: 2 },
    ]);
    expect(input.recipeSlots).toEqual([]);
    expect(input.foreignRegions).toEqual([]);
    expect(input.foreign).toEqual([]);
    expect(input.existingMaterials).toEqual([
      { name: 'Panlight Salt', kind: 'base' },
      { name: 'Skitter Chitin', kind: 'hide' },
      { name: 'Brinewort', kind: 'edible' },
    ]);
  });
});

describe('readEconomyJobContext', () => {
  const sample = (): RegionEconomyInput => ({
    mode: 'region',
    regionId: 12345678901234567n,
    regionName: '12345',
    biome: 'coastal',
    areaLevel: 3,
    dominantFaction: '77',
    landmarks: ['42'],
    threats: [],
    terrains: ['swamp'],
    enemies: [{ ref: 'E1', templateId: 9007199254740993n, name: '8', creatureType: 'beast', level: 3 }],
    recipeSlots: [{ tier: 'rare', foreignRegionIndexes: [0] }],
    foreignRegions: [{ regionId: 22n, name: '22' }],
    foreign: [{ ref: 'F1', templateId: 33n, regionIndex: 0, name: '33', kind: 'metal' }],
    existingMaterials: [{ name: '44', kind: 'base' }],
  });

  it('round-trips an encoded input: every bigint path is revived and nothing else', () => {
    const input = sample();
    const contextJson = JSON.stringify({ regionId: '12345678901234567', mode: 'region', enemyTemplateId: '0', input: encodeRouteInput(input) });
    const c = econ.readEconomyJobContext(contextJson);
    expect(c).not.toBeNull();
    expect(c!.regionId).toBe(12345678901234567n);
    expect(c!.mode).toBe('region');
    expect(c!.enemyTemplateId).toBe(0n);
    expect(c!.input).toEqual(input);
    expect(REGION_ECONOMY_BIGINT_PATHS.length).toBe(4);
    expect(typeof c!.input.regionName).toBe('string');
    expect(typeof c!.input.areaLevel).toBe('number');
  });

  it('returns null on bad JSON, a bad mode, a bad region id or a missing input', () => {
    const input = encodeRouteInput(sample());
    expect(econ.readEconomyJobContext('not json')).toBeNull();
    expect(econ.readEconomyJobContext(undefined as any)).toBeNull();
    expect(econ.readEconomyJobContext(JSON.stringify({ regionId: '1', mode: 'other', enemyTemplateId: '0', input }))).toBeNull();
    expect(econ.readEconomyJobContext(JSON.stringify({ regionId: 'x', mode: 'region', enemyTemplateId: '0', input }))).toBeNull();
    expect(econ.readEconomyJobContext(JSON.stringify({ regionId: '1', mode: 'region', enemyTemplateId: '0' }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Task 2: the idempotent region-mode apply and the failure path
// ---------------------------------------------------------------------------

const APPLY_TABLES = ['item_template', 'recipe_template', 'economy_item', 'enemy_loot_entry', 'region_recipe'] as const;

/** Region 1 pending, ready for the region_k0 reply. */
function k0World(): Seed {
  const seed = baseWorld();
  seed.region_economy.push(econRow(1n, 'pending'));
  seed.recipe_template = [];
  seed.enemy_loot_entry = [];
  seed.region_recipe = [];
  return seed;
}

/** Varrow Teeth (14) pending, with three other complete regions (11, 12, 13) and no neighbors. */
function k3World(): Seed {
  const seed: Seed = {
    region: [
      regionRow(11n, 'Kesterlane Basin'),
      regionRow(12n, 'Ashfall Basin'),
      regionRow(13n, 'Harrow Fen'),
      regionRow(14n, 'Varrow Teeth', { dangerMultiplier: 600n, biome: 'mountains', dominantFaction: undefined, landmarks: undefined }),
    ],
    location: [locationRow(140n, 14n, 'mountains'), locationRow(141n, 14n, 'mountains'), locationRow(142n, 14n, 'woods')],
    location_connection: [],
    location_enemy_template: [{ id: 1n, locationId: 140n, enemyTemplateId: 201n }],
    enemy_template: [enemyRow(201n, 'Gritmaw Climber', 'beast', 6n)],
    item_template: [],
    region_economy: [econRow(14n, 'pending')],
    economy_item: [],
    recipe_template: [],
    enemy_loot_entry: [],
    region_recipe: [],
  };
  withEconomy(seed, 11n, 'complete', [
    [301n, 'Brinewort Crystal', 'gather', 'rare', 'trinket'],
    [302n, 'Sentinel Rivet', 'drop', 'common', 'metal'],
  ]);
  withEconomy(seed, 12n, 'complete', [
    [303n, 'Ashglass Shard', 'gather', 'uncommon', 'metal'],
    [304n, 'Ember Moss', 'gather', 'common', 'edible'],
  ]);
  withEconomy(seed, 13n, 'complete', [[305n, 'Reedsilk', 'gather', 'common', 'cloth']]);
  return seed;
}

function jobFor(input: RegionEconomyInput, mode: 'region' | 'enemy' = 'region', enemyTemplateId = 0n) {
  return {
    domain: 'region_economy',
    playerId: null,
    contextJson: JSON.stringify({
      regionId: input.regionId.toString(),
      mode,
      enemyTemplateId: enemyTemplateId.toString(),
      input: encodeRouteInput(input),
    }),
  };
}

function regionJob(ctx: any, regionId: bigint) {
  const input = econ.buildRegionEconomyInput(ctx, region(ctx, regionId), 'region');
  return { input, job: jobFor(input) };
}

const econRowOf = (ctx: any, regionId: bigint) => rows(ctx, 'region_economy').find((r: any) => r.regionId === regionId);
const slotItem = (ctx: any, slotKey: string) => {
  const tag = rows(ctx, 'economy_item').find((r: any) => r.slotKey === slotKey);
  return tag ? { tag, item: rows(ctx, 'item_template').find((t: any) => t.id === tag.itemTemplateId) } : undefined;
};
const recipeByKey = (ctx: any, key: string) => rows(ctx, 'recipe_template').find((r: any) => r.key === key);

/** Every row the apply writes has every column (seeded item templates without an origin tag are skipped). */
function expectWellFormed(ctx: any): void {
  for (const table of APPLY_TABLES) {
    for (const row of rows(ctx, table)) {
      if (table === 'item_template' && !rows(ctx, 'economy_item').some((e: any) => e.itemTemplateId === row.id)) continue;
      expect([table, recorder.rowColumnProblems(table, row)]).toEqual([table, []]);
    }
  }
  for (const row of rows(ctx, 'region_economy')) expect(recorder.rowColumnProblems('region_economy', row)).toEqual([]);
}

/** One row per slotKey and per recipe key. */
function expectNoDuplicates(ctx: any): void {
  const slotKeys = rows(ctx, 'economy_item').map((r: any) => `${r.regionId}/${r.slotKey}`);
  expect(new Set(slotKeys).size).toBe(slotKeys.length);
  const keys = rows(ctx, 'recipe_template').map((r: any) => r.key);
  expect(new Set(keys).size).toBe(keys.length);
  const metas = rows(ctx, 'region_recipe').map((r: any) => r.recipeTemplateId);
  expect(new Set(metas).size).toBe(metas.length);
}

/** A ctx whose db throws once on `table.method`, then behaves normally (pattern: breakTable). */
function throwOnce(ctx: any, table: string, method: string) {
  const real = ctx.db;
  let thrown = false;
  const db = new Proxy(real, {
    get(target, prop, receiver) {
      const handle = Reflect.get(target, prop, receiver);
      if (prop !== table) return handle;
      return new Proxy(handle, {
        get(t, p, r) {
          if (p === method && !thrown) {
            return () => {
              thrown = true;
              throw new Error(`forced failure on ${table}.${method}`);
            };
          }
          return Reflect.get(t, p, r);
        },
      });
    },
  });
  return { ...ctx, db };
}

describe('applyRegionEconomyResult: region_k0', () => {
  it('writes 3 gatherables, each creature drop, trophy, gear and loot table, 3 recipes, then status complete', () => {
    const ctx = ctxFor(k0World());
    const { job } = regionJob(ctx, 1n);
    econ.applyRegionEconomyResult(ctx, job, replyText('region_k0'));

    const gathers = ['common', 'uncommon', 'rare'].map((slot) => slotItem(ctx, `gather:${slot}`)!);
    expect(gathers.map((g) => g.item.name)).toEqual(['Panlight Salt', 'Brinewort', 'Tidemark Crystal']);
    expect(gathers.map((g) => [g.tag.role, g.tag.kind, g.tag.rarity, g.tag.terrain, g.tag.timeOfDay, g.tag.enemyTemplateId])).toEqual([
      ['gather', 'base', 'common', 'swamp', 'any', 0n],
      ['gather', 'edible', 'uncommon', 'swamp', 'any', 0n],
      ['gather', 'trinket', 'rare', 'dungeon', 'any', 0n],
    ]);
    expect(gathers.map((g) => g.item.rarity)).toEqual(['common', 'uncommon', 'rare']);

    for (const [enemyId, drop, trophy, gear, dropKind, gearSlot] of [
      [101n, 'Skitter Chitin', 'Skitterer Eyestalk', 'Crustshell Greaves', 'hide', 'legs'],
      [102n, 'Sentinel Rivet', 'Tide Bell Clapper', 'Sentinel Maul', 'metal', 'mainHand'],
    ] as const) {
      const d = slotItem(ctx, `drop:${enemyId}`)!;
      const t = slotItem(ctx, `trophy:${enemyId}`)!;
      const g = slotItem(ctx, `gear:${enemyId}`)!;
      expect([d.item.name, t.item.name, g.item.name]).toEqual([drop, trophy, gear]);
      expect([d.tag.role, d.tag.kind, d.tag.rarity, d.tag.enemyTemplateId]).toEqual(['drop', dropKind, 'common', enemyId]);
      expect([t.tag.role, t.tag.enemyTemplateId, t.item.isJunk]).toEqual(['trophy', enemyId, true]);
      expect([g.tag.role, g.tag.enemyTemplateId, g.item.slot, g.item.requiredLevel]).toEqual([
        'gear',
        enemyId,
        gearSlot,
        enemyId === 101n ? 1n : 2n,
      ]);
      const loot = rows(ctx, 'enemy_loot_entry').filter((e: any) => e.enemyTemplateId === enemyId);
      expect(loot.length).toBeGreaterThanOrEqual(4);
      expect(loot.length).toBeLessThanOrEqual(6);
      expect(loot.filter((e: any) => e.role === 'drop').map((e: any) => e.itemTemplateId)).toEqual([d.item.id]);
      expect(loot.filter((e: any) => e.role === 'trophy').map((e: any) => e.itemTemplateId)).toEqual([t.item.id]);
      expect(loot.filter((e: any) => e.role === 'gear').map((e: any) => e.itemTemplateId)).toEqual([g.item.id]);
      const gatherIds = gathers.map((x) => x.item.id);
      for (const e of loot.filter((x: any) => x.role === 'gatherable')) expect(gatherIds).toContain(e.itemTemplateId);
      for (const e of loot) expect(e.regionId).toBe(1n);
    }

    const recipes = [0, 1, 2].map((n) => recipeByKey(ctx, `region:1:r${n}`));
    expect(recipes.map((r) => r?.name)).toEqual(['Rivetbound Mace', 'Chitin Jerkin', 'Brinewort Broth']);
    const [mace, jerkin, broth] = recipes;
    expect([mace.req1TemplateId, mace.req1Count, mace.req2TemplateId, mace.req2Count]).toEqual([
      slotItem(ctx, 'drop:102')!.item.id,
      3n,
      slotItem(ctx, 'drop:101')!.item.id,
      1n,
    ]);
    expect([mace.req3TemplateId, mace.req3Count, mace.req4TemplateId, mace.req4Count]).toEqual([undefined, undefined, 0n, 0n]);
    expect([mace.recipeType, mace.materialType, mace.outputCount]).toEqual(['weapon', 'sentinel_rivet', 1n]);
    expect([jerkin.recipeType, jerkin.materialType]).toEqual(['armor', 'skitter_chitin']);
    expect([broth.recipeType, broth.materialType, broth.req2Count]).toEqual(['consumable', undefined, 2n]);
    for (const [n, r] of recipes.entries()) {
      const out = slotItem(ctx, `recipe:${n}`)!;
      expect(out.item.id).toBe(r.outputTemplateId);
      expect(out.item.name).toBe(r.name);
      expect(out.tag.role).toBe('recipe_output');
      const meta = rows(ctx, 'region_recipe').find((x: any) => x.recipeTemplateId === r.id);
      expect([meta.regionId, meta.learnBy, meta.scrollTemplateId, meta.foreignRegionIds]).toEqual([1n, 'research', 0n, '[]']);
    }
    expect(rows(ctx, 'region_recipe').map((x: any) => x.tier)).toEqual(['common', 'common', 'uncommon']);
    expect(rows(ctx, 'economy_item').some((x: any) => x.role === 'scroll')).toBe(false);

    const status = econRowOf(ctx, 1n);
    expect(status.status).toBe('complete');
    expect(status.updatedAt.microsSinceUnixEpoch).toBe(T0);
    expectWellFormed(ctx);
    expectNoDuplicates(ctx);
  });

  it('rowColumnProblems is [] for item_template, recipe_template (with req4), economy_item, enemy_loot_entry and region_recipe', () => {
    const ctx = ctxFor(k0World());
    econ.applyRegionEconomyResult(ctx, regionJob(ctx, 1n).job, replyText('region_k0'));
    expect(rows(ctx, 'recipe_template').every((r: any) => 'req4TemplateId' in r && 'req4Count' in r)).toBe(true);
    expectWellFormed(ctx);
  });

  it('a reply wrapped in prose still parses (first { to last })', () => {
    const ctx = ctxFor(k0World());
    econ.applyRegionEconomyResult(ctx, regionJob(ctx, 1n).job, `Here is the design:\n${replyText('region_k0')}\nDone.`);
    expect(econRowOf(ctx, 1n).status).toBe('complete');
    expect(rows(ctx, 'recipe_template').length).toBe(3);
  });
});

describe('applyRegionEconomyResult: region_k3 (legendary req4, scrolls)', () => {
  it('legendary req4 points at a material of foreign region index 2; epic and legendary are scroll-learned', () => {
    const ctx = ctxFor(k3World());
    const { input, job } = regionJob(ctx, 14n);
    expect(input.recipeSlots.map((s) => s.tier)).toEqual(['uncommon', 'epic', 'legendary']);
    econ.applyRegionEconomyResult(ctx, job, replyText('region_k3'));
    expect(econRowOf(ctx, 14n).status).toBe('complete');

    const legendary = recipeByKey(ctx, 'region:14:r2');
    expect(legendary.req4TemplateId > 0n).toBe(true);
    expect(legendary.req4Count).toBe(2n);
    const region2Materials = input.foreign.filter((f) => f.regionIndex === 2).map((f) => f.templateId);
    expect(region2Materials).toContain(legendary.req4TemplateId);
    expect(legendary.req1Count).toBe(4n);

    const metaOf = (r: any) => rows(ctx, 'region_recipe').find((x: any) => x.recipeTemplateId === r.id);
    for (const [n, indexes] of [
      [1, [0, 1]],
      [2, [0, 1, 2]],
    ] as const) {
      const r = recipeByKey(ctx, `region:14:r${n}`);
      const meta = metaOf(r);
      const scroll = slotItem(ctx, `scroll:${n}`)!;
      expect(scroll.item.name).toBe(`Scroll: ${r.name}`);
      expect(scroll.tag.role).toBe('scroll');
      expect([meta.learnBy, meta.scrollTemplateId, meta.tier]).toEqual(['scroll', scroll.item.id, n === 1 ? 'epic' : 'legendary']);
      expect(JSON.parse(meta.foreignRegionIds)).toEqual(indexes.map((i) => input.foreignRegions[i].regionId.toString()));
    }
    const uncommon = recipeByKey(ctx, 'region:14:r0');
    expect([metaOf(uncommon).learnBy, metaOf(uncommon).scrollTemplateId, uncommon.req4TemplateId]).toEqual(['research', 0n, 0n]);
    expect(slotItem(ctx, 'scroll:0')).toBeUndefined();
    expectWellFormed(ctx);
    expectNoDuplicates(ctx);
  });
});

describe('applyRegionEconomyResult: idempotency', () => {
  it('idempotent re-run: applying the same job a second time changes nothing', () => {
    const ctx = ctxFor(k0World());
    const { job } = regionJob(ctx, 1n);
    econ.applyRegionEconomyResult(ctx, job, replyText('region_k0'));
    const before = recorder.snapshotDb(ctx.db);
    econ.applyRegionEconomyResult(ctx, job, replyText('region_k0'));
    expect(recorder.snapshotDb(ctx.db)).toBe(before);
  });

  it('partial write then re-run: a forced throw on the first recipe insert, then a re-run, leaves one row per slot and key', () => {
    const ctx = ctxFor(k0World());
    const { job } = regionJob(ctx, 1n);
    expect(() =>
      econ.applyRegionEconomyResult(throwOnce(ctx, 'recipe_template', 'insert'), job, replyText('region_k0')),
    ).toThrow(/forced/);
    // Status complete only when every row exists.
    expect(econRowOf(ctx, 1n).status).toBe('pending');
    expect(rows(ctx, 'recipe_template').length).toBe(0);
    econ.applyRegionEconomyResult(ctx, job, replyText('region_k0'));
    expect(econRowOf(ctx, 1n).status).toBe('complete');
    expectNoDuplicates(ctx);
    expect(rows(ctx, 'economy_item').length).toBe(3 + 2 * 3 + 3);
    expect(rows(ctx, 'item_template').length).toBe(3 + 2 * 3 + 3);
    expect(rows(ctx, 'recipe_template').length).toBe(3);
    expect(rows(ctx, 'region_recipe').length).toBe(3);

    // The result equals a clean single apply on a fresh database (names stay stable on the re-run).
    const fresh = ctxFor(k0World());
    econ.applyRegionEconomyResult(fresh, regionJob(fresh, 1n).job, replyText('region_k0'));
    expect(recorder.snapshotDb(ctx.db)).toBe(recorder.snapshotDb(fresh.db));
  });

  it('partial write then re-run: a throw on the region_recipe insert still ends with one region_recipe per recipe', () => {
    const ctx = ctxFor(k3World());
    const { job } = regionJob(ctx, 14n);
    expect(() =>
      econ.applyRegionEconomyResult(throwOnce(ctx, 'region_recipe', 'insert'), job, replyText('region_k3')),
    ).toThrow(/forced/);
    econ.applyRegionEconomyResult(ctx, job, replyText('region_k3'));
    expectNoDuplicates(ctx);
    expect(rows(ctx, 'region_recipe').length).toBe(rows(ctx, 'recipe_template').length);
    const fresh = ctxFor(k3World());
    econ.applyRegionEconomyResult(fresh, regionJob(fresh, 14n).job, replyText('region_k3'));
    expect(recorder.snapshotDb(ctx.db)).toBe(recorder.snapshotDb(fresh.db));
  });

  it('the same input and reply on two fresh databases produce identical rows', () => {
    const a = ctxFor(k0World());
    const b = ctxFor(k0World());
    const { job } = regionJob(a, 1n);
    econ.applyRegionEconomyResult(a, job, replyText('region_k0'));
    econ.applyRegionEconomyResult(b, job, replyText('region_k0'));
    expect(recorder.snapshotDb(a.db)).toBe(recorder.snapshotDb(b.db));
  });

  for (const status of ['complete', 'failed', 'missing']) {
    it(`with status ${status} the apply writes nothing`, () => {
      const seed = k0World();
      seed.region_economy = status === 'missing' ? [] : [econRow(1n, status)];
      const ctx = ctxFor(seed);
      const { job } = regionJob(ctx, 1n);
      const before = recorder.snapshotDb(ctx.db);
      econ.applyRegionEconomyResult(ctx, job, replyText('region_k0'));
      expect(recorder.snapshotDb(ctx.db)).toBe(before);
    });
  }

  it('a bad stored context writes nothing', () => {
    const ctx = ctxFor(k0World());
    const before = recorder.snapshotDb(ctx.db);
    econ.applyRegionEconomyResult(ctx, { domain: 'region_economy', playerId: null, contextJson: 'nope' }, replyText('region_k0'));
    expect(recorder.snapshotDb(ctx.db)).toBe(before);
  });
});

describe('applyRegionEconomyResult: failed reply', () => {
  for (const [label, reply] of [
    ['not json', 'not json'],
    ['{}', '{}'],
    ['region null', '{ "region": null, "lateCreature": null }'],
  ]) {
    it(`failed reply (${label}) sets status failed and writes no item rows or player lines`, () => {
      const ctx = ctxFor(k0World());
      const { job } = regionJob(ctx, 1n);
      const before = JSON.parse(recorder.snapshotDb(ctx.db));
      econ.applyRegionEconomyResult(ctx, job, reply);
      const after = JSON.parse(recorder.snapshotDb(ctx.db));
      expect(econRowOf(ctx, 1n).status).toBe('failed');
      expect(econRowOf(ctx, 1n).updatedAt.microsSinceUnixEpoch).toBe(T0);
      delete before.region_economy;
      delete after.region_economy;
      expect(after).toEqual(before);
    });
  }
});

describe('applyRegionEconomyResult: names and edges', () => {
  it("a reply naming 'Ember Moss' when that template exists stores '<Region> Ember Moss'", () => {
    const seed = k0World();
    seed.item_template.push(itemRow(990n, 'ember moss'));
    const ctx = ctxFor(seed);
    const reply = JSON.parse(replyText('region_k0'));
    reply.region.gatherables.uncommon.name = 'Ember Moss';
    econ.applyRegionEconomyResult(ctx, regionJob(ctx, 1n).job, JSON.stringify(reply));
    expect(slotItem(ctx, 'gather:uncommon')!.item.name).toBe('Kesterlane Basin Ember Moss');
    expect(rows(ctx, 'item_template').filter((t: any) => t.name.toLowerCase() === 'ember moss').length).toBe(1);
  });

  it('a recipe name clashing with an existing recipe_template name is renamed', () => {
    const seed = k0World();
    seed.recipe_template.push({ id: 50n, key: 'rule:x', name: 'Rivetbound Mace', outputTemplateId: 1n, outputCount: 1n, req1TemplateId: 1n, req1Count: 1n, req2TemplateId: 1n, req2Count: 1n, req4TemplateId: 0n, req4Count: 0n });
    const ctx = ctxFor(seed);
    econ.applyRegionEconomyResult(ctx, regionJob(ctx, 1n).job, replyText('region_k0'));
    expect(recipeByKey(ctx, 'region:1:r0').name).toBe('Kesterlane Basin Rivetbound Mace');
  });

  it('a region with no enemy types gets no creatures but still writes gatherables and recipes', () => {
    const seed = k0World();
    seed.location_enemy_template = [];
    const ctx = ctxFor(seed);
    const { input, job } = regionJob(ctx, 1n);
    expect(input.enemies).toEqual([]);
    econ.applyRegionEconomyResult(ctx, job, replyText('region_k0'));
    expect(econRowOf(ctx, 1n).status).toBe('complete');
    expect(rows(ctx, 'economy_item').filter((r: any) => r.role === 'gather').length).toBe(3);
    expect(rows(ctx, 'economy_item').some((r: any) => ['drop', 'trophy', 'gear'].includes(r.role))).toBe(false);
    expect(rows(ctx, 'enemy_loot_entry')).toEqual([]);
    expect(rows(ctx, 'recipe_template').length).toBeGreaterThan(0);
    const gatherIds = rows(ctx, 'economy_item').filter((r: any) => r.role === 'gather').map((r: any) => r.itemTemplateId);
    for (const r of rows(ctx, 'recipe_template')) expect(gatherIds).toContain(r.req1TemplateId);
    expectWellFormed(ctx);
  });
});

describe('failRegionEconomy and markRegionEconomyPending', () => {
  it('failRegionEconomy turns a pending region job to failed and writes nothing else (no event rows)', () => {
    const ctx = ctxFor(k0World());
    const { job } = regionJob(ctx, 1n);
    const before = JSON.parse(recorder.snapshotDb(ctx.db));
    econ.failRegionEconomy(ctx, job);
    const after = JSON.parse(recorder.snapshotDb(ctx.db));
    expect(econRowOf(ctx, 1n).status).toBe('failed');
    expect(econRowOf(ctx, 1n).updatedAt.microsSinceUnixEpoch).toBe(T0);
    delete before.region_economy;
    delete after.region_economy;
    expect(after).toEqual(before);
  });

  it('failRegionEconomy leaves a complete row alone and ignores an enemy-mode job', () => {
    const seed = k0World();
    seed.region_economy = [econRow(1n, 'complete')];
    const ctx = ctxFor(seed);
    const input = econ.buildRegionEconomyInput(ctx, region(ctx, 1n), 'region');
    const before = recorder.snapshotDb(ctx.db);
    econ.failRegionEconomy(ctx, jobFor(input));
    expect(recorder.snapshotDb(ctx.db)).toBe(before);

    const pending = ctxFor(k0World());
    const enemyInput = econ.buildRegionEconomyInput(pending, region(pending, 1n), 'enemy', TOLLMAN);
    const pendingBefore = recorder.snapshotDb(pending.db);
    econ.failRegionEconomy(pending, jobFor(enemyInput, 'enemy', 103n));
    expect(recorder.snapshotDb(pending.db)).toBe(pendingBefore);
  });

  it('markRegionEconomyPending inserts a pending row or revives a failed one; never touches pending or complete', () => {
    const ctx = ctxFor({ region_economy: [econRow(2n, 'failed', { jobId: 5n }), econRow(3n, 'pending'), econRow(4n, 'complete')] });
    expect(econ.markRegionEconomyPending(ctx, 1n, 7n, [2n, 3n])).toBe(true);
    const inserted = econRowOf(ctx, 1n);
    expect([inserted.status, inserted.jobId, inserted.otherRegionIds]).toEqual(['pending', 7n, '["2","3"]']);
    expect(inserted.createdAt.microsSinceUnixEpoch).toBe(T0);
    expect(recorder.rowColumnProblems('region_economy', inserted)).toEqual([]);

    expect(econ.markRegionEconomyPending(ctx, 2n, 8n, '["1"]')).toBe(true);
    const revived = econRowOf(ctx, 2n);
    expect([revived.status, revived.jobId, revived.otherRegionIds]).toEqual(['pending', 8n, '["1"]']);

    const before = recorder.snapshotDb(ctx.db);
    expect(econ.markRegionEconomyPending(ctx, 3n, 9n, [])).toBe(false);
    expect(econ.markRegionEconomyPending(ctx, 4n, 9n, [])).toBe(false);
    expect(recorder.snapshotDb(ctx.db)).toBe(before);
  });
});
