import { describe, expect, it } from 'vitest';
import {
  LLM_INDICATOR_FALLBACK_LINE,
  LLM_INDICATOR_LINES,
  LLM_INDICATOR_POOLS,
} from '@game-data/llm_indicator_lines';
import {
  QUEUE_EXEMPT_ROUTES,
  indicatorLineFor,
  queueGateActive,
  routeInConsoleScope,
  selectLlmIndicator,
} from './indicator';
import type { LlmJobRowLike } from './indicator';

function row(id: number, route: string, status = 'pending', created = 0): LlmJobRowLike {
  return { id: BigInt(id), route, status, createdAt: { microsSinceUnixEpoch: BigInt(created) } };
}

describe('indicatorLineFor', () => {
  it('returns pool[0] for a known route at rotation 0', () => {
    expect(indicatorLineFor('world_gen', 0)).toBe(LLM_INDICATOR_POOLS.world_gen[0]);
    expect(indicatorLineFor('npc_conversation', 0)).toBe(LLM_INDICATOR_POOLS.npc_conversation[0]);
  });

  it('rotates through the pool', () => {
    expect(indicatorLineFor('world_gen', 1)).toBe(LLM_INDICATOR_POOLS.world_gen[1]);
  });

  it('wraps negative and huge rotations', () => {
    const pool = LLM_INDICATOR_POOLS.world_gen;
    expect(indicatorLineFor('world_gen', pool.length)).toBe(pool[0]);
    expect(indicatorLineFor('world_gen', -1)).toBe(pool[pool.length - 1]);
    expect(indicatorLineFor('world_gen', 1_000_001)).toBe(pool[1_000_001 % pool.length]);
  });

  it('returns null for silent routes', () => {
    expect(indicatorLineFor('combat_narration', 0)).toBeNull();
    expect(indicatorLineFor('smoke_test', 3)).toBeNull();
  });

  it('returns the fallback line for an unknown route', () => {
    expect(indicatorLineFor('brand_new_route', 0)).toBe(LLM_INDICATOR_FALLBACK_LINE);
    expect(indicatorLineFor('toString', 2)).toBe(LLM_INDICATOR_FALLBACK_LINE);
  });
});

describe('routeInConsoleScope', () => {
  it('keeps creation-only routes out of the game console', () => {
    expect(routeInConsoleScope('creation_race', 'game')).toBe(false);
    expect(routeInConsoleScope('creation_class_reveal', 'game')).toBe(false);
    expect(routeInConsoleScope('creation_class', 'game')).toBe(false);
    expect(routeInConsoleScope('world_gen', 'game')).toBe(true);
    expect(routeInConsoleScope('world_gen_families', 'game')).toBe(true);
    expect(routeInConsoleScope('npc_conversation', 'game')).toBe(true);
  });

  it('limits the creation console to creation and world generation', () => {
    expect(routeInConsoleScope('creation_race', 'creation')).toBe(true);
    // Phase 51.3.1.2 (D-17): the starter region's families (stage 2b) show in the creation console.
    expect(routeInConsoleScope('world_gen_families', 'creation')).toBe(true);
    expect(routeInConsoleScope('npc_conversation', 'creation')).toBe(false);
  });
});

describe('selectLlmIndicator (game scope)', () => {
  it('returns inactive when there are no active rows', () => {
    expect(selectLlmIndicator([], 'game')).toEqual({ active: false, route: null, indicatorLine: null });
    expect(selectLlmIndicator([row(1, 'npc_conversation', 'done'), row(2, 'npc_conversation', 'failed')], 'game')).toEqual({
      active: false,
      route: null,
      indicatorLine: null,
    });
  });

  it('counts pending, in_flight and received as active', () => {
    for (const status of ['pending', 'in_flight', 'received']) {
      expect(selectLlmIndicator([row(1, 'npc_conversation', status)], 'game').active).toBe(true);
    }
  });

  it('ignores creation-only routes in game scope', () => {
    for (const route of ['creation_race', 'creation_class_reveal', 'creation_class']) {
      expect(selectLlmIndicator([row(1, route)], 'game').active).toBe(false);
    }
  });

  it('ignores silent routes', () => {
    expect(selectLlmIndicator([row(1, 'combat_narration'), row(2, 'smoke_test')], 'game').active).toBe(false);
  });

  it('prefers the higher-priority route', () => {
    const state = selectLlmIndicator([row(1, 'npc_conversation'), row(2, 'world_gen_start')], 'game');
    expect(state.route).toBe('world_gen_start');
    expect(state.indicatorLine).toBe(LLM_INDICATOR_LINES.world_gen_start);
  });

  it('prefers the oldest row, then the lowest id', () => {
    const older = selectLlmIndicator([row(5, 'world_gen', 'pending', 200), row(9, 'world_gen', 'pending', 100)], 'game');
    expect(older.route).toBe('world_gen');
    const rows = [row(7, 'npc_conversation', 'pending', 100), row(3, 'npc_conversation', 'pending', 100)];
    expect(selectLlmIndicator(rows, 'game').route).toBe('npc_conversation');
  });

  it('ranks an unknown route after every known one', () => {
    const state = selectLlmIndicator([row(1, 'mystery'), row(2, 'renown_perk_gen')], 'game');
    expect(state.route).toBe('renown_perk_gen');
    const only = selectLlmIndicator([row(1, 'mystery')], 'game');
    expect(only.route).toBe('mystery');
    expect(only.indicatorLine).toBe(LLM_INDICATOR_FALLBACK_LINE);
  });

  it('rotation changes the line but not the winner', () => {
    const rows = [row(1, 'world_gen')];
    const a = selectLlmIndicator(rows, 'game', 0);
    const b = selectLlmIndicator(rows, 'game', 1);
    expect(a.route).toBe(b.route);
    expect(a.indicatorLine).not.toBe(b.indicatorLine);
  });
});

describe('queueGateActive', () => {
  it('is true while a conversation job is pending', () => {
    expect(queueGateActive([row(1, 'npc_conversation')])).toBe(true);
  });

  it('is false for the exempt world_gen fill route', () => {
    expect(queueGateActive([row(1, 'world_gen', 'in_flight')])).toBe(false);
  });

  it('is false for the exempt world_gen_families route: the families call never holds input (Phase 51.3.1.2, D-17)', () => {
    expect(queueGateActive([row(1, 'world_gen_families', 'pending')])).toBe(false);
    expect(queueGateActive([row(1, 'world_gen_families', 'in_flight'), row(2, 'world_gen', 'received')])).toBe(false);
  });

  it('shows the families line in the creation and game consoles', () => {
    for (const scope of ['creation', 'game'] as const) {
      const state = selectLlmIndicator([row(1, 'world_gen_families')], scope);
      expect(state.route).toBe('world_gen_families');
      expect(state.indicatorLine).toBe(LLM_INDICATOR_LINES.world_gen_families);
    }
  });

  it('is true for the stage-1 world_gen_start route', () => {
    expect(queueGateActive([row(1, 'world_gen_start')])).toBe(true);
  });

  it('is false for creation routes in game scope', () => {
    expect(queueGateActive([row(1, 'creation_class')])).toBe(false);
  });

  it('is false for silent routes and terminal statuses', () => {
    expect(queueGateActive([row(1, 'combat_narration')])).toBe(false);
    expect(queueGateActive([row(1, 'npc_conversation', 'failed')])).toBe(false);
    expect(queueGateActive([row(1, 'npc_conversation', 'done')])).toBe(false);
  });

  it('is true for an unknown pending route', () => {
    expect(queueGateActive([row(1, 'mystery')])).toBe(true);
  });

  it('stays active when an exempt job runs next to a gating one', () => {
    expect(queueGateActive([row(1, 'world_gen'), row(2, 'skill_gen')])).toBe(true);
  });
});

describe('QUEUE_EXEMPT_ROUTES', () => {
  it('is the two fill routes world_gen and world_gen_families, and every entry is a server route', () => {
    expect([...QUEUE_EXEMPT_ROUTES]).toEqual(['world_gen', 'world_gen_families']);
    for (const route of QUEUE_EXEMPT_ROUTES) {
      expect(Object.prototype.hasOwnProperty.call(LLM_INDICATOR_LINES, route)).toBe(true);
    }
  });
});
