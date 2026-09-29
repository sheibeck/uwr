// Phase 39 structured outputs (SPIKE-02). Throwaway: deleted in the phase cleanup plan.
//   1. region compile probe (gate input), staged region_core/region_population fallback on a 400
//   2. matrix: skill and region schemas x effort low/medium x 5 (run 0 of each cell tagged cold)
//   3. thinking-off variant (skill, medium, 3 runs)
//   4. cache pair (two identical skill-low calls back to back)
//   5. header visibility merge, server logs, per-cell report
// Every paid call is preceded by budgetCheck. Failures are recorded; the only retry is the single re-run.
// The real key never appears here: the module reads it from private llm_config.
import fs from 'node:fs';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { summarize } from '../../spacetimedb/src/helpers/measurement.ts';
import type { CallSample } from '../../spacetimedb/src/helpers/measurement_results';
import type { SpikeRoute, SpikeSpec } from '../../spacetimedb/src/spike/spike_bodies.ts';
import {
  budgetCheck,
  captureLogs,
  connectSpike,
  resetProbe,
  runRungWithRerun,
  runSequential,
  type Spike,
} from './harness.ts';
import { ResultsStore } from './results-store.ts';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Effort = 'low' | 'medium';
const spec = (route: SpikeRoute, effort: Effort, cls: SpikeSpec['class'], extra: Partial<SpikeSpec> = {}): SpikeSpec => ({
  kind: 'messages',
  route,
  effort,
  class: cls,
  ...extra,
});

function fill(x: CallSample, sp: SpikeSpec): CallSample {
  if (x.route === null) x.route = sp.route ?? null;
  if (x.effort === null) x.effort = sp.effort ?? null;
  return x;
}

function stats(samples: CallSample[]) {
  const e2e = samples.map((x) => x.clientE2eMs).filter((x): x is number => typeof x === 'number');
  const call = samples.map((x) => (x.callUs ?? 0) / 1000).filter((x) => x > 0);
  const outTok = samples.map((x) => x.usage?.output).filter((x): x is number => typeof x === 'number');
  return {
    n: samples.length,
    ok: samples.filter((x) => x.ok).length,
    e2e: summarize(e2e),
    callMs: summarize(call),
    meanOutTokens: outTok.length ? outTok.reduce((a, b) => a + b, 0) / outTok.length : null,
  };
}

const r1 = (v: number | null | undefined) => (typeof v === 'number' ? Math.round(v) : 'n/a');

describe('spike structured outputs (paid)', () => {
  let s: Spike | undefined;
  afterAll(() => s?.close());

  it('probes the region schema, runs the 4-cell matrix, thinking-off, cache pair and headers', async () => {
    s = await connectSpike();
    const spike = s;
    const store = new ResultsStore();
    const tag = 's' + Date.now().toString(36);
    const report: string[] = [];
    let stopReason: string | null = null;
    const log = (line: string) => {
      report.push(line);
      console.log(line);
    };

    await resetProbe(spike, false);

    /** One paid call at a time: budget check first, tag with spec route/effort, honour the module cap. */
    const oneCall = async (
      rungName: string,
      sp: SpikeSpec,
      idx: number,
      attempt: number,
      cold: boolean,
    ): Promise<CallSample | null> => {
      try {
        budgetCheck(store, sp);
      } catch (e) {
        stopReason = (e as Error).message;
        return null;
      }
      const [one] = await runSequential(spike, {
        runIdPrefix: `${tag}-${rungName}-${idx}`,
        rung: rungName,
        spec: sp,
        n: 1,
        attempt,
        coldFirst: cold,
      });
      one.seq = idx;
      fill(one, sp);
      if (one.failureClass === 'spend_cap') stopReason = 'module spend cap tripped';
      return one;
    };

    const rawOf = (runId: string): Record<string, any> => {
      const entry = spike.results.get(runId)?.get(0);
      try {
        return entry ? JSON.parse(entry.row.dataJson) : {};
      } catch {
        return {};
      }
    };

    // ---------------- Step 1: region compile probe ----------------
    const probes: CallSample[] = [];
    const regionSpec = spec('region', 'low', 'exploratory');
    const probeOnce = async (attempt: number) => {
      const smp = await oneCall('region_compile', regionSpec, 0, attempt, attempt === 1);
      if (!smp) return null;
      probes.push(smp);
      const raw = rawOf(`${tag}-region_compile-0-a${attempt}-0`);
      return { smp, parsedOk: raw.parsedOk === true, requiredKeysOk: raw.requiredKeysOk === true };
    };
    let probe = await probeOnce(1);
    if (probe && probe.smp.status !== 400 && !(probe.smp.status === 200 && probe.parsedOk && probe.requiredKeysOk)) {
      probe = await probeOnce(2); // non-400 failure, throw or truncated 200: one re-probe
    }
    const regionErrorMessage: string | null = probe && probe.smp.status === 400 ? probe.smp.errorMessage : null;
    const regionCompiles = !!probe && probe.smp.status === 200 && probe.parsedOk && probe.requiredKeysOk;
    const staged = { attempted: false, compiles: false, errorMessages: [] as string[] };
    if (probe && probe.smp.status === 400) {
      staged.attempted = true;
      const coreOk = await oneCall('region_compile_core', spec('region_core', 'low', 'exploratory'), 0, 1, false);
      if (coreOk) probes.push(coreOk);
      const popOk = await oneCall('region_compile_pop', spec('region_population', 'low', 'exploratory'), 0, 1, false);
      if (popOk) probes.push(popOk);
      for (const x of [coreOk, popOk]) {
        if (x && !(x.status === 200 && x.ok)) staged.errorMessages.push(x.errorMessage ?? `status ${x.status}`);
      }
      staged.compiles = !!coreOk && !!popOk && coreOk.status === 200 && coreOk.ok && popOk.status === 200 && popOk.ok;
    }
    const regionCompile = {
      compiles: regionCompiles,
      errorMessage: regionErrorMessage,
      probes,
      staged,
    };
    const structured: Record<string, unknown> = { regionCompile, cells: [], thinkingOff: [], thinkingOffComposable: null };
    store.set('structured', structured);
    log(
      `region compile: compiles=${regionCompiles} status=${probe?.smp.status ?? 'n/a'} stop=${probe?.smp.stopReason ?? 'n/a'} ` +
        `parsedOk=${probe?.parsedOk} requiredKeysOk=${probe?.requiredKeysOk} staged=${JSON.stringify(staged)}`,
    );
    if (regionErrorMessage) log('region compile error (redacted, verbatim): ' + regionErrorMessage);
    if (!probe) {
      log('STOPPED: budget or cap tripped before the region probe: ' + stopReason);
      fs.mkdirSync('scripts/spike/out', { recursive: true });
      fs.writeFileSync(path.join('scripts/spike/out', 'structured-report.txt'), report.join('\n') + '\n');
      expect(stopReason).toBeNull();
      return;
    }
    if (!regionCompiles && !staged.attempted) {
      // Non-400 failure that stayed undetermined after one re-probe: record and stop for the user.
      log('STOPPED: region compile undetermined (status ' + probe.smp.status + '); needs the user.');
      fs.mkdirSync('scripts/spike/out', { recursive: true });
      fs.writeFileSync(path.join('scripts/spike/out', 'structured-report.txt'), report.join('\n') + '\n');
      expect(regionCompiles || staged.attempted).toBe(true);
      return;
    }

    // ---------------- Step 2: matrix ----------------
    const allCells: CallSample[] = [];
    const persistCells = () => store.set('structured.cells', allCells);
    const cellStats: Record<string, CallSample[]> = {};

    // Runs 5 calls (one job at a time) for a list of specs per run index; a staged run is [core, population].
    const runCell = async (cellName: string, specs: SpikeSpec[], attempt: number): Promise<CallSample[]> => {
      const out: CallSample[] = [];
      for (let i = 0; i < 5; i++) {
        for (const sp of specs) {
          if (stopReason) return out;
          const rungName = `struct_${sp.route}_${sp.effort}`;
          const smp = await oneCall(rungName, sp, i, attempt, attempt === 1 && i === 0);
          if (!smp) return out;
          out.push(smp);
          allCells.push(smp);
          (cellStats[cellName] ??= []).push(smp);
          persistCells();
          if (stopReason) return out;
          await sleep(250);
        }
      }
      return out;
    };

    const efforts: Effort[] = ['low', 'medium'];
    const plan: { name: string; specs: SpikeSpec[] }[] = [];
    for (const e of efforts) plan.push({ name: `skill-${e}`, specs: [spec('skill', e, 'reliability')] });
    for (const e of efforts) {
      plan.push({
        name: `region-${e}`,
        specs: regionCompiles
          ? [spec('region', e, 'reliability')]
          : [spec('region_core', e, 'reliability'), spec('region_population', e, 'reliability')],
      });
    }
    // Order: skill-low, skill-medium, region-low, region-medium (as built above).
    for (const c of plan) {
      if (stopReason) break;
      await runRungWithRerun(async (attempt) => {
        if (attempt === 2 && stopReason) return [];
        return runCell(c.name, c.specs, attempt);
      });
    }
    persistCells();

    // ---------------- Step 3: thinking-off variant ----------------
    const thinkingOff: CallSample[] = [];
    const thinkSpec = spec('skill', 'medium', 'exploratory', { thinking: 'between_tools' });
    for (let i = 0; i < 3 && !stopReason; i++) {
      const smp = await oneCall('thinking_off', thinkSpec, i, 1, i === 0);
      if (!smp) break;
      thinkingOff.push(smp);
      store.set('structured.thinkingOff', thinkingOff);
      await sleep(250);
    }
    let composable: boolean | null = null;
    if (thinkingOff.length > 0) {
      const anyParsed = thinkingOff.some((x, i) => x.status === 200 && rawOf(`${tag}-thinking_off-${i}-a1-0`).parsedOk === true);
      const any400 = thinkingOff.some((x) => x.status === 400);
      composable = anyParsed ? true : any400 ? false : null;
    }
    store.set('structured.thinkingOff', thinkingOff);
    store.set('structured.thinkingOffComposable', composable);
    log(
      `thinking-off: composable=${composable} statuses=${JSON.stringify(thinkingOff.map((x) => x.status))} ` +
        `msgs=${JSON.stringify(thinkingOff.filter((x) => x.errorMessage).map((x) => x.errorMessage))}`,
    );

    // ---------------- Step 4: cache pair ----------------
    const pair: CallSample[] = [];
    const cacheSpec = spec('skill', 'low', 'reliability');
    for (let i = 0; i < 2 && !stopReason; i++) {
      const smp = await oneCall('cache', cacheSpec, i, 1, false);
      if (!smp) break;
      pair.push(smp);
      store.set('cache', { pair, cacheReadObserved: (pair[1]?.usage?.cacheRead ?? 0) > 0 });
    }
    const cacheReadObserved = (pair[1]?.usage?.cacheRead ?? 0) > 0;
    store.set('cache', { pair, cacheReadObserved });
    log('cache pair usage: ' + JSON.stringify(pair.map((x) => x.usage)) + ' cacheReadObserved=' + cacheReadObserved);

    // ---------------- Step 5: headers merge ----------------
    const prev = (store.get('headers') as { requestIdVisible?: boolean; retryAfterVisible?: boolean | 'not_observed'; headerNamesSeen?: string[] } | undefined) ?? {};
    const seen = [...probes, ...allCells, ...thinkingOff, ...pair];
    const names = new Set<string>(prev.headerNamesSeen ?? []);
    for (const x of seen) for (const h of x.headerNames ?? []) names.add(h);
    const headers = {
      requestIdVisible: prev.requestIdVisible === true || seen.some((x) => x.requestIdVisible === true),
      retryAfterVisible: prev.retryAfterVisible === true || seen.some((x) => x.retryAfterVisible === true) ? (true as const) : ('not_observed' as const),
      headerNamesSeen: [...names].sort(),
    };
    store.set('headers', headers);
    log('headers: ' + JSON.stringify(headers));
    log('successful-call header names: ' + JSON.stringify([...new Set(seen.filter((x) => x.status === 200).flatMap((x) => x.headerNames ?? []))].sort()));

    // ---------------- Step 6: logs ----------------
    store.append('serverLogs', [captureLogs('structured', 200)]);

    // ---------------- Step 7: report ----------------
    log('cell | n | ok | e2e p50/p95 (all) | e2e p50/p95 (no cold) | call p50/p95 ms (all) | call p50/p95 ms (no cold) | mean out tokens');
    for (const [name, list] of Object.entries(cellStats)) {
      const all = stats(list);
      const warm = stats(list.filter((x) => !x.cold));
      log(
        `${name} | ${all.n} | ${all.ok} | ${r1(all.e2e?.p50)}/${r1(all.e2e?.p95)} | ${r1(warm.e2e?.p50)}/${r1(warm.e2e?.p95)} | ` +
          `${r1(all.callMs?.p50)}/${r1(all.callMs?.p95)} | ${r1(warm.callMs?.p50)}/${r1(warm.callMs?.p95)} | ${r1(all.meanOutTokens)}`,
      );
      const stops: Record<string, number> = {};
      for (const x of list) stops[x.stopReason ?? 'none'] = (stops[x.stopReason ?? 'none'] ?? 0) + 1;
      const fails = list.filter((x) => !x.ok).map((x) => `${x.failureClass}/${x.status}/${x.stopReason}/${x.errorMessage ?? ''}`);
      log(`  ${name} stop reasons ${JSON.stringify(stops)} failures ${JSON.stringify(fails)}`);
    }
    log('estimated spend micro-USD (all recorded samples): ' + store.estimatedSpendMicroUsd());
    if (stopReason) log('STOPPED EARLY: ' + stopReason);
    fs.mkdirSync('scripts/spike/out', { recursive: true });
    fs.writeFileSync(path.join('scripts/spike/out', 'structured-report.txt'), report.join('\n') + '\n');

    // ---------------- Assertions (failures are recorded, not asserted away) ----------------
    expect(stopReason).toBeNull();
    expect(typeof regionCompile.compiles).toBe('boolean');
    expect(regionCompile.probes.length).toBeGreaterThan(0);
    const perCell = (route: string, effort: string) => allCells.filter((x) => x.route === route && x.effort === effort);
    expect(perCell('skill', 'low').length).toBeGreaterThanOrEqual(5);
    expect(perCell('skill', 'medium').length).toBeGreaterThanOrEqual(5);
    const regionRoutes = regionCompiles ? ['region'] : ['region_core', 'region_population'];
    for (const e of efforts) for (const r of regionRoutes) expect(perCell(r, e).length).toBeGreaterThanOrEqual(5);
    expect(allCells.every((x) => x.effort !== null)).toBe(true);
    expect(thinkingOff.length).toBe(3);
    expect(thinkingOff.every((x) => x.class === 'exploratory')).toBe(true);
    expect(pair.length).toBe(2);
    expect(typeof headers.requestIdVisible).toBe('boolean');
  });
});
