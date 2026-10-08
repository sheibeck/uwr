import { describe, it, expect } from 'vitest';
// The tsconfig has no @types/node; vitest runs the file in Node, so the built-ins resolve at runtime.
// @ts-ignore
import { readFileSync } from 'node:fs';
// @ts-ignore
import { join } from 'node:path';
// @ts-ignore
import { fileURLToPath } from 'node:url';
import {
  validateLateCreature,
  validateRegionEconomyReply,
  type ValidatedCreature,
  type ValidatedRecipe,
  type ValidatedRegionEconomy,
} from './region_economy_validate';
import { RESERVED_ITEM_NAMES, nameKey, regionalRequirementPlan, type RegionEconomyInput } from '../data/economy_design_rules';

const FIXTURE_DIR = fileURLToPath(new URL('./__fixtures__/economy/', import.meta.url));

function loadReply(name: string): any {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, `${name}.reply.json`), 'utf8'));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

const never = () => false;

/** Kesterlane Basin: no other region has an economy yet (k = 0). */
function inputK0(over: Partial<RegionEconomyInput> = {}): RegionEconomyInput {
  return {
    mode: 'region',
    regionId: 11n,
    regionName: 'Kesterlane Basin',
    biome: 'coastal',
    areaLevel: 1,
    dominantFaction: 'The Brine Wardens',
    landmarks: ['Mother Pan Undercroft', 'The Salt Stair'],
    threats: ['Crust sickness in the low pans'],
    terrains: ['swamp', 'dungeon', 'town'],
    enemies: [
      { ref: 'E1', templateId: 101n, name: 'Salt-Crust Skitterer', creatureType: 'beast', level: 1 },
      { ref: 'E2', templateId: 102n, name: 'Brine Sentinel', creatureType: 'construct', level: 1 },
    ],
    recipeSlots: [
      { tier: 'common', foreignRegionIndexes: [] },
      { tier: 'common', foreignRegionIndexes: [] },
      { tier: 'uncommon', foreignRegionIndexes: [] },
    ],
    foreignRegions: [],
    foreign: [],
    existingMaterials: [],
    ...over,
  };
}

/** Varrow Teeth: three other regions have an economy (k = 3). */
function inputK3(over: Partial<RegionEconomyInput> = {}): RegionEconomyInput {
  return {
    mode: 'region',
    regionId: 14n,
    regionName: 'Varrow Teeth',
    biome: 'mountains',
    areaLevel: 6,
    dominantFaction: 'unknown',
    landmarks: [],
    threats: ['Rockfalls on the north face'],
    terrains: ['mountains', 'woods'],
    enemies: [{ ref: 'E1', templateId: 201n, name: 'Gritmaw Climber', creatureType: 'beast', level: 6 }],
    recipeSlots: [
      { tier: 'uncommon', foreignRegionIndexes: [] },
      { tier: 'epic', foreignRegionIndexes: [0, 1] },
      { tier: 'legendary', foreignRegionIndexes: [0, 1, 2] },
    ],
    foreignRegions: [
      { regionId: 11n, name: 'Kesterlane Basin' },
      { regionId: 12n, name: 'Ashfall Basin' },
      { regionId: 13n, name: 'Harrow Fen' },
    ],
    foreign: [
      { ref: 'F1', templateId: 301n, regionIndex: 0, name: 'Brinewort Crystal', kind: 'trinket' },
      { ref: 'F2', templateId: 302n, regionIndex: 0, name: 'Sentinel Rivet', kind: 'metal' },
      { ref: 'F3', templateId: 303n, regionIndex: 1, name: 'Ashglass Shard', kind: 'metal' },
      { ref: 'F4', templateId: 304n, regionIndex: 1, name: 'Ember Moss', kind: 'edible' },
      { ref: 'F5', templateId: 305n, regionIndex: 2, name: 'Reedsilk', kind: 'cloth' },
    ],
    existingMaterials: [],
    ...over,
  };
}

function mustPlan(plan: ValidatedRegionEconomy | null): ValidatedRegionEconomy {
  if (plan === null) throw new Error('expected a plan, got null');
  return plan;
}

function recipeAt(plan: ValidatedRegionEconomy, index: number): ValidatedRecipe {
  const recipe = plan.recipes.find((r) => r.index === index);
  if (!recipe) throw new Error(`no recipe at index ${index}`);
  return recipe;
}

const refs = (recipe: ValidatedRecipe) => recipe.requirements.map((r) => r.ref);
const foreignRegionOf = (input: RegionEconomyInput, ref: string) => input.foreign.find((f) => f.ref === ref)?.regionIndex;

function expectCounts(recipe: ValidatedRecipe): void {
  const p = regionalRequirementPlan(recipe.tier);
  const expected: bigint[] = [p.primaryCount];
  if (p.localSecondaryCount !== null) expected.push(p.localSecondaryCount);
  for (let i = 0; i < p.foreignCount; i++) expected.push(p.foreignEach);
  expect(recipe.requirements.map((r) => r.count)).toEqual(expected);
}

describe('validateRegionEconomyReply: region_k0 (no other regions)', () => {
  const input = inputK0();
  const plan = mustPlan(validateRegionEconomyReply(input, loadReply('region_k0'), never));

  it('keeps three gatherables G1-G3 for common, uncommon and rare', () => {
    expect(plan.gatherables.map((g) => [g.slot, g.ref])).toEqual([
      ['common', 'G1'],
      ['uncommon', 'G2'],
      ['rare', 'G3'],
    ]);
    expect(plan.gatherables.map((g) => g.name)).toEqual(['Panlight Salt', 'Brinewort', 'Tidemark Crystal']);
    expect(plan.gatherables.map((g) => g.kind)).toEqual(['base', 'edible', 'trinket']);
    expect(plan.gatherables.map((g) => g.terrain)).toEqual(['swamp', 'swamp', 'dungeon']);
  });

  it('keeps two creatures with their template ids and repaired gear', () => {
    expect(plan.creatures.map((c) => [c.enemyRef, c.enemyTemplateId])).toEqual([
      ['E1', 101n],
      ['E2', 102n],
    ]);
    expect(plan.creatures[0].drop).toEqual({
      name: 'Skitter Chitin',
      kind: 'hide',
      description: "Plates of salt-hardened shell pried from a skitterer's back. They flex without cracking.",
    });
    expect(plan.creatures[0].gear).toMatchObject({ slot: 'legs', weaponType: 'none', armorType: 'leather' });
    expect(plan.creatures[1].gear).toMatchObject({ name: 'Sentinel Maul', slot: 'weapon', weaponType: 'mace', armorType: 'none' });
  });

  it('keeps three recipes, each with 2 local requirements and counts from regionalRequirementPlan', () => {
    expect(plan.recipes.map((r) => [r.index, r.tier, r.category])).toEqual([
      [0, 'common', 'weapon'],
      [1, 'common', 'armor'],
      [2, 'uncommon', 'consumable'],
    ]);
    for (const recipe of plan.recipes) {
      expect(recipe.requirements).toHaveLength(2);
      for (const ref of refs(recipe)) expect(ref).toMatch(/^(G[1-3]|D:E[12])$/);
      expectCounts(recipe);
    }
    expect(refs(recipeAt(plan, 0))).toEqual(['D:E2', 'D:E1']);
    expect(refs(recipeAt(plan, 1))).toEqual(['D:E1', 'G1']);
    expect(refs(recipeAt(plan, 2))).toEqual(['G2', 'G1']);
    expect(recipeAt(plan, 2).requirements.map((r) => r.count)).toEqual([3n, 2n]);
  });
});

describe('validateRegionEconomyReply: region_k3 (three other regions)', () => {
  const input = inputK3();
  const plan = mustPlan(validateRegionEconomyReply(input, loadReply('region_k3'), never));

  it('the epic recipe has exactly one F per region 0 and 1', () => {
    const epic = recipeAt(plan, 1);
    expect(epic.tier).toBe('epic');
    expect(refs(epic)).toEqual(['G1', 'F1', 'F3']);
    const foreign = refs(epic).filter((r) => r.startsWith('F'));
    expect(foreign.map((r) => foreignRegionOf(input, r))).toEqual([0, 1]);
    expectCounts(epic);
  });

  it('the legendary recipe has exactly 4 requirements and 3 distinct foreign regions', () => {
    const legendary = recipeAt(plan, 2);
    expect(legendary.tier).toBe('legendary');
    expect(legendary.requirements).toHaveLength(4);
    expect(refs(legendary)).toEqual(['G3', 'F2', 'F4', 'F5']);
    const regions = new Set(refs(legendary).filter((r) => r.startsWith('F')).map((r) => foreignRegionOf(input, r)));
    expect([...regions].sort()).toEqual([0, 1, 2]);
    expectCounts(legendary);
  });

  it('no common or uncommon recipe has an F ref', () => {
    for (const recipe of plan.recipes) {
      if (recipe.tier === 'common' || recipe.tier === 'uncommon') {
        expect(refs(recipe).some((r) => r.startsWith('F'))).toBe(false);
      }
    }
    expect(refs(recipeAt(plan, 0))).toEqual(['D:E1', 'G1']);
  });
});

describe('validateRegionEconomyReply: recipe repair', () => {
  it('a recipe that lists only foreign handles gets a local primary by rule', () => {
    const input = inputK3();
    const reply = loadReply('region_k3');
    reply.region.recipes.second.materials = ['F3', 'F1'];
    const epic = recipeAt(mustPlan(validateRegionEconomyReply(input, reply, never)), 1);
    expect(refs(epic)[0]).toBe('G1');
    expect(epic.category).toBe('weapon');
    expect(refs(epic)).toEqual(['G1', 'F1', 'F3']);
  });

  // Review B WR-01: the model's category wins whenever any local can serve it; the listed handles are
  // searched first, then every local of the region.
  it('a weapon recipe that lists only hide keeps weapon when the region has a metal: that metal is the primary', () => {
    const reply = loadReply('region_k0');
    reply.region.recipes.first.materials = ['D:E1', 'G1'];
    const first = recipeAt(mustPlan(validateRegionEconomyReply(inputK0(), reply, never)), 0);
    expect(first.category).toBe('weapon');
    expect(first.name).toBe('Rivetbound Mace');
    expect(refs(first)).toEqual(['D:E2', 'D:E1']);
  });

  it('a weapon recipe in a region with no metal at all becomes armor, with the rule name and rule description', () => {
    const reply = loadReply('region_k0');
    reply.region.creatures = reply.region.creatures.filter((c: any) => c.enemy === 'E1');
    reply.region.recipes.first.materials = ['D:E1', 'G1'];
    const first = recipeAt(mustPlan(validateRegionEconomyReply(inputK0(), reply, never)), 0);
    expect(first.category).toBe('armor');
    expect(refs(first)).toEqual(['D:E1', 'G1']);
    expect(first.name).toBe('Kesterlane Basin Jerkin');
    expect(first.description).toBe('');
  });

  it('a consumable that lists no edible keeps consumable and its name when an edible local exists elsewhere', () => {
    const reply = loadReply('region_k0');
    reply.region.recipes.third.materials = ['G1', 'G3'];
    const third = recipeAt(mustPlan(validateRegionEconomyReply(inputK0(), reply, never)), 2);
    expect(third.category).toBe('consumable');
    expect(third.name).toBe('Brinewort Broth');
    expect(refs(third)[0]).toBe('G2');
  });

  it('an invalid category is derived from the primary kind', () => {
    const reply = loadReply('region_k0');
    reply.region.recipes.third.category = 'ring';
    reply.region.recipes.third.materials = ['G3', 'G1'];
    const third = recipeAt(mustPlan(validateRegionEconomyReply(inputK0(), reply, never)), 2);
    expect(third.category).toBe('accessory');
  });

  it('a recipe whose model list names an F handle under a common or uncommon tier keeps no F handle', () => {
    const uncommonReply = loadReply('region_k3');
    uncommonReply.region.recipes.first.materials = ['F1', 'D:E1', 'F3', 'G1'];
    const uncommon = recipeAt(mustPlan(validateRegionEconomyReply(inputK3(), uncommonReply, never)), 0);
    expect(refs(uncommon)).toEqual(['D:E1', 'G1']);

    const commonInput = inputK3({
      recipeSlots: [
        { tier: 'common', foreignRegionIndexes: [0] },
        { tier: 'epic', foreignRegionIndexes: [0, 1] },
        { tier: 'legendary', foreignRegionIndexes: [0, 1, 2] },
      ],
    });
    const common = recipeAt(mustPlan(validateRegionEconomyReply(commonInput, uncommonReply, never)), 0);
    expect(common.tier).toBe('common');
    expect(refs(common).some((r) => r.startsWith('F'))).toBe(false);
    expectCounts(common);
  });

  it('an epic recipe that names only region 0 gets the first offered material of region 1 added', () => {
    const reply = loadReply('region_k3');
    reply.region.recipes.second.materials = ['G1', 'F2', 'F1'];
    const epic = recipeAt(mustPlan(validateRegionEconomyReply(inputK3(), reply, never)), 1);
    expect(refs(epic)).toEqual(['G1', 'F2', 'F3']);
  });

  it('a legendary recipe that names two materials of region 2 keeps only the first', () => {
    const input = inputK3();
    input.foreign.push({ ref: 'F6', templateId: 306n, regionIndex: 2, name: 'Fen Lantern Glass', kind: 'trinket' });
    const reply = loadReply('region_k3');
    reply.region.recipes.third.materials = ['G3', 'F6', 'F1', 'F5', 'F3'];
    const legendary = recipeAt(mustPlan(validateRegionEconomyReply(input, reply, never)), 2);
    expect(refs(legendary)).toEqual(['G3', 'F1', 'F3', 'F6']);
    expect(legendary.requirements).toHaveLength(4);
  });

  it('unknown and duplicate material handles are dropped; handles are normalised', () => {
    const reply = loadReply('region_k0');
    reply.region.recipes.second.materials = ['G9', ' d:e1 ', 'D:E1', 'X', 'g1'];
    const second = recipeAt(mustPlan(validateRegionEconomyReply(inputK0(), reply, never)), 1);
    expect(refs(second)).toEqual(['D:E1', 'G1']);
  });

  it('a recipe is skipped when its slot is missing and dropped when no local primary is possible', () => {
    const shortInput = inputK0({ recipeSlots: [{ tier: 'common', foreignRegionIndexes: [] }] });
    const short = mustPlan(validateRegionEconomyReply(shortInput, loadReply('region_k0'), never));
    expect(short.recipes.map((r) => r.index)).toEqual([0]);

    const reply = loadReply('region_k0');
    reply.region.creatures = [];
    for (const slot of ['common', 'uncommon', 'rare']) reply.region.gatherables[slot].kind = 'wood';
    const none = mustPlan(validateRegionEconomyReply(inputK0(), reply, never));
    expect(none.recipes).toEqual([]);
    expect(none.gatherables).toHaveLength(3);
  });

  it('a rare recipe whose required region has no offer is dropped', () => {
    const input = inputK3({
      recipeSlots: [
        { tier: 'uncommon', foreignRegionIndexes: [] },
        { tier: 'rare', foreignRegionIndexes: [0] },
        { tier: 'legendary', foreignRegionIndexes: [0, 1, 2] },
      ],
      foreign: [{ ref: 'F1', templateId: 301n, regionIndex: 0, name: 'Brinewort Crystal', kind: 'trinket' }],
    });
    const plan = mustPlan(validateRegionEconomyReply(input, loadReply('region_k3'), never));
    expect(plan.recipes.map((r) => r.index)).toEqual([0, 1]);
    expect(refs(recipeAt(plan, 1))).toEqual(['G1', 'D:E1', 'F1']);
    expectCounts(recipeAt(plan, 1));
  });
});

/** The live job 8206 input (local uwr, region 1): G1 base, G2 cloth, G3 trinket, D:E1 hide, D:E2 and D:E3 metal. */
function inputLive(): RegionEconomyInput {
  return {
    mode: 'region',
    regionId: 1n,
    regionName: 'Kesterlane Basin',
    biome: 'desert',
    areaLevel: 1,
    dominantFaction: 'The Lampwrights of Orrin Sill',
    landmarks: [],
    threats: [],
    terrains: ['dungeon', 'plains', 'swamp', 'town', 'woods'],
    enemies: [
      { ref: 'E1', templateId: 1n, name: 'Salt-Crust Skitterer', creatureType: 'beast', level: 1 },
      { ref: 'E2', templateId: 2n, name: 'Glass Orchard Wisp', creatureType: 'elemental', level: 1 },
      { ref: 'E3', templateId: 3n, name: 'Brine Sentinel', creatureType: 'construct', level: 1 },
    ],
    recipeSlots: [
      { tier: 'common', foreignRegionIndexes: [] },
      { tier: 'common', foreignRegionIndexes: [] },
      { tier: 'uncommon', foreignRegionIndexes: [] },
    ],
    foreignRegions: [],
    foreign: [],
    existingMaterials: [],
  };
}

describe('validateRegionEconomyReply: the live job 8206 reply (review B WR-01)', () => {
  const plan = () => mustPlan(validateRegionEconomyReply(inputLive(), loadReply('kesterlane_live'), never));

  it('"Salted Wayfarer Jerky" (consumable, no edible in the region) becomes armor named and described by rule', () => {
    const first = recipeAt(plan(), 0);
    expect(first.category).toBe('armor');
    expect(refs(first)).toEqual(['D:E1', 'G1']);
    expect(first.name).toBe('Kesterlane Basin Jerkin');
    expect(first.description).toBe('');
  });

  it('"Wickthread Sash" (armor, cloth listed first) keeps the name and description of the model', () => {
    const second = recipeAt(plan(), 1);
    expect(second.category).toBe('armor');
    expect(second.name).toBe('Wickthread Sash');
    expect(second.description).toContain('woven sash');
    expect(refs(second)).toEqual(['G2', 'G1']);
  });

  it('"Orchard Glow Pendant" (accessory, trinket first) is kept as it is', () => {
    const third = recipeAt(plan(), 2);
    expect(third.category).toBe('accessory');
    expect(third.name).toBe('Orchard Glow Pendant');
    expect(refs(third)[0]).toBe('G3');
  });
});

describe('validateRegionEconomyReply: creatures, terrain and names', () => {
  it('an unknown enemy handle and a second E1 are ignored; a missing E2 stays out of the plan', () => {
    const reply = loadReply('region_k0');
    const [e1] = reply.region.creatures;
    const unknown = { ...clone(e1), enemy: 'E9' };
    const second = clone(e1);
    second.drop.name = 'Second Chitin';
    reply.region.creatures = [unknown, e1, second];
    const plan = mustPlan(validateRegionEconomyReply(inputK0(), reply, never));
    expect(plan.creatures.map((c) => c.enemyRef)).toEqual(['E1']);
    expect(plan.creatures[0].drop.name).toBe('Skitter Chitin');
    // D:E2 is no longer a local handle, so the first recipe falls back to the rule primary.
    expect(refs(recipeAt(plan, 0))).not.toContain('D:E2');
  });

  it("gatherable terrain outside the region becomes the region's first terrain", () => {
    const reply = loadReply('region_k0');
    reply.region.gatherables.common.terrain = 'city';
    const plan = mustPlan(validateRegionEconomyReply(inputK0({ terrains: ['swamp', 'dungeon'] }), reply, never));
    expect(plan.gatherables[0].terrain).toBe('swamp');
    expect(plan.gatherables[2].terrain).toBe('dungeon');
    const empty = mustPlan(validateRegionEconomyReply(inputK0({ terrains: [] }), reply, never));
    expect(empty.gatherables.map((g) => g.terrain)).toEqual(['plains', 'plains', 'plains']);
  });

  it('invalid kinds are repaired: gatherables to base, drops to hide', () => {
    const reply = loadReply('region_k0');
    reply.region.gatherables.rare.kind = 'gold';
    reply.region.creatures[1].drop.kind = 'gold';
    const plan = mustPlan(validateRegionEconomyReply(inputK0(), reply, never));
    expect(plan.gatherables[2].kind).toBe('base');
    expect(plan.creatures[1].drop.kind).toBe('hide');
  });

  it('names are unique across the whole reply and against isTaken; descriptions are cleaned', () => {
    const reply = loadReply('region_k0');
    reply.region.creatures[0].drop.name = 'PANLIGHT  salt';
    reply.region.recipes.third.name = 'Panlight Salt';
    reply.region.gatherables.uncommon.description = 'A <b>bitter</b> weed [link] {{color}}.';
    const takenNames = new Set(['tidemark crystal']);
    const plan = mustPlan(
      validateRegionEconomyReply(inputK0(), reply, (name) => takenNames.has(name.toLowerCase())),
    );
    const names = [
      ...plan.gatherables.map((g) => g.name),
      ...plan.creatures.flatMap((c) => [c.drop.name, c.trophy.name, c.gear.name]),
      ...plan.recipes.map((r) => r.name),
    ];
    const keys = names.map((n) => n.toLowerCase().replace(/\s+/g, ' '));
    expect(new Set(keys).size).toBe(keys.length);
    expect(plan.gatherables[2].name).toBe('Kesterlane Basin Tidemark Crystal');
    expect(plan.creatures[0].drop.name).toBe('Kesterlane Basin PANLIGHT salt');
    expect(recipeAt(plan, 2).name).toBe('Kesterlane Basin Panlight Salt 2');
    expect(plan.gatherables[1].description).toBe('A bbitter/b weed link color.');
  });

  it('an empty gatherable description gets a rule description', () => {
    const reply = loadReply('region_k0');
    reply.region.gatherables.common.description = '<>[]';
    const plan = mustPlan(validateRegionEconomyReply(inputK0(), reply, never));
    expect(plan.gatherables[0].description.length).toBeGreaterThan(0);
    expect(plan.gatherables[0].description).not.toMatch(/[[\]{}<>]/);
  });
});

// ---------------------------------------------------------------------------
// Late creature mode, hostile replies and the no-number guarantee (Task 3)
// ---------------------------------------------------------------------------

/** Late-creature mode: the region is designed, one enemy type arrived later. */
function inputLate(over: Partial<RegionEconomyInput> = {}): RegionEconomyInput {
  return inputK0({
    mode: 'enemy',
    enemies: [{ ref: 'E1', templateId: 401n, name: 'Drowned Tollman', creatureType: 'undead', level: 2 }],
    recipeSlots: [],
    existingMaterials: [
      { name: 'Panlight Salt', kind: 'base' },
      { name: 'Skitter Chitin', kind: 'hide' },
    ],
    ...over,
  });
}

function mustCreature(creature: ValidatedCreature | null): ValidatedCreature {
  if (creature === null) throw new Error('expected a creature, got null');
  return creature;
}

/** Adds numeric (and one nested) extra keys to every object of a reply. */
function withExtraNumbers(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withExtraNumbers);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = withExtraNumbers(v);
    return { ...out, price: 9999, level: 99, weight: 500, count: 7, stats: { str: 40, armorClass: 12, chance: 100 } };
  }
  return value;
}

function creatureNames(c: ValidatedCreature): string[] {
  return [c.drop.name, c.trophy.name, c.gear.name];
}

function creatureDescriptions(c: ValidatedCreature): string[] {
  return [c.drop.description, c.trophy.description, c.gear.description];
}

function allNames(plan: ValidatedRegionEconomy): string[] {
  return [...plan.gatherables.map((g) => g.name), ...plan.creatures.flatMap(creatureNames), ...plan.recipes.map((r) => r.name)];
}

function allDescriptions(plan: ValidatedRegionEconomy): string[] {
  return [
    ...plan.gatherables.map((g) => g.description),
    ...plan.creatures.flatMap(creatureDescriptions),
    ...plan.recipes.map((r) => r.description),
  ];
}

function expectSafeName(name: string): void {
  expect(name).not.toMatch(/[[\]{}<>:]/);
  // No digit except a trailing uniqueness numeral (' 2', ' 3', ...).
  expect(name).toMatch(/^[^0-9]*( [2-9]| [1-9][0-9]+)?$/);
  expect(name).not.toMatch(/^scroll/i);
  expect(RESERVED_ITEM_NAMES.has(nameKey(name))).toBe(false);
  expect(name.length).toBeGreaterThan(1);
}

function expectSafeDescription(description: string): void {
  expect(description).not.toMatch(/[[\]{}<>]/);
  expect(description.length).toBeLessThanOrEqual(240);
}

/** The path of every number or bigint in a value. */
function numericPaths(value: unknown, path = ''): string[] {
  if (typeof value === 'number' || typeof value === 'bigint') return [path];
  if (Array.isArray(value)) return value.flatMap((v, i) => numericPaths(v, `${path}[${i}]`));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
      numericPaths(v, path === '' ? k : `${path}.${k}`),
    );
  }
  return [];
}

/**
 * The only numeric values in a plan are ones the server chose: a recipe's slot index (the input
 * slot position), the requirement counts (regionalRequirementPlan for the tier) and the enemy
 * template id (from the input). Nothing numeric comes from the reply.
 */
function expectOnlyServerNumbers(plan: ValidatedRegionEconomy, input: RegionEconomyInput): void {
  const allowed = /^(recipes\[\d+\]\.index|recipes\[\d+\]\.requirements\[\d+\]\.count|creatures\[\d+\]\.enemyTemplateId)$/;
  for (const path of numericPaths(plan)) expect(path).toMatch(allowed);
  for (const recipe of plan.recipes) {
    expect([0, 1, 2]).toContain(recipe.index);
    expect(recipe.tier).toBe(input.recipeSlots[recipe.index].tier);
    for (const req of recipe.requirements) expect(typeof req.count).toBe('bigint');
    expectCounts(recipe);
  }
  for (const c of plan.creatures) {
    expect(c.enemyTemplateId).toBe(input.enemies.find((e) => e.ref === c.enemyRef)?.templateId);
  }
}

describe('validateLateCreature', () => {
  it('late.reply.json in enemy mode validates to one creature for E1', () => {
    const creature = mustCreature(validateLateCreature(inputLate(), loadReply('late'), never));
    expect(creature.enemyRef).toBe('E1');
    expect(creature.enemyTemplateId).toBe(401n);
    expect(creature.drop).toMatchObject({ name: 'Tollman Brine', kind: 'base' });
    expect(creature.trophy.name).toBe('Rusted Toll Token');
    expect(creature.gear).toMatchObject({ name: 'Tollkeeper Hook', slot: 'weapon', weaponType: 'dagger', armorType: 'none' });
  });

  it('returns null when lateCreature is null, missing or not an object', () => {
    for (const reply of [{ region: null, lateCreature: null }, { region: null }, { lateCreature: 'E1' }, { lateCreature: [] }]) {
      expect(validateLateCreature(inputLate(), reply, never)).toBeNull();
    }
  });

  it('a missing or wrong enemy field is repaired to the single listed enemy', () => {
    for (const enemy of [undefined, 'E2', 'E9', '', 7]) {
      const reply = loadReply('late');
      if (enemy === undefined) delete reply.lateCreature.enemy;
      else reply.lateCreature.enemy = enemy;
      expect(mustCreature(validateLateCreature(inputLate(), reply, never)).enemyRef).toBe('E1');
    }
  });

  it('with more than one listed enemy an unknown enemy returns null and a known one is kept', () => {
    const input = inputLate({ enemies: inputK0().enemies });
    const reply = loadReply('late');
    reply.lateCreature.enemy = 'E9';
    expect(validateLateCreature(input, reply, never)).toBeNull();
    reply.lateCreature.enemy = 'e2';
    expect(mustCreature(validateLateCreature(input, reply, never)).enemyTemplateId).toBe(102n);
    expect(validateLateCreature(inputLate({ enemies: [] }), loadReply('late'), never)).toBeNull();
  });

  it('names are unique within the creature and against isTaken', () => {
    const reply = loadReply('late');
    reply.lateCreature.trophy.name = 'tollman  BRINE';
    const creature = mustCreature(
      validateLateCreature(inputLate(), reply, (name) => name.toLowerCase() === 'tollkeeper hook'),
    );
    expect(creature.trophy.name).toBe('Kesterlane Basin tollman BRINE');
    expect(creature.gear.name).toBe('Kesterlane Basin Tollkeeper Hook');
  });
});

describe('hostile reply', () => {
  it('the hostile reply is handled without throwing and yields only safe names and descriptions (region mode)', () => {
    const input = inputK0();
    const plan = mustPlan(validateRegionEconomyReply(input, loadReply('hostile'), never));
    for (const name of allNames(plan)) expectSafeName(name);
    for (const description of allDescriptions(plan)) expectSafeDescription(description);
    expect(plan.creatures.map((c) => c.enemyRef)).toEqual(['E1', 'E2']);
    expect(plan.gatherables[0]).toMatchObject({ kind: 'base', terrain: 'swamp', name: 'Kesterlane Basin Iron Ore' });
    expect(plan.creatures[0].drop).toMatchObject({ name: 'Fire', kind: 'hide' });
    expect(plan.creatures[0].trophy.name).toBe('Kesterlane Basin Rat Tail');
    expect(plan.creatures[0].gear).toMatchObject({ slot: 'weapon', weaponType: 'sword', armorType: 'none' });
    expect(plan.creatures[1].gear).toMatchObject({ slot: 'weapon', weaponType: 'sword', armorType: 'none' });
    expect(plan.creatures[1].trophy.name).toBe('Of Kings');
    expect(recipeAt(plan, 0).category).not.toBe('ring');
    for (const recipe of plan.recipes) {
      for (const ref of refs(recipe)) expect(ref).toMatch(/^(G[1-3]|D:E[12])$/);
    }
    expectOnlyServerNumbers(plan, input);
  });

  it('the hostile reply is handled without throwing and yields only safe names and descriptions (late mode)', () => {
    const creature = mustCreature(validateLateCreature(inputLate(), loadReply('hostile'), never));
    expect(creature.enemyRef).toBe('E1');
    for (const name of creatureNames(creature)) expectSafeName(name);
    for (const description of creatureDescriptions(creature)) expectSafeDescription(description);
    expect(creature.drop.kind).toBe('hide');
    expect(creature.gear).toMatchObject({ slot: 'weapon', weaponType: 'sword', armorType: 'none' });
  });

  it('a 2,000-character description is capped at 240 characters', () => {
    const raw: string = loadReply('hostile').region.gatherables.common.description;
    expect(raw.length).toBe(2000);
    const plan = mustPlan(validateRegionEconomyReply(inputK0(), loadReply('hostile'), never));
    expect(plan.gatherables[0].description.length).toBeLessThanOrEqual(240);
    expect(plan.gatherables[0].description.length).toBeGreaterThan(100);
  });
});

describe('extra numeric keys change nothing', () => {
  for (const fixture of ['region_k0', 'region_k3', 'hostile']) {
    it(`${fixture}: extra numeric keys anywhere leave validateRegionEconomyReply output deep-equal`, () => {
      const input = fixture === 'region_k3' ? inputK3() : inputK0();
      const plain = validateRegionEconomyReply(input, loadReply(fixture), never);
      const padded = validateRegionEconomyReply(input, withExtraNumbers(loadReply(fixture)), never);
      expect(plain).not.toBeNull();
      expect(padded).toEqual(plain);
    });
  }

  for (const fixture of ['late', 'hostile']) {
    it(`${fixture}: extra numeric keys anywhere leave validateLateCreature output deep-equal`, () => {
      const plain = validateLateCreature(inputLate(), loadReply(fixture), never);
      const padded = validateLateCreature(inputLate(), withExtraNumbers(loadReply(fixture)), never);
      expect(plain).not.toBeNull();
      expect(padded).toEqual(plain);
    });
  }

  it('every requirement count equals regionalRequirementPlan for its tier, whatever the reply contains', () => {
    const cases: Array<[RegionEconomyInput, string]> = [
      [inputK0(), 'region_k0'],
      [inputK3(), 'region_k3'],
      [inputK0(), 'hostile'],
      [inputK3(), 'hostile'],
    ];
    for (const [input, fixture] of cases) {
      const plan = mustPlan(validateRegionEconomyReply(input, withExtraNumbers(loadReply(fixture)), never));
      expect(plan.recipes.length).toBeGreaterThan(0);
      expectOnlyServerNumbers(plan, input);
    }
  });

  it('the late creature output holds no number except the enemy template id', () => {
    const creature = mustCreature(validateLateCreature(inputLate(), withExtraNumbers(loadReply('hostile')), never));
    expect(numericPaths(creature)).toEqual(['enemyTemplateId']);
  });
});

describe('null cases', () => {
  const unusable: unknown[] = [null, undefined, 42, 'text', [], {}, { region: null, lateCreature: null }];

  it('non-object replies, {} and { region: null, lateCreature: null } return null in region mode', () => {
    for (const reply of unusable) expect(validateRegionEconomyReply(inputK0(), reply, never)).toBeNull();
  });

  it('non-object replies, {} and { region: null, lateCreature: null } return null in late mode', () => {
    for (const reply of unusable) expect(validateLateCreature(inputLate(), reply, never)).toBeNull();
  });

  it('a region with every list empty returns null', () => {
    for (const region of [
      { gatherables: {}, creatures: [], recipes: {} },
      { gatherables: null, creatures: null, recipes: null },
      {},
      { creatures: [{ enemy: 'E9' }] },
    ]) {
      expect(validateRegionEconomyReply(inputK0(), { region, lateCreature: null }, never)).toBeNull();
    }
  });

  it('region mode ignores lateCreature and late mode ignores region', () => {
    expect(validateRegionEconomyReply(inputK0(), loadReply('late'), never)).toBeNull();
    expect(validateLateCreature(inputLate(), loadReply('region_k0'), never)).toBeNull();
  });

  it('an empty creatures list with valid gatherables and recipes still returns a plan', () => {
    const reply = loadReply('region_k0');
    reply.region.creatures = [];
    const plan = mustPlan(validateRegionEconomyReply(inputK0(), reply, never));
    expect(plan.creatures).toEqual([]);
    expect(plan.gatherables).toHaveLength(3);
    expect(plan.recipes).toHaveLength(3);
    for (const recipe of plan.recipes) for (const ref of refs(recipe)) expect(ref).toMatch(/^G[1-3]$/);
  });
});
