import { describe, expect, it } from 'vitest';
import { PhCube } from '@phosphor-icons/vue';
import {
  MATERIAL_DEFS,
  SALVAGE_REAGENT_CHANCE_PCT,
  salvageMaterialYield,
  salvageReagentDefs,
} from '@game-data/crafting_rules';
import type { ItemAffix, ItemInstance, ItemTemplate, RecipeTemplate } from '../module_bindings/types';
import { salvagePreview } from './salvagePreview';

function tpl(id: bigint, overrides: Record<string, unknown> = {}): ItemTemplate {
  return {
    id,
    name: `Template ${id}`,
    slot: 'chest',
    armorType: 'cloth',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    vendorValue: 20n,
    ...overrides,
  } as unknown as ItemTemplate;
}

function instance(id: bigint, templateId = 1n): ItemInstance {
  return { id, templateId, ownerCharacterId: 7n, quantity: 1n } as unknown as ItemInstance;
}

function affix(instanceId: bigint, affixType: string, statKey: string, affixName: string): ItemAffix {
  return {
    id: 1n,
    itemInstanceId: instanceId,
    affixType,
    affixKey: affixName,
    affixName,
    statKey,
    magnitude: 2n,
  } as unknown as ItemAffix;
}

function recipe(overrides: Record<string, unknown> = {}): RecipeTemplate {
  return {
    id: 5n,
    key: 'r',
    name: 'Cloth Robe',
    outputTemplateId: 1n,
    outputCount: 1n,
    req1TemplateId: 70n,
    req1Count: 3n,
    req2TemplateId: 71n,
    req2Count: 1n,
    req3TemplateId: undefined,
    req3Count: undefined,
    ...overrides,
  } as unknown as RecipeTemplate;
}

const HIDE_VALUE = MATERIAL_DEFS.find((m) => m.name === 'Rough Hide')!.vendorValue;
const NONE = new Map<bigint, ItemTemplate>();
const base = { instance: instance(10n), characterId: 7n, affixes: [] as ItemAffix[], templates: NONE };

describe('salvagePreview: guaranteed material', () => {
  it('names the shared yield for a tier 1 cloth chest with no recipe', () => {
    const template = tpl(1n);
    const preview = salvagePreview({ ...base, template, outputRecipe: null })!;
    const expected = salvageMaterialYield({
      slot: 'chest',
      armorType: 'cloth',
      tier: 1n,
      itemValue: 20n,
      material: { name: 'Rough Hide', vendorValue: HIDE_VALUE },
      recipeConsumed: 0n,
    })!;
    expect(preview.material).toEqual({ name: 'Rough Hide', count: expected.count });
    expect(preview.countKnown).toBe(true);
    expect(preview.reagentPossible).toBe(false);
    expect(preview.yields).toHaveLength(1);
    expect(preview.yields[0]).toMatchObject({
      name: 'Rough Hide',
      text: `×${expected.count}`,
      chance: false,
      icon: PhCube,
    });
    expect(preview.confirmText).toBe(
      `Salvage destroys this item. You'll get ${expected.count} Rough Hide.`,
    );
  });

  it('caps the count at what the recipe consumed of that material', () => {
    const template = tpl(1n);
    const templates = new Map<bigint, ItemTemplate>([
      [70n, tpl(70n, { name: 'Scrap Cloth', slot: 'material' })],
      [71n, tpl(71n, { name: 'Rough Hide', slot: 'material' })],
    ]);
    const outputRecipe = recipe();
    const preview = salvagePreview({ ...base, template, templates, outputRecipe })!;
    const expected = salvageMaterialYield({
      slot: 'chest',
      armorType: 'cloth',
      tier: 1n,
      itemValue: 20n,
      material: { name: 'Rough Hide', vendorValue: HIDE_VALUE },
      recipeConsumed: 1n,
    })!;
    expect(expected.count).toBe(1n);
    expect(preview.material).toEqual({ name: 'Rough Hide', count: 1n });
    expect(preview.countKnown).toBe(true);
  });

  it('matches a material name case-insensitively when summing the recipe parts', () => {
    const templates = new Map<bigint, ItemTemplate>([
      [70n, tpl(70n, { name: 'rough  hide', slot: 'material' })],
      [71n, tpl(71n, { name: 'Scrap Cloth', slot: 'material' })],
    ]);
    const preview = salvagePreview({ ...base, template: tpl(1n), templates, outputRecipe: recipe() })!;
    expect(preview.material?.count).toBe(
      salvageMaterialYield({
        slot: 'chest',
        armorType: 'cloth',
        tier: 1n,
        itemValue: 20n,
        material: { name: 'Rough Hide', vendorValue: HIDE_VALUE },
        recipeConsumed: 3n,
      })!.count,
    );
  });

  it('does not know the count while a recipe part template is not loaded', () => {
    const templates = new Map<bigint, ItemTemplate>([[70n, tpl(70n, { name: 'Scrap Cloth' })]]);
    const preview = salvagePreview({ ...base, template: tpl(1n), templates, outputRecipe: recipe() })!;
    expect(preview.countKnown).toBe(false);
    expect(preview.yields[0].text).toBe('');
    expect(preview.yields[0].name).toBe('Rough Hide');
    expect(preview.confirmText).toBe("Salvage destroys this item. You'll get Rough Hide.");
  });

  it('does not know the count while the output recipes have not applied (undefined)', () => {
    const preview = salvagePreview({ ...base, template: tpl(1n), outputRecipe: undefined })!;
    expect(preview.countKnown).toBe(false);
    expect(preview.yields[0].text).toBe('');
    expect(preview.confirmText).toBe("Salvage destroys this item. You'll get Rough Hide.");
  });

  it('gives count 0 and no guaranteed line when the item is worth less than one material', () => {
    const preview = salvagePreview({ ...base, template: tpl(1n, { vendorValue: 1n }), outputRecipe: null })!;
    expect(preview.material).toEqual({ name: 'Rough Hide', count: 0n });
    expect(preview.countKnown).toBe(true);
    expect(preview.yields).toEqual([]);
    expect(preview.confirmText).toBe('Salvage destroys this item. Nothing usable will be left.');
  });
});

describe('salvagePreview: reagent', () => {
  const affixes = [affix(10n, 'prefix', 'intBonus', 'of Intelligence'), affix(10n, 'implicit', 'strBonus', 'Quality')];

  it('names the reagent the server would pick when its chance hits', () => {
    const preview = salvagePreview({ ...base, template: tpl(1n), affixes, outputRecipe: null })!;
    const defs = salvageReagentDefs(affixes);
    const pick = defs[Number((10n + 7n) % BigInt(defs.length))];
    expect(preview.reagentPossible).toBe(true);
    const line = preview.yields[preview.yields.length - 1];
    expect(line).toMatchObject({
      name: pick.name,
      text: `${SALVAGE_REAGENT_CHANCE_PCT}% chance`,
      note: 'from “of Intelligence”',
      chance: true,
    });
    expect(preview.confirmText).toContain(', and maybe a reagent.');
  });

  it('picks by instance id plus character id across several affixes', () => {
    const many = [
      affix(10n, 'prefix', 'intBonus', 'of Intelligence'),
      affix(10n, 'suffix', 'strBonus', 'of Strength'),
      affix(10n, 'suffix', 'dexBonus', 'of Dexterity'),
    ];
    const defs = salvageReagentDefs(many);
    expect(defs.length).toBe(3);
    for (const characterId of [7n, 8n, 9n]) {
      const preview = salvagePreview({ ...base, characterId, template: tpl(1n), affixes: many, outputRecipe: null })!;
      const pick = defs[Number((10n + characterId) % 3n)];
      expect(preview.yields[preview.yields.length - 1].name).toBe(pick.name);
    }
  });

  it('ignores implicit-only affixes and affixes of other instances', () => {
    const preview = salvagePreview({
      ...base,
      template: tpl(1n),
      affixes: [affix(10n, 'implicit', 'intBonus', 'Quality'), affix(99n, 'prefix', 'intBonus', 'of Intelligence')],
      outputRecipe: null,
    })!;
    expect(preview.reagentPossible).toBe(false);
    expect(preview.yields.every((y) => !y.chance)).toBe(true);
  });

  it('writes the no materials copy with a reagent', () => {
    const preview = salvagePreview({
      ...base,
      template: tpl(1n, { vendorValue: 1n }),
      affixes,
      outputRecipe: null,
    })!;
    expect(preview.confirmText).toBe(
      "Salvage destroys this item. You'll get no materials, but maybe a reagent.",
    );
  });

  it('adds the reagent clause when the count is unknown', () => {
    const preview = salvagePreview({ ...base, template: tpl(1n), affixes, outputRecipe: undefined })!;
    expect(preview.confirmText).toBe(
      "Salvage destroys this item. You'll get Rough Hide, and maybe a reagent.",
    );
  });
});

describe('salvagePreview: scope', () => {
  it('never lists a scroll line, even for an item with a recipe', () => {
    const preview = salvagePreview({
      ...base,
      template: tpl(1n),
      templates: new Map([
        [70n, tpl(70n, { name: 'Scrap Cloth' })],
        [71n, tpl(71n, { name: 'Rough Hide' })],
      ]),
      outputRecipe: recipe(),
    })!;
    expect(preview.yields.some((y) => y.name.indexOf('Scroll') !== -1)).toBe(false);
    expect(preview.confirmText.toLowerCase()).not.toContain('scroll');
  });

  it('returns null for a material, food or junk template', () => {
    for (const odd of [
      tpl(2n, { slot: 'material' }),
      tpl(3n, { slot: 'food' }),
      tpl(4n, { isJunk: true }),
    ]) {
      expect(salvagePreview({ ...base, template: odd, outputRecipe: null })).toBeNull();
    }
  });

  it('carries markup in an affix name as a plain string', () => {
    const markup = '<img src=x onerror=alert(1)>';
    const preview = salvagePreview({
      ...base,
      template: tpl(1n),
      affixes: [affix(10n, 'prefix', 'intBonus', markup)],
      outputRecipe: null,
    })!;
    expect(preview.yields[preview.yields.length - 1].note).toBe(`from “${markup}”`);
  });
});
