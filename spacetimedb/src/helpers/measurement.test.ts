import { describe, it, expect } from 'vitest';
import {
  GATE_DEFAULTS,
  percentile,
  summarize,
  ratioCheck,
  evaluateGate,
  type GateInput,
  type LevelStats,
} from './measurement';

// ============================================================================
// Helpers
// ============================================================================

/** Deterministic Fisher-Yates shuffle (seeded LCG) so tests are reproducible. */
function shuffled<T>(xs: readonly T[], seed = 12345): T[] {
  const out = [...xs];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

/** A level that passes both ratio checks against the default baseline (3 ms / 3 ms). */
function level(inFlight: number, pass = true): LevelStats {
  return {
    inFlight,
    pingP95Ms: pass ? 4 : 20,
    tickLateP95Ms: pass ? 4 : 20,
    pingSamples: 300,
    tickSamples: 60,
  };
}

/** A complete, healthy data set whose highest level (8) passes. */
function healthy(overrides: Partial<GateInput> = {}): GateInput {
  return {
    reliability: { calls: 30, failures: 0, platformFailures: 0, upstreamFailures: 0 },
    dispatch: { p95Ms: 40, samples: 50 },
    regionSchema: { compiles: true, stagedWorkaroundDocumented: false },
    baseline: { pingP95Ms: 3, tickLateP95Ms: 3, pingSamples: 1200, tickSamples: 60 },
    loads: [level(8)],
    ...overrides,
  };
}

const check = (r: ReturnType<typeof evaluateGate>, name: string) =>
  r.checks.find((c) => c.name === name);

// ============================================================================
// percentile (nearest-rank)
// ============================================================================

describe('percentile: nearest-rank math', () => {
  it('n=50, p=95 returns the 48th smallest value', () => {
    expect(percentile(range(50), 95)).toBe(48);
  });

  it('n=1 returns that value for any p', () => {
    expect(percentile([7], 95)).toBe(7);
    expect(percentile([7], 0)).toBe(7);
    expect(percentile([7], 100)).toBe(7);
  });

  it('p=0 returns the minimum and p=100 returns the maximum', () => {
    const xs = shuffled(range(50));
    expect(percentile(xs, 0)).toBe(1);
    expect(percentile(xs, 100)).toBe(50);
  });

  it('p=50 of an even-length list is the lower middle rank', () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2);
  });

  it('throws RangeError on an empty array', () => {
    expect(() => percentile([], 95)).toThrow(RangeError);
  });

  it('throws on NaN or non-finite samples', () => {
    expect(() => percentile([1, NaN], 50)).toThrow();
    expect(() => percentile([1, Infinity], 50)).toThrow();
  });

  it('throws when p is outside 0..100', () => {
    expect(() => percentile([1, 2, 3], -1)).toThrow();
    expect(() => percentile([1, 2, 3], 100.5)).toThrow();
    expect(() => percentile([1, 2, 3], NaN)).toThrow();
  });

  it('returns the same value for shuffled and sorted input', () => {
    const sorted = range(101);
    for (const seed of [1, 2, 3, 4, 5]) {
      const xs = shuffled(sorted, seed);
      for (const p of [0, 1, 50, 95, 99, 100]) {
        expect(percentile(xs, p)).toBe(percentile(sorted, p));
      }
    }
  });

  it('counts duplicate values by rank', () => {
    expect(percentile([5, 5, 5, 5], 95)).toBe(5);
    // ranks: 1,1,1,1,1,1,1,1,1,100 -> p90 is the 9th value (1), p95 is the 10th (100)
    const xs = [1, 1, 1, 1, 1, 1, 1, 1, 1, 100];
    expect(percentile(xs, 90)).toBe(1);
    expect(percentile(xs, 95)).toBe(100);
  });

  it('never mutates the input array', () => {
    const xs = [9, 3, 7, 1, 5];
    const copy = [...xs];
    percentile(xs, 95);
    expect(xs).toEqual(copy);
  });

  it('sorts numerically, not lexically', () => {
    expect(percentile([10, 9, 100, 2], 100)).toBe(100);
  });
});

describe('summarize: empty and single-sample edges', () => {
  it('returns null on an empty array', () => {
    expect(summarize([])).toBeNull();
  });

  it('single sample gives n 1 and every statistic equal to it', () => {
    expect(summarize([3])).toEqual({ n: 1, min: 3, p50: 3, p95: 3, p99: 3, max: 3, mean: 3 });
  });

  it('computes min/p50/p95/max/mean for a range', () => {
    const s = summarize(shuffled(range(50)))!;
    expect(s.n).toBe(50);
    expect(s.min).toBe(1);
    expect(s.p50).toBe(25);
    expect(s.p95).toBe(48);
    expect(s.p99).toBe(50);
    expect(s.max).toBe(50);
    expect(s.mean).toBe(25.5);
  });
});

// ============================================================================
// ratioCheck (strict boundary)
// ============================================================================

describe('ratioCheck: strict gate boundary', () => {
  it('exactly 2.0x baseline fails', () => {
    expect(ratioCheck(3, 6, 2, 0).pass).toBe(false);
  });

  it('1.99x baseline passes', () => {
    expect(ratioCheck(3, 5.97, 2, 0).pass).toBe(true);
  });

  it('a positive noise floor widens the limit to max(ratio*base, base+floor)', () => {
    const r = ratioCheck(3, 7, 2, 25);
    expect(r.limit).toBe(28);
    expect(r.pass).toBe(true);
  });

  it('a zero baseline with zero load passes; any load above zero fails', () => {
    expect(ratioCheck(0, 0, 2, 0).pass).toBe(true);
    expect(ratioCheck(0, 0.1, 2, 0).pass).toBe(false);
  });

  it('null inputs fail with a null limit', () => {
    expect(ratioCheck(null, 5, 2, 0)).toEqual({ pass: false, limit: null });
    expect(ratioCheck(3, null, 2, 0)).toEqual({ pass: false, limit: null });
  });
});

// ============================================================================
// evaluateGate: go / go_with_cap / no_go / incomplete
// ============================================================================

describe('evaluateGate: gate verdict branches', () => {
  it('defaults are the locked gate values', () => {
    expect(GATE_DEFAULTS.dispatchP95Ms).toBe(250);
    expect(GATE_DEFAULTS.ratio).toBe(2);
    expect(GATE_DEFAULTS.noiseFloorMs).toBe(0);
    expect(GATE_DEFAULTS.goMinInFlight).toBe(6);
  });

  it('all healthy with level 8 passing gives go and cap null', () => {
    const r = evaluateGate(healthy());
    expect(r.verdict).toBe('go');
    expect(r.cap).toBeNull();
  });

  it('level 8 failing plus level 4 passing gives go_with_cap cap 4', () => {
    const r = evaluateGate(healthy({ loads: [level(8, false), level(4)] }));
    expect(r.verdict).toBe('go_with_cap');
    expect(r.cap).toBe(4);
  });

  it('8 and 4 failing with 2 passing gives go_with_cap cap 2', () => {
    const r = evaluateGate(healthy({ loads: [level(8, false), level(4, false), level(2)] }));
    expect(r.verdict).toBe('go_with_cap');
    expect(r.cap).toBe(2);
  });

  it('only a level of 3 passing gives cap 3', () => {
    const r = evaluateGate(healthy({ loads: [level(8, false), level(3)] }));
    expect(r.verdict).toBe('go_with_cap');
    expect(r.cap).toBe(3);
  });

  it('a passing level of 1 still yields a cap of at least 2', () => {
    const r = evaluateGate(healthy({ loads: [level(8, false), level(1)] }));
    expect(r.verdict).toBe('go_with_cap');
    expect(r.cap).toBe(2);
  });

  it('level order in the input does not change the outcome', () => {
    const r = evaluateGate(healthy({ loads: [level(2), level(8, false), level(4)] }));
    expect(r.verdict).toBe('go_with_cap');
    expect(r.cap).toBe(4);
  });

  it('8, 4 and 2 all failing gives no_go', () => {
    const r = evaluateGate(
      healthy({ loads: [level(8, false), level(4, false), level(2, false)] }),
    );
    expect(r.verdict).toBe('no_go');
    expect(r.cap).toBeNull();
  });

  it('8 and 4 failing with 2 untested gives incomplete', () => {
    const r = evaluateGate(healthy({ loads: [level(8, false), level(4, false)] }));
    expect(r.verdict).toBe('incomplete');
  });

  it('a level failing only the tick check fails the level', () => {
    const tickFail: LevelStats = { ...level(8), tickLateP95Ms: 6 };
    const r = evaluateGate(healthy({ loads: [tickFail, level(4)] }));
    expect(r.verdict).toBe('go_with_cap');
    expect(check(r, 'tick_p95@8')?.pass).toBe(false);
    expect(check(r, 'ping_p95@8')?.pass).toBe(true);
  });

  it('one reliability failure gives no_go', () => {
    const r = evaluateGate(
      healthy({
        reliability: { calls: 30, failures: 1, platformFailures: 1, upstreamFailures: 0 },
      }),
    );
    expect(r.verdict).toBe('no_go');
    expect(r.flags).toContain('platform_failures');
    expect(r.flags).not.toContain('upstream_only_failures');
  });

  it('upstream-only failures stay no_go and add the upstream_only_failures flag', () => {
    const r = evaluateGate(
      healthy({
        reliability: { calls: 30, failures: 2, platformFailures: 0, upstreamFailures: 2 },
      }),
    );
    expect(r.verdict).toBe('no_go');
    expect(r.flags).toContain('upstream_only_failures');
    expect(check(r, 'reliability')?.pass).toBe(false);
  });

  it('spend-cap blocked calls add the spend_cap_blocked flag', () => {
    const r = evaluateGate(
      healthy({
        reliability: { calls: 30, failures: 0, platformFailures: 0, upstreamFailures: 0, capBlocked: 3 },
      }),
    );
    expect(r.flags).toContain('spend_cap_blocked');
  });

  it('dispatch p95 of exactly 250 ms gives no_go, 249.9 ms passes', () => {
    expect(evaluateGate(healthy({ dispatch: { p95Ms: 250, samples: 50 } })).verdict).toBe('no_go');
    expect(evaluateGate(healthy({ dispatch: { p95Ms: 249.9, samples: 50 } })).verdict).toBe('go');
  });

  it('region schema not compiling without a workaround gives no_go', () => {
    const r = evaluateGate(
      healthy({ regionSchema: { compiles: false, stagedWorkaroundDocumented: false } }),
    );
    expect(r.verdict).toBe('no_go');
    expect(check(r, 'region_schema')?.pass).toBe(false);
  });

  it('region schema failing with a documented staged workaround passes', () => {
    const r = evaluateGate(
      healthy({ regionSchema: { compiles: false, stagedWorkaroundDocumented: true } }),
    );
    expect(r.verdict).toBe('go');
    expect(check(r, 'region_schema')?.pass).toBe(true);
  });

  it('incomplete when reliability calls are 29', () => {
    const r = evaluateGate(
      healthy({ reliability: { calls: 29, failures: 0, platformFailures: 0, upstreamFailures: 0 } }),
    );
    expect(r.verdict).toBe('incomplete');
    expect(check(r, 'samples')?.pass).toBe(false);
  });

  it('incomplete beats no_go: thin data never yields a verdict', () => {
    const r = evaluateGate(
      healthy({
        reliability: { calls: 29, failures: 5, platformFailures: 5, upstreamFailures: 0 },
      }),
    );
    expect(r.verdict).toBe('incomplete');
  });

  it('incomplete when dispatch samples are 49', () => {
    expect(evaluateGate(healthy({ dispatch: { p95Ms: 40, samples: 49 } })).verdict).toBe('incomplete');
  });

  it('incomplete when baseline ping samples are 199 or baseline tick samples are 29', () => {
    const b = healthy().baseline;
    expect(evaluateGate(healthy({ baseline: { ...b, pingSamples: 199 } })).verdict).toBe('incomplete');
    expect(evaluateGate(healthy({ baseline: { ...b, tickSamples: 29 } })).verdict).toBe('incomplete');
  });

  it('incomplete when any tested level has 29 tick samples', () => {
    const thin: LevelStats = { ...level(4), tickSamples: 29 };
    expect(evaluateGate(healthy({ loads: [level(8), thin] })).verdict).toBe('incomplete');
  });

  it('incomplete when any tested level has 199 ping samples', () => {
    const thin: LevelStats = { ...level(4), pingSamples: 199 };
    expect(evaluateGate(healthy({ loads: [level(8), thin] })).verdict).toBe('incomplete');
  });

  it('incomplete when no tested level reaches 6 in flight', () => {
    expect(evaluateGate(healthy({ loads: [level(4), level(2)] })).verdict).toBe('incomplete');
    expect(evaluateGate(healthy({ loads: [] })).verdict).toBe('incomplete');
  });

  it('a level of exactly 6 in flight counts as the go level', () => {
    expect(evaluateGate(healthy({ loads: [level(6)] })).verdict).toBe('go');
  });

  it('ping at exactly 2.0x baseline fails the strict gate; 1.99x passes', () => {
    const at2x: LevelStats = { ...level(8), pingP95Ms: 6 };
    const r = evaluateGate(healthy({ loads: [at2x, level(4)] }));
    expect(check(r, 'ping_p95@8')?.pass).toBe(false);
    expect(r.verdict).toBe('go_with_cap');
    const under: LevelStats = { ...level(8), pingP95Ms: 5.97 };
    expect(evaluateGate(healthy({ loads: [under] })).verdict).toBe('go');
  });

  it('noiseFloorMs defaults to 0 and adds no flag', () => {
    const r = evaluateGate(healthy());
    expect(r.thresholds.noiseFloorMs).toBe(0);
    expect(r.flags).not.toContain('noise_floor_applied');
  });

  it('noiseFloorMs 25 turns a strict ping failure (3 ms vs 7 ms) into a pass and flags it', () => {
    const noisy: LevelStats = { ...level(8), pingP95Ms: 7 };
    const strict = evaluateGate(healthy({ loads: [noisy] }));
    expect(check(strict, 'ping_p95@8')?.pass).toBe(false);
    expect(strict.verdict).toBe('incomplete'); // failing top level with no step-down tested
    const relaxed = evaluateGate(healthy({ loads: [noisy], thresholds: { noiseFloorMs: 25 } }));
    expect(check(relaxed, 'ping_p95@8')?.pass).toBe(true);
    expect(relaxed.verdict).toBe('go');
    expect(relaxed.flags).toContain('noise_floor_applied');
  });

  it('thresholds override merges over the defaults', () => {
    const r = evaluateGate(healthy({ dispatch: { p95Ms: 300, samples: 50 }, thresholds: { dispatchP95Ms: 400 } }));
    expect(r.verdict).toBe('go');
    expect(r.thresholds.dispatchP95Ms).toBe(400);
    expect(r.thresholds.ratio).toBe(2);
  });

  it('lists every check with measured and threshold values', () => {
    const r = evaluateGate(healthy({ loads: [level(8), level(4)] }));
    const names = r.checks.map((c) => c.name);
    for (const n of ['samples', 'reliability', 'dispatch_p95', 'region_schema', 'ping_p95@8', 'tick_p95@8', 'ping_p95@4', 'tick_p95@4']) {
      expect(names).toContain(n);
    }
    for (const c of r.checks) {
      expect(c).toHaveProperty('measured');
      expect(c).toHaveProperty('threshold');
    }
    expect(check(r, 'dispatch_p95')?.measured).toBe(40);
    expect(check(r, 'dispatch_p95')?.threshold).toBe(250);
  });

  it('incomplete results still list the full checks', () => {
    const r = evaluateGate(healthy({ dispatch: { p95Ms: 40, samples: 10 } }));
    expect(r.verdict).toBe('incomplete');
    expect(r.checks.length).toBeGreaterThanOrEqual(5);
  });
});
