// ============================================================================
// Skill offers (Phase 41, plan 12, pure module: duck-typed ctx)
// ============================================================================
//
// One place decides when a character may be offered a new generated ability
// and enqueues the skill_gen job. Level-up, the request_skill_offer reducer and
// the [skills] intent all go through requestSkillOffer, so every entry point
// applies the same rules:
//
//   1. level 2 or higher;
//   2. no pending skill choices waiting;
//   3. no generated ability already taken at the character's current level;
//   4. no active skill_gen job for that level (the enqueue dedupe on the key
//      character + level merges it).
//
// A job that ended failed or expired, or that produced fewer than three skills,
// leaves none of the four blocking, so a failed offer is recoverable with
// [skills] and cannot be farmed for extra abilities.
//
// Imports are limited to ./llm_queue and ./llm_inputs (both pure), so this
// module loads in plain Node vitest.
// ============================================================================

import type { SkillGenInput } from '../data/llm_layers';
import { enqueueLlmJob, llmRefusalMessage, SOURCE_KEYS } from './llm_queue';
import { encodeRouteInput, archetypeForPlayer } from './llm_inputs';

export type SkillOfferEligibility = { ok: true } | { ok: false; message: string };

export interface SkillOfferOutcome {
  kind: 'narrative' | 'system';
  text: string;
}

export const SKILL_OFFER_MESSAGES = Object.freeze({
  tooLow: 'The Keeper regards you blankly. "You have nothing to offer yet. Come back when you have grown."',
  pending: 'Your offering awaits your choice.',
  alreadyTaken: 'The Keeper shakes his head. "You have already claimed a new ability at this level. Grow first."',
  created: 'Something stirs within you. The Keeper stirs to present new abilities for your consideration.',
  duplicate: 'The Keeper is already preparing your offering. Be patient.',
  askAgain: ' Ask again with [skills] later.',
});

/** Whether the character may be offered new skills now (rules 1 to 3; rule 4 is the enqueue dedupe). */
export function canRequestSkillOffer(ctx: any, character: any): SkillOfferEligibility {
  const level = character.level ?? 0n;
  if (level < 2n) return { ok: false, message: SKILL_OFFER_MESSAGES.tooLow };

  for (const _row of ctx.db.pending_skill.by_character.filter(character.id)) {
    return { ok: false, message: SKILL_OFFER_MESSAGES.pending };
  }

  for (const ability of ctx.db.ability_template.by_character.filter(character.id)) {
    if (ability.isGenerated === true && ability.levelRequired === level) {
      return { ok: false, message: SKILL_OFFER_MESSAGES.alreadyTaken };
    }
  }
  return { ok: true };
}

/** Enqueue one skill_gen job (and its dispatch) for the character's current level. */
export function enqueueSkillOffer(ctx: any, character: any, playerId: any) {
  const existingAbilities: { name: string; kind: string }[] = [];
  for (const ab of ctx.db.ability_template.by_character.filter(character.id)) {
    existingAbilities.push({ name: ab.name, kind: ab.kind });
  }
  const input: SkillGenInput = {
    characterName: character.name,
    race: character.race || 'Unknown',
    className: character.className || 'Unknown',
    archetype: archetypeForPlayer(ctx, playerId),
    level: character.level,
    existingAbilities,
  };
  return enqueueLlmJob(ctx, {
    route: 'skill_gen',
    playerId,
    characterId: character.id,
    sourceKey: SOURCE_KEYS.skillGen(character.id, character.level),
    request: { characterId: character.id.toString(), input: encodeRouteInput(input) },
  });
}

/**
 * Check, enqueue and describe the outcome. Writes nothing unless a job was
 * created; the caller shows `text` as a private event of `kind`.
 */
export function requestSkillOffer(ctx: any, character: any, playerId: any): SkillOfferOutcome {
  const eligibility = canRequestSkillOffer(ctx, character);
  if (!eligibility.ok) return { kind: 'system', text: eligibility.message };

  const result = enqueueSkillOffer(ctx, character, playerId);
  if (result.refused) {
    return { kind: 'system', text: llmRefusalMessage(result.refused) + SKILL_OFFER_MESSAGES.askAgain };
  }
  if (!result.created) return { kind: 'system', text: SKILL_OFFER_MESSAGES.duplicate };
  return { kind: 'narrative', text: SKILL_OFFER_MESSAGES.created };
}
