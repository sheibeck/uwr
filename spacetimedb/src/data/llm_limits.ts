// ============================================================================
// Phase 41 LLM limits (pure module)
// ============================================================================
//
// Every executor, retry, sweeper, budget and smoke-test limit lives here as a
// named constant, so Phase 43 tunes them in one place. Nothing here imports the
// schema, helpers or the SpacetimeDB server entry point.
//
// Sources: CONTEXT "Executor mechanics" (global in-flight cap is 4, set as one
// constant), "Failures, sweeper and player messaging", "Budget and cost"
// (per-player daily limits are constants in one module).
// ============================================================================

import type { LlmRoute } from './llm_routes';

// -- In-flight cap and deferral ---------------------------------------------

/** Global cap on concurrent in_flight jobs (the local runtime caps at 4). */
export const LLM_MAX_IN_FLIGHT = 4;
/** Combat narration runs only while in-flight is below this (cap - 1), so gameplay calls keep a slot. */
export const LLM_NARRATION_MAX_IN_FLIGHT = LLM_MAX_IN_FLIGHT - 1;
/** When the cap is full a dispatch reschedules itself this many ms later ... */
export const LLM_DEFER_BASE_MS = 500;
/** ... plus an integer jitter in [0, LLM_DEFER_JITTER_MS). */
export const LLM_DEFER_JITTER_MS = 250;

// -- Retry policy -------------------------------------------------------------

/** Total attempts (first call included) for a transient failure. */
export const LLM_MAX_ATTEMPTS = 3;
/** Backoff before attempt 2 and attempt 3 (ms); retry-after wins when longer. */
export const LLM_RETRY_BASE_MS: readonly number[] = Object.freeze([2000, 8000]);
/** No retry delay (retry-after included) exceeds this before jitter. */
export const LLM_RETRY_MAX_MS = 60_000;
/** Jitter added to a retry delay, as a fraction of the base delay. */
export const LLM_RETRY_JITTER_FRACTION = 0.2;
/**
 * Routes that never auto-retry: creation and world gen, stage 1 and stage 2
 * alike (the player gets an in-voice "try again"), combat narration (one
 * attempt) and the smoke test. Phase 43 adds the two stage-1 routes.
 */
export const LLM_NO_AUTO_RETRY_ROUTES: readonly LlmRoute[] = Object.freeze([
  'creation_race',
  'creation_class_reveal',
  'creation_class',
  'world_gen_start',
  'world_gen',
  'combat_narration',
  'smoke_test',
] as LlmRoute[]);

/**
 * Routes whose truncated reply (stop_reason max_tokens) is retried ONCE automatically before the
 * failure line (Plan 51.3.1.1-32, deferred row 31). Owner, 2026-10-09: "We probably want to limit npc
 * replies to not be over the 1,024 then, yes? I don't want to keep running into this issue." The
 * truncated attempt is billed and logged; the retry takes a fresh reservation (helpers/llm_executor.ts).
 */
export const LLM_TRUNCATION_RETRY_ROUTES: readonly LlmRoute[] = Object.freeze(['npc_conversation'] as LlmRoute[]);

/** A narration result older than this at claim or persist is dropped. */
export const LLM_NARRATION_MAX_AGE_MICROS = 20_000_000n;

// -- Sweeper -------------------------------------------------------------------

export const LLM_SWEEP_INTERVAL_MICROS = 30_000_000n;
/** in_flight longer than the route timeout plus this becomes expired. */
export const LLM_SWEEP_IN_FLIGHT_GRACE_MICROS = 30_000_000n;
/** received but not applied for this long re-runs apply from the stored text. */
export const LLM_SWEEP_RECEIVED_GRACE_MICROS = 60_000_000n;
/** pending older than this becomes expired (10 minutes). */
export const LLM_SWEEP_PENDING_MAX_AGE_MICROS = 600_000_000n;
/** Renown jobs queued in Phase 40 expire only after 24 hours. */
export const LLM_SWEEP_RENOWN_PENDING_MAX_AGE_MICROS = 86_400_000_000n;
/** A generation lock (creation GENERATING_* step, world-gen PENDING/GENERATING state) with no active job this long is released. */
export const LLM_SWEEP_STRANDED_LOCK_GRACE_MICROS = 60_000_000n;

// -- Budget and cost -------------------------------------------------------------

/** Per player per UTC day, cost-weighted ($1.00). */
export const LLM_PLAYER_DAILY_COST_MICRO_USD = 1_000_000n;
/** Per player per UTC day call-count backstop. */
export const LLM_PLAYER_DAILY_CALLS = 200n;
/** Active non-narration jobs per player. */
export const LLM_PLAYER_MAX_ACTIVE_JOBS = 3;
/** llm_player_budget rows older than this many UTC days are prunable. */
export const LLM_BUDGET_RETENTION_DAYS = 2;
/** Apply runs at most this many times (the second re-runs from stored text, no second billed call). */
export const LLM_APPLY_MAX_ATTEMPTS = 2;

// -- Global ceiling and kill switch (Phase 43, COST-03) --------------------------

/** Default global spend ceiling per UTC day across all players ($10.00). */
export const LLM_DAILY_CEILING_DEFAULT_MICRO_USD = 10_000_000n;
/** The lowest ceiling an admin may set ($0.01). */
export const LLM_DAILY_CEILING_MIN_MICRO_USD = 10_000n;
/** The highest ceiling an admin may set ($1,000.00). */
export const LLM_DAILY_CEILING_MAX_MICRO_USD = 1_000_000_000n;

// -- Smoke test ----------------------------------------------------------------

/**
 * One text call plus one minimal call per JSON schema (warms the grammar cache).
 * Phase 43 splits class creation and world generation in two stages, so both
 * stage schemas of each split route are warmed.
 */
export const LLM_SMOKE_ROUTES: readonly LlmRoute[] = Object.freeze([
  'smoke_test',
  'creation_race',
  'creation_class_reveal',
  'creation_class',
  'world_gen_start',
  'world_gen',
  'skill_gen',
  'renown_perk_gen',
] as LlmRoute[]);
/** llm_admin_state.lastSmokeJson is capped at this many characters. */
export const LLM_SMOKE_JSON_MAX_CHARS = 4096;

// -- Singleton row ids -----------------------------------------------------------

export const LLM_ADMIN_STATE_ID = 1n;
export const LLM_SPEND_ID = 1n;
