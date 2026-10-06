/**
 * craft_recipe validates before it mutates (Phase 50, owner decision 2026-10-06). Runs the REAL
 * craft_recipe handler captured from index.ts on the strict mock db. Checks:
 *   - the stored craftQuality equals craftQualityForMaterialName(first material), with the implicit
 *     Quality affixes of getCraftQualityStatBonus;
 *   - a successful essence craft consumes and produces exactly what planCraft promises;
 *   - every refusal leaves item_instance rows, item_affix rows and gold exactly as seeded and writes
 *     one system line with the server text;
 *   - reagents sent without an essence, and a catalyst sent with a consumable, are ignored.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { buildDisplayName } from '../helpers/items';
import {
  CRAFTING_MODIFIER_DEFS,
  MATERIAL_DEFS,
  craftQualityForMaterialName,
  getCraftQualityStatBonus,
  getModifierMagnitude,
} from '../data/crafting_rules';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };

let craftRecipe: (...args: any[]) => any;

beforeAll(async () => {
  await import('../index');
  const h = capturedReducer('craft_recipe');
  if (typeof h !== 'function') {
    throw new Error(
      "capturedReducer('craft_recipe') is not a function: the schema recorder could not capture the " +
        'reducer from index.ts. STOP and report; never edit production code to fix this.',
    );
  }
  craftRecipe = h;
}, 120_000);

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const clone = <T>(v: T): T => structuredClone(v);

// Names come from the module (title-cased real template names), not guesses.
const matName = (tier: bigint) => MATERIAL_DEFS.find((m) => m.tier === tier)!.name;
const T1 = matName(1n);
const T2 = matName(2n);
const T3 = matName(3n);
const MOD_A = CRAFTING_MODIFIER_DEFS[0];
const MOD_B = CRAFTING_MODIFIER_DEFS[1];

// Template ids.
const ID = {
  t1: 1n,
  t2: 2n,
  t3: 3n,
  unknownMat: 4n,
  second: 5n,
  weapon: 10n,
  armor: 11n,
  potion: 12n,
  lesser: 20n,
  essence: 21n,
  greater: 22n,
  modA: 30n,
  modB: 31n,
  pebble: 32n,
};

const baseTemplate = {
  slot: 'material',
  stackable: true,
  armorType: 'none',
  rarity: 'common',
  strBonus: 0n,
  dexBonus: 0n,
  intBonus: 0n,
  wisBonus: 0n,
  chaBonus: 0n,
  hpBonus: 0n,
  manaBonus: 0n,
  armorClassBonus: 0n,
  magicResistanceBonus: 0n,
  weaponBaseDamage: 0n,
  weaponDps: 0n,
  requiredLevel: 1n,
  isJunk: false,
};

const tpl = (id: bigint, name: string, over: Record<string, unknown> = {}) => ({
  ...baseTemplate,
  id,
  name,
  ...over,
});

const TEMPLATES = [
  tpl(ID.t1, T1),
  tpl(ID.t2, T2),
  tpl(ID.t3, T3),
  tpl(ID.unknownMat, 'Mystery Scrap'),
  tpl(ID.second, 'Bone Shard'),
  tpl(ID.weapon, 'Test Blade', { slot: 'mainHand', stackable: false, weaponBaseDamage: 5n, weaponDps: 3n }),
  tpl(ID.armor, 'Test Vest', { slot: 'chest', stackable: false, armorClassBonus: 3n }),
  tpl(ID.potion, 'Test Potion', { slot: 'consumable', stackable: true }),
  tpl(ID.lesser, 'Lesser Essence'),
  tpl(ID.essence, 'Essence'),
  tpl(ID.greater, 'Greater Essence'),
  tpl(ID.modA, MOD_A.name),
  tpl(ID.modB, MOD_B.name),
  tpl(ID.pebble, 'Pebble'),
];

const recipe = (id: bigint, req1: bigint, output: bigint, recipeType: string) => ({
  id,
  name: `Recipe ${id}`,
  recipeType,
  req1TemplateId: req1,
  req1Count: 2n,
  req2TemplateId: ID.second,
  req2Count: 1n,
  req3TemplateId: undefined,
  req3Count: undefined,
  outputTemplateId: output,
  outputCount: 1n,
});

// Recipe ids: 100+ weapon by material, 110+ armor by material, 120 consumable.
const R = {
  weaponT1: 100n,
  weaponT2: 101n,
  weaponT3: 102n,
  weaponUnknown: 103n,
  armorT1: 110n,
  armorT2: 111n,
  armorT3: 112n,
  armorUnknown: 113n,
  potion: 120n,
  repeated: 130n,
  missing: 999n,
};
const RECIPES = [
  recipe(R.weaponT1, ID.t1, ID.weapon, 'weapon'),
  recipe(R.weaponT2, ID.t2, ID.weapon, 'weapon'),
  recipe(R.weaponT3, ID.t3, ID.weapon, 'weapon'),
  recipe(R.weaponUnknown, ID.unknownMat, ID.weapon, 'weapon'),
  recipe(R.armorT1, ID.t1, ID.armor, 'armor'),
  recipe(R.armorT2, ID.t2, ID.armor, 'armor'),
  recipe(R.armorT3, ID.t3, ID.armor, 'armor'),
  recipe(R.armorUnknown, ID.unknownMat, ID.armor, 'armor'),
  recipe(R.potion, ID.t1, ID.potion, 'consumable'),
  // Requirements 1 and 2 are the same template (counts 2 and 3): the plan must count the sum.
  { ...recipe(R.repeated, ID.t2, ID.weapon, 'weapon'), req2TemplateId: ID.t2, req2Count: 3n },
];

let nextInstance = 1000n;
const stack = (templateId: bigint, quantity: bigint) => ({
  id: nextInstance++,
  templateId,
  ownerCharacterId: 1n,
  equippedSlot: undefined,
  quantity,
});

/** Plenty of every material so a craft is possible unless a test removes something. */
function plentyOfMaterials(): any[] {
  return [
    stack(ID.t1, 6n),
    stack(ID.t2, 6n),
    stack(ID.t3, 6n),
    stack(ID.unknownMat, 6n),
    stack(ID.second, 6n),
  ];
}

function newCtx(items: any[], opts: { craftingAvailable?: boolean; discovered?: bigint[] } = {}) {
  const discovered = opts.discovered ?? Object.values(R).filter((r) => r !== R.missing);
  return createMockCtx({
    seed: {
      player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
      character: [
        {
          id: 1n,
          ownerUserId: 7n,
          name: 'Mirel',
          className: 'Ashwarden',
          level: 5n,
          gold: 10n,
          locationId: 10n,
        },
      ],
      location: [{ id: 10n, name: 'Saltmere', craftingAvailable: opts.craftingAvailable ?? true }],
      item_template: TEMPLATES,
      recipe_template: RECIPES,
      recipe_discovered: discovered.map((rid, i) => ({
        id: BigInt(i + 1),
        characterId: 1n,
        recipeTemplateId: rid,
        discoveredAt: { microsSinceUnixEpoch: T0 },
      })),
      item_instance: items,
      item_affix: [],
    },
    sender: alice,
    timestampMicros: T0,
    strict: true,
  });
}

type CraftArgs = {
  recipeTemplateId: bigint;
  catalystTemplateId?: bigint;
  modifier1TemplateId?: bigint;
  modifier2TemplateId?: bigint;
  modifier3TemplateId?: bigint;
};
const craft = (ctx: any, args: CraftArgs) => craftRecipe(ctx, { characterId: 1n, ...args });

const messages = (ctx: any): string[] => rows(ctx, 'event_private').map((e) => e.message);
const countOf = (ctx: any, templateId: bigint): bigint =>
  rows(ctx, 'item_instance')
    .filter((i) => i.templateId === templateId && !i.equippedSlot)
    .reduce((sum, i) => sum + (i.quantity ?? 1n), 0n);
const crafted = (ctx: any, templateId: bigint) =>
  rows(ctx, 'item_instance').filter((i) => i.templateId === templateId && i.craftQuality);

/** Runs the craft and asserts nothing changed but one system line. */
function expectRefused(ctx: any, args: CraftArgs, message: string) {
  const beforeItems = clone(rows(ctx, 'item_instance'));
  const beforeAffixes = clone(rows(ctx, 'item_affix'));
  const beforeGold = rows(ctx, 'character')[0].gold;
  craft(ctx, args);
  expect(rows(ctx, 'item_instance')).toEqual(beforeItems);
  expect(rows(ctx, 'item_affix')).toEqual(beforeAffixes);
  expect(rows(ctx, 'character')[0].gold).toBe(beforeGold);
  const events = rows(ctx, 'event_private');
  expect(events).toHaveLength(1);
  expect(events[0].kind).toBe('system');
  expect(events[0].message).toBe(message);
}

describe('craft_recipe stored quality', () => {
  const cases: [string, string, bigint, bigint][] = [
    [T1, 'T1', R.weaponT1, R.armorT1],
    [T2, 'T2', R.weaponT2, R.armorT2],
    [T3, 'T3', R.weaponT3, R.armorT3],
    ['Mystery Scrap', 'unknown', R.weaponUnknown, R.armorUnknown],
  ];

  it.each(cases)('%s (%s): a weapon stores the shared quality and its implicit affixes', (name, _label, weaponRecipe) => {
    const ctx = newCtx(plentyOfMaterials());
    craft(ctx, { recipeTemplateId: weaponRecipe });
    const made = crafted(ctx, ID.weapon);
    expect(made).toHaveLength(1);
    const quality = craftQualityForMaterialName(name);
    expect(made[0].craftQuality).toBe(quality);
    expect(made[0].qualityTier).toBe('common');
    const bonus = getCraftQualityStatBonus(quality);
    const affixes = rows(ctx, 'item_affix').filter((a) => a.itemInstanceId === made[0].id);
    if (bonus > 0n) {
      expect(affixes.map((a) => [a.statKey, a.magnitude, a.affixType]).sort()).toEqual(
        [
          ['weaponBaseDamage', bonus, 'implicit'],
          ['weaponDps', bonus, 'implicit'],
        ].sort(),
      );
    } else {
      expect(affixes).toEqual([]);
    }
    expect(messages(ctx)).toEqual(['You craft Test Blade.']);
  });

  it.each(cases)('%s (%s): armor stores the shared quality and its implicit affix', (name, _label, _w, armorRecipe) => {
    const ctx = newCtx(plentyOfMaterials());
    craft(ctx, { recipeTemplateId: armorRecipe });
    const made = crafted(ctx, ID.armor);
    expect(made).toHaveLength(1);
    const quality = craftQualityForMaterialName(name);
    expect(made[0].craftQuality).toBe(quality);
    const bonus = getCraftQualityStatBonus(quality);
    const affixes = rows(ctx, 'item_affix').filter((a) => a.itemInstanceId === made[0].id);
    if (bonus > 0n) {
      expect(affixes.map((a) => [a.statKey, a.magnitude, a.affixType])).toEqual([['armorClassBonus', bonus, 'implicit']]);
    } else {
      expect(affixes).toEqual([]);
    }
  });
});

describe('craft_recipe success with an essence', () => {
  it('essence plus two reagents at reinforced consumes exactly the plan and inserts one suffix per reagent', () => {
    const ctx = newCtx([
      ...plentyOfMaterials(),
      stack(ID.essence, 3n),
      stack(ID.modA, 2n),
      stack(ID.modB, 2n),
    ]);
    craft(ctx, {
      recipeTemplateId: R.weaponT2,
      catalystTemplateId: ID.essence,
      modifier1TemplateId: ID.modA,
      modifier2TemplateId: ID.modB,
    });
    expect(countOf(ctx, ID.t2)).toBe(4n); // 6 - 2
    expect(countOf(ctx, ID.second)).toBe(5n); // 6 - 1
    expect(countOf(ctx, ID.essence)).toBe(2n);
    expect(countOf(ctx, ID.modA)).toBe(1n);
    expect(countOf(ctx, ID.modB)).toBe(1n);

    const made = crafted(ctx, ID.weapon);
    expect(made).toHaveLength(1);
    expect(made[0].craftQuality).toBe('reinforced');
    const suffixes = rows(ctx, 'item_affix').filter((a) => a.itemInstanceId === made[0].id && a.affixType === 'suffix');
    expect(suffixes.map((a) => [a.statKey, a.magnitude])).toEqual([
      [MOD_A.statKey, getModifierMagnitude('essence', MOD_A.statKey)],
      [MOD_B.statKey, getModifierMagnitude('essence', MOD_B.statKey)],
    ]);
    const expectedName = buildDisplayName('Test Blade', suffixes);
    expect(made[0].displayName).toBe(expectedName);
    expect(messages(ctx)).toEqual([`You craft ${expectedName}.`]);
  });
});

describe('craft_recipe decorates the instance it created', () => {
  it('an older plain copy of the output already in the bag is left untouched', () => {
    // Lower id than anything the craft inserts, and listed first by owner: the old lookup picked it.
    const older = { ...stack(ID.weapon, 1n), id: 5n };
    const ctx = newCtx([older, ...plentyOfMaterials(), stack(ID.essence, 1n), stack(ID.modA, 1n)]);
    craft(ctx, {
      recipeTemplateId: R.weaponT2,
      catalystTemplateId: ID.essence,
      modifier1TemplateId: ID.modA,
    });
    const weapons = rows(ctx, 'item_instance').filter((i) => i.templateId === ID.weapon);
    expect(weapons).toHaveLength(2);
    const oldRow = weapons.find((i) => i.id === 5n)!;
    const newRow = weapons.find((i) => i.id !== 5n)!;
    // The older copy: still plain, no quality, no name, no affix rows.
    expect(oldRow.craftQuality).toBeUndefined();
    expect(oldRow.qualityTier).toBeUndefined();
    expect(oldRow.displayName).toBeUndefined();
    expect(rows(ctx, 'item_affix').filter((a) => a.itemInstanceId === 5n)).toEqual([]);
    // The crafted copy: carries the quality, the display name and every affix.
    expect(newRow.craftQuality).toBe('reinforced');
    expect(newRow.qualityTier).toBe('common');
    expect(newRow.displayName).toBeTruthy();
    const newAffixes = rows(ctx, 'item_affix').filter((a) => a.itemInstanceId === newRow.id);
    expect(newAffixes.some((a) => a.affixType === 'suffix' && a.statKey === MOD_A.statKey)).toBe(true);
    expect(newAffixes.some((a) => a.affixType === 'implicit')).toBe(true);
    expect(messages(ctx)).toEqual([`You craft ${newRow.displayName}.`]);
  });
});

describe('craft_recipe refusals cost nothing', () => {
  it('missing materials', () => {
    const ctx = newCtx([stack(ID.t2, 1n), stack(ID.second, 1n)]);
    expectRefused(ctx, { recipeTemplateId: R.weaponT2 }, 'Missing materials to craft this recipe.');
  });

  it('essence too weak for the quality', () => {
    const ctx = newCtx([...plentyOfMaterials(), stack(ID.lesser, 1n), stack(ID.modA, 1n)]);
    expectRefused(
      ctx,
      { recipeTemplateId: R.weaponT2, catalystTemplateId: ID.lesser, modifier1TemplateId: ID.modA },
      'Essence tier too low for this craft quality',
    );
  });

  it('a recipe that repeats a material template is refused on the merged total, with the server text', () => {
    // Counts 2 and 3 of the same template with 4 on hand: each is met alone, the sum (5) is not.
    const ctx = newCtx([stack(ID.t2, 4n)]);
    expectRefused(ctx, { recipeTemplateId: R.repeated }, 'Missing materials to craft this recipe.');
    expect(countOf(ctx, ID.t2)).toBe(4n);
  });

  it('a recipe that repeats a material template crafts when the merged total is on hand', () => {
    const ctx = newCtx([stack(ID.t2, 5n)]);
    craft(ctx, { recipeTemplateId: R.repeated });
    expect(countOf(ctx, ID.t2)).toBe(0n);
    expect(crafted(ctx, ID.weapon)).toHaveLength(1);
    expect(messages(ctx)).toEqual(['You craft Test Blade.']);
  });

  it('essence named but none on hand', () => {
    const ctx = newCtx([...plentyOfMaterials(), stack(ID.modA, 1n)]);
    expectRefused(
      ctx,
      { recipeTemplateId: R.weaponT2, catalystTemplateId: ID.essence, modifier1TemplateId: ID.modA },
      'Missing catalyst (Essence)',
    );
  });

  it('the same reagent in two slots with one on hand', () => {
    const ctx = newCtx([...plentyOfMaterials(), stack(ID.essence, 1n), stack(ID.modA, 1n)]);
    expectRefused(
      ctx,
      {
        recipeTemplateId: R.weaponT2,
        catalystTemplateId: ID.essence,
        modifier1TemplateId: ID.modA,
        modifier2TemplateId: ID.modA,
      },
      `Missing modifier: ${MOD_A.name}`,
    );
  });

  it('an essence with only an unknown-name reagent', () => {
    const ctx = newCtx([...plentyOfMaterials(), stack(ID.essence, 1n), stack(ID.pebble, 1n)]);
    expectRefused(
      ctx,
      { recipeTemplateId: R.weaponT2, catalystTemplateId: ID.essence, modifier1TemplateId: ID.pebble },
      'Must provide at least one reagent when using an Essence',
    );
  });

  it('an essence with no reagent at all', () => {
    const ctx = newCtx([...plentyOfMaterials(), stack(ID.essence, 1n)]);
    expectRefused(
      ctx,
      { recipeTemplateId: R.weaponT2, catalystTemplateId: ID.essence },
      'Must provide at least one reagent when using an Essence',
    );
  });
});

describe('craft_recipe ignores what does not apply', () => {
  it('a consumable with a catalyst passed crafts and leaves the catalyst untouched', () => {
    const ctx = newCtx([...plentyOfMaterials(), stack(ID.essence, 1n), stack(ID.modA, 1n)]);
    craft(ctx, {
      recipeTemplateId: R.potion,
      catalystTemplateId: ID.essence,
      modifier1TemplateId: ID.modA,
    });
    expect(countOf(ctx, ID.potion)).toBe(1n);
    expect(countOf(ctx, ID.essence)).toBe(1n);
    expect(countOf(ctx, ID.modA)).toBe(1n);
    expect(countOf(ctx, ID.t1)).toBe(4n);
    expect(messages(ctx)).toEqual(['You craft Test Potion.']);
  });

  it('a gear recipe with reagents but no essence crafts and leaves the reagents untouched', () => {
    const ctx = newCtx([...plentyOfMaterials(), stack(ID.modA, 1n)]);
    craft(ctx, { recipeTemplateId: R.weaponT2, modifier1TemplateId: ID.modA });
    expect(crafted(ctx, ID.weapon)).toHaveLength(1);
    expect(countOf(ctx, ID.modA)).toBe(1n);
    expect(rows(ctx, 'item_affix').filter((a) => a.affixType === 'suffix')).toEqual([]);
  });
});

describe('craft_recipe earlier checks still change nothing', () => {
  it('no crafting station', () => {
    const ctx = newCtx(plentyOfMaterials(), { craftingAvailable: false });
    expectRefused(
      ctx,
      { recipeTemplateId: R.weaponT1 },
      'Crafting is only available at locations with crafting stations.',
    );
  });

  it('recipe not found', () => {
    const ctx = newCtx(plentyOfMaterials());
    expectRefused(ctx, { recipeTemplateId: R.missing }, 'Recipe not found');
  });

  it('recipe not discovered', () => {
    const ctx = newCtx(plentyOfMaterials(), { discovered: [] });
    expectRefused(ctx, { recipeTemplateId: R.weaponT1 }, 'Recipe not discovered');
  });
});
