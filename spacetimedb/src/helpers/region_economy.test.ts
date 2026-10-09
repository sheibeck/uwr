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
import { DEFAULT_DIALS } from '../data/economy_rules';

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
  familyId: 0n,
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
    expect(REGION_ECONOMY_BIGINT_PATHS.length).toBe(6);
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
  // Read by regionEnemyTemplates (filler members, Plan 09); seeded so two fresh databases snapshot alike.
  seed.family_member = [];
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

/** Every row the apply writes has every column (only item templates tagged to `regionId` are checked; seeds are minimal). */
function expectWellFormed(ctx: any, regionId?: bigint): void {
  const applied = (id: bigint) =>
    rows(ctx, 'economy_item').some((e: any) => e.itemTemplateId === id && (regionId === undefined || e.regionId === regionId));
  for (const table of APPLY_TABLES) {
    for (const row of rows(ctx, table)) {
      if (table === 'item_template' && !applied(row.id)) continue;
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
    expectWellFormed(ctx, 14n);
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
    // The input build only reads, but the strict mock lists every table it touched (creature_family
    // since Plan 24), so b reads the same tables before the comparison.
    regionJob(b, 1n);
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

// Review B IN-02: the stored region_economy.jobId (1n in k0World) is checked against the job's id.
describe('the job id check (review B IN-02)', () => {
  it("an older job's late result or failure changes nothing while the region waits on another job", () => {
    const ctx = ctxFor(k0World());
    const { job } = regionJob(ctx, 1n);
    const before = recorder.snapshotDb(ctx.db);
    econ.applyRegionEconomyResult(ctx, { ...job, jobId: 2n }, replyText('region_k0'));
    econ.failRegionEconomy(ctx, { ...job, jobId: 2n });
    expect(recorder.snapshotDb(ctx.db)).toBe(before);
    expect(econRowOf(ctx, 1n).status).toBe('pending');
  });

  it('the matching job applies, and a job without an id is still accepted', () => {
    const matching = ctxFor(k0World());
    econ.applyRegionEconomyResult(matching, { ...regionJob(matching, 1n).job, jobId: 1n }, replyText('region_k0'));
    expect(econRowOf(matching, 1n).status).toBe('complete');
    const failed = ctxFor(k0World());
    econ.failRegionEconomy(failed, { ...regionJob(failed, 1n).job, jobId: 1n });
    expect(econRowOf(failed, 1n).status).toBe('failed');
    const legacy = ctxFor(k0World());
    econ.applyRegionEconomyResult(legacy, regionJob(legacy, 1n).job, replyText('region_k0'));
    expect(econRowOf(legacy, 1n).status).toBe('complete');
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

// ---------------------------------------------------------------------------
// Task 3: the late-creature apply and the end-to-end loot check
// ---------------------------------------------------------------------------

/** Region 1 designed by the region_k0 reply; the Drowned Tollman (103) then moves into the town. */
function lateWorld(status: string | null = 'complete'): any {
  const ctx = ctxFor(k0World());
  econ.applyRegionEconomyResult(ctx, regionJob(ctx, 1n).job, replyText('region_k0'));
  ctx.db._tables.location_enemy_template.push({ id: 9n, locationId: 13n, enemyTemplateId: 103n });
  const row = econRowOf(ctx, 1n);
  if (status === null) ctx.db._tables.region_economy = [];
  else row.status = status;
  return ctx;
}

function lateJob(ctx: any, enemyId = 103n) {
  const template = ctx.db.enemy_template.id.find(enemyId);
  const input = econ.buildRegionEconomyInput(ctx, region(ctx, 1n), 'enemy', template);
  return { input, job: jobFor(input, 'enemy', enemyId) };
}

describe('late-creature apply', () => {
  it('with the region complete and no entries, writes the drop, trophy, gear and a 4-6 entry loot table from the region gatherables', () => {
    const ctx = lateWorld();
    const { input, job } = lateJob(ctx);
    expect(input.existingMaterials.map((m) => m.name)).toContain('Panlight Salt');
    const itemsBefore = rows(ctx, 'item_template').length;
    econ.applyRegionEconomyResult(ctx, job, replyText('late'));

    const d = slotItem(ctx, 'drop:103')!;
    const t = slotItem(ctx, 'trophy:103')!;
    const g = slotItem(ctx, 'gear:103')!;
    expect([d.item.name, t.item.name, g.item.name]).toEqual(['Tollman Brine', 'Rusted Toll Token', 'Tollkeeper Hook']);
    expect([d.tag.role, d.tag.kind, d.tag.enemyTemplateId, d.tag.regionId]).toEqual(['drop', 'base', 103n, 1n]);
    expect([t.tag.role, g.tag.role, g.item.slot, g.item.weaponType, g.item.requiredLevel]).toEqual(['trophy', 'gear', 'mainHand', 'dagger', 2n]);
    expect(rows(ctx, 'item_template').length).toBe(itemsBefore + 3);

    const loot = rows(ctx, 'enemy_loot_entry').filter((e: any) => e.enemyTemplateId === 103n);
    expect(loot.length).toBeGreaterThanOrEqual(4);
    expect(loot.length).toBeLessThanOrEqual(6);
    expect(loot.filter((e: any) => e.role === 'drop').map((e: any) => e.itemTemplateId)).toEqual([d.item.id]);
    const gatherIds = rows(ctx, 'economy_item').filter((r: any) => r.role === 'gather').map((r: any) => r.itemTemplateId);
    const gatherables = loot.filter((e: any) => e.role === 'gatherable');
    expect(gatherables.length).toBeGreaterThan(0);
    for (const e of gatherables) expect(gatherIds).toContain(e.itemTemplateId);
    expect(econRowOf(ctx, 1n).status).toBe('complete');
    expectWellFormed(ctx);
    expectNoDuplicates(ctx);
  });

  for (const status of ['pending', 'failed', null]) {
    it(`late-creature guard: with the region ${status ?? 'missing'} it writes nothing`, () => {
      const ctx = lateWorld(status);
      const { job } = lateJob(ctx);
      const before = recorder.snapshotDb(ctx.db);
      econ.applyRegionEconomyResult(ctx, job, replyText('late'));
      expect(recorder.snapshotDb(ctx.db)).toBe(before);
    });
  }

  it('late-creature guard: an enemy that already has loot entries gets nothing', () => {
    const ctx = lateWorld();
    ctx.db._tables.enemy_loot_entry.push({ id: 900n, enemyTemplateId: 103n, regionId: 1n, itemTemplateId: 1n, role: 'drop', weight: 40n });
    const { job } = lateJob(ctx);
    const before = recorder.snapshotDb(ctx.db);
    econ.applyRegionEconomyResult(ctx, job, replyText('late'));
    expect(recorder.snapshotDb(ctx.db)).toBe(before);
  });

  it('late-creature write-once: running it twice writes once', () => {
    const ctx = lateWorld();
    const { job } = lateJob(ctx);
    econ.applyRegionEconomyResult(ctx, job, replyText('late'));
    const once = recorder.snapshotDb(ctx.db);
    econ.applyRegionEconomyResult(ctx, job, replyText('late'));
    expect(recorder.snapshotDb(ctx.db)).toBe(once);
  });

  it('late-creature partial write then re-run leaves one set of rows', () => {
    const ctx = lateWorld();
    const { job } = lateJob(ctx);
    expect(() => econ.applyRegionEconomyResult(throwOnce(ctx, 'enemy_loot_entry', 'insert'), job, replyText('late'))).toThrow(/forced/);
    econ.applyRegionEconomyResult(ctx, job, replyText('late'));
    const fresh = lateWorld();
    econ.applyRegionEconomyResult(fresh, lateJob(fresh).job, replyText('late'));
    expect(recorder.snapshotDb(ctx.db)).toBe(recorder.snapshotDb(fresh.db));
    expectNoDuplicates(ctx);
  });

  for (const [label, reply] of [
    ['not json', 'not json'],
    ['{}', '{}'],
    ['lateCreature null', '{ "region": null, "lateCreature": null }'],
  ]) {
    it(`an unusable late reply (${label}) writes nothing and changes no status`, () => {
      const ctx = lateWorld();
      const { job } = lateJob(ctx);
      const before = recorder.snapshotDb(ctx.db);
      econ.applyRegionEconomyResult(ctx, job, reply);
      expect(recorder.snapshotDb(ctx.db)).toBe(before);
    });
  }

  it('failRegionEconomy on a late-creature job changes nothing', () => {
    const ctx = lateWorld();
    const { job } = lateJob(ctx);
    const before = recorder.snapshotDb(ctx.db);
    econ.failRegionEconomy(ctx, job);
    expect(recorder.snapshotDb(ctx.db)).toBe(before);
  });
});

describe('AI-table loot check: a designed enemy rolls from its written loot table', () => {
  it('after a region apply, every common pick of E1 over 50 kills is one of its AI non-gear entries, never fallback junk', async () => {
    const loot = await import('./loot');
    const seed = k0World();
    seed.item_template.push(itemRow(80n, 'Rat Tail', { slot: 'junk', isJunk: true }), itemRow(81n, 'Torn Pelt', { slot: 'junk', isJunk: true }));
    seed.named_enemy = [];
    const ctx = ctxFor(seed);
    econ.applyRegionEconomyResult(ctx, regionJob(ctx, 1n).job, replyText('region_k0'));

    const template = ctx.db.enemy_template.id.find(101n);
    const ai = rows(ctx, 'enemy_loot_entry').filter((e: any) => e.enemyTemplateId === 101n);
    const allowed = new Set(ai.filter((e: any) => e.role !== 'gear').map((e: any) => e.itemTemplateId));
    expect(allowed.size).toBeGreaterThanOrEqual(3);

    const combat = { id: 1n, locationId: 11n, createdAt: { microsSinceUnixEpoch: T0 } };
    const participants = [{ id: 1n, combatId: 1n, characterId: 1n }];
    const lc = loot.buildVictoryLootContext(ctx, combat, participants);
    const enemy = { id: 7n, enemyTemplateId: 101n, level: 1n };
    let commons = 0;
    for (let k = 0; k < 50; k += 1) {
      ctx.timestamp = { microsSinceUnixEpoch: T0 + BigInt(k) * 1_000_003n };
      for (const item of loot.rollEnemyLoot(ctx, lc, enemy, template, 1n)) {
        if (item.kind !== 'common') continue;
        commons += 1;
        expect(allowed.has(item.itemTemplateId)).toBe(true);
        expect([80n, 81n]).not.toContain(item.itemTemplateId);
      }
    }
    expect(commons).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Phase 51.3.1.1 Plan 09: filler members stay out of the economy; gatherables join the pools (D-48)
// ---------------------------------------------------------------------------

/** Two server-made filler members (110, 111) of a family whose real members are 101 and 102, linked at place 10. */
function addFillers(target: { enemy_template: any[]; location_enemy_template: any[]; family_member?: any[] }): void {
  target.enemy_template.push(
    enemyRow(110n, 'Salt-Crust Skitterer Mender', 'beast', 1n, { role: 'healer' }),
    enemyRow(111n, 'Salt-Crust Skitterer Hexer', 'beast', 1n, { role: 'caster' }),
  );
  target.location_enemy_template.push(
    { id: 50n, locationId: 10n, enemyTemplateId: 110n },
    { id: 51n, locationId: 10n, enemyTemplateId: 111n },
  );
  target.family_member = [
    ...(target.family_member ?? []),
    { id: 1n, familyId: 1n, enemyTemplateId: 101n, role: 'tank', filler: false },
    { id: 2n, familyId: 1n, enemyTemplateId: 102n, role: 'damage', filler: false },
    { id: 3n, familyId: 1n, enemyTemplateId: 110n, role: 'healer', filler: true },
    { id: 4n, familyId: 1n, enemyTemplateId: 111n, role: 'caster', filler: true },
  ];
}

describe('filler members stay out of the region economy (Plan 09, T-51.3.1.1-27)', () => {
  it('regionEnemyTemplates and the region input list exactly the 2 real members of a migrated family', () => {
    const seed = baseWorld();
    addFillers(seed as any);
    const ctx = ctxFor(seed);
    expect(econ.regionEnemyTemplates(ctx, 1n).map((t: any) => t.id)).toEqual([101n, 102n]);
    const input = econ.buildRegionEconomyInput(ctx, region(ctx, 1n), 'region');
    expect(input.enemies.map((e: any) => e.templateId)).toEqual([101n, 102n]);
  });
});

describe('applyRegionEconomyResult: gatherables join the resource pools (Plan 09, D-48)', () => {
  /** The region_k0 reply with its three gatherables on woods, swamp and town. */
  function k0ReplyOnTerrains(): string {
    const reply = JSON.parse(replyText('region_k0'));
    reply.region.gatherables.common.terrain = 'woods';
    reply.region.gatherables.uncommon.terrain = 'swamp';
    reply.region.gatherables.rare.terrain = 'town';
    return JSON.stringify(reply);
  }

  function poolWorldK0(): Seed {
    const seed = k0World();
    seed.location.push(locationRow(14n, 1n, 'woods'));
    seed.economy_dials = [{ id: 1n, ...DEFAULT_DIALS, aiEnabled: true }];
    seed.llm_job = [];
    return seed;
  }

  const gatherId = (ctx: any, rarity: string): bigint =>
    rows(ctx, 'economy_item').find((r: any) => r.regionId === 1n && r.slotKey === `gather:${rarity}`).itemTemplateId;
  const resourceRefs = (ctx: any, locationId: bigint): bigint[] =>
    rows(ctx, 'place_pool')
      .filter((p: any) => p.locationId === locationId && p.kind === 'resource')
      .map((p: any) => p.refId);

  it('each place of matching terrain gets a resource pool for its gatherable, and a rerun adds none', () => {
    const ctx = ctxFor(poolWorldK0());
    const { job } = regionJob(ctx, 1n);
    econ.applyRegionEconomyResult(ctx, job, k0ReplyOnTerrains());
    expect(econRowOf(ctx, 1n).status).toBe('complete');

    const woods = gatherId(ctx, 'common');
    const swamp = gatherId(ctx, 'uncommon');
    const town = gatherId(ctx, 'rare');
    expect(resourceRefs(ctx, 14n)).toContain(woods);
    expect(resourceRefs(ctx, 10n)).toContain(swamp);
    expect(resourceRefs(ctx, 11n)).toContain(swamp);
    expect(resourceRefs(ctx, 13n)).toContain(town);
    expect(resourceRefs(ctx, 12n)).toEqual([]);
    expect(resourceRefs(ctx, 14n)).not.toContain(swamp);
    for (const row of rows(ctx, 'place_pool')) expect(recorder.rowColumnProblems('place_pool', row)).toEqual([]);

    const before = rows(ctx, 'place_pool').length;
    econ.applyRegionEconomyResult(ctx, job, k0ReplyOnTerrains());
    expect(rows(ctx, 'place_pool')).toHaveLength(before);
  });

  it('the late-enemy follow-up enqueues nothing for filler members that joined while the job was pending', () => {
    const ctx = ctxFor(poolWorldK0());
    const { job } = regionJob(ctx, 1n);
    const alice = { toHexString: () => 'a'.repeat(64) };
    const ownedJob = { ...job, playerId: alice, contextJson: JSON.stringify({ ...JSON.parse(job.contextJson), characterId: '10' }) };
    // A migrated family's filler members appear while the region job is pending, and so does one real
    // late enemy type (the Drowned Tollman, 103), the control that the follow-up does enqueue.
    addFillers(ctx.db._tables);
    ctx.db._tables.location_enemy_template.push({ id: 52n, locationId: 12n, enemyTemplateId: 103n });
    econ.applyRegionEconomyResult(ctx, ownedJob, k0ReplyOnTerrains());
    expect(econRowOf(ctx, 1n).status).toBe('complete');
    // 101 and 102 got their loot from the reply; 110 and 111 are fillers: only 103 gets a late job.
    const late = rows(ctx, 'llm_job').filter((j: any) => j.route === 'region_economy');
    expect(late.map((j: any) => JSON.parse(j.requestJson).enemyTemplateId)).toEqual(['103']);
  });
});

// ---------------------------------------------------------------------------
// Phase 51.3.1.1 Plan 24: the job input speaks in families (D-47) and its counts come from the
// economy size constant (D-50, D-57)
// ---------------------------------------------------------------------------

/**
 * Region 1 with two families: the Skitterers (id 1: 112 damage, 111 caster filler, 101 tank, 110
 * healer filler, stored out of role order) and the Brine Sentinels (id 2: 102 damage). Region 2 has
 * a family of its own that never shows up in region 1's input.
 */
function familyWorld(): Seed {
  const seed = baseWorld();
  seed.enemy_template.push(
    enemyRow(110n, 'Skitter Tender', 'beast', 1n, { role: 'healer' }),
    enemyRow(111n, 'Skitter Saltspitter', 'beast', 1n, { role: 'caster' }),
    enemyRow(112n, 'Skitter Pincer', 'beast', 2n),
    enemyRow(201n, 'Ash Hound', 'beast', 3n),
  );
  seed.creature_family = [
    familyRow(1n, 1n, 'Salt-Crust Skitterers', 'beast'),
    familyRow(2n, 1n, 'Brine Sentinels', 'construct'),
    familyRow(3n, 2n, 'Ash Hounds', 'beast'),
  ];
  seed.family_member = [
    { id: 1n, familyId: 1n, enemyTemplateId: 112n, role: 'damage', filler: false },
    { id: 2n, familyId: 1n, enemyTemplateId: 111n, role: 'caster', filler: true },
    { id: 3n, familyId: 1n, enemyTemplateId: 101n, role: 'tank', filler: false },
    { id: 4n, familyId: 1n, enemyTemplateId: 110n, role: 'healer', filler: true },
    { id: 5n, familyId: 2n, enemyTemplateId: 102n, role: 'damage', filler: false },
    { id: 6n, familyId: 3n, enemyTemplateId: 201n, role: 'damage', filler: false },
  ];
  return seed;
}

function familyRow(id: bigint, regionId: bigint, name: string, creatureType: string) {
  return {
    id,
    regionId,
    key: `${regionId}:${creatureType}:${id}`,
    name,
    singularNoun: 'creature',
    pluralNoun: 'creatures',
    temperament: 'aggressive',
    iconKey: 'beast',
    creatureType,
    ambushVerb: 'burst',
    ambushRest: 'out of the dark',
    fitTerrains: 'swamp',
  };
}

const SKITTERERS = {
  ref: 'E1',
  familyId: 1n,
  name: 'Salt-Crust Skitterers',
  creatureType: 'beast',
  level: 1,
  members: [
    { ref: 'E1.tank', templateId: 101n, role: 'tank', name: 'Salt-Crust Skitterer' },
    { ref: 'E1.damage', templateId: 112n, role: 'damage', name: 'Skitter Pincer' },
    { ref: 'E1.support', templateId: 110n, role: 'support', name: 'Skitter Tender' },
    { ref: 'E1.caster', templateId: 111n, role: 'caster', name: 'Skitter Saltspitter' },
  ],
};

describe('buildRegionEconomyInput: families (D-47)', () => {
  it('region mode lists the region families by id, members tank, damage, support, caster (fillers included)', () => {
    const ctx = ctxFor(familyWorld());
    const input = econ.buildRegionEconomyInput(ctx, region(ctx, 1n), 'region');
    expect(input.families).toEqual([
      SKITTERERS,
      {
        ref: 'E2',
        familyId: 2n,
        name: 'Brine Sentinels',
        creatureType: 'construct',
        level: 2,
        members: [{ ref: 'E2.damage', templateId: 102n, role: 'damage', name: 'Brine Sentinel' }],
      },
    ]);
  });

  it('the family level is its lowest member level (the base member)', () => {
    const seed = familyWorld();
    seed.enemy_template = seed.enemy_template.map((t: any) => (t.id === 101n ? { ...t, level: 4n } : t));
    const ctx = ctxFor(seed);
    const input = econ.buildRegionEconomyInput(ctx, region(ctx, 1n), 'region');
    expect(input.families![0].level).toBe(1);
    seed.enemy_template = seed.enemy_template.map((t: any) => ({ ...t, level: 5n }));
    const all5 = ctxFor(seed);
    expect(econ.buildRegionEconomyInput(all5, region(all5, 1n), 'region').families![0].level).toBe(5);
  });

  it('two members of one role get numbered handles; a member whose template is gone is left out', () => {
    const seed = familyWorld();
    seed.enemy_template.push(enemyRow(113n, 'Skitter Clacker', 'beast', 1n));
    seed.family_member.push(
      { id: 7n, familyId: 1n, enemyTemplateId: 113n, role: 'damage', filler: false },
      { id: 8n, familyId: 1n, enemyTemplateId: 999n, role: 'tank', filler: false },
    );
    const ctx = ctxFor(seed);
    const fam = econ.buildRegionEconomyInput(ctx, region(ctx, 1n), 'region').families![0];
    expect(fam.members.map((m) => m.ref)).toEqual(['E1.tank', 'E1.damage', 'E1.damage2', 'E1.support', 'E1.caster']);
    expect(fam.members.map((m) => m.templateId)).toEqual([101n, 112n, 113n, 110n, 111n]);
  });

  it('a family with no living member template is left out, and the handles stay dense', () => {
    const seed = familyWorld();
    seed.creature_family.unshift(familyRow(0n, 1n, 'Gone Things', 'undead'));
    seed.family_member.push({ id: 9n, familyId: 0n, enemyTemplateId: 998n, role: 'tank', filler: false });
    const ctx = ctxFor(seed);
    const input = econ.buildRegionEconomyInput(ctx, region(ctx, 1n), 'region');
    expect(input.families!.map((f) => [f.ref, f.familyId])).toEqual([
      ['E1', 1n],
      ['E2', 2n],
    ]);
  });

  it('a region with no families has families []', () => {
    const ctx = ctxFor(baseWorld());
    expect(econ.buildRegionEconomyInput(ctx, region(ctx, 1n), 'region').families).toEqual([]);
  });

  it('region mode takes its gatherable slots and recipe tiers from the size (small today)', () => {
    const ctx = ctxFor(oneNeighbor());
    const input = econ.buildRegionEconomyInput(ctx, region(ctx, 1n), 'region');
    expect(input.gatherSlots).toEqual(['common', 'uncommon', 'rare']);
    expect(input.recipeSlots.map((s) => s.tier)).toEqual(['common', 'uncommon', 'rare']);
    expect(input.recipeSlots).toHaveLength(3);
  });

  it('region mode still lists the 51.3 enemies for the apply until the family apply ships (Plan 25)', () => {
    const ctx = ctxFor(familyWorld());
    const input = econ.buildRegionEconomyInput(ctx, region(ctx, 1n), 'region');
    expect(input.enemies.map((e) => e.templateId)).toEqual([101n, 102n]);
  });

  it("family mode lists that one family as E1 and the region's existing materials, with no slots", () => {
    const seed = familyWorld();
    withEconomy(seed, 1n, 'complete', [
      [960n, 'Panlight Salt', 'gather', 'common', 'base'],
      [961n, 'Skitter Chitin', 'drop', 'common', 'hide'],
      [962n, 'Skitterer Eyestalk', 'trophy', 'common', 'trophy'],
    ]);
    const ctx = ctxFor(seed);
    const family = ctx.db.creature_family.id.find(2n);
    const input = econ.buildRegionEconomyInput(ctx, region(ctx, 1n), 'family', family);
    expect(input.mode).toBe('family');
    expect(input.families).toEqual([
      {
        ref: 'E1',
        familyId: 2n,
        name: 'Brine Sentinels',
        creatureType: 'construct',
        level: 2,
        members: [{ ref: 'E1.damage', templateId: 102n, role: 'damage', name: 'Brine Sentinel' }],
      },
    ]);
    expect(input.enemies).toEqual([]);
    expect(input.gatherSlots).toEqual([]);
    expect(input.recipeSlots).toEqual([]);
    expect(input.foreignRegions).toEqual([]);
    expect(input.foreign).toEqual([]);
    expect(input.existingMaterials).toEqual([
      { name: 'Panlight Salt', kind: 'base' },
      { name: 'Skitter Chitin', kind: 'hide' },
    ]);
  });

  it('a stored family input round-trips through readEconomyJobContext with every bigint intact', () => {
    const ctx = ctxFor(familyWorld());
    const input = econ.buildRegionEconomyInput(ctx, region(ctx, 1n), 'region');
    const contextJson = JSON.stringify({ regionId: '1', mode: 'region', enemyTemplateId: '0', input: encodeRouteInput(input) });
    const c = econ.readEconomyJobContext(contextJson);
    expect(c!.input).toEqual(input);
    expect(c!.input.families![0].familyId).toBe(1n);
    expect(c!.input.families![0].members[0].templateId).toBe(101n);
  });

  it('a family-mode job context is read with its family id', () => {
    const ctx = ctxFor(familyWorld());
    const input = econ.buildRegionEconomyInput(ctx, region(ctx, 1n), 'family', ctx.db.creature_family.id.find(1n));
    const contextJson = JSON.stringify({ regionId: '1', mode: 'family', familyId: '1', input: encodeRouteInput(input) });
    const c = econ.readEconomyJobContext(contextJson);
    expect(c).not.toBeNull();
    expect(c!.mode).toBe('family');
    expect(c!.familyId).toBe(1n);
    expect(c!.enemyTemplateId).toBe(0n);
    expect(c!.input).toEqual(input);
    expect(econ.readEconomyJobContext(JSON.stringify({ regionId: '1', mode: 'family', familyId: 'x', input: encodeRouteInput(input) }))).toBeNull();
  });

  it('a family-mode result is not applied by the 51.3 apply (Plan 25 owns it)', () => {
    const seed = familyWorld();
    seed.region_economy.push(econRow(1n, 'complete'));
    const ctx = ctxFor(seed);
    const input = econ.buildRegionEconomyInput(ctx, region(ctx, 1n), 'family', ctx.db.creature_family.id.find(1n));
    const contextJson = JSON.stringify({ regionId: '1', mode: 'family', familyId: '1', input: encodeRouteInput(input) });
    const before = APPLY_TABLES.map((t) => rows(ctx, t).length);
    econ.applyRegionEconomyResult(ctx, { domain: 'region_economy', contextJson }, replyText('late'));
    expect(APPLY_TABLES.map((t) => rows(ctx, t).length)).toEqual(before);
  });
});
