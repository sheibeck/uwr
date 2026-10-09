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
import { capturedReducer, rowColumnProblems, snapshotDb } from '../helpers/schema_recorder';
import { roundSeed } from '../helpers/combat_rounds';
import { spawnEnemyWithTemplate, computeLocationTargetLevel } from '../helpers/location';
import { computeEnemyStats } from '../helpers/combat_enemies';
import { placeSpawnLevel, templateAtLevel } from '../data/enemy_rules';
import {
  T0,
  MODULE,
  ALICE,
  fightSeed,
  startSeed,
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
  for (const name of ['resolve_round_timer', 'resolve_pull', 'pull_named_enemy']) {
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

// ── Task 2: pets, pending adds and the resolve_pull guard ──────────────────────────────────────────

const pet = (over: Record<string, unknown> = {}) => ({
  id: 1n,
  characterId: 1n,
  combatId: 1n,
  name: 'Rex',
  level: 1n,
  currentHp: 50n,
  maxHp: 50n,
  attackDamage: 4n,
  abilityKey: undefined,
  nextAbilityAt: 123n,
  abilityCooldownSeconds: undefined,
  targetEnemyId: undefined,
  nextAutoAttackAt: 456n,
  expiresAtMicros: undefined,
  ...over,
});

/** A pet auto-attack line (hit, miss, dodge, parry or block) for a pet, optionally against one enemy. */
const petAttack = (name: string, enemy = '[A-Za-z ]+'): RegExp =>
  new RegExp(`^${name} (hits|misses) ${enemy}|^${enemy} (dodges|parries|blocks) ${name}'s attack`);

const lineIndex = (ctx: any, characterId: bigint, pattern: RegExp): number =>
  events(ctx, characterId).findIndex((e: any) => pattern.test(e.message));

function petSeed(pets: any[], opts: Parameters<typeof fightSeed>[0] = {}) {
  return fightSeed({
    withOpenRound: true,
    playerHp: BIG,
    ...opts,
    extra: { active_pet: pets, ...(opts.extra ?? {}) },
  });
}

describe('pets act once per round, after the players and before the enemies (RND-03)', () => {
  it('a pet with a 10 s ability uses it in rounds 1 and 4 and auto-attacks every round', () => {
    const ctx = fightCtx(
      petSeed(
        [pet({ abilityKey: 'pet_bleed', abilityCooldownSeconds: 10n })],
        { enemies: [{ id: 1n, name: 'Cave Rat', hp: BIG }] },
      ),
    );
    const abilityRounds: number[] = [];
    const attackRounds: number[] = [];
    for (let round = 1; round <= 5; round++) {
      const bleedBefore = lines(ctx, 1n, /^Rex rends/).length;
      const attackBefore = lines(ctx, 1n, petAttack('Rex')).length;
      fire(ctx, T0 + BigInt(round) * TEN_S);
      if (lines(ctx, 1n, /^Rex rends/).length > bleedBefore) abilityRounds.push(round);
      if (lines(ctx, 1n, petAttack('Rex')).length > attackBefore) attackRounds.push(round);
    }
    expect(abilityRounds).toEqual([1, 4]);
    expect(attackRounds).toEqual([1, 2, 3, 4, 5]);
  });

  it('in combat no pet row gets a new nextAutoAttackAt or nextAbilityAt value', () => {
    const ctx = fightCtx(petSeed([pet({ abilityKey: 'pet_bleed', abilityCooldownSeconds: 10n })]));
    for (let round = 1; round <= 4; round++) fire(ctx, T0 + BigInt(round) * TEN_S);
    const row = rows(ctx, 'active_pet')[0];
    expect(row.nextAutoAttackAt).toBe(456n);
    expect(row.nextAbilityAt).toBe(123n);
  });

  it('a pet acts after the players and before the enemies, and two pets act in ascending pet id', () => {
    const ctx = fightCtx(
      petSeed([pet({ id: 2n, name: 'Bravo' }), pet({ id: 1n, name: 'Alpha' })]),
    );
    fire(ctx, T0 + TEN_S);
    const player = lineIndex(ctx, 1n, /^Your fists (hit|misses|crits)/);
    const alpha = lineIndex(ctx, 1n, petAttack('Alpha'));
    const bravo = lineIndex(ctx, 1n, petAttack('Bravo'));
    // the enemy may go for the pets, which hold aggro after their first hit
    const enemy = lineIndex(ctx, 1n, /Cave Rat strikes (Alpha|Bravo)|Cave Rat (strikes you|lands a crushing blow)|strike misses you|You (dodge|parry|block) Cave Rat/);
    expect(player).toBeGreaterThanOrEqual(0);
    expect(alpha).toBeGreaterThan(player);
    expect(bravo).toBeGreaterThan(alpha);
    expect(enemy).toBeGreaterThan(bravo);
  });

  it('a pet whose owner is dead is removed from the fight; the other owner pet stays', () => {
    const seed = petSeed(
      [pet({ id: 1n, characterId: 1n, name: 'Alpha' }), pet({ id: 2n, characterId: 2n, name: 'Bravo' })],
      { players: 2 },
    );
    seed.character.find((c: any) => c.id === 1n).hp = 0n;
    const ctx = fightCtx(seed);
    fire(ctx, T0 + TEN_S);
    expect(rows(ctx, 'active_pet').map((p: any) => p.id)).toEqual([2n]);
  });

  describe('the pet target', () => {
    const threeEnemies = [
      { id: 1n, name: 'Cave Rat', hp: BIG },
      { id: 2n, name: 'Cave Bat', hp: BIG },
      { id: 3n, name: 'Cave Cat', hp: BIG },
    ];
    const seedWith = (petOver: Record<string, unknown>, ownerTarget: bigint | undefined) => {
      const seed = petSeed([pet(petOver)], { enemies: threeEnemies });
      seed.character.find((c: any) => c.id === 1n).combatTargetEnemyId = ownerTarget;
      return seed;
    };

    it('its own living target first', () => {
      const ctx = fightCtx(seedWith({ targetEnemyId: 3n }, 2n));
      fire(ctx, T0 + TEN_S);
      expect(lines(ctx, 1n, petAttack('Rex', 'Cave Cat')).length).toBe(1);
      expect(lines(ctx, 1n, petAttack('Rex', 'Cave (Rat|Bat)')).length).toBe(0);
      expect(rows(ctx, 'active_pet')[0].targetEnemyId).toBe(3n);
    });

    it('else the owner current target', () => {
      const ctx = fightCtx(seedWith({ targetEnemyId: undefined }, 2n));
      fire(ctx, T0 + TEN_S);
      expect(lines(ctx, 1n, petAttack('Rex', 'Cave Bat')).length).toBe(1);
      expect(rows(ctx, 'active_pet')[0].targetEnemyId).toBe(2n);
    });

    it('a dead own target falls back to the owner target', () => {
      const seed = seedWith({ targetEnemyId: 3n }, 2n);
      seed.combat_enemy.find((e: any) => e.id === 3n).currentHp = 0n;
      const ctx = fightCtx(seed);
      fire(ctx, T0 + TEN_S);
      expect(lines(ctx, 1n, petAttack('Rex', 'Cave Bat')).length).toBe(1);
    });

    it('else the lowest-id living enemy', () => {
      const seed = seedWith({ targetEnemyId: undefined }, undefined);
      seed.combat_enemy.find((e: any) => e.id === 1n).currentHp = 0n;
      const ctx = fightCtx(seed);
      fire(ctx, T0 + TEN_S);
      expect(lines(ctx, 1n, petAttack('Rex', 'Cave Bat')).length).toBe(1);
      expect(rows(ctx, 'active_pet')[0].targetEnemyId).toBe(2n);
    });
  });
});

const pendingAdd = (over: Record<string, unknown> = {}) => ({
  id: 1n,
  combatId: 1n,
  enemyTemplateId: 1n,
  enemyRoleTemplateId: undefined,
  spawnId: 2n,
  arriveAtMicros: T0 + 5n * TEN_S,
  arriveAtRound: 2n,
  ...over,
});

const addSeed = (addOver: Record<string, unknown> = {}) =>
  fightSeed({
    withOpenRound: true,
    playerHp: BIG,
    extra: {
      enemy_spawn: [
        { id: 2n, locationId: 10n, enemyTemplateId: 1n, name: 'Cave Rat', state: 'engaged', lockedCombatId: 1n, groupCount: 0n },
      ],
      combat_pending_add: [pendingAdd(addOver)],
    },
  });

describe('pending adds arrive in rounds (RND-03)', () => {
  it('an add with arriveAtRound 2 has not joined after round 1 and joins at the end of round 2', () => {
    // the wall-clock arrival lies far in the past: only the round decides
    const ctx = fightCtx(addSeed({ arriveAtMicros: 1n }));
    fire(ctx, T0 + TEN_S);
    expect(rows(ctx, 'combat_enemy')).toHaveLength(1);
    expect(rows(ctx, 'combat_pending_add')).toHaveLength(1);

    fire(ctx, T0 + 2n * TEN_S);
    expect(rows(ctx, 'combat_enemy')).toHaveLength(2);
    expect(rows(ctx, 'combat_enemy').some((e: any) => e.spawnId === 2n)).toBe(true);
    expect(rows(ctx, 'combat_pending_add')).toHaveLength(0);
    expect(lines(ctx, 1n, /A social add arrives to assist/)).toHaveLength(1);
  });

  it('a pending add written before this phase (arriveAtRound 0) joins at the end of the next round', () => {
    const ctx = fightCtx(addSeed({ arriveAtRound: 0n, arriveAtMicros: T0 + 99n * TEN_S }));
    fire(ctx, T0 + TEN_S);
    expect(rows(ctx, 'combat_enemy')).toHaveLength(2);
    expect(rows(ctx, 'combat_pending_add')).toHaveLength(0);
  });
});

describe('resolve_pull: module-identity guard and adds in rounds', () => {
  const pullSeed = () => {
    const seed = startSeed({
      pull_state: [
        {
          id: 1n, characterId: 1n, groupId: undefined, locationId: 10n, enemySpawnId: 1n,
          pullType: 'careful', state: 'pending', outcome: undefined, delayedAdds: undefined,
          delayedAddsAtMicros: undefined, createdAt: { microsSinceUnixEpoch: T0 },
        },
      ],
      enemy_spawn: [
        { id: 2n, locationId: 10n, enemyTemplateId: 1n, name: 'Cave Rat', state: 'available', lockedCombatId: undefined, groupCount: 1n },
      ],
    });
    seed.enemy_template[0] = { ...seed.enemy_template[0], isSocial: true, socialRadius: 1n };
    return seed;
  };
  // (now + spawnId 1 + characterId 1) % 100 = 75: past a careful pull's success band, inside its partial band
  const PARTIAL_AT = T0 + 73n;
  const pullArg = { arg: { scheduledId: 1n, scheduledAt: { tag: 'Time', value: { microsSinceUnixEpoch: T0 } }, pullId: 1n } };

  it('ignores a call whose sender is not the module identity: the database is unchanged', () => {
    const ctx = fightCtx(pullSeed(), ALICE, PARTIAL_AT);
    const before = snapshotDb(ctx.db);
    handlers.resolve_pull(ctx, pullArg);
    expect(snapshotDb(ctx.db)).toBe(before);
  });

  it('a partial pull in round 1 stores arriveAtRound 2 and says the adds will arrive in 2 rounds', () => {
    const ctx = fightCtx(pullSeed(), MODULE, PARTIAL_AT);
    handlers.resolve_pull(ctx, pullArg);

    const pending = rows(ctx, 'combat_pending_add');
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ combatId: 1n, spawnId: 2n, arriveAtRound: 2n });
    expect(pending[0].arriveAtMicros).toBe(PARTIAL_AT + 2n * TEN_S);
    expect(rowColumnProblems('combat_pending_add', pending[0])).toEqual([]);
    expect(lines(ctx, 1n, /1 add will arrive in 2 rounds\./)).toHaveLength(1);
    expect(lines(ctx, 1n, /in \d+s\./)).toHaveLength(0);

    // the add has not joined after round 1 and is a combat enemy after round 2
    fire(ctx, T0 + TEN_S);
    expect(rows(ctx, 'combat_enemy')).toHaveLength(1);
    fire(ctx, T0 + 2n * TEN_S);
    expect(rows(ctx, 'combat_enemy')).toHaveLength(2);
    expect(rows(ctx, 'combat_pending_add')).toHaveLength(0);
  });
});

// ── Phase 51.3.1.1 Plan 05: named enemies, bosses and quest targets are single individuals ─────────

describe('a named, boss or quest-boss fight starts with exactly one enemy (D-07, D-52, D-53)', () => {
  /** Character 1 at location 10 in a danger-500 region (place target level 5), a group-sized template. */
  const namedSeed = () => {
    const seed = startSeed({
      location_enemy_template: [{ id: 95n, locationId: 10n, enemyTemplateId: 1n }],
      enemy_role_template: [
        { id: 1n, enemyTemplateId: 1n, roleKey: 'alpha', displayName: 'Old Greymaw', role: 'damage', roleDetail: '', abilityProfile: '' },
      ],
      named_enemy: [
        { id: 99n, characterId: 1n, enemyTemplateId: 1n, name: 'Old Greymaw', locationId: 10n, isAlive: true, lastKilledAt: undefined, respawnMinutes: 30n },
      ],
    });
    seed.region[0] = { ...seed.region[0], dangerMultiplier: 500n };
    seed.enemy_template[0] = { ...seed.enemy_template[0], groupMin: 4n, groupMax: 6n };
    return seed;
  };
  const spawnsOf = (ctx: any) => rows(ctx, 'enemy_spawn').filter((s: any) => s.id !== 1n);

  it('spawnEnemyWithTemplate (groupMin 3, groupMax 5) inserts one enemy_spawn with groupCount 1 and one member', () => {
    const seed = namedSeed();
    seed.enemy_template[0] = { ...seed.enemy_template[0], groupMin: 3n, groupMax: 5n };
    const ctx = fightCtx(seed, ALICE);
    const spawn = spawnEnemyWithTemplate(ctx, 10n, 1n) as any;

    expect(spawnsOf(ctx)).toHaveLength(1);
    expect(spawnsOf(ctx)[0]).toMatchObject({ id: spawn.id, enemyTemplateId: 1n, state: 'available', groupCount: 1n });
    const members = rows(ctx, 'enemy_spawn_member');
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ spawnId: spawn.id, enemyTemplateId: 1n, roleTemplateId: 1n });
    expect(rowColumnProblems('enemy_spawn', spawnsOf(ctx)[0])).toEqual([]);
  });

  it('pull_named_enemy for a template with groupMin 4 starts a fight with exactly one combat_enemy', () => {
    const ctx = fightCtx(namedSeed(), ALICE);
    handlers.pull_named_enemy(ctx, { characterId: 1n, namedEnemyId: 99n });

    expect(rows(ctx, 'combat_encounter')).toHaveLength(1);
    expect(rows(ctx, 'combat_enemy')).toHaveLength(1);
    // no spare copies of the named foe are left standing at the place
    expect(spawnsOf(ctx)).toHaveLength(1);
    expect(spawnsOf(ctx)[0].state).toBe('engaged');
    expect(rows(ctx, 'named_enemy')[0].isAlive).toBe(false);
  });

  it('the named enemy fights at the place-scaled level and stats, with no boss bonus', () => {
    const ctx = fightCtx(namedSeed(), ALICE);
    handlers.pull_named_enemy(ctx, { characterId: 1n, namedEnemyId: 99n });

    const template = rows(ctx, 'enemy_template')[0];
    const level = placeSpawnLevel(template.level, computeLocationTargetLevel(ctx, 10n, 1n), 0n);
    expect(level).toBe(5n); // the type is level 1; the danger-500 place scales it to 5
    expect(spawnsOf(ctx)[0].level).toBe(level);

    const enemy = rows(ctx, 'combat_enemy')[0];
    const role = rows(ctx, 'enemy_role_template')[0];
    const character = rows(ctx, 'character').find((c: any) => c.id === 1n);
    const expected = computeEnemyStats(templateAtLevel(template, level), role, [character]);
    expect(enemy.level).toBe(level);
    expect(enemy.maxHp).toBe(expected.maxHp);
    expect(enemy.currentHp).toBe(expected.maxHp);
    expect(enemy.attackDamage).toBe(expected.attackDamage);
    expect(enemy.armorClass).toBe(expected.armorClass);
    expect(enemy.displayName).toBe('Old Greymaw');
  });
});
