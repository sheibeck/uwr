/**
 * Phase 46.1 review fix WR-04: a DoT of D rounds ticks exactly D times, whoever it lands on.
 * Before the fix a DoT an enemy put on a player also ticked once at application, so it dealt D + 1
 * ticks while the same DoT on an enemy dealt D. The tick count is pinned both ways, first on
 * effect rows seeded the same way on both sides, then end to end from the ability that applies the
 * DoT, through the real captured reducers on a strict mock db.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { roundSeed, secondsToRounds } from '../helpers/combat_rounds';
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
  for (const name of ['resolve_round_timer', 'use_ability']) {
    const h = capturedReducer(name);
    if (typeof h !== 'function') {
      throw new Error(`capturedReducer('${name}') is not a function: the schema recorder could not capture it.`);
    }
    handlers[name] = h;
  }
}, 120_000);

const TEN_S = 10_000_000n;
const BIG = 1_000_000n;

function fire(ctx: any, atMicros: bigint) {
  ctx.timestamp = { microsSinceUnixEpoch: atMicros };
  const tick = openTickArg(ctx);
  ctx.sender = MODULE;
  handlers.resolve_round_timer(ctx, tick);
  const table = ctx.db._tables.round_timer_tick ?? [];
  const idx = table.findIndex((r: any) => r.scheduledId === tick.arg.scheduledId);
  if (idx >= 0) table.splice(idx, 1);
}

const lines = (ctx: any, pattern: RegExp) =>
  rows(ctx, 'event_private').filter((e: any) => e.characterId === 1n && pattern.test(e.message));
const ticksOnPlayer = (ctx: any, source: string) => lines(ctx, new RegExp(`^You suffer \\d+ damage from ${source}\\.$`)).length;
const ticksOnEnemy = (ctx: any, source: string) => lines(ctx, new RegExp(`^${source} sears Cave Rat for \\d+\\.$`)).length;

/** Resolve rounds until `done` (or a safety cap), a round per ten seconds. */
function runRounds(ctx: any, from: bigint, done: () => boolean, cap = 12) {
  let now = from;
  for (let i = 0; i < cap && !done(); i++) {
    fire(ctx, now);
    now += TEN_S;
  }
}

describe('seeded DoTs of the same length tick the same number of times on a player and on an enemy', () => {
  const ROUNDS = 3n;
  function seededSeed() {
    return fightSeed({
      withOpenRound: true,
      playerHp: BIG,
      enemies: [{ id: 1n, name: 'Cave Rat', hp: BIG, attackDamage: 1n }],
      extra: {
        character_effect: [
          { id: 1n, characterId: 1n, effectType: 'dot', magnitude: 2n, roundsRemaining: ROUNDS, sourceAbility: 'Venom' },
        ],
        combat_enemy_effect: [
          {
            id: 1n, combatId: 1n, enemyId: 1n, effectType: 'dot', magnitude: 2n, roundsRemaining: ROUNDS,
            sourceAbility: 'Brand', ownerCharacterId: 1n,
          },
        ],
      },
    });
  }

  it('D = 3 rounds: three ticks each way, then both effects are gone', () => {
    const ctx = fightCtx(seededSeed(), MODULE, T0 + TEN_S);
    runRounds(ctx, T0 + TEN_S, () => false, 5);
    expect(ticksOnPlayer(ctx, 'Venom')).toBe(3);
    expect(ticksOnEnemy(ctx, 'Brand')).toBe(3);
    expect(rows(ctx, 'character_effect')).toHaveLength(0);
    expect(rows(ctx, 'combat_enemy_effect')).toHaveLength(0);
  });
});

describe('an enemy DoT on a player ticks D times, once per round starting with the round it lands', () => {
  const D = secondsToRounds(3n); // the length an enemy DoT is applied with (resolveAbility, 'dot')

  /** The first timestamp at or after `from` at which the enemy ability roll passes in round 1. */
  const passingNow = (from: bigint): bigint => {
    let now = from;
    while (roundSeed(now + 1n + 1n, 1n) % 100n >= 50n) now += 1n;
    return now;
  };

  function enemyDotSeed() {
    return fightSeed({
      withOpenRound: true,
      playerHp: BIG,
      enemies: [{ id: 1n, name: 'Cave Rat', hp: BIG, attackDamage: 1n }],
      extra: {
        enemy_ability: [
          {
            id: 1n, enemyTemplateId: 1n, abilityKey: 'venom', name: 'Venom', kind: 'dot',
            castSeconds: 0n, cooldownSeconds: 999n, targetRule: 'aggro',
          },
        ],
      },
    });
  }

  it('landing in round 1: no damage line at application, D ticks in total (not D + 1)', () => {
    const start = passingNow(T0 + TEN_S);
    const ctx = fightCtx(enemyDotSeed(), MODULE, start);
    fire(ctx, start);

    // applied during round 1: exactly one tick so far (the end-of-round tick), none at application
    expect(lines(ctx, /applies a burning effect/)).toHaveLength(1);
    expect(ticksOnPlayer(ctx, 'Venom')).toBe(1);

    runRounds(ctx, start + TEN_S, () => rows(ctx, 'character_effect').length === 0);
    expect(rows(ctx, 'character_effect')).toHaveLength(0);
    expect(ticksOnPlayer(ctx, 'Venom')).toBe(Number(D));
  });
});

describe('a player DoT on an enemy ticks D times, the same count', () => {
  const EFFECT_SECONDS = 9n;
  const D = secondsToRounds(EFFECT_SECONDS);

  function playerDotSeed() {
    return fightSeed({
      withOpenRound: true,
      playerHp: BIG,
      enemies: [{ id: 1n, name: 'Cave Rat', hp: BIG, attackDamage: 1n }],
      extra: {
        ability_template: [
          {
            id: 1n, characterId: 1n, name: 'Brand', description: 'A burning brand.', kind: 'dot', targetRule: 'enemy',
            resourceType: 'mana', resourceCost: 10n, castSeconds: 0n, cooldownSeconds: 999n, scaling: 'int',
            value1: 5n, value2: undefined, damageType: 'fire', effectType: undefined, effectMagnitude: undefined,
            effectDuration: EFFECT_SECONDS, levelRequired: 1n, isGenerated: false,
          },
        ],
      },
    });
  }

  it('D ticks in total, one at the end of each round starting with the round it lands', () => {
    const ctx = fightCtx(playerDotSeed(), ALICE, T0 + 1_000_000n);
    handlers.use_ability(ctx, { characterId: 1n, abilityTemplateId: 1n }); // completes and resolves round 1
    expect(ticksOnEnemy(ctx, 'Brand')).toBe(1);

    runRounds(ctx, T0 + TEN_S + 1_000_000n, () => rows(ctx, 'combat_enemy_effect').length === 0);
    expect(rows(ctx, 'combat_enemy_effect')).toHaveLength(0);
    expect(ticksOnEnemy(ctx, 'Brand')).toBe(Number(D));
  });
});
