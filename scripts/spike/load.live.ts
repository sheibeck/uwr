// Phase 39 concurrency load (SPIKE-03). Throwaway: deleted in the phase cleanup plan.
//
// Measures spike_ping round trip and combat-tick lateness while N region calls are kept in flight,
// against the idle baseline, with a baseline2 noise control and server memory snapshots.
//
//   SPIKE_LOAD_DRY_RUN=1  free dry run: 16 public_url calls at 8 in flight, nothing written.
//   (unset)               paid run: level 8 (24 calls), step down to 4 then 2 only if the level fails,
//                         baseline2 control, memory, results written through ResultsStore.
//
// Every paid launch is preceded by a budget check; the module reserve/settle cap is the hard stop.
// The real key never appears here: the module reads it from private llm_config.
import { afterAll, describe, expect, it } from 'vitest';

import { percentile, ratioCheck, summarize } from '../../spacetimedb/src/helpers/measurement.ts';
import type { CallSample, LatencyWindow } from '../../spacetimedb/src/helpers/measurement_results';
import { minInFlightForLevel } from '../../spacetimedb/src/helpers/measurement_results';
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
  type Spike,
} from './harness.ts';
import { ResultsStore } from './results-store.ts';
import { BUDGET_MICRO_USD } from './config.ts';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const DRY_RUN = process.env.SPIKE_LOAD_DRY_RUN === '1';

/** Gate minimums (GATE_DEFAULTS) and the harness tick target. */
const MIN_PING = 200;
const MIN_TICKS = 30;
const TARGET_TICKS = 55;

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

  const filteredTicks = () => collectTicks(s, o.phase).filter((t) => t.inFlight >= min).length;
  const needMore = () => o.extraNeeded?.() === true || filteredTicks() < TARGET_TICKS;

  const h = startConcurrent(s, {
    runId,
    rung: 'load_' + o.phase,
    spec: o.spec,
    total: o.total,
    inFlight: o.level,
    extraMax: o.extraMax,
    needMore,
  });
  const pings: LatencySample[] = await pingLoop(s, { intervalMs: 50, until: h.done, outstanding: h.outstanding });
  const calls = await h.done;
  const ticks = collectTicks(s, o.phase);
  await setPhase(s, 'idle_between');

  const window: LatencyWindow = { label: o.phase, serverPid: serverPid(), pingMs: pings, tick: ticks };
  const fp = pings.filter((p) => p.inFlight >= min).map((p) => p.ms);
  const ft = ticks.filter((t) => t.inFlight >= min).map((t) => t.lateMs);
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

  it('runs level 8 (step-down 4 then 2 if needed), baseline2 control and memory', async () => {
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
      store.append('load.memory', [fresh.memory]);
      baseline = fresh.window;
    }
    const base = baselineOf(baseline);
    console.log(`baseline p95: ping ${f1(base.pingP95)} ms, tick ${f1(base.tickP95)} ms (pid ${baseline.serverPid})`);
    if (!Array.isArray(store.get('load.levels'))) store.set('load.levels', []);

    // ---- Steps 2-4: probe on, level 8, step down ----
    await resetProbe(spike, true);
    const plan = [
      { level: 8, total: 24, extraMax: 8, phase: 'load8' },
      { level: 4, total: 12, extraMax: 4, phase: 'load4' },
      { level: 2, total: 6, extraMax: 2, phase: 'load2' },
    ];
    const results: LevelResult[] = [];
    const memoryRows: ReturnType<typeof memorySnapshot>[] = [];
    let passedLevel: number | null = null;
    let stop: string | null = null;

    for (const p of plan) {
      const spent = store.estimatedSpendMicroUsd();
      const need = p.total * REGION_CALL_BUDGET_MICRO_USD;
      if (spent + need > BUDGET_MICRO_USD) {
        stop = `harness budget: spent ${spent} + level ${p.level} estimate ${need} exceeds ${BUDGET_MICRO_USD}`;
        break;
      }
      const r = await runLevel(spike, { ...p, spec, baseline: base });
      results.push(r);
      const mem = memorySnapshot('after_' + p.phase);
      memoryRows.push(mem);
      // Persist immediately: calls, window and the memory row.
      store.append('load.levels', [{ inFlight: r.inFlight, calls: r.calls, window: r.window, extended: r.extended }]);
      store.append('load.memory', [mem]);
      console.log(levelLine(r, base));

      if (r.calls.some((c) => c.failureClass === 'spend_cap')) {
        stop = 'module spend cap tripped during level ' + p.level;
        break;
      }
      if (r.pingPass && r.tickPass) {
        passedLevel = p.level;
        break;
      }
    }

    // ---- Step 5: baseline2 control, memory, 60 s idle ----
    await resetProbe(spike, false);
    const b2 = await measureIdleWindow(spike, 'baseline2', { minPing: 1000, minTicks: 55, maxMs: 120_000 });
    store.set('load.baseline2', b2.window);
    const memB2 = { ...b2.memory, label: 'after_baseline2' };
    store.append('load.memory', [memB2]);
    memoryRows.push(memB2);
    await sleep(60_000);
    const memIdle = memorySnapshot('idle_60s');
    store.append('load.memory', [memIdle]);
    memoryRows.push(memIdle);

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
    console.log('memory table: ' + JSON.stringify(store.get('load.memory')));
    console.log('baseline ping summary: ' + JSON.stringify(summarize(baseline.pingMs.map((x) => x.ms))));
    console.log('estimated harness spend (micro-USD): ' + store.estimatedSpendMicroUsd());

    if (stop) throw new Error('load run stopped early, ask the user before continuing: ' + stop);

    // ---- Step 9: structural expectations ----
    const doc = store.read();
    expect(doc.load?.levels.some((l) => l.inFlight === 8 && l.calls.length >= 24)).toBe(true);
    // The plan targets 1000 pings; the gate minimum is MIN_PING. A noisy host can leave a 120 s window short of 1000.
    if (b2.window.pingMs.length < 1000) console.log(`baseline2 ping count ${b2.window.pingMs.length} is below the 1000 target (gate minimum ${MIN_PING})`);
    expect(b2.window.pingMs.length).toBeGreaterThanOrEqual(MIN_PING);
    expect(b2.window.tick.length).toBeGreaterThanOrEqual(TARGET_TICKS);
    expect(baseline.serverPid).toBe(b2.window.serverPid);
  });
});
