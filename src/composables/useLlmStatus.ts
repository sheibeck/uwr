import { computed, type ComputedRef, type Ref } from 'vue';
import {
  LLM_INDICATOR_ACTIVE_STATUSES,
  LLM_INDICATOR_FALLBACK_LINE,
  LLM_INDICATOR_LINES,
  LLM_INDICATOR_PRIORITY,
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
//   to a terminal status.
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
 * Pick the single indicator line for the player's jobs.
 *
 * Active = status pending, in_flight or received, and the route is not silent. Exactly one row
 * wins: the highest-priority route (an unknown route ranks 7th, after every known one and uses
 * the fallback line), then the oldest createdAt, then the lowest id.
 */
export function selectLlmIndicator(rows: readonly LlmJobStatusRow[]): LlmIndicatorState {
  const unknownRank = LLM_INDICATOR_PRIORITY.length;
  let best: LlmJobStatusRow | null = null;
  let bestLine: string | null = null;
  let bestRank = Infinity;

  for (const row of rows) {
    if (!LLM_INDICATOR_ACTIVE_STATUSES.includes(row.status)) continue;

    const known = Object.prototype.hasOwnProperty.call(LLM_INDICATOR_LINES, row.route);
    const line = known ? LLM_INDICATOR_LINES[row.route] : LLM_INDICATOR_FALLBACK_LINE;
    if (line === null || line === undefined) continue; // silent route

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

/** Thin reactive wrapper over selectLlmIndicator. */
export function useLlmStatus({
  llmJobs,
}: {
  llmJobs: Ref<readonly LlmJobStatusRow[]>;
}): { status: ComputedRef<LlmIndicatorState> } {
  return { status: computed(() => selectLlmIndicator(llmJobs.value)) };
}
