// ============================================================================
// LLM job queue helpers (Phase 40, pure module: duck-typed ctx)
// ============================================================================
//
// enqueueLlmJob is the single in-transaction entry point for every LLM action.
// It runs inside the triggering reducer's transaction. Reducers serialize, so
// the in-transaction dedupe lookup plus insert cannot race: two tabs on one
// identity produce exactly one job per action.
//
// Order: validate, serialize, dedupe (an active hit merges), per-player cap
// (busy), budget reservation (daily_cost, daily_calls, phase_cap), then write
// the pending job (carrying its reservation and budget day), one llm_dispatch
// row at the transaction timestamp, and make sure the sweep tick exists. Every
// refusal returns before any write, so a refusal leaves no job, no dispatch
// row and no reservation. The reducer answers a refusal in the Keeper's voice
// with llmRefusalMessage.
//
// Validation failures throw a plain Error: they are server programming errors
// (unknown route, oversized context), not client-caused sender errors, and this
// helper has no character context to report through.
//
// Imports are limited to data modules, ./measurement, ./llm_budget and
// ./llm_schedule; nothing from the server entry point, schema/tables, events or
// location, so this module loads in plain Node vitest.
// ============================================================================

import { isLlmRoute, type LlmRoute } from '../data/llm_routes';
import { CLAUDE_MODEL } from '../data/llm_models';
import { LLM_PLAYER_MAX_ACTIVE_JOBS } from '../data/llm_limits';
import { redactSecrets } from './measurement';
import { reserveLlmBudget, type LlmBudgetMode, type LlmBudgetRefusal } from './llm_budget';
import { insertLlmDispatch, ensureLlmSweepScheduled } from './llm_schedule';

export const LLM_JOB_STATUSES = [
  'pending',
  'in_flight',
  'received',
  'completed',
  'failed',
  'expired',
] as const;
export type LlmJobStatus = (typeof LLM_JOB_STATUSES)[number];

export const LLM_ACTIVE_JOB_STATUSES = ['pending', 'in_flight', 'received'] as const;
export const LLM_TERMINAL_JOB_STATUSES = ['completed', 'failed', 'expired'] as const;

export function isActiveJobStatus(status: unknown): boolean {
  return (LLM_ACTIVE_JOB_STATUSES as readonly unknown[]).includes(status);
}

export const LLM_REQUEST_JSON_MAX_CHARS = 64_000;
export const LLM_ERROR_MESSAGE_MAX_CHARS = 400;
/** stopReason and requestId are short provider tokens; cap them (by code points) after redaction. */
export const LLM_CALL_LOG_FIELD_MAX_CHARS = 128;

/** JSON array string: no delimiter can collide across fields. */
export function buildDedupeKey(
  playerId: { toHexString(): string },
  route: LlmRoute,
  sourceKey: string,
): string {
  return JSON.stringify([playerId.toHexString(), route, sourceKey]);
}

const join = (...parts: Array<string | number | bigint>): string =>
  parts.map((p) => String(p)).join(':');

/** Per-domain source keys: what makes two enqueues "the same action". */
export const SOURCE_KEYS = Object.freeze({
  /** One creation-state row, one generation type. */
  creation: (creationStateId: bigint, generationType: 'race' | 'class'): string =>
    join(creationStateId, generationType),
  worldGen: (genStateId: bigint): string => join(genStateId),
  skillGen: (characterId: bigint, level: bigint | number): string => join(characterId, level),
  renownPerk: (characterId: bigint, rank: bigint | number): string => join(characterId, rank),
  /**
   * `turn` is a caller-supplied conversation-turn marker. Phase 41 passes the
   * npc_memory lastUpdated micros (0 when there is no memory), so the key
   * changes after each applied reply.
   */
  npcConversation: (characterId: bigint, npcId: bigint, turn: bigint | number): string =>
    join(characterId, npcId, turn),
  combatNarration: (combatId: bigint, roundNumber: bigint | number, narrativeType: string): string =>
    join(combatId, roundNumber, narrativeType),
  smokeTest: (): string => 'smoke',
});

/** JSON.stringify that turns bigint into its decimal string. */
export function serializeRequest(request: Record<string, unknown>): string {
  return JSON.stringify(request, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

export interface EnqueueArgs {
  route: LlmRoute;
  playerId: any;
  characterId?: bigint;
  sourceKey: string;
  request: Record<string, unknown>;
  /** 'player' (default) reserves against the player day and the phase ledger; 'phase_only' (smoke) skips the player. */
  budget?: LlmBudgetMode;
}

/** Why an enqueue was refused: a budget reason, or the per-player active-job cap. */
export type LlmRefusal = LlmBudgetRefusal | 'busy';

export type EnqueueResult =
  | { created: true; job: any; refused?: undefined }
  | { created: false; job: any; refused?: undefined }
  | { created: false; job: null; refused: LlmRefusal };

/**
 * Routes the per-player cap never refuses. Narration is silent and lowest
 * priority; a renown offer is earned, not requested, so it must not be lost to
 * the cap. Narration is also not counted; a held renown job is counted (it is a
 * real active job), it just is never the one refused.
 */
export const LLM_CAP_EXEMPT_ROUTES: readonly LlmRoute[] = Object.freeze([
  'combat_narration',
  'renown_perk_gen',
] as LlmRoute[]);

/**
 * Fixed in-voice refusal lines. None reveals which limit was hit, an amount, a
 * provider or an account state.
 */
export const LLM_REFUSAL_MESSAGES: Readonly<Record<LlmRefusal, string>> = Object.freeze({
  daily_cost: 'The Keeper grows weary of your demands. Return tomorrow.',
  daily_calls: 'The Keeper grows weary of your demands. Return tomorrow.',
  phase_cap: 'The Keeper has fallen silent for now. Return later.',
  busy: 'The Keeper is already considering something for you. Patience.',
});

export function llmRefusalMessage(reason: LlmRefusal): string {
  return LLM_REFUSAL_MESSAGES[reason];
}

/**
 * Active jobs (pending, in_flight, received) the player holds against the cap:
 * every route other than combat_narration that holds a player-day budget. Smoke and
 * Phase 40 jobs (budgetDay '') and terminal jobs never count.
 */
export function countActiveCappedJobs(ctx: any, playerId: any): number {
  let n = 0;
  for (const j of ctx.db.llm_job.by_player.filter(playerId)) {
    if (!isActiveJobStatus(j.status)) continue;
    if (j.route === 'combat_narration') continue;
    if (!j.budgetDay) continue;
    n += 1;
  }
  return n;
}

/**
 * Enqueue one LLM action in the caller's transaction. Returns:
 * - { created: true, job } for a new reserved, dispatched job;
 * - { created: false, job } when an active job with the same identity, route
 *   and source key already exists (merged: nothing further is written);
 * - { created: false, job: null, refused } when over the per-player cap or the
 *   budget (nothing is written).
 * Terminal jobs never block a new one.
 */
export function enqueueLlmJob(ctx: any, a: EnqueueArgs): EnqueueResult {
  if (!isLlmRoute(a.route)) throw new Error(`Unknown LLM route: ${String(a.route)}`);
  if (typeof a.playerId?.toHexString !== 'function') {
    throw new Error('enqueueLlmJob requires a playerId identity');
  }
  if (typeof a.sourceKey !== 'string' || a.sourceKey.length === 0) {
    throw new Error('enqueueLlmJob requires a non-empty sourceKey');
  }
  if (a.request === null || typeof a.request !== 'object') {
    throw new Error('enqueueLlmJob requires a request object');
  }

  const requestJson = serializeRequest(a.request);
  if (requestJson.length > LLM_REQUEST_JSON_MAX_CHARS) {
    throw new Error('LLM request context too large');
  }

  const dedupeKey = buildDedupeKey(a.playerId, a.route, a.sourceKey);
  for (const existing of ctx.db.llm_job.by_dedupe_key.filter(dedupeKey)) {
    if (isActiveJobStatus(existing.status)) return { created: false, job: existing };
  }

  const mode: LlmBudgetMode = a.budget ?? 'player';
  if (
    mode === 'player' &&
    !(LLM_CAP_EXEMPT_ROUTES as readonly string[]).includes(a.route) &&
    countActiveCappedJobs(ctx, a.playerId) >= LLM_PLAYER_MAX_ACTIVE_JOBS
  ) {
    return { created: false, job: null, refused: 'busy' };
  }

  const reservation = reserveLlmBudget(ctx, {
    playerId: a.playerId,
    route: a.route,
    requestJson,
    mode,
  });
  if (!reservation.ok) return { created: false, job: null, refused: reservation.reason };

  const job = ctx.db.llm_job.insert({
    id: 0n,
    playerId: a.playerId,
    characterId: a.characterId ?? 0n,
    route: a.route,
    dedupeKey,
    status: 'pending',
    attempt: 0n,
    requestJson,
    inputTokens: 0n,
    outputTokens: 0n,
    cacheWriteTokens: 0n,
    cacheReadTokens: 0n,
    createdAt: ctx.timestamp,
    reservedMicroUsd: reservation.reservedMicroUsd,
    costMicroUsd: 0n,
    budgetDay: reservation.budgetDay,
    applyAttempts: 0n,
  });
  insertLlmDispatch(ctx, job.id, ctx.timestamp.microsSinceUnixEpoch);
  ensureLlmSweepScheduled(ctx);
  return { created: true, job };
}

/**
 * The player identity that owns a character. The player table has no userId
 * index, so iterate. Prefers the player whose activeCharacterId is the
 * character, else the first player with the owner userId, else null.
 */
export function resolveCharacterPlayerId(ctx: any, character: any): any | null {
  let first: any = null;
  for (const p of ctx.db.player.iter()) {
    if (p.userId !== character.ownerUserId) continue;
    if (p.activeCharacterId === character.id) return p.id;
    if (first === null) first = p.id;
  }
  return first;
}

export interface LlmCallLogEntry {
  jobId: bigint;
  playerId: any;
  route: LlmRoute;
  attempt: bigint;
  httpStatus: number;
  outcome: string;
  stopReason?: string;
  requestId?: string;
  errorMessage?: string;
  latencyMs: number;
  usage?: { input: number; output: number; cacheWrite: number; cacheRead: number };
  /** Settled cost of this attempt in micro-USD (0 when unbilled or unknown). */
  costMicroUsd?: bigint;
  /** Claim time minus scheduled time, in ms (dispatch lateness). */
  dispatchLateMs?: number;
  /** Secrets (for example the API key) to redact from every text field, beyond the key pattern. */
  needles?: readonly string[];
}

// Counters arrive as JS numbers (possibly fractional, negative, NaN or Infinity); u64 columns need
// whole bigints. BigInt() throws a RangeError on a non-finite number, which would roll back the
// caller's transaction, so any non-finite input is 0 and huge finite values clamp to a safe integer.
const toU64 = (n: number | undefined): bigint => {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return BigInt(Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(v))));
};

/** Redact with the key pattern plus caller needles, then cap by code points (never splits a surrogate pair). */
const redactAndCap = (text: string, needles: readonly string[] | undefined, max: number): string =>
  [...redactSecrets(text, needles)].slice(0, max).join('');

/** Append one llm_call_log row. Every text field is redacted, then capped by code points. */
export function logLlmCall(ctx: any, e: LlmCallLogEntry): any {
  const row: Record<string, unknown> = {
    id: 0n,
    jobId: e.jobId,
    playerId: e.playerId,
    route: e.route,
    model: CLAUDE_MODEL,
    outcome: e.outcome,
    attempt: e.attempt,
    httpStatus: toU64(e.httpStatus),
    latencyMs: toU64(e.latencyMs),
    inputTokens: toU64(e.usage?.input),
    outputTokens: toU64(e.usage?.output),
    cacheWriteTokens: toU64(e.usage?.cacheWrite),
    cacheReadTokens: toU64(e.usage?.cacheRead),
    createdAt: ctx.timestamp,
    costMicroUsd: e.costMicroUsd ?? 0n,
    dispatchLateMs: toU64(e.dispatchLateMs),
  };
  if (e.stopReason !== undefined) {
    row.stopReason = redactAndCap(e.stopReason, e.needles, LLM_CALL_LOG_FIELD_MAX_CHARS);
  }
  if (e.requestId !== undefined) {
    row.requestId = redactAndCap(e.requestId, e.needles, LLM_CALL_LOG_FIELD_MAX_CHARS);
  }
  if (e.errorMessage !== undefined) {
    row.errorMessage = redactAndCap(e.errorMessage, e.needles, LLM_ERROR_MESSAGE_MAX_CHARS);
  }
  return ctx.db.llm_call_log.insert(row);
}
