import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  AFFIX_SLOTS_BY_QUALITY,
  CRAFTING_MODIFIER_DEFS,
  ESSENCE_MAGNITUDE,
  MATERIAL_DEFS,
  craftQualityForMaterialName,
  craftQualityUpgrade,
  getModifierMagnitude,
  isGearRecipe,
  itemKeyFromName,
  planCraft,
} from './crafting_rules';
import type { CraftPlanInput } from './crafting_rules';

function importSpecifiers(fileName: string): string[] {
  const path = fileURLToPath(new URL(`./${fileName}`, import.meta.url));
  const source = readFileSync(path, 'utf8');
  const out: string[] = [];
  const re = /from\s+'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) out.push(m[1]);
  return out;
}

const title = (key: string) =>
  key
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

// Fixture names are read from the module, not guessed.
const nameForTier = (tier: bigint) => MATERIAL_DEFS.find((m) => m.tier === tier)!.name;
const T1 = nameForTier(1n);
const T2 = nameForTier(2n);
const T3 = nameForTier(3n);
const LESSER = title('lesser_essence');
const ESSENCE = title('essence');
const GREATER = title('greater_essence');
const MOD_A = CRAFTING_MODIFIER_DEFS[0];
const MOD_B = CRAFTING_MODIFIER_DEFS[1];

// Template ids used by the fixtures.
const REQ1 = 1n;
const REQ2 = 2n;
const REQ3 = 3n;
const CAT = 50n;
const MA = 60n;
const MB = 61n;

const gearRecipe = {
  req1TemplateId: REQ1,
  req1Count: 2n,
  req2TemplateId: REQ2,
  req2Count: 1n,
  req3TemplateId: null,
  req3Count: null,
  recipeType: 'weapon',
};

function counts(map: Record<string, bigint>) {
  return (id: bigint) => map[id.toString()] ?? 0n;
}

function input(over: Partial<CraftPlanInput> & { have?: Record<string, bigint> }): CraftPlanInput {
  const { have, ...rest } = over;
  return {
    recipe: gearRecipe,
    primaryMaterialName: T2,
    catalyst: null,
    modifiers: [],
    countOf: counts(have ?? { '1': 5n, '2': 5n }),
    ...rest,
  };
}

describe('itemKeyFromName', () => {
  it('lowercases and turns each whitespace run into one underscore', () => {
    expect(itemKeyFromName('Darksteel  Ore')).toBe('darksteel_ore');
    expect(itemKeyFromName('Lesser Essence')).toBe('lesser_essence');
  });
});

describe('craftQualityForMaterialName', () => {
  it('maps tier 1, 2 and 3 materials to standard, reinforced and exquisite', () => {
    expect(craftQualityForMaterialName(T1)).toBe('standard');
    expect(craftQualityForMaterialName(T2)).toBe('reinforced');
    expect(craftQualityForMaterialName(T3)).toBe('exquisite');
  });

  it('an unknown name, null, undefined or empty is standard', () => {
    for (const bad of ['No Such Material', null, undefined, '']) {
      expect(craftQualityForMaterialName(bad as string | null | undefined)).toBe('standard');
    }
  });
});

describe('craftQualityUpgrade', () => {
  it('gives the next tier and quality, and null at the top or off the ladder', () => {
    expect(craftQualityUpgrade('standard')).toEqual({ materialTier: 2n, quality: 'reinforced' });
    expect(craftQualityUpgrade('reinforced')).toEqual({ materialTier: 3n, quality: 'exquisite' });
    for (const q of ['exquisite', 'dented', 'mastercraft', 'bogus', '']) {
      expect(craftQualityUpgrade(q)).toBeNull();
    }
  });
});

describe('isGearRecipe', () => {
  it('weapon, armor and accessory are gear; consumable and empty are not', () => {
    for (const t of ['weapon', 'armor', 'accessory']) expect(isGearRecipe({ recipeType: t })).toBe(true);
    for (const t of ['consumable', '', null, undefined]) expect(isGearRecipe({ recipeType: t })).toBe(false);
  });
});

describe('planCraft: materials', () => {
  it('refuses with the server text and names the first short requirement', () => {
    const plan = planCraft(input({ have: { '1': 1n, '2': 5n } }));
    expect(plan).toEqual({
      ok: false,
      reason: 'materials',
      message: 'Missing materials to craft this recipe.',
      templateId: REQ1,
      have: 1n,
      need: 2n,
    });
  });

  it('checks the third requirement when there is one', () => {
    const recipe = { ...gearRecipe, req3TemplateId: REQ3, req3Count: 2n };
    const plan = planCraft(input({ recipe, have: { '1': 5n, '2': 5n, '3': 1n } }));
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.reason).toBe('materials');
      expect(plan.templateId).toBe(REQ3);
      expect(plan.have).toBe(1n);
      expect(plan.need).toBe(2n);
    }
  });
});

describe('planCraft: repeated and skipped requirements', () => {
  it('req1 == req2 checks the merged total: counts 2 and 3 with 4 on hand is refused', () => {
    const recipe = { ...gearRecipe, req2TemplateId: REQ1, req1Count: 2n, req2Count: 3n };
    const plan = planCraft(input({ recipe, have: { '1': 4n } }));
    expect(plan).toEqual({
      ok: false,
      reason: 'materials',
      message: 'Missing materials to craft this recipe.',
      templateId: REQ1,
      have: 4n,
      need: 5n,
    });
  });

  it('req1 == req2 with enough for the merged total passes and consumes one merged entry', () => {
    const recipe = { ...gearRecipe, req2TemplateId: REQ1, req1Count: 2n, req2Count: 3n };
    const plan = planCraft(input({ recipe, have: { '1': 5n } }));
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.consumes).toEqual([{ templateId: REQ1, count: 5n }]);
  });

  it('a third requirement that repeats a template is merged into the total', () => {
    const recipe = { ...gearRecipe, req3TemplateId: REQ1, req3Count: 2n };
    expect(planCraft(input({ recipe, have: { '1': 3n, '2': 5n } })).ok).toBe(false);
    const ok = planCraft(input({ recipe, have: { '1': 4n, '2': 5n } }));
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.consumes).toEqual([
        { templateId: REQ1, count: 4n },
        { templateId: REQ2, count: 1n },
      ]);
    }
  });

  it('a third slot with a template but no count is skipped by position, not by template id', () => {
    // req3 repeats req1's template but has no count: req1 must still be consumed.
    const recipe = { ...gearRecipe, req3TemplateId: REQ1, req3Count: null };
    const plan = planCraft(input({ recipe, have: { '1': 5n, '2': 5n } }));
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.consumes).toEqual([
        { templateId: REQ1, count: 2n },
        { templateId: REQ2, count: 1n },
      ]);
    }
    // A short first requirement is still refused rather than skipped.
    expect(planCraft(input({ recipe, have: { '1': 1n, '2': 5n } })).ok).toBe(false);
  });

  it('a skipped third slot that repeats req2 keeps the catalyst count honest', () => {
    // req2 (1x) plus the Essence both use template 2: with 1 on hand the Essence is short.
    const recipe = { ...gearRecipe, req3TemplateId: REQ2, req3Count: null };
    const plan = planCraft(
      input({
        recipe,
        catalyst: { templateId: REQ2, name: ESSENCE },
        modifiers: [{ templateId: MA, name: MOD_A.name }],
        have: { '1': 5n, '2': 1n, '60': 1n },
      }),
    );
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.reason).toBe('catalyst_missing');
  });
});

describe('planCraft: consumables and no catalyst', () => {
  it('a consumable with a catalyst and reagents consumes only the requirements', () => {
    const plan = planCraft(
      input({
        recipe: { ...gearRecipe, recipeType: 'consumable' },
        catalyst: { templateId: CAT, name: ESSENCE },
        modifiers: [{ templateId: MA, name: MOD_A.name }],
        have: { '1': 5n, '2': 5n, '50': 1n, '60': 1n },
      }),
    );
    expect(plan).toEqual({
      ok: true,
      gear: false,
      quality: null,
      consumes: [
        { templateId: REQ1, count: 2n },
        { templateId: REQ2, count: 1n },
      ],
      usesCatalyst: false,
      reagents: [],
    });
  });

  it('a gear recipe with no catalyst takes its quality from the first material and ignores reagents', () => {
    const plan = planCraft(
      input({ modifiers: [{ templateId: MA, name: MOD_A.name }], have: { '1': 5n, '2': 5n, '60': 1n } }),
    );
    expect(plan).toEqual({
      ok: true,
      gear: true,
      quality: 'reinforced',
      consumes: [
        { templateId: REQ1, count: 2n },
        { templateId: REQ2, count: 1n },
      ],
      usesCatalyst: false,
      reagents: [],
    });
  });
});

describe('planCraft: essence gate and catalyst', () => {
  it('a Lesser Essence cannot unlock reinforced; an unknown catalyst name is the same refusal', () => {
    const lesser = planCraft(
      input({ catalyst: { templateId: CAT, name: LESSER }, modifiers: [{ templateId: MA, name: MOD_A.name }], have: { '1': 5n, '2': 5n, '50': 1n, '60': 1n } }),
    );
    expect(lesser).toEqual({
      ok: false,
      reason: 'essence_tier',
      message: 'Essence tier too low for this craft quality',
    });
    const unknown = planCraft(
      input({ catalyst: { templateId: CAT, name: 'Mystery Dust' }, modifiers: [{ templateId: MA, name: MOD_A.name }], have: { '1': 5n, '2': 5n, '50': 1n, '60': 1n } }),
    );
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.reason).toBe('essence_tier');
  });

  it('a catalyst with none on hand is refused as missing', () => {
    const plan = planCraft(
      input({ catalyst: { templateId: CAT, name: ESSENCE }, modifiers: [{ templateId: MA, name: MOD_A.name }], have: { '1': 5n, '2': 5n, '60': 1n } }),
    );
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.reason).toBe('catalyst_missing');
      expect(plan.message).toBe('Missing catalyst (Essence)');
    }
  });

  it('a catalyst that is also a requirement needs requirement count plus one', () => {
    const recipe = { ...gearRecipe, req2TemplateId: CAT, req2Count: 1n };
    const short = planCraft(
      input({ recipe, catalyst: { templateId: CAT, name: ESSENCE }, modifiers: [{ templateId: MA, name: MOD_A.name }], have: { '1': 5n, '50': 1n, '60': 1n } }),
    );
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.reason).toBe('catalyst_missing');
    const enough = planCraft(
      input({ recipe, catalyst: { templateId: CAT, name: ESSENCE }, modifiers: [{ templateId: MA, name: MOD_A.name }], have: { '1': 5n, '50': 2n, '60': 1n } }),
    );
    expect(enough.ok).toBe(true);
    if (enough.ok) expect(enough.consumes.find((c) => c.templateId === CAT)?.count).toBe(2n);
  });
});

describe('planCraft: reagents', () => {
  const base = { catalyst: { templateId: CAT, name: ESSENCE } };

  it('skips an unknown reagent name or a reagent with no template name', () => {
    // Exquisite has three slots, so the valid third reagent is still reached.
    const plan = planCraft(
      input({
        ...base,
        catalyst: { templateId: CAT, name: GREATER },
        primaryMaterialName: T3,
        modifiers: [
          { templateId: 70n, name: 'Pebble' },
          { templateId: 71n, name: null },
          { templateId: MA, name: MOD_A.name },
        ],
        have: { '1': 5n, '2': 5n, '50': 1n, '60': 1n },
      }),
    );
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.reagents.map((r) => r.templateId)).toEqual([MA]);
  });

  it('refuses a known reagent that runs short after earlier needs (same reagent in two slots, one on hand)', () => {
    const plan = planCraft(
      input({
        ...base,
        modifiers: [
          { templateId: MA, name: MOD_A.name },
          { templateId: MA, name: MOD_A.name },
        ],
        have: { '1': 5n, '2': 5n, '50': 1n, '60': 1n },
      }),
    );
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.reason).toBe('modifier_missing');
      expect(plan.message).toBe(`Missing modifier: ${MOD_A.name}`);
    }
  });

  it('ignores reagents beyond the slots for the quality (standard takes 1)', () => {
    expect(AFFIX_SLOTS_BY_QUALITY.standard).toBe(1);
    const plan = planCraft(
      input({
        ...base,
        primaryMaterialName: T1,
        modifiers: [
          { templateId: MA, name: MOD_A.name },
          { templateId: MB, name: MOD_B.name },
        ],
        have: { '1': 5n, '2': 5n, '50': 1n, '60': 1n, '61': 1n },
      }),
    );
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.reagents.map((r) => r.templateId)).toEqual([MA]);
  });

  it('an essence with no valid reagent is refused', () => {
    const plan = planCraft(
      input({ ...base, modifiers: [{ templateId: 70n, name: 'Pebble' }], have: { '1': 5n, '2': 5n, '50': 1n } }),
    );
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.reason).toBe('no_reagent');
      expect(plan.message).toBe('Must provide at least one reagent when using an Essence');
    }
    const none = planCraft(input({ ...base, modifiers: [], have: { '1': 5n, '2': 5n, '50': 1n } }));
    expect(none.ok).toBe(false);
  });

  it('a valid essence plus two reagents at reinforced consumes merged counts and plans affixes in slot order', () => {
    const plan = planCraft(
      input({
        ...base,
        modifiers: [
          { templateId: MA, name: MOD_A.name },
          { templateId: MB, name: MOD_B.name },
        ],
        have: { '1': 5n, '2': 5n, '50': 1n, '60': 1n, '61': 1n },
      }),
    );
    expect(plan).toEqual({
      ok: true,
      gear: true,
      quality: 'reinforced',
      consumes: [
        { templateId: REQ1, count: 2n },
        { templateId: REQ2, count: 1n },
        { templateId: CAT, count: 1n },
        { templateId: MA, count: 1n },
        { templateId: MB, count: 1n },
      ],
      usesCatalyst: true,
      reagents: [
        { templateId: MA, statKey: MOD_A.statKey, magnitude: getModifierMagnitude('essence', MOD_A.statKey) },
        { templateId: MB, statKey: MOD_B.statKey, magnitude: getModifierMagnitude('essence', MOD_B.statKey) },
      ],
    });
  });

  it('merges a reagent that is also a requirement into one consume entry', () => {
    const recipe = { ...gearRecipe, req2TemplateId: MA, req2Count: 1n };
    const plan = planCraft(
      input({ recipe, ...base, modifiers: [{ templateId: MA, name: MOD_A.name }], have: { '1': 5n, '60': 2n, '50': 1n } }),
    );
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.consumes.filter((c) => c.templateId === MA)).toEqual([{ templateId: MA, count: 2n }]);
  });

  it('uses the magnitude of the essence tier', () => {
    expect(ESSENCE_MAGNITUDE.greater_essence).toBe(3n);
    const plan = planCraft(
      input({
        catalyst: { templateId: CAT, name: GREATER },
        primaryMaterialName: T3,
        modifiers: [{ templateId: MA, name: MOD_A.name }],
        have: { '1': 5n, '2': 5n, '50': 1n, '60': 1n },
      }),
    );
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.reagents[0].magnitude).toBe(getModifierMagnitude('greater_essence', MOD_A.statKey));
  });
});

describe('planCraft never throws', () => {
  it('handles a catalyst named after an Object prototype key', () => {
    expect(() =>
      planCraft(input({ catalyst: { templateId: CAT, name: 'constructor' }, modifiers: [], have: { '1': 5n, '2': 5n } })),
    ).not.toThrow();
  });
});

describe('import pin', () => {
  it('crafting_rules.ts has no import specifier at all', () => {
    expect(importSpecifiers('crafting_rules.ts')).toEqual([]);
  });
});
