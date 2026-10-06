import { describe, expect, it } from 'vitest';
import { generatedOutput, recipeCandidates } from '@game-data/recipe_rules';
import type { BagMaterial } from '@game-data/recipe_rules';
import type { ItemInstance, ItemTemplate, RecipeDiscovered, RecipeTemplate } from '../module_bindings/types';
import { itemCategory } from '../ledger/itemModel';
import { craftAvailability, recipeDetail, recipeRows } from './craftingModel';
import type { CraftingInput } from './craftingModel';

// Plan 50-25: recipes the server generates from a carried bag are ordinary recipe_template and
// item_template rows, so the Phase 50 crafting model must list, describe and pre-gate them with no
// client change. The rows below are built from the shared generation rules.

const mat = (templateId: bigint, name: string, count: bigint, vendorValue = 1n): BagMaterial => ({
  templateId,
  name,
  tier: 1n,
  vendorValue,
  count,
});

// The 50-23 bag of Elfansworth.
const BAG: BagMaterial[] = [
  mat(49n, 'Lamp Oil', 12n),
  mat(43n, 'Peat', 9n),
  mat(40n, 'Herbs', 18n),
  mat(48n, 'Scrap Cloth', 11n),
  mat(46n, 'Iron Shard', 3n, 2n),
  mat(31n, 'Stone', 11n),
  mat(45n, 'Murky Water', 4n),
  mat(68n, 'Life Stone', 1n, 3n),
];

function materialTemplate(m: BagMaterial): ItemTemplate {
  return {
    id: m.templateId,
    name: m.name,
    slot: 'material',
    armorType: 'none',
    weaponType: '',
    rarity: 'common',
    tier: m.tier,
    isJunk: false,
    vendorValue: m.vendorValue,
    requiredLevel: 1n,
    allowedClasses: 'any',
    stackable: true,
    wellFedDurationMicros: 0n,
  } as unknown as ItemTemplate;
}

const OUTPUT_BASE = 200n;
const RECIPE_BASE = 300n;

const candidates = recipeCandidates(BAG, 1n);
const generated = candidates.map((candidate, index) => {
  const out = generatedOutput(candidate, () => false);
  const outputId = OUTPUT_BASE + BigInt(index);
  const outputTemplate = { id: outputId, ...out.itemTemplate } as unknown as ItemTemplate;
  const recipe = {
    id: RECIPE_BASE + BigInt(index),
    ...out.recipe,
    outputTemplateId: outputId,
  } as unknown as RecipeTemplate;
  return { outputTemplate, recipe };
});

const TEMPLATES = [...BAG.map(materialTemplate), ...generated.map((g) => g.outputTemplate)];
const RECIPES = generated.map((g) => g.recipe);
const ITEMS = BAG.map(
  (m, index) =>
    ({
      id: 1000n + BigInt(index),
      templateId: m.templateId,
      ownerCharacterId: 7n,
      equippedSlot: undefined,
      quantity: m.count,
    }) as unknown as ItemInstance,
);
const KNOWN = RECIPES.map(
  (r, index) => ({ id: BigInt(index + 1), characterId: 7n, recipeTemplateId: r.id }) as unknown as RecipeDiscovered,
);

const input: CraftingInput = {
  known: KNOWN,
  recipes: new Map(RECIPES.map((r) => [r.id, r])),
  templates: new Map(TEMPLATES.map((t) => [t.id, t])),
  items: ITEMS,
};

const byName = (name: string) => {
  const found = generated.find((g) => g.recipe.name === name);
  if (!found) throw new Error(`no generated recipe ${name}`);
  return found;
};

describe('the crafting model shows generated recipes', () => {
  it('generates the four recipes of the 50-23 bag', () => {
    expect(RECIPES.map((r) => r.name)).toEqual(['Iron Shard Dagger', 'Scrap Cloth Robe', 'Stone Pendant', 'Herbal Draught']);
  });

  it('lists the dagger under the weapon tab as craftable with have against need', () => {
    const rows = recipeRows(input, { filter: 'weapon', onlyCraftable: true });
    expect(rows.map((r) => r.name)).toEqual(['Iron Shard Dagger']);
    expect(rows[0].craftable).toBe(true);
    expect(rows[0].meta).toBe('Weapon · T1');
    expect(rows[0].requirements.map((r) => r.text)).toEqual(['Iron Shard 3/3', 'Scrap Cloth 11/1']);
  });

  it('lists one recipe under each other tab and all four under All', () => {
    expect(recipeRows(input, { filter: 'armor', onlyCraftable: true }).map((r) => r.name)).toEqual(['Scrap Cloth Robe']);
    expect(recipeRows(input, { filter: 'accessory', onlyCraftable: true }).map((r) => r.name)).toEqual(['Stone Pendant']);
    expect(recipeRows(input, { filter: 'consumable', onlyCraftable: true }).map((r) => r.name)).toEqual(['Herbal Draught']);
    const all = recipeRows(input, { filter: 'all', onlyCraftable: false });
    expect(all.map((r) => r.name).sort()).toEqual(['Herbal Draught', 'Iron Shard Dagger', 'Scrap Cloth Robe', 'Stone Pendant']);
    expect(all.every((r) => r.craftable)).toBe(true);
  });

  it('describes a gear recipe with its standard quality and one reagent slot', () => {
    const detail = recipeDetail(input, byName('Iron Shard Dagger').recipe.id, 3n)!;
    expect(detail.gear).toBe(true);
    expect(detail.qualityKey).toBe('standard');
    expect(detail.quality).toBe('Standard');
    expect(detail.slots).toBe(1);
  });

  it('describes the food recipe as a consumable with no quality', () => {
    const detail = recipeDetail(input, byName('Herbal Draught').recipe.id, 3n)!;
    expect(detail.gear).toBe(false);
    expect(detail.qualityKey).toBeNull();
    expect(detail.slots).toBe(0);
  });

  it('pre-gates Craft as available at a station and unavailable without one', () => {
    for (const g of generated) {
      const choice = { essenceId: null, reagentIds: [] };
      const base = { recipe: g.recipe, templates: input.templates, items: ITEMS, choice };
      expect(craftAvailability({ ...base, station: true }).available, g.recipe.name).toBe(true);
      const none = craftAvailability({ ...base, station: false });
      expect(none.available).toBe(false);
      expect(none.reason).toBe('No crafting station here.');
    }
  });

  it('categorizes the outputs as gear and food', () => {
    expect(itemCategory(byName('Herbal Draught').outputTemplate)).toBe('food');
    expect(itemCategory(byName('Iron Shard Dagger').outputTemplate)).toBe('gear');
    expect(itemCategory(byName('Scrap Cloth Robe').outputTemplate)).toBe('gear');
    expect(itemCategory(byName('Stone Pendant').outputTemplate)).toBe('gear');
  });
});
