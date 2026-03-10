import { describe, it, expect } from 'vitest';
import { parseSkillGenResult } from './skill_gen';

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
