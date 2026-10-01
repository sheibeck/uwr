// ============================================================================
// LLM stats (Phase 43, OPS-02, pure module)
// ============================================================================
//
// Aggregation and formatting behind `/llm stats`: per-route calls, cost, p50 and
// p95 latency, errors and truncated replies, for the last 24 hours and for all
// time. /llm stats is a reducer path (not a view) because views cannot scan
// llm_call_log (PLANNING-NOTES item 1); the reducer gathers rows and prints, and
// this module does the arithmetic.
//
// Imports only ./measurement, so it loads in plain Node vitest.
// ============================================================================

import { percentile } from './measurement';

/** The "last 24 hours" window, in microseconds. */
export const LLM_STATS_WINDOW_MICROS = 86_400_000_000n;

/** The llm_call_log columns the stats read. Nothing else is ever touched. */
export type LlmStatsRow = {
  route: string;
  outcome: string;
  latencyMs: bigint;
  costMicroUsd: bigint;
  createdAt: { microsSinceUnixEpoch: bigint };
};

export type RouteStats = {
  calls: number;
  costMicroUsd: bigint;
  p50Ms: number;
  p95Ms: number;
  errors: number;
  truncated: number;
};

/** Stats for one set of rows. p50 and p95 use ok calls only; empty gives zeros. */
export function summarizeRoute(rows: readonly LlmStatsRow[]): RouteStats {
  let costMicroUsd = 0n;
  let errors = 0;
  let truncated = 0;
  const okLatencies: number[] = [];
  for (const r of rows) {
    costMicroUsd += r.costMicroUsd;
    if (r.outcome === 'ok') {
      okLatencies.push(Number(r.latencyMs));
    } else {
      errors += 1;
      if (r.outcome === 'truncated') truncated += 1;
    }
  }
  // percentile() throws on an empty list, so it only runs when there is data.
  const p50Ms = okLatencies.length > 0 ? percentile(okLatencies, 50) : 0;
  const p95Ms = okLatencies.length > 0 ? percentile(okLatencies, 95) : 0;
  return { calls: rows.length, costMicroUsd, p50Ms, p95Ms, errors, truncated };
}

/**
 * One entry per route in routeOrder (zeros when absent), then one entry per other
 * route seen in the rows, sorted alphabetically. The input is read once and its
 * order is never assumed.
 */
export function aggregateLlmStats(
  rows: Iterable<LlmStatsRow>,
  nowMicros: bigint,
  routeOrder: readonly string[],
): { route: string; last24h: RouteStats; allTime: RouteStats }[] {
  const windowStart = nowMicros - LLM_STATS_WINDOW_MICROS;
  const allTime = new Map<string, LlmStatsRow[]>();
  const last24h = new Map<string, LlmStatsRow[]>();
  for (const r of rows) {
    let all = allTime.get(r.route);
    if (!all) {
      all = [];
      allTime.set(r.route, all);
    }
    all.push(r);
    if (r.createdAt.microsSinceUnixEpoch >= windowStart) {
      let recent = last24h.get(r.route);
      if (!recent) {
        recent = [];
        last24h.set(r.route, recent);
      }
      recent.push(r);
    }
  }
  const ordered = [...routeOrder];
  const known = new Set(ordered);
  const extra = [...allTime.keys()].filter((name) => !known.has(name)).sort();
  return [...ordered, ...extra].map((route) => ({
    route,
    last24h: summarizeRoute(last24h.get(route) ?? []),
    allTime: summarizeRoute(allTime.get(route) ?? []),
  }));
}
