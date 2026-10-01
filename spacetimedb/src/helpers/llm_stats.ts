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

// ---------------------------------------------------------------------------
// Formatting (plain text for the admin console)
// ---------------------------------------------------------------------------
//
// NarrativeMessage renders with v-html and turns [text] into a clickable link, so
// the printed block must hold no square brackets and no angle brackets. Only
// route names, numbers and fixed words are printed.

/** Ledger figures printed on the last line. All money is bigint micro-USD. */
export type LlmLedgerSummary = {
  allTimeSpentMicroUsd: bigint;
  allTimeCalls: bigint;
  todaySpentMicroUsd: bigint;
  reservedMicroUsd: bigint;
  dailyCeilingMicroUsd: bigint;
  enabled: boolean;
};

/** Dollars with four decimal places from bigint micro-USD, by string math only. */
export function formatMicroUsd(micro: bigint): string {
  const safe = micro < 0n ? 0n : micro;
  const dollars = safe / 1_000_000n;
  const fraction = (safe % 1_000_000n) / 100n;
  return `$${dollars.toString()}.${fraction.toString().padStart(4, '0')}`;
}

/** Seconds with one decimal place, by integer math (tenths truncate). */
export function formatLatencyMs(ms: number): string {
  const whole = Number.isFinite(ms) && ms > 0 ? Math.floor(ms) : 0;
  const tenths = Math.floor(whole / 100);
  return `${Math.floor(tenths / 10)}.${tenths % 10}s`;
}

/** A route name with every link or markup character replaced. */
function plainName(name: string): string {
  return name.replace(/[[\]<>{}]/g, '_');
}

function statsText(s: RouteStats): string {
  return (
    `${s.calls} calls, ${formatMicroUsd(s.costMicroUsd)}, ` +
    `p50 ${formatLatencyMs(s.p50Ms)}, p95 ${formatLatencyMs(s.p95Ms)}, ` +
    `${s.errors} errors, ${s.truncated} truncated`
  );
}

/** The whole /llm stats block: a header, one line per route, and the ledger line. */
export function formatLlmStatsText(
  stats: readonly { route: string; last24h: RouteStats; allTime: RouteStats }[],
  ledger: LlmLedgerSummary,
): string {
  const lines: string[] = ['LLM stats by route, last 24 h | all time:'];
  for (const entry of stats) {
    lines.push(`${plainName(entry.route)}: ${statsText(entry.last24h)} | all time: ${statsText(entry.allTime)}`);
  }
  lines.push(
    `Ledger: all time ${formatMicroUsd(ledger.allTimeSpentMicroUsd)} over ${ledger.allTimeCalls.toString()} calls. ` +
      `Today ${formatMicroUsd(ledger.todaySpentMicroUsd)} spent and ${formatMicroUsd(ledger.reservedMicroUsd)} reserved ` +
      `of a ${formatMicroUsd(ledger.dailyCeilingMicroUsd)} daily ceiling. ` +
      `LLM calls are ${ledger.enabled ? 'on' : 'off'}.`,
  );
  return lines.join('\n');
}
