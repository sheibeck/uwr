import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateGate,
  findSecretLeaks,
  GATE_DEFAULTS,
  percentile,
  type GateInput,
  type GateThresholds,
} from './measurement';
import {
  collectCallSamples,
  effectiveInFlight,
  floorAdjustedNoiseFloorMs,
  gateInputFromResults,
  levelLabels,
  measuredNoiseDriftMs,
  minInFlightForLevel,
  observedServerCap,
  validateResults,
  type CallSample,
  type LatencyWindow,
  type ResultsDoc,
  type ResultsProfile,
} from './measurement_results';

// ============================================================================
// Fixture builder: a complete synthetic results document
// ============================================================================

function sample(over: Partial<CallSample> = {}): CallSample {
  return {
    rung: 'r',
    seq: 0,
    attempt: 1,
    class: 'reliability',
    ok: true,
    failureClass: null,
    status: 200,
    threw: false,
    errorMessage: null,
    anthropicErrorType: null,
    stopReason: 'end_turn',
    route: null,
    effort: null,
    cold: false,
    dispatchLateUs: null,
    ctxLateUs: null,
    callUs: 1000,
    clientE2eMs: 500,
    inFlightAtStart: null,
    usage: { input: 100, output: 50, cacheWrite: 0, cacheRead: 0 },
    estCostMicroUsd: 700,
    headerNames: null,
    requestIdVisible: null,
    retryAfterVisible: null,
    ...over,
  };
}

const many = (n: number, over: Partial<CallSample> = {}) =>
  Array.from({ length: n }, (_, i) => sample({ seq: i, ...over }));

/** Ping/tick window whose values cycle through base, base+1, base+2. */
function window(label: string, inFlight: number, pingBase: number, tickBase: number, pings: number, ticks: number): LatencyWindow {
  return {
    label,
    serverPid: 1234,
    pingMs: Array.from({ length: pings }, (_, i) => ({ ms: pingBase + (i % 3), inFlight })),
    tick: Array.from({ length: ticks }, (_, i) => ({ lateMs: tickBase + (i % 3), inFlight })),
  };
}

function cells(route: string, perEffort: number): CallSample[] {
  return (['low', 'medium'] as const).flatMap((effort) =>
    many(perEffort, { class: 'exploratory', route, effort }),
  );
}

function makeFixture(): ResultsDoc {
  return {
    schemaVersion: 1,
    environment: {
      spacetime: '2.10.1',
      sdk: '2.10.1',
      node: 'v22',
      os: 'win32',
      model: 'test-model',
      buildTags: ['a', 'b'],
      serverPid: 1234,
      cliSenderMatchesGate: true,
      startedAt: '2026-09-29T00:00:00Z',
    },
    hop: { mode: 'stub', samplesMs: Array.from({ length: 20 }, () => 5), warmups: 3, notes: 'n' },
    canary: { hits: 0, locationsScanned: 4, fetchReachedAnthropic: true, statusSeen: 401 },
    ladder: {
      publicUrl: many(10, { class: 'exploratory' }),
      models: many(10, { class: 'exploratory' }),
      reliability: many(30),
      diagnostics: [],
    },
    drills: {
      timeout: many(2, { class: 'drill', ok: false, failureClass: 'platform' }),
      badKey: many(2, { class: 'drill', ok: false, failureClass: 'auth', status: 401 }),
    },
    dispatch: {
      samples: many(50, { class: 'exploratory', dispatchLateUs: 40_000 }),
      burst: many(3, { class: 'exploratory', dispatchLateUs: 60_000 }),
    },
    sender: { scheduled: { usable: true }, direct: { usable: true } },
    pushLegs: { echoMs: [1, 2], noopProcedureE2eMs: [3, 4] },
    structured: {
      regionCompile: {
        compiles: true,
        errorMessage: null,
        probes: many(2, { class: 'exploratory' }),
        staged: { attempted: false, compiles: false, errorMessages: [] },
      },
      cells: [...cells('skill', 5), ...cells('region', 5)],
      thinkingOff: many(3, { class: 'exploratory' }),
      thinkingOffComposable: true,
    },
    headers: { requestIdVisible: true, retryAfterVisible: 'not_observed', headerNamesSeen: ['request-id'] },
    cache: { pair: many(2, { class: 'exploratory' }), cacheReadObserved: true },
    extras: {
      directCall4954: { samples: many(2, { class: 'exploratory' }) },
      publishSurvival: { samples: many(2, { class: 'exploratory' }) },
    },
    load: {
      baseline: window('baseline', 0, 2, 1, 1200, 60),
      baselineEarly: window('baselineEarly', 0, 2, 1, 1200, 60),
      levels: [
        {
          inFlight: 8,
          calls: many(24, { class: 'exploratory' }),
          window: window('load8', 8, 3, 2, 1200, 40),
          extended: false,
        },
      ],
      baseline2: window('baseline2', 0, 2, 1, 1200, 60),
      memory: [{ label: 'baseline', pid: 1234, workingSetMb: 200, threads: 30, at: '2026-09-29T00:00:00Z' }],
    },
    serverLogs: [{ label: 'run', lines: ['ok'] }],
    verdict: undefined,
  };
}

/** The fixture with a verdict block computed from its own raw samples. */
function makeFinalFixture(): ResultsDoc {
  const doc = makeFixture();
  const strict = evaluateGate(gateInputFromResults(doc));
  const noiseFloorMs = floorAdjustedNoiseFloorMs(doc);
  const floorAdjusted = evaluateGate(gateInputFromResults(doc, { noiseFloorMs }));
  doc.verdict = { strict, floorAdjusted, noiseFloorMs, computedAt: '2026-09-29T01:00:00Z' };
  return doc;
}

// ============================================================================
// minInFlightForLevel / collectCallSamples
// ============================================================================

describe('results model: minInFlightForLevel', () => {
  it('maps level to the minimum in-flight count of a counted sample', () => {
    expect(minInFlightForLevel(8)).toBe(6);
    expect(minInFlightForLevel(4)).toBe(3);
    expect(minInFlightForLevel(2)).toBe(2);
  });

  it('never goes below 2', () => {
    expect(minInFlightForLevel(1)).toBe(2);
  });
});

describe('results model: collectCallSamples', () => {
  it('walks every section that holds paid or measured calls', () => {
    const doc = makeFixture();
    // 10 + 10 + 30 ladder, 4 drills, 50 + 3 dispatch, 10 + 10 cells, 3 thinking-off,
    // 2 probes, 2 cache, 2 + 2 extras, 24 load calls
    expect(collectCallSamples(doc).length).toBe(10 + 10 + 30 + 4 + 53 + 20 + 3 + 2 + 2 + 4 + 24);
  });

  it('returns an empty list for an empty document', () => {
    expect(collectCallSamples({ schemaVersion: 1 })).toEqual([]);
  });

  it('includes calls from any extras entry that has samples', () => {
    const doc = makeFixture();
    doc.extras = { ...doc.extras, directCall4954: { samples: many(5) } };
    const before = collectCallSamples(makeFixture()).length;
    expect(collectCallSamples(doc).length).toBe(before + 3);
  });
});

// ============================================================================
// gateInputFromResults
// ============================================================================

describe('results model: gateInputFromResults', () => {
  it('counts reliability over class reliability samples only', () => {
    const doc = makeFixture();
    const input = gateInputFromResults(doc);
    expect(input.reliability.calls).toBe(30);
    expect(input.reliability.failures).toBe(0);
  });

  it('drills and exploratory failures never count', () => {
    const doc = makeFixture();
    doc.ladder!.publicUrl.push(sample({ class: 'exploratory', ok: false, failureClass: 'platform' }));
    doc.structured!.thinkingOff.push(sample({ class: 'exploratory', ok: false, failureClass: 'request', status: 400 }));
    const input = gateInputFromResults(doc);
    expect(input.reliability.calls).toBe(30);
    expect(input.reliability.failures).toBe(0);
  });

  it('counts platform and upstream failures separately, every attempt included', () => {
    const doc = makeFixture();
    doc.ladder!.reliability.push(
      sample({ ok: false, failureClass: 'upstream', status: 529 }),
      sample({ ok: false, failureClass: 'upstream', status: 529, attempt: 2 }),
      sample({ ok: false, failureClass: 'platform', threw: true, status: null }),
    );
    const input = gateInputFromResults(doc);
    expect(input.reliability.calls).toBe(33);
    expect(input.reliability.failures).toBe(3);
    expect(input.reliability.upstreamFailures).toBe(2);
    expect(input.reliability.platformFailures).toBe(1);
  });

  it('upstream-only failures reach the gate as a flag and still fail it', () => {
    const doc = makeFixture();
    doc.ladder!.reliability.push(sample({ ok: false, failureClass: 'upstream', status: 529 }));
    const result = evaluateGate(gateInputFromResults(doc));
    expect(result.verdict).toBe('no_go');
    expect(result.flags).toContain('upstream_only_failures');
  });

  it('spend_cap samples are counted as capBlocked and left out of calls', () => {
    const doc = makeFixture();
    doc.ladder!.reliability.push(sample({ ok: false, failureClass: 'spend_cap', status: null }));
    const input = gateInputFromResults(doc);
    expect(input.reliability.calls).toBe(30);
    expect(input.reliability.failures).toBe(0);
    expect(input.reliability.capBlocked).toBe(1);
  });

  it('the 30-call minimum counts ladder.reliability only, not other reliability-class samples', () => {
    const doc = makeFixture();
    doc.ladder!.reliability = many(25);
    doc.ladder!.publicUrl = many(10); // class reliability, must not count toward the minimum
    doc.dispatch!.samples = many(50, { dispatchLateUs: 40_000 });
    doc.structured!.cells = [...cells('skill', 5), ...cells('region', 5)].map((s) => ({
      ...s,
      class: 'reliability' as const,
    }));
    const input = gateInputFromResults(doc);
    expect(input.reliability.calls).toBe(25);
    expect(input.reliability.totalCalls).toBe(25 + 10 + 50 + 20);
    const r = evaluateGate(input);
    expect(r.verdict).toBe('incomplete');
    expect(String(r.checks.find((c) => c.name === 'samples')?.measured)).toContain('reliability 25/30');
  });

  it('every non-drill reliability-class call still has to succeed, wherever it ran', () => {
    const doc = makeFixture();
    doc.load!.levels[0].calls = many(24, { class: 'reliability' });
    doc.load!.levels[0].calls[3] = sample({ ok: false, failureClass: 'upstream', status: 529 });
    const input = gateInputFromResults(doc);
    expect(input.reliability.calls).toBe(30);
    expect(input.reliability.totalCalls).toBe(54);
    expect(input.reliability.failures).toBe(1);
    const r = evaluateGate(input);
    expect(r.verdict).toBe('no_go');
    expect(r.checks.find((c) => c.name === 'reliability')?.measured).toBe('1/54 failed');
  });

  it('drill calls stay out of both counts', () => {
    const input = gateInputFromResults(makeFixture());
    expect(input.reliability.calls).toBe(30);
    expect(input.reliability.totalCalls).toBe(30);
  });

  it('computes dispatch p95 in ms from dispatchLateUs of dispatch.samples only', () => {
    const doc = makeFixture();
    const input = gateInputFromResults(doc);
    expect(input.dispatch.samples).toBe(50);
    expect(input.dispatch.p95Ms).toBe(40); // 40_000 us
    // burst samples are not part of the gate
    expect(gateInputFromResults(doc).dispatch.samples).toBe(50);
  });

  it('dispatch p95 is null with no samples', () => {
    const doc = makeFixture();
    doc.dispatch!.samples = [];
    expect(gateInputFromResults(doc).dispatch).toEqual({ p95Ms: null, samples: 0 });
  });

  it('baseline uses only samples with inFlight 0', () => {
    const doc = makeFixture();
    doc.load!.baseline!.pingMs.push({ ms: 999, inFlight: 3 });
    doc.load!.baseline!.tick.push({ lateMs: 999, inFlight: 3 });
    const { baseline } = gateInputFromResults(doc);
    expect(baseline.pingSamples).toBe(1200);
    expect(baseline.tickSamples).toBe(60);
    expect(baseline.pingP95Ms).toBe(4); // values cycle 2,3,4
  });

  it('each load level uses only samples at or above its minimum in flight', () => {
    const doc = makeFixture();
    const w = doc.load!.levels[0].window;
    w.pingMs.push({ ms: 999, inFlight: 5 }, { ms: 5, inFlight: 6 });
    w.tick.push({ lateMs: 999, inFlight: 0 });
    const level = gateInputFromResults(doc).loads[0];
    expect(level.inFlight).toBe(8);
    expect(level.pingSamples).toBe(1201); // the inFlight 6 sample counts, 5 does not
    expect(level.tickSamples).toBe(40);
    expect(level.pingP95Ms).toBeLessThan(999);
  });

  it('takes regionSchema from structured.regionCompile', () => {
    const doc = makeFixture();
    expect(gateInputFromResults(doc).regionSchema).toEqual({ compiles: true, stagedWorkaroundDocumented: false });
    doc.structured!.regionCompile.compiles = false;
    doc.structured!.regionCompile.staged = { attempted: true, compiles: true, errorMessages: [] };
    expect(gateInputFromResults(doc).regionSchema).toEqual({ compiles: false, stagedWorkaroundDocumented: true });
  });

  it('a complete healthy fixture evaluates to go with a null cap', () => {
    const r = evaluateGate(gateInputFromResults(makeFixture()));
    expect(r.verdict).toBe('go');
    expect(r.cap).toBeNull();
  });

  it('a missing load section yields incomplete, never go', () => {
    const doc = makeFixture();
    delete doc.load;
    expect(evaluateGate(gateInputFromResults(doc)).verdict).toBe('incomplete');
  });

  it('passes threshold overrides through', () => {
    const input = gateInputFromResults(makeFixture(), { noiseFloorMs: 25 });
    expect(input.thresholds?.noiseFloorMs).toBe(25);
    expect(GATE_DEFAULTS.noiseFloorMs).toBe(0);
  });
});

// ============================================================================
// noise drift
// ============================================================================

// ============================================================================
// effective concurrency (server-side cap) and tick filtering
// ============================================================================

/** Ping label = client outstanding count; tick label = server in-flight count. */
function splitWindow(
  label: string,
  pingInFlight: number,
  tickInFlight: number,
  pings: number,
  ticks: number,
): LatencyWindow {
  return {
    label,
    serverPid: 1234,
    pingMs: Array.from({ length: pings }, (_, i) => ({ ms: 3 + (i % 3), inFlight: pingInFlight })),
    tick: Array.from({ length: ticks }, (_, i) => ({ lateMs: 2 + (i % 3), inFlight: tickInFlight })),
  };
}

describe('results model: effective concurrency', () => {
  it('observedServerCap is the highest server in-flight label over all load tick samples', () => {
    const doc = makeFixture();
    expect(observedServerCap(doc)).toBe(8);
    doc.load!.levels = [
      { inFlight: 8, calls: [], window: splitWindow('l8', 8, 4, 500, 140), extended: true },
      { inFlight: 2, calls: [], window: splitWindow('l2', 2, 2, 240, 68), extended: true },
    ];
    expect(observedServerCap(doc)).toBe(4);
  });

  it('observedServerCap is null with no load levels or no tick samples', () => {
    const doc = makeFixture();
    doc.load!.levels = [];
    expect(observedServerCap(doc)).toBeNull();
    delete doc.load;
    expect(observedServerCap(doc)).toBeNull();
    const doc2 = makeFixture();
    doc2.load!.levels[0].window.tick = [];
    expect(observedServerCap(doc2)).toBeNull();
  });

  it('effectiveInFlight is min(level, cap), and the level itself when the cap is unknown or not positive', () => {
    expect(effectiveInFlight(8, 4)).toBe(4);
    expect(effectiveInFlight(4, 4)).toBe(4);
    expect(effectiveInFlight(2, 4)).toBe(2);
    expect(effectiveInFlight(8, 8)).toBe(8);
    expect(effectiveInFlight(8, null)).toBe(8);
    expect(effectiveInFlight(8, 0)).toBe(8);
  });

  it('level 8 with a server cap of 4 filters ticks at server in-flight >= 3 and pings at client outstanding >= 6', () => {
    const doc = makeFixture();
    const w = splitWindow('l8', 8, 4, 500, 138);
    w.tick.push(
      { lateMs: 9, inFlight: 3 },
      { lateMs: 9, inFlight: 3 },
      { lateMs: 500, inFlight: 2 },
      { lateMs: 500, inFlight: 0 },
    );
    w.pingMs.push({ ms: 900, inFlight: 5 });
    doc.load!.levels = [{ inFlight: 8, calls: [], window: w, extended: true }];
    const level = gateInputFromResults(doc).loads[0];
    expect(level.inFlight).toBe(8);
    expect(level.tickSamples).toBe(140); // 138 at 4 plus 2 at 3; the samples at 2 and 0 are excluded
    expect(level.pingSamples).toBe(500); // the outstanding-5 ping is excluded
    expect(level.effectiveInFlight).toBe(4);
    expect(level.tickLateP95Ms).toBeLessThan(500);
  });

  it('with no cap effect the level uses its own minimum (unchanged behaviour)', () => {
    const doc = makeFixture(); // ticks labelled 8, so the cap is 8
    const level = gateInputFromResults(doc).loads[0];
    expect(level.effectiveInFlight).toBe(8);
    expect(level.tickSamples).toBe(40);
  });

  it('level 4 and level 2 are not relaxed by a cap of 4', () => {
    const doc = makeFixture();
    doc.load!.levels = [
      { inFlight: 8, calls: [], window: splitWindow('l8', 8, 4, 500, 140), extended: true },
      { inFlight: 4, calls: [], window: splitWindow('l4', 4, 4, 200, 60), extended: true },
      { inFlight: 2, calls: [], window: splitWindow('l2', 2, 2, 240, 68), extended: true },
    ];
    const loads = gateInputFromResults(doc).loads;
    expect(loads.map((l) => l.effectiveInFlight)).toEqual([4, 4, 2]);
    expect(loads[1].tickSamples).toBe(60);
    expect(loads[2].tickSamples).toBe(68);
  });

  it('a level-8 window with ticks only at server in-flight 4 is evaluated instead of empty', () => {
    const doc = makeFixture();
    doc.load!.levels = [{ inFlight: 8, calls: [], window: splitWindow('l8', 8, 4, 500, 140), extended: true }];
    const r = evaluateGate(gateInputFromResults(doc));
    expect(r.checks.find((c) => c.name === 'tick_p95@8')?.measured).not.toBeNull();
    expect(r.checks.find((c) => c.name === 'samples')?.pass).toBe(true);
  });

  it('thresholds are untouched: a tick p95 at 2x baseline still fails strictly', () => {
    const doc = makeFixture(); // baseline tick p95 3
    const w = splitWindow('l8', 8, 4, 500, 140);
    w.tick = Array.from({ length: 140 }, () => ({ lateMs: 6, inFlight: 4 }));
    doc.load!.levels = [{ inFlight: 8, calls: [], window: w, extended: true }];
    const r = evaluateGate(gateInputFromResults(doc));
    expect(r.checks.find((c) => c.name === 'tick_p95@8')?.pass).toBe(false); // 6 is not < 2 * 3
  });

  it('levelLabels records both label meanings per level', () => {
    const doc = makeFixture();
    doc.load!.levels = [
      { inFlight: 8, calls: [], window: splitWindow('l8', 8, 4, 500, 140), extended: true },
      { inFlight: 2, calls: [], window: splitWindow('l2', 2, 2, 240, 68), extended: true },
    ];
    expect(levelLabels(doc)).toEqual([
      {
        level: 8,
        effectiveInFlight: 4,
        observedServerCap: 4,
        pingLabel: 'client_outstanding',
        pingMin: 6,
        pingSamples: 500,
        tickLabel: 'server_in_flight',
        tickMin: 3,
        tickSamples: 140,
      },
      {
        level: 2,
        effectiveInFlight: 2,
        observedServerCap: 4,
        pingLabel: 'client_outstanding',
        pingMin: 2,
        pingSamples: 240,
        tickLabel: 'server_in_flight',
        tickMin: 2,
        tickSamples: 68,
      },
    ]);
  });
});

describe('results model: noise drift', () => {
  it('is null when baseline or baseline2 is missing', () => {
    const doc = makeFixture();
    delete doc.load!.baseline2;
    expect(measuredNoiseDriftMs(doc)).toBeNull();
    const doc2 = makeFixture();
    delete doc2.load!.baseline;
    expect(measuredNoiseDriftMs(doc2)).toBeNull();
  });

  it('is 0 for identical baselines and the floor is 25', () => {
    const doc = makeFixture();
    expect(measuredNoiseDriftMs(doc)).toBe(0);
    expect(floorAdjustedNoiseFloorMs(doc)).toBe(25);
  });

  it('takes the largest absolute p95 difference over ping and tick', () => {
    const doc = makeFixture();
    doc.load!.baseline2 = window('baseline2', 0, 42, 3, 1200, 60); // ping p95 44 vs 4, tick p95 5 vs 3
    expect(measuredNoiseDriftMs(doc)).toBe(40);
    expect(floorAdjustedNoiseFloorMs(doc)).toBe(40);
  });

  it('ignores stray non-zero in-flight samples in either baseline, like the gate baseline does', () => {
    const doc = makeFixture();
    const before = measuredNoiseDriftMs(doc);
    // Enough outliers (well over 5% of each window) to move a p95 if they were counted.
    for (let i = 0; i < 300; i++) doc.load!.baseline2!.pingMs.push({ ms: 900, inFlight: 3 });
    for (let i = 0; i < 30; i++) doc.load!.baseline2!.tick.push({ lateMs: 900, inFlight: 3 });
    for (let i = 0; i < 300; i++) doc.load!.baseline!.pingMs.push({ ms: 700, inFlight: 2 });
    expect(measuredNoiseDriftMs(doc)).toBe(before);
    expect(floorAdjustedNoiseFloorMs(doc)).toBe(25);
  });

  it('floor falls back to 25 when drift is missing', () => {
    const doc = makeFixture();
    delete doc.load!.baseline2;
    expect(floorAdjustedNoiseFloorMs(doc)).toBe(25);
  });
});

// ============================================================================
// validateResults
// ============================================================================

describe('results model: validateResults', () => {
  it('accepts a complete fixture as final', () => {
    expect(validateResults(makeFinalFixture(), { final: true })).toEqual([]);
  });

  it('accepts a complete fixture as partial', () => {
    expect(validateResults(makeFixture(), { final: false })).toEqual([]);
  });

  it('rejects non-objects and a wrong schemaVersion', () => {
    expect(validateResults(null, { final: false }).length).toBeGreaterThan(0);
    expect(validateResults('x', { final: true }).length).toBeGreaterThan(0);
    expect(validateResults({ schemaVersion: 2 }, { final: false }).length).toBeGreaterThan(0);
  });

  const requiredSections: [string, (d: ResultsDoc) => void][] = [
    ['environment', (d) => delete d.environment],
    ['hop', (d) => delete d.hop],
    ['canary', (d) => delete d.canary],
    ['ladder', (d) => delete d.ladder],
    ['drills', (d) => delete d.drills],
    ['dispatch', (d) => delete d.dispatch],
    ['sender', (d) => delete d.sender],
    ['pushLegs', (d) => delete d.pushLegs],
    ['structured', (d) => delete d.structured],
    ['headers', (d) => delete d.headers],
    ['cache', (d) => delete d.cache],
    ['extras', (d) => delete d.extras],
    ['extras.directCall4954', (d) => delete d.extras!.directCall4954],
    ['extras.publishSurvival', (d) => delete d.extras!.publishSurvival],
    ['load', (d) => delete d.load],
    ['load.baseline', (d) => delete d.load!.baseline],
    ['load.baseline2', (d) => delete d.load!.baseline2],
    ['serverLogs', (d) => delete d.serverLogs],
    ['verdict', (d) => delete d.verdict],
    ['sender.direct', (d) => delete (d.sender as Record<string, unknown>).direct],
  ];
  for (const [name, remove] of requiredSections) {
    it(`final: removing ${name} yields a problem`, () => {
      const doc = makeFinalFixture();
      remove(doc);
      expect(validateResults(doc, { final: true }).length).toBeGreaterThan(0);
    });
  }

  const minimums: [string, (d: ResultsDoc) => void][] = [
    ['ladder.publicUrl 9', (d) => d.ladder!.publicUrl.pop()],
    ['ladder.models 9', (d) => d.ladder!.models.pop()],
    ['ladder.reliability 29', (d) => d.ladder!.reliability.pop()],
    ['drills.timeout 1', (d) => d.drills!.timeout.pop()],
    ['drills.badKey 1', (d) => d.drills!.badKey.pop()],
    ['dispatch.samples 49', (d) => d.dispatch!.samples.pop()],
    ['hop.samplesMs 19', (d) => d.hop!.samplesMs.pop()],
    ['structured.thinkingOff 2', (d) => d.structured!.thinkingOff.pop()],
    ['cache.pair 1', (d) => d.cache!.pair.pop()],
    ['skill low cell 4', (d) => d.structured!.cells.splice(d.structured!.cells.findIndex((c) => c.route === 'skill' && c.effort === 'low'), 1)],
    ['region medium cell 4', (d) => d.structured!.cells.splice(d.structured!.cells.findIndex((c) => c.route === 'region' && c.effort === 'medium'), 1)],
    ['no level with inFlight 8', (d) => (d.load!.levels[0].inFlight = 4)],
    ['empty serverLogs', (d) => (d.serverLogs = [])],
  ];
  for (const [name, mutate] of minimums) {
    it(`final: below the minimum (${name}) yields a problem`, () => {
      const doc = makeFinalFixture();
      mutate(doc);
      expect(validateResults(doc, { final: true }).length).toBeGreaterThan(0);
    });
  }

  it('final: a staged region pair satisfies the region cell requirement', () => {
    const doc = makeFinalFixture();
    doc.structured!.cells = [...cells('skill', 5), ...cells('region_stage1', 5), ...cells('region_stage2', 5)];
    expect(validateResults(doc, { final: true })).toEqual([]);
  });

  it('a canary hit above 0 is a problem in both modes', () => {
    const doc = makeFinalFixture();
    doc.canary!.hits = 1;
    expect(validateResults(doc, { final: true }).length).toBeGreaterThan(0);
    expect(validateResults(doc, { final: false }).length).toBeGreaterThan(0);
  });

  it('partial: missing sections and partly filled sections are allowed', () => {
    expect(validateResults({ schemaVersion: 1 }, { final: false })).toEqual([]);
    expect(validateResults({ schemaVersion: 1, ladder: { diagnostics: ['x'] } }, { final: false })).toEqual([]);
    expect(validateResults({ schemaVersion: 1, canary: { hits: 0 } }, { final: false })).toEqual([]);
  });

  it('partial: a present field with the wrong type is still a problem', () => {
    expect(validateResults({ schemaVersion: 1, ladder: { reliability: 'x' } }, { final: false }).length).toBeGreaterThan(0);
    expect(validateResults({ schemaVersion: 1, ladder: { reliability: [{ nope: 1 }] } }, { final: false }).length).toBeGreaterThan(0);
  });

  it('final: an empty document lists many problems', () => {
    expect(validateResults({ schemaVersion: 1 }, { final: true }).length).toBeGreaterThan(10);
  });
});

// ============================================================================
// validateResults: gate profile (hosted-database results file)
// ============================================================================

/** Only the sections the gate reads: no hop, canary, drills, push legs, headers, cache or extras. */
function makeGateFixture(): ResultsDoc {
  const doc = makeFixture();
  delete doc.hop;
  delete doc.canary;
  delete doc.drills;
  delete doc.pushLegs;
  delete doc.headers;
  delete doc.cache;
  delete doc.extras;
  delete doc.load!.baselineEarly;
  doc.environment!.serverPid = null;
  doc.structured = {
    regionCompile: {
      compiles: true,
      errorMessage: null,
      probes: many(1, { class: 'exploratory', route: 'region', effort: 'low' }),
      staged: { attempted: false, compiles: false, errorMessages: [] },
    },
    cells: many(1, { class: 'reliability', route: 'skill', effort: 'low' }),
    thinkingOff: [],
    thinkingOffComposable: null,
  };
  doc.load!.levels = [8, 4, 2].map((n) => ({
    inFlight: n,
    calls: many(6, { class: 'exploratory' }),
    window: window('load' + n, n, 3, 2, 1200, 40),
    extended: false,
  }));
  doc.load!.memory = [];
  doc.load!.memoryNote = 'unavailable: no host process access';
  return doc;
}

function makeGateFinalFixture(): ResultsDoc {
  const doc = makeGateFixture();
  const strict = evaluateGate(gateInputFromResults(doc));
  const noiseFloorMs = floorAdjustedNoiseFloorMs(doc);
  const floorAdjusted = evaluateGate(gateInputFromResults(doc, { noiseFloorMs }));
  doc.verdict = { strict, floorAdjusted, noiseFloorMs, computedAt: '2026-09-29T01:00:00Z' };
  return doc;
}

describe('results model: validateResults gate profile', () => {
  it('accepts a gate-only final document under the gate profile', () => {
    expect(validateResults(makeGateFinalFixture(), { final: true, profile: 'gate' })).toEqual([]);
  });

  it('accepts the same document as partial under the gate profile', () => {
    expect(validateResults(makeGateFixture(), { final: false, profile: 'gate' })).toEqual([]);
  });

  it('the same document has problems under the default (full) profile', () => {
    expect(validateResults(makeGateFinalFixture(), { final: true }).length).toBeGreaterThan(0);
    expect(validateResults(makeGateFinalFixture(), { final: true, profile: 'full' }).length).toBeGreaterThan(0);
  });

  it('a full fixture is also valid under the gate profile', () => {
    expect(validateResults(makeFinalFixture(), { final: true }).length).toBe(0);
    const doc = makeFinalFixture();
    doc.load!.levels.push(
      { inFlight: 4, calls: [], window: window('l4', 4, 3, 2, 300, 40), extended: false },
      { inFlight: 2, calls: [], window: window('l2', 2, 3, 2, 300, 40), extended: false },
    );
    expect(validateResults(doc, { final: true, profile: 'gate' })).toEqual([]);
  });

  const gateProblems: [string, (d: ResultsDoc) => void][] = [
    ['ladder.reliability 29', (d) => d.ladder!.reliability.pop()],
    ['ladder.models 9', (d) => d.ladder!.models.pop()],
    ['ladder.publicUrl 9', (d) => d.ladder!.publicUrl.pop()],
    ['dispatch.samples 49', (d) => d.dispatch!.samples.pop()],
    ['missing level 8', (d) => (d.load!.levels = d.load!.levels.filter((l) => l.inFlight !== 8))],
    ['missing level 4', (d) => (d.load!.levels = d.load!.levels.filter((l) => l.inFlight !== 4))],
    ['missing level 2', (d) => (d.load!.levels = d.load!.levels.filter((l) => l.inFlight !== 2))],
    ['no regionCompile probe', (d) => (d.structured!.regionCompile.probes = [])],
    ['no skill-route cell', (d) => (d.structured!.cells = [])],
    ['no thinkingOff array', (d) => delete (d.structured as Partial<NonNullable<ResultsDoc['structured']>>).thinkingOff],
    ['regionCompile.compiles not boolean', (d) => ((d.structured!.regionCompile as { compiles: unknown }).compiles = 'yes')],
    ['missing baseline2', (d) => delete d.load!.baseline2],
    ['missing environment', (d) => delete d.environment],
    ['missing sender', (d) => delete d.sender],
    ['missing serverLogs', (d) => delete d.serverLogs],
    ['missing verdict in final mode', (d) => delete d.verdict],
  ];
  for (const [name, mutate] of gateProblems) {
    it(`final gate profile: ${name} yields a problem`, () => {
      const doc = makeGateFinalFixture();
      mutate(doc);
      expect(validateResults(doc, { final: true, profile: 'gate' }).length).toBeGreaterThan(0);
    });
  }

  it('malformed cell elements are reported as problems instead of throwing (full profile)', () => {
    for (const bad of [null, 42, 'route']) {
      const doc = makeFinalFixture();
      (doc.structured!.cells as unknown[]).push(bad);
      let problems: string[] = [];
      expect(() => {
        problems = validateResults(doc, { final: true });
      }).not.toThrow();
      expect(problems.some((p) => p.startsWith('structured.cells['))).toBe(true);
    }
    // A structurally valid sample with a non-string route must not throw either.
    const doc = makeFinalFixture();
    (doc.structured!.cells as unknown[]).push({ ...sample(), route: 5 });
    expect(() => validateResults(doc, { final: true })).not.toThrow();
  });

  it('a canary hit above 0 is still a problem when a canary section is present', () => {
    const doc = makeGateFinalFixture();
    doc.canary = { hits: 1, locationsScanned: 1, fetchReachedAnthropic: false, statusSeen: null };
    expect(validateResults(doc, { final: true, profile: 'gate' }).length).toBeGreaterThan(0);
    expect(validateResults(doc, { final: false, profile: 'gate' }).length).toBeGreaterThan(0);
  });

  it('sections the gate does not require are type-checked when present', () => {
    const doc = makeGateFinalFixture();
    (doc as { drills: unknown }).drills = { timeout: 'x', badKey: [] };
    expect(validateResults(doc, { final: true, profile: 'gate' }).length).toBeGreaterThan(0);
  });

  it('sections the gate does not require carry no minimum counts under the gate profile', () => {
    const doc = makeGateFinalFixture();
    doc.drills = { timeout: many(1, { class: 'drill', ok: false, failureClass: 'platform' }), badKey: [] };
    doc.cache = { pair: [], cacheReadObserved: false };
    expect(validateResults(doc, { final: true, profile: 'gate' })).toEqual([]);
  });

  it('memory may be empty with a note on the gate profile', () => {
    const doc = makeGateFinalFixture();
    expect(doc.load!.memory).toEqual([]);
    expect(doc.load!.memoryNote).toContain('unavailable');
    expect(validateResults(doc, { final: true, profile: 'gate' })).toEqual([]);
  });
});

// ============================================================================
// Recorded results files (frozen evidence for the executor decision)
// ============================================================================
//
// The two recorded files are frozen evidence and their verdicts were decided under
// the rules below. To keep the recorded decision reproducible when the live gate
// defaults or derivation rules change later, the reproduction here does not read
// GATE_DEFAULTS, minInFlightForLevel, observedServerCap or floorAdjustedNoiseFloorMs.
// It pins the decision-time thresholds and filters locally and only reuses the
// generic pieces (sample collection, percentile, the gate evaluator).

interface RecordedFile {
  path: string;
  name: string;
  profile: ResultsProfile;
}

/** The gate profile applies to a hosted-database results file; every other file uses the full profile. */
function profileForFile(name: string): ResultsProfile {
  return name.includes('maincloud') ? 'gate' : 'full';
}

/** Every file ending -results.json in every 39- folder (directories only). */
function locateRecordedResults(): RecordedFile[] {
  const phasesDir = fileURLToPath(new URL('../../../.planning/phases', import.meta.url));
  if (!existsSync(phasesDir)) return [];
  const found: RecordedFile[] = [];
  for (const entry of readdirSync(phasesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('39-')) continue;
    const dir = join(phasesDir, entry.name);
    for (const f of readdirSync(dir).filter((n: string) => n.endsWith('-results.json')).sort()) {
      found.push({ path: join(dir, f), name: f, profile: profileForFile(f) });
    }
  }
  return found;
}

/** Gate thresholds in force when the recorded verdicts were decided (matches verdict.*.thresholds in both files). */
const DECISION_THRESHOLDS: GateThresholds = {
  dispatchP95Ms: 250,
  ratio: 2,
  noiseFloorMs: 0,
  goMinInFlight: 6,
  minReliabilityCalls: 30,
  minDispatchSamples: 50,
  minPingSamples: 200,
  minTickSamples: 30,
};

/** Decision-time floor for the floor-adjusted verdict: max(25 ms, measured baseline drift). */
const DECISION_MIN_NOISE_FLOOR_MS = 25;

/** Decision-time per-level filter: samples need at least 75% of the level's in-flight count, minimum 2. */
function decisionMinInFlight(level: number): number {
  return Math.max(2, Math.ceil(level * 0.75));
}

function decisionWindowStats(
  w: LatencyWindow | undefined,
  keepPing: (inFlight: number) => boolean,
  keepTick: (inFlight: number) => boolean,
) {
  const ping = (w?.pingMs ?? []).filter((s) => keepPing(s.inFlight)).map((s) => s.ms);
  const tick = (w?.tick ?? []).filter((s) => keepTick(s.inFlight)).map((s) => s.lateMs);
  return {
    pingP95Ms: ping.length === 0 ? null : percentile(ping, 95),
    tickLateP95Ms: tick.length === 0 ? null : percentile(tick, 95),
    pingSamples: ping.length,
    tickSamples: tick.length,
  };
}

/** Highest server-side in-flight count seen on any load-level tick sample. */
function decisionServerCap(doc: ResultsDoc): number | null {
  let cap: number | null = null;
  for (const level of doc.load?.levels ?? []) {
    for (const t of level.window?.tick ?? []) {
      if (cap === null || t.inFlight > cap) cap = t.inFlight;
    }
  }
  return cap;
}

/** Baseline drift over ping and tick, unfiltered (baseline vs baseline2). */
function decisionNoiseFloorMs(doc: ResultsDoc): number {
  const all = () => true;
  const a = decisionWindowStats(doc.load?.baseline, all, all);
  const b = decisionWindowStats(doc.load?.baseline2, all, all);
  const diffs: number[] = [];
  if (a.pingP95Ms !== null && b.pingP95Ms !== null) diffs.push(Math.abs(b.pingP95Ms - a.pingP95Ms));
  if (a.tickLateP95Ms !== null && b.tickLateP95Ms !== null) diffs.push(Math.abs(b.tickLateP95Ms - a.tickLateP95Ms));
  return Math.max(DECISION_MIN_NOISE_FLOOR_MS, diffs.length === 0 ? 0 : Math.max(...diffs));
}

/** Decision-time gate input: every rule that shapes the input is pinned here, not imported. */
function decisionGateInput(doc: ResultsDoc, thresholds: GateThresholds): GateInput {
  const reliabilitySamples = collectCallSamples(doc).filter((s) => s.class === 'reliability');
  const capBlocked = reliabilitySamples.filter((s) => s.failureClass === 'spend_cap').length;
  const counted = reliabilitySamples.filter((s) => s.failureClass !== 'spend_cap');
  const failed = counted.filter((s) => !s.ok);
  const ladderCalls = (doc.ladder?.reliability ?? []).filter(
    (s) => s.class === 'reliability' && s.failureClass !== 'spend_cap',
  );
  const dispatchMs = (doc.dispatch?.samples ?? [])
    .map((s) => s.dispatchLateUs)
    .filter((v): v is number => typeof v === 'number')
    .map((us) => us / 1000);

  const cap = decisionServerCap(doc);
  const loads = (doc.load?.levels ?? []).map((l) => {
    const pingMin = decisionMinInFlight(l.inFlight);
    const effective = cap === null || cap <= 0 ? l.inFlight : Math.min(l.inFlight, cap);
    const tickMin = decisionMinInFlight(effective);
    return {
      inFlight: l.inFlight,
      ...decisionWindowStats(l.window, (n) => n >= pingMin, (n) => n >= tickMin),
    };
  });

  return {
    reliability: {
      calls: ladderCalls.length,
      totalCalls: counted.length,
      failures: failed.length,
      platformFailures: failed.filter((s) => s.failureClass === 'platform').length,
      upstreamFailures: failed.filter((s) => s.failureClass === 'upstream').length,
      capBlocked,
    },
    dispatch: {
      p95Ms: dispatchMs.length === 0 ? null : percentile(dispatchMs, 95),
      samples: dispatchMs.length,
    },
    regionSchema: {
      compiles: doc.structured?.regionCompile?.compiles === true,
      stagedWorkaroundDocumented: doc.structured?.regionCompile?.staged?.compiles === true,
    },
    baseline: decisionWindowStats(doc.load?.baseline, (n) => n === 0, (n) => n === 0),
    loads,
    thresholds,
  };
}

interface RecordedDecision {
  strict: { verdict: string; cap: number | null };
  floorAdjusted: { verdict: string; cap: number | null };
  noiseFloorMs: number;
  observedServerCap: number;
}

/** The decided outcome of each known recorded file. A frozen table: never derive these from live code. */
const RECORDED_DECISIONS: Record<string, RecordedDecision> = {
  '39-spike-results.json': {
    strict: { verdict: 'incomplete', cap: null },
    floorAdjusted: { verdict: 'incomplete', cap: null },
    noiseFloorMs: 171.76529999999184,
    observedServerCap: 4,
  },
  '39-maincloud-results.json': {
    strict: { verdict: 'go', cap: null },
    floorAdjusted: { verdict: 'go', cap: null },
    noiseFloorMs: 25,
    observedServerCap: 8,
  },
};

describe('recorded results discovery', () => {
  it('picks the gate profile only for names that contain maincloud', () => {
    expect(profileForFile('39-maincloud-results.json')).toBe('gate');
    expect(profileForFile('39-local-results.json')).toBe('full');
    expect(profileForFile('anything-results.json')).toBe('full');
  });

  it('returns every -results.json file of every 39- folder, not just the first', () => {
    const found = locateRecordedResults();
    for (const f of found) {
      expect(f.name.endsWith('-results.json')).toBe(true);
      expect(f.profile).toBe(profileForFile(f.name));
    }
    expect(new Set(found.map((f) => f.path)).size).toBe(found.length);
  });

  it('finds every known recorded file (fails loudly if the phase folder moved or a file is gone)', () => {
    const names = locateRecordedResults().map((f) => f.name);
    for (const known of Object.keys(RECORDED_DECISIONS)) {
      expect(names, `recorded results file ${known} not found under .planning/phases/39-*`).toContain(known);
    }
  });
});

describe('decision-time thresholds are pinned', () => {
  it('match the thresholds stored in each recorded file', () => {
    for (const f of locateRecordedResults()) {
      const doc = JSON.parse(readFileSync(f.path, 'utf8')) as ResultsDoc;
      if (!doc.verdict) continue;
      expect(doc.verdict.strict.thresholds).toEqual(DECISION_THRESHOLDS);
      expect(doc.verdict.floorAdjusted.thresholds).toEqual({
        ...DECISION_THRESHOLDS,
        noiseFloorMs: doc.verdict.noiseFloorMs,
      });
    }
  });

  it('pin the decision-time level filter', () => {
    expect([8, 4, 2].map(decisionMinInFlight)).toEqual([6, 3, 2]);
  });
});

// One suite per known or discovered file. describe.each rejects an empty table, so a placeholder row
// is used when nothing was found; the discovery test above fails in that case.
const recordedFiles = locateRecordedResults();
const recordedCases = recordedFiles.map((f) => [f.name, f] as const);

describe.each(recordedCases.length > 0 ? recordedCases : [['none', null as unknown as RecordedFile] as const])(
  'recorded results file %s',
  (_name, file) => {
    if (file === null) {
      it('exists', () => {
        throw new Error('no recorded results files found under .planning/phases/39-*');
      });
      return;
    }
    const text = readFileSync(file.path, 'utf8');
    const doc = JSON.parse(text) as ResultsDoc;
    const pinned = RECORDED_DECISIONS[file.name];

    // A recorded decision file must carry its verdict: a truncated file is never accepted as partial.
    it.skipIf(pinned === undefined)('carries the recorded verdict, matching the frozen decision', () => {
      expect(doc.verdict, `${file.name} has no verdict block`).toBeDefined();
      const v = doc.verdict!;
      expect({ verdict: v.strict.verdict, cap: v.strict.cap }).toEqual(pinned.strict);
      expect({ verdict: v.floorAdjusted.verdict, cap: v.floorAdjusted.cap }).toEqual(pinned.floorAdjusted);
      expect(v.noiseFloorMs).toBeCloseTo(pinned.noiseFloorMs, 9);
      expect(v.observedServerCap).toBe(pinned.observedServerCap);
    });

    it('is structurally valid (final when a verdict exists or the file is a recorded decision, partial otherwise)', () => {
      const final = doc.verdict !== undefined || pinned !== undefined;
      expect(validateResults(doc, { final, profile: file.profile })).toEqual([]);
    });

    it('contains no key-prefixed strings at all', () => {
      expect(findSecretLeaks(text, { strictPrefix: true }).total).toBe(0);
    });

    it.skipIf(pinned === undefined)('reproduces the recorded strict verdict from raw samples', () => {
      const recomputed = evaluateGate(decisionGateInput(doc, DECISION_THRESHOLDS));
      expect(recomputed.verdict).toBe(pinned.strict.verdict);
      expect(recomputed.cap).toBe(pinned.strict.cap);
    });

    it.skipIf(pinned === undefined)('reproduces the recorded floor-adjusted verdict from raw samples', () => {
      const noiseFloorMs = decisionNoiseFloorMs(doc);
      expect(noiseFloorMs).toBeCloseTo(pinned.noiseFloorMs, 9);
      const recomputed = evaluateGate(decisionGateInput(doc, { ...DECISION_THRESHOLDS, noiseFloorMs }));
      expect(recomputed.verdict).toBe(pinned.floorAdjusted.verdict);
      expect(recomputed.cap).toBe(pinned.floorAdjusted.cap);
    });

    it.skipIf(pinned === undefined)('observed server cap matches the recorded evidence', () => {
      expect(decisionServerCap(doc)).toBe(pinned.observedServerCap);
    });
  },
);
