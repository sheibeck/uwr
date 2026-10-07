/**
 * Rule-based recipe generation through the REAL handlers (Phase 50 plan 25, owner decision
 * "recipe generation"). research_recipes, craft_recipe, eat_food and salvage_item are captured from
 * index.ts and run on the strict mock db. Checks:
 *   - Discover recipes generates recipes from the carried materials, at most 3 new per call, each
 *     with a well-formed item_template and recipe_template row, consuming nothing;
 *   - a recipe and its output are stored once per key and reused by every later discoverer;
 *   - the output level is the area level of the station;
 *   - every generated recipe crafts end to end (quality, essence, food, salvage);
 *   - no station, another owner's character and unknown material names refuse or are ignored;
 *   - level 1 outputs equal the starter gear (parity with ensureStarterItemTemplates).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer, rowColumnProblems } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { ensureStarterItemTemplates, STARTER_ARMOR } from '../helpers/items';
import { canEquipItem } from '../data/item_usability';
import { STARTER_WEAPON_DEFS } from '../data/equipment_rules';
import {
  CRAFTING_MODIFIER_DEFS,
  ESSENCE_MAGNITUDE,
  MATERIAL_DEFS,
  getModifierMagnitude,
} from '../data/crafting_rules';
import {
  ARMOR_FORMS,
  FOOD_FORMS,
  MATERIAL_KINDS,
  UNMAPPED_MATERIAL_KEYS,
  WEAPON_FORMS,
  generatedOutput,
  recipeCandidates,
} from '../data/recipe_rules';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };
const bob = { toHexString: () => 'b'.repeat(64) };

let research: (...args: any[]) => any;
let craft: (...args: any[]) => any;
let eat: (...args: any[]) => any;
let salvage: (...args: any[]) => any;

beforeAll(async () => {
  await import('../index');
  const names = ['research_recipes', 'craft_recipe', 'eat_food', 'salvage_item'] as const;
  const handlers = names.map((n) => capturedReducer(n));
  handlers.forEach((h, i) => {
    if (typeof h !== 'function') {
      throw new Error(
        `capturedReducer('${names[i]}') is not a function: the schema recorder could not capture the ` +
          'reducer from index.ts. STOP and report; never edit production code to fix this.',
      );
    }
  });
  [research, craft, eat, salvage] = handlers as Array<(...args: any[]) => any>;
}, 120_000);

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const clone = <T>(v: T): T => structuredClone(v);

// Template ids and values read from the local database (2026-10-06).
const ID = {
  clear: 33n,
  stone: 31n,
  herbs: 40n,
  peat: 43n,
  murky: 45n,
  shard: 46n,
  cloth: 48n,
  lamp: 49n,
  copper: 50n,
  hide: 51n,
  lesser: 60n,
  life: 68n,
  ironOre: 70n,
  mystery: 80n,
  ctor: 81n,
  proto: 82n,
};

const material = (id: bigint, name: string, tier = 1n, vendorValue = 1n, over: Record<string, unknown> = {}) => ({
  id,
  name,
  slot: 'material',
  armorType: 'none',
  rarity: 'common',
  tier,
  isJunk: false,
  vendorValue,
  requiredLevel: 1n,
  allowedClasses: 'any',
  strBonus: 0n,
  dexBonus: 0n,
  chaBonus: 0n,
  wisBonus: 0n,
  intBonus: 0n,
  hpBonus: 0n,
  manaBonus: 0n,
  armorClassBonus: 0n,
  magicResistanceBonus: 0n,
  weaponBaseDamage: 0n,
  weaponDps: 0n,
  weaponType: '',
  stackable: true,
  wellFedDurationMicros: 0n,
  wellFedBuffType: '',
  wellFedBuffMagnitude: 0n,
  description: undefined,
  ...over,
});

const baseTemplates = () => [
  material(ID.clear, 'Clear Water'),
  material(ID.stone, 'Stone'),
  material(ID.herbs, 'Herbs'),
  material(ID.peat, 'Peat'),
  material(ID.murky, 'Murky Water'),
  material(ID.shard, 'Iron Shard', 1n, 2n),
  material(ID.cloth, 'Scrap Cloth'),
  material(ID.lamp, 'Lamp Oil'),
  material(ID.copper, 'Copper Ore', 1n, 2n),
  material(ID.hide, 'Rough Hide', 1n, 2n),
  material(ID.lesser, 'Lesser Essence', 1n, 3n),
  material(ID.life, 'Life Stone', 1n, 3n),
  material(ID.ironOre, 'Iron Ore', 2n, 4n),
  material(ID.mystery, 'Mystery Scrap'),
  material(ID.ctor, 'constructor'),
  material(ID.proto, '__proto__'),
];

type Bag = Array<[bigint, bigint]>;

// Elfansworth's 50-23 bag, and his live bag at 2026-10-06.
const ELF_BAG: Bag = [
  [ID.lamp, 12n], [ID.peat, 9n], [ID.herbs, 18n], [ID.cloth, 11n],
  [ID.shard, 3n], [ID.stone, 11n], [ID.murky, 4n], [ID.life, 1n],
];
const LIVE_BAG: Bag = [
  [ID.copper, 6n], [ID.clear, 5n], [ID.lamp, 16n], [ID.cloth, 21n], [ID.peat, 9n],
  [ID.herbs, 18n], [ID.murky, 4n], [ID.shard, 3n], [ID.stone, 11n], [ID.life, 1n],
];

const STATION = 4097n;
const NO_STATION = 4100n;
const HIGH_STATION = 4200n;

let nextInstance = 1000n;
const stacks = (owner: bigint, bag: Bag) =>
  bag.map(([templateId, quantity]) => ({
    id: nextInstance++,
    templateId,
    ownerCharacterId: owner,
    equippedSlot: undefined,
    quantity,
  }));

function character(id: bigint, userId: bigint, name: string) {
  return {
    id,
    ownerUserId: userId,
    name,
    className: 'Gloamweaver',
    level: 3n,
    int: 18n,
    gold: 10n,
    locationId: STATION,
    weaponProficiencies: 'dagger,wand,staff',
    armorProficiencies: 'cloth,leather',
  };
}

function newCtx(opts: { bag?: Bag; bag2?: Bag; templates?: any[]; at?: bigint } = {}) {
  const at = opts.at ?? STATION;
  const characters = [character(1n, 7n, 'Elfansworth'), character(2n, 8n, 'Armond')];
  characters[0].locationId = at;
  characters[1].locationId = at;
  return createMockCtx({
    seed: {
      player: [
        { id: alice, userId: 7n, activeCharacterId: 1n },
        { id: bob, userId: 8n, activeCharacterId: 2n },
      ],
      character: characters,
      region: [
        { id: 4097n, name: 'Tessarine Shelf', dangerMultiplier: 169n },
        { id: 5n, name: 'Highmarch', dangerMultiplier: 300n },
      ],
      location: [
        { id: STATION, name: 'Cormorant Stair', regionId: 4097n, levelOffset: 0n, craftingAvailable: true },
        { id: NO_STATION, name: "Saltwidow's Rest", regionId: 4097n, levelOffset: 2n, craftingAvailable: false },
        { id: HIGH_STATION, name: 'High Forge', regionId: 5n, levelOffset: 0n, craftingAvailable: true },
      ],
      item_template: opts.templates ?? baseTemplates(),
      item_instance: [...stacks(1n, opts.bag ?? ELF_BAG), ...stacks(2n, opts.bag2 ?? [])],
      item_affix: [],
      recipe_template: [],
      recipe_discovered: [],
      character_effect: [],
    },
    sender: alice,
    timestampMicros: T0,
    strict: true,
  });
}

const discover = (ctx: any, characterId = 1n) => research(ctx, { characterId });
const lines = (ctx: any, characterId = 1n): string[] =>
  rows(ctx, 'event_private').filter((e) => e.characterId === characterId).map((e) => e.message);
const countOf = (ctx: any, characterId: bigint, templateId: bigint): bigint =>
  rows(ctx, 'item_instance')
    .filter((i) => i.ownerCharacterId === characterId && i.templateId === templateId && !i.equippedSlot)
    .reduce((sum, i) => sum + i.quantity, 0n);
const recipeByName = (ctx: any, name: string) => {
  const found = rows(ctx, 'recipe_template').find((r) => r.name === name);
  if (!found) throw new Error(`no recipe ${name}; have ${rows(ctx, 'recipe_template').map((r) => r.name).join(', ')}`);
  return found;
};
const templateByName = (ctx: any, name: string) => rows(ctx, 'item_template').find((t) => t.name === name);
const generatedTemplates = (ctx: any) => {
  const outputs = new Set(rows(ctx, 'recipe_template').map((r) => r.outputTemplateId));
  return rows(ctx, 'item_template').filter((t) => outputs.has(t.id));
};

describe('Discover recipes generates recipes from the carried materials', () => {
  it('the first Discover creates three recipes, their outputs and the discovered rows, and consumes nothing', () => {
    const ctx = newCtx();
    const itemsBefore = clone(rows(ctx, 'item_instance'));
    const goldBefore = rows(ctx, 'character')[0].gold;
    const templatesBefore = rows(ctx, 'item_template').length;
    discover(ctx);
    expect(rows(ctx, 'item_template')).toHaveLength(templatesBefore + 3);
    expect(rows(ctx, 'recipe_template')).toHaveLength(3);
    const mine = rows(ctx, 'recipe_discovered').filter((d) => d.characterId === 1n);
    expect(mine).toHaveLength(3);
    expect(mine.map((d) => d.recipeTemplateId)).toEqual(rows(ctx, 'recipe_template').map((r) => r.id));
    expect(lines(ctx)).toEqual([
      'You discover Iron Shard Dagger because you have Iron Shard and Scrap Cloth.',
      'You discover Scrap Cloth Robe because you have Scrap Cloth and Iron Shard.',
      'You discover Stone Pendant because you have Stone and Scrap Cloth.',
    ]);
    expect(rows(ctx, 'event_private').every((e) => e.kind === 'system')).toBe(true);
    expect(rows(ctx, 'item_instance')).toEqual(itemsBefore);
    expect(rows(ctx, 'character')[0].gold).toBe(goldBefore);
    for (const row of generatedTemplates(ctx)) expect(rowColumnProblems('item_template', row), row.name).toEqual([]);
    for (const row of rows(ctx, 'recipe_template')) expect(rowColumnProblems('recipe_template', row), row.name).toEqual([]);
    for (const row of rows(ctx, 'recipe_discovered')) expect(rowColumnProblems('recipe_discovered', row)).toEqual([]);
  });

  it('the second Discover adds Herbal Draught only and the third finds nothing new', () => {
    const ctx = newCtx();
    discover(ctx);
    const before = lines(ctx).length;
    discover(ctx);
    expect(lines(ctx).slice(before)).toEqual(['You discover Herbal Draught because you have Herbs and Murky Water.']);
    expect(rows(ctx, 'recipe_template')).toHaveLength(4);
    const templates = rows(ctx, 'item_template').length;
    const recipes = rows(ctx, 'recipe_template').length;
    const discovered = rows(ctx, 'recipe_discovered').length;
    const eventsBefore = lines(ctx).length;
    discover(ctx);
    expect(lines(ctx).slice(eventsBefore)).toEqual(['You discover nothing new.']);
    expect(rows(ctx, 'item_template')).toHaveLength(templates);
    expect(rows(ctx, 'recipe_template')).toHaveLength(recipes);
    expect(rows(ctx, 'recipe_discovered')).toHaveLength(discovered);
  });

  it('never uses a reagent or utility material and never asks for more than the bag holds', () => {
    const ctx = newCtx();
    discover(ctx);
    discover(ctx);
    const bag = (id: bigint) => countOf(ctx, 1n, id);
    for (const recipe of rows(ctx, 'recipe_template')) {
      for (const id of [recipe.req1TemplateId, recipe.req2TemplateId]) {
        expect([ID.lamp, ID.peat, ID.life]).not.toContain(id);
      }
      expect(bag(recipe.req1TemplateId)).toBeGreaterThanOrEqual(recipe.req1Count);
      expect(bag(recipe.req2TemplateId)).toBeGreaterThanOrEqual(recipe.req2Count);
    }
  });

  it('the live bag gives three, then two, then nothing new', () => {
    const ctx = newCtx({ bag: LIVE_BAG });
    discover(ctx);
    expect(lines(ctx)).toEqual([
      'You discover Copper Dagger because you have Copper Ore and Scrap Cloth.',
      'You discover Scrap Cloth Robe because you have Scrap Cloth and Copper Ore.',
      'You discover Stone Pendant because you have Stone and Scrap Cloth.',
    ]);
    const before = lines(ctx).length;
    discover(ctx);
    expect(lines(ctx).slice(before)).toEqual([
      'You discover Herbal Draught because you have Herbs and Clear Water.',
      'You discover Iron Shard Dagger because you have Iron Shard and Scrap Cloth.',
    ]);
    const after = lines(ctx).length;
    discover(ctx);
    expect(lines(ctx).slice(after)).toEqual(['You discover nothing new.']);
    expect(rows(ctx, 'recipe_template')).toHaveLength(5);
  });

  it('a short count gives no recipe for that category', () => {
    const ctx = newCtx({ bag: [[ID.shard, 2n], [ID.cloth, 5n]] });
    discover(ctx);
    expect(rows(ctx, 'recipe_template').map((r) => r.name)).toEqual(['Scrap Cloth Robe']);
  });

  it('unknown, prototype-named and unmapped materials are ignored without error', () => {
    const ctx = newCtx({
      bag: [
        [ID.lamp, 5n], [ID.peat, 5n], [ID.life, 5n], [ID.lesser, 5n],
        [ID.mystery, 5n], [ID.ctor, 5n], [ID.proto, 5n],
      ],
    });
    const templates = rows(ctx, 'item_template').length;
    expect(() => discover(ctx)).not.toThrow();
    expect(lines(ctx)).toEqual(['You discover nothing new.']);
    expect(rows(ctx, 'item_template')).toHaveLength(templates);
    expect(rows(ctx, 'recipe_template')).toHaveLength(0);
    expect(rows(ctx, 'recipe_discovered')).toHaveLength(0);
  });
});

describe('a recipe and its output are stored once and shared', () => {
  it('a second character reuses the rows and only gets recipe_discovered rows', () => {
    const ctx = newCtx({ bag2: ELF_BAG });
    discover(ctx);
    const recipes = clone(rows(ctx, 'recipe_template'));
    const templates = rows(ctx, 'item_template').length;
    ctx.sender = bob;
    discover(ctx, 2n);
    expect(rows(ctx, 'recipe_template')).toEqual(recipes);
    expect(rows(ctx, 'item_template')).toHaveLength(templates);
    const theirs = rows(ctx, 'recipe_discovered').filter((d) => d.characterId === 2n);
    expect(theirs.map((d) => d.recipeTemplateId)).toEqual(recipes.map((r) => r.id));
    expect(lines(ctx, 2n)).toEqual(lines(ctx, 1n));
  });

  it('the Herbal Draught recipe is created once by the first discoverer and reused by the other', () => {
    const ctx = newCtx({ bag2: ELF_BAG });
    discover(ctx);
    ctx.sender = bob;
    discover(ctx, 2n);
    discover(ctx, 2n); // the second character is first to find Herbal Draught
    expect(rows(ctx, 'recipe_template').filter((r) => r.name === 'Herbal Draught')).toHaveLength(1);
    const recipes = rows(ctx, 'recipe_template').length;
    const templates = rows(ctx, 'item_template').length;
    ctx.sender = alice;
    discover(ctx, 1n);
    expect(rows(ctx, 'recipe_template')).toHaveLength(recipes);
    expect(rows(ctx, 'item_template')).toHaveLength(templates);
    const draught = recipeByName(ctx, 'Herbal Draught');
    expect(rows(ctx, 'recipe_discovered').filter((d) => d.recipeTemplateId === draught.id).map((d) => d.characterId).sort()).toEqual([1n, 2n]);
    const keys = rows(ctx, 'recipe_template').map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

// WR-03 (iteration 2 review): materials are matched by name, so a quest item, gear or junk that
// shares a material's name must never become a recipe input, and the first holder's template id
// must never be stored in a recipe every later discoverer shares.
describe('only real materials count as recipe inputs', () => {
  const IMPOSTOR = { questShard: 20n, gearCloth: 21n, junkStone: 22n };
  const withImpostors = () => [
    ...baseTemplates(),
    material(IMPOSTOR.questShard, 'Iron Shard', 1n, 2n, { slot: 'quest', stackable: false }),
    material(IMPOSTOR.gearCloth, 'Scrap Cloth', 1n, 1n, { slot: 'chest', armorType: 'cloth', stackable: false }),
    material(IMPOSTOR.junkStone, 'Stone', 1n, 1n, { slot: 'junk', isJunk: true }),
  ];

  it('a quest item named like a material is not a recipe input and is never consumed', () => {
    // The impostor has the lowest id and 3 units, the real Iron Shard has 3 too; the cloth is real.
    const ctx = newCtx({
      bag: [[IMPOSTOR.questShard, 3n], [ID.cloth, 2n]],
      templates: withImpostors(),
    });
    discover(ctx);
    expect(lines(ctx)).toEqual(['You discover nothing new.']);
    expect(rows(ctx, 'recipe_template')).toHaveLength(0);
    expect(countOf(ctx, 1n, IMPOSTOR.questShard)).toBe(3n);
  });

  it('gear and junk with a material name are ignored too', () => {
    const ctx = newCtx({
      bag: [[ID.shard, 3n], [IMPOSTOR.gearCloth, 4n], [IMPOSTOR.junkStone, 5n]],
      templates: withImpostors(),
    });
    discover(ctx);
    expect(lines(ctx)).toEqual(['You discover nothing new.']);
    expect(rows(ctx, 'recipe_template')).toHaveLength(0);
  });

  it('the shared recipe holds the real material ids even when the first discoverer also holds an impostor', () => {
    const ctx = newCtx({
      bag: [[IMPOSTOR.questShard, 3n], [ID.shard, 3n], [ID.cloth, 2n]],
      bag2: [[ID.shard, 3n], [ID.cloth, 2n]],
      templates: withImpostors(),
    });
    discover(ctx);
    const dagger = recipeByName(ctx, 'Iron Shard Dagger');
    expect(dagger.req1TemplateId).toBe(ID.shard);
    expect(dagger.req2TemplateId).toBe(ID.cloth);
    // A later discoverer without the impostor can learn it and craft it.
    ctx.sender = bob;
    discover(ctx, 2n);
    craft(ctx, { characterId: 2n, recipeTemplateId: dagger.id });
    expect(rows(ctx, 'item_instance').some((i) => i.ownerCharacterId === 2n && i.templateId === dagger.outputTemplateId)).toBe(true);
    // The first discoverer's quest item was not touched by their own craft either.
    ctx.sender = alice;
    craft(ctx, { characterId: 1n, recipeTemplateId: dagger.id });
    expect(countOf(ctx, 1n, IMPOSTOR.questShard)).toBe(3n);
  });
});

describe('the output level is the area level', () => {
  it('a level 3 station makes new keys at level 3 and leaves the level 1 rows alone', () => {
    const ctx = newCtx();
    discover(ctx);
    const level1 = clone(rows(ctx, 'recipe_template'));
    const level1Templates = clone(generatedTemplates(ctx));
    rows(ctx, 'character')[0].locationId = HIGH_STATION;
    discover(ctx);
    const all = rows(ctx, 'recipe_template');
    const added = all.slice(level1.length);
    expect(added.map((r) => r.name)).toEqual(['Iron Shard Rapier', 'Scrap Cloth Trousers', 'Stone Ring']);
    for (const r of added) expect(r.key.endsWith(':L3')).toBe(true);
    for (const r of level1) expect(r.key.endsWith(':L1')).toBe(true);
    expect(all.slice(0, level1.length)).toEqual(level1);
    expect(generatedTemplates(ctx).slice(0, level1Templates.length)).toEqual(level1Templates);
    const rapier = templateByName(ctx, 'Iron Shard Rapier');
    expect([rapier.weaponBaseDamage, rapier.weaponDps, rapier.requiredLevel]).toEqual([6n, 7n, 3n]);
    const trousers = templateByName(ctx, 'Scrap Cloth Trousers');
    expect([trousers.armorClassBonus, trousers.slot, trousers.requiredLevel]).toEqual([2n, 'legs', 3n]);
    const ring = templateByName(ctx, 'Stone Ring');
    expect([ring.slot, ring.wisBonus, ring.requiredLevel]).toEqual(['earrings', 1n, 3n]);
    for (const row of generatedTemplates(ctx)) expect(rowColumnProblems('item_template', row)).toEqual([]);
  });

  it('a station with a level offset adds it to the region band', () => {
    const ctx = newCtx();
    rows(ctx, 'location')[0].levelOffset = 2n; // Cormorant Stair: dm 169 -> 1, plus 2
    discover(ctx);
    expect(rows(ctx, 'recipe_template').every((r) => r.key.endsWith(':L3'))).toBe(true);
  });
});

describe('a generated recipe crafts end to end', () => {
  it('the dagger consumes the stated materials, stores standard quality and equips', () => {
    const ctx = newCtx();
    discover(ctx);
    const dagger = recipeByName(ctx, 'Iron Shard Dagger');
    const before = lines(ctx).length;
    craft(ctx, { characterId: 1n, recipeTemplateId: dagger.id });
    expect(countOf(ctx, 1n, ID.shard)).toBe(0n);
    expect(countOf(ctx, 1n, ID.cloth)).toBe(10n);
    const made = rows(ctx, 'item_instance').filter((i) => i.templateId === dagger.outputTemplateId);
    expect(made).toHaveLength(1);
    expect(made[0].craftQuality).toBe('standard');
    expect(made[0].qualityTier).toBe('common');
    expect(lines(ctx).slice(before)).toEqual(['You craft Iron Shard Dagger.']);
    const template = rows(ctx, 'item_template').find((t) => t.id === dagger.outputTemplateId);
    expect(canEquipItem(template, rows(ctx, 'character')[0]).ok).toBe(true);
  });

  it('every gear output can be equipped by the discoverer', () => {
    const ctx = newCtx();
    discover(ctx);
    for (const t of generatedTemplates(ctx)) {
      expect(canEquipItem(t, rows(ctx, 'character')[0]).ok, t.name).toBe(true);
    }
  });

  it('a tier 2 primary crafts reinforced with the implicit quality affixes', () => {
    const ctx = newCtx({ bag: [[ID.ironOre, 3n], [ID.hide, 1n]] });
    discover(ctx);
    expect(lines(ctx)).toEqual(['You discover Iron Sword because you have Iron Ore and Rough Hide.']);
    const sword = recipeByName(ctx, 'Iron Sword');
    craft(ctx, { characterId: 1n, recipeTemplateId: sword.id });
    const made = rows(ctx, 'item_instance').find((i) => i.templateId === sword.outputTemplateId)!;
    expect(made.craftQuality).toBe('reinforced');
    const affixes = rows(ctx, 'item_affix').filter((a) => a.itemInstanceId === made.id);
    expect(affixes.map((a) => [a.statKey, a.magnitude]).sort()).toEqual([
      ['weaponBaseDamage', 1n],
      ['weaponDps', 1n],
    ]);
  });

  it('a Lesser Essence and a Life Stone add the vitality affix', () => {
    const ctx = newCtx({ bag: [...ELF_BAG, [ID.lesser, 1n]] });
    discover(ctx);
    const dagger = recipeByName(ctx, 'Iron Shard Dagger');
    craft(ctx, {
      characterId: 1n,
      recipeTemplateId: dagger.id,
      catalystTemplateId: ID.lesser,
      modifier1TemplateId: ID.life,
    });
    const made = rows(ctx, 'item_instance').find((i) => i.templateId === dagger.outputTemplateId)!;
    const affix = rows(ctx, 'item_affix').find((a) => a.itemInstanceId === made.id && a.statKey === 'hpBonus')!;
    expect(affix.magnitude).toBe(getModifierMagnitude('lesser_essence', 'hpBonus'));
    expect(affix.magnitude).toBe(5n);
    expect(affix.affixName).toBe('of Vitality');
    expect(made.displayName).toContain('of Vitality');
    expect(countOf(ctx, 1n, ID.lesser)).toBe(0n);
    expect(countOf(ctx, 1n, ID.life)).toBe(0n);
  });

  it('a craft refused for a missing material changes nothing', () => {
    const ctx = newCtx({ bag: [[ID.shard, 3n], [ID.cloth, 1n]] });
    discover(ctx);
    const dagger = recipeByName(ctx, 'Iron Shard Dagger');
    ctx.db._tables.item_instance.splice(0, ctx.db._tables.item_instance.length, ...stacks(1n, [[ID.shard, 2n], [ID.cloth, 1n]]));
    const before = clone(rows(ctx, 'item_instance'));
    craft(ctx, { characterId: 1n, recipeTemplateId: dagger.id });
    expect(rows(ctx, 'item_instance')).toEqual(before);
    expect(lines(ctx).at(-1)).toBe('Missing materials to craft this recipe.');
  });

  it('the food recipe crafts a stackable food that eat_food turns into a Well Fed effect', () => {
    const ctx = newCtx();
    discover(ctx);
    discover(ctx);
    const draught = recipeByName(ctx, 'Herbal Draught');
    craft(ctx, { characterId: 1n, recipeTemplateId: draught.id });
    expect(countOf(ctx, 1n, ID.herbs)).toBe(16n);
    expect(countOf(ctx, 1n, ID.murky)).toBe(3n);
    const made = rows(ctx, 'item_instance').filter((i) => i.templateId === draught.outputTemplateId);
    expect(made).toHaveLength(1);
    expect(made[0].quantity).toBe(1n);
    const template = rows(ctx, 'item_template').find((t) => t.id === draught.outputTemplateId);
    expect(template.stackable).toBe(true);
    expect(template.slot).toBe('food');
    eat(ctx, { characterId: 1n, itemInstanceId: made[0].id });
    const effects = rows(ctx, 'character_effect');
    expect(effects).toHaveLength(1);
    expect(effects[0]).toMatchObject({
      characterId: 1n,
      effectType: 'food_health_regen',
      magnitude: 1n,
      sourceAbility: 'Well Fed',
    });
    expect(rows(ctx, 'item_instance').some((i) => i.id === made[0].id)).toBe(false);
    expect(lines(ctx).at(-1)).toBe('You eat the Herbal Draught and feel well fed (+1 health regeneration).');
  });

  it('every food form the rules can make is eaten into an effect', () => {
    const effectOf: Record<string, string> = {
      health_regen: 'food_health_regen',
      mana_regen: 'food_mana_regen',
      stamina_regen: 'food_stamina_regen',
      str: 'str_bonus',
      dex: 'dex_bonus',
    };
    const candidate = recipeCandidates(
      [
        { templateId: ID.herbs, name: 'Herbs', tier: 1n, vendorValue: 1n, count: 18n },
        { templateId: ID.murky, name: 'Murky Water', tier: 1n, vendorValue: 1n, count: 4n },
      ],
      1n,
    )[0];
    FOOD_FORMS.forEach((form, k) => {
      const taken = new Set(FOOD_FORMS.slice(0, k).map((f) => `herbal ${f.word}`.toLowerCase()));
      const out = generatedOutput(candidate, (name) => taken.has(name.toLowerCase()));
      expect(out.itemTemplate.wellFedBuffType).toBe(form.buffType);
      const ctx = newCtx({ bag: [] });
      const template = ctx.db.item_template.insert({ id: 0n, ...out.itemTemplate });
      const instance = ctx.db.item_instance.insert({
        id: 0n, templateId: template.id, ownerCharacterId: 1n, equippedSlot: undefined, quantity: 2n,
      });
      eat(ctx, { characterId: 1n, itemInstanceId: instance.id });
      const effect = rows(ctx, 'character_effect');
      expect(effect, form.buffType).toHaveLength(1);
      expect(effect[0].effectType).toBe(effectOf[form.buffType]);
      expect(effect[0].magnitude).toBe(1n);
    });
  });
});

describe('salvaging a crafted piece is silent about scrolls', () => {
  it('yields the tier 1 ore, deletes the instance and writes no debug line', () => {
    const ctx = newCtx();
    discover(ctx);
    const dagger = recipeByName(ctx, 'Iron Shard Dagger');
    craft(ctx, { characterId: 1n, recipeTemplateId: dagger.id });
    const made = rows(ctx, 'item_instance').find((i) => i.templateId === dagger.outputTemplateId)!;
    const before = lines(ctx).length;
    // The scroll roll (T0 + 1) % 100 = 1 is under the chance 8 + (18 - 10) * 3, so the scroll branch runs.
    salvage(ctx, { characterId: 1n, itemInstanceId: made.id });
    expect(rows(ctx, 'item_instance').some((i) => i.id === made.id)).toBe(false);
    expect(countOf(ctx, 1n, ID.copper)).toBe(2n);
    const written = lines(ctx).slice(before);
    expect(written).toEqual(['You salvaged Iron Shard Dagger and received 2x Copper Ore.']);
    expect(rows(ctx, 'event_private').some((e) => e.message.includes('[Debug]'))).toBe(false);
  });
});

// CR-01 (iteration 2 review): salvage must never return more than the craft consumed or the item is
// worth. Real salvage_item and craft_recipe handlers; no mocked pricing.
describe('salvaging never beats crafting', () => {
  const T = {
    voidCrystal: 90n,
    shadowhide: 91n,
    darksteel: 92n,
    ironWard: 93n,
    boneShard: 94n,
    spiritEssence: 95n,
    tannedLeather: 96n,
    moonweave: 97n,
  };
  const richTemplates = () => [
    ...baseTemplates(),
    material(T.voidCrystal, 'Void Crystal', 3n, 10n),
    material(T.shadowhide, 'Shadowhide', 3n, 8n),
    material(T.darksteel, 'Darksteel Ore', 3n, 8n),
    material(T.boneShard, 'Bone Shard', 1n, 2n),
    material(T.spiritEssence, 'Spirit Essence', 2n, 5n),
    material(T.tannedLeather, 'Tanned Leather', 2n, 4n),
    material(T.moonweave, 'Moonweave Cloth', 3n, 8n),
    material(T.ironWard, 'Iron Ward', 1n, 3n),
  ];
  const valueOf = (ctx: any, templateId: bigint): bigint =>
    rows(ctx, 'item_template').find((t) => t.id === templateId)?.vendorValue ?? 0n;
  // The vendor value of every non-equipped unit the character holds, gear included.
  const bagValue = (ctx: any, characterId = 1n): bigint =>
    rows(ctx, 'item_instance')
      .filter((i) => i.ownerCharacterId === characterId && !i.equippedSlot)
      .reduce((sum, i) => sum + valueOf(ctx, i.templateId) * (i.quantity ?? 1n), 0n);
  // A salvage timestamp whose reagent roll, (ts + instanceId * 13) % 100, is 0 (under the 12% chance).
  const rollReagent = (ctx: any, instanceId: bigint) => {
    const base = T0 + 5_000_000n;
    ctx.timestamp = { microsSinceUnixEpoch: base + ((100n - ((base + instanceId * 13n) % 100n)) % 100n) };
  };

  it('a crafted Void Crystal Pendant salvages to no more Void Crystal than it consumed', () => {
    const ctx = newCtx({ bag: [[T.voidCrystal, 2n], [ID.cloth, 1n]], templates: richTemplates() });
    discover(ctx);
    const recipe = recipeByName(ctx, 'Void Crystal Pendant');
    expect(recipe.req1TemplateId).toBe(T.voidCrystal);
    expect(recipe.req1Count).toBe(2n);
    craft(ctx, { characterId: 1n, recipeTemplateId: recipe.id });
    expect(countOf(ctx, 1n, T.voidCrystal)).toBe(0n);
    const made = rows(ctx, 'item_instance').find((i) => i.templateId === recipe.outputTemplateId)!;
    salvage(ctx, { characterId: 1n, itemInstanceId: made.id });
    expect(countOf(ctx, 1n, T.voidCrystal)).toBeLessThanOrEqual(2n);
    expect(countOf(ctx, 1n, T.voidCrystal)).toBeLessThan(3n);
    // Never worth more than the item: the pendant is worth what its inputs were.
    expect(countOf(ctx, 1n, T.voidCrystal) * 10n).toBeLessThanOrEqual(valueOf(ctx, recipe.outputTemplateId));
    expect(rows(ctx, 'item_instance').some((i) => i.id === made.id)).toBe(false);
  });

  it('a crafted tier 3 armor and weapon return at most what the recipe consumed', () => {
    const ctx = newCtx({
      bag: [[T.shadowhide, 3n], [ID.cloth, 1n], [T.darksteel, 3n], [ID.hide, 1n]],
      templates: richTemplates(),
    });
    discover(ctx);
    const jerkin = recipeByName(ctx, 'Shadowhide Jerkin');
    const sword = recipeByName(ctx, 'Darksteel Sword');
    for (const [recipe, materialId] of [[jerkin, T.shadowhide], [sword, T.darksteel]] as const) {
      craft(ctx, { characterId: 1n, recipeTemplateId: recipe.id });
      expect(countOf(ctx, 1n, materialId)).toBe(0n);
      const made = rows(ctx, 'item_instance').find((i) => i.templateId === recipe.outputTemplateId)!;
      salvage(ctx, { characterId: 1n, itemInstanceId: made.id });
      expect(countOf(ctx, 1n, materialId), recipe.name).toBeLessThanOrEqual(recipe.req1Count);
      expect(countOf(ctx, 1n, materialId) * valueOf(ctx, materialId), recipe.name).toBeLessThanOrEqual(
        valueOf(ctx, recipe.outputTemplateId),
      );
    }
  });

  it('the implicit quality affix of a crafted armor gives no free reagent', () => {
    const ctx = newCtx({ bag: [[T.shadowhide, 3n], [ID.cloth, 1n]], templates: richTemplates() });
    discover(ctx);
    const jerkin = recipeByName(ctx, 'Shadowhide Jerkin');
    craft(ctx, { characterId: 1n, recipeTemplateId: jerkin.id });
    const made = rows(ctx, 'item_instance').find((i) => i.templateId === jerkin.outputTemplateId)!;
    const affixes = rows(ctx, 'item_affix').filter((a) => a.itemInstanceId === made.id);
    expect(affixes.map((a) => [a.affixType, a.statKey])).toEqual([['implicit', 'armorClassBonus']]);
    rollReagent(ctx, made.id);
    salvage(ctx, { characterId: 1n, itemInstanceId: made.id });
    expect(countOf(ctx, 1n, T.ironWard)).toBe(0n);
    expect(lines(ctx).some((l) => l.includes('Iron Ward'))).toBe(false);
  });

  it('a real (suffix) affix still yields its reagent, so only the implicit one is ignored', () => {
    const ctx = newCtx({ bag: [[T.shadowhide, 3n], [ID.cloth, 1n]], templates: richTemplates() });
    discover(ctx);
    const jerkin = recipeByName(ctx, 'Shadowhide Jerkin');
    craft(ctx, { characterId: 1n, recipeTemplateId: jerkin.id });
    const made = rows(ctx, 'item_instance').find((i) => i.templateId === jerkin.outputTemplateId)!;
    ctx.db.item_affix.insert({
      id: 0n,
      itemInstanceId: made.id,
      affixType: 'suffix',
      affixKey: 'crafted_armorClassBonus',
      affixName: 'of Warding',
      statKey: 'armorClassBonus',
      magnitude: 2n,
    });
    rollReagent(ctx, made.id);
    salvage(ctx, { characterId: 1n, itemInstanceId: made.id });
    expect(countOf(ctx, 1n, T.ironWard)).toBe(1n);
  });

  it('craft then salvage in a loop never raises what the bag is worth', () => {
    const ctx = newCtx({
      bag: [[T.voidCrystal, 20n], [ID.cloth, 20n], [T.shadowhide, 12n]],
      templates: richTemplates(),
    });
    discover(ctx);
    const pendant = recipeByName(ctx, 'Void Crystal Pendant');
    const startValue = bagValue(ctx);
    let previous = startValue;
    for (let cycle = 0; cycle < 8; cycle++) {
      craft(ctx, { characterId: 1n, recipeTemplateId: pendant.id });
      const made = rows(ctx, 'item_instance').find((i) => i.templateId === pendant.outputTemplateId)!;
      salvage(ctx, { characterId: 1n, itemInstanceId: made.id });
      const now = bagValue(ctx);
      expect(now, `cycle ${cycle}`).toBeLessThanOrEqual(previous);
      previous = now;
    }
    expect(countOf(ctx, 1n, T.voidCrystal)).toBeLessThanOrEqual(20n);
    expect(bagValue(ctx)).toBeLessThanOrEqual(startValue);
  });

  it('every generated gear recipe: salvaging returns no more value than the craft consumed', () => {
    const everything: Bag = [
      [T.voidCrystal, 10n], [T.boneShard, 10n], [T.spiritEssence, 10n], [ID.stone, 10n],
      [T.shadowhide, 10n], [T.tannedLeather, 10n], [ID.hide, 10n], [T.moonweave, 10n], [ID.cloth, 10n],
      [T.darksteel, 10n], [ID.ironOre, 10n], [ID.copper, 10n], [ID.shard, 10n],
    ];
    const ctx = newCtx({ bag: everything, templates: richTemplates() });
    for (let i = 0; i < 12; i++) discover(ctx);
    const recipes = rows(ctx, 'recipe_template').filter((r) => r.recipeType !== 'consumable');
    expect(recipes.length).toBeGreaterThanOrEqual(8);
    for (const recipe of recipes) {
      const consumed =
        valueOf(ctx, recipe.req1TemplateId) * recipe.req1Count + valueOf(ctx, recipe.req2TemplateId) * recipe.req2Count;
      const before = bagValue(ctx);
      craft(ctx, { characterId: 1n, recipeTemplateId: recipe.id });
      const made = rows(ctx, 'item_instance').find((i) => i.templateId === recipe.outputTemplateId)!;
      expect(made, recipe.name).toBeDefined();
      const afterCraft = bagValue(ctx);
      salvage(ctx, { characterId: 1n, itemInstanceId: made.id });
      const afterSalvage = bagValue(ctx);
      const salvaged = afterSalvage - (afterCraft - valueOf(ctx, recipe.outputTemplateId));
      expect(salvaged, recipe.name).toBeLessThanOrEqual(consumed);
      expect(afterSalvage, recipe.name).toBeLessThanOrEqual(before);
    }
  });
});

describe('refusals', () => {
  it('without a station it writes the station line and nothing else', () => {
    const ctx = newCtx({ at: NO_STATION });
    discover(ctx);
    expect(lines(ctx)).toEqual(['Crafting is only available at locations with crafting stations.']);
    expect(rows(ctx, 'recipe_template')).toHaveLength(0);
    expect(rows(ctx, 'recipe_discovered')).toHaveLength(0);
    expect(generatedTemplates(ctx)).toHaveLength(0);
  });

  it("another owner's call throws and inserts nothing", () => {
    const ctx = newCtx();
    ctx.sender = bob;
    expect(() => research(ctx, { characterId: 1n })).toThrow('Not your character');
    expect(rows(ctx, 'recipe_template')).toHaveLength(0);
    expect(rows(ctx, 'recipe_discovered')).toHaveLength(0);
    expect(generatedTemplates(ctx)).toHaveLength(0);
    expect(rows(ctx, 'event_private')).toHaveLength(0);
  });
});

describe('level 1 outputs equal the starter gear', () => {
  const starter = () => {
    const ctx = createMockCtx({ seed: { item_template: [] }, strict: true });
    ensureStarterItemTemplates(ctx);
    return ctx;
  };

  it('each starter weapon matches the weapon form of its type', () => {
    const ctx = starter();
    for (const def of STARTER_WEAPON_DEFS) {
      const template = templateByName(ctx, def.name);
      const form = WEAPON_FORMS.find((f) => f.weaponType === def.weaponType)!;
      expect(form, def.weaponType).toBeDefined();
      expect([template.weaponBaseDamage, template.weaponDps], def.name).toEqual([form.baseDamage, form.dps]);
    }
  });

  it('starter cloth and leather armor match the armor forms and end with the form word', () => {
    const ctx = starter();
    for (const type of ['cloth', 'leather'] as const) {
      const set = STARTER_ARMOR[type];
      for (const slot of ['chest', 'legs', 'boots'] as const) {
        const form = ARMOR_FORMS.find((f) => f.slot === slot)!;
        const template = templateByName(ctx, set[slot].name);
        expect(template.armorClassBonus, set[slot].name).toBe(form.baseAc[type]);
        expect(set[slot].name.endsWith(form.words[type]), set[slot].name).toBe(true);
      }
    }
  });

  it('every starter material is mapped, deliberately unmapped, an essence or a reagent', () => {
    const ctx = starter();
    const known = new Set<string>([
      ...Object.keys(MATERIAL_KINDS),
      ...UNMAPPED_MATERIAL_KEYS,
      ...Object.keys(ESSENCE_MAGNITUDE),
      ...CRAFTING_MODIFIER_DEFS.map((d) => d.key),
    ]);
    const materials = rows(ctx, 'item_template').filter((t) => t.slot === 'material');
    expect(materials.length).toBeGreaterThan(20);
    for (const t of materials) {
      const key = t.name.toLowerCase().replace(/\s+/g, '_');
      expect(known.has(key), t.name).toBe(true);
    }
    for (const def of MATERIAL_DEFS) expect(materials.some((t) => t.name === def.name)).toBe(true);
  });
});
