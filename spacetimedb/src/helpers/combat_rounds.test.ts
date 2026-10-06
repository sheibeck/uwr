/**
 * Phase 46.1 (RND-01, RND-02, RND-03): the pure round rules. No mocks: the module is pure.
 */
import { describe, it, expect } from 'vitest';
// @ts-ignore node types are not part of this module's tsconfig (same as other source-reading tests)
import { readFileSync } from 'node:fs';
// @ts-ignore see above
import { fileURLToPath } from 'node:url';
// @ts-ignore see above
import { join } from 'node:path';
import { ROUND_TIMER_MICROS, SOLO_TIMER_MICROS } from '../data/combat_constants';
import {
  ROUND_STATE,
  CHOICE_ACTION_TYPES,
  isChoiceActionType,
  durationMicrosToRounds,
  secondsToRounds,
  remainingMicrosToRounds,
  cooldownRounds,
  windupRounds,
  roundDeadlineMicros,
  roundsToEstimateMicros,
  roundsToWallClockMicros,
  decrementRounds,
  compareBigint,
  sortById,
  sortByKey,
  isWaitedOn,
  allChosen,
  autoAttackTargetId,
  isStaleTick,
  petAbilityDue,
  enemyAbilityReady,
  ROUND_SEED_STRIDE,
  roundSeed,
} from './combat_rounds';

describe('constants', () => {
  it('round timer is 10 seconds', () => {
    expect(ROUND_TIMER_MICROS).toBe(10_000_000n);
    expect(SOLO_TIMER_MICROS).toBe(10_000_000n);
  });
  it('round states', () => {
    expect(ROUND_STATE).toEqual({ select: 'action_select', resolving: 'resolving', resolved: 'resolved' });
    expect([...CHOICE_ACTION_TYPES]).toEqual(['ability', 'auto_attack', 'flee']);
  });
});

describe('secondsToRounds', () => {
  it.each([
    [0n, 1n], [1n, 1n], [3n, 1n], [4n, 1n],
    [5n, 2n], [8n, 2n],
    [9n, 3n], [12n, 3n],
    [13n, 4n],
    [180n, 45n],
  ])('%s seconds -> %s rounds', (s, r) => {
    expect(secondsToRounds(s)).toBe(r);
  });
  it('missing values give 1', () => {
    expect(secondsToRounds(undefined)).toBe(1n);
    expect(secondsToRounds(null)).toBe(1n);
  });
});

describe('durationMicrosToRounds', () => {
  it('uses ceil with a minimum of 1', () => {
    expect(durationMicrosToRounds(0n)).toBe(1n);
    expect(durationMicrosToRounds(1n)).toBe(1n);
    expect(durationMicrosToRounds(4_000_000n)).toBe(1n);
    expect(durationMicrosToRounds(4_000_001n)).toBe(2n);
    expect(durationMicrosToRounds(10_000_000n)).toBe(3n);
  });
});

describe('remainingMicrosToRounds', () => {
  it('is 0 when nothing remains, else ceil', () => {
    expect(remainingMicrosToRounds(0n)).toBe(0n);
    expect(remainingMicrosToRounds(-5n)).toBe(0n);
    expect(remainingMicrosToRounds(1n)).toBe(1n);
    expect(remainingMicrosToRounds(4_000_000n)).toBe(1n);
    expect(remainingMicrosToRounds(8_000_001n)).toBe(3n);
  });
});

describe('cooldownRounds', () => {
  it('is at least 1', () => {
    expect(cooldownRounds(0n)).toBe(1n);
    expect(cooldownRounds(undefined)).toBe(1n);
    expect(cooldownRounds(null)).toBe(1n);
    expect(cooldownRounds(4n)).toBe(1n);
    expect(cooldownRounds(8n)).toBe(2n);
    expect(cooldownRounds(12n)).toBe(3n);
  });
});

describe('windupRounds', () => {
  it('is 0 for a missing or zero cast time', () => {
    expect(windupRounds(0n)).toBe(0n);
    expect(windupRounds(undefined)).toBe(0n);
    expect(windupRounds(null)).toBe(0n);
    expect(windupRounds(-1n)).toBe(0n);
  });
  it('is at least 1 otherwise', () => {
    expect(windupRounds(1n)).toBe(1n);
    expect(windupRounds(2n)).toBe(1n);
    expect(windupRounds(4n)).toBe(1n);
    expect(windupRounds(5n)).toBe(2n);
  });
});

describe('cooldown meaning', () => {
  it.each([1n, 2n, 3n])('C = %s: used in round 4, choosable again from round 4 + C', (C) => {
    const N = 4n;
    let r = C;
    let firstChoosable: bigint | undefined;
    for (let R = N; R < N + 10n; R++) {
      r = decrementRounds(r); // end of round R
      if (r === 0n && firstChoosable === undefined) firstChoosable = R + 1n;
    }
    expect(firstChoosable).toBe(N + C);
  });
});

describe('time helpers', () => {
  it('deadline, estimate and wall-clock conversions', () => {
    expect(roundDeadlineMicros(1_000n)).toBe(10_001_000n);
    expect(roundsToEstimateMicros(3n)).toBe(30_000_000n);
    expect(roundsToWallClockMicros(3n)).toBe(12_000_000n);
  });
  it('decrementRounds floors at 0', () => {
    expect(decrementRounds(3n)).toBe(2n);
    expect(decrementRounds(1n)).toBe(0n);
    expect(decrementRounds(0n)).toBe(0n);
  });
});

describe('ordering', () => {
  it('compareBigint', () => {
    expect(compareBigint(1n, 2n)).toBe(-1);
    expect(compareBigint(2n, 2n)).toBe(0);
    expect(compareBigint(3n, 2n)).toBe(1);
  });
  it('sortById is ascending and does not mutate', () => {
    const input = [{ id: 5n }, { id: 1n }, { id: 3n }];
    const out = sortById(input);
    expect(out.map((r) => r.id)).toEqual([1n, 3n, 5n]);
    expect(input.map((r) => r.id)).toEqual([5n, 1n, 3n]);
    expect(out).not.toBe(input);
  });
  it('sortById handles values beyond Number precision', () => {
    const big = 2n ** 70n;
    const out = sortById([{ id: big + 1n }, { id: big }]);
    expect(out.map((r) => r.id)).toEqual([big, big + 1n]);
  });
  it('sortByKey sorts by a derived key without mutating', () => {
    const input = [{ characterId: 9n }, { characterId: 2n }, { characterId: 4n }];
    const out = sortByKey(input, (r) => r.characterId);
    expect(out.map((r) => r.characterId)).toEqual([2n, 4n, 9n]);
    expect(input.map((r) => r.characterId)).toEqual([9n, 2n, 4n]);
  });
});

describe('waiting and choices', () => {
  it('isWaitedOn', () => {
    expect(isWaitedOn('active', 1n)).toBe(true);
    expect(isWaitedOn('active', 0n)).toBe(false);
    expect(isWaitedOn('dead', 5n)).toBe(false);
    expect(isWaitedOn('fled', 5n)).toBe(false);
    expect(isWaitedOn('fleeing', 5n)).toBe(false);
  });
  it('allChosen', () => {
    expect(allChosen([], [])).toBe(true);
    expect(allChosen([1n, 2n], [2n])).toBe(false);
    expect(allChosen([1n, 2n], [2n, 1n, 9n])).toBe(true);
  });
  it('isChoiceActionType accepts exactly the three types', () => {
    expect(isChoiceActionType('ability')).toBe(true);
    expect(isChoiceActionType('auto_attack')).toBe(true);
    expect(isChoiceActionType('flee')).toBe(true);
    expect(isChoiceActionType('Ability')).toBe(false);
    expect(isChoiceActionType('')).toBe(false);
    expect(isChoiceActionType(undefined)).toBe(false);
    expect(isChoiceActionType(7)).toBe(false);
  });
});

describe('autoAttackTargetId', () => {
  it('keeps a living current target', () => {
    expect(autoAttackTargetId(3n, [2n, 3n])).toBe(3n);
  });
  it('falls back to the lowest living id', () => {
    expect(autoAttackTargetId(7n, [4n, 2n])).toBe(2n);
    expect(autoAttackTargetId(undefined, [9n, 4n])).toBe(4n);
    expect(autoAttackTargetId(null, [9n, 4n])).toBe(4n);
  });
  it('is undefined with nothing alive', () => {
    expect(autoAttackTargetId(3n, [])).toBeUndefined();
    expect(autoAttackTargetId(undefined, [])).toBeUndefined();
  });
});

describe('isStaleTick', () => {
  it('rejects ticks that no longer match an open round', () => {
    expect(isStaleTick(2n, undefined)).toBe(true);
    expect(isStaleTick(2n, null)).toBe(true);
    expect(isStaleTick(2n, { roundNumber: 2n, state: 'action_select' })).toBe(false);
    expect(isStaleTick(2n, { roundNumber: 3n, state: 'action_select' })).toBe(true);
    expect(isStaleTick(2n, { roundNumber: 2n, state: 'resolved' })).toBe(true);
    expect(isStaleTick(2n, { roundNumber: 2n, state: 'resolving' })).toBe(true);
  });
});

describe('petAbilityDue', () => {
  it('cooldown 10s is a 3-round period starting at round 1', () => {
    for (const r of [1n, 4n, 7n]) expect(petAbilityDue(r, 10n)).toBe(true);
    for (const r of [2n, 3n, 5n]) expect(petAbilityDue(r, 10n)).toBe(false);
  });
  it('missing cooldown behaves as 10s', () => {
    expect(petAbilityDue(4n, undefined)).toBe(true);
    expect(petAbilityDue(2n, null)).toBe(false);
  });
  it('a one-round cooldown is due every round', () => {
    for (const r of [1n, 2n, 3n, 4n]) expect(petAbilityDue(r, 4n)).toBe(true);
  });
});

describe('enemyAbilityReady', () => {
  it('is ready when unset or when the ready round has arrived', () => {
    expect(enemyAbilityReady(undefined, 1n)).toBe(true);
    expect(enemyAbilityReady(null, 1n)).toBe(true);
    expect(enemyAbilityReady(5n, 4n)).toBe(false);
    expect(enemyAbilityReady(5n, 5n)).toBe(true);
    expect(enemyAbilityReady(5n, 6n)).toBe(true);
  });
});

describe('roundSeed', () => {
  it('offsets the base by the stride per round', () => {
    expect(ROUND_SEED_STRIDE).toBe(104729n);
    expect(roundSeed(100n, 2n)).toBe(100n + 209458n);
  });
});

describe('static guard', () => {
  it('imports only combat_constants and never converts to Number', () => {
    const here = fileURLToPath(new URL('.', import.meta.url));
    const source: string = readFileSync(join(here, 'combat_rounds.ts'), 'utf8');
    expect(source.match(/^import\b/gm)).toHaveLength(1);
    expect(source.match(/\bfrom\s+'[^']+'/g)).toEqual(["from '../data/combat_constants'"]);
    expect(source).not.toMatch(/\brequire\(|\bimport\(/);
    expect(source).not.toContain('Number(');
  });
});
