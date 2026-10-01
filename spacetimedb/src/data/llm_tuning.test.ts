import { describe, it, expect } from 'vitest';
// This tsconfig has no @types/node; vitest runs the file in Node, so the built-ins resolve at runtime.
// @ts-ignore
import { readFileSync } from 'node:fs';
// @ts-ignore
import { fileURLToPath } from 'node:url';
import { LLM_ROUTE_NAMES, LLM_ROUTES, validateRoutes, type LlmRoute } from './llm_routes';
import {
  LLM_TUNING,
  LLM_ROUTE_BASELINES,
  LLM_SWEEP_ROUTES,
  LLM_SWEEP_EFFORTS,
  LLM_TUNING_MIN_SAMPLES,
  LLM_TUNING_SOURCE,
  LLM_POOL_MEAN_TOLERANCE,
  LLM_DISPATCH_ALLOWANCE_MS,
  LLM_CLASS_REVEAL_THRESHOLD_MS,
  tunedMaxTokens,
  samplePasses,
  chooseEffort,
  p99Samples,
  suggestedTimeoutMs,
  deriveRouteTuning,
  deriveRecordFields,
  lat06Decision,
  type SweepSample,
  type SweepRouteRecord,
} from './llm_tuning';

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const sample = (outputTokens: number, over: Partial<SweepSample> = {}): SweepSample => ({
  ok: true,
  stopReason: 'end_turn',
  latencyMs: 4000,
  inputTokens: 100,
  outputTokens,
  cacheWriteTokens: 0,
  cacheReadTokens: 2400,
  schemaOk: true,
  toneFailures: [],
  ...over,
});

const cell = (tokens: number[], over: Partial<SweepSample> = {}) => ({ samples: tokens.map((t) => sample(t, over)) });

const routeRecord = (low: number[], medium: number[], extra: Partial<SweepRouteRecord> = {}): SweepRouteRecord => ({
  efforts: { low: cell(low), medium: cell(medium) },
  chosenEffort: null,
  tie: false,
  p99OutputTokens: null,
  maxTokens: null,
  suggestedTimeoutMs: null,
  insufficientData: true,
  runB: [],
  ...extra,
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('constants', () => {
  it('pins the documented values', () => {
    expect(LLM_TUNING_MIN_SAMPLES).toBe(5);
    expect(LLM_POOL_MEAN_TOLERANCE).toBe(0.15);
    expect(LLM_DISPATCH_ALLOWANCE_MS).toBe(300);
    expect(LLM_CLASS_REVEAL_THRESHOLD_MS).toBe(10_000);
    expect(LLM_TUNING_SOURCE).toBe('spacetimedb/src/data/llm_measurements.json');
  });

  it('sweeps exactly nine routes in the fixed order and two efforts', () => {
    expect([...LLM_SWEEP_ROUTES]).toEqual([
      'creation_race',
      'creation_class_reveal',
      'creation_class',
      'world_gen_start',
      'world_gen',
      'skill_gen',
      'renown_perk_gen',
      'npc_conversation',
      'combat_narration',
    ]);
    expect([...LLM_SWEEP_EFFORTS]).toEqual(['low', 'medium']);
    expect(LLM_SWEEP_ROUTES).not.toContain('smoke_test');
  });

  it('pins the baselines to the Phase 40 and 43-04 values (kept for insufficient data)', () => {
    const table: Record<string, [number, number]> = {
      creation_race: [4096, 90_000],
      creation_class_reveal: [2048, 60_000],
      creation_class: [4096, 90_000],
      world_gen_start: [4096, 90_000],
      world_gen: [8192, 150_000],
      skill_gen: [4096, 60_000],
      npc_conversation: [1024, 30_000],
      combat_narration: [1024, 20_000],
      renown_perk_gen: [2048, 60_000],
      smoke_test: [256, 30_000],
    };
    for (const name of LLM_ROUTE_NAMES) {
      expect(LLM_ROUTE_BASELINES[name]).toEqual({ effort: 'low', maxTokens: table[name][0], timeoutMs: table[name][1] });
    }
    expect(Object.isFrozen(LLM_ROUTE_BASELINES)).toBe(true);
    expect(Object.isFrozen(LLM_ROUTE_BASELINES.world_gen)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// tunedMaxTokens
// ---------------------------------------------------------------------------

describe('tunedMaxTokens', () => {
  it('floors at 256', () => {
    expect(tunedMaxTokens([100])).toBe(256);
    expect(tunedMaxTokens([204])).toBe(256);
  });

  it('rounds p99 x 1.25 up to a multiple of 256', () => {
    expect(tunedMaxTokens([205])).toBe(512);
    expect(tunedMaxTokens([1024])).toBe(1280);
  });

  it('uses nearest-rank p99 over numerically sorted samples (the maximum of five) without reordering the input', () => {
    const input = [5000, 1000, 3000, 2000, 4000];
    expect(tunedMaxTokens(input)).toBe(6400);
    expect(input).toEqual([5000, 1000, 3000, 2000, 4000]);
  });

  it('sorts numerically, not as text (9 vs 10 vs 100)', () => {
    expect(tunedMaxTokens([9, 10, 100, 1000, 2000])).toBe(2560);
  });

  it('gives the same answer for equal samples in any order', () => {
    expect(tunedMaxTokens([300, 700, 300, 700, 500])).toBe(tunedMaxTokens([700, 500, 300, 300, 700]));
  });

  it('throws on an empty sample set', () => {
    expect(() => tunedMaxTokens([])).toThrow();
  });
});

// ---------------------------------------------------------------------------
// samplePasses / chooseEffort
// ---------------------------------------------------------------------------

describe('samplePasses', () => {
  it('needs ok, end_turn, schemaOk and no tone failures', () => {
    expect(samplePasses(sample(100))).toBe(true);
    expect(samplePasses(sample(100, { ok: false }))).toBe(false);
    expect(samplePasses(sample(100, { stopReason: 'max_tokens' }))).toBe(false);
    expect(samplePasses(sample(100, { schemaOk: false }))).toBe(false);
    expect(samplePasses(sample(100, { toneFailures: ['markdown'] }))).toBe(false);
  });
});

describe('chooseEffort', () => {
  it('the cell with more passing samples wins', () => {
    const low = { samples: [sample(1), sample(1, { schemaOk: false }), sample(1), sample(1), sample(1)] };
    const medium = cell([1, 1, 1, 1, 1]);
    expect(chooseEffort({ low, medium })).toMatchObject({ effort: 'medium', tie: false, passes: { low: 4, medium: 5 } });
  });

  it('low wins when it has more passes', () => {
    const medium = { samples: [sample(1, { toneFailures: ['exclamation'] }), sample(1), sample(1), sample(1), sample(1)] };
    expect(chooseEffort({ low: cell([1, 1, 1, 1, 1]), medium })).toMatchObject({ effort: 'low', tie: false });
  });

  it('equal counts pick low and flag the tie (5 of 5 each)', () => {
    expect(chooseEffort({ low: cell([1, 1, 1, 1, 1]), medium: cell([1, 1, 1, 1, 1]) })).toMatchObject({
      effort: 'low',
      tie: true,
      passes: { low: 5, medium: 5 },
    });
  });

  it('equal counts below the maximum are still a tie that goes to low', () => {
    const low = { samples: [sample(1), sample(1, { ok: false })] };
    const medium = { samples: [sample(1, { schemaOk: false }), sample(1)] };
    expect(chooseEffort({ low, medium })).toMatchObject({ effort: 'low', tie: true, passes: { low: 1, medium: 1 } });
  });
});

// ---------------------------------------------------------------------------
// p99Samples
// ---------------------------------------------------------------------------

describe('p99Samples', () => {
  it('pools both cells when both have enough successful samples and the means are close', () => {
    const efforts = { low: cell([100, 100, 100, 100, 100]), medium: cell([110, 110, 110, 110, 110]) };
    expect(p99Samples(efforts, 'low')).toEqual([100, 100, 100, 100, 100, 110, 110, 110, 110, 110]);
  });

  it('pools at exactly 15 percent of the larger mean (100 vs 85) and not beyond it (100 vs 84)', () => {
    const at = { low: cell([100, 100, 100, 100, 100]), medium: cell([85, 85, 85, 85, 85]) };
    expect(p99Samples(at, 'low')).toHaveLength(10);
    const beyond = { low: cell([100, 100, 100, 100, 100]), medium: cell([84, 84, 84, 84, 84]) };
    expect(p99Samples(beyond, 'low')).toEqual([100, 100, 100, 100, 100]);
  });

  it('uses the chosen cell only when the means differ by more than 15 percent', () => {
    const efforts = { low: cell([100, 100, 100, 100, 100]), medium: cell([200, 200, 200, 200, 200]) };
    expect(p99Samples(efforts, 'low')).toEqual([100, 100, 100, 100, 100]);
    expect(p99Samples(efforts, 'medium')).toEqual([200, 200, 200, 200, 200]);
  });

  it('uses the chosen cell only when the other cell has fewer than 5 successful samples', () => {
    const efforts = { low: cell([100, 100, 100, 100, 100]), medium: cell([100, 100, 100, 100]) };
    expect(p99Samples(efforts, 'low')).toEqual([100, 100, 100, 100, 100]);
  });

  it('counts only successful samples (a failed call does not add output size)', () => {
    const efforts = {
      low: { samples: [...cell([100, 100, 100, 100, 100]).samples, sample(9999, { ok: false, stopReason: 'max_tokens' })] },
      medium: cell([100, 100, 100, 100, 100]),
    };
    expect(Math.max(...p99Samples(efforts, 'low'))).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// suggestedTimeoutMs
// ---------------------------------------------------------------------------

describe('suggestedTimeoutMs', () => {
  it('is at least 30 s, four times the nearest-rank p99 rounded up to 5 s, capped at 180 s', () => {
    expect(suggestedTimeoutMs([2000, 3000, 4000])).toBe(30_000);
    expect(suggestedTimeoutMs([10_000, 12_000, 17_300])).toBe(70_000);
    expect(suggestedTimeoutMs([60_000])).toBe(180_000);
  });

  it('throws on an empty set', () => {
    expect(() => suggestedTimeoutMs([])).toThrow();
  });
});

// ---------------------------------------------------------------------------
// deriveRouteTuning
// ---------------------------------------------------------------------------

describe('deriveRouteTuning', () => {
  const base = LLM_ROUTE_BASELINES.world_gen;

  it('no record keeps the baseline and says insufficient_data', () => {
    expect(deriveRouteTuning('world_gen', undefined, base)).toEqual({
      effort: 'low',
      maxTokens: 8192,
      timeoutMs: 150_000,
      status: 'insufficient_data',
      source: LLM_TUNING_SOURCE,
      p99OutputTokens: null,
      samples: 0,
      tie: false,
    });
  });

  it('fewer than 5 successful samples in the chosen cell keeps the baseline', () => {
    const rec = routeRecord([1000, 1000, 1000, 1000], [1000, 1000, 1000, 1000]);
    const out = deriveRouteTuning('world_gen', rec, base);
    expect(out).toMatchObject({ status: 'insufficient_data', effort: 'low', maxTokens: 8192, timeoutMs: 150_000 });
  });

  it('smoke_test is never swept', () => {
    const out = deriveRouteTuning('smoke_test', routeRecord([10, 10, 10, 10, 10], [10, 10, 10, 10, 10]), LLM_ROUTE_BASELINES.smoke_test);
    expect(out).toMatchObject({ status: 'not_swept', effort: 'low', maxTokens: 256, timeoutMs: 30_000 });
  });

  it('a Run B call that stopped at max_tokens keeps the baseline', () => {
    const rec = routeRecord([500, 500, 500, 500, 500], [500, 500, 500, 500, 500], {
      runB: [
        { ok: true, stopReason: 'end_turn', latencyMs: 1, inputTokens: 1, outputTokens: 1, cacheWriteTokens: 0, cacheReadTokens: 0 },
        { ok: false, stopReason: 'max_tokens', latencyMs: 1, inputTokens: 1, outputTokens: 1, cacheWriteTokens: 0, cacheReadTokens: 0 },
      ],
    });
    expect(deriveRouteTuning('world_gen', rec, base)).toMatchObject({ status: 'insufficient_data', maxTokens: 8192, effort: 'low' });
  });

  it('tunes effort and max_tokens from the record and keeps the baseline timeout', () => {
    const rec = routeRecord([1000, 1100, 900, 1000, 1000], [1000, 1000, 1000, 1000, 1000]);
    const out = deriveRouteTuning('world_gen', rec, base);
    expect(out).toEqual({
      effort: 'low',
      maxTokens: 1536,
      timeoutMs: 150_000,
      status: 'tuned',
      source: LLM_TUNING_SOURCE,
      p99OutputTokens: 1100,
      samples: 10,
      tie: true,
    });
  });

  it('a medium win is carried through with its own cell', () => {
    const lowBad = { samples: [sample(300, { schemaOk: false }), ...cell([300, 300, 300, 300]).samples] };
    const rec: SweepRouteRecord = { ...routeRecord([], [300, 300, 300, 300, 300]), efforts: { low: lowBad, medium: cell([300, 300, 300, 300, 300]) } };
    expect(deriveRouteTuning('world_gen', rec, base)).toMatchObject({ status: 'tuned', effort: 'medium', maxTokens: 512, tie: false });
  });
});

describe('deriveRecordFields', () => {
  it('an empty record is insufficient with null derived values', () => {
    expect(deriveRecordFields(routeRecord([], []))).toEqual({
      chosenEffort: null,
      tie: false,
      p99OutputTokens: null,
      maxTokens: null,
      suggestedTimeoutMs: null,
      insufficientData: true,
    });
  });

  it('a full record carries the chosen effort, the tie, p99, max_tokens and a suggested timeout', () => {
    const rec = routeRecord([100, 100, 100, 100, 100], [100, 100, 100, 100, 100]);
    expect(deriveRecordFields(rec)).toEqual({
      chosenEffort: 'low',
      tie: true,
      p99OutputTokens: 100,
      maxTokens: 256,
      suggestedTimeoutMs: 30_000,
      insufficientData: false,
    });
  });
});

// ---------------------------------------------------------------------------
// lat06Decision
// ---------------------------------------------------------------------------

describe('lat06Decision', () => {
  it('is not_measured with no latencies', () => {
    expect(lat06Decision([])).toEqual({ p50Ms: null, p95Ms: null, verdict: 'not_measured' });
  });

  it('a p50 of exactly 10_000 ms (after the dispatch allowance) leaves parallel generation out', () => {
    const raw = 10_000 - LLM_DISPATCH_ALLOWANCE_MS;
    expect(lat06Decision([raw, raw, raw])).toMatchObject({ p50Ms: 10_000, verdict: 'leave_out' });
  });

  it('10_001 builds it', () => {
    const raw = 10_001 - LLM_DISPATCH_ALLOWANCE_MS;
    expect(lat06Decision([raw, raw, raw])).toMatchObject({ p50Ms: 10_001, verdict: 'build' });
  });

  it('reports the p95 with the same allowance and is order independent', () => {
    const a = lat06Decision([3000, 1000, 2000, 5000, 4000]);
    const b = lat06Decision([1000, 2000, 3000, 4000, 5000]);
    expect(a).toEqual(b);
    expect(a).toMatchObject({ p50Ms: 3300, p95Ms: 5300, verdict: 'leave_out' });
  });
});

// ---------------------------------------------------------------------------
// LLM_TUNING and the route table
// ---------------------------------------------------------------------------

describe('LLM_TUNING', () => {
  it('has one frozen entry per route', () => {
    expect(Object.keys(LLM_TUNING).sort()).toEqual([...LLM_ROUTE_NAMES].sort());
    expect(Object.isFrozen(LLM_TUNING)).toBe(true);
    for (const name of LLM_ROUTE_NAMES) expect(Object.isFrozen(LLM_TUNING[name])).toBe(true);
  });

  it('LLM_ROUTES takes effort, maxTokens and timeoutMs from LLM_TUNING for every route', () => {
    for (const name of LLM_ROUTE_NAMES) {
      expect(LLM_ROUTES[name].effort).toBe(LLM_TUNING[name].effort);
      expect(LLM_ROUTES[name].maxTokens).toBe(LLM_TUNING[name].maxTokens);
      expect(LLM_ROUTES[name].timeoutMs).toBe(LLM_TUNING[name].timeoutMs);
    }
    expect(validateRoutes(LLM_ROUTES)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Traceability over the committed record
// ---------------------------------------------------------------------------

const RECORD = JSON.parse(readFileSync(fileURLToPath(new URL('./llm_measurements.json', import.meta.url)), 'utf8'));

describe('traceability: llm_measurements.json', () => {
  it('has the fixed top-level key order', () => {
    expect(Object.keys(RECORD)).toEqual([
      'schemaVersion',
      'status',
      'model',
      'recordedAt',
      'environment',
      'totals',
      'routes',
      'caching',
      'classReveal',
    ]);
    expect(RECORD.schemaVersion).toBe(1);
    expect(['not_run', 'measured', 'applied', 'declined', 'deferred']).toContain(RECORD.status);
  });

  it('lists routes in the sweep order and efforts low then medium', () => {
    expect(Object.keys(RECORD.routes)).toEqual([...LLM_SWEEP_ROUTES]);
    for (const name of LLM_SWEEP_ROUTES) {
      expect(Object.keys(RECORD.routes[name].efforts)).toEqual(['low', 'medium']);
    }
  });

  it('holds counts, sizes, timings and ids only (no prompts, replies or keys)', () => {
    const text = readFileSync(fileURLToPath(new URL('./llm_measurements.json', import.meta.url)), 'utf8');
    expect(text).not.toMatch(/sk-ant-|x-api-key|"prompt"|"completion"|"text"|"content"|"body"/i);
    const sampleKeys = ['ok', 'stopReason', 'latencyMs', 'inputTokens', 'outputTokens', 'cacheWriteTokens', 'cacheReadTokens', 'schemaOk', 'toneFailures'];
    for (const name of LLM_SWEEP_ROUTES) {
      for (const eff of LLM_SWEEP_EFFORTS) {
        for (const s of RECORD.routes[name].efforts[eff].samples) expect(Object.keys(s)).toEqual(sampleKeys);
      }
    }
  });

  it('every LLM_TUNING entry traces to the record (applied) or to the no-data derivation (any other status)', () => {
    for (const name of LLM_ROUTE_NAMES as readonly LlmRoute[]) {
      const rec = RECORD.status === 'applied' ? RECORD.routes[name] : undefined;
      const expected = deriveRouteTuning(name, rec, LLM_ROUTE_BASELINES[name]);
      expect(LLM_TUNING[name]).toEqual(expected);
      expect(LLM_TUNING[name].source).toBe(LLM_TUNING_SOURCE);
    }
  });

  it('the record\'s own derived fields match the recomputation for every route', () => {
    for (const name of LLM_SWEEP_ROUTES) {
      const r = RECORD.routes[name];
      const d = deriveRecordFields(r);
      expect(r.chosenEffort).toBe(d.chosenEffort);
      expect(r.tie).toBe(d.tie);
      expect(r.p99OutputTokens).toBe(d.p99OutputTokens);
      expect(r.maxTokens).toBe(d.maxTokens);
      expect(r.suggestedTimeoutMs).toBe(d.suggestedTimeoutMs);
      expect(r.insufficientData).toBe(d.insufficientData);
    }
  });

  it('the class reveal verdict is the lat06Decision of the recorded latencies and parallel generation is built only on build', () => {
    const cr = RECORD.classReveal;
    const d = lat06Decision(cr.latenciesMs);
    expect(cr.verdict).toBe(d.verdict);
    expect(cr.p50Ms).toBe(d.p50Ms);
    expect(cr.p95Ms).toBe(d.p95Ms);
    expect(cr.thresholdMs).toBe(LLM_CLASS_REVEAL_THRESHOLD_MS);
    if (d.verdict !== 'build') expect(cr.parallelBuilt).toBe(false);
  });
});
