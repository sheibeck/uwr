import { describe, it, expect } from 'vitest';
import {
  SKILL_GENERATION_SCHEMA,
} from './llm_prompts';

// ============================================================================
// CREATION_ABILITY_SCHEMA field alignment tests
// ============================================================================
// These tests verify that the CREATION_ABILITY_SCHEMA used in character creation
// uses "kind" (not "effect") as its ability type field, matching SKILL_GENERATION_SCHEMA.
// This is the root cause of UAT gaps 1-4 -- when "effect" was used, creation.ts
// read "chosen.kind" which was always undefined, causing all creation abilities
// to fall back to kind:'damage'.

// We test via the exported schemas and the CLASS_GENERATION_SCHEMA string
// which embeds CREATION_ABILITY_SCHEMA.

import {
  CLASS_GENERATION_SCHEMA,
  COMBINED_CREATION_SCHEMA,
} from './llm_prompts';

describe('CREATION_ABILITY_SCHEMA field names', () => {
  it('Test 1: CLASS_GENERATION_SCHEMA contains "kind" field (not "effect")', () => {
    expect(CLASS_GENERATION_SCHEMA).toContain('"kind"');
  });

  it('Test 2: CLASS_GENERATION_SCHEMA does NOT use old "effect" field for ability type', () => {
    // The old schema had: "effect": "none|dot|heal|buff|debuff|stun"
    // The new schema should use: "kind": "damage|dot|heal|hot|buff|debuff|stun"
    // We check the schema doesn't contain the old "effect" field for the ability type
    // (it's OK to have "effectType", "effectMagnitude", "effectDuration" -- those are correct)
    // The old pattern was the standalone "effect" field with value none|dot|heal|buff|debuff|stun
    expect(CLASS_GENERATION_SCHEMA).not.toMatch(/"effect":\s*"none\|dot\|heal/);
  });

  it('Test 3: CLASS_GENERATION_SCHEMA "kind" enum includes dot, heal, hot, buff, debuff, damage', () => {
    expect(CLASS_GENERATION_SCHEMA).toMatch(/"kind".*dot/);
    expect(CLASS_GENERATION_SCHEMA).toMatch(/"kind".*heal/);
    expect(CLASS_GENERATION_SCHEMA).toMatch(/"kind".*buff/);
    expect(CLASS_GENERATION_SCHEMA).toMatch(/"kind".*debuff/);
    expect(CLASS_GENERATION_SCHEMA).toMatch(/"kind".*damage/);
  });

  it('Test 4: COMBINED_CREATION_SCHEMA also contains "kind" field', () => {
    expect(COMBINED_CREATION_SCHEMA).toContain('"kind"');
  });

  it('Test 5: COMBINED_CREATION_SCHEMA does NOT use old "effect" field for ability type', () => {
    expect(COMBINED_CREATION_SCHEMA).not.toMatch(/"effect":\s*"none\|dot\|heal/);
  });
});

// ============================================================================
// creation.ts ability insert correctness tests (simulated)
// ============================================================================
// We cannot import creation.ts directly (it uses SpacetimeDB APIs),
// so we test the logic inline to verify the kind/damageType extraction.

describe('creation.ts ability kind extraction logic', () => {
  // This simulates what creation.ts does when building an ability from LLM output

  function extractKindFromChosen(chosen: Record<string, unknown>): string {
    // This mirrors the logic in creation.ts line 216 (after fix):
    return (chosen.kind as string) || (chosen.effect as string) || (chosen.type as string) || 'damage';
  }

  function extractDamageType(chosen: Record<string, unknown>): string {
    // This mirrors the new damageType extraction in creation.ts (after fix):
    return (chosen.damageType as string) || 'physical';
  }

  it('Test 6: Mock LLM response with kind:"dot" results in kind:"dot" (not "damage")', () => {
    const mockLlmOutput = {
      name: 'Acid Drip',
      description: 'A corrosive substance that eats through armor.',
      kind: 'dot',
      damageType: 'nature',
      targetRule: 'single_enemy',
      resourceType: 'mana',
      resourceCost: 8,
      castSeconds: 1,
      cooldownSeconds: 8,
      scaling: 'int',
      value1: 10,
      effectType: 'dot',
      effectMagnitude: 5,
      effectDuration: 9,
    };

    const kind = extractKindFromChosen(mockLlmOutput);
    expect(kind).toBe('dot');
    expect(kind).not.toBe('damage');
  });

  it('Test 7: Mock LLM response with kind:"heal" results in kind:"heal" (not "damage")', () => {
    const mockLlmOutput = {
      name: 'Mend Wounds',
      description: 'Knits flesh back together.',
      kind: 'heal',
      damageType: 'none',
      targetRule: 'single_ally',
      resourceType: 'mana',
      resourceCost: 10,
      castSeconds: 2,
      cooldownSeconds: 6,
      scaling: 'wis',
      value1: 15,
      effectType: null,
      effectMagnitude: null,
      effectDuration: null,
    };

    const kind = extractKindFromChosen(mockLlmOutput);
    expect(kind).toBe('heal');
    expect(kind).not.toBe('damage');
  });

  it('Test 8: Mock LLM response with kind:"buff" results in kind:"buff" (not "damage")', () => {
    const mockLlmOutput = {
      name: 'Iron Will',
      kind: 'buff',
      damageType: 'none',
    };

    const kind = extractKindFromChosen(mockLlmOutput);
    expect(kind).toBe('buff');
  });

  it('Test 9: Backward compatibility - old "effect" field still maps correctly', () => {
    // Old LLM output used "effect" instead of "kind"
    const oldFormatLlmOutput = {
      name: 'Poison Bite',
      description: 'A venomous strike.',
      effect: 'dot',         // old field name
      damageType: 'nature',
      // NO "kind" field -- simulates old cached creation state
    };

    const kind = extractKindFromChosen(oldFormatLlmOutput);
    expect(kind).toBe('dot'); // backward compat fallback via chosen.effect
  });

  it('Test 10: Falls back to "damage" only when all fields are absent', () => {
    const minimalOutput = {
      name: 'Basic Strike',
      description: 'A basic hit.',
      // No kind, no effect, no type
    };

    const kind = extractKindFromChosen(minimalOutput);
    expect(kind).toBe('damage');
  });

  it('Test 11: damageType is read from LLM output', () => {
    const chosen = { kind: 'damage', damageType: 'fire' };
    expect(extractDamageType(chosen)).toBe('fire');
  });

  it('Test 12: damageType defaults to "physical" when absent', () => {
    const chosen = { kind: 'damage' };
    expect(extractDamageType(chosen)).toBe('physical');
  });

  it('Test 13: damageType "shadow" is preserved correctly', () => {
    const chosen = { kind: 'dot', damageType: 'shadow' };
    expect(extractDamageType(chosen)).toBe('shadow');
  });
});

// ============================================================================
// SKILL_GENERATION_SCHEMA consistency check
// ============================================================================

describe('SKILL_GENERATION_SCHEMA (should remain unchanged)', () => {
  it('still uses "kind" field (regression guard)', () => {
    expect(SKILL_GENERATION_SCHEMA).toContain('"kind"');
  });

  it('still has full kind enum including dot, hot, buff, debuff', () => {
    expect(SKILL_GENERATION_SCHEMA).toContain('dot');
    expect(SKILL_GENERATION_SCHEMA).toContain('hot');
    expect(SKILL_GENERATION_SCHEMA).toContain('buff');
    expect(SKILL_GENERATION_SCHEMA).toContain('debuff');
  });
});
