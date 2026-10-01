// Unit tests for the pure /llm stats aggregation and formatting (Phase 43, OPS-02).

import { describe, expect, it } from 'vitest';
import {
  LLM_STATS_WINDOW_MICROS,
  aggregateLlmStats,
  summarizeRoute,
  type LlmStatsRow,
} from './llm_stats';

const NOW = 1_800_000_000_000_000n;

function row(
  route: string,
  outcome: string,
  latencyMs: number,
  costMicroUsd: bigint,
  createdAtMicros: bigint = NOW - 1_000_000n,
): LlmStatsRow {
  return {
    route,
    outcome,
    latencyMs: BigInt(latencyMs),
    costMicroUsd,
    createdAt: { microsSinceUnixEpoch: createdAtMicros },
  };
}

const ZERO = { calls: 0, costMicroUsd: 0n, p50Ms: 0, p95Ms: 0, errors: 0, truncated: 0 };

describe('LLM_STATS_WINDOW_MICROS', () => {
  it('is 24 hours in microseconds', () => {
    expect(LLM_STATS_WINDOW_MICROS).toBe(86_400_000_000n);
  });
});

describe('summarizeRoute', () => {
  it('returns zeros for no rows and does not throw', () => {
    expect(summarizeRoute([])).toEqual(ZERO);
  });

  it('counts calls, sums cost as bigint, counts errors and truncated', () => {
    const stats = summarizeRoute([
      row('r', 'ok', 1000, 100n),
      row('r', 'ok', 2000, 250n),
      row('r', 'truncated', 9000, 40n),
      row('r', 'rate_limit', 500, 0n),
    ]);
    expect(stats.calls).toBe(4);
    expect(stats.costMicroUsd).toBe(390n);
    expect(stats.errors).toBe(2);
    expect(stats.truncated).toBe(1);
  });

  it('takes nearest-rank p50 and p95 over ok rows only, without reordering the input', () => {
    const rows = [5000, 1000, 3000, 2000, 4000].map((ms) => row('r', 'ok', ms, 1n));
    const snapshot = rows.map((r) => r.latencyMs);
    const stats = summarizeRoute(rows);
    expect(stats.p50Ms).toBe(3000);
    expect(stats.p95Ms).toBe(5000);
    expect(rows.map((r) => r.latencyMs)).toEqual(snapshot);
  });

  it('ignores failed rows when computing latency percentiles', () => {
    const stats = summarizeRoute([
      row('r', 'ok', 1000, 1n),
      row('r', 'timeout', 60000, 0n),
      row('r', 'truncated', 30000, 1n),
    ]);
    expect(stats.p50Ms).toBe(1000);
    expect(stats.p95Ms).toBe(1000);
  });

  it('gives p50 0 and p95 0 for a route with calls but no ok row', () => {
    const stats = summarizeRoute([row('r', 'server', 4000, 0n), row('r', 'truncated', 5000, 3n)]);
    expect(stats.calls).toBe(2);
    expect(stats.p50Ms).toBe(0);
    expect(stats.p95Ms).toBe(0);
    expect(stats.errors).toBe(2);
  });
});

describe('aggregateLlmStats', () => {
  it('lists every route in the given order with zeros when absent', () => {
    const out = aggregateLlmStats([], NOW, ['b_route', 'a_route']);
    expect(out.map((e) => e.route)).toEqual(['b_route', 'a_route']);
    for (const e of out) {
      expect(e.last24h).toEqual(ZERO);
      expect(e.allTime).toEqual(ZERO);
    }
  });

  it('appends unknown route names after the ordered ones, sorted alphabetically', () => {
    const rows = [
      row('zeta', 'ok', 1000, 1n),
      row('known', 'ok', 1000, 1n),
      row('alpha', 'ok', 1000, 1n),
    ];
    const out = aggregateLlmStats(rows, NOW, ['known', 'missing']);
    expect(out.map((e) => e.route)).toEqual(['known', 'missing', 'alpha', 'zeta']);
    expect(out[1].allTime).toEqual(ZERO);
  });

  it('includes a row exactly 24 hours old and excludes one a microsecond older', () => {
    const edge = row('r', 'ok', 1000, 10n, NOW - 86_400_000_000n);
    const past = row('r', 'ok', 2000, 20n, NOW - 86_400_000_001n);
    const [entry] = aggregateLlmStats([past, edge], NOW, ['r']);
    expect(entry.last24h.calls).toBe(1);
    expect(entry.last24h.costMicroUsd).toBe(10n);
    expect(entry.allTime.calls).toBe(2);
    expect(entry.allTime.costMicroUsd).toBe(30n);
  });

  it('does not assume any row order and accepts a one-shot iterable', () => {
    const rows = [
      row('r', 'ok', 3000, 1n, NOW - 5_000_000n),
      row('r', 'ok', 1000, 1n, NOW - 90_000_000_000n),
      row('r', 'ok', 2000, 1n, NOW - 1_000_000n),
    ];
    function* gen() {
      for (const r of rows) yield r;
    }
    const [entry] = aggregateLlmStats(gen(), NOW, ['r']);
    expect(entry.allTime.calls).toBe(3);
    expect(entry.allTime.p50Ms).toBe(2000);
    expect(entry.last24h.calls).toBe(2);
    expect(entry.last24h.p50Ms).toBe(2000);
    expect(entry.last24h.p95Ms).toBe(3000);
  });

  it('keeps routes separate', () => {
    const rows = [row('a', 'ok', 1000, 5n), row('b', 'truncated', 2000, 7n)];
    const out = aggregateLlmStats(rows, NOW, ['a', 'b']);
    expect(out[0].allTime.calls).toBe(1);
    expect(out[0].allTime.errors).toBe(0);
    expect(out[1].allTime.truncated).toBe(1);
    expect(out[1].allTime.costMicroUsd).toBe(7n);
  });
});
