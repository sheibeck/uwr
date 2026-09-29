// Phase 39 concurrency load (SPIKE-03). Throwaway: deleted in the phase cleanup plan.
//
// Measures spike_ping round trip and combat-tick lateness while N region calls are kept in flight,
// against the idle baseline, with a baseline2 noise control and server memory snapshots.
//
//   SPIKE_LOAD_DRY_RUN=1  free dry run: 16 public_url calls at 8 in flight, nothing written.
//   (unset)               paid run: level 8 (24 calls), step down to 4 then 2 only if the level fails,
//                         baseline2 control, memory, results written through ResultsStore.
//   SPIKE_TARGET=maincloud  hosted run: levels 8, 4 and 2 always all run (24/12/6 calls, extension up to
//                         16/8/4) to discover the hosted concurrency cap; window sizing counts the filtered
//                         pings and ticks the gate uses; no host process, so memory is recorded as unavailable.
//
// Every paid launch is preceded by a budget check; the module reserve/settle cap is the hard stop.
// The real key never appears here: the module reads it from private llm_config.
import { afterAll, describe, expect, it } from 'vitest';

import { percentile, ratioCheck, summarize } from '../../spacetimedb/src/helpers/measurement.ts';
import type { CallSample, LatencyWindow } from '../../spacetimedb/src/helpers/measurement_results';
import { effectiveInFlight, levelLabels, minInFlightForLevel } from '../../spacetimedb/src/helpers/measurement_results';
import type { SpikeSpec } from '../../spacetimedb/src/spike/spike_bodies.ts';
import {
  captureLogs,
  collectTicks,
  connectSpike,
  measureIdleWindow,
  memorySnapshot,
  pingLoop,
  resetProbe,
  serverPid,
  setPhase,
  startConcurrent,
  type LatencySample,
  type MemoryRow,
  type Spike,
} from './harness.ts';
import { ResultsStore } from './results-store.ts';
import { BUDGET_MICRO_USD, TARGET } from './config.ts';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const DRY_RUN = process.env.SPIKE_LOAD_DRY_RUN === '1';
const HOSTED = TARGET.name === 'maincloud';

/** Gate minimums (GATE_DEFAULTS) and the harness tick target. */
const MIN_PING = 200;
const MIN_TICKS = 30;
const TARGET_TICKS = 55;
/** Hosted runs size each window until this many filtered pings exist (gate minimum plus margin). */
const TARGET_PINGS = 250;

/** Observed region call cost is about 19k micro-USD; leave margin for the pre-level budget check. */
const REGION_CALL_BUDGET_MICRO_USD = 30_000;

export interface LevelBaseline {
  pingP95: number | null;
  tickP95: number | null;
}

export interface LevelResult {
  inFlight: number;
  calls: CallSample[];
  window: LatencyWindow;
  extended: boolean;
  pingPass: boolean;
  tickPass: boolean;
  filtered: { pingSamples: number; tickSamples: number; pingP95: number | null; tickP95: number | null; limitPing: number | null; limitTick: number | null };
}

function p95Or(xs: number[]): number | null {
  return xs.length === 0 ? null : percentile(xs, 95);
}

/** p95 of ping and tick lateness over the idle samples of a window. */
export function baselineOf(w: LatencyWindow | undefined): LevelBaseline {
  return {
    pingP95: p95Or((w?.pingMs ?? []).map((p) => p.ms)),
    tickP95: p95Or((w?.tick ?? []).map((t) => t.lateMs)),
  };
}

/**
 * Keep `level` calls in flight for `total` calls (plus up to extraMax while the filtered tick window is
 * still thin), ping every 50 ms labeled with the live in-flight count, collect the phase's tick samples,
 * then judge only samples taken with in-flight >= minInFlightForLevel(level) using the strict ratioCheck.
 */
export async function runLevel(
  s: Spike,
  o: {
    level: number;
    total: number;
    extraMax: number;
    spec: SpikeSpec;
    phase: string;
    baseline: LevelBaseline;
    /** override for dry runs: keep launching while this returns true (in addition to the tick rule) */
    extraNeeded?: () => boolean;
    runId?: string;
  },
): Promise<LevelResult> {
  const min = minInFlightForLevel(o.level);
  await setPhase(s, o.phase);
  await sleep(300);
  const runId = o.runId ?? `load-${o.phase}-${Date.now().toString(36)}`;

  // Hosted runs: ticks are filtered at the level's effective concurrency, the same filter the gate applies
  // (the highest server in-flight label seen so far in this level stands in for the observed cap).
  const tickMinFor = (all: { inFlight: number }[]) => {
    if (!HOSTED) return min;
    const cap = all.length === 0 ? null : Math.max(...all.map((t) => t.inFlight));
    return minInFlightForLevel(effectiveInFlight(o.level, cap));
  };
  const filteredTicks = () => {
    const all = collectTicks(s, o.phase);
    const tickMin = tickMinFor(all);
    return all.filter((t) => t.inFlight >= tickMin).length;
  };
  const pingSink: LatencySample[] = [];
  const filteredPingCount = () => pingSink.filter((p) => p.inFlight >= min).length;
  const needMore = () =>
    o.extraNeeded?.() === true ||
    filteredTicks() < TARGET_TICKS ||
    (HOSTED && filteredPingCount() < TARGET_PINGS);

  const h = startConcurrent(s, {
    runId,
    rung: 'load_' + o.phase,
    spec: o.spec,
    total: o.total,
    inFlight: o.level,
    extraMax: o.extraMax,
    needMore,
  });
  const pings: LatencySample[] = await pingLoop(s, { intervalMs: 50, until: h.done, outstanding: h.outstanding, sink: pingSink });
  const calls = await h.done;
  const ticks = collectTicks(s, o.phase);
  await setPhase(s, 'idle_between');

  const window: LatencyWindow = { label: o.phase, serverPid: serverPid(), pingMs: pings, tick: ticks };
  const tickMin = tickMinFor(ticks);
  const fp = pings.filter((p) => p.inFlight >= min).map((p) => p.ms);
  const ft = ticks.filter((t) => t.inFlight >= tickMin).map((t) => t.lateMs);
  const pingP95 = p95Or(fp);
  const tickP95 = p95Or(ft);
  const pc = ratioCheck(o.baseline.pingP95, pingP95, 2, 0);
  const tc = ratioCheck(o.baseline.tickP95, tickP95, 2, 0);
  return {
    inFlight: o.level,
    calls,
    window,
    extended: calls.length > o.total,
    pingPass: pc.pass,
    tickPass: tc.pass,
    filtered: { pingSamples: fp.length, tickSamples: ft.length, pingP95, tickP95, limitPing: pc.limit, limitTick: tc.limit },
  };
}

const f1 = (v: number | null | undefined) => (typeof v === 'number' ? (Math.round(v * 100) / 100).toString() : 'n/a');

function histogram(xs: number[]): string {
  const m = new Map<number, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return JSON.stringify([...m.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => k + ':' + v));
}

function levelLine(r: LevelResult, base: LevelBaseline): string {
  const okCalls = r.calls.filter((c) => c.ok).length;
  const shortfall =
    r.filtered.pingSamples < MIN_PING || r.filtered.tickSamples < MIN_TICKS
      ? ` SHORTFALL(min ping ${MIN_PING}, tick ${MIN_TICKS})`
      : '';
  return (
    `level ${r.inFlight}: calls ok ${okCalls}/${r.calls.length}, extended=${r.extended}, ` +
    `filtered pings ${r.filtered.pingSamples} ticks ${r.filtered.tickSamples}${shortfall}; ` +
    `ping p95 ${f1(r.filtered.pingP95)} ms vs base ${f1(base.pingP95)} (limit ${f1(r.filtered.limitPing)}) ${r.pingPass ? 'PASS' : 'FAIL'}; ` +
    `tick p95 ${f1(r.filtered.tickP95)} ms vs base ${f1(base.tickP95)} (limit ${f1(r.filtered.limitTick)}) ${r.tickPass ? 'PASS' : 'FAIL'}`
  );
}

describe.skipIf(!DRY_RUN)('spike load dry run (no spend)', () => {
  let s: Spike | undefined;
  afterAll(() => s?.close());

  it('keeps 8 public_url calls in flight, all 16 results arrive, samples are labeled with inFlight', async () => {
    s = await connectSpike();
    const store = new ResultsStore();
    await resetProbe(s, true);
    const spec: SpikeSpec = { kind: 'public_url', class: 'exploratory' };
    const t0 = performance.now();
    // Keep launching (bounded) until at least one tick with inFlight >= 1 exists: public_url calls are quick.
    const r = await runLevel(s, {
      level: 8,
      total: 16,
      extraMax: 400,
      spec,
      phase: 'dry8',
      baseline: baselineOf(store.get('load.baseline') as LatencyWindow | undefined),
      extraNeeded: () => collectTicks(s!, 'dry8').filter((t) => t.inFlight >= 1).length < 1 && performance.now() - t0 < 25_000,
    });
    await resetProbe(s, false);

    const arrived = r.calls.filter((c) => c.status !== null || c.ok).length;
    console.log(`dry run: ${r.calls.length} calls launched, ${arrived} results arrived, ok ${r.calls.filter((c) => c.ok).length}`);
    console.log(`dry run: pings ${r.window.pingMs.length} (max inFlight ${Math.max(0, ...r.window.pingMs.map((p) => p.inFlight))}), ticks ${r.window.tick.length}`);
    console.log('dry run: ping inFlight labels seen: ' + JSON.stringify([...new Set(r.window.pingMs.map((p) => p.inFlight))].sort((a, b) => a - b)));
    console.log('dry run: tick inFlight labels seen: ' + JSON.stringify([...new Set(r.window.tick.map((t) => t.inFlight))].sort((a, b) => a - b)));
    console.log('dry run: ' + levelLine(r, baselineOf(store.get('load.baseline') as LatencyWindow | undefined)));

    // 1) all 16 (at least) results arrive
    expect(r.calls.length).toBeGreaterThanOrEqual(16);
    expect(r.calls.every((c) => c.ok)).toBe(true);
    // 2) ping and tick samples are labeled with inFlight
    expect(r.window.pingMs.length).toBeGreaterThan(0);
    expect(r.window.pingMs.every((p) => Number.isInteger(p.inFlight))).toBe(true);
    expect(Math.max(...r.window.pingMs.map((p) => p.inFlight))).toBeGreaterThanOrEqual(1);
    expect(r.window.tick.every((t) => Number.isInteger(t.inFlight))).toBe(true);
    // 3) at least one tick sample saw calls in flight
    expect(r.window.tick.some((t) => t.inFlight >= 1)).toBe(true);
  });
});

describe.skipIf(DRY_RUN)('spike load (paid)', () => {
  let s: Spike | undefined;
  afterAll(() => s?.close());

  it('runs level 8 (step-down 4 then 2 if needed; all three on a hosted target), baseline2 control and memory', async () => {
    s = await connectSpike();
    const spike = s;
    const store = new ResultsStore();

    const regionOk = (store.get('structured.regionCompile') as { compiles?: boolean } | undefined)?.compiles !== false;
    const spec: SpikeSpec = { kind: 'messages', route: regionOk ? 'region' : 'region_core', effort: 'low', class: 'reliability' };
    console.log('load spec route: ' + spec.route);

    // ---- Step 1: same-process baseline ----
    const pidNow = serverPid();
    let baseline = store.get('load.baseline') as LatencyWindow | undefined;
    if (!baseline || baseline.serverPid !== pidNow) {
      console.log(`server pid changed (baseline ${baseline?.serverPid ?? 'none'} -> ${pidNow}): taking a fresh baseline`);
      if (baseline) store.set('load.baselineEarly', baseline);
      const fresh = await measureIdleWindow(spike, 'baseline', { minPing: 1000, minTicks: 55, maxMs: 120_000 });
      store.set('load.baseline', fresh.window);
      if (fresh.memory) store.append('load.memory', [fresh.memory]);
      baseline = fresh.window;
    }
    const base = baselineOf(baseline);
    console.log(`baseline p95: ping ${f1(base.pingP95)} ms, tick ${f1(base.tickP95)} ms (pid ${baseline.serverPid})`);
    if (!Array.isArray(store.get('load.levels'))) store.set('load.levels', []);
    if (HOSTED) {
      // No host process access on a hosted database: memory is recorded as unavailable.
      if (!Array.isArray(store.get('load.memory'))) store.set('load.memory', []);
      store.set('load.memoryNote', 'unavailable on maincloud: no host process access');
    }

    // ---- Steps 2-4: probe on, level 8, step down ----
    await resetProbe(spike, true);
    const plan = HOSTED
      ? [
          { level: 8, total: 24, extraMax: 16, phase: 'load8' },
          { level: 4, total: 12, extraMax: 8, phase: 'load4' },
          { level: 2, total: 6, extraMax: 4, phase: 'load2' },
        ]
      : [
          { level: 8, total: 24, extraMax: 8, phase: 'load8' },
          { level: 4, total: 12, extraMax: 4, phase: 'load4' },
          { level: 2, total: 6, extraMax: 2, phase: 'load2' },
        ];
    const results: LevelResult[] = [];
    const memoryRows: MemoryRow[] = [];
    let passedLevel: number | null = null;
    let stop: string | null = null;

    for (const p of plan) {
      const spent = store.estimatedSpendMicroUsd();
      const need = (HOSTED ? p.total + p.extraMax : p.total) * REGION_CALL_BUDGET_MICRO_USD;
      if (spent + need > BUDGET_MICRO_USD) {
        stop = `harness budget: spent ${spent} + level ${p.level} estimate ${need} exceeds ${BUDGET_MICRO_USD}`;
        break;
      }
      const r = await runLevel(spike, { ...p, spec, baseline: base });
      results.push(r);
      const mem = memorySnapshot('after_' + p.phase);
      if (mem) memoryRows.push(mem);
      // Persist immediately: calls, window and the memory row (when there is one).
      store.append('load.levels', [{ inFlight: r.inFlight, calls: r.calls, window: r.window, extended: r.extended }]);
      if (mem) store.append('load.memory', [mem]);
      console.log(levelLine(r, base));

      if (r.calls.some((c) => c.failureClass === 'spend_cap')) {
        stop = 'module spend cap tripped during level ' + p.level;
        break;
      }
      if (r.pingPass && r.tickPass && passedLevel === null) {
        passedLevel = p.level;
      }
      // Local: stop at the first passing level. Hosted: all of 8, 4 and 2 always run to find the cap.
      if (passedLevel !== null && !HOSTED) break;
    }

    // ---- Step 5: baseline2 control, memory, 60 s idle ----
    await resetProbe(spike, false);
    const b2 = await measureIdleWindow(spike, 'baseline2', { minPing: 1000, minTicks: 55, maxMs: 120_000 });
    store.set('load.baseline2', b2.window);
    if (b2.memory) {
      const memB2 = { ...b2.memory, label: 'after_baseline2' };
      store.append('load.memory', [memB2]);
      memoryRows.push(memB2);
    }
    if (!HOSTED) {
      await sleep(60_000);
      const memIdle = memorySnapshot('idle_60s');
      if (memIdle) {
        store.append('load.memory', [memIdle]);
        memoryRows.push(memIdle);
      }
    }

    // ---- Steps 6-7: probe off, logs ----
    await resetProbe(spike, false);
    store.append('serverLogs', [captureLogs('load', 200)]);

    // ---- Step 8: report ----
    const b2p = baselineOf(b2.window);
    console.log('--- load report ---');
    for (const r of results) console.log(levelLine(r, base));
    console.log(`passing level: ${passedLevel ?? 'none'}${stop ? '; STOPPED: ' + stop : ''}`);
    console.log(`baseline  p95: ping ${f1(base.pingP95)} ms tick ${f1(base.tickP95)} ms (n ping ${baseline.pingMs.length}, tick ${baseline.tick.length}, pid ${baseline.serverPid})`);
    console.log(`baseline2 p95: ping ${f1(b2p.pingP95)} ms tick ${f1(b2p.tickP95)} ms (n ping ${b2.window.pingMs.length}, tick ${b2.window.tick.length}, pid ${b2.window.serverPid})`);
    console.log('memory table: ' + JSON.stringify(store.get('load.memory')) + (HOSTED ? ' (unavailable on maincloud: no host process access)' : ''));
    {
      // Label histograms per level, the observed server cap and the gate-filter sample counts.
      const labels = levelLabels(store.read());
      for (const r of results) {
        console.log(
          `level ${r.inFlight}: ping labels (client outstanding) ${histogram(r.window.pingMs.map((x) => x.inFlight))}; ` +
            `tick labels (server in-flight) ${histogram(r.window.tick.map((x) => x.inFlight))}`,
        );
      }
      const cap = labels[0]?.observedServerCap ?? null;
      console.log('observed server cap (highest tick label over all levels): ' + (cap ?? 'n/a'));
      for (const l of labels) {
        console.log(
          `gate window level ${l.level}: effective ${l.effectiveInFlight}, ping min ${l.pingMin} -> ${l.pingSamples} samples, tick min ${l.tickMin} -> ${l.tickSamples} samples`,
        );
        if (l.pingSamples < MIN_PING || l.tickSamples < MIN_TICKS) {
          console.log(`SHORTFALL level ${l.level}: filtered pings ${l.pingSamples} (min ${MIN_PING}), filtered ticks ${l.tickSamples} (min ${MIN_TICKS})`);
        }
      }
    }
    console.log('baseline ping summary: ' + JSON.stringify(summarize(baseline.pingMs.map((x) => x.ms))));
    console.log('estimated harness spend (micro-USD): ' + store.estimatedSpendMicroUsd());

    if (stop) throw new Error('load run stopped early, ask the user before continuing: ' + stop);

    // ---- Step 9: structural expectations ----
    const doc = store.read();
    expect(doc.load?.levels.some((l) => l.inFlight === 8 && l.calls.length >= 24)).toBe(true);
    if (HOSTED) {
      expect(doc.load?.levels.some((l) => l.inFlight === 4)).toBe(true);
      expect(doc.load?.levels.some((l) => l.inFlight === 2)).toBe(true);
      expect(doc.load?.memory).toEqual([]);
    }
    // The plan targets 1000 pings; the gate minimum is MIN_PING. A noisy host can leave a 120 s window short of 1000.
    if (b2.window.pingMs.length < 1000) console.log(`baseline2 ping count ${b2.window.pingMs.length} is below the 1000 target (gate minimum ${MIN_PING})`);
    expect(b2.window.pingMs.length).toBeGreaterThanOrEqual(MIN_PING);
    expect(b2.window.tick.length).toBeGreaterThanOrEqual(TARGET_TICKS);
    expect(baseline.serverPid).toBe(b2.window.serverPid);
  });
});
