// ============================================================================
// Character-creation generation (Phase 41, plan 13, PIPE-01 / PIPE-04)
// ============================================================================
//
// submit_creation_input moves the creation state to GENERATING_RACE or
// GENERATING_CLASS and then calls startCreationGeneration in the same
// transaction. The helper either
//
//   - 'reused':   the race description names a known race_definition, so the
//                 state moves straight to AWAITING_ARCHETYPE with that race and
//                 no model call is made (the old prepare reducer's short-circuit);
//   - 'enqueued': one creation_race or creation_class job and its dispatch row
//                 were created;
//   - 'duplicate': an active job for this state and type already exists (nothing
//                 more is written, the state stays GENERATING_*);
//   - 'refused':  the budget or the per-player cap said no; no job exists, the
//                 state is back at the awaiting step and the in-voice refusal is
//                 posted as a creation_error event (no character exists yet, so
//                 there is no fail() context).
//
// Creation never auto-retries (LLM_NO_AUTO_RETRY_ROUTES): a failed call ends the
// job after one attempt, applyLlmFailure returns the state to the awaiting step,
// and only the player's next submission starts a new call.
//
// Imports are limited to ./events, ./llm_queue and ./llm_inputs, so this module
// loads in plain Node vitest (with the spacetimedb/server mock).
// ============================================================================

import type { CreationClassInput, CreationRaceInput } from '../data/llm_layers';
import { appendCreationEvent } from './events';
import { enqueueLlmJob, llmRefusalMessage, SOURCE_KEYS } from './llm_queue';
import { encodeRouteInput } from './llm_inputs';

export type CreationGenerationType = 'race' | 'class';
export type CreationGenerationOutcome = 'reused' | 'enqueued' | 'duplicate' | 'refused';

/** The step a failed or refused generation returns to. */
const AWAITING_STEP: Record<CreationGenerationType, string> = {
  race: 'AWAITING_RACE',
  class: 'AWAITING_ARCHETYPE',
};

/**
 * Start race or class generation for the creation state (which the caller has
 * just moved to GENERATING_RACE or GENERATING_CLASS). Writes nothing to the
 * state unless the race is reused or the enqueue is refused.
 */
export function startCreationGeneration(
  ctx: any,
  state: any,
  generationType: CreationGenerationType,
): CreationGenerationOutcome {
  let route: 'creation_race' | 'creation_class';
  let input: CreationRaceInput | CreationClassInput;

  if (generationType === 'race') {
    const description = state.raceDescription ?? '';
    // An existing race definition is reused with no model call.
    for (const existing of ctx.db.race_definition.by_name.filter(description.trim().toLowerCase())) {
      reuseRace(ctx, state, existing);
      return 'reused';
    }
    route = 'creation_race';
    input = { raceDescription: description };
  } else {
    route = 'creation_class';
    input = {
      raceName: state.raceName ?? 'Unknown',
      raceNarrative: state.raceNarrative ?? '',
      archetype: state.archetype ?? 'warrior',
    };
  }

  const result = enqueueLlmJob(ctx, {
    route,
    playerId: state.playerId,
    characterId: 0n,
    sourceKey: SOURCE_KEYS.creation(state.id, generationType),
    // creationStateId ties the result and the failure to this state row: the apply step touches
    // it only while it is still at the matching GENERATING step.
    request: { creationStateId: state.id.toString(), generationType, input: encodeRouteInput(input) },
  });

  if (result.refused) {
    ctx.db.character_creation_state.id.update({
      ...state,
      step: AWAITING_STEP[generationType],
      updatedAt: ctx.timestamp,
    });
    appendCreationEvent(ctx, state.playerId, 'creation_error', llmRefusalMessage(result.refused));
    return 'refused';
  }
  return result.created ? 'enqueued' : 'duplicate';
}

/** The known-race branch: the state advances and the reuse text is posted. */
function reuseRace(ctx: any, state: any, existingRace: any): void {
  ctx.db.character_creation_state.id.update({
    ...state,
    step: 'AWAITING_ARCHETYPE',
    raceName: existingRace.name,
    raceNarrative: existingRace.narrative,
    raceBonuses: existingRace.bonusesJson,
    updatedAt: ctx.timestamp,
  });

  let bonuses: any = {};
  try {
    bonuses = JSON.parse(existingRace.bonusesJson);
  } catch {
    bonuses = {};
  }
  const bonusText = bonuses.primary
    ? `\n+${bonuses.primary.value || 2} ${(bonuses.primary.stat || 'STR').toUpperCase()}, +${bonuses.secondary?.value || 1} ${(bonuses.secondary?.stat || 'DEX').toUpperCase()}${bonuses.flavor ? `. ${bonuses.flavor}` : ''}`
    : '';

  appendCreationEvent(
    ctx,
    state.playerId,
    'creation',
    `${existingRace.narrative || 'An interesting choice.'}\n\n` +
      `**${existingRace.name}**${bonusText}\n\n` +
      `Now then. Every creature must choose a path, and you are no exception. Are you a [Warrior] — all muscle and stubborn refusal to die gracefully? Or a [Mystic] — convinced that reality is merely a suggestion? Choose.` +
      `\n\n(If you're already regretting your choices, type "go back." The Keeper does not judge... much.)`,
  );
}
