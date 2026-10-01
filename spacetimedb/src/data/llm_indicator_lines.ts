// ============================================================================
// Keeper indicator lines for in-progress LLM jobs (Plan 42-02)
// ============================================================================
//
// The narrative console shows one "the Keeper is working" line while the player's own
// LLM job is pending, in flight or received. The server is the source of truth for these
// strings (project rule): the client imports them from spacetimedb/src/data/ and keeps no
// copy.
//
// This module stays import-free on purpose. The browser bundles it, so it must receive
// strings only: never import llm_routes.ts (schemas, model id, prompt-adjacent data) or
// any other module here. A server test pins key parity with LLM_ROUTE_NAMES and status
// parity with LLM_ACTIVE_JOB_STATUSES.
//
// Voice: every line follows the Keeper voice (dry, understated, no exclamation marks, no
// banned phrases) and the in-game pronoun rule. The Keeper is he; the player is always
// "you". The lines name the Keeper as the actor and use no other pronoun for anyone.
// A trailing ellipsis is three ASCII dots.
//
// Phase 43 stages class creation and world generation: the stage-1 routes
// (creation_class_reveal, world_gen_start) block the player's input; the fill routes
// (creation_class, world_gen) run after the reveal and do not lock input, so their lines
// show only while the job is active.
//
// A null line means the route is silent: it never produces an indicator.
// ============================================================================

/** Shown for an unknown route, and while an input lock has no job row yet (same as creation_race). */
export const LLM_INDICATOR_FALLBACK_LINE: string = 'The Keeper is considering your fate...';

/** One entry per LLM route. null = silent (no indicator). */
export const LLM_INDICATOR_LINES: Readonly<Record<string, string | null>> = Object.freeze({
  creation_race: 'The Keeper is considering your fate...',
  creation_class_reveal: 'The Keeper is deciding what you are good for...',
  creation_class: 'The Keeper is sorting out the rest of what you can do...',
  world_gen_start: 'The Keeper is unrolling a map, with visible reluctance...',
  world_gen: 'The Keeper is filling in the rest of the map, grudgingly...',
  skill_gen: 'The Keeper is weighing what you might become...',
  renown_perk_gen: 'The Keeper is tallying what your name is worth...',
  npc_conversation: 'The Keeper leans in to listen...',
  combat_narration: null,
  smoke_test: null,
});

/** When several jobs are active, the first route in this list wins (blocking work outranks chat). */
export const LLM_INDICATOR_PRIORITY: readonly string[] = Object.freeze([
  'world_gen_start',
  'creation_race',
  'creation_class_reveal',
  'creation_class',
  'world_gen',
  'skill_gen',
  'renown_perk_gen',
  'npc_conversation',
]);

/** Routes that never produce an indicator. */
export const LLM_INDICATOR_SILENT_ROUTES: readonly string[] = Object.freeze([
  'combat_narration',
  'smoke_test',
]);

/**
 * Console scoping. my_llm_jobs is per identity, so each console shows only the routes that
 * belong to what the player is doing there:
 * - the character-creation console shows creation work and the starter world generation;
 * - the game console shows everything except creation work (a creation job left running
 *   never shows "considering your fate" over a character already in play).
 */
export const LLM_CREATION_CONSOLE_ROUTES: readonly string[] = Object.freeze([
  'creation_race',
  'creation_class_reveal',
  'creation_class',
  'world_gen_start',
  'world_gen',
]);

/** Routes the game console never shows: they belong to the creation console only. */
export const LLM_CREATION_ONLY_ROUTES: readonly string[] = Object.freeze([
  'creation_race',
  'creation_class_reveal',
  'creation_class',
]);

/** Job statuses that count as in progress. Mirrors LLM_ACTIVE_JOB_STATUSES on the server. */
export const LLM_INDICATOR_ACTIVE_STATUSES: readonly string[] = Object.freeze([
  'pending',
  'in_flight',
  'received',
]);
