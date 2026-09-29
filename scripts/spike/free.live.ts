// Phase 39 zero-spend measurements: rung 1 (public URL), dispatch latency, ctx.sender findings,
// push-leg timings, forced-timeout and bad-key drills, response header visibility.
// Throwaway: deleted in the phase cleanup plan. Only free kinds are used here:
//   noop, public_url, and messages specs with keyMode 'bad' (the non-key BAD_KEY_VALUE).
import { afterAll, describe, expect, it } from 'vitest';

import { summarize } from '../../spacetimedb/src/helpers/measurement.ts';
import type { CallSample } from '../../spacetimedb/src/helpers/measurement_results';
import type { SpikeSpec } from '../../spacetimedb/src/spike/spike_bodies.ts';
import {
  captureLogs,
  connectSpike,
  directCall,
  enqueue,
  resetProbe,
  runRungWithRerun,
  runSequential,
  toCallSample,
  waitForResults,
  type Spike,
} from './harness.ts';
import { ResultsStore } from './results-store.ts';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const NOOP: SpikeSpec = { kind: 'noop', class: 'reliability' };
const PUBLIC_URL: SpikeSpec = { kind: 'public_url', class: 'reliability' };
const TIMEOUT_DRILL: SpikeSpec = { kind: 'messages', route: 'minimal', effort: 'low', keyMode: 'bad', timeoutMs: 50, class: 'drill' };
const BAD_KEY_DRILL: SpikeSpec = { kind: 'messages', route: 'minimal', effort: 'low', keyMode: 'bad', class: 'drill' };

function senderFacts(d: Record<string, any>, harnessHex: string): Record<string, unknown> {
  const senderHex = typeof d.senderHex === 'string' ? d.senderHex : '';
  const allZero = senderHex.length > 0 && /^0+$/.test(senderHex);
  return {
    senderHex,
    isModuleIdentity: d.isModuleIdentity === true,
    hasConnectionId: d.hasConnectionId === true,
    equalsHarnessIdentity: senderHex.length > 0 && senderHex === harnessHex,
    allZero,
    usable: senderHex.length > 0 && !allZero,
  };
}

function pick(s: Spike, runId: string, seq = 0): Record<string, any> {
  const row = s.results.get(runId)?.get(seq)?.row;
  try {
    return row ? JSON.parse(row.dataJson) : {};
  } catch {
    return {};
  }
}

describe('spike free measurements (no spend)', () => {
  let s: Spike | undefined;
  afterAll(() => s?.close());

  it('records rung 1, dispatch, sender, push legs, drills and headers', async () => {
    s = await connectSpike();
    const store = new ResultsStore();
    const tag = 'f' + Date.now().toString(36);

    // spike_state must exist for the procedure's first transaction; the probe stays off here.
    await resetProbe(s, false);

    // 1. Rung 1: 10 public-URL fetches, one allowed re-run when any first attempt failed.
    const r1 = await runRungWithRerun((attempt) =>
      runSequential(s!, { runIdPrefix: `${tag}-r1`, rung: 'ladder_public_url', spec: PUBLIC_URL, n: 10, gapMs: 200, attempt, coldFirst: attempt === 1 }),
    );
    const publicUrl = r1.all;
    const prior = (store.get('ladder') as Record<string, unknown> | undefined) ?? {};
    store.set('ladder', { ...prior, publicUrl });
    console.log(
      'rung1: ' + r1.first.filter((x) => x.ok).length + '/' + r1.first.length + ' ok on attempt 1' +
        (r1.second ? ', rerun ' + r1.second.filter((x) => x.ok).length + '/' + r1.second.length : ''),
    );
    console.log('rung1 statuses: ' + JSON.stringify(publicUrl.map((x) => x.status)) + ' callMs p50/p95: ' + JSON.stringify(summarize(publicUrl.map((x) => (x.callUs ?? 0) / 1000).filter((x) => x > 0))));

    // 2. Dispatch: 50 sequential no-ops measured alone, then one 8-job burst.
    const dispatchSamples = await runSequential(s, { runIdPrefix: `${tag}-dsp`, rung: 'dispatch_noop', spec: NOOP, n: 50, gapMs: 100 });
    const burstRunId = `${tag}-burst`;
    const burstT0 = await enqueue(s, { runId: burstRunId, rung: 'dispatch_burst', spec: NOOP, count: 8, seqStart: 0 });
    const burstRows = await waitForResults(s, burstRunId, 8, 30_000);
    const burst: CallSample[] = [];
    for (let i = 0; i < 8; i++) {
      const e = burstRows.find((x) => x.row.seq === i);
      burst.push(
        toCallSample(e?.row, { clientE2eMs: e ? e.arrivedMs - burstT0 : null, attempt: 1, cold: false, rung: 'dispatch_burst', seq: i, class: 'reliability' }),
      );
    }
    store.set('dispatch', { samples: dispatchSamples, burst });
    const noopE2e = dispatchSamples.map((x) => x.clientE2eMs).filter((x): x is number => typeof x === 'number');
    const pushLegs = { echoMs: [] as number[], noopProcedureE2eMs: noopE2e };
    store.set('pushLegs', pushLegs);
    const dispatchMs = dispatchSamples.map((x) => (x.dispatchLateUs ?? NaN) / 1000).filter((x) => Number.isFinite(x));
    const ctxMs = dispatchSamples.map((x) => (x.ctxLateUs ?? NaN) / 1000).filter((x) => Number.isFinite(x));
    console.log('dispatch late ms (first withTx - scheduledAt): ' + JSON.stringify(summarize(dispatchMs)));
    console.log('dispatch ctx late ms (cross-check): ' + JSON.stringify(summarize(ctxMs)));
    console.log('burst dispatch late ms: ' + JSON.stringify(burst.map((x) => (x.dispatchLateUs ?? NaN) / 1000)));
    console.log('noop procedure e2e ms: ' + JSON.stringify(summarize(noopE2e)));

    // 3. ctx.sender inside a scheduled procedure versus a client-called one.
    const scheduledData = pick(s, `${tag}-dsp-a1-0`);
    const scheduled = senderFacts(scheduledData, s.identityHex);
    const dc = await directCall(s, { kind: 'noop', class: 'exploratory' });
    const direct = senderFacts(dc.data, s.identityHex);
    store.set('sender', { scheduled, direct });
    console.log('sender.scheduled: ' + JSON.stringify(scheduled));
    console.log('sender.direct: ' + JSON.stringify(direct));

    // 4. Echo push leg: reducer call to the row insert callback, 50 sequential calls.
    for (let i = 0; i < 50; i++) {
      const runId = `${tag}-echo-${i}`;
      const t0 = performance.now();
      await s.conn.reducers.spikeEcho({ runId, nonce: i });
      const got = await waitForResults(s, runId, 1, 10_000);
      const e = got[0];
      if (e) pushLegs.echoMs.push(e.arrivedMs - t0);
      await sleep(20);
    }
    store.set('pushLegs', pushLegs);
    console.log('echo push leg ms: ' + JSON.stringify(summarize(pushLegs.echoMs)));

    // 5. Failure drills: 2 forced timeouts (50 ms) and 2 bad-key calls.
    const timeoutDrill = await runSequential(s, { runIdPrefix: `${tag}-dt`, rung: 'drill_timeout', spec: TIMEOUT_DRILL, n: 2, gapMs: 500 });
    const badKeyDrill = await runSequential(s, { runIdPrefix: `${tag}-db`, rung: 'drill_bad_key', spec: BAD_KEY_DRILL, n: 2, gapMs: 500 });
    store.set('drills', { timeout: timeoutDrill, badKey: badKeyDrill });
    for (const x of timeoutDrill) console.log('timeout drill: threw=' + x.threw + ' status=' + x.status + ' failureClass=' + x.failureClass + ' msg=' + x.errorMessage);
    for (const x of badKeyDrill) console.log('bad-key drill: status=' + x.status + ' type=' + x.anthropicErrorType + ' threw=' + x.threw + ' failureClass=' + x.failureClass + ' msg=' + x.errorMessage);

    // 6. Header visibility from the bad-key samples (real Anthropic responses).
    const names = [...new Set(badKeyDrill.flatMap((x) => x.headerNames ?? []))].sort();
    const headers = {
      requestIdVisible: badKeyDrill.some((x) => x.requestIdVisible === true),
      retryAfterVisible: badKeyDrill.some((x) => x.retryAfterVisible === true) ? (true as const) : ('not_observed' as const),
      headerNamesSeen: names,
    };
    store.set('headers', headers);
    console.log('headers: ' + JSON.stringify(headers));

    // 7. Server logs.
    store.append('serverLogs', [captureLogs('free', 200)]);

    // 8. Count assertions (failures are recorded, not asserted away).
    expect(publicUrl.length).toBeGreaterThanOrEqual(10);
    expect(dispatchSamples.length).toBe(50);
    expect(dispatchSamples.every((x) => typeof x.dispatchLateUs === 'number' && typeof x.ctxLateUs === 'number')).toBe(true);
    expect(burst.length).toBe(8);
    expect(burst.every((x) => x.callUs !== null)).toBe(true);
    expect(noopE2e.length).toBe(50);
    expect(pushLegs.echoMs.length).toBe(50);
    expect(timeoutDrill.length).toBe(2);
    expect(badKeyDrill.length).toBe(2);
    expect(timeoutDrill.every((x) => x.class === 'drill' && typeof x.threw === 'boolean')).toBe(true);
    expect(badKeyDrill.every((x) => x.class === 'drill' && (typeof x.status === 'number' || x.threw))).toBe(true);
    expect(typeof scheduled.senderHex).toBe('string');
    expect((scheduled.senderHex as string).length).toBeGreaterThan(0);
    expect((direct.senderHex as string).length).toBeGreaterThan(0);
  });
});
