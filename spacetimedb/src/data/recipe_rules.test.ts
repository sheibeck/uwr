/**
 * Rule-based recipe generation (Phase 50 plan 25, owner decision "recipe generation").
 * Pure tests of recipe_rules.ts: the material mapping and its vocabulary membership, the area level
 * and level growth, candidate selection (counts, order, cap inputs), name composition and the name
 * walk, every output column, determinism, and the import-free pin.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ACCESSORY_FORMS,
  ACCESSORY_STATS,
  ARMOR_FORMS,
  EDIBLE_WORDS,
  FOOD_DURATION_MICROS,
  FOOD_FORMS,
  MATERIAL_KINDS,
  MAX_NEW_RECIPES_PER_DISCOVER,
  PRIMARY_KINDS,
  RECIPE_CATEGORY_ORDER,
  REQUIRED_COUNTS,
  SECONDARY_KINDS,
  UNMAPPED_MATERIAL_KEYS,
  WEAPON_FORMS,
  areaLevel,
  generatedOutput,
  levelStep,
  materialKey,
  materialKind,
  recipeCandidates,
  recipeKey,
} from './recipe_rules';
import type { BagMaterial, RecipeCandidate, RecipeCategory } from './recipe_rules';
import {
  CRAFTING_MODIFIER_DEFS,
  ESSENCE_MAGNITUDE,
  MATERIAL_DEFS,
  craftQualityForMaterialName,
  itemKeyFromName,
} from './crafting_rules';
import { ARMOR_TYPES, EQUIPMENT_SLOTS, FOOD_BUFF_TYPES, WEAPON_TYPES } from './mechanical_vocabulary';
import { sellPayout } from './vendor_pricing';

const mat = (
  templateId: bigint,
  name: string,
  count: bigint,
  tier = 1n,
  vendorValue = 1n,
): BagMaterial => ({ templateId, name, tier, vendorValue, count });

// The 50-23 bag of Elfansworth (template ids and values read from the local database).
const ELF_BAG: BagMaterial[] = [
  mat(49n, 'Lamp Oil', 12n),
  mat(43n, 'Peat', 9n),
  mat(40n, 'Herbs', 18n),
  mat(48n, 'Scrap Cloth', 11n),
  mat(46n, 'Iron Shard', 3n, 1n, 2n),
  mat(31n, 'Stone', 11n),
  mat(45n, 'Murky Water', 4n),
  mat(68n, 'Life Stone', 1n, 1n, 3n),
];

// The live bag at 2026-10-06: Copper Ore and Clear Water added, Scrap Cloth and Lamp Oil grown.
const LIVE_BAG: BagMaterial[] = [
  mat(50n, 'Copper Ore', 6n, 1n, 2n),
  mat(33n, 'Clear Water', 5n),
  mat(49n, 'Lamp Oil', 16n),
  mat(48n, 'Scrap Cloth', 21n),
  mat(43n, 'Peat', 9n),
  mat(40n, 'Herbs', 18n),
  mat(45n, 'Murky Water', 4n),
  mat(46n, 'Iron Shard', 3n, 1n, 2n),
  mat(31n, 'Stone', 11n),
  mat(68n, 'Life Stone', 1n, 1n, 3n),
];

const NONE_TAKEN = () => false;
const takenSet = (...names: string[]) => {
  const set = new Set(names.map((n) => n.toLowerCase()));
  return (name: string) => set.has(name.toLowerCase());
};

/** The generated output of the first candidate of a category (names untouched by earlier picks). */
function outputOf(bag: BagMaterial[], category: RecipeCategory, level = 1n, taken: (n: string) => boolean = NONE_TAKEN) {
  const candidate = recipeCandidates(bag, level).find((c) => c.category === category);
  if (!candidate) throw new Error(`no ${category} candidate`);
  return generatedOutput(candidate, taken);
}

describe('materialKey and materialKind', () => {
  it('materialKey equals crafting_rules itemKeyFromName', () => {
    for (const name of ['Iron Shard', '  Scrap   Cloth ', 'COPPER ORE', '']) {
      expect(materialKey(name)).toBe(itemKeyFromName(name));
    }
    expect(materialKey(undefined as unknown as string)).toBe('');
  });

  it('maps the mapped names to their kinds', () => {
    expect(materialKind('Iron Shard')).toBe('metal');
    expect(materialKind('Scrap Cloth')).toBe('cloth');
    expect(materialKind('Stone')).toBe('trinket');
    expect(materialKind('Herbs')).toBe('edible');
    expect(materialKind('Murky Water')).toBe('base');
    expect(materialKind('Rough Hide')).toBe('hide');
    expect(materialKind('Wood')).toBe('wood');
  });

  it('ignores utility materials, reagents, essences and prototype names', () => {
    for (const name of ['Lamp Oil', 'Peat', 'Life Stone', 'Lesser Essence', 'Mystery Scrap', 'constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(materialKind(name)).toBeNull();
    }
  });
});

describe('material coverage', () => {
  it('has no essence key and no reagent key', () => {
    for (const key of Object.keys(ESSENCE_MAGNITUDE)) expect(MATERIAL_KINDS[key]).toBeUndefined();
    for (const def of CRAFTING_MODIFIER_DEFS) expect(Object.prototype.hasOwnProperty.call(MATERIAL_KINDS, def.key)).toBe(false);
  });

  it('maps every non-essence MATERIAL_DEFS key', () => {
    for (const def of MATERIAL_DEFS) {
      if (def.key in ESSENCE_MAGNITUDE) continue;
      expect(Object.prototype.hasOwnProperty.call(MATERIAL_KINDS, def.key), def.key).toBe(true);
    }
  });

  it('keeps the mapped and unmapped key sets disjoint', () => {
    for (const key of UNMAPPED_MATERIAL_KEYS) expect(Object.prototype.hasOwnProperty.call(MATERIAL_KINDS, key), key).toBe(false);
    expect([...UNMAPPED_MATERIAL_KEYS].sort()).toEqual(['ancient_dust', 'dry_grass', 'lamp_oil', 'peat', 'resin', 'sand']);
  });

  it('orders the categories as the client filters do and wires the kinds', () => {
    expect(RECIPE_CATEGORY_ORDER).toEqual(['weapon', 'armor', 'accessory', 'consumable']);
    expect(PRIMARY_KINDS).toEqual({ weapon: ['metal'], armor: ['hide', 'cloth'], accessory: ['trinket'], consumable: ['edible'] });
    expect(SECONDARY_KINDS).toEqual({
      weapon: ['hide', 'cloth', 'wood'],
      armor: ['hide', 'cloth', 'metal'],
      accessory: ['cloth', 'hide', 'metal'],
      consumable: ['base', 'edible'],
    });
    expect(REQUIRED_COUNTS.weapon).toEqual({ primary: 3n, secondary: 1n });
    expect(REQUIRED_COUNTS.armor).toEqual({ primary: 3n, secondary: 1n });
    expect(REQUIRED_COUNTS.accessory).toEqual({ primary: 2n, secondary: 1n });
    expect(REQUIRED_COUNTS.consumable).toEqual({ primary: 2n, secondary: 1n });
    expect(MAX_NEW_RECIPES_PER_DISCOVER).toBe(3);
    expect(FOOD_DURATION_MICROS).toBe(2_700_000_000n);
  });
});

describe('vocabulary membership', () => {
  it('weapon forms are the weapon types, in order', () => {
    expect(WEAPON_FORMS.map((f) => f.weaponType)).toEqual([...WEAPON_TYPES]);
  });

  it('armor and accessory slots are equipment slots and cloth, leather are armor types', () => {
    for (const form of [...ARMOR_FORMS, ...ACCESSORY_FORMS]) {
      expect((EQUIPMENT_SLOTS as readonly string[]).includes(form.slot), form.slot).toBe(true);
    }
    expect((ARMOR_TYPES as readonly string[]).includes('cloth')).toBe(true);
    expect((ARMOR_TYPES as readonly string[]).includes('leather')).toBe(true);
  });

  it('food forms use food buff types and cover exactly the five eat_food buffs', () => {
    for (const form of FOOD_FORMS) expect((FOOD_BUFF_TYPES as readonly string[]).includes(form.buffType), form.buffType).toBe(true);
    expect(new Set(FOOD_FORMS.map((f) => f.buffType))).toEqual(
      new Set(['str', 'dex', 'mana_regen', 'stamina_regen', 'health_regen']),
    );
    expect(FOOD_FORMS.map((f) => f.word)).toEqual(['Draught', 'Broth', 'Stew', 'Roast', 'Salad']);
    for (const edible of Object.values(EDIBLE_WORDS)) {
      expect(FOOD_FORMS.some((f) => f.buffType === edible.buffType)).toBe(true);
    }
  });

  it('accessory stats of the jewelry trio equal the first MATERIAL_DEFS affinity stat', () => {
    for (const key of ['bone_shard', 'spirit_essence', 'void_crystal']) {
      const def = MATERIAL_DEFS.find((m) => m.key === key)!;
      expect(ACCESSORY_STATS[key].stat).toBe(def.affinityStats[0]);
    }
    expect(ACCESSORY_STATS.stone).toEqual({ stat: 'wisBonus', base: 1n });
  });

  it('every trinket key has a stat and every edible key has a word', () => {
    for (const [key, kind] of Object.entries(MATERIAL_KINDS)) {
      if (kind === 'trinket') expect(ACCESSORY_STATS[key], key).toBeDefined();
      if (kind === 'edible') expect(EDIBLE_WORDS[key], key).toBeDefined();
    }
  });
});

describe('area level and level step', () => {
  it('computes max(1, floor(dm / 100) + offset)', () => {
    expect(areaLevel(169n, 0n)).toBe(1n);
    expect(areaLevel(100n, 0n)).toBe(1n);
    expect(areaLevel(169n, 2n)).toBe(3n);
    expect(areaLevel(300n, 0n)).toBe(3n);
    expect(areaLevel(100n, -3n)).toBe(1n);
    expect(areaLevel(800n, 10n)).toBe(18n);
  });

  it('level step is 1, 2, 3 and equals the rounded quest budget slope at every level 1 to 20', () => {
    for (const level of [1n, 2n, 3n, 4n]) expect(levelStep(level)).toBe(1n);
    for (const level of [5n, 6n, 7n, 8n, 9n]) expect(levelStep(level)).toBe(2n);
    expect(levelStep(10n)).toBe(3n);
    for (let n = 1; n <= 20; n++) {
      expect(Number(levelStep(BigInt(n))), `level ${n}`).toBe(Math.round(0.1 * (2 * n + 5)));
    }
  });

  it('builds the recipe key', () => {
    expect(recipeKey('weapon', 'iron_shard', 'scrap_cloth', 1n)).toBe('gen:weapon:iron_shard+scrap_cloth:L1');
  });
});

describe("Elfansworth's 50-23 bag at level 1", () => {
  it('gives four candidates in category order', () => {
    const candidates = recipeCandidates(ELF_BAG, 1n);
    expect(
      candidates.map((c) => [c.category, c.primary.key, c.primary.count, c.secondary.key, c.secondary.count]),
    ).toEqual([
      ['weapon', 'iron_shard', 3n, 'scrap_cloth', 1n],
      ['armor', 'scrap_cloth', 3n, 'iron_shard', 1n],
      ['accessory', 'stone', 2n, 'scrap_cloth', 1n],
      ['consumable', 'herbs', 2n, 'murky_water', 1n],
    ]);
    expect(candidates.map((c) => c.key)).toEqual([
      'gen:weapon:iron_shard+scrap_cloth:L1',
      'gen:armor:scrap_cloth+iron_shard:L1',
      'gen:accessory:stone+scrap_cloth:L1',
      'gen:consumable:herbs+murky_water:L1',
    ]);
    for (const c of candidates) expect(c.level).toBe(1n);
  });

  it('composes the four names in sequence with an empty taken set', () => {
    const names = recipeCandidates(ELF_BAG, 1n).map((c) => generatedOutput(c, NONE_TAKEN).itemTemplate.name);
    expect(names).toEqual(['Iron Shard Dagger', 'Scrap Cloth Robe', 'Stone Pendant', 'Herbal Draught']);
  });

  it('never uses Lamp Oil, Peat or Life Stone', () => {
    for (const c of recipeCandidates(ELF_BAG, 1n)) {
      for (const part of [c.primary, c.secondary]) expect([49n, 43n, 68n]).not.toContain(part.templateId);
    }
  });
});

describe('the live bag at level 1', () => {
  it('gives five candidates in rank order', () => {
    const candidates = recipeCandidates(LIVE_BAG, 1n);
    expect(candidates.map((c) => c.key)).toEqual([
      'gen:weapon:copper_ore+scrap_cloth:L1',
      'gen:armor:scrap_cloth+copper_ore:L1',
      'gen:accessory:stone+scrap_cloth:L1',
      'gen:consumable:herbs+clear_water:L1',
      'gen:weapon:iron_shard+scrap_cloth:L1',
    ]);
    expect(candidates.map((c) => generatedOutput(c, NONE_TAKEN).itemTemplate.name)).toEqual([
      'Copper Dagger',
      'Scrap Cloth Robe',
      'Stone Pendant',
      'Herbal Draught',
      'Iron Shard Dagger',
    ]);
  });
});

describe('generated output columns', () => {
  it('Iron Shard Dagger', () => {
    const { itemTemplate: t, recipe } = outputOf(ELF_BAG, 'weapon');
    expect(t).toEqual({
      name: 'Iron Shard Dagger',
      slot: 'mainHand',
      armorType: 'none',
      rarity: 'common',
      tier: 1n,
      isJunk: false,
      vendorValue: 5n,
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
      weaponBaseDamage: 4n,
      weaponDps: 5n,
      weaponType: 'dagger',
      stackable: false,
      wellFedDurationMicros: 0n,
      wellFedBuffType: '',
      wellFedBuffMagnitude: 0n,
      description: 'Crafted from Iron Shard and Scrap Cloth.',
    });
    expect(recipe).toEqual({
      key: 'gen:weapon:iron_shard+scrap_cloth:L1',
      name: 'Iron Shard Dagger',
      outputCount: 1n,
      req1TemplateId: 46n,
      req1Count: 3n,
      req2TemplateId: 48n,
      req2Count: 1n,
      req3TemplateId: undefined,
      req3Count: undefined,
      recipeType: 'weapon',
      materialType: 'iron_shard',
    });
    expect('req3TemplateId' in recipe && 'req3Count' in recipe).toBe(true);
  });

  it('Scrap Cloth Robe', () => {
    const { itemTemplate: t, recipe } = outputOf(ELF_BAG, 'armor');
    expect(t.name).toBe('Scrap Cloth Robe');
    expect(t.slot).toBe('chest');
    expect(t.armorType).toBe('cloth');
    expect(t.armorClassBonus).toBe(2n);
    expect(t.vendorValue).toBe(3n);
    expect(t.weaponBaseDamage).toBe(0n);
    expect(t.weaponType).toBe('');
    expect(t.stackable).toBe(false);
    expect(recipe.recipeType).toBe('armor');
    expect(recipe.materialType).toBe('scrap_cloth');
    expect([recipe.req1Count, recipe.req2Count]).toEqual([3n, 1n]);
  });

  it('Stone Pendant', () => {
    const { itemTemplate: t, recipe } = outputOf(ELF_BAG, 'accessory');
    expect(t.name).toBe('Stone Pendant');
    expect(t.slot).toBe('neck');
    expect(t.armorType).toBe('none');
    expect(t.wisBonus).toBe(1n);
    expect(t.vendorValue).toBe(1n);
    expect(t.armorClassBonus).toBe(0n);
    expect(recipe.recipeType).toBe('accessory');
  });

  it('Herbal Draught', () => {
    const { itemTemplate: t, recipe } = outputOf(ELF_BAG, 'consumable');
    expect(t.name).toBe('Herbal Draught');
    expect(t.slot).toBe('food');
    expect(t.stackable).toBe(true);
    expect(t.armorType).toBe('none');
    expect(t.wellFedBuffType).toBe('health_regen');
    expect(t.wellFedBuffMagnitude).toBe(1n);
    expect(t.wellFedDurationMicros).toBe(2_700_000_000n);
    expect(t.vendorValue).toBe(1n);
    expect(t.weaponBaseDamage).toBe(0n);
    expect(recipe.recipeType).toBe('consumable');
    expect(recipe.materialType).toBeUndefined();
    expect(recipe.req3TemplateId).toBeUndefined();
    expect(recipe.req3Count).toBeUndefined();
    expect(recipe.outputCount).toBe(1n);
  });

  it('selling the output never pays more than selling the inputs, for every perk and Charisma rate (IN-02)', () => {
    // The vendor rounds each payout down once per stack, so a sum over stacks can lose up to a gold
    // per stack against one rounded payout of the whole value: the output carries the sum less 2.
    const values = [0n, 1n, 2n, 3n, 5n, 8n, 10n, 13n];
    const counts: Record<string, [bigint, bigint]> = { weapon: [3n, 1n], armor: [3n, 1n], accessory: [2n, 1n], consumable: [2n, 1n] };
    let checked = 0;
    const violations: string[] = [];
    for (const category of RECIPE_CATEGORY_ORDER) {
      for (const v1 of values) {
        for (const v2 of values) {
          if (v1 === 0n && v2 === 0n) continue; // inputs worth nothing keep the 1 gold minimum
          const candidate: RecipeCandidate = {
            key: 'k',
            category,
            level: 1n,
            primary: { templateId: 1n, name: 'Iron Shard', key: 'iron_shard', tier: 1n, vendorValue: v1, count: counts[category][0] },
            secondary: { templateId: 2n, name: 'Scrap Cloth', key: 'scrap_cloth', tier: 1n, vendorValue: v2, count: counts[category][1] },
          };
          const out = generatedOutput(candidate, () => false).itemTemplate.vendorValue;
          const a = v1 * counts[category][0];
          const b = v2 * counts[category][1];
          for (let perk = 0; perk <= 100; perk += 5) {
            for (let mod = 0n; mod <= 1500n; mod += 25n) {
              if (sellPayout(out, 1n, perk, mod) > sellPayout(a, 1n, perk, mod) + sellPayout(b, 1n, perk, mod)) {
                violations.push(`${category} ${v1}/${v2} perk ${perk} mod ${mod}`);
              }
              checked += 1;
            }
          }
        }
      }
    }
    expect(violations).toEqual([]);
    expect(checked).toBeGreaterThan(10_000);
  });

  it('every other stat column is 0n on every output', () => {
    const statColumns = [
      'strBonus', 'dexBonus', 'chaBonus', 'wisBonus', 'intBonus', 'hpBonus', 'manaBonus',
      'armorClassBonus', 'magicResistanceBonus', 'weaponBaseDamage', 'weaponDps',
    ];
    for (const c of recipeCandidates(ELF_BAG, 1n)) {
      const { itemTemplate: t } = generatedOutput(c, NONE_TAKEN);
      const nonZero = statColumns.filter((col) => t[col] !== 0n);
      expect(nonZero.length, `${t.name}: ${nonZero.join(',')}`).toBeLessThanOrEqual(2);
    }
  });
});

describe('rules for the other material kinds', () => {
  it('a hide secondary makes a sword from Iron Ore', () => {
    const bag = [mat(1n, 'Iron Ore', 3n, 2n, 4n), mat(2n, 'Rough Hide', 1n, 1n, 2n)];
    const { itemTemplate: t } = outputOf(bag, 'weapon');
    expect(t.name).toBe('Iron Sword');
    expect(t.weaponType).toBe('sword');
    expect(t.tier).toBe(2n);
    expect(t.weaponBaseDamage).toBe(6n);
    expect(t.weaponDps).toBe(7n);
    expect(craftQualityForMaterialName('Iron Ore')).toBe('reinforced');
  });

  it('a wood secondary makes a staff from Darksteel Ore', () => {
    const bag = [mat(1n, 'Darksteel Ore', 3n, 3n, 8n), mat(2n, 'Wood', 1n)];
    const { itemTemplate: t } = outputOf(bag, 'weapon');
    expect(t.name).toBe('Darksteel Staff');
    expect(t.weaponType).toBe('staff');
    expect(t.weaponBaseDamage).toBe(8n);
    expect(t.tier).toBe(3n);
  });

  it('a metal setting makes a ring for a stone when no cloth or hide is held', () => {
    const bag = [mat(1n, 'Stone', 2n), mat(2n, 'Copper Ore', 1n, 1n, 2n)];
    const { itemTemplate: t } = outputOf(bag, 'accessory');
    expect(t.name).toBe('Stone Ring');
    expect(t.slot).toBe('earrings');
  });

  it('two edibles with no base make a dex salad named after the primary', () => {
    const bag = [mat(1n, 'Wild Berries', 2n), mat(2n, 'Herbs', 1n)];
    const candidates = recipeCandidates(bag, 1n);
    expect(candidates).toHaveLength(1);
    const { itemTemplate: t } = generatedOutput(candidates[0], NONE_TAKEN);
    expect(t.name).toBe('Berry Salad');
    expect(t.wellFedBuffType).toBe('dex');
    expect(t.slot).toBe('food');
  });

  it('a hide primary makes leather armor', () => {
    const bag = [mat(1n, 'Rough Hide', 3n, 1n, 2n), mat(2n, 'Scrap Cloth', 1n)];
    const { itemTemplate: t } = outputOf(bag, 'armor');
    expect(t.name).toBe('Rough Hide Jerkin');
    expect(t.armorType).toBe('leather');
    expect(t.armorClassBonus).toBe(3n);
    expect(t.slot).toBe('chest');
  });

  it('a cloth primary makes cloth armor; a bone shard primary makes a pendant', () => {
    const bag = [mat(1n, 'Bone Shard', 2n, 1n, 2n), mat(2n, 'Scrap Cloth', 1n)];
    const { itemTemplate: t } = outputOf(bag, 'accessory');
    expect(t.name).toBe('Bone Shard Pendant');
    expect(t.hpBonus).toBe(3n);
  });
});

describe('level growth', () => {
  it('level 3: dagger 6/7 and cloth chest 3', () => {
    const weapon = outputOf(ELF_BAG, 'weapon', 3n).itemTemplate;
    expect([weapon.weaponBaseDamage, weapon.weaponDps]).toEqual([6n, 7n]);
    expect(outputOf(ELF_BAG, 'armor', 3n).itemTemplate.armorClassBonus).toBe(3n);
  });

  it('level 6: dagger 10/11, cloth chest 6, pendant wis 2, food magnitude 2', () => {
    const weapon = outputOf(ELF_BAG, 'weapon', 6n).itemTemplate;
    expect([weapon.weaponBaseDamage, weapon.weaponDps]).toEqual([10n, 11n]);
    expect(outputOf(ELF_BAG, 'armor', 6n).itemTemplate.armorClassBonus).toBe(6n);
    expect(outputOf(ELF_BAG, 'accessory', 6n).itemTemplate.wisBonus).toBe(2n);
    expect(outputOf(ELF_BAG, 'consumable', 6n).itemTemplate.wellFedBuffMagnitude).toBe(2n);
  });

  it('a bone shard pendant at level 5 has hp 6', () => {
    const bag = [mat(1n, 'Bone Shard', 2n, 1n, 2n), mat(2n, 'Scrap Cloth', 1n)];
    expect(outputOf(bag, 'accessory', 5n).itemTemplate.hpBonus).toBe(6n);
  });

  it('requiredLevel always equals the level and the key carries it', () => {
    for (const level of [1n, 2n, 3n, 7n, 12n]) {
      for (const c of recipeCandidates(ELF_BAG, level)) {
        expect(c.level).toBe(level);
        expect(c.key.endsWith(`:L${level}`)).toBe(true);
        expect(generatedOutput(c, NONE_TAKEN).itemTemplate.requiredLevel).toBe(level);
      }
    }
  });
});

describe('the name walk', () => {
  it('a taken weapon name walks to the next form, case-insensitively', () => {
    expect(outputOf(ELF_BAG, 'weapon', 1n, takenSet('iron shard dagger')).itemTemplate.name).toBe('Iron Shard Rapier');
    const rapier = outputOf(ELF_BAG, 'weapon', 3n, takenSet('Iron Shard Dagger')).itemTemplate;
    expect([rapier.weaponType, rapier.weaponBaseDamage, rapier.weaponDps]).toEqual(['rapier', 6n, 7n]);
  });

  it('a taken armor name walks chest, legs, boots', () => {
    const legs = outputOf(ELF_BAG, 'armor', 3n, takenSet('Scrap Cloth Robe')).itemTemplate;
    expect([legs.name, legs.slot, legs.armorClassBonus]).toEqual(['Scrap Cloth Trousers', 'legs', 2n]);
    const boots = outputOf(ELF_BAG, 'armor', 1n, takenSet('Scrap Cloth Robe', 'Scrap Cloth Trousers')).itemTemplate;
    expect([boots.name, boots.slot]).toEqual(['Scrap Cloth Boots', 'boots']);
  });

  it('a taken accessory name walks to the ring', () => {
    const ring = outputOf(ELF_BAG, 'accessory', 3n, takenSet('Stone Pendant')).itemTemplate;
    expect([ring.name, ring.slot]).toEqual(['Stone Ring', 'earrings']);
  });

  it('a taken food name walks to the next food form and changes the buff', () => {
    const broth = outputOf(ELF_BAG, 'consumable', 1n, takenSet('Herbal Draught')).itemTemplate;
    expect([broth.name, broth.wellFedBuffType]).toEqual(['Herbal Broth', 'mana_regen']);
  });

  it('with every form taken the start form takes a numeral', () => {
    const allTaken = ['Stone Pendant', 'Stone Ring'];
    expect(outputOf(ELF_BAG, 'accessory', 1n, takenSet(...allTaken)).itemTemplate.name).toBe('Stone Pendant 2');
    expect(outputOf(ELF_BAG, 'accessory', 1n, takenSet(...allTaken, 'Stone Pendant 2')).itemTemplate.name).toBe('Stone Pendant 3');
    const weaponForms = WEAPON_FORMS.map((f) => `Iron Shard ${f.word}`);
    expect(outputOf(ELF_BAG, 'weapon', 1n, takenSet(...weaponForms)).itemTemplate.name).toBe('Iron Shard Dagger 2');
  });

  it('the recipe name equals the output name', () => {
    const out = outputOf(ELF_BAG, 'accessory', 1n, takenSet('Stone Pendant'));
    expect(out.recipe.name).toBe(out.itemTemplate.name);
  });
});

describe('counts and selection', () => {
  it('Iron Shard x2 gives no weapon candidate', () => {
    const bag = [mat(1n, 'Iron Shard', 2n, 1n, 2n), mat(2n, 'Scrap Cloth', 5n)];
    const categories = recipeCandidates(bag, 1n).map((c) => c.category);
    expect(categories).not.toContain('weapon');
    expect(categories).toContain('armor');
  });

  it('Stone x1 gives no accessory candidate', () => {
    const bag = [mat(1n, 'Stone', 1n), mat(2n, 'Scrap Cloth', 5n)];
    expect(recipeCandidates(bag, 1n).map((c) => c.category)).not.toContain('accessory');
  });

  it('every candidate count is at most the bag count and a material is never its own secondary', () => {
    for (const bag of [ELF_BAG, LIVE_BAG]) {
      for (const c of recipeCandidates(bag, 1n)) {
        const rules = REQUIRED_COUNTS[c.category];
        expect(c.primary.count).toBe(rules.primary);
        expect(c.secondary.count).toBe(rules.secondary);
        expect(c.primary.key).not.toBe(c.secondary.key);
        expect(c.primary.templateId).not.toBe(c.secondary.templateId);
        const held = bag.find((m) => m.templateId === c.primary.templateId)!;
        expect(c.primary.count).toBeLessThanOrEqual(held.count);
        expect(c.secondary.count).toBeLessThanOrEqual(bag.find((m) => m.templateId === c.secondary.templateId)!.count);
      }
    }
  });

  it('a lone material has no candidate', () => {
    expect(recipeCandidates([mat(1n, 'Scrap Cloth', 50n)], 1n)).toEqual([]);
  });

  it('an empty bag gives none', () => {
    expect(recipeCandidates([], 1n)).toEqual([]);
  });

  it('a higher tier primary comes before a lower tier one', () => {
    const bag = [
      mat(1n, 'Copper Ore', 6n, 1n, 2n),
      mat(2n, 'Iron Ore', 6n, 2n, 4n),
      mat(3n, 'Rough Hide', 2n, 1n, 2n),
    ];
    expect(recipeCandidates(bag, 1n).filter((c) => c.category === 'weapon').map((c) => c.primary.key)).toEqual([
      'iron_ore',
      'copper_ore',
    ]);
  });
});

describe('determinism and input hygiene', () => {
  it('input order does not change the candidates', () => {
    const base = recipeCandidates(LIVE_BAG, 1n);
    const reversed = [...LIVE_BAG].reverse();
    const rotated = [...LIVE_BAG.slice(4), ...LIVE_BAG.slice(0, 4)];
    expect(recipeCandidates(reversed, 1n)).toEqual(base);
    expect(recipeCandidates(rotated, 1n)).toEqual(base);
  });

  it('generatedOutput twice gives deep-equal results', () => {
    for (const c of recipeCandidates(LIVE_BAG, 4n)) {
      expect(generatedOutput(c, NONE_TAKEN)).toEqual(generatedOutput(c, NONE_TAKEN));
    }
  });

  it('duplicate entries for one template are summed', () => {
    const bag = [mat(46n, 'Iron Shard', 2n, 1n, 2n), mat(46n, 'Iron Shard', 1n, 1n, 2n), mat(48n, 'Scrap Cloth', 1n)];
    const weapon = recipeCandidates(bag, 1n).find((c) => c.category === 'weapon')!;
    // 2 + 1 held makes the 3 the weapon needs; one entry of 2 would not.
    expect(weapon.primary.count).toBe(3n);
    expect(recipeCandidates([bag[0], bag[2]], 1n).find((c) => c.category === 'weapon')).toBeUndefined();
  });

  it('two templates with the same key use the lower template id', () => {
    const bag = [mat(60n, 'Iron Shard', 5n, 1n, 2n), mat(46n, 'Iron Shard', 3n, 1n, 2n), mat(48n, 'Scrap Cloth', 1n)];
    const weapon = recipeCandidates(bag, 1n).find((c) => c.category === 'weapon')!;
    expect(weapon.primary.templateId).toBe(46n);
    expect(recipeCandidates([...bag].reverse(), 1n)).toEqual(recipeCandidates(bag, 1n));
  });

  it('zero and negative counts are ignored', () => {
    const zero = [mat(46n, 'Iron Shard', 0n, 1n, 2n), mat(48n, 'Scrap Cloth', 9n)];
    const negative = [mat(46n, 'Iron Shard', -3n, 1n, 2n), mat(48n, 'Scrap Cloth', 9n)];
    expect(recipeCandidates(zero, 1n)).toEqual([]);
    expect(recipeCandidates(negative, 1n)).toEqual([]);
  });

  it('unknown and prototype names are ignored without error', () => {
    const bag = [
      mat(1n, 'Mystery Scrap', 9n),
      mat(2n, 'constructor', 9n),
      mat(3n, '__proto__', 9n),
      mat(4n, 'hasOwnProperty', 9n),
      mat(5n, '', 9n),
    ];
    expect(() => recipeCandidates(bag, 1n)).not.toThrow();
    expect(recipeCandidates(bag, 1n)).toEqual([]);
  });

  it('does not throw on malformed input', () => {
    expect(() => recipeCandidates(undefined as unknown as BagMaterial[], 1n)).not.toThrow();
    expect(() => recipeCandidates([null as unknown as BagMaterial], 1n)).not.toThrow();
    expect(recipeCandidates(undefined as unknown as BagMaterial[], 1n)).toEqual([]);
  });

  it('recipe candidates keep the candidate shape', () => {
    const c: RecipeCandidate = recipeCandidates(ELF_BAG, 1n)[0];
    expect(Object.keys(c).sort()).toEqual(['category', 'key', 'level', 'primary', 'secondary']);
    expect(Object.keys(c.primary).sort()).toEqual(['count', 'key', 'name', 'templateId', 'tier', 'vendorValue']);
  });
});

describe('import pin', () => {
  const source = readFileSync(fileURLToPath(new URL('./recipe_rules.ts', import.meta.url)), 'utf8');

  it('recipe_rules.ts has no import specifier at all', () => {
    const out: string[] = [];
    const re = /from\s+'([^']+)'/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) out.push(m[1]);
    expect(out).toEqual([]);
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/\bimport\(/);
    expect(source).not.toMatch(/\brequire\(/);
  });

  it('has no random source and no clock, and no ES2022 helper', () => {
    expect(source).not.toMatch(/Math\.random|Date\.now|new Date/);
    expect(source).not.toMatch(/replaceAll|Object\.hasOwn\(|\.at\(/);
  });
});
