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
//   3. no active skill_gen job for the character at ANY level (one offer at a
//      time: two jobs for consecutive levels would both be billed and the later
//      apply would overwrite the earlier offer);
//   4. some level from 2 up to the character's level still has no generated
//      ability taken (one offer per level).
//
// The offer is for the character's current level when nothing was taken at it,
// otherwise for the lowest earlier level still owed (WR-B02). The job carries
// that level and the apply step labels the offer with it. Claiming two levels
// quickly offers level N first; choosing from it queues the level N+1 offer in
// the same transaction (offerNextOwedSkill, called by choose_skill), so no level
// needs a [skills] the player was never told about.
//
// A job that ended failed or expired, or that produced fewer than three skills,
// leaves none of the four blocking, so a failed offer is recoverable with
// [skills] (or by the next choice) and cannot be farmed for extra abilities.
//
// Imports are limited to ./llm_queue and ./llm_inputs (both pure), so this
// module loads in plain Node vitest.
// ============================================================================

import type { SkillGenInput } from '../data/llm_layers';
import { enqueueLlmJob, hasActiveJobForCharacter, llmRefusalMessage, SOURCE_KEYS } from './llm_queue';
import { encodeRouteInput, archetypeForCharacter } from './llm_inputs';

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
  duplicate: 'The Keeper is already preparing an offering. Once you choose from it, any further offering you are owed follows.',
  askAgain: ' Ask again with [skills] later.',
});

/** Whether the character may be offered new skills now (rules 1 to 4). */
export function canRequestSkillOffer(ctx: any, character: any): SkillOfferEligibility {
  const level = character.level ?? 0n;
  if (level < 2n) return { ok: false, message: SKILL_OFFER_MESSAGES.tooLow };

  for (const _row of ctx.db.pending_skill.by_character.filter(character.id)) {
    return { ok: false, message: SKILL_OFFER_MESSAGES.pending };
  }

  if (hasActiveJobForCharacter(ctx, 'skill_gen', character.id)) {
    return { ok: false, message: SKILL_OFFER_MESSAGES.duplicate };
  }

  if (owedSkillOfferLevel(ctx, character) === null) {
    return { ok: false, message: SKILL_OFFER_MESSAGES.alreadyTaken };
  }
  return { ok: true };
}

/**
 * The level the next offer is for: the character's current level when no generated ability was
 * taken at it, otherwise the lowest level from 2 with none (an offer lost to a failure or to a
 * quick double level-up). Null when every level from 2 up to the current one has its ability.
 */
export function owedSkillOfferLevel(ctx: any, character: any): bigint | null {
  const level: bigint = character.level ?? 0n;
  if (level < 2n) return null;
  const taken = new Set<bigint>();
  for (const ability of ctx.db.ability_template.by_character.filter(character.id)) {
    if (ability.isGenerated === true && typeof ability.levelRequired === 'bigint') taken.add(ability.levelRequired);
  }
  if (!taken.has(level)) return level;
  for (let l = 2n; l < level; l++) {
    if (!taken.has(l)) return l;
  }
  return null;
}

/** Enqueue one skill_gen job (and its dispatch) for `level` (default: the character's current level). */
export function enqueueSkillOffer(ctx: any, character: any, playerId: any, level: bigint = character.level) {
  const existingAbilities: { name: string; kind: string }[] = [];
  for (const ab of ctx.db.ability_template.by_character.filter(character.id)) {
    existingAbilities.push({ name: ab.name, kind: ab.kind });
  }
  const input: SkillGenInput = {
    characterName: character.name,
    race: character.race || 'Unknown',
    className: character.className || 'Unknown',
    archetype: archetypeForCharacter(ctx, character, playerId),
    level,
    existingAbilities,
  };
  return enqueueLlmJob(ctx, {
    route: 'skill_gen',
    playerId,
    characterId: character.id,
    sourceKey: SOURCE_KEYS.skillGen(character.id, level),
    // `level` is the level this offer is for; the apply step labels the offer with it.
    request: { characterId: character.id.toString(), level: level.toString(), input: encodeRouteInput(input) },
  });
}

/**
 * Check, enqueue and describe the outcome. Writes nothing unless a job was
 * created; the caller shows `text` as a private event of `kind`.
 */
export function requestSkillOffer(ctx: any, character: any, playerId: any): SkillOfferOutcome {
  const eligibility = canRequestSkillOffer(ctx, character);
  if (!eligibility.ok) return { kind: 'system', text: eligibility.message };

  const level = owedSkillOfferLevel(ctx, character);
  if (level === null) return { kind: 'system', text: SKILL_OFFER_MESSAGES.alreadyTaken };
  const result = enqueueSkillOffer(ctx, character, playerId, level);
  if (result.refused) {
    return { kind: 'system', text: llmRefusalMessage(result.refused) + SKILL_OFFER_MESSAGES.askAgain };
  }
  if (!result.created) return { kind: 'system', text: SKILL_OFFER_MESSAGES.duplicate };
  return { kind: 'narrative', text: SKILL_OFFER_MESSAGES.created };
}

/**
 * After a skill choice: queue the next owed level's offer, if any. Returns null when nothing is
 * owed or an offer is already open (the caller says nothing more); otherwise the outcome to show
 * (the created line, or a refusal that says how to ask again).
 */
export function offerNextOwedSkill(ctx: any, character: any, playerId: any): SkillOfferOutcome | null {
  if (!canRequestSkillOffer(ctx, character).ok) return null;
  return requestSkillOffer(ctx, character, playerId);
}
