import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PhCube } from '@phosphor-icons/vue';
import {
  MATERIAL_DEFS,
  SALVAGE_COMPONENT_CHANCE_PCT,
  SALVAGE_REAGENT_CHANCE_PCT,
  salvageComponents,
  salvageReagentDefs,
} from '@game-data/crafting_rules';
import type { ItemAffix, ItemInstance, ItemTemplate, RecipeTemplate } from '../module_bindings/types';
import { salvagePreview } from './salvagePreview';
import type { SalvagePreview, SalvagePreviewInput } from './salvagePreview';

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

// Every confirm text the file produced, to assert the wording has no digit.
const seen: string[] = [];
function preview(input: SalvagePreviewInput): SalvagePreview {
  const result = salvagePreview(input)!;
  seen.push(result.confirmText);
  return result;
}

/** Recipe part templates: Rough Hide x3 and Scrap Cloth x1 by default. */
function parts(primary = 'Rough Hide', secondary = 'Scrap Cloth', primaryValue = 2n): Map<bigint, ItemTemplate> {
  return new Map<bigint, ItemTemplate>([
    [70n, tpl(70n, { name: primary, slot: 'material', vendorValue: primaryValue })],
    [71n, tpl(71n, { name: secondary, slot: 'material', vendorValue: 1n })],
  ]);
}

describe('salvagePreview: a chance at a smaller return', () => {
  it('names the slot material for a tier 1 cloth chest with no recipe, in chance wording', () => {
    const template = tpl(1n);
    const result = preview({ ...base, template, outputRecipe: null });
    expect(result.knowable).toBe(true);
    expect(result.reagentPossible).toBe(false);
    expect(result.components).toEqual([{ templateId: null, name: 'Rough Hide', amount: 1n, chancePct: 50n }]);
    expect(result.yields).toHaveLength(1);
    expect(result.yields[0]).toMatchObject({
      key: 'component:rough_hide',
      name: 'Rough Hide',
      note: '',
      text: '×1 · 50% chance',
      icon: PhCube,
    });
    expect(result.confirmText).toBe('Salvage destroys this item. It may return some Rough Hide.');
  });

  it('a recipe of 3 Rough Hide and 1 Scrap Cloth gives Rough Hide at half, and no Scrap Cloth line', () => {
    const result = preview({ ...base, template: tpl(1n), templates: parts(), outputRecipe: recipe() });
    expect(result.knowable).toBe(true);
    expect(result.components).toEqual([{ templateId: 70n, name: 'Rough Hide', amount: 1n, chancePct: 50n }]);
    expect(result.yields.map((y) => y.name)).toEqual(['Rough Hide']);
    expect(result.yields[0].text).toBe('×1 · 50% chance');
    expect(result.confirmText).toBe('Salvage destroys this item. It may return some Rough Hide.');
  });

  it('a tier 3 input is unlikely and named as rare', () => {
    const result = preview({
      ...base,
      template: tpl(1n),
      templates: parts('Darksteel Ore', 'Scrap Cloth', 8n),
      outputRecipe: recipe(),
    });
    expect(result.components).toEqual([{ templateId: 70n, name: 'Darksteel Ore', amount: 1n, chancePct: 10n }]);
    expect(result.yields[0]).toMatchObject({ name: 'Darksteel Ore', note: 'unlikely', text: '×1 · 10% chance' });
    expect(result.confirmText).toBe('Salvage destroys this item. It may rarely return Darksteel Ore.');
  });

  it('a tier 2 input at 25% is likely, not unlikely', () => {
    const result = preview({
      ...base,
      template: tpl(1n),
      templates: parts('Iron Ore', 'Scrap Cloth', 4n),
      outputRecipe: recipe(),
    });
    expect(result.yields[0]).toMatchObject({ name: 'Iron Ore', note: '', text: '×1 · 25% chance' });
    expect(result.confirmText).toBe('Salvage destroys this item. It may return some Iron Ore.');
  });

  // IN-08 (iteration 3): the likely line is the server's tier 2 chance, not a client copy of 25.
  it('reads the likely threshold from the server tier chances', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/ledger/salvagePreview.ts'), 'utf8');
    expect(source).toContain('const LIKELY_PCT = SALVAGE_COMPONENT_CHANCE_PCT[2];');
    expect(source).not.toMatch(/25n/);
    expect(SALVAGE_COMPONENT_CHANCE_PCT[2]).toBe(25n);
  });

  it('a likely and a rare component together', () => {
    const templates = parts('Rough Hide', 'Darksteel Ore', 2n);
    templates.set(71n, tpl(71n, { name: 'Darksteel Ore', slot: 'material', vendorValue: 8n }));
    const result = preview({
      ...base,
      template: tpl(1n),
      templates,
      outputRecipe: recipe({ req2Count: 3n }),
    });
    expect(result.components.map((c) => c.name)).toEqual(['Rough Hide', 'Darksteel Ore']);
    expect(result.confirmText).toBe(
      'Salvage destroys this item. It may return some Rough Hide. Darksteel Ore rarely comes back.',
    );
  });

  it('two rare components come back as "rarely come back"', () => {
    const templates = new Map<bigint, ItemTemplate>([
      [70n, tpl(70n, { name: 'Darksteel Ore', slot: 'material', vendorValue: 1n })],
      [71n, tpl(71n, { name: 'Void Crystal', slot: 'material', vendorValue: 1n })],
      [72n, tpl(72n, { name: 'Rough Hide', slot: 'material', vendorValue: 1n })],
    ]);
    const result = preview({
      ...base,
      template: tpl(1n),
      templates,
      outputRecipe: recipe({ req1Count: 3n, req2Count: 3n, req3TemplateId: 72n, req3Count: 3n }),
    });
    expect(result.components.map((c) => c.name)).toEqual(['Darksteel Ore', 'Void Crystal', 'Rough Hide']);
    expect(result.confirmText).toBe(
      'Salvage destroys this item. It may return some Rough Hide. Darksteel Ore and Void Crystal rarely come back.',
    );
  });

  it('lists the 4th requirement of a 4-requirement recipe as a possible component (51.3)', () => {
    const templates = new Map<bigint, ItemTemplate>([
      [70n, tpl(70n, { name: 'Peat Moss', slot: 'material', vendorValue: 1n })],
      [71n, tpl(71n, { name: 'Rough Hide', slot: 'material', vendorValue: 1n })],
      [72n, tpl(72n, { name: 'Bog Iron', slot: 'material', vendorValue: 1n })],
      [73n, tpl(73n, { name: 'Tide Pearl', slot: 'material', vendorValue: 1n })],
    ]);
    const result = preview({
      ...base,
      template: tpl(1n),
      templates,
      outputRecipe: recipe({
        req1Count: 3n,
        req2Count: 3n,
        req3TemplateId: 72n,
        req3Count: 3n,
        req4TemplateId: 73n,
        req4Count: 3n,
      }),
    });
    expect(result.components.map((c) => c.name)).toEqual(['Peat Moss', 'Rough Hide', 'Bog Iron', 'Tide Pearl']);
  });

  it('nothing usable: an item worth less than one material says so', () => {
    const result = preview({ ...base, template: tpl(1n, { vendorValue: 1n }), outputRecipe: null });
    expect(result.components).toEqual([]);
    expect(result.yields).toEqual([]);
    expect(result.confirmText).toBe('Salvage destroys this item. Nothing usable will come of it.');
  });

  it('a recipe whose inputs are all single units also gives nothing', () => {
    const result = preview({
      ...base,
      template: tpl(1n),
      templates: parts(),
      outputRecipe: recipe({ req1Count: 1n }),
    });
    expect(result.components).toEqual([]);
    expect(result.confirmText).toBe('Salvage destroys this item. Nothing usable will come of it.');
  });

  it('is not knowable while a recipe part template is not loaded', () => {
    const templates = new Map<bigint, ItemTemplate>([[70n, tpl(70n, { name: 'Scrap Cloth' })]]);
    const result = preview({ ...base, template: tpl(1n), templates, outputRecipe: recipe() });
    expect(result.knowable).toBe(false);
    expect(result.components).toEqual([]);
    expect(result.yields).toEqual([]);
    expect(result.confirmText).toBe('Salvage destroys this item. It may return some materials.');
  });

  it('is not knowable while the output recipes have not applied (undefined)', () => {
    const result = preview({ ...base, template: tpl(1n), outputRecipe: undefined });
    expect(result.knowable).toBe(false);
    expect(result.components).toEqual([]);
    expect(result.confirmText).toBe('Salvage destroys this item. It may return some materials.');
  });

  it('parity: the components equal the shared rule called with the same recipe parts', () => {
    const templates = parts('Copper Ore', 'Iron Ore', 2n);
    const outputRecipe = recipe({ req1Count: 6n, req2Count: 4n });
    const result = preview({ ...base, template: tpl(1n), templates, outputRecipe });
    const expected = salvageComponents({
      slot: 'chest',
      armorType: 'cloth',
      tier: 1n,
      itemValue: 20n,
      recipes: [
        {
          id: 5n,
          outputCount: 1n,
          parts: [
            { templateId: 70n, name: 'Copper Ore', count: 6n, vendorValue: 2n },
            { templateId: 71n, name: 'Iron Ore', count: 4n, vendorValue: 1n },
          ],
        },
      ],
      slotMaterial: null,
    });
    expect(expected.length).toBeGreaterThan(0);
    expect(result.components).toEqual(expected);
  });

  it('parity: with no recipe the slot material is valued from MATERIAL_DEFS', () => {
    const result = preview({ ...base, template: tpl(1n), outputRecipe: null });
    expect(result.components).toEqual(
      salvageComponents({
        slot: 'chest',
        armorType: 'cloth',
        tier: 1n,
        itemValue: 20n,
        recipes: [],
        slotMaterial: { name: 'Rough Hide', vendorValue: HIDE_VALUE },
      }),
    );
  });
});

describe('salvagePreview: reagent', () => {
  const affixes = [affix(10n, 'prefix', 'intBonus', 'of Intelligence'), affix(10n, 'implicit', 'strBonus', 'Quality')];

  it('names the reagent the server would pick when its chance hits', () => {
    const result = preview({ ...base, template: tpl(1n), affixes, outputRecipe: null });
    const defs = salvageReagentDefs(affixes);
    const pick = defs[Number((10n + 7n) % BigInt(defs.length))];
    expect(result.reagentPossible).toBe(true);
    const line = result.yields[result.yields.length - 1];
    expect(line).toMatchObject({
      key: 'reagent',
      name: pick.name,
      text: `${SALVAGE_REAGENT_CHANCE_PCT}% chance`,
      note: 'from “of Intelligence”',
    });
    expect(result.confirmText).toBe(
      'Salvage destroys this item. It may return some Rough Hide. It may also give a reagent.',
    );
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
      const result = preview({ ...base, characterId, template: tpl(1n), affixes: many, outputRecipe: null });
      const pick = defs[Number((10n + characterId) % 3n)];
      expect(result.yields[result.yields.length - 1].name).toBe(pick.name);
    }
  });

  it('ignores implicit-only affixes and affixes of other instances', () => {
    const result = preview({
      ...base,
      template: tpl(1n),
      affixes: [affix(10n, 'implicit', 'intBonus', 'Quality'), affix(99n, 'prefix', 'intBonus', 'of Intelligence')],
      outputRecipe: null,
    });
    expect(result.reagentPossible).toBe(false);
    expect(result.yields.some((y) => y.key === 'reagent')).toBe(false);
  });

  it('only a possible reagent', () => {
    const result = preview({ ...base, template: tpl(1n, { vendorValue: 1n }), affixes, outputRecipe: null });
    expect(result.components).toEqual([]);
    expect(result.confirmText).toBe('Salvage destroys this item. It may give a reagent.');
  });

  it('adds the reagent sentence when the recipe parts are not known', () => {
    const result = preview({ ...base, template: tpl(1n), affixes, outputRecipe: undefined });
    expect(result.confirmText).toBe(
      'Salvage destroys this item. It may return some materials. It may also give a reagent.',
    );
  });
});

describe('salvagePreview: scope', () => {
  it('never lists a scroll line, even for an item with a recipe', () => {
    const result = preview({
      ...base,
      template: tpl(1n),
      templates: parts(),
      outputRecipe: recipe(),
    });
    expect(result.yields.some((y) => y.name.indexOf('Scroll') !== -1)).toBe(false);
    expect(result.confirmText.toLowerCase()).not.toContain('scroll');
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
    const result = preview({
      ...base,
      template: tpl(1n),
      affixes: [affix(10n, 'prefix', 'intBonus', markup)],
      outputRecipe: null,
    });
    expect(result.yields[result.yields.length - 1].note).toBe(`from “${markup}”`);
  });

  it('carries markup in a material name as a plain string', () => {
    const markup = '<img src=x onerror=alert(1)>';
    const result = preview({
      ...base,
      template: tpl(1n),
      templates: parts(markup),
      outputRecipe: recipe(),
    });
    expect(result.components[0].name).toBe(markup);
    expect(result.yields[0].name).toBe(markup);
  });

  it('never promises a count: no confirm text in this file has a digit', () => {
    expect(seen.length).toBeGreaterThan(10);
    for (const text of seen) {
      if (text.indexOf('<img') !== -1) continue;
      expect(text, text).not.toMatch(/\d/);
    }
    for (const text of seen) expect(text).not.toContain("You'll get");
  });
});
