// ============================================================================
// LLM retry and deferral timing (Phase 41, pure module)
// ============================================================================
//
// Every decision here is a pure, deterministic function: no RNG and no clock
// (reducers and procedures must be deterministic), so jitter is a hash of the
// job id and a second seed. Constants live in data/llm_limits.ts.
//
// No runtime import from the server entry point, schema/tables, events or
// location, so this module loads in plain Node vitest.
// ============================================================================

import type { LlmRoute } from '../data/llm_routes';
import {
  LLM_DEFER_BASE_MS,
  LLM_DEFER_JITTER_MS,
  LLM_MAX_ATTEMPTS,
  LLM_NO_AUTO_RETRY_ROUTES,
  LLM_RETRY_BASE_MS,
  LLM_RETRY_JITTER_FRACTION,
  LLM_RETRY_MAX_MS,
  LLM_TRUNCATION_RETRY_ROUTES,
} from '../data/llm_limits';
import type { ClaudeResult } from './claude_request';

/** Total attempts (first call included) a route may make. */
export function maxAttempts(route: LlmRoute): number {
  return (LLM_NO_AUTO_RETRY_ROUTES as readonly string[]).includes(route) ? 1 : LLM_MAX_ATTEMPTS;
}

/**
 * True only for a retryable failure whose attempt number is below the route's
 * maximum, so the last attempt is always final. The classifier already limits
 * `retryable` to transient classes and files a spend-cap 429 as `billing`.
 */
export function shouldRetry(result: ClaudeResult, attempt: bigint | number, route: LlmRoute): boolean {
  return !result.ok && result.retryable === true && Number(attempt) < maxAttempts(route);
}

/**
 * The one owner-approved retry of a billed failure (Plan 51.3.1.1-32): a truncated reply is retried once
 * when the route is in LLM_TRUNCATION_RETRY_ROUTES, no earlier attempt of the job stopped at max_tokens
 * (the job's stored stop reason before this attempt's patch), and the attempt is below maxAttempts.
 */
export function shouldRetryTruncation(route: LlmRoute, earlierStopReason: string | undefined, attempt: bigint | number): boolean {
  return (
    (LLM_TRUNCATION_RETRY_ROUTES as readonly string[]).includes(route) &&
    earlierStopReason !== 'max_tokens' &&
    Number(attempt) < maxAttempts(route)
  );
}

const abs = (n: bigint): bigint => (n < 0n ? -n : n);

/** Deterministic integer in [0, maxExclusive): a hash of two seeds, never a random source. */
export function deterministicJitterMs(a: bigint, b: bigint, maxExclusive: number): number {
  const bound = Math.floor(maxExclusive);
  if (!Number.isFinite(bound) || bound <= 0) return 0;
  return Number((abs(a) * 7919n + abs(b) * 104729n) % BigInt(bound));
}

/**
 * Delay before the next attempt. The base is 2 s after attempt 1 and 8 s after
 * attempt 2; a longer retry-after replaces it; the core is capped at 60 s; a
 * deterministic jitter of up to 20 percent of the base is added.
 */
export function retryDelayMs(
  attemptJustFailed: bigint | number,
  retryAfterSeconds: number | undefined,
  jobId: bigint,
): number {
  const attempt = Math.max(1, Math.floor(Number(attemptJustFailed)) || 1);
  const base = LLM_RETRY_BASE_MS[Math.min(attempt, LLM_RETRY_BASE_MS.length) - 1];
  const retryAfterMs =
    typeof retryAfterSeconds === 'number' && Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
      ? Math.ceil(retryAfterSeconds * 1000)
      : 0;
  const core = Math.min(LLM_RETRY_MAX_MS, Math.max(base, retryAfterMs));
  return core + deterministicJitterMs(jobId, BigInt(attempt), Math.floor(base * LLM_RETRY_JITTER_FRACTION));
}

/**
 * Delay before a dispatch that found the in-flight cap full tries again:
 * 500 ms plus a jitter in [0, 250). The executor passes the dispatch row's
 * scheduledId as the seed so repeated deferrals of one job vary.
 */
export function deferDelayMs(jobId: bigint, seed: bigint): number {
  return LLM_DEFER_BASE_MS + deterministicJitterMs(jobId, seed, LLM_DEFER_JITTER_MS);
}

/** Milliseconds to microseconds, rounded up to a whole microsecond count and floored at 0. */
export function msToMicros(ms: number): bigint {
  const n = Number.isFinite(ms) ? Math.max(0, Math.ceil(ms)) : 0;
  return BigInt(n) * 1000n;
}
