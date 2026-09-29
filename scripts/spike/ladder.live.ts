// Phase 39 paid ladder rungs 2 and 3 (SPIKE-01). Throwaway: deleted in the phase cleanup plan.
//   Rung 2: 10 scheduled GET /v1/models calls (must list claude-sonnet-5-5).
//   Rung 3: 30 small claude-sonnet-5-5 calls (effort low, max_tokens 256) through the scheduled procedure.
// Each rung gets at most one re-run; both attempts are recorded and the strict verdict counts both.
// The real key never appears here: the module reads it from private llm_config (stored by set-key.mjs).
import { afterAll, describe, expect, it } from 'vitest';

import { summarize } from '../../spacetimedb/src/helpers/measurement.ts';
import type { CallSample } from '../../spacetimedb/src/helpers/measurement_results';
import type { SpikeSpec } from '../../spacetimedb/src/spike/spike_bodies.ts';
import {
  budgetCheck,
  captureFailureDiagnostics,
  captureLogs,
  connectSpike,
  resetProbe,
  runRungWithRerun,
  runSequential,
  type Spike,
} from './harness.ts';
import { ResultsStore } from './results-store.ts';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const MODELS: SpikeSpec = { kind: 'models', class: 'reliability' };
const MINIMAL: SpikeSpec = { kind: 'messages', route: 'minimal', effort: 'low', class: 'reliability' };

function byClass(samples: CallSample[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of samples) {
    if (x.ok) continue;
    const k = x.failureClass ?? 'unclassified';
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function report(label: string, first: CallSample[], second: CallSample[] | null, all: CallSample[]): void {
  const call = all.map((x) => (x.callUs ?? 0) / 1000).filter((x) => x > 0);
  const e2e = all.map((x) => x.clientE2eMs).filter((x): x is number => typeof x === 'number');
  console.log(
    `${label}: attempt1 ${first.filter((x) => x.ok).length}/${first.length} ok` +
      (second ? `, rerun ${second.filter((x) => x.ok).length}/${second.length} ok` : ', no rerun') +
      ` | failures by class ${JSON.stringify(byClass(all))}`,
  );
  console.log(`${label} callMs ${JSON.stringify(summarize(call))} clientE2eMs ${JSON.stringify(summarize(e2e))}`);
}

describe('spike paid ladder rungs 2 and 3', () => {
  let s: Spike | undefined;
  afterAll(() => s?.close());

  it('runs 10 models calls and 30 small Sonnet 5.5 calls with one bounded re-run each', async () => {
    s = await connectSpike();
    const spike = s;
    const store = new ResultsStore();
    const tag = 'l' + Date.now().toString(36);
    let stopReason: string | null = null;

    await resetProbe(spike, false);

    // Rung 2: GET /v1/models x10.
    const r2 = await runRungWithRerun((attempt) =>
      runSequential(spike, { runIdPrefix: `${tag}-r2`, rung: 'ladder_models', spec: MODELS, n: 10, gapMs: 200, attempt, coldFirst: attempt === 1 }),
    );
    const prior = (store.get('ladder') as Record<string, unknown> | undefined) ?? {};
    store.set('ladder', { ...prior, models: r2.all });
    report('rung2 models', r2.first, r2.second, r2.all);
    const listedOk = r2.all.filter((x) => x.ok).length;
    console.log(`rung2 ok samples (modelListed true): ${listedOk}/${r2.all.length}`);

    // Rung 3: 30 small messages calls, budget check before every call, then at most one re-run.
    let completed: CallSample[] = [];
    const runMinimal = async (attempt: number): Promise<CallSample[]> => {
      const out: CallSample[] = [];
      for (let i = 0; i < 30; i++) {
        try {
          budgetCheck(store, MINIMAL);
        } catch (e) {
          stopReason = (e as Error).message;
          break;
        }
        const [one] = await runSequential(spike, {
          runIdPrefix: `${tag}-r3-${i}`,
          rung: 'ladder_minimal',
          spec: MINIMAL,
          n: 1,
          attempt,
          coldFirst: attempt === 1 && i === 0,
        });
        one.seq = i;
        out.push(one);
        // Persist progress so the budget check sees spend from this attempt.
        const cur = (store.get('ladder') as Record<string, unknown> | undefined) ?? {};
        store.set('ladder', { ...cur, reliability: [...completed, ...out] });
        if (one.failureClass === 'spend_cap') {
          stopReason = 'module spend cap tripped';
          break;
        }
        await sleep(250);
      }
      return out;
    };
    const r3 = await runRungWithRerun(async (attempt) => {
      if (attempt === 2 && stopReason) return [];
      const got = await runMinimal(attempt);
      completed = [...completed, ...got];
      return got;
    });
    const after = (store.get('ladder') as Record<string, unknown> | undefined) ?? {};
    store.set('ladder', { ...after, reliability: r3.all });
    report('rung3 minimal', r3.first, r3.second, r3.all);

    const notOk = [...r2.all, ...r3.all].filter((x) => !x.ok);
    if (notOk.length > 0) {
      const lines = captureFailureDiagnostics('ladder');
      const cur = (store.get('ladder') as Record<string, unknown> | undefined) ?? {};
      store.set('ladder', { ...cur, diagnostics: lines });
      const platform = notOk.filter((x) => x.failureClass === 'platform');
      console.log(`ladder failures: ${notOk.length} total, ${platform.length} platform-class`);
      for (const x of notOk.slice(0, 20)) {
        console.log(`  fail rung=${x.rung} seq=${x.seq} attempt=${x.attempt} class=${x.failureClass} status=${x.status} threw=${x.threw} type=${x.anthropicErrorType} msg=${x.errorMessage}`);
      }
    }
    store.append('serverLogs', [captureLogs('ladder', 200)]);
    console.log('estimated spend micro-USD (all recorded samples): ' + store.estimatedSpendMicroUsd());
    if (stopReason) console.log('STOPPED EARLY: ' + stopReason);

    expect(stopReason).toBeNull();
    expect(r2.all.length).toBeGreaterThanOrEqual(10);
    expect(r3.all.length).toBeGreaterThanOrEqual(30);
    expect(r2.all.every((x) => x.class === 'reliability' && typeof x.attempt === 'number')).toBe(true);
    expect(r3.all.every((x) => x.class === 'reliability' && typeof x.attempt === 'number')).toBe(true);
    expect(r3.all.filter((x) => x.ok).every((x) => x.stopReason === 'end_turn')).toBe(true);
  });
});
