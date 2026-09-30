// ============================================================================
// LLM executor body (Phase 41, pure module: duck-typed procedure context)
// ============================================================================
//
// runLlmJob is the body of the scheduled `llm_run` procedure (registered in
// Plan 41-07). It is a plain function of (ctx, dispatch row, deps) so it runs
// unchanged in vitest through createMockProcCtx.
//
// Shape of one run: guard, claim (tx1), call with NO transaction open, persist
// (tx2), apply (tx3), failure. Procedures have no db handle on the context: every read and write
// goes through ctx.withTx, whose body is synchronous and may run more than once,
// so a body assigns nothing outside itself and returns a plain object.
//
// Rules this module keeps:
// - The module-identity guard is the only use of ctx.sender. Apply and failure
//   always act for the job's stored playerId (in a scheduled procedure the sender
//   is the module identity).
// - The key is read only inside tx1, goes only into buildClaudeHeaders, and is a
//   needle for every classify, log and console path.
// - Date.now() is reached only through deps.nowMs, outside any transaction.
//   No Math.random; jitter is deterministic (llm_retry).
// - The scheduled row is deleted before this runs, so a retry or deferral
//   inserts a NEW dispatch row.
//
// No import from the server entry point, schema/tables, index or reducers;
// registration is Plan 41-07.
// ============================================================================

import type { LlmRoute } from '../data/llm_routes';
import {
  LLM_MAX_IN_FLIGHT,
  LLM_NARRATION_MAX_AGE_MICROS,
  LLM_NARRATION_MAX_IN_FLIGHT,
} from '../data/llm_limits';
import { redactSecrets } from './measurement';
import { applyLlmFailure, applyLlmResult, toApplyJob, type ApplyJob } from './llm_apply';
import { isPhaseLedgerExhausted, releaseLlmReservation } from './llm_budget';
import { deferDelayMs, msToMicros } from './llm_retry';
import { hasLlmDispatch, insertLlmDispatch, scheduledMicros } from './llm_schedule';
import { resolveRouteInput } from './llm_inputs';
import { markKeyCheck, recordSmokeResult } from './llm_admin_state';

/** What one llm_run invocation ended up doing. */
export type RunOutcome =
  | 'not_module'
  | 'skip'
  | 'redispatch'
  | 'deferred'
  | 'expired'
  | 'failed'
  | 'retry'
  | 'completed'
  | 'apply_failed'
  | 'stale';

/** The dispatch row the scheduler hands to llm_run. */
export interface DispatchArg {
  scheduledId: bigint;
  scheduledAt: any;
  jobId: bigint;
}

export interface ExecutorDeps {
  /** Wall clock in ms; used only around the call, outside any transaction. */
  nowMs: () => number;
  apply: (tx: any, job: ApplyJob, resultText: string) => void;
  applyFailure: (tx: any, job: ApplyJob) => void;
  log: (line: string) => void;
}

const DEFAULT_DEPS: ExecutorDeps = {
  nowMs: () => Date.now(),
  apply: applyLlmResult,
  applyFailure: applyLlmFailure,
  log: (line) => console.log(line),
};

/** The result of the claim transaction (tx1). */
export type Claim =
  | { kind: 'skip' }
  | { kind: 'redispatch' }
  | { kind: 'deferred' }
  | { kind: 'expired' }
  /** `job` is the failed row for the failure message; undefined for a smoke job (it records a smoke entry instead). */
  | { kind: 'failed'; job: any | undefined }
  | { kind: 'received'; job: any }
  | {
      kind: 'run';
      jobId: bigint;
      route: LlmRoute;
      attempt: bigint;
      apiKey: string;
      input: unknown;
      smoke: boolean;
      playerId: any;
      createdAtMicros: bigint;
      dispatchLateMs: number;
    };

/** A job is a smoke job when its stored request says so; smoke jobs never touch game state. */
function isSmokeRequest(requestJson: unknown): boolean {
  try {
    return (JSON.parse(String(requestJson ?? '')) as { smoke?: unknown } | null)?.smoke === true;
  } catch {
    return false;
  }
}

const EMPTY_SMOKE_COUNTS = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, costMicroUsd: 0n } as const;

/**
 * Claim (tx1): one serializable transaction that reads the job and the key and
 * flips the job to in_flight. Because the count of in-flight jobs is read and
 * the claim written in this one transaction, two racing llm_run invocations
 * cannot both take the last slot. Checks run in a fixed order; every check that
 * ends the run without a call leaves money consistent (release with a call
 * refund, or nothing written).
 */
export function claimLlmJob(ctx: any, arg: DispatchArg, _deps: ExecutorDeps): Claim {
  return ctx.withTx((tx: any): Claim => {
    const job = tx.db.llm_job.id.find(arg.jobId);
    if (!job) return { kind: 'skip' };
    if (job.status === 'received') return { kind: 'received', job };
    if (job.status !== 'pending') return { kind: 'skip' };

    const now: bigint = tx.timestamp.microsSinceUnixEpoch;
    const smoke = isSmokeRequest(job.requestJson);

    // A retry that was dispatched early, or a duplicate dispatch of a job that is already rescheduled.
    if (job.nextAttemptAt && job.nextAttemptAt.microsSinceUnixEpoch > now) {
      if (hasLlmDispatch(tx, job.id)) return { kind: 'skip' };
      insertLlmDispatch(tx, job.id, job.nextAttemptAt.microsSinceUnixEpoch);
      return { kind: 'redispatch' };
    }

    // Combat narration older than 20 s is dropped silently and refunded.
    if (job.route === 'combat_narration' && now - job.createdAt.microsSinceUnixEpoch > LLM_NARRATION_MAX_AGE_MICROS) {
      const patch = releaseLlmReservation(tx, job, { refundCall: true });
      tx.db.llm_job.id.update({
        ...job,
        ...patch,
        status: 'expired',
        errorCode: 'late',
        finishedAt: tx.timestamp,
      });
      return { kind: 'expired' };
    }

    /** Fail the job at claim: refund the reservation and the call, then either record a smoke entry or ask for the failure message. */
    const failAtClaim = (errorCode: string): Claim => {
      const patch = releaseLlmReservation(tx, job, { refundCall: true });
      const failed = { ...job, ...patch, status: 'failed', errorCode, finishedAt: tx.timestamp };
      tx.db.llm_job.id.update(failed);
      if (smoke) {
        recordSmokeResult(tx, job.route, { ok: false, class: errorCode, latencyMs: 0, ...EMPTY_SMOKE_COUNTS }, []);
        return { kind: 'failed', job: undefined };
      }
      return { kind: 'failed', job: failed };
    };

    if (isPhaseLedgerExhausted(tx)) return failAtClaim('billing');

    // The count is derived from the by_status index inside this transaction (never a table-level count).
    const inFlight = [...tx.db.llm_job.by_status.filter('in_flight')].length;
    const limit = job.route === 'combat_narration' ? LLM_NARRATION_MAX_IN_FLIGHT : LLM_MAX_IN_FLIGHT;
    if (inFlight >= limit) {
      insertLlmDispatch(tx, job.id, now + msToMicros(deferDelayMs(job.id, arg.scheduledId)));
      return { kind: 'deferred' };
    }

    const cfg = tx.db.llm_config.id.find(1n);
    const apiKey: string = typeof cfg?.apiKey === 'string' ? cfg.apiKey : '';
    if (apiKey.trim() === '') {
      markKeyCheck(tx, false);
      return failAtClaim('auth');
    }

    let input: unknown;
    try {
      input = resolveRouteInput(tx, job);
    } catch {
      return failAtClaim('bad_request');
    }

    const attempt: bigint = job.attempt + 1n;
    tx.db.llm_job.id.update({
      ...job,
      status: 'in_flight',
      attempt,
      startedAt: tx.timestamp,
      nextAttemptAt: undefined,
    });

    const scheduled = scheduledMicros(arg.scheduledAt);
    const lateMicros = scheduled === null || now <= scheduled ? 0n : now - scheduled;
    return {
      kind: 'run',
      jobId: job.id,
      route: job.route as LlmRoute,
      attempt,
      apiKey,
      input,
      smoke,
      playerId: job.playerId,
      createdAtMicros: job.createdAt.microsSinceUnixEpoch,
      dispatchLateMs: Number(lateMicros / 1000n),
    };
  });
}

/**
 * Post the in-voice failure message in its own transaction, so a bug in a
 * message cannot undo the status write that already committed.
 */
function runFailureApply(ctx: any, job: any | undefined, deps: ExecutorDeps, needles: readonly string[]): void {
  if (!job) return;
  try {
    ctx.withTx((tx: any) => deps.applyFailure(tx, toApplyJob(job)));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    deps.log(redactSecrets(`llm failure message failed for job ${String(job.id)}: ${message}`, needles));
  }
}

/**
 * The body of the scheduled `llm_run` procedure. `arg` is the dispatch row.
 * `deps` overrides the defaults (tests inject spies and a clock).
 */
export function runLlmJob(ctx: any, arg: DispatchArg, deps?: Partial<ExecutorDeps>): RunOutcome {
  const d: ExecutorDeps = { ...DEFAULT_DEPS, ...deps };

  // Guard: only the module itself may drive the executor (a client cannot forge a dispatch row).
  if (ctx.sender.toHexString() !== ctx.databaseIdentity.toHexString()) {
    d.log('llm_run ignored: caller is not the module identity');
    return 'not_module';
  }

  const claim = claimLlmJob(ctx, arg, d);
  switch (claim.kind) {
    case 'skip':
    case 'redispatch':
    case 'deferred':
    case 'expired':
      return claim.kind;
    case 'failed':
      runFailureApply(ctx, claim.job, d, []);
      return 'failed';
    default:
      // The call, persist and apply steps arrive with the next task of this plan.
      throw new Error('llm_executor: the call path is not implemented yet');
  }
}
