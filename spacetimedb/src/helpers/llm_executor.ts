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

import { Timestamp, TimeDuration } from 'spacetimedb';
import type { LlmRoute } from '../data/llm_routes';
import { ANTHROPIC_MESSAGES_URL } from '../data/llm_models';
import { buildRouteLayers } from '../data/llm_layers';
import {
  LLM_APPLY_MAX_ATTEMPTS,
  LLM_MAX_IN_FLIGHT,
  LLM_NARRATION_MAX_AGE_MICROS,
  LLM_NARRATION_MAX_IN_FLIGHT,
} from '../data/llm_limits';
import { estimateCostMicroUsd, redactSecrets, type Usage } from './measurement';
import {
  buildClaudeHeaders,
  buildClaudeRequest,
  classifyClaudeError,
  classifyClaudeResponse,
  type ClaudeFailureClass,
  type ClaudeResult,
} from './claude_request';
import { applyLlmFailure, applyLlmResult, toApplyJob, type ApplyJob } from './llm_apply';
import {
  addLedgerSpend,
  chargeLedgerUnknownBilling,
  isPhaseLedgerExhausted,
  releaseLlmReservation,
  settleLlmCost,
  subtractLedgerSpend,
} from './llm_budget';
import { deferDelayMs, msToMicros, retryDelayMs, shouldRetry } from './llm_retry';
import { hasLlmDispatch, insertLlmDispatch, scheduledMicros } from './llm_schedule';
import { resolveRouteInput } from './llm_inputs';
import { markKeyCheck, recordSmokeResult, type SmokeEntry } from './llm_admin_state';
import { logLlmCall } from './llm_queue';

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
  /** Terminal failure; the in-voice failure message (or a smoke entry) was written in the same transaction. */
  | { kind: 'failed' }
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

/** Posts the in-voice failure message for a job that just became terminal, inside the caller's transaction. */
type Notify = (failed: any) => void;

/** Marks a throw that came from the failure message itself (not from the status write). */
class FailureMessageError extends Error {
  constructor(
    readonly jobId: unknown,
    cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
  }
}

/**
 * Run a transaction body that may end a job in a terminal failure, posting the in-voice failure
 * message in the SAME transaction as the status and money. A job therefore never becomes terminal
 * while its domain lock (a GENERATING creation step or world-gen state) stays held, and no crash
 * between two transactions can strand it. When the message itself throws, the whole transaction
 * rolled back; the body runs again without the message, so the status and money still commit (a
 * bug in a message never undoes them) and the sweeper's stranded-lock rule releases the lock.
 * Any other throw propagates unchanged.
 */
function withFailureTx<T>(
  ctx: any,
  deps: ExecutorDeps,
  needles: readonly string[],
  body: (tx: any, notify: Notify) => T,
): T {
  try {
    return ctx.withTx((tx: any): T =>
      body(tx, (failed: any) => {
        try {
          deps.applyFailure(tx, toApplyJob(failed));
        } catch (err) {
          throw new FailureMessageError(failed?.id, err);
        }
      }),
    );
  } catch (err) {
    if (!(err instanceof FailureMessageError)) throw err;
    deps.log(redactSecrets(`llm failure message failed for job ${String(err.jobId)}: ${err.message}`, needles));
    return ctx.withTx((tx: any): T => body(tx, () => {}));
  }
}

/**
 * Claim (tx1): one serializable transaction that reads the job and the key and
 * flips the job to in_flight. Because the count of in-flight jobs is read and
 * the claim written in this one transaction, two racing llm_run invocations
 * cannot both take the last slot. Checks run in a fixed order; every check that
 * ends the run without a call leaves money consistent (release with a call
 * refund, or nothing written).
 */
export function claimLlmJob(ctx: any, arg: DispatchArg, deps: ExecutorDeps): Claim {
  return withFailureTx(ctx, deps, [], (tx: any, notify: Notify): Claim => {
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

    /** Fail the job at claim: refund the reservation and the call, then record a smoke entry or post the failure message. */
    const failAtClaim = (errorCode: string): Claim => {
      const patch = releaseLlmReservation(tx, job, { refundCall: true });
      const failed = { ...job, ...patch, status: 'failed', errorCode, finishedAt: tx.timestamp };
      tx.db.llm_job.id.update(failed);
      if (smoke) {
        recordSmokeResult(tx, job.route, { ok: false, class: errorCode, latencyMs: 0, ...EMPTY_SMOKE_COUNTS }, []);
      } else {
        notify(failed);
      }
      return { kind: 'failed' };
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
 * Classes of a 200 reply whose content was unusable. The call was made and billed, so
 * the real cost is settled and the job fails (no retry: the same prompt would be billed again).
 */
export const BILLED_FAILURE_CLASSES: readonly ClaudeFailureClass[] = Object.freeze([
  'refusal',
  'truncated',
  'invalid_json',
  'schema_mismatch',
  'empty_output',
  'unexpected_stop',
] as ClaudeFailureClass[]);

const ZERO_USAGE: Usage = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };

/** Whole non-negative bigint from a usage counter (BigInt() of a fraction or NaN would throw and roll back the persist). */
function u64(n: unknown): bigint {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return BigInt(Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(v))));
}

type RunClaim = Extract<Claim, { kind: 'run' }>;

/** The result of the persist transaction (tx2). */
type Persist =
  | { kind: 'stale' }
  | { kind: 'retry' }
  | { kind: 'expired' }
  | { kind: 'completed' }
  | { kind: 'received' }
  /** Terminal failure; the failure message (or a smoke entry) was written in the same transaction. */
  | { kind: 'failed' };

interface AttemptOutcome {
  result: ClaudeResult;
  httpStatus: number;
  latencyMs: number;
  /** A thrown call, or a reply whose body could not be read: Anthropic may have billed it. */
  unknownBilling: boolean;
}

/**
 * Persist (tx2): one outcome rule per attempt, and always one call-log row. The
 * transaction proceeds only for a job that is still in_flight with the claimed
 * attempt; when the sweeper expired it meanwhile (its reservation is already
 * released), only the call-log row is written and the sweeper's conservative
 * ledger charge is swapped for the real cost (never added to it).
 *
 * Outcome to money:
 * - ok: settle the real cost, charge the player (usage missing: the ledger is
 *   charged the reservation, the player nothing)
 * - ok narration persisted more than 20 s after enqueue: expired 'late', ledger only
 * - ok smoke: completed, ledger only
 * - billed failure (200 with unusable content): settle real cost, charge the player
 * - retryable and attempts left: pending + new dispatch, reservation held; a thrown
 *   attempt of unknown billing adds the reservation to the ledger
 * - anything else: failed, reservation and call refunded; a thrown attempt adds the
 *   reservation to the ledger first; the player is never charged
 */
function persistAttempt(ctx: any, c: RunClaim, a: AttemptOutcome, deps: ExecutorDeps): Persist {
  const { result } = a;
  const needles = [c.apiKey];
  const usage: Usage = result.usage ?? ZERO_USAGE;
  const counts = {
    input: u64(usage.input),
    output: u64(usage.output),
    cacheWrite: u64(usage.cacheWrite),
    cacheRead: u64(usage.cacheRead),
  };
  const usageMissing =
    counts.input === 0n && counts.output === 0n && counts.cacheWrite === 0n && counts.cacheRead === 0n;
  const realCost = BigInt(estimateCostMicroUsd(usage));

  return withFailureTx(ctx, deps, needles, (tx: any, notify: Notify): Persist => {
    const job = tx.db.llm_job.id.find(c.jobId);
    const now: bigint = tx.timestamp.microsSinceUnixEpoch;

    const logCall = (costMicroUsd: bigint): void => {
      logLlmCall(tx, {
        jobId: c.jobId,
        playerId: c.playerId,
        route: c.route,
        attempt: c.attempt,
        httpStatus: a.httpStatus,
        outcome: result.ok ? 'ok' : result.class,
        stopReason: result.stopReason,
        requestId: result.requestId,
        errorMessage: result.ok ? undefined : result.message,
        latencyMs: a.latencyMs,
        usage: result.usage,
        costMicroUsd,
        dispatchLateMs: c.dispatchLateMs,
        needles: [c.apiKey],
      });
    };

    if (!job || job.status !== 'in_flight' || job.attempt !== c.attempt) {
      // The sweeper expired this attempt and charged the ledger its reservation (billing unknown).
      // Now the billing is known: swap that stand-in for the real cost instead of adding to it.
      // With no usage the stand-in stays (the call was still billed), and nothing is added.
      const charged: bigint = job && job.attempt === c.attempt ? (job.ledgerChargedMicroUsd ?? 0n) : 0n;
      if (charged > 0n && !usageMissing) {
        subtractLedgerSpend(tx, charged);
        addLedgerSpend(tx, realCost);
        tx.db.llm_job.id.update({ ...job, ledgerChargedMicroUsd: 0n, costMicroUsd: job.costMicroUsd + realCost });
      } else if (charged === 0n) {
        addLedgerSpend(tx, realCost);
      }
      logCall(realCost);
      return { kind: 'stale' };
    }

    const base = {
      ...job,
      inputTokens: job.inputTokens + counts.input,
      outputTokens: job.outputTokens + counts.output,
      cacheWriteTokens: job.cacheWriteTokens + counts.cacheWrite,
      cacheReadTokens: job.cacheReadTokens + counts.cacheRead,
      stopReason: result.stopReason ?? job.stopReason,
      requestId: result.requestId ?? job.requestId,
    };

    /** Replace the reservation with the real cost (or the reservation itself when usage is missing). */
    const settle = (chargePlayer: boolean) => {
      const amount: bigint = usageMissing ? job.reservedMicroUsd : realCost;
      const patch = settleLlmCost(tx, job, { actualMicroUsd: amount, chargePlayer: chargePlayer && !usageMissing });
      return { patch, amount };
    };

    const smokeEntry = (ok: boolean, cost: bigint, reply?: string): SmokeEntry => ({
      ok,
      class: result.ok ? undefined : result.class,
      latencyMs: a.latencyMs,
      input: Number(counts.input),
      output: Number(counts.output),
      cacheWrite: Number(counts.cacheWrite),
      cacheRead: Number(counts.cacheRead),
      costMicroUsd: cost,
      reply,
    });

    /** A terminal failure: a smoke job records its failed entry, any other job posts the failure message. */
    const failedResult = (failed: any, cost: bigint): Persist => {
      if (c.smoke) recordSmokeResult(tx, c.route, smokeEntry(false, cost), needles);
      else notify(failed);
      return { kind: 'failed' };
    };

    if (result.ok) {
      if (c.route === 'combat_narration' && now - job.createdAt.microsSinceUnixEpoch > LLM_NARRATION_MAX_AGE_MICROS) {
        const { patch, amount } = settle(false);
        tx.db.llm_job.id.update({ ...base, ...patch, status: 'expired', errorCode: 'late', finishedAt: tx.timestamp });
        logCall(amount);
        return { kind: 'expired' };
      }
      if (c.smoke) {
        const { patch, amount } = settle(false);
        tx.db.llm_job.id.update({
          ...base,
          ...patch,
          status: 'completed',
          // A smoke reply is never applied, so it is stored redacted (the model never sees the key,
          // but nothing outside llm_config may hold it even by accident).
          resultText: redactSecrets(result.text, needles),
          errorCode: undefined,
          finishedAt: tx.timestamp,
        });
        recordSmokeResult(
          tx,
          c.route,
          smokeEntry(true, amount, c.route === 'smoke_test' ? result.text : undefined),
          needles,
        );
        if (c.route === 'smoke_test') markKeyCheck(tx, true);
        logCall(amount);
        return { kind: 'completed' };
      }
      const { patch, amount } = settle(true);
      tx.db.llm_job.id.update({ ...base, ...patch, status: 'received', resultText: result.text, errorCode: undefined });
      logCall(amount);
      return { kind: 'received' };
    }

    if ((BILLED_FAILURE_CLASSES as readonly string[]).includes(result.class)) {
      const { patch, amount } = settle(true);
      const failed = { ...base, ...patch, status: 'failed', errorCode: result.class, finishedAt: tx.timestamp };
      tx.db.llm_job.id.update(failed);
      logCall(amount);
      return failedResult(failed, amount);
    }

    if (shouldRetry(result, c.attempt, c.route)) {
      const at = now + msToMicros(retryDelayMs(c.attempt, result.retryAfterSeconds, c.jobId));
      let cost = 0n;
      if (a.unknownBilling) {
        chargeLedgerUnknownBilling(tx, job);
        cost = job.reservedMicroUsd;
      }
      tx.db.llm_job.id.update({ ...base, status: 'pending', errorCode: result.class, nextAttemptAt: new Timestamp(at) });
      insertLlmDispatch(tx, c.jobId, at);
      logCall(cost);
      return { kind: 'retry' };
    }

    let cost = 0n;
    if (a.unknownBilling) {
      chargeLedgerUnknownBilling(tx, job);
      cost = job.reservedMicroUsd;
    }
    const patch = releaseLlmReservation(tx, job, { refundCall: true });
    const failed = { ...base, ...patch, status: 'failed', errorCode: result.class, finishedAt: tx.timestamp };
    tx.db.llm_job.id.update(failed);
    if (result.class === 'auth' || result.class === 'billing') markKeyCheck(tx, false);
    logCall(cost);
    return failedResult(failed, cost);
  });
}

/** Fail a claimed job whose request could not be built: nothing was sent, so refund the reservation and the call. */
function failBuild(ctx: any, c: RunClaim, deps: ExecutorDeps): Persist {
  return withFailureTx(ctx, deps, [c.apiKey], (tx: any, notify: Notify): Persist => {
    const job = tx.db.llm_job.id.find(c.jobId);
    if (!job || job.status !== 'in_flight' || job.attempt !== c.attempt) return { kind: 'stale' };
    const patch = releaseLlmReservation(tx, job, { refundCall: true });
    const failed = { ...job, ...patch, status: 'failed', errorCode: 'bad_request', finishedAt: tx.timestamp };
    tx.db.llm_job.id.update(failed);
    if (c.smoke) {
      recordSmokeResult(
        tx,
        c.route,
        { ok: false, class: 'bad_request', latencyMs: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0, costMicroUsd: 0n },
        [c.apiKey],
      );
    } else {
      notify(failed);
    }
    return { kind: 'failed' };
  });
}

type ApplyStep = 'done' | 'gone' | 'exhausted';

/**
 * Apply (tx3) from the stored text, never a second billed call. Each run checks the job is
 * still 'received' and has apply attempts left, applies, and completes the job in the same
 * transaction. When apply throws (the transaction rolled back), a small transaction counts the
 * attempt so the sweeper sees it, then apply runs again from the same text. After the last
 * attempt the job fails with 'apply_error' and the in-voice failure message is posted.
 */
function applyStored(ctx: any, jobId: bigint, deps: ExecutorDeps, needles: readonly string[]): RunOutcome {
  for (let i = 0; i < LLM_APPLY_MAX_ATTEMPTS; i++) {
    let step: ApplyStep;
    try {
      step = ctx.withTx((tx: any): ApplyStep => {
        const job = tx.db.llm_job.id.find(jobId);
        if (!job || job.status !== 'received') return 'gone';
        if (job.applyAttempts >= BigInt(LLM_APPLY_MAX_ATTEMPTS)) return 'exhausted';
        deps.apply(tx, toApplyJob(job), job.resultText ?? '');
        tx.db.llm_job.id.update({ ...job, status: 'completed', finishedAt: tx.timestamp });
        return 'done';
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      deps.log(redactSecrets(`llm apply failed for job ${String(jobId)}: ${message}`, needles));
      try {
        ctx.withTx((tx: any) => {
          const job = tx.db.llm_job.id.find(jobId);
          if (job && job.status === 'received') {
            tx.db.llm_job.id.update({ ...job, applyAttempts: job.applyAttempts + 1n });
          }
        });
      } catch (countErr) {
        const m = countErr instanceof Error ? countErr.message : String(countErr);
        deps.log(redactSecrets(`llm apply attempt count failed for job ${String(jobId)}: ${m}`, needles));
      }
      continue;
    }
    if (step === 'done') return 'completed';
    if (step === 'gone') return 'skip';
    break;
  }

  const failed = withFailureTx(ctx, deps, needles, (tx: any, notify: Notify): boolean => {
    const job = tx.db.llm_job.id.find(jobId);
    if (!job || job.status !== 'received') return false;
    const patch = releaseLlmReservation(tx, job, { refundCall: false });
    const next = { ...job, ...patch, status: 'failed', errorCode: 'apply_error', finishedAt: tx.timestamp };
    tx.db.llm_job.id.update(next);
    notify(next);
    return true;
  });
  return failed ? 'apply_failed' : 'skip';
}

/** One module log line per call: route, job, attempt, outcome, status, ms and the four counts. Never text or prompt. */
function callLogLine(c: RunClaim, a: AttemptOutcome): string {
  const u = a.result.usage ?? ZERO_USAGE;
  const outcome = a.result.ok ? 'ok' : a.result.class;
  return redactSecrets(
    `llm route=${c.route} job=${String(c.jobId)} attempt=${String(c.attempt)} outcome=${outcome} ` +
      `status=${a.httpStatus} ms=${a.latencyMs} in=${u.input} out=${u.output} cw=${u.cacheWrite} cr=${u.cacheRead}`,
    [c.apiKey],
  );
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
      return 'failed';
    case 'received':
      // Dispatched again by the sweeper: apply from the stored text, no call.
      return applyStored(ctx, claim.job.id, d, []);
    case 'run':
      break;
  }

  const c: RunClaim = claim;
  const needles = [c.apiKey];

  // Build outside any transaction. A build error means nothing was sent.
  let request: ReturnType<typeof buildClaudeRequest>;
  let headers: Record<string, string>;
  try {
    request = buildClaudeRequest(c.route, buildRouteLayers(c.route, c.input as never));
    headers = buildClaudeHeaders(c.apiKey);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    d.log(
      redactSecrets(
        `llm route=${c.route} job=${String(c.jobId)} attempt=${String(c.attempt)} outcome=bad_request build failed: ${message}`,
        needles,
      ),
    );
    return failBuild(ctx, c, d).kind === 'failed' ? 'failed' : 'stale';
  }

  // The call, with no transaction open.
  const startedMs = d.nowMs();
  let result: ClaudeResult;
  let httpStatus = 0;
  let threw = false;
  try {
    const res = ctx.http.fetch(ANTHROPIC_MESSAGES_URL, {
      method: 'POST',
      headers,
      body: request.bodyText,
      timeout: TimeDuration.fromMillis(request.timeoutMs),
    });
    httpStatus = res.status;
    result = classifyClaudeResponse(c.route, res, { needles: [c.apiKey] });
  } catch (err) {
    threw = true;
    result = classifyClaudeError(err, { needles: [c.apiKey] });
  }
  const latencyMs = Math.max(0, Math.round(d.nowMs() - startedMs));
  const attemptOutcome: AttemptOutcome = {
    result,
    httpStatus,
    latencyMs,
    unknownBilling: threw || (!result.ok && result.class === 'network'),
  };

  const persisted = persistAttempt(ctx, c, attemptOutcome, d);
  d.log(callLogLine(c, attemptOutcome));

  switch (persisted.kind) {
    case 'stale':
      return 'stale';
    case 'retry':
      return 'retry';
    case 'expired':
      return 'expired';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'received':
      return applyStored(ctx, c.jobId, d, needles);
  }
}
