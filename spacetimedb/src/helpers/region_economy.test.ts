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
