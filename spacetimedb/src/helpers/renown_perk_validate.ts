/**
 * Pure validation for an active renown perk (no table access, no SpacetimeDB runtime import).
 *
 * Lives apart from llm_apply.ts so offline harnesses (the golden-set rules in scripts/llm) can run the
 * server's own clamp without loading the server runtime. llm_apply.ts imports and re-exports it, so the
 * server stays the single source of truth and the logic is not duplicated.
 */
import { processGeneratedSkill, validateSkillFields, type SkillFields } from './skill_budget';
import { toBigIntSafe } from './safe_numbers';
import { EFFECT_TYPES } from '../data/mechanical_vocabulary';

/**
 * An active renown perk (non-empty kind) becomes a combat ability when chosen, so it goes through
 * the same skill_budget validator and clamps as a generated skill at the character's level:
 * kind, targetRule, resourceType, scaling and damageType must be in the mechanical vocabulary
 * (the renown schema constrains them), value1 and effectMagnitude are clamped to the kind's
 * budget, and a mana perk casts for at least 1 s. effectType is free text in the schema, so an
 * unknown one is defaulted to damage_up as skill_gen does (WR-B03) instead of throwing away a
 * billed reply. Returns the perk with the clamped fields, or null when any other enum is invalid
 * (the perk is dropped, and with fewer than three the static options cover the rank).
 */
export function validateRenownActivePerk(perk: any, level: bigint): any | null {
  const optStr = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined);
  const num = (v: unknown, fallback: number) => Number(toBigIntSafe(v, { min: 0n, max: 1_000_000n, fallback: BigInt(fallback) }));
  const fields: SkillFields = {
    kind: String(perk.kind).trim(),
    targetRule: String(perk.targetRule || 'self'),
    resourceType: String(perk.resourceType || 'none'),
    scaling: String(perk.scaling || 'none'),
    damageType: optStr(perk.damageType),
    effectType: sanitizeEffectType(optStr(perk.effectType)),
    value1: num(perk.value1, 0),
    value2: perk.value2 != null ? num(perk.value2, 0) : undefined,
    effectMagnitude: perk.effectMagnitude != null ? num(perk.effectMagnitude, 0) : undefined,
    effectDuration: perk.effectDuration != null ? num(perk.effectDuration, 0) : undefined,
    resourceCost: num(perk.resourceCost, 0),
    castSeconds: num(perk.castSeconds, 0),
    cooldownSeconds: num(perk.cooldownSeconds, 0),
  };
  if (!validateSkillFields(fields).valid) return null;
  const processed = processGeneratedSkill(fields, level);
  return {
    ...perk,
    kind: processed.kind,
    targetRule: processed.targetRule,
    resourceType: processed.resourceType,
    scaling: processed.scaling,
    damageType: processed.damageType,
    effectType: processed.effectType,
    value1: processed.value1,
    value2: processed.value2,
    effectMagnitude: processed.effectMagnitude,
    effectDuration: processed.effectDuration,
    resourceCost: processed.resourceCost,
    castSeconds: processed.castSeconds,
    cooldownSeconds: processed.cooldownSeconds,
  };
}

/** An effectType outside the vocabulary becomes damage_up, matching validateSkillFields' default. */
function sanitizeEffectType(effectType: string | undefined): string | undefined {
  if (effectType === undefined) return undefined;
  return (EFFECT_TYPES as readonly string[]).includes(effectType) ? effectType : 'damage_up';
}
