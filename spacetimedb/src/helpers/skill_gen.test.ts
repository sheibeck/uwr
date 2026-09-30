import { describe, it, expect } from 'vitest';
import { parseSkillGenResult } from './skill_gen';
import { BASE_BUDGET } from './skill_budget';

// ============================================================================
// parseSkillGenResult: new ability kinds (36-03)
// ============================================================================

describe('parseSkillGenResult: new ability kinds do not default to damage', () => {
  const newKinds = ['song', 'aura', 'travel', 'fear', 'bandage', 'potion', 'food_summon', 'resurrect', 'group_heal', 'craft_boost', 'gather_boost', 'pet_command'];

  for (const kind of newKinds) {
    it(`kind=${kind} is preserved without defaulting to 'damage'`, () => {
      const raw = JSON.stringify({
        skills: [
          {
            name: `Test ${kind}`,
            description: 'A test ability.',
            kind,
            targetRule: 'self',
            resourceType: 'stamina',
            resourceCost: 5,
            castSeconds: 0,
            cooldownSeconds: 10,
            scaling: 'str',
            value1: 10,
            value2: null,
            damageType: 'none',
            effectType: 'damage_up',
            effectMagnitude: 5,
            effectDuration: 9,
          },
          // Pad to 3 skills (required)
          {
            name: 'Filler One',
            description: 'A filler ability.',
            kind: 'damage',
            targetRule: 'single_enemy',
            resourceType: 'stamina',
            resourceCost: 5,
            castSeconds: 0,
            cooldownSeconds: 6,
            scaling: 'str',
            value1: 10,
            value2: null,
            damageType: 'physical',
            effectType: null,
            effectMagnitude: null,
            effectDuration: null,
          },
          {
            name: 'Filler Two',
            description: 'A filler ability.',
            kind: 'heal',
            targetRule: 'self',
            resourceType: 'mana',
            resourceCost: 8,
            castSeconds: 1,
            cooldownSeconds: 8,
            scaling: 'wis',
            value1: 12,
            value2: null,
            damageType: 'none',
            effectType: null,
            effectMagnitude: null,
            effectDuration: null,
          },
        ],
      });

      const { skills, errors } = parseSkillGenResult(raw, 1n, 5n);

      // First skill should be the new kind, not defaulted to 'damage'
      expect(skills.length).toBeGreaterThanOrEqual(1);
      expect(skills[0].kind).toBe(kind);

      // No validation errors for the new kind
      const kindErrors = errors.filter(e => e.includes(`Invalid kind "${kind}"`));
      expect(kindErrors).toHaveLength(0);
    });
  }
});

// ============================================================================
// Validator retention on model output (Phase 40, Plan 05)
//
// The Claude request layer replaces the model behind these functions; the v2.0
// validators are the real defence against out-of-range or over-budget replies
// and must keep clamping and rejecting. Ceilings are derived from BASE_BUDGET,
// never hard-coded.
// ============================================================================

describe('validator retention on model output', () => {
  const LEVEL = 5n;

  function rawSkill(over: Record<string, any> = {}) {
    return {
      name: 'Probe',
      description: 'A probe ability.',
      kind: 'damage',
      targetRule: 'single_enemy',
      resourceType: 'stamina',
      resourceCost: 5,
      castSeconds: 0,
      cooldownSeconds: 6,
      scaling: 'str',
      value1: 20,
      value2: null,
      damageType: 'physical',
      effectType: null,
      effectMagnitude: null,
      effectDuration: null,
      ...over,
    };
  }

  /** Three skills, the first one under test, padded with two clean fillers. */
  function reply(first: Record<string, any>) {
    return JSON.stringify({
      skills: [rawSkill(first), rawSkill({ name: 'Filler One' }), rawSkill({ name: 'Filler Two' })],
    });
  }

  function parseFirst(first: Record<string, any>) {
    const { skills } = parseSkillGenResult(reply(first), 1n, LEVEL);
    expect(skills).toHaveLength(3);
    return skills[0];
  }

  function budgetBounds(kind: string) {
    const b = BASE_BUDGET[kind];
    const mid = b.base + b.perLevel * Number(LEVEL);
    return { min: Math.floor(mid * b.minMult), max: Math.ceil(mid * b.maxMult) };
  }

  it('clamps an over-budget value1 down to the budget ceiling', () => {
    const { max } = budgetBounds('damage');
    const skill = parseFirst({ value1: 9999 });
    expect(skill.value1 <= BigInt(max)).toBe(true);
    expect(skill.value1).toBe(BigInt(max));
  });

  it('raises an under-budget value1 up to the budget floor', () => {
    const { min } = budgetBounds('damage');
    const skill = parseFirst({ value1: 0 });
    expect(skill.value1).toBe(BigInt(min));
  });

  it('clamps an over-budget effectMagnitude to half the budget ceiling', () => {
    const { max } = budgetBounds('buff');
    const skill = parseFirst({ kind: 'buff', targetRule: 'self', effectType: 'damage_up', effectMagnitude: 9999, effectDuration: 12 });
    expect(skill.effectMagnitude! <= BigInt(Math.ceil(max * 0.5))).toBe(true);
    expect(skill.effectMagnitude).toBe(BigInt(Math.ceil(max * 0.5)));
  });

  it('replaces an unknown kind with damage', () => {
    expect(parseFirst({ kind: 'nonsense' }).kind).toBe('damage');
  });

  it('replaces unknown targetRule, resourceType and scaling with the safe defaults', () => {
    const skill = parseFirst({ targetRule: 'everyone', resourceType: 'rage', scaling: 'luck' });
    expect(skill.targetRule).toBe('single_enemy');
    expect(skill.resourceType).toBe('mana');
    expect(skill.scaling).toBe('none');
  });

  it('replaces an unknown damageType with physical and an unknown effectType with damage_up', () => {
    const skill = parseFirst({ damageType: 'plasma', effectType: 'mystery_effect', effectMagnitude: 3, effectDuration: 9 });
    expect(skill.damageType).toBe('physical');
    expect(skill.effectType).toBe('damage_up');
  });

  it('forces a mana ability with castSeconds 0 to cast for 1 second', () => {
    expect(parseFirst({ resourceType: 'mana', castSeconds: 0 }).castSeconds).toBe(1n);
  });

  it('leaves a stamina ability at castSeconds 0', () => {
    expect(parseFirst({ resourceType: 'stamina', castSeconds: 0 }).castSeconds).toBe(0n);
  });

  it.each(['dot', 'hot', 'buff', 'debuff'])('raises a 3-second %s duration to the 9-second floor', (kind) => {
    const skill = parseFirst({ kind, targetRule: 'self', effectType: 'damage_up', effectMagnitude: 2, effectDuration: 3 });
    expect(skill.effectDuration).toBe(9n);
  });

  it('keeps a 12-second dot duration and does not invent a duration when none is given', () => {
    expect(parseFirst({ kind: 'dot', effectType: 'damage_up', effectMagnitude: 2, effectDuration: 12 }).effectDuration).toBe(12n);
    expect(parseFirst({ kind: 'dot' }).effectDuration).toBeUndefined();
  });

  it('parses the Claude structured-output shape (explicit nulls) to the same result as omitted fields', () => {
    const withNulls = rawSkill({ name: 'Nulls', value2: null, effectType: null, effectMagnitude: null, effectDuration: null, damageType: null });
    const omitted: Record<string, any> = { ...withNulls };
    for (const key of ['value2', 'effectType', 'effectMagnitude', 'effectDuration', 'damageType']) delete omitted[key];

    const build = (first: Record<string, any>) =>
      JSON.stringify({ skills: [first, rawSkill({ name: 'F1' }), rawSkill({ name: 'F2' })] });

    const a = parseSkillGenResult(build(withNulls), 1n, LEVEL);
    const b = parseSkillGenResult(build(omitted), 1n, LEVEL);
    expect(a.skills).toHaveLength(3);
    expect(a.skills[0].value2).toBeUndefined();
    expect(a.skills[0].effectType).toBeUndefined();
    expect(a.skills[0].effectMagnitude).toBeUndefined();
    expect(a.skills[0].effectDuration).toBeUndefined();
    expect(a.skills[0]).toEqual(b.skills[0]);
    expect(a.errors).toEqual(b.errors);
  });

  it('a reply with only two valid skills yields fewer than three (the apply path shows the grimace message)', () => {
    const raw = JSON.stringify({ skills: [rawSkill({ name: 'One' }), rawSkill({ name: 'Two' })] });
    const { skills, errors } = parseSkillGenResult(raw, 1n, LEVEL);
    expect(skills.length).toBeLessThan(3);
    expect(errors.some((e) => e.includes('Expected 3 skills, got 2'))).toBe(true);
  });

  it('a skill without a name is dropped, leaving fewer than three', () => {
    const raw = JSON.stringify({ skills: [rawSkill({ name: 'One' }), rawSkill({ name: 'Two' }), rawSkill({ name: '' })] });
    const { skills } = parseSkillGenResult(raw, 1n, LEVEL);
    expect(skills.length).toBeLessThan(3);
  });

  it('rejects text that is not JSON and a reply without a skills array', () => {
    expect(parseSkillGenResult('nope', 1n, LEVEL).skills).toEqual([]);
    expect(parseSkillGenResult('{"abilities":[]}', 1n, LEVEL).skills).toEqual([]);
  });
});
