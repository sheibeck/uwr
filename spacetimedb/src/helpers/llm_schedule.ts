// ============================================================================
// LLM dispatch and sweep-tick scheduling (Phase 41)
// ============================================================================
//
// Every retry, deferral and re-dispatch inserts a NEW llm_dispatch row: the
// scheduler deletes a row before its procedure runs, so a row is never reused.
// `ScheduleAt` comes from the spacetimedb root package, which loads in Node.
//
// No runtime import from the server entry point, schema/tables, events or
// location, so this module loads in plain Node vitest.
// ============================================================================

import { ScheduleAt } from 'spacetimedb';
import { LLM_SWEEP_INTERVAL_MICROS } from '../data/llm_limits';

/** Insert one dispatch row that fires at `atMicros` for the job. Returns the row. */
export function insertLlmDispatch(tx: any, jobId: bigint, atMicros: bigint): any {
  return tx.db.llm_dispatch.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(atMicros),
    jobId,
  });
}

/** True when a dispatch row already exists for the job (tiny table; never call from a view). */
export function hasLlmDispatch(tx: any, jobId: bigint): boolean {
  for (const row of tx.db.llm_dispatch.iter()) {
    if (row.jobId === jobId) return true;
  }
  return false;
}

/** The fire time of a ScheduleAt in microseconds, or null for an interval schedule. */
export function scheduledMicros(scheduleAt: any): bigint | null {
  if (scheduleAt?.tag === 'Time') return scheduleAt.value.microsSinceUnixEpoch;
  return null;
}

/**
 * Insert the single sweep tick 30 s out, only when the table is empty.
 * Returns whether a row was inserted.
 */
export function ensureLlmSweepScheduled(ctx: any): boolean {
  for (const _row of ctx.db.llm_sweep_tick.iter()) {
    return false;
  }
  ctx.db.llm_sweep_tick.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + LLM_SWEEP_INTERVAL_MICROS),
  });
  return true;
}
