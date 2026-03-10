import { describe, it, expect } from 'vitest';
import { ABILITY_KINDS } from './mechanical_vocabulary';
import { BASE_BUDGET } from '../helpers/skill_budget';

// ============================================================================
// ABILITY_KINDS completeness tests
// ============================================================================

const EXPECTED_NEW_KINDS = [
  'song',
  'aura',
  'travel',
  'fear',
  'bandage',
  'potion',
  'food_summon',
  'resurrect',
  'group_heal',
  'craft_boost',
  'gather_boost',
  'pet_command',
] as const;

const EXPECTED_ORIGINAL_KINDS = [
  'damage', 'heal', 'dot', 'hot', 'buff', 'debuff', 'shield',
  'taunt', 'aoe_damage', 'aoe_heal', 'summon', 'cc', 'drain', 'execute', 'utility',
] as const;

describe('ABILITY_KINDS', () => {
  it('contains all 15 original ability kinds', () => {
    const kindSet = new Set(ABILITY_KINDS);
    for (const kind of EXPECTED_ORIGINAL_KINDS) {
      expect(kindSet.has(kind), `Missing original kind: ${kind}`).toBe(true);
    }
  });

  it('contains all 12 new ability kinds', () => {
    const kindSet = new Set(ABILITY_KINDS);
    for (const kind of EXPECTED_NEW_KINDS) {
      expect(kindSet.has(kind), `Missing new kind: ${kind}`).toBe(true);
    }
  });

  it('has exactly 27 entries (15 original + 12 new)', () => {
    expect(ABILITY_KINDS.length).toBe(27);
  });
});

// ============================================================================
// BASE_BUDGET cross-check: every ABILITY_KINDS entry must have a budget entry
// ============================================================================

describe('BASE_BUDGET', () => {
  it('has a budget entry for every ability kind', () => {
    for (const kind of ABILITY_KINDS) {
      expect(BASE_BUDGET[kind], `Missing BASE_BUDGET entry for kind: ${kind}`).toBeDefined();
    }
  });

  it('has valid numeric fields for every new kind budget', () => {
    for (const kind of EXPECTED_NEW_KINDS) {
      const budget = BASE_BUDGET[kind];
      expect(budget, `Missing budget for ${kind}`).toBeDefined();
      if (budget) {
        expect(typeof budget.base, `base for ${kind} should be number`).toBe('number');
        expect(typeof budget.perLevel, `perLevel for ${kind} should be number`).toBe('number');
        expect(typeof budget.minMult, `minMult for ${kind} should be number`).toBe('number');
        expect(typeof budget.maxMult, `maxMult for ${kind} should be number`).toBe('number');
        expect(budget.minMult).toBeGreaterThan(0);
        // maxMult >= minMult (resurrect is intentionally flat: min === max)
        expect(budget.maxMult).toBeGreaterThanOrEqual(budget.minMult);
      }
    }
  });
});
