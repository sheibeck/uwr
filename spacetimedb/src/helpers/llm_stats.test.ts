// Unit tests for the pure /llm stats aggregation and formatting (Phase 43, OPS-02).

import { describe, expect, it } from 'vitest';
import {
  LLM_STATS_WINDOW_MICROS,
  aggregateLlmStats,
  formatLatencyMs,
  formatLlmStatsText,
  formatMicroUsd,
  summarizeRoute,
  type LlmLedgerSummary,
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

describe('formatMicroUsd', () => {
  it('prints four decimal places from bigint micro-USD', () => {
    expect(formatMicroUsd(0n)).toBe('$0.0000');
    expect(formatMicroUsd(71_234n)).toBe('$0.0712');
    expect(formatMicroUsd(10_000_000n)).toBe('$10.0000');
    expect(formatMicroUsd(1_234_567_891n)).toBe('$1234.5678');
  });

  it('truncates below one ten-thousandth of a dollar and pads the fraction', () => {
    expect(formatMicroUsd(99n)).toBe('$0.0000');
    expect(formatMicroUsd(100n)).toBe('$0.0001');
    expect(formatMicroUsd(1_000_099n)).toBe('$1.0000');
  });

  it('clamps a negative amount to zero', () => {
    expect(formatMicroUsd(-5n)).toBe('$0.0000');
  });

  it('stays exact beyond the safe float range', () => {
    expect(formatMicroUsd(9_007_199_254_740_993_000_000n)).toBe('$9007199254740993.0000');
  });
});

describe('formatLatencyMs', () => {
  it('prints whole seconds and tenths', () => {
    expect(formatLatencyMs(0)).toBe('0.0s');
    expect(formatLatencyMs(5149)).toBe('5.1s');
    expect(formatLatencyMs(12000)).toBe('12.0s');
    expect(formatLatencyMs(99)).toBe('0.0s');
    expect(formatLatencyMs(100)).toBe('0.1s');
  });

  it('treats negative and non-finite input as zero', () => {
    expect(formatLatencyMs(-4)).toBe('0.0s');
    expect(formatLatencyMs(Number.NaN)).toBe('0.0s');
  });
});

const LEDGER: LlmLedgerSummary = {
  allTimeSpentMicroUsd: 231_000n,
  allTimeCalls: 40n,
  todaySpentMicroUsd: 71_234n,
  reservedMicroUsd: 5_000n,
  dailyCeilingMicroUsd: 10_000_000n,
  enabled: true,
};

describe('formatLlmStatsText', () => {
  it('prints a header, one line per route in order, and a ledger line', () => {
    const rows = [
      ...[5000, 5100, 5200].map((ms) => row('world_gen_start', 'ok', ms, 20_000n)),
      row('world_gen_start', 'truncated', 9000, 11_234n),
      row('npc_reply', 'ok', 2000, 500n, NOW - 90_000_000_000n),
    ];
    const stats = aggregateLlmStats(rows, NOW, ['world_gen_start', 'npc_reply', 'idle_route']);
    const text = formatLlmStatsText(stats, LEDGER);
    const lines = text.split('\n');
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe('LLM stats by route, last 24 h | all time:');
    expect(lines[1]).toBe(
      'world_gen_start: 4 calls, $0.0712, p50 5.1s, p95 5.2s, 1 errors, 1 truncated | all time: 4 calls, $0.0712, p50 5.1s, p95 5.2s, 1 errors, 1 truncated',
    );
    expect(lines[2]).toBe(
      'npc_reply: 0 calls, $0.0000, p50 0.0s, p95 0.0s, 0 errors, 0 truncated | all time: 1 calls, $0.0005, p50 2.0s, p95 2.0s, 0 errors, 0 truncated',
    );
    expect(lines[3]).toContain('idle_route: 0 calls');
    expect(lines[4]).toBe(
      'Ledger: all time $0.2310 over 40 calls. Today $0.0712 spent and $0.0050 reserved of a $10.0000 daily ceiling. LLM calls are on.',
    );
    // sample, kept visible for the plan summary
    expect(text).toMatchInlineSnapshot(`
      "LLM stats by route, last 24 h | all time:
      world_gen_start: 4 calls, $0.0712, p50 5.1s, p95 5.2s, 1 errors, 1 truncated | all time: 4 calls, $0.0712, p50 5.1s, p95 5.2s, 1 errors, 1 truncated
      npc_reply: 0 calls, $0.0000, p50 0.0s, p95 0.0s, 0 errors, 0 truncated | all time: 1 calls, $0.0005, p50 2.0s, p95 2.0s, 0 errors, 0 truncated
      idle_route: 0 calls, $0.0000, p50 0.0s, p95 0.0s, 0 errors, 0 truncated | all time: 0 calls, $0.0000, p50 0.0s, p95 0.0s, 0 errors, 0 truncated
      Ledger: all time $0.2310 over 40 calls. Today $0.0712 spent and $0.0050 reserved of a $10.0000 daily ceiling. LLM calls are on."
    `);
  });

  it('says LLM calls are off when the kill switch is off', () => {
    const text = formatLlmStatsText([], { ...LEDGER, enabled: false });
    expect(text.split('\n').pop()).toMatch(/LLM calls are off\.$/);
  });

  it('prints only the header and the ledger line for no routes', () => {
    const text = formatLlmStatsText([], LEDGER);
    expect(text.split('\n')).toHaveLength(2);
  });

  it('replaces markup and link characters in hostile route names and never throws', () => {
    const rows = [
      row('[click]<b>x</b>{y}', 'ok', 1000, 1n),
      row('<script>', 'truncated', 1000, 1n),
    ];
    const stats = aggregateLlmStats(rows, NOW, ['[npc]']);
    const text = formatLlmStatsText(stats, LEDGER);
    expect(text.includes('[')).toBe(false);
    expect(text.includes(']')).toBe(false);
    expect(text.includes('<')).toBe(false);
    expect(text.includes('>')).toBe(false);
    expect(text.includes('{')).toBe(false);
    expect(text.includes('}')).toBe(false);
    expect(text).toContain('_npc_:');
  });

  it('never prints a 64-hex identity even when rows carry extra fields', () => {
    const identity = 'c200' + 'ab'.repeat(30);
    expect(identity).toHaveLength(64);
    const rows = [
      {
        ...row('npc_reply', 'ok', 1000, 1n),
        playerId: { toHexString: () => identity },
        playerHex: identity,
        errorText: 'secret prompt ' + identity,
        resultText: 'model reply',
      },
    ] as unknown as LlmStatsRow[];
    const text = formatLlmStatsText(aggregateLlmStats(rows, NOW, ['npc_reply']), LEDGER);
    expect(/[0-9a-f]{64}/i.test(text)).toBe(false);
    expect(text).not.toContain('secret prompt');
    expect(text).not.toContain('model reply');
  });

  it('contains neither [ nor < for a ten-route fixture', () => {
    const names = Array.from({ length: 10 }, (_, i) => `route_${i}`);
    const rows = names.flatMap((n, i) => [
      row(n, 'ok', 1000 + i * 100, BigInt(i) * 1_000n),
      row(n, i % 2 === 0 ? 'truncated' : 'timeout', 2000, 0n, NOW - 200_000_000_000n),
    ]);
    const text = formatLlmStatsText(aggregateLlmStats(rows, NOW, names.slice(0, 6)), LEDGER);
    expect(text.split('\n')).toHaveLength(12);
    expect(text.includes('[')).toBe(false);
    expect(text.includes('<')).toBe(false);
  });
});
