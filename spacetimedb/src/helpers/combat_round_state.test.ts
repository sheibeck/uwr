/**
 * Phase 46.1 Plan 04 (RND-01, RND-03, RND-04): the round, tick, choice and round-cooldown service.
 * Strict mock db (accessors come from the recorded schema), so an id accessor on the scheduled
 * round_timer_tick table, or an update that matches no row, throws like the real database.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createMockCtx } from './test-utils';
import { rowColumnProblems } from './schema_recorder';
import {
  roundsForCombat,
  currentRound,
  scheduleRoundTick,
  cancelRoundTicks,
  startRound,
  ensureRound,
  upsertChoice,
  choicesForRound,
  clearRoundChoices,
  waitingCharacterIds,
  allWaitingChosen,
  roundCooldownRemaining,
  setRoundCooldown,
  decrementRoundCooldowns,
  beginCombatCooldowns,
  endCombatCooldowns,
} from './combat_round_state';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

beforeAll(async () => {
  await import('../schema/tables');
});

const T0 = 1_700_000_000_000_000n;
const TEN_S = 10_000_000n;

type Seed = Record<string, any[]>;
const mk = (seed: Seed = {}, now: bigint = T0) => createMockCtx({ seed, timestampMicros: now, strict: true });
const rows = (ctx: any, table: string): any[] => ctx.db[table]._rows();

const roundRow = (over: Record<string, unknown> = {}) => ({
  id: 0n,
  combatId: 1n,
  roundNumber: 1n,
  state: 'resolved',
  timerExpiresAtMicros: T0,
  narrationCount: 0n,
  startedAtMicros: T0,
  ...over,
});
const tickRow = (over: Record<string, unknown> = {}) => ({
  scheduledId: 0n,
  scheduledAt: { tag: 'Time', value: { microsSinceUnixEpoch: T0 } },
  combatId: 1n,
  roundNumber: 1n,
  ...over,
});
const actionRow = (over: Record<string, unknown> = {}) => ({
  id: 0n,
  combatId: 1n,
  characterId: 1n,
  roundNumber: 1n,
  actionType: 'auto_attack',
  abilityTemplateId: undefined,
  targetEnemyId: undefined,
  targetCharacterId: undefined,
  submittedAt: { microsSinceUnixEpoch: T0 },
  ...over,
});
const cooldownRow = (over: Record<string, unknown> = {}) => ({
  id: 0n,
  characterId: 1n,
  abilityTemplateId: 10n,
  startedAtMicros: T0,
  durationMicros: 0n,
  roundsRemaining: 0n,
  ...over,
});
const active = { id: 1n, state: 'active' };

describe('startRound', () => {
  it('inserts an action_select round with deadline now + 10 s and exactly one tick at that deadline', () => {
    const ctx = mk();
    const row = startRound(ctx, 1n, 1n);
    expect(row.roundNumber).toBe(1n);
    const stored = rows(ctx, 'combat_round');
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      combatId: 1n,
      roundNumber: 1n,
      state: 'action_select',
      timerExpiresAtMicros: T0 + TEN_S,
      startedAtMicros: T0,
      narrationCount: 0n,
    });
    expect(rowColumnProblems('combat_round', stored[0])).toEqual([]);
    const ticks = rows(ctx, 'round_timer_tick');
    expect(ticks).toHaveLength(1);
    expect(ticks[0].combatId).toBe(1n);
    expect(ticks[0].roundNumber).toBe(1n);
    expect(ticks[0].scheduledAt.tag).toBe('Time');
    expect(ticks[0].scheduledAt.value.microsSinceUnixEpoch).toBe(T0 + TEN_S);
    expect(rowColumnProblems('round_timer_tick', ticks[0])).toEqual([]);
  });

  it('carries the narration count passed in', () => {
    const ctx = mk();
    startRound(ctx, 2n, 4n, 2n);
    expect(rows(ctx, 'combat_round')[0].narrationCount).toBe(2n);
  });
});

describe('roundsForCombat and currentRound', () => {
  it('lists rounds ascending by roundNumber for one combat only', () => {
    const ctx = mk({
      combat_round: [
        roundRow({ id: 1n, roundNumber: 3n }),
        roundRow({ id: 2n, roundNumber: 1n }),
        roundRow({ id: 3n, roundNumber: 2n, combatId: 2n }),
      ],
    });
    expect(roundsForCombat(ctx, 1n).map((r) => r.roundNumber)).toEqual([1n, 3n]);
  });

  it('returns the highest action_select round, or undefined when none is open', () => {
    const ctx = mk({
      combat_round: [
        roundRow({ id: 1n, roundNumber: 1n, state: 'resolved' }),
        roundRow({ id: 2n, roundNumber: 2n, state: 'action_select' }),
      ],
    });
    expect(currentRound(ctx, 1n)?.roundNumber).toBe(2n);
    const done = mk({ combat_round: [roundRow({ id: 1n, roundNumber: 1n })] });
    expect(currentRound(done, 1n)).toBeUndefined();
  });
});

describe('ensureRound', () => {
  it('starts round 1 with a tick on an active combat with no rows', () => {
    const ctx = mk();
    const open = ensureRound(ctx, active);
    expect(open?.roundNumber).toBe(1n);
    expect(rows(ctx, 'combat_round')).toHaveLength(1);
    expect(rows(ctx, 'round_timer_tick')).toHaveLength(1);
  });

  it('starts round 4 carrying the last narrationCount when rounds 1 to 3 are resolved', () => {
    const ctx = mk({
      combat_round: [
        roundRow({ id: 1n, roundNumber: 1n, narrationCount: 0n }),
        roundRow({ id: 2n, roundNumber: 3n, narrationCount: 2n }),
        roundRow({ id: 3n, roundNumber: 2n, narrationCount: 1n }),
      ],
    });
    const open = ensureRound(ctx, active);
    expect(open?.roundNumber).toBe(4n);
    expect(open?.narrationCount).toBe(2n);
    expect(open?.state).toBe('action_select');
  });

  it('schedules a missing tick at the deadline when it is still in the future', () => {
    const deadline = T0 + 4_000_000n;
    const ctx = mk({
      combat_round: [roundRow({ id: 1n, roundNumber: 2n, state: 'action_select', timerExpiresAtMicros: deadline })],
    });
    const open = ensureRound(ctx, active);
    expect(open?.roundNumber).toBe(2n);
    const ticks = rows(ctx, 'round_timer_tick');
    expect(ticks).toHaveLength(1);
    expect(ticks[0].roundNumber).toBe(2n);
    expect(ticks[0].scheduledAt.value.microsSinceUnixEpoch).toBe(deadline);
    expect(rows(ctx, 'combat_round')).toHaveLength(1);
  });

  it('schedules a missing tick at now when the deadline has already passed', () => {
    const ctx = mk({
      combat_round: [roundRow({ id: 1n, roundNumber: 2n, state: 'action_select', timerExpiresAtMicros: T0 - 5n })],
    });
    ensureRound(ctx, active);
    expect(rows(ctx, 'round_timer_tick')[0].scheduledAt.value.microsSinceUnixEpoch).toBe(T0);
  });

  it('is idempotent: two calls leave one open round and one tick', () => {
    const ctx = mk();
    ensureRound(ctx, active);
    ensureRound(ctx, active);
    expect(rows(ctx, 'combat_round').filter((r) => r.state === 'action_select')).toHaveLength(1);
    expect(rows(ctx, 'round_timer_tick')).toHaveLength(1);
  });

  it('does nothing for a combat that is not active', () => {
    const ctx = mk();
    expect(ensureRound(ctx, { id: 1n, state: 'resolved' })).toBeUndefined();
    expect(rows(ctx, 'combat_round')).toHaveLength(0);
    expect(rows(ctx, 'round_timer_tick')).toHaveLength(0);
  });
});

describe('cancelRoundTicks', () => {
  const seed = () => ({
    round_timer_tick: [
      tickRow({ scheduledId: 1n, combatId: 1n, roundNumber: 1n }),
      tickRow({ scheduledId: 2n, combatId: 1n, roundNumber: 2n }),
      tickRow({ scheduledId: 3n, combatId: 2n, roundNumber: 1n }),
    ],
  });

  it('removes both ticks of the combat, keeps another combat tick, returns the count', () => {
    const ctx = mk(seed());
    expect(cancelRoundTicks(ctx, 1n)).toBe(2);
    expect(rows(ctx, 'round_timer_tick').map((r) => r.scheduledId)).toEqual([3n]);
  });

  it('keeps the row passed as the running tick', () => {
    const ctx = mk(seed());
    expect(cancelRoundTicks(ctx, 1n, 2n)).toBe(1);
    expect(rows(ctx, 'round_timer_tick').map((r) => r.scheduledId).sort()).toEqual([2n, 3n]);
  });

  it('scheduleRoundTick inserts a Time tick for the combat and round', () => {
    const ctx = mk();
    scheduleRoundTick(ctx, 5n, 7n, T0 + 123n);
    const t = rows(ctx, 'round_timer_tick')[0];
    expect(t).toMatchObject({ combatId: 5n, roundNumber: 7n });
    expect(t.scheduledAt.value.microsSinceUnixEpoch).toBe(T0 + 123n);
  });
});

describe('upsertChoice and choicesForRound', () => {
  it('replaces a second choice of the same round in place', () => {
    const ctx = mk({}, T0);
    upsertChoice(ctx, 1n, 1n, 5n, { actionType: 'auto_attack', targetEnemyId: 9n });
    const later = { ...ctx, timestamp: { microsSinceUnixEpoch: T0 + 3_000_000n } };
    upsertChoice(later, 1n, 1n, 5n, { actionType: 'ability', abilityTemplateId: 77n, targetEnemyId: 8n });
    const stored = rows(ctx, 'combat_action');
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ actionType: 'ability', abilityTemplateId: 77n, targetEnemyId: 8n });
    expect(stored[0].submittedAt).toEqual({ microsSinceUnixEpoch: T0 + 3_000_000n });
    expect(rowColumnProblems('combat_action', stored[0])).toEqual([]);
  });

  it('writes abilityTemplateId only for an ability and leaves it undefined otherwise', () => {
    const ctx = mk();
    upsertChoice(ctx, 1n, 1n, 5n, { actionType: 'auto_attack', abilityTemplateId: 99n });
    upsertChoice(ctx, 1n, 1n, 6n, { actionType: 'flee' });
    for (const r of rows(ctx, 'combat_action')) expect(r.abilityTemplateId).toBeUndefined();
  });

  it('a round 2 choice does not touch a round 1 row of another combat', () => {
    const ctx = mk({ combat_action: [actionRow({ id: 1n, combatId: 2n, characterId: 5n, roundNumber: 1n })] });
    upsertChoice(ctx, 1n, 2n, 5n, { actionType: 'flee' });
    const stored = rows(ctx, 'combat_action');
    expect(stored).toHaveLength(2);
    expect(stored.find((r) => r.id === 1n)).toMatchObject({ combatId: 2n, actionType: 'auto_attack' });
  });

  it('keeps the first of several duplicate rows and deletes the rest', () => {
    const ctx = mk({
      combat_action: [
        actionRow({ id: 1n, characterId: 5n }),
        actionRow({ id: 2n, characterId: 5n }),
      ],
    });
    upsertChoice(ctx, 1n, 1n, 5n, { actionType: 'flee' });
    const stored = rows(ctx, 'combat_action');
    expect(stored.map((r) => r.id)).toEqual([1n]);
    expect(stored[0].actionType).toBe('flee');
  });

  it('choicesForRound sorts by characterId and filters by combat and round', () => {
    const ctx = mk({
      combat_action: [
        actionRow({ id: 1n, characterId: 9n }),
        actionRow({ id: 2n, characterId: 3n }),
        actionRow({ id: 3n, characterId: 1n, roundNumber: 2n }),
        actionRow({ id: 4n, characterId: 2n, combatId: 2n }),
      ],
    });
    expect(choicesForRound(ctx, 1n, 1n).map((r) => r.characterId)).toEqual([3n, 9n]);
  });

  it('clearRoundChoices removes rounds up to the given one and keeps later rounds', () => {
    const ctx = mk({
      combat_action: [
        actionRow({ id: 1n, characterId: 1n, roundNumber: 1n }),
        actionRow({ id: 2n, characterId: 1n, roundNumber: 2n }),
        actionRow({ id: 3n, characterId: 1n, roundNumber: 3n }),
        actionRow({ id: 4n, characterId: 1n, roundNumber: 1n, combatId: 2n }),
      ],
    });
    clearRoundChoices(ctx, 1n, 2n);
    expect(rows(ctx, 'combat_action').map((r) => r.id).sort()).toEqual([3n, 4n]);
  });
});

describe('waitingCharacterIds and allWaitingChosen', () => {
  const seed = (): Seed => ({
    combat_participant: [
      { id: 5n, combatId: 1n, characterId: 5n, status: 'active', nextAutoAttackAt: 0n },
      { id: 1n, combatId: 1n, characterId: 1n, status: 'active', nextAutoAttackAt: 0n },
      { id: 2n, combatId: 1n, characterId: 2n, status: 'dead', nextAutoAttackAt: 0n },
      { id: 3n, combatId: 1n, characterId: 3n, status: 'active', nextAutoAttackAt: 0n },
      { id: 4n, combatId: 1n, characterId: 4n, status: 'fled', nextAutoAttackAt: 0n },
      { id: 6n, combatId: 1n, characterId: 6n, status: 'active', nextAutoAttackAt: 0n },
      { id: 7n, combatId: 2n, characterId: 7n, status: 'active', nextAutoAttackAt: 0n },
    ],
    character: [
      { id: 1n, hp: 10n },
      { id: 2n, hp: 0n },
      { id: 3n, hp: 0n },
      { id: 4n, hp: 10n },
      { id: 5n, hp: 5n },
      { id: 7n, hp: 10n },
    ],
  });

  it('lists active living participants ascending; dead, zero hp, fled and missing rows are skipped', () => {
    expect(waitingCharacterIds(mk(seed()), 1n)).toEqual([1n, 5n]);
  });

  it('allWaitingChosen is false until every waited-on character has chosen', () => {
    const s = seed();
    const only5 = mk({ ...s, combat_action: [actionRow({ id: 1n, characterId: 5n })] });
    expect(allWaitingChosen(only5, 1n, 1n)).toBe(false);
    const both = mk({
      ...s,
      combat_action: [actionRow({ id: 1n, characterId: 5n }), actionRow({ id: 2n, characterId: 1n })],
    });
    expect(allWaitingChosen(both, 1n, 1n)).toBe(true);
  });

  it('a choice from a different round does not count', () => {
    const s = seed();
    const ctx = mk({
      ...s,
      combat_action: [actionRow({ id: 1n, characterId: 5n, roundNumber: 2n }), actionRow({ id: 2n, characterId: 1n, roundNumber: 2n })],
    });
    expect(allWaitingChosen(ctx, 1n, 1n)).toBe(false);
  });

  it('is true when nobody is waited on', () => {
    expect(allWaitingChosen(mk(), 1n, 1n)).toBe(true);
  });
});

describe('round cooldowns', () => {
  it('setRoundCooldown(8 s) stores 2 rounds with a 20 s estimate; decrement twice deletes it', () => {
    const ctx = mk();
    setRoundCooldown(ctx, 1n, 10n, 8n);
    let stored = rows(ctx, 'ability_cooldown');
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      characterId: 1n,
      abilityTemplateId: 10n,
      roundsRemaining: 2n,
      durationMicros: 20_000_000n,
      startedAtMicros: T0,
    });
    expect(rowColumnProblems('ability_cooldown', stored[0])).toEqual([]);
    expect(roundCooldownRemaining(ctx, 1n, 10n)).toBe(2n);

    const later = { ...ctx, timestamp: { microsSinceUnixEpoch: T0 + TEN_S } };
    decrementRoundCooldowns(later, [1n]);
    stored = rows(ctx, 'ability_cooldown');
    expect(stored[0]).toMatchObject({ roundsRemaining: 1n, durationMicros: TEN_S, startedAtMicros: T0 + TEN_S });
    decrementRoundCooldowns(later, [1n]);
    expect(rows(ctx, 'ability_cooldown')).toHaveLength(0);
    expect(roundCooldownRemaining(ctx, 1n, 10n)).toBe(0n);
  });

  it('a 4 s cooldown is gone after one decrement; 0 s behaves like 4 s', () => {
    for (const seconds of [4n, 0n]) {
      const ctx = mk();
      setRoundCooldown(ctx, 1n, 10n, seconds);
      expect(rows(ctx, 'ability_cooldown')[0].roundsRemaining).toBe(1n);
      decrementRoundCooldowns(ctx, [1n]);
      expect(rows(ctx, 'ability_cooldown')).toHaveLength(0);
    }
  });

  it('setRoundCooldown keeps one row per character and ability', () => {
    const ctx = mk({ ability_cooldown: [cooldownRow({ id: 1n, roundsRemaining: 1n }), cooldownRow({ id: 2n, roundsRemaining: 5n })] });
    setRoundCooldown(ctx, 1n, 10n, 12n);
    const stored = rows(ctx, 'ability_cooldown');
    expect(stored).toHaveLength(1);
    expect(stored[0].roundsRemaining).toBe(3n);
  });

  it('decrement touches only the listed characters and only positive-round rows', () => {
    const ctx = mk({
      ability_cooldown: [
        cooldownRow({ id: 1n, characterId: 1n, roundsRemaining: 3n }),
        cooldownRow({ id: 2n, characterId: 2n, roundsRemaining: 3n }),
        cooldownRow({ id: 3n, characterId: 1n, abilityTemplateId: 11n, roundsRemaining: 0n, durationMicros: 5n }),
      ],
    });
    decrementRoundCooldowns(ctx, [1n]);
    const byId = (id: bigint) => rows(ctx, 'ability_cooldown').find((r) => r.id === id);
    expect(byId(1n)?.roundsRemaining).toBe(2n);
    expect(byId(2n)?.roundsRemaining).toBe(3n);
    expect(byId(3n)?.roundsRemaining).toBe(0n);
  });

  it('roundCooldownRemaining is 0n with no row', () => {
    expect(roundCooldownRemaining(mk(), 1n, 10n)).toBe(0n);
  });
});

describe('beginCombatCooldowns', () => {
  it('turns 9 s of wall clock into 3 rounds with a 30 s estimate', () => {
    const ctx = mk({ ability_cooldown: [cooldownRow({ id: 1n, startedAtMicros: T0 - 1_000_000n, durationMicros: 10_000_000n })] });
    beginCombatCooldowns(ctx, 1n);
    expect(rows(ctx, 'ability_cooldown')[0]).toMatchObject({
      roundsRemaining: 3n,
      durationMicros: 30_000_000n,
      startedAtMicros: T0,
    });
  });

  it('deletes an expired wall-clock row', () => {
    const ctx = mk({ ability_cooldown: [cooldownRow({ id: 1n, startedAtMicros: T0 - 10n, durationMicros: 10n })] });
    beginCombatCooldowns(ctx, 1n);
    expect(rows(ctx, 'ability_cooldown')).toHaveLength(0);
  });

  it('leaves a row that already holds rounds unchanged', () => {
    const row = cooldownRow({ id: 1n, roundsRemaining: 2n, durationMicros: 20_000_000n });
    const ctx = mk({ ability_cooldown: [{ ...row }] });
    beginCombatCooldowns(ctx, 1n);
    expect(rows(ctx, 'ability_cooldown')[0]).toEqual(row);
  });

  it('never rounds a live cooldown down to 0 (1 microsecond left is 1 round)', () => {
    const ctx = mk({ ability_cooldown: [cooldownRow({ id: 1n, startedAtMicros: T0 - 9n, durationMicros: 10n })] });
    beginCombatCooldowns(ctx, 1n);
    expect(rows(ctx, 'ability_cooldown')[0].roundsRemaining).toBe(1n);
  });
});

describe('endCombatCooldowns', () => {
  it('turns 2 rounds into an 8 s wall-clock cooldown from now', () => {
    const ctx = mk({ ability_cooldown: [cooldownRow({ id: 1n, roundsRemaining: 2n, durationMicros: 20_000_000n })] });
    endCombatCooldowns(ctx, 1n);
    expect(rows(ctx, 'ability_cooldown')[0]).toMatchObject({
      roundsRemaining: 0n,
      startedAtMicros: T0,
      durationMicros: 8_000_000n,
    });
  });

  it('deletes an expired zero-round row and keeps a live one', () => {
    const ctx = mk({
      ability_cooldown: [
        cooldownRow({ id: 1n, abilityTemplateId: 10n, startedAtMicros: T0 - 10n, durationMicros: 10n }),
        cooldownRow({ id: 2n, abilityTemplateId: 11n, startedAtMicros: T0, durationMicros: 5_000_000n }),
      ],
    });
    endCombatCooldowns(ctx, 1n);
    const stored = rows(ctx, 'ability_cooldown');
    expect(stored.map((r) => r.id)).toEqual([2n]);
    expect(stored[0].durationMicros).toBe(5_000_000n);
  });

  it('round trip: begin then end keeps a cooldown alive across the fight boundary', () => {
    const ctx = mk({ ability_cooldown: [cooldownRow({ id: 1n, startedAtMicros: T0, durationMicros: 6_000_000n })] });
    beginCombatCooldowns(ctx, 1n);
    expect(rows(ctx, 'ability_cooldown')[0].roundsRemaining).toBe(2n);
    endCombatCooldowns(ctx, 1n);
    const r = rows(ctx, 'ability_cooldown')[0];
    expect(r.roundsRemaining).toBe(0n);
    expect(r.startedAtMicros + r.durationMicros).toBeGreaterThan(T0);
  });
});
