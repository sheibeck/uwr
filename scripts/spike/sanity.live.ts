// Phase 39 maincloud sanity pair (SPIKE-02). Throwaway: deleted in the phase cleanup plan.
//   1. one region call at effort low (class exploratory): the region schema compile probe
//   2. one skill call at effort low (class reliability), with one bounded re-run
// The local run already proved the region schema compiles; a 400 here is reported as a finding and
// there is no staged fallback pair. Every paid call is preceded by budgetCheck.
// The real key never appears here: the module reads it from private llm_config.
import { afterAll, describe, expect, it } from 'vitest';

import type { CallSample } from '../../spacetimedb/src/helpers/measurement_results';
import type { SpikeSpec } from '../../spacetimedb/src/spike/spike_bodies.ts';
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

const REGION: SpikeSpec = { kind: 'messages', route: 'region', effort: 'low', class: 'exploratory' };
const SKILL: SpikeSpec = { kind: 'messages', route: 'skill', effort: 'low', class: 'reliability' };

function fill(x: CallSample, sp: SpikeSpec): CallSample {
  if (x.route === null) x.route = sp.route ?? null;
  if (x.effort === null) x.effort = sp.effort ?? null;
  return x;
}

const line = (label: string, x: CallSample) =>
  `${label}: status ${x.status} ok ${x.ok} stop ${x.stopReason} clientE2eMs ${x.clientE2eMs === null ? 'n/a' : Math.round(x.clientE2eMs)} ` +
  `callUs ${x.callUs ?? 'n/a'} class ${x.failureClass ?? 'none'}`;

describe('spike maincloud sanity pair (paid)', () => {
  let s: Spike | undefined;
  afterAll(() => s?.close());

  it('probes the region schema and runs one skill call', async () => {
    s = await connectSpike();
    const spike = s;
    const store = new ResultsStore();
    const tag = 'y' + Date.now().toString(36);
    let stopReason: string | null = null;

    await resetProbe(spike, false);

    const rawOf = (runId: string): Record<string, any> => {
      const entry = spike.results.get(runId)?.get(0);
      try {
        return entry ? JSON.parse(entry.row.dataJson) : {};
      } catch {
        return {};
      }
    };

    // ---- region compile probe ----
    const probes: CallSample[] = [];
    const probeOnce = async (attempt: number) => {
      try {
        budgetCheck(store, REGION);
      } catch (e) {
        stopReason = (e as Error).message;
        return null;
      }
      const [one] = await runSequential(spike, {
        runIdPrefix: `${tag}-region_compile-0`,
        rung: 'region_compile',
        spec: REGION,
        n: 1,
        attempt,
        coldFirst: attempt === 1,
      });
      one.seq = 0;
      fill(one, REGION);
      if (one.failureClass === 'spend_cap') stopReason = 'module spend cap tripped';
      probes.push(one);
      const raw = rawOf(`${tag}-region_compile-0-a${attempt}-0`);
      return { smp: one, parsedOk: raw.parsedOk === true, requiredKeysOk: raw.requiredKeysOk === true };
    };
    let probe = await probeOnce(1);
    if (probe && !stopReason && probe.smp.status !== 400 && !(probe.smp.status === 200 && probe.parsedOk && probe.requiredKeysOk)) {
      probe = await probeOnce(2); // one re-probe on a non-400 failure
    }
    const compiles = !!probe && probe.smp.status === 200 && probe.parsedOk && probe.requiredKeysOk;
    const errorMessage: string | null = probe && probe.smp.status === 400 ? probe.smp.errorMessage : null;
    store.set('structured', {
      regionCompile: { compiles, errorMessage, probes, staged: { attempted: false, compiles: false, errorMessages: [] } },
      cells: [],
      thinkingOff: [],
      thinkingOffComposable: null,
    });
    console.log(`region compile: compiles=${compiles} status=${probe?.smp.status ?? 'n/a'} parsedOk=${probe?.parsedOk} requiredKeysOk=${probe?.requiredKeysOk}`);
    if (errorMessage) console.log('region compile error (redacted, verbatim, a finding): ' + errorMessage);
    for (const [i, p] of probes.entries()) console.log(line('region probe ' + (i + 1), p));

    // ---- skill call (one bounded re-run) ----
    const cells: CallSample[] = [];
    if (!stopReason) {
      const rr = await runRungWithRerun(async (attempt) => {
        if (attempt === 2 && stopReason) return [];
        try {
          budgetCheck(store, SKILL);
        } catch (e) {
          stopReason = (e as Error).message;
          return [];
        }
        const [one] = await runSequential(spike, {
          runIdPrefix: `${tag}-struct_skill_low-0`,
          rung: 'struct_skill_low',
          spec: SKILL,
          n: 1,
          attempt,
          coldFirst: false,
        });
        one.seq = 0;
        fill(one, SKILL);
        if (one.failureClass === 'spend_cap') stopReason = 'module spend cap tripped';
        cells.push(one);
        store.set('structured.cells', cells);
        return [one];
      });
      for (const [i, c] of rr.all.entries()) console.log(line('skill call attempt ' + (i + 1), c));
    }
    store.set('structured.cells', cells);

    store.append('serverLogs', [captureLogs('sanity', 200)]);
    console.log('estimated spend micro-USD (all recorded samples): ' + store.estimatedSpendMicroUsd());
    if (stopReason) console.log('STOPPED EARLY: ' + stopReason);

    expect(stopReason).toBeNull();
    expect(probes.length).toBeGreaterThan(0);
    expect(typeof compiles).toBe('boolean');
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((c) => c.route === 'skill' && c.effort === 'low' && c.class === 'reliability')).toBe(true);
  });
});
