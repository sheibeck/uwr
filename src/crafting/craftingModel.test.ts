import { describe, expect, it } from 'vitest';
import {
  AFFIX_SLOTS_BY_QUALITY,
  ESSENCE_MAGNITUDE,
  getModifierMagnitude,
  planCraft,
} from '@game-data/crafting_rules';
import { MAX_INVENTORY_SLOTS } from '@game-data/inventory_rules';
import { generatedOutput, recipeCandidates } from '@game-data/recipe_rules';
import { PhPackage } from '@phosphor-icons/vue';
import type { ItemInstance, ItemTemplate, RecipeDiscovered, RecipeTemplate } from '../module_bindings/types';
import {
  RECIPE_FILTERS,
  bagCount,
  craftArgs,
  craftAvailability,
  craftCountArgs,
  craftQuantity,
  createsCard,
  essenceOptions,
  materialRows,
  materialsOnHand,
  reagentEffectText,
  reagentOptions,
  recipeCategory,
  recipeDetail,
  recipeRows,
  recipesKnownText,
  stationHere,
  usesRows,
} from './craftingModel';
import { itemIcon } from '../ledger/itemModel';
import type { CraftAvailabilityInput, CraftingInput } from './craftingModel';

const PAYLOAD = '<img src=x onerror=alert(1)>';

function tpl(id: bigint, name: string, overrides: Record<string, unknown> = {}): ItemTemplate {
  return {
    id,
    name,
    slot: 'material',
    armorType: '',
    weaponType: '',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    vendorValue: 2n,
    requiredLevel: 1n,
    allowedClasses: '',
    stackable: true,
    wellFedDurationMicros: 0n,
    ...overrides,
  } as unknown as ItemTemplate;
}

function inst(id: bigint, templateId: bigint, quantity = 1n, overrides: Record<string, unknown> = {}): ItemInstance {
  return {
    id,
    templateId,
    ownerCharacterId: 7n,
    equippedSlot: undefined,
    quantity,
    qualityTier: undefined,
    craftQuality: undefined,
    displayName: undefined,
    ...overrides,
  } as unknown as ItemInstance;
}

function recipe(id: bigint, name: string, over: Record<string, unknown>): RecipeTemplate {
  return {
    id,
    key: `r${id}`,
    name,
    outputTemplateId: 100n,
    outputCount: 1n,
    req1TemplateId: 1n,
    req1Count: 1n,
    req2TemplateId: 4n,
    req2Count: 1n,
    req3TemplateId: undefined,
    req3Count: undefined,
    recipeType: 'weapon',
    materialType: undefined,
    ...over,
  } as unknown as RecipeTemplate;
}

const COPPER = tpl(1n, 'Copper Ore', { tier: 1n });
const IRON = tpl(2n, 'Iron Ore', { tier: 2n });
const DARKSTEEL = tpl(3n, 'Darksteel Ore', { tier: 3n, rarity: 'rare' });
const HIDE = tpl(4n, 'Rough Hide', { tier: 1n });
const LESSER = tpl(10n, 'Lesser Essence', { slot: 'misc' });
const ESSENCE = tpl(11n, 'Essence', { slot: 'misc' });
const GREATER = tpl(12n, 'Greater Essence', { slot: 'misc', rarity: 'epic' });
const STONE = tpl(20n, 'Glowing Stone', { slot: 'misc' });
const RUNE = tpl(21n, 'Ancient Rune', { slot: 'misc' });
const WARD = tpl(22n, 'Iron Ward', { slot: 'misc' });
const SWORD = tpl(100n, 'Copper Sword', { slot: 'mainHand', weaponType: 'sword', tier: 1n, stackable: false, requiredLevel: 1n });
const HELM = tpl(101n, 'Iron Helm', { slot: 'head', armorType: 'plate', tier: 2n, stackable: false, requiredLevel: 6n });
const BLADE = tpl(102n, 'Darksteel Blade', { slot: 'mainHand', weaponType: 'sword', tier: 3n, stackable: false, requiredLevel: 3n });
const BANDAGE = tpl(103n, 'Bandage', { slot: 'consumable', tier: 1n, stackable: true });
const TRINKET = tpl(104n, 'Odd Trinket', { slot: 'misc', tier: 1n, stackable: false });
const JUNK = tpl(105n, 'Rags', { slot: 'misc', isJunk: true });
const TEMPLATES = [COPPER, IRON, DARKSTEEL, HIDE, LESSER, ESSENCE, GREATER, STONE, RUNE, WARD, SWORD, HELM, BLADE, BANDAGE, TRINKET, JUNK];

const R_SWORD = recipe(1n, 'Copper Sword', { outputTemplateId: 100n, req1TemplateId: 1n, req1Count: 3n, req2TemplateId: 4n, req2Count: 1n });
const R_HELM = recipe(2n, 'Iron Helm', {
  outputTemplateId: 101n,
  req1TemplateId: 2n,
  req1Count: 2n,
  req2TemplateId: 4n,
  req2Count: 1n,
  recipeType: 'armor',
});
const R_BLADE = recipe(3n, 'Darksteel Blade', { outputTemplateId: 102n, req1TemplateId: 3n, req1Count: 2n, req2TemplateId: 2n, req2Count: 1n });
const R_BANDAGE = recipe(4n, 'Bandage', {
  outputTemplateId: 103n,
  outputCount: 2n,
  req1TemplateId: 4n,
  req1Count: 2n,
  req2TemplateId: 1n,
  req2Count: 1n,
  recipeType: 'consumable',
});
const R_ODD = recipe(5n, 'Odd Trinket', { outputTemplateId: 104n, recipeType: 'gadget' });
const RECIPES = [R_SWORD, R_HELM, R_BLADE, R_BANDAGE, R_ODD];

function known(...ids: bigint[]): RecipeDiscovered[] {
  return ids.map((id, index) => ({ id: BigInt(index + 1), characterId: 7n, recipeTemplateId: id })) as unknown as RecipeDiscovered[];
}

function input(items: ItemInstance[], over: Partial<CraftingInput> = {}): CraftingInput {
  return {
    known: known(1n, 2n, 3n, 4n, 5n),
    recipes: new Map(RECIPES.map((r) => [r.id, r])),
    templates: new Map(TEMPLATES.map((t) => [t.id, t])),
    items,
    ...over,
  };
}

// Copper 5, Hide 1 (+ an equipped Hide that never counts), Iron 3.
const ITEMS = [
  inst(1n, 1n, 5n),
  inst(2n, 4n, 1n),
  inst(3n, 4n, 4n, { equippedSlot: 'head' }),
  inst(4n, 2n, 3n),
];

describe('categories, counts and the known text', () => {
  it('maps the four recipe types to category words and anything else to null', () => {
    expect(recipeCategory('weapon')).toBe('Weapon');
    expect(recipeCategory('armor')).toBe('Armor');
    expect(recipeCategory('accessory')).toBe('Accessory');
    expect(recipeCategory('consumable')).toBe('Consumable');
    expect(recipeCategory('gadget')).toBeNull();
    expect(recipeCategory(undefined)).toBeNull();
    expect(recipeCategory('constructor')).toBeNull();
    expect(RECIPE_FILTERS.map((f) => f.label)).toEqual(['All', 'Weapon', 'Armor', 'Accessory', 'Consumable']);
  });

  it('bagCount sums quantities of non-equipped instances and ignores an equipped copy', () => {
    expect(bagCount(ITEMS, 4n)).toBe(1n);
    expect(bagCount(ITEMS, 1n)).toBe(5n);
    expect(bagCount([inst(1n, 1n, 2n), inst(2n, 1n, 3n)], 1n)).toBe(5n);
    expect(bagCount(ITEMS, 99n)).toBe(0n);
  });

  it('writes the recipes known text', () => {
    expect(recipesKnownText(1)).toBe('1 recipe known');
    expect(recipesKnownText(0)).toBe('0 recipes known');
    expect(recipesKnownText(5)).toBe('5 recipes known');
  });
});

describe('stationHere', () => {
  it('reads craftingAvailable of the character location and is false while either is unknown', () => {
    const locations = [
      { id: 10n, craftingAvailable: true },
      { id: 11n, craftingAvailable: false },
    ];
    expect(stationHere(10n, locations)).toBe(true);
    expect(stationHere(11n, locations)).toBe(false);
    expect(stationHere(12n, locations)).toBe(false);
    expect(stationHere(null, locations)).toBe(false);
    expect(stationHere(undefined, locations)).toBe(false);
  });
});

describe('recipeRows', () => {
  it('builds requirement entries with the true bag counts and orders craftable first, then by name', () => {
    const rows = recipeRows(input(ITEMS), { filter: 'all', onlyCraftable: false });
    // Sword: Copper 5/3 and Hide 1/1 (the equipped hide is not counted): craftable.
    // Helm: Iron 3/2, Hide 1/1: craftable. Blade: Darksteel 0/2 missing. Bandage: Hide 1/2 missing. Trinket: Copper 5/1, Hide 1/1: craftable.
    expect(rows.map((r) => r.name)).toEqual(['Copper Sword', 'Iron Helm', 'Odd Trinket', 'Bandage', 'Darksteel Blade']);
    const sword = rows[0];
    expect(sword.requirements.map((r) => r.text)).toEqual(['Copper Ore 5/3', 'Rough Hide 1/1']);
    expect(sword.requirements.every((r) => r.met)).toBe(true);
    expect(sword.craftable).toBe(true);
    const bandage = rows.find((r) => r.name === 'Bandage')!;
    expect(bandage.requirements.map((r) => r.text)).toEqual(['Rough Hide 1/2', 'Copper Ore 5/1']);
    expect(bandage.requirements.map((r) => r.met)).toEqual([false, true]);
    expect(bandage.craftable).toBe(false);
  });

  it('gives the category and tier meta and the aria labels', () => {
    const rows = recipeRows(input(ITEMS), { filter: 'all', onlyCraftable: false });
    const byName = (n: string) => rows.find((r) => r.name === n)!;
    expect(byName('Copper Sword').meta).toBe('Weapon · T1');
    expect(byName('Iron Helm').meta).toBe('Armor · T2');
    expect(byName('Copper Sword').ariaLabel).toBe('Copper Sword, Weapon tier 1, can make 1');
    expect(byName('Darksteel Blade').ariaLabel).toBe('Darksteel Blade, Weapon tier 3, missing Darksteel Ore');
    expect(byName('Bandage').ariaLabel).toBe('Bandage, Consumable tier 1, missing Rough Hide');
  });

  it('filters by category; an unknown recipe type shows under All only', () => {
    const only = (filter: 'weapon' | 'armor' | 'consumable' | 'accessory') =>
      recipeRows(input(ITEMS), { filter, onlyCraftable: false }).map((r) => r.name);
    expect(only('weapon')).toEqual(['Copper Sword', 'Darksteel Blade']);
    expect(only('armor')).toEqual(['Iron Helm']);
    expect(only('consumable')).toEqual(['Bandage']);
    expect(only('accessory')).toEqual([]);
    expect(recipeRows(input(ITEMS), { filter: 'all', onlyCraftable: false }).map((r) => r.name)).toContain('Odd Trinket');
    expect(recipeRows(input(ITEMS), { filter: 'all', onlyCraftable: false }).find((r) => r.name === 'Odd Trinket')!.meta).toBe('Other · T1');
  });

  it('applies the only-craftable filter and keeps uncraftable rows when it is off', () => {
    const craftable = recipeRows(input(ITEMS), { filter: 'all', onlyCraftable: true }).map((r) => r.name);
    expect(craftable).toEqual(['Copper Sword', 'Iron Helm', 'Odd Trinket']);
    expect(recipeRows(input(ITEMS), { filter: 'all', onlyCraftable: false })).toHaveLength(5);
  });

  it('leaves out a known recipe whose definition has not arrived', () => {
    const rows = recipeRows(input(ITEMS, { known: known(1n, 99n) }), { filter: 'all', onlyCraftable: false });
    expect(rows.map((r) => r.name)).toEqual(['Copper Sword']);
  });

  it('passes recipe and material names with markup through as plain text', () => {
    const evilRecipe = recipe(9n, PAYLOAD, { req1TemplateId: 50n, req1Count: 1n, req2TemplateId: 4n, req2Count: 1n });
    const evilMaterial = tpl(50n, PAYLOAD);
    const rows = recipeRows(
      input(ITEMS, {
        known: known(9n),
        recipes: new Map([[9n, evilRecipe]]),
        templates: new Map([...TEMPLATES, evilMaterial].map((t) => [t.id, t])),
      }),
      { filter: 'all', onlyCraftable: false },
    );
    expect(rows[0].name).toBe(PAYLOAD);
    expect(rows[0].requirements[0].text).toBe(`${PAYLOAD} 0/1`);
    expect(rows[0].ariaLabel).toContain(PAYLOAD);
  });
});

describe('materialsOnHand', () => {
  it('lists materials, essences and reagents with counts, sorted by name, and skips gear, junk and equipped', () => {
    const items = [
      inst(1n, 1n, 5n),
      inst(2n, 10n, 2n),
      inst(3n, 20n, 1n),
      inst(4n, 100n, 1n),
      inst(5n, 105n, 1n),
      inst(6n, 4n, 4n, { equippedSlot: 'head' }),
      inst(7n, 3n, 2n),
      inst(8n, 1n, 1n),
    ];
    const entries = materialsOnHand(items, new Map(TEMPLATES.map((t) => [t.id, t])));
    expect(entries.map((e) => [e.name, e.count])).toEqual([
      ['Copper Ore', 6n],
      ['Darksteel Ore', 2n],
      ['Glowing Stone', 1n],
      ['Lesser Essence', 2n],
    ]);
  });

  it('colors common names with the plain text color and others by rarity', () => {
    const entries = materialsOnHand([inst(1n, 1n), inst(2n, 3n), inst(3n, 12n)], new Map(TEMPLATES.map((t) => [t.id, t])));
    expect(entries.find((e) => e.name === 'Copper Ore')!.color).toBe('var(--color-text)');
    expect(entries.find((e) => e.name === 'Darksteel Ore')!.color).toBe('var(--color-rarity-rare)');
    expect(entries.find((e) => e.name === 'Greater Essence')!.color).toBe('var(--color-rarity-epic)');
  });

  it('returns nothing for an empty bag', () => {
    expect(materialsOnHand([], new Map(TEMPLATES.map((t) => [t.id, t])))).toEqual([]);
  });
});

describe('recipeDetail', () => {
  const base = (items: ItemInstance[] = ITEMS) => {
    const { known: _known, ...rest } = input(items);
    return rest;
  };

  it('builds the gear meta line with the level short tone and the have-of-need tiles', () => {
    const detail = recipeDetail(base(), 2n, 5n)!;
    expect(detail.name).toBe('Iron Helm');
    expect(detail.gear).toBe(true);
    expect(detail.metaParts).toEqual([
      { text: 'Head', tone: 'normal' },
      { text: 'Plate', tone: 'normal' },
      { text: 'Tier 2', tone: 'normal' },
      { text: 'Requires Lv 6', tone: 'short' },
    ]);
    expect(detail.tiles.map((t) => t.text)).toEqual(['3 of 2', '1 of 1']);
    expect(detail.tiles.map((t) => t.mobileText)).toEqual(['3 / 2', '1 / 1']);
    expect(detail.tiles.map((t) => t.short)).toEqual([false, false]);
    expect(recipeDetail(base(), 2n, 6n)!.metaParts[3].tone).toBe('normal');
  });

  it('uses the same bag count in the tiles as in the list rows', () => {
    const rows = recipeRows(input(ITEMS), { filter: 'all', onlyCraftable: false });
    const detail = recipeDetail(base(), 4n, 5n)!;
    const row = rows.find((r) => r.id === 4n)!;
    expect(detail.tiles.map((t) => t.have)).toEqual(row.requirements.map((r) => r.have));
    expect(detail.tiles.map((t) => t.short)).toEqual([true, false]);
  });

  it('shows one deterministic quality from the first material and the hint that would raise it', () => {
    const standard = recipeDetail(base(), 1n, 5n)!;
    expect(standard.quality).toBe('Standard');
    expect(standard.qualityKey).toBe('standard');
    expect(standard.qualityHint).toBe('A recipe with a tier 2 primary material would make it Reinforced.');
    const reinforced = recipeDetail(base(), 2n, 5n)!;
    expect(reinforced.quality).toBe('Reinforced');
    expect(reinforced.qualityHint).toBe('A recipe with a tier 3 primary material would make it Exquisite.');
    const exquisite = recipeDetail(base(), 3n, 5n)!;
    expect(exquisite.quality).toBe('Exquisite');
    expect(exquisite.qualityHint).toBeNull();
  });

  it('takes the reagent slot count from AFFIX_SLOTS_BY_QUALITY', () => {
    const standard = recipeDetail(base(), 1n, 5n)!;
    expect(standard.slots).toBe(AFFIX_SLOTS_BY_QUALITY.standard);
    expect(standard.slotsLine).toBe('Standard quality takes up to 1 reagent.');
    expect(recipeDetail(base(), 2n, 5n)!.slotsLine).toBe('Reinforced quality takes up to 2 reagents.');
    expect(recipeDetail(base(), 3n, 5n)!.slotsLine).toBe('Exquisite quality takes up to 3 reagents.');
  });

  it('gives a consumable recipe no quality, hint or reagent slots, and appends Makes n', () => {
    const detail = recipeDetail(base(), 4n, 5n)!;
    expect(detail.gear).toBe(false);
    expect(detail.quality).toBeNull();
    expect(detail.qualityHint).toBeNull();
    expect(detail.slotsLine).toBeNull();
    expect(detail.slots).toBe(0);
    expect(detail.metaParts.map((p) => p.text)).toEqual(['Tier 1', 'Makes 2']);
  });

  it('is null for an unknown recipe and passes names through as plain text', () => {
    expect(recipeDetail(base(), 99n, 5n)).toBeNull();
    const evil = recipe(9n, PAYLOAD, {});
    const detail = recipeDetail({ recipes: new Map([[9n, evil]]), templates: new Map(TEMPLATES.map((t) => [t.id, t])), items: ITEMS }, 9n, 5n)!;
    expect(detail.name).toBe(PAYLOAD);
  });
});

describe('essence and reagent options', () => {
  const templates = new Map(TEMPLATES.map((t) => [t.id, t]));
  const items = [inst(1n, 10n, 2n), inst(2n, 11n, 1n), inst(3n, 12n, 1n), inst(4n, 20n, 2n), inst(5n, 21n, 1n), inst(6n, 22n, 1n), inst(7n, 1n, 4n)];

  it('lists on-hand essences, eligible only when the quality gate allows the quality', () => {
    const reinforced = essenceOptions(items, templates, 'reinforced');
    expect(reinforced.map((o) => [o.name, o.eligible, o.hint])).toEqual([
      ['Essence', true, `+${ESSENCE_MAGNITUDE.essence} per reagent`],
      ['Greater Essence', true, `+${ESSENCE_MAGNITUDE.greater_essence} per reagent`],
      ['Lesser Essence', false, 'Too weak for Reinforced quality'],
    ]);
    const exquisite = essenceOptions(items, templates, 'exquisite');
    expect(exquisite.map((o) => [o.name, o.eligible])).toEqual([
      ['Essence', false],
      ['Greater Essence', true],
      ['Lesser Essence', false],
    ]);
    expect(exquisite.find((o) => o.name === 'Lesser Essence')!.have).toBe(2n);
    expect(essenceOptions([], templates, 'standard')).toEqual([]);
  });

  it('hints each reagent with the stat and magnitude for the chosen essence', () => {
    const options = reagentOptions(items, templates, 'essence', []);
    expect(options.map((o) => [o.name, o.hint, o.eligible])).toEqual([
      ['Ancient Rune', `+${getModifierMagnitude('essence', 'intBonus')} INT`, true],
      ['Glowing Stone', `+${getModifierMagnitude('essence', 'strBonus')} STR`, true],
      ['Iron Ward', `+${getModifierMagnitude('essence', 'armorClassBonus')} AC`, true],
    ]);
    expect(reagentEffectText('greater_essence', 'Iron Ward')).toBe('+8 AC');
    expect(reagentEffectText('essence', 'Copper Ore')).toBe('');
  });

  it('makes a reagent unavailable once the slots hold as many as are on hand', () => {
    const taken = reagentOptions(items, templates, 'essence', [21n, 20n, 20n]);
    expect(taken.find((o) => o.name === 'Ancient Rune')!.eligible).toBe(false);
    expect(taken.find((o) => o.name === 'Glowing Stone')!.eligible).toBe(false);
    expect(taken.find((o) => o.name === 'Iron Ward')!.eligible).toBe(true);
    const changing = reagentOptions(items, templates, 'essence', [21n, 20n, 20n], 0);
    expect(changing.find((o) => o.name === 'Ancient Rune')!.eligible).toBe(true);
  });
});

describe('craftAvailability and craftArgs', () => {
  const templates = new Map(TEMPLATES.map((t) => [t.id, t]));
  function avail(over: Partial<CraftAvailabilityInput> & { items?: ItemInstance[] }): ReturnType<typeof craftAvailability> {
    return craftAvailability({
      recipe: R_SWORD,
      station: true,
      templates,
      items: ITEMS,
      choice: { essenceId: null, reagentIds: [] },
      ...over,
    });
  }

  it('is available when the station is here, the materials are on hand and the bag has room', () => {
    const result = avail({});
    expect(result.available).toBe(true);
    expect(result.reason).toBeNull();
  });

  it('puts the missing station first', () => {
    const result = avail({ station: false, items: [] });
    expect(result.available).toBe(false);
    expect(result.reason).toBe('No crafting station here.');
  });

  it('names the first short material with how many are missing', () => {
    const result = avail({ items: [inst(1n, 1n, 1n), inst(2n, 4n, 1n)] });
    expect(result.reason).toBe('Missing 2 Copper Ore.');
    expect(avail({ recipe: R_BANDAGE }).reason).toBe('Missing 1 Rough Hide.');
  });

  it('asks for a reagent when an essence is chosen without one', () => {
    const items = [...ITEMS, inst(10n, 10n, 1n)];
    expect(avail({ items, choice: { essenceId: 10n, reagentIds: [null] } }).reason).toBe(
      'Add a reagent to use the essence, or remove it.',
    );
  });

  it('says an essence is too weak for the quality, and names a missing essence or reagent', () => {
    const items = [...ITEMS, inst(10n, 10n, 1n), inst(11n, 11n, 1n), inst(20n, 20n, 1n)];
    // Lesser Essence on a Reinforced recipe (Iron Ore material).
    expect(
      avail({ recipe: R_HELM, items, choice: { essenceId: 10n, reagentIds: [20n] } }).reason,
    ).toBe('Too weak for Reinforced quality');
    // An essence that is not on hand.
    expect(avail({ items: ITEMS, choice: { essenceId: 11n, reagentIds: [20n] } }).reason).toBe('Missing 1 Essence.');
    // A reagent that is not on hand.
    expect(avail({ items: [...ITEMS, inst(10n, 10n, 1n)], choice: { essenceId: 10n, reagentIds: [20n] } }).reason).toBe(
      'Missing 1 Glowing Stone.',
    );
  });

  it('is available with a valid essence and reagent', () => {
    const items = [...ITEMS, inst(10n, 10n, 1n), inst(20n, 20n, 1n)];
    const result = avail({ items, choice: { essenceId: 10n, reagentIds: [20n] } });
    expect(result.available).toBe(true);
    expect(result.plan && result.plan.ok && result.plan.usesCatalyst).toBe(true);
  });

  it('says the backpack is full when the output cannot fit, and counts the room the consumed materials free', () => {
    const filler: ItemInstance[] = [];
    for (let i = 0; i < MAX_INVENTORY_SLOTS - 2; i += 1) filler.push(inst(BigInt(1000 + i), 99n));
    // 48 filler stacks plus a Copper stack (kept, 8 of 3) and a Hide stack (kept, 3 of 1): full, output cannot stack.
    const full = [...filler, inst(1n, 1n, 8n), inst(2n, 4n, 3n)];
    expect(avail({ items: full }).reason).toBe('Your backpack is full.');
    // The whole Copper stack and the whole Hide stack are consumed, which frees two slots.
    const freed = [...filler, inst(1n, 1n, 3n), inst(2n, 4n, 1n)];
    expect(avail({ items: freed }).available).toBe(true);
    // A stackable output joins an existing stack even when the bag is full.
    const stackFull = [...filler.slice(0, MAX_INVENTORY_SLOTS - 3), inst(5000n, 103n, 4n), inst(1n, 1n, 8n), inst(2n, 4n, 9n)];
    expect(avail({ recipe: R_BANDAGE, items: stackFull }).available).toBe(true);
  });

  it('matches planCraft for the same fixture (parity)', () => {
    const items = [...ITEMS, inst(10n, 10n, 1n), inst(20n, 20n, 1n)];
    const direct = planCraft({
      recipe: R_SWORD,
      primaryMaterialName: 'Copper Ore',
      catalyst: { templateId: 10n, name: 'Lesser Essence' },
      modifiers: [{ templateId: 20n, name: 'Glowing Stone' }],
      countOf: (id) => bagCount(items, id),
    });
    const viaModel = avail({ items, choice: { essenceId: 10n, reagentIds: [20n] } });
    expect(viaModel.plan).toEqual(direct);
    const short = avail({ items: [inst(1n, 1n, 1n), inst(2n, 4n, 1n)] });
    const shortDirect = planCraft({
      recipe: R_SWORD,
      primaryMaterialName: 'Copper Ore',
      catalyst: null,
      modifiers: [],
      countOf: (id) => bagCount([inst(1n, 1n, 1n), inst(2n, 4n, 1n)], id),
    });
    expect(short.plan).toEqual(shortDirect);
  });

  it('sends only the chosen ids and puts reagents in modifier1 to modifier3 in slot order', () => {
    expect(craftArgs(7n, 1n, { essenceId: null, reagentIds: [] })).toEqual({ characterId: 7n, recipeTemplateId: 1n });
    expect(craftArgs(7n, 1n, { essenceId: 10n, reagentIds: [null, 21n, null] })).toEqual({
      characterId: 7n,
      recipeTemplateId: 1n,
      catalystTemplateId: 10n,
      modifier1TemplateId: 21n,
    });
    expect(craftArgs(7n, 3n, { essenceId: 12n, reagentIds: [20n, 21n, 22n] })).toEqual({
      characterId: 7n,
      recipeTemplateId: 3n,
      catalystTemplateId: 12n,
      modifier1TemplateId: 20n,
      modifier2TemplateId: 21n,
      modifier3TemplateId: 22n,
    });
    // Reagents without an essence are never sent.
    expect(craftArgs(7n, 1n, { essenceId: null, reagentIds: [20n] })).toEqual({ characterId: 7n, recipeTemplateId: 1n });
  });
});

// ---------------------------------------------------------------------------------------------
// Plan 50-35: row status, the stepper, the Uses rows, the quality line, the Creates card

describe('recipeRows status (mock 9a)', () => {
  const rowsOf = (items: ItemInstance[]) => recipeRows(input(items), { filter: 'all', onlyCraftable: false });
  const byName = (rows: ReturnType<typeof rowsOf>, name: string) => rows.find((r) => r.name === name)!;

  it('says Can make N for a craftable recipe and Missing with the short material names otherwise', () => {
    const rows = rowsOf(ITEMS);
    const sword = byName(rows, 'Copper Sword');
    expect(sword.canMake).toBe(1n);
    expect(sword.statusText).toBe('Can make 1');
    expect(sword.statusTone).toBe('met');
    const bandage = byName(rows, 'Bandage');
    expect(bandage.canMake).toBe(0n);
    expect(bandage.statusText).toBe('Missing Rough Hide');
    expect(bandage.statusTone).toBe('short');
    expect(byName(rows, 'Darksteel Blade').statusText).toBe('Missing Darksteel Ore');
  });

  it('joins several short materials with a comma and ends the aria label with the status', () => {
    const sword = byName(rowsOf([]), 'Copper Sword');
    expect(sword.statusText).toBe('Missing Copper Ore, Rough Hide');
    expect(sword.ariaLabel).toBe('Copper Sword, Weapon tier 1, missing Copper Ore, Rough Hide');
  });

  it('multiplies the craft count by the output count (a makes-2 recipe with materials for 3 says 6)', () => {
    const bandage = byName(rowsOf([inst(1n, 4n, 6n), inst(2n, 1n, 3n)]), 'Bandage');
    expect(bandage.canMake).toBe(6n);
    expect(bandage.statusText).toBe('Can make 6');
    expect(bandage.ariaLabel).toBe('Bandage, Consumable tier 1, can make 6');
  });

  it('caps Can make at 99 crafts', () => {
    expect(byName(rowsOf([inst(1n, 1n, 900n), inst(2n, 4n, 900n)]), 'Copper Sword').canMake).toBe(99n);
  });

  it('takes the name color and icon from the output template', () => {
    const rows = rowsOf(ITEMS);
    expect(byName(rows, 'Copper Sword').nameColor).toBe('var(--color-text)');
    expect(byName(rows, 'Copper Sword').icon).toBe(itemIcon(SWORD));
    const rare = tpl(102n, 'Darksteel Blade', { slot: 'mainHand', weaponType: 'sword', tier: 3n, rarity: 'rare', stackable: false });
    const templates = new Map(TEMPLATES.map((t) => [t.id, t]));
    templates.set(102n, rare);
    const withRare = recipeRows(input(ITEMS, { templates }), { filter: 'all', onlyCraftable: false });
    expect(byName(withRare, 'Darksteel Blade').nameColor).toBe('var(--color-rarity-rare)');
  });

  it('uses the package icon and the text color while the output template is missing', () => {
    const templates = new Map(TEMPLATES.filter((t) => t.id !== 100n).map((t) => [t.id, t]));
    const rows = recipeRows(input(ITEMS, { templates }), { filter: 'all', onlyCraftable: false });
    const sword = byName(rows, 'Copper Sword');
    expect(sword.icon).toBe(PhPackage);
    expect(sword.nameColor).toBe('var(--color-text)');
  });

  it('keeps the sort order and the craftable flag', () => {
    const rows = rowsOf(ITEMS);
    expect(rows.map((r) => r.name)).toEqual(['Copper Sword', 'Iron Helm', 'Odd Trinket', 'Bandage', 'Darksteel Blade']);
    expect(byName(rows, 'Bandage').craftable).toBe(false);
  });

  it('keeps markup in a missing material name as plain text', () => {
    const evilRecipe = recipe(9n, 'Evil', { req1TemplateId: 50n, req1Count: 1n, req2TemplateId: 4n, req2Count: 1n });
    const evilMaterial = tpl(50n, PAYLOAD);
    const rows = recipeRows(
      input(ITEMS, {
        known: known(9n),
        recipes: new Map([[9n, evilRecipe]]),
        templates: new Map([...TEMPLATES, evilMaterial].map((t) => [t.id, t])),
      }),
      { filter: 'all', onlyCraftable: false },
    );
    expect(rows[0].statusText).toBe(`Missing ${PAYLOAD}`);
  });
});

describe('craftQuantity', () => {
  const templates = new Map(TEMPLATES.map((t) => [t.id, t]));
  // Copper 9 and Hide 3: the sword (3 Copper + 1 Hide) allows 3.
  const forThree = [inst(1n, 1n, 9n), inst(2n, 4n, 3n)];
  const qty = (over: Partial<CraftAvailabilityInput>, requested: bigint) =>
    craftQuantity(
      { recipe: R_SWORD, station: true, templates, items: forThree, choice: { essenceId: null, reagentIds: [] }, ...over },
      requested,
    );

  it('clamps the request to the maximum and writes the labels', () => {
    const state = qty({}, 5n);
    expect(state.quantity).toBe(3n);
    expect(state.max).toBe(3n);
    expect(state.made).toBe(3n);
    expect(state.canIncrease).toBe(false);
    expect(state.canDecrease).toBe(true);
    expect(state.maxLabel).toBe('Max 3');
    expect(state.craftLabel).toBe('Craft 3× Copper Sword');
    expect(state.forQtyText).toBe('for 3 crafts');
    expect(state.craftAriaLabel).toBe('Craft 3 Copper Sword');
  });

  it('says plain Craft for one, and treats a request below one as one', () => {
    const one = qty({}, 1n);
    expect(one.quantity).toBe(1n);
    expect(one.craftLabel).toBe('Craft Copper Sword');
    expect(one.forQtyText).toBe('');
    expect(one.canIncrease).toBe(true);
    expect(one.canDecrease).toBe(false);
    expect(qty({}, 0n).quantity).toBe(1n);
    expect(qty({}, -4n).quantity).toBe(1n);
  });

  it('multiplies by the output count for the made number', () => {
    const items = [inst(1n, 4n, 6n), inst(2n, 1n, 3n)];
    const state = qty({ recipe: R_BANDAGE, items }, 1n);
    expect(state.max).toBe(3n);
    expect(state.made).toBe(2n);
    expect(state.craftLabel).toBe('Craft 2× Bandage');
    expect(state.craftAriaLabel).toBe('Craft 2 Bandage');
    const two = qty({ recipe: R_BANDAGE, items }, 2n);
    expect(two.made).toBe(4n);
    expect(two.forQtyText).toBe('for 2 crafts');
  });

  it('is Missing materials with a quantity of one and no stepping at a maximum of zero', () => {
    const state = qty({ items: [inst(1n, 1n, 1n)] }, 4n);
    expect(state.max).toBe(0n);
    expect(state.quantity).toBe(1n);
    expect(state.canDecrease).toBe(false);
    expect(state.canIncrease).toBe(false);
    expect(state.craftLabel).toBe('Missing materials');
    expect(state.maxLabel).toBe('Max 0');
    expect(state.craftAriaLabel).toBe('Missing materials for Copper Sword');
  });

  it('limits the maximum by the chosen essence and reagent (materials for 5, 2 essences)', () => {
    const items = [inst(1n, 1n, 15n), inst(2n, 4n, 5n), inst(3n, 10n, 2n), inst(4n, 20n, 9n)];
    const state = qty({ items, choice: { essenceId: 10n, reagentIds: [20n] } }, 9n);
    expect(state.max).toBe(2n);
    expect(state.quantity).toBe(2n);
    // An essence with no reagent is refused by the plan, so nothing can be crafted yet.
    expect(qty({ items, choice: { essenceId: 10n, reagentIds: [null] } }, 1n).max).toBe(0n);
  });

  it('caps the maximum at 99', () => {
    const state = qty({ items: [inst(1n, 1n, 500n), inst(2n, 4n, 500n)] }, 500n);
    expect(state.max).toBe(99n);
    expect(state.quantity).toBe(99n);
    expect(state.maxLabel).toBe('Max 99');
  });
});

describe('craftAvailability with a count', () => {
  const templates = new Map(TEMPLATES.map((t) => [t.id, t]));
  const base = { recipe: R_SWORD, station: true, templates, choice: { essenceId: null, reagentIds: [] } };

  it('checks the whole batch and names the shortfall for that many crafts', () => {
    // Copper 6 and Hide 2: two crafts fit, three need 9 Copper and 3 Hide.
    const items = [inst(1n, 1n, 6n), inst(2n, 4n, 2n)];
    expect(craftAvailability({ ...base, items, count: 2n }).available).toBe(true);
    const three = craftAvailability({ ...base, items, count: 3n });
    expect(three.available).toBe(false);
    expect(three.reason).toBe('Missing 3 Copper Ore.');
  });

  it('is unchanged when the count is omitted or one', () => {
    const items = [inst(1n, 1n, 3n), inst(2n, 4n, 1n)];
    expect(craftAvailability({ ...base, items }).available).toBe(true);
    expect(craftAvailability({ ...base, items, count: 1n }).available).toBe(true);
  });

  it('keeps the station reason first with a count', () => {
    expect(craftAvailability({ ...base, items: [], station: false, count: 4n }).reason).toBe('No crafting station here.');
  });
});

describe('craftCountArgs', () => {
  it('is craftArgs plus the count', () => {
    expect(craftCountArgs(7n, 1n, { essenceId: null, reagentIds: [] }, 3n)).toEqual({
      characterId: 7n,
      recipeTemplateId: 1n,
      count: 3n,
    });
    expect(craftCountArgs(7n, 3n, { essenceId: 12n, reagentIds: [20n, null, 22n] }, 99n)).toEqual({
      ...craftArgs(7n, 3n, { essenceId: 12n, reagentIds: [20n, null, 22n] }),
      count: 99n,
    });
    expect(craftCountArgs(7n, 1n, { essenceId: null, reagentIds: [20n] }, 2n)).toEqual({
      characterId: 7n,
      recipeTemplateId: 1n,
      count: 2n,
    });
  });
});

describe('usesRows', () => {
  const templates = new Map(TEMPLATES.map((t) => [t.id, t]));

  it('lists each requirement with have, need times the quantity and the short flag', () => {
    const rows = usesRows(R_SWORD, templates, ITEMS, 2n);
    expect(rows.map((r) => [r.name, r.have, r.need, r.short, r.text])).toEqual([
      ['Copper Ore', 5n, 6n, true, '5 / 6'],
      ['Rough Hide', 1n, 2n, true, '1 / 2'],
    ]);
    const one = usesRows(R_SWORD, templates, ITEMS, 1n);
    expect(one.map((r) => [r.need, r.short])).toEqual([
      [3n, false],
      [1n, false],
    ]);
  });

  it('carries the rarity name color and the item icon, with fallbacks for a missing template', () => {
    const rows = usesRows(R_BLADE, templates, ITEMS, 1n);
    expect(rows[0].name).toBe('Darksteel Ore');
    expect(rows[0].color).toBe('var(--color-rarity-rare)');
    expect(rows[0].icon).toBe(itemIcon(DARKSTEEL));
    expect(rows[1].color).toBe('var(--color-text)');
    const missing = usesRows(recipe(9n, 'X', { req1TemplateId: 77n }), templates, ITEMS, 1n);
    expect(missing[0].name).toBe('Unknown material');
    expect(missing[0].icon).toBe(PhPackage);
  });

  it('includes a third requirement and passes markup as plain text', () => {
    const three = recipe(9n, 'Three', { req3TemplateId: 2n, req3Count: 2n });
    expect(usesRows(three, templates, ITEMS, 3n).map((r) => r.need)).toEqual([3n, 3n, 6n]);
    const evil = new Map(templates);
    evil.set(1n, tpl(1n, PAYLOAD));
    expect(usesRows(R_SWORD, evil, ITEMS, 1n)[0].name).toBe(PAYLOAD);
  });
});

describe('recipeDetail quality line', () => {
  const base = (items: ItemInstance[] = ITEMS) => {
    const { known: _known, ...rest } = input(items);
    return rest;
  };
  const withOutput = (id: bigint, over: Record<string, unknown>) => {
    const parts = base();
    const templates = new Map(parts.templates);
    templates.set(id, { ...templates.get(id)!, ...over } as ItemTemplate);
    return { ...parts, templates };
  };

  it('names the tier word, the bonus and the material that sets it', () => {
    // R_BLADE is Darksteel (tier 3, exquisite): +2 damage on a weapon.
    const blade = withOutput(102n, { weaponBaseDamage: 4n });
    expect(recipeDetail(blade, 3n, 5n)!.qualityLine).toBe('Quality: Exquisite (+2 damage), set by Tier 3 Darksteel Ore');
    const ironWeapon = recipe(6n, 'Iron Dagger', { outputTemplateId: 100n, req1TemplateId: 2n, req1Count: 1n });
    const parts = withOutput(100n, { weaponBaseDamage: 4n });
    const reinforced = recipeDetail({ ...parts, recipes: new Map([[6n, ironWeapon]]) }, 6n, 5n)!;
    expect(reinforced.qualityLine).toBe('Quality: Reinforced (+1 damage), set by Tier 2 Iron Ore');
  });

  it('says armor for an armor output and leaves the bonus out at the standard quality', () => {
    const armor = withOutput(101n, { armorClassBonus: 5n });
    expect(recipeDetail(armor, 2n, 5n)!.qualityLine).toBe('Quality: Reinforced (+1 armor), set by Tier 2 Iron Ore');
    const copperArmor = recipe(7n, 'Copper Vest', { outputTemplateId: 101n, recipeType: 'armor' });
    expect(recipeDetail({ ...armor, recipes: new Map([[7n, copperArmor]]) }, 7n, 5n)!.qualityLine).toBe(
      'Quality: Standard, set by Tier 1 Copper Ore',
    );
  });

  it('gives exquisite armor +2 armor and has no line for a consumable', () => {
    const armor = withOutput(101n, { armorClassBonus: 5n });
    const darkArmor = recipe(8n, 'Dark Helm', { outputTemplateId: 101n, recipeType: 'armor', req1TemplateId: 3n });
    expect(recipeDetail({ ...armor, recipes: new Map([[8n, darkArmor]]) }, 8n, 5n)!.qualityLine).toBe(
      'Quality: Exquisite (+2 armor), set by Tier 3 Darksteel Ore',
    );
    expect(recipeDetail(base(), 4n, 5n)!.qualityLine).toBeNull();
  });

  it('drops the bonus when the output has neither armor nor damage', () => {
    expect(recipeDetail(base(), 2n, 5n)!.qualityLine).toBe('Quality: Reinforced, set by Tier 2 Iron Ore');
  });
});

describe('createsCard', () => {
  const character = { level: 5n, vendorSellMod: 100n };
  const generated = () => {
    const candidate = recipeCandidates(
      [
        { templateId: 46n, name: 'Iron Shard', tier: 1n, vendorValue: 2n, count: 3n },
        { templateId: 48n, name: 'Scrap Cloth', tier: 1n, vendorValue: 1n, count: 11n },
      ],
      1n,
    ).find((c) => c.category === 'weapon')!;
    return generatedOutput(candidate, () => false).itemTemplate;
  };
  const dagger = (over: Record<string, unknown> = {}) =>
    tpl(9n, 'Iron Shard Dagger', { ...generated(), id: 9n, stackable: false, vendorValue: 7n, ...over });
  const makes = (template: ItemTemplate, outputCount = 1n) => {
    const r = recipe(20n, template.name, { outputTemplateId: template.id, outputCount });
    return createsCard(r, new Map([[template.id, template]]), character, []);
  };

  it('gives the icon, rarity color, yield tag and the item details', () => {
    const template = dagger({ rarity: 'rare' });
    const card = makes(template, 1n)!;
    expect(card.name).toBe('Iron Shard Dagger');
    expect(card.color).toBe('var(--color-rarity-rare)');
    expect(card.icon).toBe(itemIcon(template));
    expect(card.yieldTag).toBe('');
    expect(card.details.stats.map((s) => `${s.label} ${s.text}`)).toEqual(['Damage 4', 'DPS 5']);
    expect(card.details.meta).toMatch(/^Sells for /);
  });

  it('shows the rule-based description and still shows the stats with the old two-material one', () => {
    const fresh = makes(dagger())!;
    expect(fresh.details.description).toContain('4 base damage at 5 DPS');
    const old = makes(dagger({ description: 'Crafted from Iron Shard and Scrap Cloth.' }))!;
    expect(old.details.description).toBe('Crafted from Iron Shard and Scrap Cloth.');
    expect(old.details.stats.map((s) => s.label)).toEqual(['Damage', 'DPS']);
  });

  it('tags a makes-many output with x and the count', () => {
    expect(makes(dagger(), 3n)!.yieldTag).toBe('x3');
  });

  it('is null while the output template is missing', () => {
    expect(createsCard(recipe(20n, 'X', { outputTemplateId: 999n }), new Map(), character, [])).toBeNull();
  });

  it('keeps markup in the name and description as plain text', () => {
    const card = makes(dagger({ name: PAYLOAD, description: PAYLOAD }))!;
    expect(card.name).toBe(PAYLOAD);
    expect(card.details.description).toBe(PAYLOAD);
  });
});

describe('materialRows', () => {
  const templates = new Map(TEMPLATES.map((t) => [t.id, t]));

  it('adds the icon, highlights the used materials and marks a zero count short', () => {
    const items = [inst(1n, 1n, 5n), inst(2n, 3n, 2n)];
    const rows = materialRows(items, templates, new Set([1n]));
    expect(rows.map((r) => [r.name, r.count, r.highlighted, r.short])).toEqual([
      ['Copper Ore', 5n, true, false],
      ['Darksteel Ore', 2n, false, false],
    ]);
    expect(rows[0].icon).toBe(itemIcon(COPPER));
    expect(rows[1].color).toBe('var(--color-rarity-rare)');
  });

  it('includes a used material with none on hand, sorted by name', () => {
    const rows = materialRows([inst(1n, 3n, 2n)], templates, new Set([1n, 4n]));
    expect(rows.map((r) => [r.name, r.count, r.highlighted, r.short])).toEqual([
      ['Copper Ore', 0n, true, true],
      ['Darksteel Ore', 2n, false, false],
      ['Rough Hide', 0n, true, true],
    ]);
  });

  it('skips a used template that has not loaded and passes names through as text', () => {
    expect(materialRows([], templates, new Set([999n]))).toEqual([]);
    const evil = new Map(templates);
    evil.set(1n, tpl(1n, PAYLOAD));
    expect(materialRows([inst(1n, 1n)], evil, new Set())[0].name).toBe(PAYLOAD);
  });
});
