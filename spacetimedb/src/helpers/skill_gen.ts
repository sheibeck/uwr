// ============================================================================
// SKILL GEN — LLM result parsing, validation, and PendingSkill insertion
// ============================================================================
//
// Parses the JSON returned by the LLM skill generation prompt, validates
// and clamps each skill via skill_budget.ts, then inserts PendingSkill rows.

import { processGeneratedSkill, type SkillFields } from './skill_budget';

export interface ParsedSkill {
  name: string;
  description: string;
  kind: string;
  targetRule: string;
  resourceType: string;
  resourceCost: bigint;
  castSeconds: bigint;
  cooldownSeconds: bigint;
  scaling: string;
  value1: bigint;
  value2?: bigint;
  damageType?: string;
  effectType?: string;
  effectMagnitude?: bigint;
  effectDuration?: bigint;
  levelRequired: bigint;
}

/**
 * Extract JSON from LLM response text, handling markdown code fences and
 * raw text wrapping. Same brace-extraction fallback used in creation.ts.
 */
function extractJson(raw: string): any {
  let text = raw.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
  }
  return JSON.parse(text);
}

/**
 * Parse the LLM skill generation result into 3 validated, clamped skill objects.
 *
 * @returns skills: array of parsed skills (ideally 3), errors: validation warnings
 */
export function parseSkillGenResult(
  resultText: string,
  characterId: bigint,
  level: bigint
): { skills: ParsedSkill[]; errors: string[] } {
  const errors: string[] = [];

  let data: any;
  try {
    data = extractJson(resultText);
  } catch (e) {
    return { skills: [], errors: [`JSON parse error: ${e}`] };
  }

  if (!data.skills || !Array.isArray(data.skills)) {
    return { skills: [], errors: ['Missing "skills" array in LLM response'] };
  }

  if (data.skills.length < 3) {
    errors.push(`Expected 3 skills, got ${data.skills.length}`);
  }

  const skills: ParsedSkill[] = [];

  // Process up to 3 skills
  for (let i = 0; i < Math.min(data.skills.length, 3); i++) {
    const raw = data.skills[i];

    if (!raw.name || !raw.kind) {
      errors.push(`Skill ${i + 1} missing name or kind, skipping`);
      continue;
    }

    // Build the SkillFields object for validation + clamping
    const fields: SkillFields = {
      kind: String(raw.kind || 'damage'),
      targetRule: String(raw.targetRule || 'single_enemy'),
      resourceType: String(raw.resourceType || 'mana'),
      scaling: String(raw.scaling || 'none'),
      value1: toBigInt(raw.value1, 10),
      value2: raw.value2 != null ? toBigInt(raw.value2, 0) : undefined,
      damageType: raw.damageType || undefined,
      effectType: raw.effectType || undefined,
      effectMagnitude: raw.effectMagnitude != null ? toBigInt(raw.effectMagnitude, 0) : undefined,
      effectDuration: raw.effectDuration != null ? toBigInt(raw.effectDuration, 0) : undefined,
      resourceCost: toBigInt(raw.resourceCost, 5),
      castSeconds: toBigInt(raw.castSeconds, 0),
      cooldownSeconds: toBigInt(raw.cooldownSeconds, 6),
    };

    // Validate enum fields and clamp power values via skill_budget
    const processed = processGeneratedSkill(fields, level);

    const parsed: ParsedSkill = {
      name: String(raw.name).slice(0, 80),
      description: String(raw.description || 'A mysterious ability.').slice(0, 300),
      kind: processed.kind as string,
      targetRule: processed.targetRule as string,
      resourceType: processed.resourceType as string,
      resourceCost: toBigInt(processed.resourceCost, 5),
      castSeconds: toBigInt(processed.castSeconds, 0),
      cooldownSeconds: toBigInt(processed.cooldownSeconds, 6),
      scaling: processed.scaling as string,
      value1: toBigInt(processed.value1, 10),
      value2: processed.value2 != null ? toBigInt(processed.value2, 0) : undefined,
      damageType: processed.damageType || undefined,
      effectType: processed.effectType || undefined,
      effectMagnitude: processed.effectMagnitude != null ? toBigInt(processed.effectMagnitude, 0) : undefined,
      effectDuration: processed.effectDuration != null ? toBigInt(processed.effectDuration, 0) : undefined,
      levelRequired: level,
    };

    skills.push(parsed);
  }

  if (skills.length < 3) {
    errors.push(`Only ${skills.length} valid skills after parsing (need 3)`);
  }

  return { skills, errors };
}

/**
 * Insert PendingSkill rows for a character. Deletes any existing pending skills
 * first (in case of retry).
 */
export function insertPendingSkills(
  ctx: any,
  characterId: bigint,
  skills: ParsedSkill[],
  level: bigint
): void {
  // Delete any existing PendingSkill rows for this character (retry safety)
  const existing = [...ctx.db.pending_skill.by_character.filter(characterId)];
  for (const row of existing) {
    ctx.db.pending_skill.id.delete(row.id);
  }

  // Insert new PendingSkill rows
  for (const skill of skills) {
    ctx.db.pending_skill.insert({
      id: 0n,
      characterId,
      name: skill.name,
      description: skill.description,
      kind: skill.kind,
      targetRule: skill.targetRule,
      resourceType: skill.resourceType,
      resourceCost: skill.resourceCost,
      castSeconds: skill.castSeconds,
      cooldownSeconds: skill.cooldownSeconds,
      scaling: skill.scaling,
      value1: skill.value1,
      value2: skill.value2,
      damageType: skill.damageType,
      effectType: skill.effectType,
      effectMagnitude: skill.effectMagnitude,
      effectDuration: skill.effectDuration,
      levelRequired: level,
      createdAt: ctx.timestamp,
    });
  }
}

/** Helper: safely convert a value to bigint with a fallback default */
function toBigInt(val: any, fallback: number): bigint {
  if (typeof val === 'bigint') return val;
  if (typeof val === 'number' && !isNaN(val)) return BigInt(Math.round(val));
  if (typeof val === 'string') {
    const n = Number(val);
    if (!isNaN(n)) return BigInt(Math.round(n));
  }
  return BigInt(fallback);
}
