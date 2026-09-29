import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateGate, findSecretLeaks, GATE_DEFAULTS } from './measurement';
import {
  collectCallSamples,
  floorAdjustedNoiseFloorMs,
  gateInputFromResults,
  measuredNoiseDriftMs,
  minInFlightForLevel,
  validateResults,
  type CallSample,
  type LatencyWindow,
  type ResultsDoc,
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
// Recorded results file (skips until the file exists)
// ============================================================================

function locateRecordedResults(): string | null {
  const phasesDir = fileURLToPath(new URL('../../../.planning/phases', import.meta.url));
  if (!existsSync(phasesDir)) return null;
  for (const dir of readdirSync(phasesDir)) {
    if (!dir.startsWith('39-')) continue;
    const file = readdirSync(join(phasesDir, dir)).find((f) => f.endsWith('-results.json'));
    if (file) return join(phasesDir, dir, file);
  }
  return null;
}

const recordedPath = locateRecordedResults();

describe.skipIf(recordedPath === null)('recorded results file', () => {
  const text = recordedPath ? readFileSync(recordedPath, 'utf8') : '{}';
  const doc = JSON.parse(text) as ResultsDoc;

  it('is structurally valid (final when a verdict exists, partial otherwise)', () => {
    expect(validateResults(doc, { final: doc.verdict !== undefined })).toEqual([]);
  });

  it('contains no key-prefixed strings at all', () => {
    expect(findSecretLeaks(text, { strictPrefix: true }).total).toBe(0);
  });

  it('reproduces the recorded strict verdict from raw samples', () => {
    if (!doc.verdict) return;
    const recomputed = evaluateGate(gateInputFromResults(doc));
    expect(recomputed.verdict).toBe(doc.verdict.strict.verdict);
    expect(recomputed.cap).toBe(doc.verdict.strict.cap);
  });

  it('reproduces the recorded floor-adjusted verdict from raw samples', () => {
    if (!doc.verdict) return;
    const noiseFloorMs = floorAdjustedNoiseFloorMs(doc);
    expect(doc.verdict.noiseFloorMs).toBe(noiseFloorMs);
    const recomputed = evaluateGate(gateInputFromResults(doc, { noiseFloorMs }));
    expect(recomputed.verdict).toBe(doc.verdict.floorAdjusted.verdict);
    expect(recomputed.cap).toBe(doc.verdict.floorAdjusted.cap);
  });
});
