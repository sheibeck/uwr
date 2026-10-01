import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
// This tsconfig loads @types/node, and vitest runs the file in Node.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  resolveDisplayedLine,
  routeInConsoleScope,
  selectLlmIndicator,
  useLlmStatus,
  type LlmJobStatusRow,
} from './useLlmStatus';
import {
  LLM_INDICATOR_FALLBACK_LINE,
  LLM_INDICATOR_LINES,
} from '../../spacetimedb/src/data/llm_indicator_lines';

const INACTIVE = { active: false, route: null, indicatorLine: null };

function row(
  id: bigint,
  route: string,
  status: string,
  micros: bigint | null = 1_000n,
): LlmJobStatusRow {
  return {
    id,
    route,
    status,
    createdAt: micros === null ? null : { microsSinceUnixEpoch: micros },
  };
}

describe('selectLlmIndicator', () => {
  it('returns the inactive result for an empty list', () => {
    expect(selectLlmIndicator([])).toEqual(INACTIVE);
  });

  it.each(['pending', 'in_flight', 'received'])('shows the route line for a %s job', (status) => {
    expect(selectLlmIndicator([row(1n, 'skill_gen', status)])).toEqual({
      active: true,
      route: 'skill_gen',
      indicatorLine: LLM_INDICATOR_LINES.skill_gen,
    });
  });

  it.each(['completed', 'failed', 'expired'])('never treats a %s job as active', (status) => {
    expect(selectLlmIndicator([row(1n, 'skill_gen', status)])).toEqual(INACTIVE);
    expect(selectLlmIndicator([row(1n, 'world_gen', status)])).toEqual(INACTIVE);
  });

  it('ignores a terminal job when an active one is present', () => {
    const result = selectLlmIndicator([
      row(1n, 'world_gen', 'failed'),
      row(2n, 'npc_conversation', 'pending'),
    ]);
    expect(result.route).toBe('npc_conversation');
  });

  it('never shows a silent route, even as the only active job', () => {
    expect(selectLlmIndicator([row(1n, 'combat_narration', 'pending')])).toEqual(INACTIVE);
    expect(selectLlmIndicator([row(1n, 'smoke_test', 'in_flight')])).toEqual(INACTIVE);
  });

  it('skips a silent job and shows the other active job', () => {
    const result = selectLlmIndicator([
      row(1n, 'combat_narration', 'pending'),
      row(2n, 'npc_conversation', 'pending'),
    ]);
    expect(result.route).toBe('npc_conversation');
  });

  it('picks world_gen over npc_conversation', () => {
    const result = selectLlmIndicator([
      row(1n, 'npc_conversation', 'pending'),
      row(2n, 'world_gen', 'in_flight'),
    ]);
    expect(result.route).toBe('world_gen');
    expect(result.indicatorLine).toBe(LLM_INDICATOR_LINES.world_gen);
  });

  it('picks creation_class over skill_gen', () => {
    const result = selectLlmIndicator([
      row(1n, 'skill_gen', 'pending'),
      row(2n, 'creation_class', 'pending'),
    ]);
    expect(result.route).toBe('creation_class');
  });

  it('follows the documented priority order across every route', () => {
    // Phase 43 adds the stage-1 routes
    const order = [
      'world_gen_start',
      'creation_race',
      'creation_class_reveal',
      'creation_class',
      'world_gen',
      'skill_gen',
      'renown_perk_gen',
      'npc_conversation',
    ];
    for (let i = 0; i < order.length; i += 1) {
      const rest = order.slice(i);
      const rows = [...rest].reverse().map((route, n) => row(BigInt(n + 1), route, 'pending'));
      expect(selectLlmIndicator(rows).route).toBe(order[i]);
    }
  });

  it('shows one line for two active jobs on one route', () => {
    const result = selectLlmIndicator([
      row(1n, 'npc_conversation', 'pending', 5_000n),
      row(2n, 'npc_conversation', 'pending', 2_000n),
    ]);
    expect(result).toEqual({
      active: true,
      route: 'npc_conversation',
      indicatorLine: LLM_INDICATOR_LINES.npc_conversation,
    });
  });

  it('breaks an equal createdAt by the lower id, comparing bigints (not strings)', () => {
    // The result does not expose the id, so two unknown routes (same fallback line, same rank)
    // let the test see which row the tie-break kept.
    const a = selectLlmIndicator([
      row(10n, 'mystery_b', 'pending', 7n),
      row(9n, 'mystery_a', 'pending', 7n),
    ]);
    expect(a.route).toBe('mystery_a');
    const b = selectLlmIndicator([
      row(9n, 'mystery_a', 'pending', 7n),
      row(10n, 'mystery_b', 'pending', 7n),
    ]);
    expect(b.route).toBe('mystery_a');
    // 9 < 10 as bigints, although '10' < '9' as strings.
    const c = selectLlmIndicator([
      row(100n, 'mystery_x', 'pending', 7n),
      row(99n, 'mystery_y', 'pending', 7n),
    ]);
    expect(c.route).toBe('mystery_y');
  });

  it('breaks a priority tie by the older createdAt before the id', () => {
    const result = selectLlmIndicator([
      row(1n, 'mystery_new', 'pending', 9_000n),
      row(2n, 'mystery_old', 'pending', 3_000n),
    ]);
    expect(result.route).toBe('mystery_old');
  });

  it('uses the fallback line for an unknown active route', () => {
    expect(selectLlmIndicator([row(1n, 'mystery_route', 'pending')])).toEqual({
      active: true,
      route: 'mystery_route',
      indicatorLine: LLM_INDICATOR_FALLBACK_LINE,
    });
  });

  it('lets any known active route beat an unknown one', () => {
    const result = selectLlmIndicator([
      row(1n, 'mystery_route', 'pending', 1n),
      row(2n, 'npc_conversation', 'pending', 99n),
    ]);
    expect(result.route).toBe('npc_conversation');
  });

  it('sorts a missing createdAt as time 0 without throwing', () => {
    const rows: LlmJobStatusRow[] = [
      row(1n, 'mystery_a', 'pending', 500n),
      { id: 2n, route: 'mystery_b', status: 'pending' },
      row(3n, 'mystery_c', 'pending', null),
    ];
    expect(selectLlmIndicator(rows).route).toBe('mystery_b');
  });

  it('returns exactly the keys active, route and indicatorLine', () => {
    expect(Object.keys(selectLlmIndicator([row(1n, 'skill_gen', 'pending')])).sort()).toEqual([
      'active',
      'indicatorLine',
      'route',
    ]);
    expect(Object.keys(selectLlmIndicator([])).sort()).toEqual(['active', 'indicatorLine', 'route']);
  });

  it('does not mutate its input', () => {
    const rows = [row(2n, 'npc_conversation', 'pending'), row(1n, 'world_gen', 'pending')];
    const copy = [...rows];
    selectLlmIndicator(rows);
    expect(rows).toEqual(copy);
  });
});

describe('resolveDisplayedLine', () => {
  it('returns the status line when there is one', () => {
    expect(resolveDisplayedLine('x', false)).toBe('x');
    expect(resolveDisplayedLine('x', true)).toBe('x');
  });

  it('returns the fallback only when locked and there is no status line', () => {
    expect(resolveDisplayedLine(null, true)).toBe(LLM_INDICATOR_FALLBACK_LINE);
  });

  it('returns null when unlocked with no status line', () => {
    expect(resolveDisplayedLine(null, false)).toBeNull();
  });
});

describe('useLlmStatus', () => {
  it('recomputes when the ref value is replaced', () => {
    const llmJobs = ref<readonly LlmJobStatusRow[]>([]);
    const { status } = useLlmStatus({ llmJobs });
    expect(status.value).toEqual(INACTIVE);

    llmJobs.value = [row(1n, 'world_gen', 'pending')];
    expect(status.value.route).toBe('world_gen');
    expect(status.value.active).toBe(true);

    llmJobs.value = [row(1n, 'world_gen', 'completed')];
    expect(status.value).toEqual(INACTIVE);
  });
});

describe('console scoping (WR-02)', () => {
  it('the creation console shows only creation and world-gen routes', () => {
    // Phase 43 adds the stage-1 routes
    for (const route of ['creation_race', 'creation_class_reveal', 'creation_class', 'world_gen_start', 'world_gen']) {
      expect(routeInConsoleScope(route, 'creation')).toBe(true);
    }
    for (const route of ['skill_gen', 'renown_perk_gen', 'npc_conversation', 'combat_narration', 'unknown_route']) {
      expect(routeInConsoleScope(route, 'creation')).toBe(false);
    }
  });

  it('the game console shows everything except creation routes', () => {
    // Phase 43 adds the stage-1 routes
    for (const route of ['world_gen_start', 'world_gen', 'skill_gen', 'renown_perk_gen', 'npc_conversation', 'unknown_route']) {
      expect(routeInConsoleScope(route, 'game')).toBe(true);
    }
    expect(routeInConsoleScope('creation_race', 'game')).toBe(false);
    expect(routeInConsoleScope('creation_class', 'game')).toBe(false);
    expect(routeInConsoleScope('creation_class_reveal', 'game')).toBe(false);
  });

  it('a background renown job from another character never shows in the creation console', () => {
    const rows = [row(1n, 'renown_perk_gen', 'in_flight')];
    expect(selectLlmIndicator(rows, 'creation')).toEqual(INACTIVE);
    expect(selectLlmIndicator(rows, 'game').indicatorLine).toBe(LLM_INDICATOR_LINES.renown_perk_gen);
  });

  it('an NPC chat or skill job never shows in the creation console', () => {
    const rows = [row(1n, 'npc_conversation', 'pending'), row(2n, 'skill_gen', 'received')];
    expect(selectLlmIndicator(rows, 'creation')).toEqual(INACTIVE);
  });

  it('a creation job never shows in the game console', () => {
    const rows = [row(1n, 'creation_race', 'in_flight'), row(2n, 'npc_conversation', 'pending')];
    expect(selectLlmIndicator(rows, 'game').route).toBe('npc_conversation');
    expect(selectLlmIndicator([row(3n, 'creation_class', 'pending')], 'game')).toEqual(INACTIVE);
    expect(selectLlmIndicator(rows, 'creation').route).toBe('creation_race');
  });

  it('world_gen shows in both consoles (starter region at creation, explore in game)', () => {
    const rows = [row(1n, 'world_gen', 'in_flight')];
    expect(selectLlmIndicator(rows, 'creation').route).toBe('world_gen');
    expect(selectLlmIndicator(rows, 'game').route).toBe('world_gen');
  });

  it('without a scope every route is considered (unchanged behavior)', () => {
    const rows = [row(1n, 'creation_race', 'pending'), row(2n, 'renown_perk_gen', 'pending')];
    expect(selectLlmIndicator(rows).route).toBe('creation_race');
  });

  it('useLlmStatus exposes a creation and a game status that recompute from the same ref', () => {
    const llmJobs = ref<readonly LlmJobStatusRow[]>([row(1n, 'skill_gen', 'pending')]);
    const { creationStatus, gameStatus } = useLlmStatus({ llmJobs });
    expect(creationStatus.value).toEqual(INACTIVE);
    expect(gameStatus.value.route).toBe('skill_gen');

    llmJobs.value = [row(2n, 'creation_class', 'pending')];
    expect(creationStatus.value.route).toBe('creation_class');
    expect(gameStatus.value).toEqual(INACTIVE);
  });
});

describe('useLlmStatus source', () => {
  it('reads no error detail and never mentions userMessage or errorCode', () => {
    const path = fileURLToPath(new URL('./useLlmStatus.ts', import.meta.url));
    const source = readFileSync(path, 'utf8');
    expect(source).not.toMatch(/userMessage|errorCode/);
  });

  it('imports the shared indicator constants from the server data module', () => {
    const path = fileURLToPath(new URL('./useLlmStatus.ts', import.meta.url));
    const source = readFileSync(path, 'utf8');
    expect(source).toContain('spacetimedb/src/data/llm_indicator_lines');
  });
});
