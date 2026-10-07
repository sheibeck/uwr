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
  MAX_CRAFT_COUNT,
  SALVAGE_REAGENT_CHANCE_PCT,
  SALVAGE_YIELD_BY_TIER,
  getMaterialForSalvage,
  materialTierToCraftQuality,
  maxCraftCount,
  planCraft,
  primaryMaterialTier,
  salvageMaterialYield,
  salvageReagentDefs,
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

describe('planCraft count (Plan 50-28)', () => {
  it('count omitted, 1n and below 1n all plan a single craft', () => {
    const single = planCraft(input({}));
    expect(planCraft(input({ count: 1n }))).toEqual(single);
    expect(planCraft(input({ count: 0n }))).toEqual(single);
    expect(planCraft(input({ count: -3n }))).toEqual(single);
    expect(single.ok).toBe(true);
    if (single.ok) expect(single.count).toBeUndefined();
  });

  it('multiplies every material by the count and refuses with the batch need', () => {
    const have = { '1': 6n, '2': 3n };
    const ok = planCraft(input({ count: 3n, have }));
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.count).toBe(3n);
      expect(ok.consumes).toEqual([
        { templateId: REQ1, count: 6n },
        { templateId: REQ2, count: 3n },
      ]);
    }
    expect(planCraft(input({ count: 4n, have }))).toEqual({
      ok: false,
      reason: 'materials',
      message: 'Missing materials to craft this recipe.',
      templateId: REQ1,
      have: 6n,
      need: 8n,
    });
  });

  it('req1 == req2 with counts 2 and 3 and count 2n needs 10 of that template', () => {
    const recipe = { ...gearRecipe, req2TemplateId: REQ1, req1Count: 2n, req2Count: 3n };
    expect(planCraft(input({ recipe, count: 2n, have: { '1': 9n } })).ok).toBe(false);
    const ok = planCraft(input({ recipe, count: 2n, have: { '1': 10n } }));
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.consumes).toEqual([{ templateId: REQ1, count: 10n }]);
  });

  it('an Essence batch consumes the catalyst and the reagent n times and refuses a short catalyst', () => {
    const base = {
      catalyst: { templateId: CAT, name: ESSENCE },
      modifiers: [{ templateId: MA, name: MOD_A.name }],
    };
    const have = { '1': 8n, '2': 4n, '50': 2n, '60': 5n };
    const ok = planCraft(input({ ...base, count: 2n, have }));
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.usesCatalyst).toBe(true);
      expect(ok.consumes.find((c) => c.templateId === CAT)?.count).toBe(2n);
      expect(ok.consumes.find((c) => c.templateId === MA)?.count).toBe(2n);
      expect(ok.reagents).toHaveLength(1);
    }
    const short = planCraft(input({ ...base, count: 3n, have: { ...have, '1': 12n, '2': 6n } }));
    expect(short.ok).toBe(false);
    if (!short.ok) {
      expect(short.reason).toBe('catalyst_missing');
      expect(short.message).toBe('Missing catalyst (Essence)');
    }
  });

  it('the same reagent in two slots with 3 on hand: count 1n is ok and count 2n is refused', () => {
    const base = {
      catalyst: { templateId: CAT, name: ESSENCE },
      modifiers: [
        { templateId: MA, name: MOD_A.name },
        { templateId: MA, name: MOD_A.name },
      ],
    };
    const have = { '1': 20n, '2': 20n, '50': 5n, '60': 3n };
    expect(planCraft(input({ ...base, count: 1n, have })).ok).toBe(true);
    const two = planCraft(input({ ...base, count: 2n, have }));
    expect(two.ok).toBe(false);
    if (!two.ok) {
      expect(two.reason).toBe('modifier_missing');
      expect(two.message).toBe(`Missing modifier: ${MOD_A.name}`);
    }
  });

  it('a catalyst that is also a requirement needs n x (requirement + 1)', () => {
    const recipe = { ...gearRecipe, req2TemplateId: CAT, req2Count: 1n };
    const base = {
      recipe,
      catalyst: { templateId: CAT, name: ESSENCE },
      modifiers: [{ templateId: MA, name: MOD_A.name }],
    };
    const short = planCraft(input({ ...base, count: 3n, have: { '1': 20n, '50': 5n, '60': 5n } }));
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.reason).toBe('catalyst_missing');
    const ok = planCraft(input({ ...base, count: 3n, have: { '1': 20n, '50': 6n, '60': 5n } }));
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.consumes.find((c) => c.templateId === CAT)?.count).toBe(6n);
  });

  it('a consumable batch carries the count', () => {
    const plan = planCraft(input({ recipe: { ...gearRecipe, recipeType: 'consumable' }, count: 2n, have: { '1': 4n, '2': 2n } }));
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.count).toBe(2n);
      expect(plan.reagents).toEqual([]);
    }
  });
});

describe('maxCraftCount', () => {
  const essenceBase = {
    catalyst: { templateId: CAT, name: ESSENCE },
    modifiers: [{ templateId: MA, name: MOD_A.name }],
  };

  it('is 0n when a single craft is refused for any reason', () => {
    expect(maxCraftCount(input({ have: { '1': 1n, '2': 5n } }))).toBe(0n);
    // essence too weak for the quality
    expect(
      maxCraftCount(input({ catalyst: { templateId: CAT, name: LESSER }, modifiers: [{ templateId: MA, name: MOD_A.name }], have: { '1': 5n, '2': 5n, '50': 1n, '60': 1n } })),
    ).toBe(0n);
    // missing catalyst
    expect(maxCraftCount(input({ ...essenceBase, have: { '1': 5n, '2': 5n, '60': 1n } }))).toBe(0n);
    // missing reagent
    expect(maxCraftCount(input({ ...essenceBase, have: { '1': 5n, '2': 5n, '50': 1n } }))).toBe(0n);
    // essence with no valid reagent
    expect(maxCraftCount(input({ catalyst: { templateId: CAT, name: ESSENCE }, modifiers: [], have: { '1': 5n, '2': 5n, '50': 1n } }))).toBe(0n);
  });

  it('is floor(have / per-craft need), the smallest over the materials', () => {
    expect(maxCraftCount(input({ have: { '1': 7n, '2': 4n } }))).toBe(3n);
    expect(maxCraftCount(input({ have: { '1': 20n, '2': 4n } }))).toBe(4n);
  });

  it('is capped at 99n', () => {
    expect(MAX_CRAFT_COUNT).toBe(99n);
    const recipe = { ...gearRecipe, req1Count: 1n, req2Count: 1n };
    expect(maxCraftCount(input({ recipe, have: { '1': 500n, '2': 500n } }))).toBe(99n);
  });

  it('counts a shared template once over its merged need', () => {
    const recipe = { ...gearRecipe, req2TemplateId: REQ1, req1Count: 2n, req2Count: 3n };
    expect(maxCraftCount(input({ recipe, have: { '1': 12n } }))).toBe(2n);
  });

  it('grid property: planCraft at max is ok and at max + 1 is refused (below the cap)', () => {
    const shapes: CraftPlanInput['recipe'][] = [
      { ...gearRecipe, req1Count: 1n, req2Count: 1n },
      { ...gearRecipe, req1Count: 2n, req2Count: 3n },
      { ...gearRecipe, req2TemplateId: REQ1, req1Count: 2n, req2Count: 3n },
      { ...gearRecipe, req3TemplateId: REQ3, req3Count: 2n },
      { ...gearRecipe, req3TemplateId: REQ1, req3Count: 1n },
      { ...gearRecipe, req2TemplateId: CAT, req2Count: 1n },
      { ...gearRecipe, req2TemplateId: MA, req2Count: 2n },
    ];
    const extras: Partial<CraftPlanInput>[] = [
      {},
      { catalyst: { templateId: CAT, name: ESSENCE }, modifiers: [{ templateId: MA, name: MOD_A.name }] },
      {
        catalyst: { templateId: CAT, name: GREATER },
        primaryMaterialName: T3,
        modifiers: [
          { templateId: MA, name: MOD_A.name },
          { templateId: MB, name: MOD_B.name },
          { templateId: MA, name: MOD_A.name },
        ],
      },
    ];
    const bagValues = [0n, 1n, 2n, 3n, 5n, 8n, 13n, 25n];
    let checked = 0;
    let positive = 0;
    for (const recipe of shapes) {
      for (const extra of extras) {
        for (const a of bagValues) {
          for (const b of bagValues) {
            for (const c of bagValues) {
              const have: Record<string, bigint> = { '1': a, '2': b, '3': c, '50': a, '60': b, '61': c };
              const base = input({ recipe, ...extra, have });
              const max = maxCraftCount(base);
              if (max > 0n) {
                positive += 1;
                expect(planCraft({ ...base, count: max }).ok).toBe(true);
              }
              if (max < MAX_CRAFT_COUNT) {
                expect(planCraft({ ...base, count: max + 1n }).ok).toBe(false);
              }
              checked += 1;
            }
          }
        }
      }
    }
    expect(checked).toBe(shapes.length * extras.length * bagValues.length ** 3);
    expect(positive).toBeGreaterThan(100);
  });
});

describe('primaryMaterialTier', () => {
  it('reads the MATERIAL_DEFS tier by item key, else 1n', () => {
    expect(primaryMaterialTier(T1)).toBe(1n);
    expect(primaryMaterialTier(T2)).toBe(2n);
    expect(primaryMaterialTier(T3)).toBe(3n);
    expect(primaryMaterialTier(T3.toUpperCase())).toBe(3n);
    for (const bad of ['No Such Material', '', null, undefined]) {
      expect(primaryMaterialTier(bad as string | null | undefined)).toBe(1n);
    }
  });

  it('craftQualityForMaterialName always equals the quality of that tier', () => {
    for (const name of [T1, T2, T3, 'Nope', '', null, undefined]) {
      expect(craftQualityForMaterialName(name as string | null | undefined)).toBe(
        materialTierToCraftQuality(primaryMaterialTier(name as string | null | undefined)),
      );
    }
  });
});

describe('salvage yield rules', () => {
  const hide = { name: 'Rough Hide', vendorValue: 2n };

  it('SALVAGE_REAGENT_CHANCE_PCT is 12n', () => {
    expect(SALVAGE_REAGENT_CHANCE_PCT).toBe(12n);
  });

  it('a cloth chest at tier 1 yields the tier count of Rough Hide', () => {
    expect(
      salvageMaterialYield({ slot: 'chest', armorType: 'cloth', tier: 1n, itemValue: 100n, material: hide, recipeConsumed: 0n }),
    ).toEqual({ name: 'Rough Hide', count: 2n });
  });

  it('is null with no slot material or no material template', () => {
    expect(
      salvageMaterialYield({ slot: 'ring', armorType: 'none', tier: 1n, itemValue: 100n, material: hide, recipeConsumed: 0n }),
    ).toBeNull();
    expect(
      salvageMaterialYield({ slot: 'material', armorType: undefined, tier: 1n, itemValue: 100n, material: hide, recipeConsumed: 0n }),
    ).toBeNull();
    expect(
      salvageMaterialYield({ slot: 'chest', armorType: 'cloth', tier: 1n, itemValue: 100n, material: null, recipeConsumed: 0n }),
    ).toBeNull();
  });

  it('the value cap keeps the yield at or below itemValue / materialValue', () => {
    const at = (itemValue: bigint) =>
      salvageMaterialYield({ slot: 'chest', armorType: 'cloth', tier: 1n, itemValue, material: hide, recipeConsumed: 0n });
    expect(at(3n)).toEqual({ name: 'Rough Hide', count: 1n });
    expect(at(1n)).toEqual({ name: 'Rough Hide', count: 0n });
  });

  it('the recipe cap holds the yield at what the recipe consumed of that material', () => {
    const at = (recipeConsumed: bigint) =>
      salvageMaterialYield({ slot: 'chest', armorType: 'cloth', tier: 1n, itemValue: 100n, material: hide, recipeConsumed })?.count;
    expect(at(1n)).toBe(1n);
    expect(at(0n)).toBe(2n);
    expect(at(2n)).toBe(2n);
    expect(at(5n)).toBe(2n);
  });

  it('a missing tier counts as 1n and a tier above the table uses the 2n fallback', () => {
    const iron = { name: 'Darksteel Ore', vendorValue: 8n };
    expect(
      salvageMaterialYield({ slot: 'mainHand', armorType: undefined, tier: undefined, itemValue: 100n, material: { name: 'Copper Ore', vendorValue: 2n }, recipeConsumed: 0n }),
    ).toEqual({ name: 'Copper Ore', count: 2n });
    expect(SALVAGE_YIELD_BY_TIER[3]).toBe(3n);
    expect(
      salvageMaterialYield({ slot: 'mainHand', armorType: undefined, tier: 3n, itemValue: 1000n, material: iron, recipeConsumed: 0n }),
    ).toEqual({ name: 'Darksteel Ore', count: 3n });
    expect(
      salvageMaterialYield({ slot: 'mainHand', armorType: undefined, tier: 4n, itemValue: 1000n, material: iron, recipeConsumed: 0n }),
    ).toEqual({ name: 'Darksteel Ore', count: 2n });
  });

  it('a zero-value material skips the value cap', () => {
    expect(
      salvageMaterialYield({ slot: 'chest', armorType: 'cloth', tier: 1n, itemValue: 0n, material: { name: 'Rough Hide', vendorValue: 0n }, recipeConsumed: 0n }),
    ).toEqual({ name: 'Rough Hide', count: 2n });
  });

  it('salvageReagentDefs keeps the defs of non-implicit affix stat keys, in def order, once each', () => {
    const a = CRAFTING_MODIFIER_DEFS[0];
    const b = CRAFTING_MODIFIER_DEFS[1];
    expect(
      salvageReagentDefs([
        { affixType: 'prefix', statKey: b.statKey },
        { affixType: 'suffix', statKey: a.statKey },
        { affixType: 'prefix', statKey: a.statKey },
      ]).map((d) => d.key),
    ).toEqual([a, b].map((d) => d.key));
    expect(salvageReagentDefs([{ affixType: 'implicit', statKey: a.statKey }])).toEqual([]);
    expect(salvageReagentDefs([{ statKey: a.statKey }]).map((d) => d.key)).toContain(a.key);
    expect(salvageReagentDefs([])).toEqual([]);
    expect(salvageReagentDefs(undefined as unknown as [])).toEqual([]);
  });
});

describe('salvage material coverage', () => {
  it('every salvage material name is a MATERIAL_DEFS entry with a vendorValue above 0', () => {
    const slots = [
      'mainHand', 'offHand', 'chest', 'legs', 'boots', 'head', 'hands', 'wrists', 'belt',
      'earrings', 'neck', 'cloak', 'ring', 'material', 'consumable', '',
    ];
    const armorTypes = ['cloth', 'leather', 'light', 'plate', 'chain', 'none', undefined];
    let named = 0;
    for (const slot of slots) {
      for (const armorType of armorTypes) {
        for (const tier of [1n, 2n, 3n, 4n]) {
          const name = getMaterialForSalvage(slot, armorType, tier);
          if (name === undefined) continue;
          named += 1;
          const def = MATERIAL_DEFS.find((m) => m.name === name);
          expect(def, `${slot}/${armorType}/${tier} -> ${name}`).toBeDefined();
          expect((def?.vendorValue ?? 0n) > 0n).toBe(true);
        }
      }
    }
    expect(named).toBeGreaterThan(50);
  });
});

describe('import pin', () => {
  it('crafting_rules.ts has no import specifier at all', () => {
    expect(importSpecifiers('crafting_rules.ts')).toEqual([]);
  });
});
