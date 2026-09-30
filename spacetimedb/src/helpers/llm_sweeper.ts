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
// - stranded generation locks: a creation step GENERATING_RACE/GENERATING_CLASS or a
//   world-gen state PENDING/GENERATING with no active job for 60 s (its failure message
//   threw, so the job is terminal but the lock was never released) is released directly
//   with the in-voice "try again" line, never through applyFailure (a message bug must
//   not keep a lock forever)
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
import { appendCreationEvent } from './events';
import { activeLlmJobs } from './llm_queue';
import { chargeLedgerUnknownBilling, prunePlayerBudgets, releaseLlmReservation } from './llm_budget';
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

/** The creation step each creation route holds, and the step a released lock returns to. */
const CREATION_LOCKS: Readonly<Record<string, { route: string; back: string }>> = Object.freeze({
  GENERATING_RACE: { route: 'creation_race', back: 'AWAITING_RACE' },
  GENERATING_CLASS: { route: 'creation_class', back: 'AWAITING_ARCHETYPE' },
});

/** The same in-voice lines the per-route failure handling posts. */
const CREATION_LOCK_RELEASED = 'The Keeper flickers. "Something went wrong in the cosmic machinery. Try again."';
const WORLD_GEN_LOCK_RELEASED = 'The Keeper falters. "The world refuses to be remembered right now."';

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
 * creation job of its own identity; a world-gen state by an active world_gen job naming its id.
 * Only locks older than the grace are touched (a lock and its job are always written in the
 * same transaction, so a younger lock without a job cannot exist, but the grace keeps the rule
 * conservative). Iterates both state tables: the only caller is the sweeper reducer.
 */
function releaseStrandedLocks(ctx: any, now: bigint, d: SweepDeps): number {
  const active = activeLlmJobs(ctx);
  const creationHeld = new Set<string>();
  const worldGenHeld = new Set<string>();
  for (const job of active) {
    if (job.route === 'creation_race' || job.route === 'creation_class') {
      creationHeld.add(`${job.route}|${job.playerId.toHexString()}`);
    } else if (job.route === 'world_gen') {
      const id = genStateIdOf(job);
      if (id !== undefined) worldGenHeld.add(id);
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
      appendCreationEvent(ctx, state.playerId, 'creation_error', CREATION_LOCK_RELEASED);
      released += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      d.log(redactSecrets(`llm_sweep creation lock ${String(state.id)} release failed: ${message}`));
    }
  }
  for (const state of [...ctx.db.world_gen_state.iter()]) {
    if (state.step !== 'PENDING' && state.step !== 'GENERATING') continue;
    if (!stale(state) || worldGenHeld.has(state.id.toString())) continue;
    try {
      failWorldGen(ctx, state, WORLD_GEN_LOCK_RELEASED);
      released += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      d.log(redactSecrets(`llm_sweep world-gen lock ${String(state.id)} release failed: ${message}`));
    }
  }
  return released;
}
