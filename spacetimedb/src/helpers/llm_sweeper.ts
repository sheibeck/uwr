// ============================================================================
// LLM sweeper (Phase 41, pure module: duck-typed reducer context)
// ============================================================================
//
// sweepLlmJobs is the body of the scheduled `llm_sweep` reducer (registered in
// reducers/llm_executor.ts). Every 30 s it makes sure no job is stuck:
//
// - in_flight past its route timeout + 30 s: expired ('timeout'), the reservation
//   and the call refunded to the player, the phase ledger charged the reservation
//   (Anthropic may have billed the call), then the in-voice failure message
// - received past its route timeout + 60 s: one dispatch row so the executor
//   applies the stored text again (no new call); when it already failed to apply
//   twice it fails 'apply_error' and the failure message runs
// - pending past 10 minutes (24 hours for renown_perk_gen): expired with the
//   reservation and call refunded and the failure message; younger and without a
//   dispatch row (an orphan, including Phase 40's queued renown jobs): one dispatch
// - stranded generation locks: a creation step GENERATING_RACE/GENERATING_CLASS/CLASS_FILLING or a
//   world-gen state with no active job for 60 s (its failure message threw, so the job is
//   terminal but the lock was never released) is released directly with the in-voice "try
//   again" line, never through applyFailure (a message bug must not keep a lock forever).
//   The class has two stages: a creation_class_reveal job holds GENERATING_CLASS (released to
//   AWAITING_ARCHETYPE) and a creation_class job holds CLASS_FILLING (released to the playable
//   CLASS_FILL_ERROR with the stage-1 class kept, never retried here).
//   Stage 1 (PENDING/GENERATING, held by a world_gen_start job) degrades to ERROR; stage 2
//   (FILLING, held by a world_gen job) degrades to the playable FILL_ERROR, never to ERROR,
//   and the sweeper never retries it (only the player's explore re-enqueues a fill)
// - budget rows older than the retention window are pruned
//
// Rules this module keeps:
// - A reducer's caught exception does NOT roll back writes already made. So for each
//   job the status and the money are written FIRST and the failure message last, and
//   the sweeper never runs a success apply (a multi-table apply must run in the
//   executor's own transaction, which rolls back cleanly). Received jobs are
//   re-dispatched instead.
// - Every job is handled inside its own try/catch: one bad job never stops the rest.
// - The sweep is idempotent: a second run over the same state finds nothing to do
//   (a released reservation is zero, a dispatched job has a dispatch row, a
//   terminal job is no longer active).
// - No wall clock or randomness: time is ctx.timestamp only.
//
// Imports no server entry point, schema or index module, so it loads in plain
// Node vitest (llm_budget.ts rule).
// ============================================================================

import { LLM_ROUTES, type LlmRoute } from '../data/llm_routes';
import {
  LLM_APPLY_MAX_ATTEMPTS,
  LLM_SWEEP_IN_FLIGHT_GRACE_MICROS,
  LLM_SWEEP_PENDING_MAX_AGE_MICROS,
  LLM_SWEEP_RECEIVED_GRACE_MICROS,
  LLM_SWEEP_RENOWN_PENDING_MAX_AGE_MICROS,
  LLM_SWEEP_STRANDED_LOCK_GRACE_MICROS,
} from '../data/llm_limits';
import { redactSecrets } from './measurement';
import { applyLlmFailure, failWorldGen, toApplyJob, type ApplyJob } from './llm_apply';
import { failWorldFill, failWorldFamilies, WORLD_FILL_FAILED_MESSAGE, WORLD_FAMILIES_FAILED_MESSAGE } from './world_gen';
import { CLASS_FILL_FAILED_LINE } from './creation_generation';
import { appendCreationEvent } from './events';
import { flattenSegments, keeperFallback } from './segments';
import { activeLlmJobs } from './llm_queue';
import { chargeLedgerUnknownBilling, prunePlayerBudgets, releaseLlmReservation, utcDay } from './llm_budget';
import { hasLlmDispatch, insertLlmDispatch } from './llm_schedule';
import { recordSmokeResult } from './llm_admin_state';

/** What one sweep did. Every field is a count. */
export interface SweepReport {
  expiredInFlight: number;
  redispatchedReceived: number;
  failedReceived: number;
  expiredPending: number;
  dispatchedOrphans: number;
  prunedBudgets: number;
  releasedLocks: number;
  errors: number;
}

export interface SweepDeps {
  /** Posts the in-voice failure message for the stored player. */
  applyFailure: (ctx: any, job: ApplyJob) => void;
  log: (line: string) => void;
}

const DEFAULT_DEPS: SweepDeps = {
  applyFailure: applyLlmFailure,
  log: (line) => console.error(line),
};

/** A job is a smoke job when its stored request says so; smoke jobs never touch game state. */
function isSmokeRequest(requestJson: unknown): boolean {
  try {
    return (JSON.parse(String(requestJson ?? '')) as { smoke?: unknown } | null)?.smoke === true;
  } catch {
    return false;
  }
}

function timeoutMicros(route: string): bigint {
  return BigInt(LLM_ROUTES[route as LlmRoute].timeoutMs) * 1000n;
}

/**
 * The failure message for a job that just reached a terminal status: a smoke job records a
 * failed entry (it must not change the admin's own creation or world state), every other job
 * runs the per-route failure handling for the stored player.
 */
function notifyFailure(ctx: any, job: any, deps: SweepDeps): void {
  if (isSmokeRequest(job.requestJson)) {
    recordSmokeResult(
      ctx,
      job.route,
      {
        ok: false,
        class: job.errorCode ?? 'expired',
        latencyMs: 0,
        input: 0,
        output: 0,
        cacheWrite: 0,
        cacheRead: 0,
        costMicroUsd: 0n,
      },
      [],
    );
    return;
  }
  deps.applyFailure(ctx, toApplyJob(job));
}

/**
 * Sweep the job table once. Never throws for a job or for pruning; the caller (the reducer)
 * wraps the whole call as well.
 */
export function sweepLlmJobs(ctx: any, deps?: Partial<SweepDeps>): SweepReport {
  const d: SweepDeps = { ...DEFAULT_DEPS, ...deps };
  const now: bigint = ctx.timestamp.microsSinceUnixEpoch;
  const report: SweepReport = {
    expiredInFlight: 0,
    redispatchedReceived: 0,
    failedReceived: 0,
    expiredPending: 0,
    dispatchedOrphans: 0,
    prunedBudgets: 0,
    releasedLocks: 0,
    errors: 0,
  };

  /** Run one job's handling; a throw is counted and logged (redacted) and the sweep continues. */
  const guarded = (job: any, body: () => void): void => {
    try {
      body();
    } catch (err) {
      report.errors += 1;
      const message = err instanceof Error ? err.message : String(err);
      d.log(redactSecrets(`llm_sweep job ${String(job?.id)} failed: ${message}`));
    }
  };

  // in_flight: the call never came back (module publish or crash mid-call, or a lost persist).
  for (const job of [...ctx.db.llm_job.by_status.filter('in_flight')]) {
    guarded(job, () => {
      const since: bigint = (job.startedAt ?? job.createdAt).microsSinceUnixEpoch;
      if (now - since <= timeoutMicros(job.route) + LLM_SWEEP_IN_FLIGHT_GRACE_MICROS) return;

      // Money and status first. Billing is unknown: the ledger is charged the reservation, the player nothing.
      // The charge is recorded on the job so a reply that still arrives swaps it for the real cost.
      chargeLedgerUnknownBilling(ctx, job);
      const charged: bigint = job.reservedMicroUsd > 0n ? job.reservedMicroUsd : 0n;
      const patch = releaseLlmReservation(ctx, job, { refundCall: true });
      const expired = {
        ...job,
        ...patch,
        status: 'expired',
        errorCode: 'timeout',
        finishedAt: ctx.timestamp,
        ledgerChargedMicroUsd: (job.ledgerChargedMicroUsd ?? 0n) + charged,
        // The day the charge landed on: a late reply takes it back from the day counter only on that day.
        ledgerChargedDayUtc: charged > 0n ? utcDay(ctx.timestamp) : (job.ledgerChargedDayUtc ?? ''),
      };
      ctx.db.llm_job.id.update(expired);
      report.expiredInFlight += 1;

      notifyFailure(ctx, expired, d);
    });
  }

  // received: the result is stored but was never applied.
  for (const job of [...ctx.db.llm_job.by_status.filter('received')]) {
    guarded(job, () => {
      const since: bigint = (job.startedAt ?? job.createdAt).microsSinceUnixEpoch;
      if (now - since <= timeoutMicros(job.route) + LLM_SWEEP_RECEIVED_GRACE_MICROS) return;

      if (job.applyAttempts >= BigInt(LLM_APPLY_MAX_ATTEMPTS)) {
        const patch = releaseLlmReservation(ctx, job, { refundCall: false });
        const failed = { ...job, ...patch, status: 'failed', errorCode: 'apply_error', finishedAt: ctx.timestamp };
        ctx.db.llm_job.id.update(failed);
        report.failedReceived += 1;
        notifyFailure(ctx, failed, d);
        return;
      }

      // Re-dispatch, never apply here: the executor's claim applies a received job from its stored text.
      if (!hasLlmDispatch(ctx, job.id)) {
        insertLlmDispatch(ctx, job.id, now);
        report.redispatchedReceived += 1;
      }
    });
  }

  // pending: too old to be worth answering, or an orphan that has no dispatch row.
  for (const job of [...ctx.db.llm_job.by_status.filter('pending')]) {
    guarded(job, () => {
      const limit =
        job.route === 'renown_perk_gen' ? LLM_SWEEP_RENOWN_PENDING_MAX_AGE_MICROS : LLM_SWEEP_PENDING_MAX_AGE_MICROS;

      if (now - job.createdAt.microsSinceUnixEpoch > limit) {
        const patch = releaseLlmReservation(ctx, job, { refundCall: true });
        const expired = {
          ...job,
          ...patch,
          status: 'expired',
          errorCode: job.errorCode ?? 'expired',
          finishedAt: ctx.timestamp,
        };
        ctx.db.llm_job.id.update(expired);
        report.expiredPending += 1;
        notifyFailure(ctx, expired, d);
        return;
      }

      if (!hasLlmDispatch(ctx, job.id)) {
        const due: bigint = job.nextAttemptAt?.microsSinceUnixEpoch ?? now;
        insertLlmDispatch(ctx, job.id, due > now ? due : now);
        report.dispatchedOrphans += 1;
      }
    });
  }

  try {
    report.releasedLocks = releaseStrandedLocks(ctx, now, d);
  } catch (err) {
    report.errors += 1;
    const message = err instanceof Error ? err.message : String(err);
    d.log(redactSecrets(`llm_sweep stranded-lock release failed: ${message}`));
  }

  try {
    report.prunedBudgets = prunePlayerBudgets(ctx);
  } catch (err) {
    report.errors += 1;
    const message = err instanceof Error ? err.message : String(err);
    d.log(redactSecrets(`llm_sweep prune failed: ${message}`));
  }

  return report;
}

/** The same in-voice lines the per-route failure handling posts. */
const CREATION_LOCK_RELEASED = 'The page flickers. Something went wrong in the cosmic machinery. Try again.';

/**
 * The creation step each creation route holds, the step a released lock returns to and the line it
 * posts. The class has two stages (Phase 43, plan 13): the reveal job holds GENERATING_CLASS and
 * returns to AWAITING_ARCHETYPE; the fill job holds CLASS_FILLING and degrades to CLASS_FILL_ERROR
 * (the class name, description and first ability stay; only the player's input re-enqueues a fill).
 */
const CREATION_LOCKS: Readonly<Record<string, { route: string; back: string; line: string }>> = Object.freeze({
  GENERATING_RACE: { route: 'creation_race', back: 'AWAITING_RACE', line: CREATION_LOCK_RELEASED },
  GENERATING_CLASS: { route: 'creation_class_reveal', back: 'AWAITING_ARCHETYPE', line: CREATION_LOCK_RELEASED },
  CLASS_FILLING: { route: 'creation_class', back: 'CLASS_FILL_ERROR', line: CLASS_FILL_FAILED_LINE },
});
const WORLD_GEN_LOCK_RELEASED = 'The map blurs and will not settle. The world refuses to be remembered right now.';

function genStateIdOf(job: any): string | undefined {
  try {
    const id = (JSON.parse(String(job.requestJson ?? '')) as { genStateId?: unknown } | null)?.genStateId;
    return typeof id === 'string' ? id : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Release generation locks whose job is gone. A creation state is locked by an active
 * creation job of its own identity; a world-gen state by an active job naming its id: a
 * world_gen_start job holds PENDING/GENERATING (stage 1), a world_gen job holds FILLING (stage 2a),
 * a world_gen_families job holds FILLING_FAMILIES (stage 2b, Phase 51.3.1.2). A stranded stage-1
 * lock fails to ERROR, a stranded 2a lock to FILL_ERROR, and a stranded 2b lock to FAMILIES_ERROR,
 * never FILL_ERROR, so the places are never written twice (D-08, Pitfall 1). ERROR, FILL_ERROR,
 * FAMILIES_ERROR, HELD and COMPLETE are never touched, and nothing is re-enqueued here.
 * Only locks older than the grace are touched (a lock and its job are always written in the
 * same transaction, so a younger lock without a job cannot exist, but the grace keeps the rule
 * conservative). Iterates both state tables: the only caller is the sweeper reducer.
 */
function releaseStrandedLocks(ctx: any, now: bigint, d: SweepDeps): number {
  const active = activeLlmJobs(ctx);
  const creationHeld = new Set<string>();
  const worldGenHeld = new Set<string>(); // stage 1: world_gen_start
  const worldFillHeld = new Set<string>(); // stage 2a: world_gen
  const worldFamiliesHeld = new Set<string>(); // stage 2b: world_gen_families
  for (const job of active) {
    if (job.route === 'creation_race' || job.route === 'creation_class_reveal' || job.route === 'creation_class') {
      creationHeld.add(`${job.route}|${job.playerId.toHexString()}`);
    } else if (job.route === 'world_gen_start') {
      const id = genStateIdOf(job);
      if (id !== undefined) worldGenHeld.add(id);
    } else if (job.route === 'world_gen') {
      const id = genStateIdOf(job);
      if (id !== undefined) worldFillHeld.add(id);
    } else if (job.route === 'world_gen_families') {
      const id = genStateIdOf(job);
      if (id !== undefined) worldFamiliesHeld.add(id);
    }
  }
  const stale = (row: any): boolean => now - row.updatedAt.microsSinceUnixEpoch > LLM_SWEEP_STRANDED_LOCK_GRACE_MICROS;

  let released = 0;
  for (const state of [...ctx.db.character_creation_state.iter()]) {
    const lock = CREATION_LOCKS[state.step];
    if (!lock || !stale(state)) continue;
    if (creationHeld.has(`${lock.route}|${state.playerId.toHexString()}`)) continue;
    try {
      ctx.db.character_creation_state.id.update({ ...state, step: lock.back, updatedAt: ctx.timestamp });
      const lockSegments = keeperFallback(lock.line);
      appendCreationEvent(ctx, state.playerId, 'creation_error', flattenSegments(lockSegments), lockSegments);
      released += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      d.log(redactSecrets(`llm_sweep creation lock ${String(state.id)} release failed: ${message}`));
    }
  }
  for (const state of [...ctx.db.world_gen_state.iter()]) {
    const isStage1 = state.step === 'PENDING' || state.step === 'GENERATING';
    const isStage2a = state.step === 'FILLING';
    const isStage2b = state.step === 'FILLING_FAMILIES';
    // ERROR, FILL_ERROR, FAMILIES_ERROR, HELD and COMPLETE are never touched
    if (!isStage1 && !isStage2a && !isStage2b) continue;
    const held = isStage1 ? worldGenHeld : isStage2a ? worldFillHeld : worldFamiliesHeld;
    if (!stale(state) || held.has(state.id.toString())) continue;
    try {
      if (isStage1) failWorldGen(ctx, state, WORLD_GEN_LOCK_RELEASED);
      else if (isStage2a) failWorldFill(ctx, state, WORLD_FILL_FAILED_MESSAGE);
      else failWorldFamilies(ctx, state, WORLD_FAMILIES_FAILED_MESSAGE);
      released += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      d.log(redactSecrets(`llm_sweep world-gen lock ${String(state.id)} release failed: ${message}`));
    }
  }
  return released;
}
