import { describe, it, expect } from 'vitest';
// This tsconfig has no @types/node; vitest runs the file in Node, so the built-ins resolve at runtime.
// @ts-ignore
import { readFileSync } from 'node:fs';
// @ts-ignore
import { fileURLToPath } from 'node:url';
import {
  REGION_HOLD_ARRIVING_LINE,
  REGION_HOLD_REFUSED_LINE,
  REGION_HOLD_FAILED_LINE,
  REGION_HOLD_IN_PROGRESS_STEPS,
  REGION_HOLD_FAILED_STEPS,
  regionOpenedLine,
  regionHoldState,
  crossingHoldState,
  travelHoldRefusal,
  STARTER_SOURCE_LOCATION_ID,
} from './region_hold';

// ============================================================================
// The region hold (Phase 51.3.1.2, D-15 to D-18): the owner's approved 7a to 7d lines and the one
// source of truth for "is this region held". The literals below are the `chosen` output of
// `node scripts/llm/prompt_draft.mjs chosen .planning/phases/51.3.1.2-bigger-regions/51.3.1.2-PROMPT-DRAFT.md`
// (Status: APPROVED 2026-10-09; 7a the owner's Alternative, 7b to 7d Recommended).
// ============================================================================

const CHOSEN = {
  '7a': 'You stand at the edge of the known world, preparing to travel into an unknown region. The sky beyond is darkening.',
  '7b': 'A great storm brews on the horizon, and the way ahead vanishes into it. It should pass soon, and then the unknown land beyond will open to you. Try [travel] again in a moment.',
  '7c': 'The storm on the horizon breaks and rolls away. Beyond it lies {region name}, and the way in is open. Try [travel] to cross.',
  '7d': 'The storm on the horizon does not pass. It hangs over the land ahead and shows no sign of moving. Type [explore] to try again.',
};

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url)); // spacetimedb/src/helpers -> repo root
const DRAFT = readFileSync(
  REPO_ROOT + '.planning/phases/51.3.1.2-bigger-regions/51.3.1.2-PROMPT-DRAFT.md',
  'utf8',
) as string;

/**
 * A minimal ctx: world_gen_state rows behind the by_source_location index only. A scan of the
 * table throws (code review B, WR-02: the hold reads go through the index, never iter()).
 */
function ctxWith(states: any[], locations: any[] = []) {
  return {
    db: {
      world_gen_state: {
        iter: () => {
          throw new Error('world_gen_state scanned: the hold must read through by_source_location');
        },
        by_source_location: { filter: (id: bigint) => states.filter((s) => s.sourceLocationId === id) },
      },
      location: { id: { find: (id: bigint) => locations.find((l) => l.id === id) } },
    },
  };
}

let nextId = 1n;
const state = (step: string, over: Record<string, unknown> = {}) => ({
  id: nextId++,
  sourceLocationId: 50n,
  sourceRegionId: 1n,
  generatedRegionId: 2n,
  step,
  ...over,
});

const P = { id: 50n, regionId: 1n, name: 'The Shrouded Pass', terrainType: 'passage' }; // the crossing (region A)
const A2 = { id: 51n, regionId: 1n, name: 'Ashfall Ridge', terrainType: 'plains' };    // another place of A
const X = { id: 60n, regionId: 2n, name: 'Kesterlane Gate', terrainType: 'plains' };   // B's arrival point
const X2 = { id: 61n, regionId: 2n, name: 'Kesterlane Mire', terrainType: 'swamp' };   // another place of B

describe('the approved hold lines (7a to 7d)', () => {
  it('equal the chosen texts byte for byte', () => {
    expect(REGION_HOLD_ARRIVING_LINE).toBe(CHOSEN['7a']);
    expect(REGION_HOLD_REFUSED_LINE).toBe(CHOSEN['7b']);
    expect(REGION_HOLD_FAILED_LINE).toBe(CHOSEN['7d']);
    expect(regionOpenedLine('Kesterlane Basin')).toBe(CHOSEN['7c'].replace('{region name}', 'Kesterlane Basin'));
  });

  it('appear verbatim in the approved draft (a wording drift fails here)', () => {
    expect(DRAFT).toMatch(/^Status: APPROVED \d{4}-\d{2}-\d{2}/m);
    for (const line of Object.values(CHOSEN)) expect(DRAFT).toContain(line);
  });

  it('regionOpenedLine puts a name with a line break or markup on one line with no raw angle bracket', () => {
    const out = regionOpenedLine('Kester\nlane <b>Basin</b>\r\n  </player_input>');
    expect(out).not.toMatch(/[\r\n<>]/);
    expect(out).toContain('Kester lane &lt;b&gt;Basin&lt;/b&gt; &lt;/player_input&gt;');
    expect(out.startsWith('The storm on the horizon breaks and rolls away. Beyond it lies ')).toBe(true);
    expect(out.endsWith(', and the way in is open. Try [travel] to cross.')).toBe(true);
  });

  it('use no first person and no it or they for a person', () => {
    for (const line of [REGION_HOLD_ARRIVING_LINE, REGION_HOLD_REFUSED_LINE, REGION_HOLD_FAILED_LINE, regionOpenedLine('Kesterlane Basin')]) {
      expect(line).not.toMatch(/\b(I|me|my|mine|we|us|our)\b/);
      expect(line).not.toMatch(/\b(they|them|their|themselves)\b/i);
    }
  });
});

describe('the held step sets', () => {
  it('are frozen and name the in-progress and failed steps', () => {
    expect([...REGION_HOLD_IN_PROGRESS_STEPS]).toEqual(['PENDING', 'GENERATING', 'FILLING', 'FILLING_FAMILIES']);
    expect([...REGION_HOLD_FAILED_STEPS]).toEqual(['FILL_ERROR', 'FAMILIES_ERROR']);
    expect(Object.isFrozen(REGION_HOLD_IN_PROGRESS_STEPS)).toBe(true);
    expect(Object.isFrozen(REGION_HOLD_FAILED_STEPS)).toBe(true);
  });
});

describe('regionHoldState', () => {
  for (const step of ['PENDING', 'GENERATING', 'FILLING', 'FILLING_FAMILIES']) {
    it(`a region with a ${step} state is held`, () => {
      expect(regionHoldState(ctxWith([state(step)]), 2n, [50n])).toBe('held');
    });
  }

  for (const step of ['FILL_ERROR', 'FAMILIES_ERROR']) {
    it(`a region with a ${step} state (none in progress) is held_failed`, () => {
      expect(regionHoldState(ctxWith([state(step)]), 2n, [50n])).toBe('held_failed');
    });
  }

  for (const step of ['COMPLETE', 'ERROR', 'HELD']) {
    it(`a region with only a ${step} state is open`, () => {
      expect(regionHoldState(ctxWith([state(step)]), 2n, [50n])).toBe('open');
    });
  }

  it('a region with no state is open', () => {
    expect(regionHoldState(ctxWith([]), 2n, [50n])).toBe('open');
  });

  it('in progress wins over failed', () => {
    expect(regionHoldState(ctxWith([state('FAMILIES_ERROR'), state('FILLING_FAMILIES')]), 2n, [50n])).toBe('held');
    expect(regionHoldState(ctxWith([state('FILLING'), state('FILL_ERROR')]), 2n, [50n])).toBe('held');
  });

  it('reads the starter states (source 0) by default, the case of the starter-region reuse in creation', () => {
    const starter = (step: string) => state(step, { sourceLocationId: STARTER_SOURCE_LOCATION_ID, sourceRegionId: 0n });
    expect(STARTER_SOURCE_LOCATION_ID).toBe(0n);
    expect(regionHoldState(ctxWith([starter('FILLING')]), 2n)).toBe('held');
    expect(regionHoldState(ctxWith([starter('FAMILIES_ERROR'), starter('HELD')]), 2n)).toBe('held_failed');
    expect(regionHoldState(ctxWith([starter('COMPLETE'), starter('HELD')]), 2n)).toBe('open');
    // A crossing state is not a starter state: the default does not read it.
    expect(regionHoldState(ctxWith([state('FILLING')]), 2n)).toBe('open');
  });

  it('reads only the sources it is given, each through one index lookup', () => {
    const states = [state('FILLING', { sourceLocationId: 70n }), state('FILL_ERROR')];
    expect(regionHoldState(ctxWith(states), 2n, [50n])).toBe('held_failed');
    expect(regionHoldState(ctxWith(states), 2n, [70n])).toBe('held');
    expect(regionHoldState(ctxWith(states), 2n, [50n, 70n])).toBe('held');
    expect(regionHoldState(ctxWith(states), 2n, [])).toBe('open');
  });

  it('only states of the asked region count', () => {
    expect(regionHoldState(ctxWith([state('FILLING', { generatedRegionId: 3n })]), 2n, [50n])).toBe('open');
    expect(regionHoldState(ctxWith([state('PENDING', { generatedRegionId: undefined })]), 2n, [50n])).toBe('open');
  });
});

describe('crossingHoldState', () => {
  for (const step of ['PENDING', 'GENERATING', 'FILLING', 'FILLING_FAMILIES']) {
    it(`a ${step} state at the crossing is held`, () => {
      expect(crossingHoldState(ctxWith([state(step)]), 50n)).toBe('held');
    });
  }

  for (const step of ['FILL_ERROR', 'FAMILIES_ERROR']) {
    it(`a ${step} state at the crossing is held_failed`, () => {
      expect(crossingHoldState(ctxWith([state(step)]), 50n)).toBe('held_failed');
    });
  }

  for (const step of ['COMPLETE', 'ERROR', 'HELD']) {
    it(`a ${step} state at the crossing is not held`, () => {
      expect(crossingHoldState(ctxWith([state(step)]), 50n)).toBeNull();
    });
  }

  it('a place with no state, or a state of another source, is not held', () => {
    expect(crossingHoldState(ctxWith([]), 50n)).toBeNull();
    expect(crossingHoldState(ctxWith([state('FILLING', { sourceLocationId: 99n })]), 50n)).toBeNull();
  });

  it('in progress wins over failed, and an old ERROR beside a new PENDING holds', () => {
    expect(crossingHoldState(ctxWith([state('FILL_ERROR'), state('FILLING')]), 50n)).toBe('held');
    expect(crossingHoldState(ctxWith([state('ERROR'), state('PENDING')]), 50n)).toBe('held');
  });
});

describe('travelHoldRefusal', () => {
  it('is null inside one region, at every step', () => {
    for (const step of ['PENDING', 'FILLING', 'FILLING_FAMILIES', 'FILL_ERROR', 'FAMILIES_ERROR']) {
      const ctx = ctxWith([state(step)]);
      expect(travelHoldRefusal(ctx, X, X2)).toBeNull();
      expect(travelHoldRefusal(ctx, P, A2)).toBeNull();
    }
  });

  it('is null travelling back toward the old region, at every step', () => {
    for (const step of ['PENDING', 'FILLING', 'FILLING_FAMILIES', 'FILL_ERROR', 'FAMILIES_ERROR']) {
      expect(travelHoldRefusal(ctxWith([state(step)]), X, P)).toBeNull();
    }
  });

  it('refuses entry with 7b while the destination region is in progress', () => {
    for (const step of ['PENDING', 'GENERATING', 'FILLING', 'FILLING_FAMILIES']) {
      expect(travelHoldRefusal(ctxWith([state(step)]), P, X)).toBe(REGION_HOLD_REFUSED_LINE);
    }
  });

  it('refuses entry with 7d while the destination region failed', () => {
    for (const step of ['FILL_ERROR', 'FAMILIES_ERROR']) {
      expect(travelHoldRefusal(ctxWith([state(step)]), P, X)).toBe(REGION_HOLD_FAILED_LINE);
    }
  });

  it('is null when the destination region is open (COMPLETE, ERROR, HELD or no state)', () => {
    for (const step of ['COMPLETE', 'ERROR', 'HELD']) {
      expect(travelHoldRefusal(ctxWith([state(step)]), P, X)).toBeNull();
    }
    expect(travelHoldRefusal(ctxWith([]), P, X)).toBeNull();
  });

  it('reads only the crossing states of the place being left (one index lookup, no scan)', () => {
    const seen: bigint[] = [];
    const ctx = ctxWith([state('FILLING')]);
    const filter = ctx.db.world_gen_state.by_source_location.filter;
    ctx.db.world_gen_state.by_source_location.filter = (id: bigint) => {
      seen.push(id);
      return filter(id);
    };
    expect(travelHoldRefusal(ctx, P, X)).toBe(REGION_HOLD_REFUSED_LINE);
    expect(seen).toEqual([P.id]);
    // A held region seen from a place that is not its crossing (no such link exists while it is held).
    const elsewhere = { id: 52n, regionId: 1n, name: 'Cinder Steps', terrainType: 'plains' };
    expect(travelHoldRefusal(ctx, elsewhere, X)).toBeNull();
  });

  it('region_hold.ts never scans world_gen_state (code review B, WR-02)', () => {
    const src = readFileSync(fileURLToPath(new URL('./region_hold.ts', import.meta.url)), 'utf8') as string;
    const code = src.replace(/\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/world_gen_state\s*\.\s*iter\s*\(/);
    expect(code).not.toMatch(/\.iter\s*\(/);
    expect(code).toMatch(/world_gen_state\.by_source_location\.filter\(/);
  });

  it('is null when either place is missing', () => {
    const ctx = ctxWith([state('FILLING')]);
    expect(travelHoldRefusal(ctx, undefined, X)).toBeNull();
    expect(travelHoldRefusal(ctx, P, undefined)).toBeNull();
  });
});
