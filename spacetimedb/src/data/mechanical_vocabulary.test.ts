import { describe, it, expect } from 'vitest';
import {
  ABILITY_KINDS,
  FAMILY_TEMPERAMENTS,
  FAMILY_RELATIONS,
  FAMILY_FEUD_KIND,
  FAMILY_RELATION_KINDS,
  FAMILY_ICON_KEYS,
  FAMILY_PROMPT_ROLES,
  POOL_KINDS,
  RESOURCE_ICON_KEYS,
  COMBAT_ORIGINS,
} from './mechanical_vocabulary';
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

// ============================================================================
// Phase 51.3.1.1 density pools: closed vocabularies for families, pools and combat origins
// ============================================================================

describe('density pool vocabularies', () => {
  const cases: [string, readonly string[], string[]][] = [
    ['FAMILY_TEMPERAMENTS', FAMILY_TEMPERAMENTS, ['aggressive', 'wary', 'skittish']],
    ['FAMILY_RELATIONS', FAMILY_RELATIONS, ['rival', 'prey', 'predator']],
    ['FAMILY_ICON_KEYS', FAMILY_ICON_KEYS, ['humanoid', 'beast', 'insect', 'spirit', 'undead', 'avian', 'aquatic', 'elemental']],
    ['FAMILY_PROMPT_ROLES', FAMILY_PROMPT_ROLES, ['tank', 'damage', 'support', 'caster']],
    ['POOL_KINDS', POOL_KINDS, ['creature', 'resource']],
    ['RESOURCE_ICON_KEYS', RESOURCE_ICON_KEYS, ['mineral', 'herb', 'gem', 'wood', 'fibre', 'fluid']],
    ['COMBAT_ORIGINS', COMBAT_ORIGINS, ['', 'pull', 'ambush_enter', 'ambush_leave', 'ambush_gather', 'ambush_other', 'named']],
  ];

  for (const [name, actual, expected] of cases) {
    it(name + ' equals the closed list', () => {
      expect([...actual]).toEqual(expected);
    });

    it(name + ' has no duplicates', () => {
      expect(new Set(actual).size).toBe(actual.length);
    });
  }

  it('FAMILY_PROMPT_ROLES differs from ENEMY_ROLES only by support (the server healer)', () => {
    expect(FAMILY_PROMPT_ROLES.includes('support')).toBe(true);
    expect((FAMILY_PROMPT_ROLES as readonly string[]).includes('healer')).toBe(false);
  });

  it('adds the server-only feud kind without changing the AI relation enum (D-70)', () => {
    expect(FAMILY_FEUD_KIND).toBe('feud');
    expect([...FAMILY_RELATION_KINDS]).toEqual(['rival', 'prey', 'predator', 'feud']);
    expect([...FAMILY_RELATIONS]).toEqual(['rival', 'prey', 'predator']);
    expect((FAMILY_RELATIONS as readonly string[]).includes(FAMILY_FEUD_KIND)).toBe(false);
  });
});
