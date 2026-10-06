/**
 * Phase 46.1 Plan 07 (RND-03): the non-player actors of a fight count in rounds. Enemy wind-ups and
 * enemy ability cooldowns (Task 1), pets, pending adds and the resolve_pull guard (Task 2), through
 * the REAL captured reducers on a strict mock db. Rows come from the shared TEST-ONLY fixture
 * (helpers/combat_fight_fixture.ts).
 *
 * The enemy ability AI rolls `roundSeed(now + enemyId + combatId, round) % 100 < 50`; `passingNow`
 * finds a timestamp whose roll passes, using the same pure function the module uses.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer, rowColumnProblems } from '../helpers/schema_recorder';
import { roundSeed } from '../helpers/combat_rounds';
import {
  T0,
  MODULE,
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
  for (const name of ['resolve_round_timer']) {
    const h = capturedReducer(name);
    if (typeof h !== 'function') {
      throw new Error(`capturedReducer('${name}') is not a function: the schema recorder could not capture it.`);
    }
    handlers[name] = h;
  }
}, 120_000);

const TEN_S = 10_000_000n;

/** Resolve the open round the way the scheduler does: the module calls the reducer with the tick row. */
function fire(ctx: any, atMicros?: bigint) {
  if (atMicros !== undefined) ctx.timestamp = { microsSinceUnixEpoch: atMicros };
  const tick = openTickArg(ctx);
  ctx.sender = MODULE;
  handlers.resolve_round_timer(ctx, tick);
  const table = ctx.db._tables.round_timer_tick ?? [];
  const idx = table.findIndex((r: any) => r.scheduledId === tick.arg.scheduledId);
  if (idx >= 0) table.splice(idx, 1);
}

/** The enemy AI roll of the module (50% chance), for enemy 1 of combat 1. */
const rollPasses = (now: bigint, round: bigint, enemyId = 1n): boolean =>
  roundSeed(now + enemyId + 1n, round) % 100n < 50n;

/** The first timestamp at or after `from` whose AI roll for `round` passes. */
function passingNow(round: bigint, from: bigint = T0 + TEN_S, enemyId = 1n): bigint {
  let now = from;
  while (!rollPasses(now, round, enemyId)) now += 1n;
  return now;
}

const events = (ctx: any, characterId: bigint) =>
  rows(ctx, 'event_private').filter((e: any) => e.characterId === characterId);
const lines = (ctx: any, characterId: bigint, pattern: RegExp) =>
  events(ctx, characterId).filter((e: any) => pattern.test(e.message));
const ENEMY_ATTACK = /Cave Rat (strikes you|lands a crushing blow)|strike misses you|You (dodge|parry|block) Cave Rat/;
const BOLT_HIT = /Cave Rat's Bolt hits you for \d+ damage/;
const BEGINS = /Cave Rat begins to cast Bolt\./;

const bolt = (over: Record<string, unknown> = {}) => ({
  id: 1n,
  enemyTemplateId: 1n,
  abilityKey: 'bolt',
  name: 'Bolt',
  kind: 'damage',
  castSeconds: 0n,
  cooldownSeconds: 0n,
  targetRule: 'aggro',
  ...over,
});

const BIG = 1_000_000n;

function casterSeed(abilityOver: Record<string, unknown> = {}, opts: Parameters<typeof fightSeed>[0] = {}) {
  return fightSeed({
    withOpenRound: true,
    playerHp: BIG,
    enemies: [{ id: 1n, name: 'Cave Rat', hp: BIG, attackDamage: 5n }],
    ...opts,
    extra: { enemy_ability: [bolt(abilityOver)], ...(opts.extra ?? {}) },
  });
}

function schemaProblems(ctx: any): string[] {
  const out: string[] = [];
  for (const table of ['combat_enemy_cast', 'combat_enemy_cooldown']) {
    for (const row of rows(ctx, table)) {
      for (const p of rowColumnProblems(table, row)) out.push(`${table}: ${p}`);
    }
  }
  return out;
}

describe('enemy wind-ups announce in one round and land at the end of a later round (RND-03)', () => {
  it('a 1-round wind-up (castSeconds 2) is announced in round 1 and lands at the end of round 2', () => {
    const ctx = fightCtx(casterSeed({ castSeconds: 2n }));
    fire(ctx, passingNow(1n));

    const casts = rows(ctx, 'combat_enemy_cast');
    expect(casts).toHaveLength(1);
    expect(casts[0]).toMatchObject({
      combatId: 1n,
      enemyId: 1n,
      abilityKey: 'bolt',
      announcedRound: 1n,
      landsAtRound: 2n,
      targetCharacterId: 1n,
    });
    expect(casts[0].endsAtMicros).toBeGreaterThan(0n);
    expect(lines(ctx, 1n, BEGINS)).toHaveLength(1);
    expect(lines(ctx, 1n, BOLT_HIT)).toHaveLength(0);
    // the enemy took no other action in the announcing round
    expect(lines(ctx, 1n, ENEMY_ATTACK)).toHaveLength(0);
    expect(schemaProblems(ctx)).toEqual([]);

    fire(ctx, passingNow(2n, T0 + 2n * TEN_S));
    expect(lines(ctx, 1n, BOLT_HIT)).toHaveLength(1);
    // while winding up the enemy makes no auto-attack and announces nothing else
    expect(lines(ctx, 1n, ENEMY_ATTACK)).toHaveLength(0);
    expect(lines(ctx, 1n, BEGINS)).toHaveLength(1);
    expect(rows(ctx, 'combat_enemy_cast')).toHaveLength(0);
  });

  it('a 2-round wind-up (castSeconds 5) lands at the end of round 3, not before', () => {
    const ctx = fightCtx(casterSeed({ castSeconds: 5n }));
    fire(ctx, passingNow(1n));
    expect(rows(ctx, 'combat_enemy_cast')[0]).toMatchObject({ announcedRound: 1n, landsAtRound: 3n });

    fire(ctx, passingNow(2n, T0 + 2n * TEN_S));
    expect(lines(ctx, 1n, BOLT_HIT)).toHaveLength(0);
    expect(lines(ctx, 1n, ENEMY_ATTACK)).toHaveLength(0);
    expect(rows(ctx, 'combat_enemy_cast')).toHaveLength(1);

    fire(ctx, passingNow(3n, T0 + 3n * TEN_S));
    expect(lines(ctx, 1n, BOLT_HIT)).toHaveLength(1);
    expect(rows(ctx, 'combat_enemy_cast')).toHaveLength(0);
  });

  it('an ability without a cast time resolves at once and writes no cast row', () => {
    const ctx = fightCtx(casterSeed({ castSeconds: 0n }));
    fire(ctx, passingNow(1n));
    expect(lines(ctx, 1n, BOLT_HIT)).toHaveLength(1);
    expect(lines(ctx, 1n, BEGINS)).toHaveLength(0);
    expect(rows(ctx, 'combat_enemy_cast')).toHaveLength(0);
  });

  it('the announcement goes to every active participant', () => {
    const ctx = fightCtx(casterSeed({ castSeconds: 2n }, { players: 2 }));
    fire(ctx, passingNow(1n));
    expect(lines(ctx, 1n, BEGINS)).toHaveLength(1);
    expect(lines(ctx, 2n, BEGINS)).toHaveLength(1);
  });

  it('a stun on the winding-up enemy interrupts the cast: the line is posted, nothing lands', () => {
    const ctx = fightCtx(casterSeed({ castSeconds: 2n }));
    fire(ctx, passingNow(1n));
    expect(rows(ctx, 'combat_enemy_cast')).toHaveLength(1);

    ctx.db.combat_enemy_effect.insert({
      id: 0n, combatId: 1n, enemyId: 1n, effectType: 'stun', magnitude: 1n, roundsRemaining: 1n,
      sourceAbility: 'Shield Bash', ownerCharacterId: 1n,
    });
    fire(ctx, passingNow(2n, T0 + 2n * TEN_S));
    expect(rows(ctx, 'combat_enemy_cast')).toHaveLength(0);
    expect(lines(ctx, 1n, /Cave Rat's Bolt is interrupted\./)).toHaveLength(1);
    expect(lines(ctx, 1n, BOLT_HIT)).toHaveLength(0);
    expect(lines(ctx, 1n, ENEMY_ATTACK)).toHaveLength(0);
  });

  it('an enemy that dies before the wind-up lands: the cast row is deleted silently and nothing lands', () => {
    const seed = casterSeed({ castSeconds: 2n }, {
      enemies: [
        { id: 1n, name: 'Cave Rat', hp: BIG },
        { id: 2n, name: 'Cave Bat', hp: BIG },
      ],
    });
    seed.enemy_template.push({ ...seed.enemy_template[0], id: 2n, name: 'Cave Bat' });
    seed.combat_enemy[1].enemyTemplateId = 2n;
    const ctx = fightCtx(seed);
    fire(ctx, passingNow(1n));
    expect(rows(ctx, 'combat_enemy_cast')).toHaveLength(1);

    const enemy = rows(ctx, 'combat_enemy').find((e: any) => e.id === 1n);
    ctx.db.combat_enemy.id.update({ ...enemy, currentHp: 0n });
    fire(ctx, passingNow(2n, T0 + 2n * TEN_S));
    expect(rows(ctx, 'combat_enemy_cast')).toHaveLength(0);
    expect(lines(ctx, 1n, BOLT_HIT)).toHaveLength(0);
    expect(lines(ctx, 1n, /interrupted|fizzles/)).toHaveLength(0);
  });

  it('when the stored target left the fight the ability retargets to the other player', () => {
    const ctx = fightCtx(casterSeed({ castSeconds: 2n }, { players: 2 }));
    fire(ctx, passingNow(1n));
    const stored = rows(ctx, 'combat_enemy_cast')[0].targetCharacterId as bigint;
    const other = stored === 1n ? 2n : 1n;

    // the stored target is gone from the fight (fled)
    const participant = rows(ctx, 'combat_participant').find((p: any) => p.characterId === stored);
    ctx.db.combat_participant.id.delete(participant.id);
    fire(ctx, passingNow(2n, T0 + 2n * TEN_S));

    expect(lines(ctx, other, BOLT_HIT)).toHaveLength(1);
    expect(lines(ctx, stored, BOLT_HIT)).toHaveLength(0);
    expect(rows(ctx, 'combat_enemy_cast')).toHaveLength(0);
  });

  it('a stored pet target that died retargets by the ability rule', () => {
    const ctx = fightCtx(casterSeed({ castSeconds: 2n }));
    fire(ctx, passingNow(1n));
    const cast = rows(ctx, 'combat_enemy_cast')[0];
    // the announced target was a pet that no longer exists
    ctx.db.combat_enemy_cast.id.update({ ...cast, targetCharacterId: undefined, targetPetId: 77n });
    fire(ctx, passingNow(2n, T0 + 2n * TEN_S));
    expect(lines(ctx, 1n, BOLT_HIT)).toHaveLength(1);
    expect(rows(ctx, 'combat_enemy_cast')).toHaveLength(0);
  });

  it('fizzles when the stored target is gone and the ability rule yields no target', () => {
    const seed = casterSeed({ castSeconds: 2n, targetRule: 'self' }, {
      extra: {
        combat_enemy_cast: [
          {
            id: 1n, combatId: 1n, enemyId: 1n, abilityKey: 'bolt', endsAtMicros: T0 + TEN_S,
            targetCharacterId: 99n, targetPetId: undefined, announcedRound: 0n, landsAtRound: 1n,
          },
        ],
      },
    });
    const ctx = fightCtx(seed);
    fire(ctx, T0 + TEN_S);
    expect(lines(ctx, 1n, /Cave Rat's Bolt fizzles\./)).toHaveLength(1);
    expect(lines(ctx, 1n, BOLT_HIT)).toHaveLength(0);
    expect(rows(ctx, 'combat_enemy_cast')).toHaveLength(0);
  });

  it('a cast row written before this phase (landsAtRound 0) lands in the next round', () => {
    const seed = casterSeed({ castSeconds: 2n }, {
      extra: {
        combat_enemy_cast: [
          {
            id: 1n, combatId: 1n, enemyId: 1n, abilityKey: 'bolt', endsAtMicros: T0 + TEN_S,
            targetCharacterId: 1n, targetPetId: undefined, announcedRound: 0n, landsAtRound: 0n,
          },
        ],
      },
    });
    const ctx = fightCtx(seed);
    fire(ctx, T0 + TEN_S);
    expect(lines(ctx, 1n, BOLT_HIT)).toHaveLength(1);
    expect(rows(ctx, 'combat_enemy_cast')).toHaveLength(0);
  });
});

describe('enemy ability cooldowns count rounds (RND-03)', () => {
  it('cooldownSeconds 8 used in round 1 is ready again from round 3, not in round 2', () => {
    const ctx = fightCtx(casterSeed({ cooldownSeconds: 8n }));
    const now1 = passingNow(1n);
    fire(ctx, now1);
    expect(lines(ctx, 1n, BOLT_HIT)).toHaveLength(1);
    const cooldowns = rows(ctx, 'combat_enemy_cooldown');
    expect(cooldowns).toHaveLength(1);
    expect(cooldowns[0]).toMatchObject({ combatId: 1n, enemyId: 1n, abilityKey: 'bolt', readyAtRound: 3n });
    // readyAtMicros is only an estimate: two rounds of 10 s from the use
    expect(cooldowns[0].readyAtMicros).toBe(now1 + 2n * TEN_S);
    expect(schemaProblems(ctx)).toEqual([]);

    // round 2: the roll passes, but the ability is still cooling down
    fire(ctx, passingNow(2n, T0 + 2n * TEN_S));
    expect(lines(ctx, 1n, BOLT_HIT)).toHaveLength(1);
    expect(lines(ctx, 1n, ENEMY_ATTACK).length).toBeGreaterThan(0);
    expect(rows(ctx, 'combat_enemy_cooldown')[0].readyAtRound).toBe(3n);

    // round 3: ready again, used again
    fire(ctx, passingNow(3n, T0 + 3n * TEN_S));
    expect(lines(ctx, 1n, BOLT_HIT)).toHaveLength(2);
    expect(rows(ctx, 'combat_enemy_cooldown')).toHaveLength(1);
    expect(rows(ctx, 'combat_enemy_cooldown')[0].readyAtRound).toBe(5n);
  });

  it('the cooldown counts rounds, not the clock: a far-future clock does not free the ability early', () => {
    const ctx = fightCtx(casterSeed({ cooldownSeconds: 8n }));
    fire(ctx, passingNow(1n));
    fire(ctx, passingNow(2n, T0 + 7_200_000_000n));
    expect(lines(ctx, 1n, BOLT_HIT)).toHaveLength(1);
  });

  it('a wind-up ability starts its cooldown when it is announced', () => {
    const ctx = fightCtx(casterSeed({ castSeconds: 2n, cooldownSeconds: 8n }));
    fire(ctx, passingNow(1n));
    expect(rows(ctx, 'combat_enemy_cooldown')[0]).toMatchObject({ abilityKey: 'bolt', readyAtRound: 3n });
  });

  it('an ability with cooldownSeconds 0 leaves no cooldown row', () => {
    const ctx = fightCtx(casterSeed({ cooldownSeconds: 0n }));
    fire(ctx, passingNow(1n));
    expect(lines(ctx, 1n, BOLT_HIT)).toHaveLength(1);
    expect(rows(ctx, 'combat_enemy_cooldown')).toHaveLength(0);
  });

  it('an enemy template with no abilities only auto-attacks and writes no cast or cooldown row', () => {
    const ctx = fightCtx(fightSeed({ withOpenRound: true, playerHp: BIG }));
    fire(ctx, passingNow(1n));
    expect(lines(ctx, 1n, ENEMY_ATTACK).length).toBeGreaterThan(0);
    expect(rows(ctx, 'combat_enemy_cast')).toHaveLength(0);
    expect(rows(ctx, 'combat_enemy_cooldown')).toHaveLength(0);
  });
});
