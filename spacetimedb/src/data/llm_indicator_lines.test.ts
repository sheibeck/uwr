import { describe, it, expect, vi } from 'vitest';
// This tsconfig has no @types/node; vitest runs the file in Node, so the built-ins resolve at runtime.
// @ts-ignore
import { readFileSync } from 'node:fs';
// @ts-ignore
import { fileURLToPath } from 'node:url';
import {
  LLM_INDICATOR_LINES,
  LLM_INDICATOR_FALLBACK_LINE,
  LLM_INDICATOR_PRIORITY,
  LLM_INDICATOR_SILENT_ROUTES,
  LLM_INDICATOR_ACTIVE_STATUSES,
  LLM_CREATION_CONSOLE_ROUTES,
  LLM_CREATION_ONLY_ROUTES,
  LLM_PROGRESS_ROTATE_MS,
  LLM_INDICATOR_POOLS,
  LLM_INPUT_LOCKING_WORLD_GEN_STEPS,
  LLM_INPUT_LOCKING_CREATION_STEPS,
} from './llm_indicator_lines';
import { LLM_ROUTE_NAMES } from './llm_routes';
import { KEEPER_BANNED_PHRASES } from './keeper_bible';
import { LLM_ACTIVE_JOB_STATUSES } from '../helpers/llm_queue';

// llm_queue.ts reaches the schema through ./llm_budget, so the recording server mock used by the
// other schema-aware tests is needed to load it in plain Node.
vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

// ============================================================================
// Shared indicator lines (Plan 42-02)
// ============================================================================
//
// The client shows one line per active LLM job route. The strings live on the server side
// (server is the source of truth) and the client imports them. This suite pins the copy
// (UI-SPEC Copywriting Contract), the Keeper voice, the in-game pronoun rule, route coverage
// and parity with the server's active job statuses.
// ============================================================================

// Phase 43 adds the stage-1 routes
const EXPECTED_LINES: Record<string, string | null> = {
  creation_race: 'The Keeper is considering your fate...',
  creation_class_reveal: 'The Keeper is deciding what you are good for...',
  creation_class: 'The Keeper is sorting out the rest of what you can do...',
  world_gen_start: 'The Keeper is unrolling a map, with visible reluctance...',
  world_gen: 'The Keeper is filling in the rest of the map, grudgingly...',
  skill_gen: 'The Keeper is weighing what you might become...',
  renown_perk_gen: 'The Keeper is tallying what your name is worth...',
  npc_conversation: 'The Keeper leans in to listen...',
  combat_narration: null,
  smoke_test: null,
};

const KEEPER_IT_OR_THEY = /\bKeeper\b[^.]*\b(its|itself|they|them|their|theirs|themselves)\b/;
const NEUTRAL_OR_FEMALE_PRONOUN = /\b(it|its|itself|they|them|their|theirs|themselves|she|her|hers|herself)\b/i;
const SECOND_PERSON_OTHER = /\b(yours|yourself|yourselves|thou|thee|thy|thine)\b/i;

const nonNullLines = Object.entries(LLM_INDICATOR_LINES).filter(
  (entry): entry is [string, string] => entry[1] !== null,
);

describe('LLM_INDICATOR_LINES', () => {
  it('has exactly one key per route in LLM_ROUTE_NAMES', () => {
    expect(Object.keys(LLM_INDICATOR_LINES).sort()).toEqual([...LLM_ROUTE_NAMES].sort());
  });

  it('carries the UI-SPEC copy word for word, null for the silent routes', () => {
    expect({ ...LLM_INDICATOR_LINES }).toEqual(EXPECTED_LINES);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(LLM_INDICATOR_LINES)).toBe(true);
    expect(Object.isFrozen(LLM_INDICATOR_PRIORITY)).toBe(true);
    expect(Object.isFrozen(LLM_INDICATOR_SILENT_ROUTES)).toBe(true);
    expect(Object.isFrozen(LLM_INDICATOR_ACTIVE_STATUSES)).toBe(true);
  });
});

describe('LLM_INDICATOR_FALLBACK_LINE', () => {
  it('equals the creation_race line', () => {
    expect(LLM_INDICATOR_FALLBACK_LINE).toBe('The Keeper is considering your fate...');
    expect(LLM_INDICATOR_FALLBACK_LINE).toBe(LLM_INDICATOR_LINES.creation_race);
  });
});

describe('LLM_INDICATOR_PRIORITY and LLM_INDICATOR_SILENT_ROUTES', () => {
  it('orders the eight non-silent routes world_gen_start first, npc_conversation last', () => {
    // Phase 43 adds the stage-1 routes
    expect([...LLM_INDICATOR_PRIORITY]).toEqual([
      'world_gen_start',
      'creation_race',
      'creation_class_reveal',
      'creation_class',
      'world_gen',
      'skill_gen',
      'renown_perk_gen',
      'npc_conversation',
    ]);
  });

  it('priority is exactly the routes that have a line', () => {
    expect([...LLM_INDICATOR_PRIORITY].sort()).toEqual(nonNullLines.map(([route]) => route).sort());
  });

  it('silent routes are combat_narration and smoke_test and map to null', () => {
    expect([...LLM_INDICATOR_SILENT_ROUTES]).toEqual(['combat_narration', 'smoke_test']);
    for (const route of LLM_INDICATOR_SILENT_ROUTES) expect(LLM_INDICATOR_LINES[route]).toBeNull();
  });

  it('priority plus silent routes cover every route once', () => {
    const all = [...LLM_INDICATOR_PRIORITY, ...LLM_INDICATOR_SILENT_ROUTES];
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual([...LLM_ROUTE_NAMES].sort());
  });
});

describe('console scoping routes (WR-02)', () => {
  it('the creation console shows creation work and world generation only', () => {
    // Phase 43 adds the stage-1 routes
    expect([...LLM_CREATION_CONSOLE_ROUTES]).toEqual([
      'creation_race',
      'creation_class_reveal',
      'creation_class',
      'world_gen_start',
      'world_gen',
    ]);
  });

  it('creation-only routes are the creation console routes minus the world generation routes', () => {
    // Phase 43 adds the stage-1 routes
    expect([...LLM_CREATION_ONLY_ROUTES]).toEqual(['creation_race', 'creation_class_reveal', 'creation_class']);
    for (const route of LLM_CREATION_ONLY_ROUTES) expect(LLM_CREATION_CONSOLE_ROUTES).toContain(route);
    expect(LLM_CREATION_ONLY_ROUTES).not.toContain('world_gen');
    expect(LLM_CREATION_ONLY_ROUTES).not.toContain('world_gen_start');
  });

  it('every scoped route is a real, non-silent route', () => {
    for (const route of [...LLM_CREATION_CONSOLE_ROUTES, ...LLM_CREATION_ONLY_ROUTES]) {
      expect(LLM_ROUTE_NAMES as readonly string[]).toContain(route);
      expect(LLM_INDICATOR_LINES[route]).not.toBeNull();
    }
  });

  it('is frozen', () => {
    expect(Object.isFrozen(LLM_CREATION_CONSOLE_ROUTES)).toBe(true);
    expect(Object.isFrozen(LLM_CREATION_ONLY_ROUTES)).toBe(true);
  });
});

describe('LLM_INDICATOR_ACTIVE_STATUSES', () => {
  it('equals the server LLM_ACTIVE_JOB_STATUSES (client and server never drift)', () => {
    expect([...LLM_INDICATOR_ACTIVE_STATUSES]).toEqual([...LLM_ACTIVE_JOB_STATUSES]);
    expect([...LLM_INDICATOR_ACTIVE_STATUSES]).toEqual(['pending', 'in_flight', 'received']);
  });
});

describe('indicator line voice and pronoun rule', () => {
  it('has eight non-null lines to check', () => {
    // Phase 43 adds the stage-1 routes
    expect(nonNullLines).toHaveLength(8);
  });

  for (const [route, line] of nonNullLines) {
    describe(route, () => {
      it('starts with The Keeper', () => {
        expect(line.startsWith('The Keeper')).toBe(true);
      });

      it('ends with three ASCII dots, not the single ellipsis character', () => {
        expect(line.endsWith('...')).toBe(true);
        expect(line.endsWith('....')).toBe(false);
        expect(line).not.toContain('…');
      });

      it('has no exclamation mark and no banned phrase', () => {
        expect(line).not.toContain('!');
        for (const phrase of KEEPER_BANNED_PHRASES) {
          expect(line.toLowerCase()).not.toContain(phrase.toLowerCase());
        }
      });

      it('never uses it, its, they, them, their, she or her', () => {
        expect(line).not.toMatch(KEEPER_IT_OR_THEY);
        expect(line).not.toMatch(NEUTRAL_OR_FEMALE_PRONOUN);
      });

      it('addresses the player only as you or your', () => {
        expect(line).not.toMatch(SECOND_PERSON_OTHER);
      });
    });
  }
});

// ============================================================================
// Progress-line pools (Plan 43-09, LAT-05)
// ============================================================================

const POOLS_WITH_AT_LEAST_THREE = [
  'creation_race',
  'creation_class_reveal',
  'creation_class',
  'world_gen_start',
  'world_gen',
];

const poolLines: Array<[string, string]> = Object.entries(LLM_INDICATOR_POOLS).flatMap(
  ([route, pool]) => pool.map((line): [string, string] => [route, line]),
);

describe('LLM_PROGRESS_ROTATE_MS', () => {
  it('is five seconds', () => {
    expect(LLM_PROGRESS_ROTATE_MS).toBe(5000);
  });
});

describe('LLM_INDICATOR_POOLS', () => {
  it('has exactly one key per route in LLM_ROUTE_NAMES', () => {
    expect(Object.keys(LLM_INDICATOR_POOLS).sort()).toEqual([...LLM_ROUTE_NAMES].sort());
  });

  it('maps silent routes to an empty array', () => {
    for (const route of LLM_INDICATOR_SILENT_ROUTES) expect(LLM_INDICATOR_POOLS[route]).toEqual([]);
  });

  it('starts every non-silent pool with the Phase 42 line (rotation 0 is unchanged)', () => {
    for (const [route, line] of nonNullLines) {
      expect(LLM_INDICATOR_POOLS[route][0]).toBe(line);
    }
  });

  it('gives the staged and creation routes at least three lines', () => {
    for (const route of POOLS_WITH_AT_LEAST_THREE) {
      expect(LLM_INDICATOR_POOLS[route].length).toBeGreaterThanOrEqual(3);
    }
  });

  it('gives every other non-silent route exactly its one Phase 42 line', () => {
    for (const [route, line] of nonNullLines) {
      if (POOLS_WITH_AT_LEAST_THREE.includes(route)) continue;
      expect([...LLM_INDICATOR_POOLS[route]]).toEqual([line]);
    }
  });

  it('has unique lines within each pool', () => {
    for (const [route, pool] of Object.entries(LLM_INDICATOR_POOLS)) {
      expect(new Set(pool).size, route).toBe(pool.length);
    }
  });

  it('is frozen, including every pool', () => {
    expect(Object.isFrozen(LLM_INDICATOR_POOLS)).toBe(true);
    for (const pool of Object.values(LLM_INDICATOR_POOLS)) expect(Object.isFrozen(pool)).toBe(true);
  });

  it('has pool lines to check', () => {
    expect(poolLines.length).toBeGreaterThan(nonNullLines.length);
  });

  for (const [route, line] of poolLines) {
    describe(`${route}: ${line}`, () => {
      it('starts with The Keeper and ends with three ASCII dots', () => {
        expect(line.startsWith('The Keeper')).toBe(true);
        expect(line.endsWith('...')).toBe(true);
        expect(line.endsWith('....')).toBe(false);
        expect(line).not.toContain('…');
      });

      it('has no exclamation mark and no banned phrase', () => {
        expect(line).not.toContain('!');
        for (const phrase of KEEPER_BANNED_PHRASES) {
          expect(line.toLowerCase()).not.toContain(phrase.toLowerCase());
        }
      });

      it('never uses it, its, they, them, their, she or her', () => {
        expect(line).not.toMatch(KEEPER_IT_OR_THEY);
        expect(line).not.toMatch(NEUTRAL_OR_FEMALE_PRONOUN);
      });

      it('addresses the player only as you or your', () => {
        expect(line).not.toMatch(SECOND_PERSON_OTHER);
      });
    });
  }
});

describe('input-locking step lists (stage 2 never locks input)', () => {
  it('lists the stage-1 world-gen steps and the creation generating steps only', () => {
    expect([...LLM_INPUT_LOCKING_WORLD_GEN_STEPS]).toEqual(['PENDING', 'GENERATING']);
    expect([...LLM_INPUT_LOCKING_CREATION_STEPS]).toEqual(['GENERATING_RACE', 'GENERATING_CLASS']);
  });

  it('never contains a stage-2 step', () => {
    for (const step of ['FILLING', 'FILL_ERROR', 'CLASS_FILLING', 'CLASS_FILL_ERROR']) {
      expect(LLM_INPUT_LOCKING_WORLD_GEN_STEPS).not.toContain(step);
      expect(LLM_INPUT_LOCKING_CREATION_STEPS).not.toContain(step);
    }
  });

  it('is frozen', () => {
    expect(Object.isFrozen(LLM_INPUT_LOCKING_WORLD_GEN_STEPS)).toBe(true);
    expect(Object.isFrozen(LLM_INPUT_LOCKING_CREATION_STEPS)).toBe(true);
  });
});

describe('module source', () => {
  it('contains no import statement (the client bundle receives strings only)', () => {
    const path = fileURLToPath(new URL('./llm_indicator_lines.ts', import.meta.url));
    const source: string = readFileSync(path, 'utf8');
    const importLines = source.split(/\r?\n/).filter((l: string) => /^\s*import\b/.test(l));
    expect(importLines).toEqual([]);
  });
});
