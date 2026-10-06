import { describe, it, expect } from 'vitest';
import { validateRaceReply, validateClassReply } from './creation_validate';
import { clampToBudget } from './skill_budget';
import { PLACEHOLDER_RACE_NAME, isPlaceholderRace } from '../data/race_bonuses';
import {
  STAT_TYPES,
  ABILITY_KINDS,
  RESOURCE_TYPES,
  DAMAGE_TYPES,
  TARGET_RULES,
  SCALING_TYPES,
  EFFECT_TYPES,
  WEAPON_TYPES,
  ARMOR_TYPES,
} from '../data/mechanical_vocabulary';

const has = (list: readonly string[], v: unknown) => list.includes(v as string);

describe('validateRaceReply', () => {
  it('clamps out-of-vocabulary stats and out-of-range values, and moves a colliding secondary', () => {
    const r = validateRaceReply({
      raceName: '  Ashkin  ',
      narrative: 'n',
      bonuses: {
        primary: { stat: 'nonsense', value: 99 },
        secondary: { stat: 'str', value: 9999 },
      },
    });
    expect(r.raceName).toBe('Ashkin');
    expect(r.narrative).toBe('n');
    expect(r.bonuses.primary).toEqual({ stat: 'str', value: 3 });
    expect(r.bonuses.secondary).toEqual({ stat: 'dex', value: 2 });
  });

  it('defaults an empty reply', () => {
    expect(validateRaceReply({})).toEqual({
      raceName: 'Unknown',
      narrative: '',
      bonuses: { primary: { stat: 'str', value: 2 }, secondary: { stat: 'dex', value: 1 } },
    });
  });

  it.each([null, undefined, 42, 'text', [1, 2]])('treats %j as an empty reply', (input) => {
    expect(validateRaceReply(input).raceName).toBe('Unknown');
  });

  it('raises values below the minimum (negative, zero) to 1', () => {
    const r = validateRaceReply({ bonuses: { primary: { stat: 'int', value: -5 }, secondary: { stat: 'wis', value: 0 } } });
    expect(r.bonuses.primary).toEqual({ stat: 'int', value: 1 });
    expect(r.bonuses.secondary).toEqual({ stat: 'wis', value: 1 });
  });

  it('picks the first stat different from a valid primary when the secondary is missing and collides', () => {
    const r = validateRaceReply({ bonuses: { primary: { stat: 'dex', value: 2 } } });
    expect(r.bonuses.secondary.stat).toBe('str');
  });

  it('caps a 60 code point name at 40 without splitting a surrogate pair', () => {
    const name = 'ab' + '\u{1F525}'.repeat(58);
    expect(Array.from(name)).toHaveLength(60);
    const out = validateRaceReply({ raceName: name }).raceName;
    expect(Array.from(out)).toHaveLength(40);
    expect(out).toBe('ab' + '\u{1F525}'.repeat(38));
    expect(out).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it('keeps flavor only when it is a string, capped at 200 code points', () => {
    expect(validateRaceReply({ bonuses: { flavor: 5 } }).bonuses).not.toHaveProperty('flavor');
    expect(validateRaceReply({ bonuses: {} }).bonuses).not.toHaveProperty('flavor');
    expect(Array.from(validateRaceReply({ bonuses: { flavor: 'x'.repeat(500) } }).bonuses.flavor!)).toHaveLength(200);
    expect(validateRaceReply({ bonuses: { flavor: 'Ember-warm.' } }).bonuses.flavor).toBe('Ember-warm.');
  });

  it('replaces a non-string race name and narrative with the defaults', () => {
    const r = validateRaceReply({ raceName: 5, narrative: { a: 1 } });
    expect(r.raceName).toBe('Unknown');
    expect(r.narrative).toBe('');
  });

  it('IN-15: the nameless-race default is the reserved placeholder name, which isPlaceholderRace recognizes', () => {
    expect(PLACEHOLDER_RACE_NAME).toBe('Unknown');
    for (const reply of [{}, { raceName: '' }, { raceName: '   ' }, { raceName: 5 }]) {
      const name = validateRaceReply(reply).raceName;
      expect(name).toBe(PLACEHOLDER_RACE_NAME);
      expect(isPlaceholderRace(name)).toBe(true);
    }
  });

  it('every stat in the result is a vocabulary member', () => {
    const r = validateRaceReply({ bonuses: { primary: { stat: 'x' }, secondary: { stat: 'y' } } });
    expect(has(STAT_TYPES, r.bonuses.primary.stat)).toBe(true);
    expect(has(STAT_TYPES, r.bonuses.secondary.stat)).toBe(true);
  });
});

const goodAbility = {
  name: 'Ember Slash',
  description: 'A burning cut.',
  kind: 'damage',
  damageType: 'fire',
  targetRule: 'single_enemy',
  resourceType: 'stamina',
  resourceCost: 5,
  castSeconds: 0,
  cooldownSeconds: 6,
  value1: 12,
  scaling: 'str',
  effectType: 'dot',
  effectMagnitude: 3,
  effectDuration: 9,
};

describe('validateClassReply', () => {
  it('clamps hp/mana and filters proficiencies to the vocabulary', () => {
    const c = validateClassReply(
      {
        stats: {
          bonusHp: 999,
          bonusMana: -4,
          weaponProficiencies: ['sword', 'laser', 'sword'],
          armorProficiencies: ['plate', 'mithril'],
        },
      },
      'warrior',
    );
    expect(c.stats.bonusHp).toBe(20);
    expect(c.stats.bonusMana).toBe(0);
    expect(c.stats.weaponProficiencies).toEqual(['sword']);
    expect(c.stats.armorProficiencies).toEqual(['plate']);
  });

  it('caps bonusMana at 30', () => {
    expect(validateClassReply({ stats: { bonusMana: 500 } }, 'mystic').stats.bonusMana).toBe(30);
  });

  it('defaults an empty reply per archetype', () => {
    const w = validateClassReply({}, 'warrior');
    expect(w).toEqual({
      className: 'Unknown Class',
      classDescription: '',
      stats: {
        primaryStat: 'str',
        secondaryStat: 'dex',
        bonusHp: 0,
        bonusMana: 0,
        usesMana: false,
        weaponProficiencies: [],
        armorProficiencies: [],
      },
      abilities: [],
    });
    const m = validateClassReply({}, 'mystic');
    expect(m.stats).toMatchObject({ primaryStat: 'int', secondaryStat: 'wis', usesMana: true });
  });

  it('accepts a secondary stat of none and a boolean usesMana override', () => {
    const c = validateClassReply({ stats: { primaryStat: 'wis', secondaryStat: 'none', usesMana: false } }, 'mystic');
    expect(c.stats).toMatchObject({ primaryStat: 'wis', secondaryStat: 'none', usesMana: false });
  });

  it('replaces bad stats with the archetype defaults', () => {
    const c = validateClassReply({ stats: { primaryStat: 'luck', secondaryStat: 'grit' } }, 'warrior');
    expect(c.stats).toMatchObject({ primaryStat: 'str', secondaryStat: 'dex' });
  });

  it('falls back to a warrior when the archetype is missing', () => {
    expect(validateClassReply({}, undefined).stats.primaryStat).toBe('str');
  });

  it('keeps a valid ability unchanged', () => {
    const [a] = validateClassReply({ abilities: [goodAbility] }, 'warrior').abilities;
    expect(a).toMatchObject({
      name: 'Ember Slash',
      description: 'A burning cut.',
      kind: 'damage',
      damageType: 'fire',
      targetRule: 'single_enemy',
      resourceType: 'stamina',
      resourceCost: 5,
      castSeconds: 0,
      cooldownSeconds: 6,
      value1: 12,
      scaling: 'str',
      effectType: 'dot',
      effectDuration: 9,
    });
    expect(typeof a.effectMagnitude).toBe('number');
  });

  it('defaults unknown enums, by archetype for the resource type', () => {
    const bad = { name: 'X', kind: 'nonsense', damageType: 'plasma', targetRule: 'everyone', resourceType: 'rage' };
    const [w] = validateClassReply({ abilities: [bad] }, 'warrior').abilities;
    expect(w).toMatchObject({ kind: 'damage', damageType: 'physical', targetRule: 'single_enemy', resourceType: 'stamina' });
    const [m] = validateClassReply({ abilities: [bad] }, 'mystic').abilities;
    expect(m.resourceType).toBe('mana');
  });

  it('clamps cooldown to 4-12', () => {
    const cd = (v: number) => validateClassReply({ abilities: [{ ...goodAbility, cooldownSeconds: v }] }, 'warrior').abilities[0].cooldownSeconds;
    expect(cd(99)).toBe(12);
    expect(cd(1)).toBe(4);
    expect(cd(8)).toBe(8);
  });

  it('clamps resource cost per resource type', () => {
    const cost = (resourceType: string, resourceCost: number) =>
      validateClassReply({ abilities: [{ ...goodAbility, resourceType, resourceCost }] }, 'warrior').abilities[0].resourceCost;
    expect(cost('mana', 500)).toBe(30);
    expect(cost('mana', 1)).toBe(10);
    expect(cost('stamina', 0)).toBe(5);
    expect(cost('stamina', 500)).toBe(15);
    expect(cost('hp', 0)).toBe(5);
    expect(cost('none', 500)).toBe(0);
  });

  it('raises a zero mana cast time to 1 and leaves stamina instant', () => {
    const cast = (resourceType: string, castSeconds: number) =>
      validateClassReply({ abilities: [{ ...goodAbility, resourceType, castSeconds }] }, 'warrior').abilities[0].castSeconds;
    expect(cast('mana', 0)).toBe(1);
    expect(cast('mana', 2)).toBe(2);
    expect(cast('mana', 50)).toBe(3);
    expect(cast('stamina', 0)).toBe(0);
  });

  it('clamps value1 and effectMagnitude through clampToBudget at level 1', () => {
    const [a] = validateClassReply(
      { abilities: [{ ...goodAbility, kind: 'damage', value1: 99999, effectMagnitude: 99999 }] },
      'warrior',
    ).abilities;
    const expected = clampToBudget('damage', 1, { value1: 1_000_000, effectMagnitude: 1_000_000 });
    expect(a.value1).toBe(Number(expected.value1));
    expect(a.effectMagnitude).toBe(Number(expected.effectMagnitude));
    expect(a.value1).toBeLessThan(100);
    const [low] = validateClassReply({ abilities: [{ ...goodAbility, value1: 0 }] }, 'warrior').abilities;
    expect(low.value1).toBe(Number(clampToBudget('damage', 1, { value1: 0 }).value1));
  });

  it('omits effectMagnitude, effectDuration, effectType and scaling when absent or invalid', () => {
    const [a] = validateClassReply(
      { abilities: [{ name: 'Plain', kind: 'damage', effectType: 'nope', scaling: 'luck', effectMagnitude: null, effectDuration: null }] },
      'warrior',
    ).abilities;
    for (const k of ['effectMagnitude', 'effectDuration', 'effectType', 'scaling', 'value2']) {
      expect(a).not.toHaveProperty(k);
    }
  });

  it('clamps effectDuration to 30 and keeps value2 as a safe integer', () => {
    const [a] = validateClassReply({ abilities: [{ ...goodAbility, effectDuration: 999, value2: 1.5 }] }, 'warrior').abilities;
    expect(a.effectDuration).toBe(30);
    expect(a.value2).toBe(1);
  });

  it('keeps only the first 3 abilities and drops non-object entries', () => {
    const many = [null, 'x', 5, [1], { ...goodAbility, name: 'A' }, { ...goodAbility, name: 'B' }, { ...goodAbility, name: 'C' }, { ...goodAbility, name: 'D' }];
    const out = validateClassReply({ abilities: many }, 'warrior').abilities;
    expect(out.map((a) => a.name)).toEqual(['A', 'B', 'C']);
  });

  it('defaults a missing or oversized ability name', () => {
    const [a, b] = validateClassReply({ abilities: [{}, { name: 'z'.repeat(100) }] }, 'warrior').abilities;
    expect(a.name).toBe('Unknown Ability');
    expect(Array.from(b.name)).toHaveLength(40);
  });

  it('ignores a non-array abilities field', () => {
    expect(validateClassReply({ abilities: 'many' }, 'warrior').abilities).toEqual([]);
  });

  it('never leaves a bigint or a non-vocabulary value in the result (hostile input)', () => {
    const hostile = {
      className: 5,
      classDescription: null,
      stats: { primaryStat: 1n, bonusHp: 1e300, bonusMana: NaN, weaponProficiencies: 'sword', armorProficiencies: [1, null, 'cloth'] },
      abilities: [
        {
          name: {},
          kind: 5,
          damageType: null,
          targetRule: [],
          resourceType: 7n,
          resourceCost: Infinity,
          castSeconds: 1.5,
          cooldownSeconds: 'abc',
          value1: '77',
          value2: 2n,
          effectMagnitude: 12345678901234567890n,
          effectDuration: -3,
        },
      ],
    };
    const out = validateClassReply(hostile, 'mystic');
    expect(() => JSON.stringify(out)).not.toThrow();
    const a = out.abilities[0];
    expect(has(STAT_TYPES, out.stats.primaryStat)).toBe(true);
    expect(has(STAT_TYPES, out.stats.secondaryStat) || out.stats.secondaryStat === 'none').toBe(true);
    expect(out.stats.weaponProficiencies.every((w) => has(WEAPON_TYPES, w))).toBe(true);
    expect(out.stats.armorProficiencies).toEqual(['cloth']);
    expect(has(ABILITY_KINDS, a.kind)).toBe(true);
    expect(has(DAMAGE_TYPES, a.damageType)).toBe(true);
    expect(has(TARGET_RULES, a.targetRule)).toBe(true);
    expect(has(RESOURCE_TYPES, a.resourceType)).toBe(true);
    for (const v of Object.values(a)) expect(typeof v).not.toBe('bigint');
    expect(Number.isInteger(a.value1)).toBe(true);
    expect(a.effectDuration).toBe(0);
  });

  it('every kept optional enum is a vocabulary member', () => {
    const [a] = validateClassReply({ abilities: [goodAbility] }, 'warrior').abilities;
    expect(has(SCALING_TYPES, a.scaling)).toBe(true);
    expect(has(EFFECT_TYPES, a.effectType)).toBe(true);
    expect(ARMOR_TYPES.length).toBeGreaterThan(0);
  });

  it.each([null, undefined, 42, 'text', []])('treats %j as an empty reply', (input) => {
    expect(validateClassReply(input, 'warrior').className).toBe('Unknown Class');
  });
});
