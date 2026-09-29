// Phase 39 extras (SPIKE-02 also-captured). Throwaway: deleted in the phase cleanup plan.
//   1. #4954: does a client-called procedure block other messages on the same connection?
//   2. Publish survival: does an in-flight scheduled call survive a byte-different publish of uwr-spike?
// Every paid call is preceded by budgetCheck. The publish targets only local uwr-spike and never clears.
// The real key never appears here.
import { afterAll, describe, expect, it } from 'vitest';

import { summarize } from '../../spacetimedb/src/helpers/measurement.ts';
import type { CallSample } from '../../spacetimedb/src/helpers/measurement_results';
import type { SpikeSpec } from '../../spacetimedb/src/spike/spike_bodies.ts';
import { publishSpike } from './cli.mjs';
import {
  budgetCheck,
  captureLogs,
  connectSpike,
  directCall,
  enqueue,
  ping,
  resetProbe,
  toCallSample,
  type Spike,
} from './harness.ts';
import { ResultsStore } from './results-store.ts';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Bound a ping so a blocked connection cannot hang the run forever. */
async function boundedPing(s: Spike, nonce: number): Promise<number> {
  return Promise.race([
    ping(s, nonce),
    new Promise<number>((_, rej) => setTimeout(() => rej(new Error('ping timed out after 240 s')), 240_000)),
  ]);
}

describe('spike extras (paid, one region call each)', () => {
  const open: Spike[] = [];
  afterAll(() => {
    for (const c of open) c.close();
  });

  it('measures #4954 same-connection blocking and publish survival', async () => {
    const store = new ResultsStore();
    const tag = 'x' + Date.now().toString(36);
    const compiles = (store.get('structured.regionCompile.compiles') as boolean | undefined) === true;
    const regionRoute = compiles ? 'region' : 'region_core';
    const regionLow: SpikeSpec = { kind: 'messages', route: regionRoute, effort: 'low', class: 'exploratory' };
    const regionMedium: SpikeSpec = { kind: 'messages', route: regionRoute, effort: 'medium', class: 'exploratory' };

    const A = await connectSpike();
    open.push(A);
    const B = await connectSpike();
    open.push(B);
    await resetProbe(A, false);

    // ------------------------------------------------------------------ #4954
    budgetCheck(store, regionLow);
    let directDone = false;
    const direct = directCall(A, regionLow).finally(() => {
      directDone = true;
    });
    await sleep(1500); // let the procedure get going on the server

    const aPingMs: number[] = [];
    const bPingMs: number[] = [];
    const aLoop = (async () => {
      for (let i = 0; i < 20; i++) aPingMs.push(await boundedPing(A, i));
    })();
    const bLoop = (async () => {
      for (let i = 0; i < 20; i++) {
        bPingMs.push(await boundedPing(B, 1000 + i));
        await sleep(100);
      }
    })();
    await bLoop;
    const directStillPendingWhenBDone = !directDone;
    await aLoop;
    const dc = await direct;
    dc.sample.route ??= regionRoute;
    dc.sample.effort ??= 'low';
    const aSum = summarize(aPingMs);
    const bSum = summarize(bPingMs);
    const directCall4954 = {
      samples: [dc.sample],
      aPingMs,
      bPingMs,
      aP50: aSum?.p50 ?? 0,
      bP50: bSum?.p50 ?? 0,
      aMaxMs: aSum?.max ?? 0,
      bMaxMs: bSum?.max ?? 0,
      directCallMs: dc.ms,
      directStillPendingWhenBDone,
      blockedLikely: (aSum?.p50 ?? 0) > 10 * (bSum?.p50 ?? 0),
      blockedLikelyByMax: (aSum?.max ?? 0) > Math.max(1000, 10 * (bSum?.max ?? 0)),
      note: 'A carries the client-called procedure; B is an independent connection. blockedLikely is aP50 > 10 * bP50; blockedLikelyByMax also flags a single long stall on A.',
    };
    store.set('extras.directCall4954', directCall4954);
    console.log('4954: ' + JSON.stringify({ ...directCall4954, aPingMs: undefined, bPingMs: undefined, samples: undefined }));

    // ------------------------------------------------------------------ publish survival
    const C = await connectSpike();
    open.push(C);
    const runId = `${tag}-survive`;
    budgetCheck(store, regionMedium);
    const enqueuedAt = performance.now();
    await enqueue(C, { runId, rung: 'publish_survival', spec: regionMedium });
    await sleep(3000);

    const pubStart = performance.now();
    const pub = publishSpike();
    const publishMs = performance.now() - pubStart;
    const publishText = ((pub.stdout ?? '') + '\n' + (pub.stderr ?? '')).trim();
    const clearRequested = /clear|would delete|destroy|data loss/i.test(publishText) && pub.status !== 0;
    const publishOk = pub.status === 0;
    console.log('publish status ' + pub.status + ' ms ' + Math.round(publishMs) + ' clearRequested ' + clearRequested);

    // Reconnect (the module update usually drops connections) and look in both places for the row.
    let C2: Spike | undefined;
    try {
      C2 = await connectSpike(60_000);
      open.push(C2);
    } catch (e) {
      console.log('reconnect failed: ' + (e as Error).message);
    }
    const findRow = () => {
      const old = C.results.get(runId)?.get(0)?.row;
      if (old) return old;
      if (C2) {
        for (const r of C2.conn.db.spikeResult.iter() as Iterable<any>) {
          if (r.runId === runId) return r;
        }
        const via = C2.results.get(runId)?.get(0)?.row;
        if (via) return via;
      }
      return undefined;
    };
    const waitStart = performance.now();
    let row = findRow();
    while (!row && performance.now() - waitStart < 200_000) {
      await sleep(1000);
      row = findRow();
    }
    const waitedMs = performance.now() - waitStart;
    const sample: CallSample = toCallSample(row, {
      clientE2eMs: row ? performance.now() - enqueuedAt : null,
      attempt: 1,
      cold: false,
      rung: 'publish_survival',
      seq: 0,
      class: 'exploratory',
    });
    sample.route ??= regionRoute;
    sample.effort ??= 'medium';
    let resultBuildTag: string | null = null;
    try {
      resultBuildTag = row ? (JSON.parse(row.dataJson).buildTag ?? null) : null;
    } catch {
      resultBuildTag = null;
    }
    const logs = captureLogs('publish_survival', 120);
    store.append('serverLogs', [logs]);
    const publishSurvival = {
      samples: [sample],
      resultArrived: !!row,
      resultBuildTag,
      publishOk,
      clearRequested,
      publishMs,
      waitedMs,
      originalConnectionSawRow: !!C.results.get(runId)?.get(0),
      reconnected: !!C2,
      publishOutputTail: publishText.slice(-400),
      logLines: logs.lines,
    };
    store.set('extras.publishSurvival', publishSurvival);
    console.log('publishSurvival: ' + JSON.stringify({ ...publishSurvival, samples: undefined, logLines: publishSurvival.logLines.length }));

    // ------------------------------------------------------------------ build tags, reset
    store.set('environment.buildTags', ['a', 'b']);
    let resetter: Spike | undefined = C2;
    if (!resetter) {
      resetter = await connectSpike(60_000);
      open.push(resetter);
    }
    await resetProbe(resetter, false);

    expect(typeof directCall4954.aP50).toBe('number');
    expect(typeof directCall4954.bP50).toBe('number');
    expect(aPingMs.length).toBe(20);
    expect(bPingMs.length).toBe(20);
    expect(typeof directCall4954.blockedLikely).toBe('boolean');
    expect(typeof publishSurvival.resultArrived).toBe('boolean');
    expect(typeof publishSurvival.publishMs).toBe('number');
    expect(Array.isArray(publishSurvival.logLines)).toBe(true);
    expect(clearRequested).toBe(false);
  });
});
