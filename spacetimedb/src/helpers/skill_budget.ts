// ============================================================================
// SKILL BUDGET — Power validation and clamping for generated abilities
// ============================================================================
//
// LLM-generated abilities must be validated against the mechanical vocabulary
// and clamped to a power budget based on ability kind and character level.
// This prevents overpowered or malformed abilities from entering the game.

import {
  ABILITY_KINDS,
  DAMAGE_TYPES,
  EFFECT_TYPES,
  TARGET_RULES,
  RESOURCE_TYPES,
  SCALING_TYPES,
} from '../data/mechanical_vocabulary';

// ---------------------------------------------------------------------------
// Power budget per ability kind
// ---------------------------------------------------------------------------
export const BASE_BUDGET: Record<string, { base: number; perLevel: number; minMult: number; maxMult: number }> = {
  // Original 15 kinds
  damage:     { base: 12, perLevel: 5, minMult: 0.7, maxMult: 1.3 },
  heal:       { base: 10, perLevel: 4, minMult: 0.7, maxMult: 1.3 },
  dot:        { base: 8,  perLevel: 3, minMult: 0.7, maxMult: 1.4 },
  hot:        { base: 8,  perLevel: 3, minMult: 0.7, maxMult: 1.4 },
  buff:       { base: 5,  perLevel: 2, minMult: 0.6, maxMult: 1.5 },
  debuff:     { base: 5,  perLevel: 2, minMult: 0.6, maxMult: 1.5 },
  shield:     { base: 10, perLevel: 4, minMult: 0.7, maxMult: 1.3 },
  taunt:      { base: 15, perLevel: 6, minMult: 0.8, maxMult: 1.2 },
  aoe_damage: { base: 8,  perLevel: 3, minMult: 0.6, maxMult: 1.2 },
  aoe_heal:   { base: 6,  perLevel: 2, minMult: 0.6, maxMult: 1.2 },
  summon:     { base: 10, perLevel: 4, minMult: 0.7, maxMult: 1.3 },
  cc:         { base: 3,  perLevel: 1, minMult: 0.5, maxMult: 1.5 },
  drain:      { base: 10, perLevel: 4, minMult: 0.7, maxMult: 1.3 },
  execute:    { base: 15, perLevel: 6, minMult: 0.7, maxMult: 1.3 },
  utility:    { base: 5,  perLevel: 2, minMult: 0.5, maxMult: 2.0 },
  // Extended kinds (v2.1+)
  group_heal:   { base: 6,  perLevel: 2, minMult: 0.6, maxMult: 1.2 },
  song:         { base: 4,  perLevel: 1, minMult: 0.5, maxMult: 1.5 },
  aura:         { base: 3,  perLevel: 1, minMult: 0.5, maxMult: 2.0 },
  travel:       { base: 5,  perLevel: 2, minMult: 0.5, maxMult: 2.0 },
  fear:         { base: 2,  perLevel: 1, minMult: 0.5, maxMult: 1.5 },
  bandage:      { base: 8,  perLevel: 3, minMult: 0.7, maxMult: 1.3 },
  potion:       { base: 10, perLevel: 4, minMult: 0.7, maxMult: 1.3 },
  food_summon:  { base: 5,  perLevel: 2, minMult: 0.5, maxMult: 2.0 },
  resurrect:    { base: 1,  perLevel: 0, minMult: 1.0, maxMult: 1.0 },
  craft_boost:  { base: 5,  perLevel: 2, minMult: 0.5, maxMult: 2.0 },
  gather_boost: { base: 5,  perLevel: 2, minMult: 0.5, maxMult: 2.0 },
  pet_command:  { base: 5,  perLevel: 2, minMult: 0.5, maxMult: 2.0 },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ABILITY_KINDS_SET = new Set<string>(ABILITY_KINDS);
const DAMAGE_TYPES_SET = new Set<string>(DAMAGE_TYPES);
const EFFECT_TYPES_SET = new Set<string>(EFFECT_TYPES);
const TARGET_RULES_SET = new Set<string>(TARGET_RULES);
const RESOURCE_TYPES_SET = new Set<string>(RESOURCE_TYPES);
const SCALING_TYPES_SET = new Set<string>(SCALING_TYPES);

// ---------------------------------------------------------------------------
// validateSkillFields
// ---------------------------------------------------------------------------
export interface SkillFields {
  kind: string;
  targetRule: string;
  resourceType: string;
  scaling: string;
  damageType?: string;
  effectType?: string;
  // Numeric fields (passed through)
  value1?: bigint | number;
  value2?: bigint | number;
  effectMagnitude?: bigint | number;
  effectDuration?: bigint | number;
  resourceCost?: bigint | number;
  castSeconds?: bigint | number;
  cooldownSeconds?: bigint | number;
  levelRequired?: bigint | number;
  [key: string]: any;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  sanitized: SkillFields;
}

export function validateSkillFields(skill: SkillFields): ValidationResult {
  const errors: string[] = [];
  const sanitized = { ...skill };

  // Validate and sanitize enum fields
  if (!ABILITY_KINDS_SET.has(skill.kind)) {
    errors.push(`Invalid kind "${skill.kind}", defaulting to "damage"`);
    sanitized.kind = 'damage';
  }

  if (!TARGET_RULES_SET.has(skill.targetRule)) {
    errors.push(`Invalid targetRule "${skill.targetRule}", defaulting to "single_enemy"`);
    sanitized.targetRule = 'single_enemy';
  }

  if (!RESOURCE_TYPES_SET.has(skill.resourceType)) {
    errors.push(`Invalid resourceType "${skill.resourceType}", defaulting to "mana"`);
    sanitized.resourceType = 'mana';
  }

  if (!SCALING_TYPES_SET.has(skill.scaling)) {
    errors.push(`Invalid scaling "${skill.scaling}", defaulting to "none"`);
    sanitized.scaling = 'none';
  }

  if (skill.damageType != null && !DAMAGE_TYPES_SET.has(skill.damageType)) {
    errors.push(`Invalid damageType "${skill.damageType}", defaulting to "physical"`);
    sanitized.damageType = 'physical';
  }

  if (skill.effectType != null && !EFFECT_TYPES_SET.has(skill.effectType)) {
    errors.push(`Invalid effectType "${skill.effectType}", defaulting to "damage_up"`);
    sanitized.effectType = 'damage_up';
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized,
  };
}

// ---------------------------------------------------------------------------
// clampToBudget
// ---------------------------------------------------------------------------
export interface ClampedFields {
  value1: bigint;
  effectMagnitude?: bigint;
}

export function clampToBudget(kind: string, level: number | bigint, fields: { value1: bigint | number; effectMagnitude?: bigint | number }): ClampedFields {
  const budget = BASE_BUDGET[kind] ?? BASE_BUDGET['damage'];
  const lvl = Number(level);
  const midpoint = budget.base + budget.perLevel * lvl;
  const min = Math.floor(midpoint * budget.minMult);
  const max = Math.ceil(midpoint * budget.maxMult);

  const clamp = (val: bigint | number): bigint => {
    const n = Number(val);
    if (n < min) return BigInt(min);
    if (n > max) return BigInt(max);
    return BigInt(n);
  };

  const result: ClampedFields = {
    value1: clamp(fields.value1),
  };

  if (fields.effectMagnitude != null) {
    // Effect magnitudes use a tighter budget (roughly half)
    const effectMin = Math.floor(min * 0.5);
    const effectMax = Math.ceil(max * 0.5);
    const n = Number(fields.effectMagnitude);
    result.effectMagnitude = BigInt(Math.max(effectMin, Math.min(effectMax, n)));
  }

  return result;
}

// ---------------------------------------------------------------------------
// processGeneratedSkill
// ---------------------------------------------------------------------------
export function processGeneratedSkill(skill: SkillFields, level: number | bigint): SkillFields {
  const { sanitized } = validateSkillFields(skill);

  const clamped = clampToBudget(
    sanitized.kind,
    level,
    {
      value1: sanitized.value1 ?? 10,
      effectMagnitude: sanitized.effectMagnitude,
    }
  );

  // Enforce mana cast time floor: mana abilities must have castSeconds >= 1
  let castSeconds = sanitized.castSeconds;
  if (sanitized.resourceType === 'mana') {
    const castVal = Number(castSeconds ?? 0);
    if (castVal < 1) {
      castSeconds = 1;
    }
  }

  // Enforce effect duration floor: dot/hot/buff/debuff need at least 9s (3 ticks at 3s rounds)
  let effectDuration = sanitized.effectDuration;
  const durKinds = new Set(['dot', 'hot', 'buff', 'debuff']);
  if (durKinds.has(sanitized.kind as string) && effectDuration != null) {
    const durVal = Number(effectDuration);
    if (durVal > 0 && durVal < 9) {
      effectDuration = 9;
    }
  }

  return {
    ...sanitized,
    value1: clamped.value1,
    effectMagnitude: clamped.effectMagnitude,
    castSeconds,
    effectDuration,
  };
}
