import { describe, it, expect } from 'vitest';
// This tsconfig has no @types/node; vitest runs the file in Node, so the built-ins resolve at runtime.
// @ts-ignore
import { readFileSync } from 'node:fs';
// @ts-ignore
import { fileURLToPath } from 'node:url';
import { CLAUDE_MODEL } from './llm_models';
import { LLM_ROUTE_NAMES, LLM_ROUTES, validateRoutes, type LlmRoute } from './llm_routes';
import { LLM_NO_AUTO_RETRY_ROUTES } from './llm_limits';
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
  LLM_NO_RETRY_HEADROOM_TOKENS,
  noRetryMaxTokens,
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
      region_economy: [4096, 90_000],
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

  it.each(['low', 'medium'] as const)(
    'review WR-A03: a Run A sample in the %s cell that stopped at max_tokens keeps the baseline',
    (cellName) => {
      const rec = routeRecord([500, 500, 500, 500, 500, 500], [500, 500, 500, 500, 500, 500]);
      // The truncated sample is not ok, so the chosen cell still has enough successful samples without it.
      rec.efforts[cellName].samples.push(sample(4096, { ok: false, stopReason: 'max_tokens', schemaOk: false }));
      expect(deriveRecordFields(rec)).toMatchObject({ insufficientData: true, p99OutputTokens: null, maxTokens: null });
      expect(deriveRouteTuning('world_gen', rec, base)).toMatchObject({ status: 'insufficient_data', maxTokens: 8192, effort: 'low' });
    },
  );

  it('review WR-A03: the same record without the truncated sample is tuned (the truncation alone decides)', () => {
    const rec = routeRecord([500, 500, 500, 500, 500, 500], [500, 500, 500, 500, 500, 500]);
    rec.efforts.medium.samples.push(sample(500, { ok: false, stopReason: 'refusal', schemaOk: false }));
    expect(deriveRouteTuning('world_gen', rec, base).status).toBe('tuned');
  });

  it('tunes effort and max_tokens from the record and keeps the baseline timeout', () => {
    const rec = routeRecord([1000, 1100, 900, 1000, 1000], [1000, 1000, 1000, 1000, 1000]);
    // skill_gen auto-retries: max_tokens is the plain p99 x 1.25 rule.
    expect(deriveRouteTuning('skill_gen', rec, LLM_ROUTE_BASELINES.skill_gen)).toMatchObject({
      status: 'tuned',
      maxTokens: 1536,
      timeoutMs: LLM_ROUTE_BASELINES.skill_gen.timeoutMs,
    });
    // world_gen never auto-retries: p99 1100 + 512 headroom = 1612, rounded up to 1792 (review WR-A04).
    const out = deriveRouteTuning('world_gen', rec, base);
    expect(out).toEqual({
      effort: 'low',
      maxTokens: 1792,
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
    // p99 300: x1.25 gives 512, the no-retry floor gives 300 + 512 = 812, rounded up to 1024 (review WR-A04).
    expect(deriveRouteTuning('world_gen', rec, base)).toMatchObject({ status: 'tuned', effort: 'medium', maxTokens: 1024, tie: false });
    expect(deriveRouteTuning('skill_gen', rec, LLM_ROUTE_BASELINES.skill_gen)).toMatchObject({ effort: 'medium', maxTokens: 512 });
  });

  describe('review WR-A04: the no-retry headroom floor', () => {
    it('is 512 tokens and applies to exactly the routes that never auto-retry', () => {
      expect(LLM_NO_RETRY_HEADROOM_TOKENS).toBe(512);
      const rec = routeRecord([200, 200, 200, 200, 200], [200, 200, 200, 200, 200]);
      for (const name of LLM_SWEEP_ROUTES) {
        const out = deriveRouteTuning(name, rec, LLM_ROUTE_BASELINES[name]);
        const noRetry = (LLM_NO_AUTO_RETRY_ROUTES as readonly string[]).includes(name);
        // p99 200: x1.25 gives 256; the floor gives 200 + 512 = 712, rounded up to 768.
        expect(out.maxTokens, name).toBe(noRetry ? 768 : 256);
      }
    });

    it('noRetryMaxTokens keeps the larger of x1.25 and p99 + 512, both rounded up to 256', () => {
      expect(noRetryMaxTokens([168])).toBe(768); // combat_narration's recorded p99
      expect(noRetryMaxTokens([818])).toBe(1536); // world_gen_start
      expect(noRetryMaxTokens([1988])).toBe(2560); // world_gen
      expect(noRetryMaxTokens([4000])).toBe(tunedMaxTokens([4000])); // x1.25 wins on a large p99
      expect(() => noRetryMaxTokens([])).toThrow();
    });

    it('leaves at least 512 tokens above the p99 on every tuned no-retry route in LLM_TUNING', () => {
      for (const name of LLM_NO_AUTO_RETRY_ROUTES) {
        const t = LLM_TUNING[name];
        if (t.status !== 'tuned' || t.p99OutputTokens === null) continue;
        expect(t.maxTokens - t.p99OutputTokens, name).toBeGreaterThanOrEqual(LLM_NO_RETRY_HEADROOM_TOKENS);
      }
    });

    it('the floor alone never lifts max_tokens above the baseline, and never lowers the x1.25 figure', () => {
      // combat_narration baseline 1024. p99 700: x1.25 gives 1024, the floor 1212 -> 1280 is capped at 1024.
      const mid = routeRecord([700, 700, 700, 700, 700], [700, 700, 700, 700, 700]);
      expect(deriveRouteTuning('combat_narration', mid, LLM_ROUTE_BASELINES.combat_narration).maxTokens).toBe(1024);
      // p99 900: x1.25 gives 1280, above the baseline as before; the floor does not cut it down.
      const big = routeRecord([900, 900, 900, 900, 900], [900, 900, 900, 900, 900]);
      expect(deriveRouteTuning('combat_narration', big, LLM_ROUTE_BASELINES.combat_narration).maxTokens).toBe(1280);
    });
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

/**
 * Routes whose reply shape changed after the committed sweep, so their recorded p99 no longer applies:
 * each keeps an explicit budget marked insufficient_data until a paid re-measurement (RESEARCH Pitfall 2).
 *   - world_gen (Phase 51.3.1.1 Plan 23): the fill reply now carries creature families, place words and
 *     hub marks, larger than the measured enemies reply (p99 1988), so 4096 output tokens; Plan 30
 *     (Revision 2) adds a history per family and up to the server's family count, so 6144.
 *   - npc_conversation (Phase 51.3.1.1 Plan 32, a budget the owner raised): quest-offer replies passed the
 *     tuned 512 (jobs 8215-8217 stopped at max_tokens); the owner set 1024 as the hard ceiling, with one
 *     automatic retry on truncation, until a paid re-measurement.
 */
const RESHAPED_ROUTES: Partial<Record<LlmRoute, { maxTokens: number; timeoutMs: number }>> = {
  world_gen: { maxTokens: 6144, timeoutMs: 150_000 },
  npc_conversation: { maxTokens: 1024, timeoutMs: 30_000 },
};

describe('LLM_TUNING', () => {
  it('world_gen is 6144 output tokens and insufficient_data until a paid measurement (Plans 51.3.1.1-23, -30)', () => {
    expect(LLM_TUNING.world_gen).toEqual({
      effort: 'low',
      maxTokens: 6144,
      timeoutMs: 150_000,
      status: 'insufficient_data',
      source: LLM_TUNING_SOURCE,
      p99OutputTokens: null,
      samples: 0,
      tie: false,
    });
    expect(LLM_ROUTES.world_gen.maxTokens).toBe(6144);
    // Within the route baseline, as for region_economy.
    expect(LLM_TUNING.world_gen.maxTokens).toBeLessThanOrEqual(LLM_ROUTE_BASELINES.world_gen.maxTokens);
    for (const [name, want] of Object.entries(RESHAPED_ROUTES) as [LlmRoute, { maxTokens: number; timeoutMs: number }][]) {
      expect(LLM_TUNING[name], name).toMatchObject({ ...want, status: 'insufficient_data', p99OutputTokens: null, samples: 0 });
    }
  });

  it('npc_conversation is 1024 output tokens, the owner\'s hard ceiling, and insufficient_data until a paid measurement (Plan 51.3.1.1-32)', () => {
    expect(LLM_TUNING.npc_conversation).toEqual({
      effort: 'low',
      maxTokens: 1024,
      timeoutMs: 30_000,
      status: 'insufficient_data',
      source: LLM_TUNING_SOURCE,
      p99OutputTokens: null,
      samples: 0,
      tie: false,
    });
    expect(LLM_ROUTES.npc_conversation.maxTokens).toBe(1024);
    expect(LLM_TUNING.npc_conversation.maxTokens).toBeLessThanOrEqual(LLM_ROUTE_BASELINES.npc_conversation.maxTokens);
  });

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
      // A route whose reply shape changed after the sweep has no valid record yet (asserted below).
      if (name in RESHAPED_ROUTES) continue;
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

// ---------------------------------------------------------------------------
// Measurement record hygiene (Plan 43-12): the committed record may hold only counts, sizes,
// timings, stop reasons, pass flags and lint rule ids, never text or key material.
// ---------------------------------------------------------------------------

const RECORD_STATUSES = ['not_run', 'measured', 'declined', 'deferred', 'applied'];
const FORBIDDEN_RECORD_KEYS = ['prompt', 'completion', 'text', 'body', 'system', 'messages', 'apiKey', 'headers'];
const RECORD_SPEND_CAP_MICRO_USD = 5_000_000n;

function recordHygieneProblems(record: any): string[] {
  const problems: string[] = [];
  if (!record || typeof record !== 'object') return ['record is not an object'];
  if (!RECORD_STATUSES.includes(record.status)) problems.push(`status ${String(record.status)} is not allowed`);

  const walk = (value: any, path: string): void => {
    if (typeof value === 'string') {
      if (/sk-ant/i.test(value)) problems.push(`key-shaped string at ${path}`);
      if (value.toLowerCase().includes('x-api-key')) problems.push(`x-api-key text at ${path}`);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${path}[${i}]`));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        if (FORBIDDEN_RECORD_KEYS.includes(k)) problems.push(`forbidden key ${k} at ${path}`);
        walk(v, `${path}.${k}`);
      }
    }
  };
  walk(record, '$');

  let cost: bigint | null = null;
  try {
    cost = BigInt(record?.totals?.costMicroUsd);
  } catch {
    problems.push('totals.costMicroUsd is not a BigInt string');
  }
  if (cost !== null && cost >= RECORD_SPEND_CAP_MICRO_USD) problems.push('total cost is not below $5');

  if (record.status === 'measured' || record.status === 'applied') {
    if (record.model !== CLAUDE_MODEL) problems.push('model is not CLAUDE_MODEL');
    if (JSON.stringify(Object.keys(record.routes ?? {})) !== JSON.stringify([...LLM_SWEEP_ROUTES])) {
      problems.push('routes are not the LLM_SWEEP_ROUTES keys');
    }
    for (const name of LLM_SWEEP_ROUTES) {
      if (!record.caching || record.caching[name] === undefined) problems.push(`no caching entry for ${name}`);
    }
    if (!Array.isArray(record.classReveal?.latenciesMs)) problems.push('classReveal.latenciesMs is not an array');
  }
  return problems;
}

describe('measurement record hygiene', () => {
  it('the committed record has no hygiene problems', () => {
    expect(recordHygieneProblems(RECORD)).toEqual([]);
  });

  it('fails on a record that carries a prompt key', () => {
    const bad = { ...RECORD, routes: { ...RECORD.routes, creation_race: { ...RECORD.routes.creation_race, ['pro' + 'mpt']: 'x' } } };
    expect(recordHygieneProblems(bad).some((p) => p.includes('forbidden key prompt'))).toBe(true);
  });

  it('fails on a record that carries a key-shaped string', () => {
    const fragment = ['sk', 'ant', 'abc'].join('-');
    const bad = { ...RECORD, environment: fragment };
    expect(recordHygieneProblems(bad).some((p) => p.includes('key-shaped string'))).toBe(true);
  });

  it('fails on a record whose cost is 5_000_000 micro-USD', () => {
    const bad = { ...RECORD, totals: { ...RECORD.totals, costMicroUsd: '5000000' } };
    expect(recordHygieneProblems(bad).some((p) => p.includes('not below $5'))).toBe(true);
  });

  it('fails on a measured record that lacks caching entries or the model', () => {
    const bad = { ...RECORD, status: 'measured', model: 'other', caching: {} };
    const problems = recordHygieneProblems(bad);
    expect(problems.some((p) => p.includes('model'))).toBe(true);
    expect(problems.some((p) => p.includes('no caching entry'))).toBe(true);
  });

  it('fails on a status outside the allowed set', () => {
    expect(recordHygieneProblems({ ...RECORD, status: 'running' }).some((p) => p.includes('status'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tuning end state (Plan 43-14). The terminal-status assertion is the Phase 43 end state: a
// later re-measurement passes through 'measured' and back to 'applied'.
// ---------------------------------------------------------------------------

describe('tuning end state', () => {
  it('the record status is applied, declined or deferred (the apply step ran)', () => {
    expect(['applied', 'declined', 'deferred']).toContain(RECORD.status);
  });

  it('parallel class generation is built only on a build verdict', () => {
    if (RECORD.classReveal.verdict !== 'build') expect(RECORD.classReveal.parallelBuilt).toBe(false);
  });

  it('a declined or deferred record has verdict not_measured', () => {
    if (RECORD.status === 'declined' || RECORD.status === 'deferred') {
      expect(RECORD.classReveal.verdict).toBe('not_measured');
    }
  });

  it('when applied, every tuned route cites the measurement file with its p99 and sample count', () => {
    if (RECORD.status !== 'applied') return;
    for (const name of LLM_ROUTE_NAMES as readonly LlmRoute[]) {
      const t = LLM_TUNING[name];
      if (t.status !== 'tuned') continue;
      expect(t.source).toBe(LLM_TUNING_SOURCE);
      expect(t.p99OutputTokens).not.toBeNull();
      expect(t.samples).toBeGreaterThanOrEqual(LLM_TUNING_MIN_SAMPLES);
    }
  });

  it('when applied, every swept route passed the caching proof or is recorded as not cacheable', () => {
    if (RECORD.status !== 'applied') return;
    for (const name of LLM_SWEEP_ROUTES) {
      const c = RECORD.caching[name];
      expect(c.pass === true || c.notCacheable === true).toBe(true);
    }
  });
});
