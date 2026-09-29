// Throwaway spike tables (phase 39). Deleted at phase end.
// Imports only from 'spacetimedb/server' so the schema module can import this file without a cycle.
import { table, t } from 'spacetimedb/server';

// Private schedule table, bound to the spike_run_job procedure through onSchedule.
export const SpikeJob = table(
  { name: 'spike_job' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    runId: t.string(),
    rung: t.string(),
    seq: t.u32(),
    specJson: t.string(),
  }
);

// Private schedule table, bound to the spike_tick_probe reducer through onSchedule.
export const SpikeTick = table(
  { name: 'spike_tick' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

// Public: the harness subscribes. Contains no secrets (redacted, no full bodies).
export const SpikeResult = table(
  { name: 'spike_result', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    runId: t.string(),
    rung: t.string(),
    seq: t.u32(),
    ok: t.bool(),
    dataJson: t.string(),
  }
);

// Public: tick-probe samples at the combat cadence.
export const SpikeTickSample = table(
  { name: 'spike_tick_sample', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    phase: t.string(),
    inFlight: t.u32(),
    lateUs: t.i64(),
    gapUs: t.i64(),
  }
);

// Private singleton (id 1n).
export const SpikeState = table(
  { name: 'spike_state' },
  {
    id: t.u64().primaryKey(),
    phase: t.string(),
    probeOn: t.bool(),
    lastTickUs: t.i64(),
    inFlight: t.u32(),
    calls: t.u64(),
    estCostMicroUsd: t.u64(),
    reservedMicroUsd: t.u64(),
    pings: t.u64(),
  }
);
