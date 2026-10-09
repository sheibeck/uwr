// Which "the Keeper is working" line to show, and whether narrative sends must wait.
//
// Behavior ported from the old client's useLlmStatus (tag v2.2-client), rewritten as pure
// functions over my_llm_jobs rows. Every string, pool, priority and status list comes from the
// server module through the @game-data alias; the client holds no copy (project rule).
//
// Research S1: there is no client Error line for a failed job. The server already writes its own
// in-voice failure line, so a failed row simply leaves the active set and the progress line
// clears. The view's userMessage is never shown here.
// Research S2: the Phase 43 selection is ported: active statuses only, silent routes never show,
// creation-only routes stay out of the game console, the highest-priority route wins, then the
// oldest createdAt, then the lowest id. The route's pool rotates every LLM_PROGRESS_ROTATE_MS.
// Research S3: the queue gate holds narrative sends while a gating job is active. The world_gen
// fill route is exempt: fill routes do not lock input (see the server module's own note).
// my_llm_jobs is per identity, so the gate cannot be narrowed to one character.
//
// No timers and no Vue here: the caller owns the rotation counter.

import {
  LLM_CREATION_CONSOLE_ROUTES,
  LLM_CREATION_ONLY_ROUTES,
  LLM_INDICATOR_ACTIVE_STATUSES,
  LLM_INDICATOR_FALLBACK_LINE,
  LLM_INDICATOR_LINES,
  LLM_INDICATOR_POOLS,
  LLM_INDICATOR_PRIORITY,
  LLM_QUEUE_EXEMPT_ROUTES,
} from '@game-data/llm_indicator_lines';

export type LlmConsoleScope = 'creation' | 'game';

export interface LlmJobRowLike {
  id: bigint;
  route: string;
  status: string;
  createdAt?: { microsSinceUnixEpoch: bigint } | null;
}

export interface LlmIndicatorState {
  active: boolean;
  route: string | null;
  indicatorLine: string | null;
}

/**
 * Fill routes run after the reveal and do not lock the input (research S3); the families call (stage 2b) too.
 * The list is the server module's (code review B, IN-04); the client keeps no copy.
 */
export const QUEUE_EXEMPT_ROUTES: readonly string[] = LLM_QUEUE_EXEMPT_ROUTES;

function has(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function createdMicros(row: LlmJobRowLike): bigint {
  return row.createdAt?.microsSinceUnixEpoch ?? 0n;
}

/** True when a job on `route` belongs in the `scope` console. */
export function routeInConsoleScope(route: string, scope: LlmConsoleScope): boolean {
  return scope === 'creation'
    ? LLM_CREATION_CONSOLE_ROUTES.includes(route)
    : !LLM_CREATION_ONLY_ROUTES.includes(route);
}

/**
 * The line a route shows at a rotation: pool[rotation mod pool length] for a known route, null
 * for a silent route, the fallback line for an unknown route. Negative and huge rotations wrap.
 */
export function indicatorLineFor(route: string, rotation: number): string | null {
  if (!has(LLM_INDICATOR_LINES, route)) return LLM_INDICATOR_FALLBACK_LINE;
  const staticLine = LLM_INDICATOR_LINES[route];
  if (staticLine === null || staticLine === undefined) return null;
  const pool = has(LLM_INDICATOR_POOLS, route) ? LLM_INDICATOR_POOLS[route] : [];
  if (pool.length === 0) return staticLine;
  const step = Number.isFinite(rotation) ? Math.trunc(rotation) : 0;
  const index = ((step % pool.length) + pool.length) % pool.length;
  return pool[index];
}

/**
 * Pick the single indicator line. Active = status pending, in_flight or received and the route
 * is not silent. With a scope, rows outside that console are skipped. One row wins: highest
 * priority (an unknown route ranks after every known one), then oldest, then lowest id.
 * `rotation` only picks the pool line; it never changes which row wins.
 */
export function selectLlmIndicator(
  rows: readonly LlmJobRowLike[],
  scope?: LlmConsoleScope,
  rotation: number = 0,
): LlmIndicatorState {
  const unknownRank = LLM_INDICATOR_PRIORITY.length;
  let best: LlmJobRowLike | null = null;
  let bestLine: string | null = null;
  let bestRank = Infinity;

  for (const row of rows) {
    if (!LLM_INDICATOR_ACTIVE_STATUSES.includes(row.status)) continue;
    if (scope !== undefined && !routeInConsoleScope(row.route, scope)) continue;
    const line = indicatorLineFor(row.route, rotation);
    if (line === null) continue;

    const index = LLM_INDICATOR_PRIORITY.indexOf(row.route);
    const rank = index === -1 ? unknownRank : index;

    let better = false;
    if (best === null || rank < bestRank) {
      better = true;
    } else if (rank === bestRank) {
      const a = createdMicros(row);
      const b = createdMicros(best);
      better = a < b || (a === b && row.id < best.id);
    }
    if (better) {
      best = row;
      bestLine = line;
      bestRank = rank;
    }
  }

  if (best === null || bestLine === null) return { active: false, route: null, indicatorLine: null };
  return { active: true, route: best.route, indicatorLine: bestLine };
}

/**
 * True while narrative sends must wait: some row is active, in game scope, not silent and not an
 * exempt fill route.
 */
export function queueGateActive(rows: readonly LlmJobRowLike[]): boolean {
  for (const row of rows) {
    if (!LLM_INDICATOR_ACTIVE_STATUSES.includes(row.status)) continue;
    if (!routeInConsoleScope(row.route, 'game')) continue;
    if (QUEUE_EXEMPT_ROUTES.includes(row.route)) continue;
    if (indicatorLineFor(row.route, 0) === null) continue;
    return true;
  }
  return false;
}
