import { computed, getCurrentScope, onScopeDispose, ref, type ComputedRef, type Ref } from 'vue';
import {
  LLM_CREATION_CONSOLE_ROUTES,
  LLM_CREATION_ONLY_ROUTES,
  LLM_INDICATOR_ACTIVE_STATUSES,
  LLM_INDICATOR_FALLBACK_LINE,
  LLM_INDICATOR_LINES,
  LLM_INDICATOR_POOLS,
  LLM_INDICATOR_PRIORITY,
  LLM_PROGRESS_ROTATE_MS,
} from '../../spacetimedb/src/data/llm_indicator_lines';

// ============================================================================
// useLlmStatus: which "the Keeper is working" line to show (Plan 42-02)
// ============================================================================
//
// Reads only my_llm_jobs rows (id, route, status, createdAt). The server's own job rows are
// the source of truth: nothing here talks to a provider.
//
// - Error detail is never read or shown. A failure is the server's in-voice log line; the
//   client only lets the row leave the active set so the indicator clears.
// - There is no staleness timer. A stuck job clears only when the Phase 41 sweeper moves it
//   to a terminal status. The 5 s rotation (Plan 43-09) is not a staleness timer either: it
//   only changes which line of the route's pool shows while a job is active. Rotation 0 is the
//   Phase 42 line.
// - This never feeds the input lock. Creation and world-gen state rows lock input; background
//   jobs (skills, renown, NPC chat) show a line only.
//
// The behavior lives in exported pure functions (the repo's node tests have no DOM).
// ============================================================================

export type LlmJobStatusRow = {
  id: bigint;
  route: string;
  status: string;
  createdAt?: { microsSinceUnixEpoch: bigint } | null;
};

export type LlmIndicatorState = {
  active: boolean;
  route: string | null;
  indicatorLine: string | null;
};

const INACTIVE: LlmIndicatorState = { active: false, route: null, indicatorLine: null };

function createdMicros(row: LlmJobStatusRow): bigint {
  return row.createdAt?.microsSinceUnixEpoch ?? 0n;
}

/**
 * Which console the line is for. my_llm_jobs is per identity (no character id), so the scope
 * is by route: the creation console shows only creation and world-gen work, the game console
 * shows everything except creation work.
 */
export type LlmConsoleScope = 'creation' | 'game';

/** True when a job on `route` belongs in the `scope` console. */
export function routeInConsoleScope(route: string, scope: LlmConsoleScope): boolean {
  return scope === 'creation'
    ? LLM_CREATION_CONSOLE_ROUTES.includes(route)
    : !LLM_CREATION_ONLY_ROUTES.includes(route);
}

/**
 * The line a route shows at a given rotation: pool[rotation % pool.length] for a known route
 * with a pool, null for a silent route (empty pool or null line), the fallback line for an
 * unknown route at every rotation.
 */
export function indicatorLineFor(route: string, rotation: number): string | null {
  if (!Object.prototype.hasOwnProperty.call(LLM_INDICATOR_LINES, route)) {
    return LLM_INDICATOR_FALLBACK_LINE;
  }
  const staticLine = LLM_INDICATOR_LINES[route];
  if (staticLine === null || staticLine === undefined) return null; // silent route
  const pool = Object.prototype.hasOwnProperty.call(LLM_INDICATOR_POOLS, route)
    ? LLM_INDICATOR_POOLS[route]
    : [];
  if (pool.length === 0) return staticLine;
  const index = ((Math.trunc(rotation) % pool.length) + pool.length) % pool.length;
  return pool[index];
}

/**
 * Pick the single indicator line for the player's jobs.
 *
 * Active = status pending, in_flight or received, and the route is not silent. With a scope,
 * rows whose route does not belong in that console are skipped. Exactly one row wins: the
 * highest-priority route (an unknown route ranks 7th, after every known one and uses the
 * fallback line), then the oldest createdAt, then the lowest id. `rotation` (default 0, the
 * Phase 42 line) picks which line of the winning route's pool shows; it never changes which
 * row wins.
 */
export function selectLlmIndicator(
  rows: readonly LlmJobStatusRow[],
  scope?: LlmConsoleScope,
  rotation: number = 0,
): LlmIndicatorState {
  const unknownRank = LLM_INDICATOR_PRIORITY.length;
  let best: LlmJobStatusRow | null = null;
  let bestLine: string | null = null;
  let bestRank = Infinity;

  for (const row of rows) {
    if (!LLM_INDICATOR_ACTIVE_STATUSES.includes(row.status)) continue;
    if (scope !== undefined && !routeInConsoleScope(row.route, scope)) continue;

    const line = indicatorLineFor(row.route, rotation);
    if (line === null) continue; // silent route

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

  if (best === null || bestLine === null) return { ...INACTIVE };
  return { active: true, route: best.route, indicatorLine: bestLine };
}

/**
 * The line the console shows: the status line when there is one, the fallback only when the
 * input is locked and there is no status line yet, otherwise nothing.
 */
export function resolveDisplayedLine(statusLine: string | null, inputLocked: boolean): string | null {
  return statusLine ?? (inputLocked ? LLM_INDICATOR_FALLBACK_LINE : null);
}

/**
 * Thin reactive wrapper over selectLlmIndicator, one status per console scope.
 *
 * Without an injected `rotation` ref it owns one 5 s interval that advances the rotation, cleared
 * with onScopeDispose. Outside any scope no timer is started (nothing could clear it).
 */
export function useLlmStatus({
  llmJobs,
  rotation,
}: {
  llmJobs: Ref<readonly LlmJobStatusRow[]>;
  rotation?: Ref<number>;
}): {
  status: ComputedRef<LlmIndicatorState>;
  creationStatus: ComputedRef<LlmIndicatorState>;
  gameStatus: ComputedRef<LlmIndicatorState>;
} {
  const tick = rotation ?? ref(0);

  if (rotation === undefined && getCurrentScope()) {
    const timer = setInterval(() => {
      tick.value += 1;
    }, LLM_PROGRESS_ROTATE_MS);
    onScopeDispose(() => clearInterval(timer));
  }

  return {
    status: computed(() => selectLlmIndicator(llmJobs.value, undefined, tick.value)),
    creationStatus: computed(() => selectLlmIndicator(llmJobs.value, 'creation', tick.value)),
    gameStatus: computed(() => selectLlmIndicator(llmJobs.value, 'game', tick.value)),
  };
}
