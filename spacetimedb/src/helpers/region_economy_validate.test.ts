import { describe, it, expect } from 'vitest';
// The tsconfig has no @types/node; vitest runs the file in Node, so the built-ins resolve at runtime.
// @ts-ignore
import { readFileSync } from 'node:fs';
// @ts-ignore
import { join } from 'node:path';
// @ts-ignore
import { fileURLToPath } from 'node:url';
import { validateRegionEconomyReply, type ValidatedRecipe, type ValidatedRegionEconomy } from './region_economy_validate';
import { regionalRequirementPlan, type RegionEconomyInput } from '../data/economy_design_rules';

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

  it('a weapon recipe whose first local material is hide becomes armor', () => {
    const reply = loadReply('region_k0');
    reply.region.recipes.first.materials = ['D:E1', 'G1'];
    const first = recipeAt(mustPlan(validateRegionEconomyReply(inputK0(), reply, never)), 0);
    expect(first.category).toBe('armor');
    expect(refs(first)).toEqual(['D:E1', 'G1']);
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
