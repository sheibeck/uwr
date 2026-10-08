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
  region_economy: null,
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
  'region_economy',
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

/**
 * How long the client holds one progress line before showing the next from the route's pool
 * (Plan 43-09, LAT-05). This is not a staleness timer: it only changes which line of the pool
 * shows while a job is active.
 */
export const LLM_PROGRESS_ROTATE_MS = 5000;

/**
 * Rotating progress lines, one pool per route (Plan 43-09, LAT-05). While a job is active the
 * client shows pool[rotation % pool.length] and advances the rotation every
 * LLM_PROGRESS_ROTATE_MS. pool[0] is always the Phase 42 line for the route, so a fresh
 * indicator looks as it did before. Silent routes have an empty pool. Same voice and pronoun
 * rules as LLM_INDICATOR_LINES (the tests check every line).
 */
export const LLM_INDICATOR_POOLS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  creation_race: Object.freeze([
    'The Keeper is considering your fate...',
    'The Keeper is consulting a very old and very dusty list of peoples...',
    'The Keeper is pretending not to be impressed by your ancestry...',
  ]),
  creation_class_reveal: Object.freeze([
    'The Keeper is deciding what you are good for...',
    'The Keeper is working out what you are...',
    'The Keeper is sizing you up, unkindly...',
  ]),
  creation_class: Object.freeze([
    'The Keeper is sorting out the rest of what you can do...',
    'The Keeper is deciding which of your talents to admit to...',
    'The Keeper is writing down your abilities in very small print...',
  ]),
  world_gen_start: Object.freeze([
    'The Keeper is unrolling a map, with visible reluctance...',
    'The Keeper is deciding where you will stand...',
    'The Keeper is squinting at the horizon...',
  ]),
  world_gen: Object.freeze([
    'The Keeper is filling in the rest of the map, grudgingly...',
    'The Keeper is deciding who else lives out here...',
    'The Keeper is placing things that will want to eat you...',
    'The Keeper is remembering the roads between places...',
  ]),
  skill_gen: Object.freeze(['The Keeper is weighing what you might become...']),
  renown_perk_gen: Object.freeze(['The Keeper is tallying what your name is worth...']),
  npc_conversation: Object.freeze(['The Keeper leans in to listen...']),
  combat_narration: Object.freeze([] as string[]),
  region_economy: Object.freeze([] as string[]),
  smoke_test: Object.freeze([] as string[]),
});

/**
 * Stage-1 world generation steps that lock the narrative input (Plan 43-09, LAT-03/LAT-04).
 * The stage-2 steps (FILLING, FILL_ERROR) are deliberately absent: the player can play in the
 * stage-1 region while the rest fills, and after a failed fill.
 */
export const LLM_INPUT_LOCKING_WORLD_GEN_STEPS: readonly string[] = Object.freeze([
  'PENDING',
  'GENERATING',
]);

/**
 * Creation steps that lock the narrative input. CLASS_FILLING and CLASS_FILL_ERROR are
 * deliberately absent: the server answers input during the class fill with a patience line.
 */
export const LLM_INPUT_LOCKING_CREATION_STEPS: readonly string[] = Object.freeze([
  'GENERATING_RACE',
  'GENERATING_CLASS',
]);

/** Job statuses that count as in progress. Mirrors LLM_ACTIVE_JOB_STATUSES on the server. */
export const LLM_INDICATOR_ACTIVE_STATUSES: readonly string[] = Object.freeze([
  'pending',
  'in_flight',
  'received',
]);
