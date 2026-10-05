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
// Phase 43 (plan 13) stages the class. The class machine is
//
//   AWAITING_ARCHETYPE -> GENERATING_CLASS   (creation_class_reveal job: name, description, first ability)
//   GENERATING_CLASS   -> CLASS_FILLING      (reveal applied; startClassFill enqueues creation_class in the same transaction)
//   CLASS_FILLING      -> CLASS_REVEALED     (fill applied: stats and two more abilities, then the player chooses one)
//   CLASS_FILLING      -> CLASS_FILL_ERROR   (fill failed, malformed, expired or refused; the reveal stays)
//   CLASS_FILL_ERROR   -> CLASS_FILLING      (any input: retryClassFill re-enqueues the fill only, never the reveal)
//   CLASS_FILL_ERROR   -> AWAITING_ARCHETYPE (go back)
//
// A failed or stranded reveal returns to AWAITING_ARCHETYPE. Confirmation waits for the fill:
// nothing reaches CLASS_REVEALED, AWAITING_NAME or COMPLETE with only the stage-1 ability.
//
// Imports are limited to ./events, ./segments, ./llm_queue and ./llm_inputs, so this module
// loads in plain Node vitest (with the spacetimedb/server mock).
// ============================================================================

import type { CreationClassFillInput, CreationClassInput, CreationRaceInput } from '../data/llm_layers';
import { appendCreationEvent } from './events';
import { flattenSegments, keeperFallback, keeperSegments, type Segment } from './segments';
import { enqueueLlmJob, llmRefusalMessage, SOURCE_KEYS } from './llm_queue';
import { encodeRouteInput } from './llm_inputs';

/** Post a Keeper-voice creation line with its segments; `message` is always the flattened segments. */
function postKeeperSegments(ctx: any, playerId: any, kind: string, segments: Segment[]): void {
  appendCreationEvent(ctx, playerId, kind, flattenSegments(segments), segments);
}

export type CreationGenerationType = 'race' | 'class';
export type CreationGenerationOutcome = 'reused' | 'enqueued' | 'duplicate' | 'refused';

/** Posted with the class reveal: the player is told to wait for the rest of the kit. */
export const CLASS_REVEAL_MILESTONE_LINE =
  'That is the shape of you. The rest of your abilities are still being worked out, so do not touch anything.';
/** The fill failed, expired, was malformed or was refused: the reveal stands and any input retries. */
export const CLASS_FILL_FAILED_LINE =
  'The thread of your finer details slips away. Your class and first ability stand. Say anything and the rest will be tried again.';
/** Input while the fill is running changes nothing. */
export const CLASS_FILL_PATIENCE_LINE = 'The Keeper is still working out the rest of what you can do. Patience.';
/** Posted when a retry of the fill starts. */
export const CLASS_FILL_RETRY_LINE = 'The Keeper picks the thread of your finer details back up...';
/**
 * Appended to every refusal or resting line that leaves the state at CLASS_FILL_ERROR (review WR-B03):
 * nothing retries the fill on its own there, only the player's next input does. The Keeper is he.
 */
export const CLASS_FILL_RETRY_HINT = 'Say anything when you want the rest tried again.';

/** A refusal or resting line followed by the CLASS_FILL_ERROR retry hint. */
export function classFillRetryLine(message: string): string {
  return `${message} ${CLASS_FILL_RETRY_HINT}`;
}

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
  let route: 'creation_race' | 'creation_class_reveal';
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
    route = 'creation_class_reveal';
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
    postKeeperSegments(ctx, state.playerId, 'creation_error', keeperFallback(llmRefusalMessage(result.refused)));
    return 'refused';
  }
  return result.created ? 'enqueued' : 'duplicate';
}

/**
 * The stage-2 input, read back from the stored stage-1 reveal: race, archetype, class name and
 * description, and the first ability (the first element of the stored abilities JSON). Throws a
 * plain Error when the state holds no first ability. The values were clamped by validateClassReply
 * and are sanitized again by buildCreationClassFillVolatile.
 */
export function buildClassFillInput(state: any): CreationClassFillInput {
  let first: any;
  try {
    const parsed = JSON.parse(String(state?.abilities ?? ''));
    first = Array.isArray(parsed) ? parsed[0] : undefined;
  } catch {
    first = undefined;
  }
  if (first === null || typeof first !== 'object' || Array.isArray(first)) {
    throw new Error('class fill has no first ability on the creation state');
  }
  return {
    raceName: state.raceName ?? 'Unknown',
    raceNarrative: state.raceNarrative ?? '',
    archetype: state.archetype ?? 'warrior',
    className: state.className ?? '',
    classDescription: state.classDescription ?? '',
    firstAbility: {
      name: String(first.name ?? ''),
      description: String(first.description ?? ''),
      kind: String(first.kind ?? ''),
      damageType: String(first.damageType ?? ''),
      resourceType: String(first.resourceType ?? ''),
    },
  };
}

/**
 * Stage 2 of the class: enqueue the creation_class fill for the stored reveal and move the state to
 * CLASS_FILLING. Called in the same transaction as the reveal apply. A refused enqueue (budget, cap,
 * kill switch, ceiling) or a state without a first ability sets CLASS_FILL_ERROR and posts one
 * creation_error line; the reveal on the state is never touched.
 */
export function startClassFill(ctx: any, state: any): 'enqueued' | 'duplicate' | 'refused' {
  const toError = (message: string): 'refused' => {
    const current = ctx.db.character_creation_state.id.find(state.id) ?? state;
    ctx.db.character_creation_state.id.update({ ...current, step: 'CLASS_FILL_ERROR', updatedAt: ctx.timestamp });
    postKeeperSegments(ctx, state.playerId, 'creation_error', keeperFallback(message));
    return 'refused';
  };

  let input: CreationClassFillInput;
  try {
    input = buildClassFillInput(state);
  } catch {
    return toError(CLASS_FILL_FAILED_LINE);
  }

  const result = enqueueLlmJob(ctx, {
    route: 'creation_class',
    playerId: state.playerId,
    characterId: 0n,
    // Same source key as the reveal: the route is part of the dedupe key, so the two never merge.
    sourceKey: SOURCE_KEYS.creation(state.id, 'class'),
    request: { creationStateId: state.id.toString(), generationType: 'class', input: encodeRouteInput(input) },
  });
  // CLASS_FILL_ERROR waits for the player's input, so the refusal line must say so (review WR-B03).
  if (result.refused) return toError(classFillRetryLine(llmRefusalMessage(result.refused)));

  const current = ctx.db.character_creation_state.id.find(state.id) ?? state;
  ctx.db.character_creation_state.id.update({ ...current, step: 'CLASS_FILLING', updatedAt: ctx.timestamp });
  return result.created ? 'enqueued' : 'duplicate';
}

/**
 * Retry the fill from CLASS_FILL_ERROR (any player input). Only the creation_class fill is
 * enqueued: the reveal is never regenerated. The retry line is posted when a job was enqueued.
 */
export function retryClassFill(ctx: any, state: any): 'enqueued' | 'duplicate' | 'refused' {
  const outcome = startClassFill(ctx, state);
  if (outcome === 'enqueued') postKeeperSegments(ctx, state.playerId, 'creation', keeperFallback(CLASS_FILL_RETRY_LINE));
  return outcome;
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

  postKeeperSegments(
    ctx,
    state.playerId,
    'creation',
    keeperSegments(
      `${existingRace.narrative || 'An interesting choice.'}\n\n` +
        `**${existingRace.name}**${bonusText}\n\n` +
        `Now then. Every creature must choose a path, and you are no exception. Are you a [Warrior] — all muscle and stubborn refusal to die gracefully? Or a [Mystic] — convinced that reality is merely a suggestion? Choose.` +
        `\n\n(If you're already regretting your choices, type "go back." Nobody will judge... much.)`,
    ),
  );
}
