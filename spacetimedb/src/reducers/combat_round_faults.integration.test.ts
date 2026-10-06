/**
 * Phase 46.1 review fix WR-01: one throw inside round resolution must not stall a fight or roll back
 * a player's choice or flee. Each independent step of resolveRound is isolated, so the round still
 * reaches "next round / victory / defeat" and re-arms its tick, on the timer path (resolve_round_timer)
 * and the early path (a choice that completes the round). Real captured reducers on a strict mock db.
 *
 * A fault is injected two ways: bad data the step really trips over (a pending add whose template is
 * gone, an effect row with a number where a bigint belongs) and a db whose named table throws on access.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import {
  T0,
  MODULE,
  ALICE,
  fightSeed,
  fightCtx,
  rows,
  openTickArg,
} from '../helpers/combat_fight_fixture';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const handlers: Record<string, (...args: any[]) => any> = {};

beforeAll(async () => {
  await import('../index');
  for (const name of ['resolve_round_timer', 'submit_combat_action', 'flee_combat']) {
    const h = capturedReducer(name);
    if (typeof h !== 'function') {
      throw new Error(`capturedReducer('${name}') is not a function: the schema recorder could not capture it.`);
    }
    handlers[name] = h;
  }
}, 120_000);

afterEach(() => {
  vi.restoreAllMocks();
});

const TEN_S = 10_000_000n;
const SECRET = ['sk', '-ant-api03-'].join('') + 'A'.repeat(30);

/** Resolve the open round the way the scheduler does, removing the fired row as the platform would. */
function fire(ctx: any) {
  const tick = openTickArg(ctx);
  ctx.sender = MODULE;
  handlers.resolve_round_timer(ctx, tick);
  const table = ctx.db._tables.round_timer_tick ?? [];
  const idx = table.findIndex((r: any) => r.scheduledId === tick.arg.scheduledId);
  if (idx >= 0) table.splice(idx, 1);
}

/** The db with one table that throws as soon as the reducer touches it. */
function breakTable(ctx: any, tableName: string, message = 'injected failure') {
  const real = ctx.db;
  ctx.db = new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === tableName) throw new Error(message);
      return Reflect.get(target, prop, receiver);
    },
  });
}

const roundRows = (ctx: any) =>
  [...rows(ctx, 'combat_round')].sort((a: any, b: any) => (a.roundNumber < b.roundNumber ? -1 : 1));
const roundStates = (ctx: any) => roundRows(ctx).map((r: any) => [r.roundNumber, r.state]);
const ticksFor = (ctx: any, combatId = 1n) => rows(ctx, 'round_timer_tick').filter((r: any) => r.combatId === combatId);
const lines = (ctx: any, characterId: bigint, pattern: RegExp) =>
  rows(ctx, 'event_private').filter((e: any) => e.characterId === characterId && pattern.test(e.message));

const ADVANCED = [
  [1n, 'resolved'],
  [2n, 'action_select'],
];

/** A fight with an add (spawn 2, template 99 which does not exist) due to arrive at the end of round 1. */
function brokenAddSeed() {
  return fightSeed({
    withOpenRound: true,
    extra: {
      enemy_spawn: [
        { id: 2n, locationId: 10n, enemyTemplateId: 99n, name: 'Ghost', state: 'engaged', lockedCombatId: 1n, groupCount: 0n },
      ],
      combat_pending_add: [
        {
          id: 1n, combatId: 1n, enemyTemplateId: 99n, enemyRoleTemplateId: undefined, spawnId: 2n,
          arriveAtMicros: 1n, arriveAtRound: 1n,
        },
      ],
    },
  });
}

/** A fight whose player carries a poisoned effect row (a number where the engine needs a bigint). */
function poisonedEffectSeed() {
  return fightSeed({
    withOpenRound: true,
    extra: {
      character_effect: [
        { id: 1n, characterId: 1n, effectType: 'dot', magnitude: 5, roundsRemaining: 3n, sourceAbility: 'Venom' },
      ],
    },
  });
}

describe('a pending add whose template is gone (processPendingAdds throws inside addEnemyToCombat)', () => {
  it('timer path: the round still resolves, the next round opens and its tick is armed', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ctx = fightCtx(brokenAddSeed(), MODULE, T0 + TEN_S);
    expect(() => fire(ctx)).not.toThrow();

    expect(roundStates(ctx)).toEqual(ADVANCED);
    const ticks = ticksFor(ctx);
    expect(ticks).toHaveLength(1);
    expect(ticks[0].roundNumber).toBe(2n);
    expect(rows(ctx, 'combat_encounter')[0].state).toBe('active');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('processPendingAdds: add 1 failed in combat 1'));
  });

  it('the bad add is consumed and its spawn released, so it cannot throw again every round', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ctx = fightCtx(brokenAddSeed(), MODULE, T0 + TEN_S);
    fire(ctx);
    expect(rows(ctx, 'combat_pending_add')).toHaveLength(0);
    const spawn = rows(ctx, 'enemy_spawn').find((s: any) => s.id === 2n);
    expect(spawn).toMatchObject({ state: 'available', lockedCombatId: undefined });
    expect(rows(ctx, 'combat_enemy')).toHaveLength(1);
    expect(lines(ctx, 1n, /A social add arrives/)).toHaveLength(0);
  });

  it('early path: a choice that completes the round is not rolled back and the round advances', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ctx = fightCtx(brokenAddSeed(), ALICE);
    expect(() => handlers.submit_combat_action(ctx, { characterId: 1n })).not.toThrow();

    expect(lines(ctx, 1n, /^You ready an attack\.$/)).toHaveLength(1);
    expect(lines(ctx, 1n, /Your fists hit/)).toHaveLength(1);
    expect(roundStates(ctx)).toEqual(ADVANCED);
    expect(ticksFor(ctx)).toHaveLength(1);
    expect(ticksFor(ctx)[0].roundNumber).toBe(2n);
  });
});

describe('the whole pending-adds step throwing (an error outside the per-add isolation)', () => {
  it('timer path: the round advances and the failure is logged without a secret', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ctx = fightCtx(fightSeed({ withOpenRound: true }), MODULE, T0 + TEN_S);
    breakTable(ctx, 'combat_pending_add', `table down, key ${SECRET}`);
    expect(() => fire(ctx)).not.toThrow();

    expect(roundStates(ctx)).toEqual(ADVANCED);
    expect(ticksFor(ctx)).toHaveLength(1);
    const logged = error.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('resolveRound: pending adds failed in combat 1');
    expect(logged).not.toContain(SECRET);
  });

  it('early path: the choice stands and the round advances', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ctx = fightCtx(fightSeed({ withOpenRound: true }), ALICE);
    breakTable(ctx, 'combat_pending_add');
    expect(() => handlers.submit_combat_action(ctx, { characterId: 1n })).not.toThrow();

    expect(lines(ctx, 1n, /^You ready an attack\.$/)).toHaveLength(1);
    expect(roundStates(ctx)).toEqual(ADVANCED);
    expect(ticksFor(ctx)).toHaveLength(1);
  });
});

describe('end-of-round effect ticks throwing (a poisoned effect row)', () => {
  it('timer path: the round advances and the tick is re-armed', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ctx = fightCtx(poisonedEffectSeed(), MODULE, T0 + TEN_S);
    expect(() => fire(ctx)).not.toThrow();
    expect(roundStates(ctx)).toEqual(ADVANCED);
    expect(ticksFor(ctx)).toHaveLength(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('resolveRound: effect ticks failed in combat 1'));
  });

  it('early path: the choice stands and the round advances', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ctx = fightCtx(poisonedEffectSeed(), ALICE);
    expect(() => handlers.submit_combat_action(ctx, { characterId: 1n })).not.toThrow();
    expect(lines(ctx, 1n, /^You ready an attack\.$/)).toHaveLength(1);
    expect(roundStates(ctx)).toEqual(ADVANCED);
  });

  it('a later step still runs after the failed one (the cooldowns of the round still count down)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const seed = poisonedEffectSeed();
    seed.ability_cooldown = [
      { id: 1n, characterId: 1n, abilityTemplateId: 1n, roundsRemaining: 3n, durationMicros: 24_000_000n, startedAtMicros: T0 },
    ];
    const ctx = fightCtx(seed, MODULE, T0 + TEN_S);
    fire(ctx);
    expect(rows(ctx, 'ability_cooldown').map((c: any) => c.roundsRemaining)).toEqual([2n]);
  });
});

describe('a flee whose resolution throws (early path)', () => {
  it('the flee choice is not rolled back, the player keeps the turn spent, and the round advances', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ctx = fightCtx(fightSeed({ withOpenRound: true }), ALICE);
    breakTable(ctx, 'region');
    expect(() => handlers.flee_combat(ctx, { characterId: 1n })).not.toThrow();

    expect(lines(ctx, 1n, /^You attempt to flee\.\.\.$/)).toHaveLength(1);
    expect(roundStates(ctx)).toEqual(ADVANCED);
    expect(ticksFor(ctx)).toHaveLength(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('resolveRound: player 1 turn failed in combat 1'));
  });
});

describe('a reward or defeat path that throws does not brick the fight', () => {
  /** A timestamp at which the enemy-phase hit lands and kills the player (found on a clean ctx). */
  function killingNow(buildSeed: () => Record<string, any[]>): bigint {
    for (let k = 0n; k < 400n; k++) {
      const now = T0 + TEN_S + k;
      const ctx = fightCtx(buildSeed(), MODULE, now);
      fire(ctx);
      const alice = rows(ctx, 'character').find((c: any) => c.id === 1n);
      if (alice.hp === 0n) return now;
    }
    throw new Error('no timestamp in range lets the enemy land the killing blow');
  }

  const victorySeed = () => fightSeed({ withOpenRound: true, enemies: [{ id: 1n, name: 'Cave Rat', hp: 1n }] });
  const defeatSeed = () => {
    const seed = fightSeed({ withOpenRound: true, enemies: [{ id: 1n, name: 'Cave Rat', hp: 100_000n, attackDamage: 5_000n }] });
    seed.character.find((c: any) => c.id === 1n).hp = 5n;
    return seed;
  };
  const closed = (ctx: any) => {
    expect(rows(ctx, 'combat_encounter')[0].state).toBe('resolved');
    expect(rows(ctx, 'combat_round')).toHaveLength(0);
    expect(rows(ctx, 'combat_action')).toHaveLength(0);
    expect(rows(ctx, 'combat_participant')).toHaveLength(0);
    expect(rows(ctx, 'combat_enemy')).toHaveLength(0);
    expect(ticksFor(ctx)).toHaveLength(0);
  };

  it('victory: a throw in the reward path is logged and the fight is still closed', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ctx = fightCtx(victorySeed(), MODULE, T0 + TEN_S);
    breakTable(ctx, 'combat_loot');
    expect(() => fire(ctx)).not.toThrow();
    closed(ctx);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('resolveRound: victory failed in combat 1'));
  });

  it('defeat: a throw in the defeat path is logged and the fight is still closed', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const now = killingNow(defeatSeed);
    error.mockClear();
    const ctx = fightCtx(defeatSeed(), MODULE, now);
    breakTable(ctx, 'combat_result');
    expect(() => fire(ctx)).not.toThrow();
    closed(ctx);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('resolveRound: defeat failed in combat 1'));
  });

  it('control: the same victory without the fault still pays out and closes the fight', () => {
    const ctx = fightCtx(victorySeed(), MODULE, T0 + TEN_S);
    fire(ctx);
    closed(ctx);
    expect(lines(ctx, 1n, /You gain \d+ XP/).length).toBeGreaterThan(0);
  });
});
