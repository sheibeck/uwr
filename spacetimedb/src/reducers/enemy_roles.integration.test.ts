/**
 * Phase 51.3.1.1 Plan 05 (D-53, D-40): the round engine drives the enemy-side abilities of Plan 04.
 * Supports heal and shield an ally of their own fight (and skip the ability when nobody needs it),
 * a wind-up remembers its ally in combat_enemy_cast.targetEnemyId, and the card data
 * (combat_enemy.healTargetEnemyId, aggroTargetCharacterId / aggroTargetPetId) is written.
 *
 * Runs the REAL captured resolve_round_timer on the strict mock db, with rows from the shared
 * TEST-ONLY fixture (helpers/combat_fight_fixture.ts). The enemy ability AI rolls
 * `roundSeed(now + enemyId + combatId, round) % 100 < 50`; `nowWhere` finds a timestamp whose roll
 * passes for the enemy under test, using the same pure function the module uses.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer, rowColumnProblems } from '../helpers/schema_recorder';
import { roundSeed } from '../helpers/combat_rounds';
import { T0, MODULE, fightSeed, fightCtx, rows, openTickArg } from '../helpers/combat_fight_fixture';
import { memberAbilities } from '../data/family_rules';

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
const BIG = 1_000_000n;

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

/** The module's enemy AI roll (50%) for one enemy of combat 1. */
const rollPasses = (now: bigint, round: bigint, enemyId: bigint): boolean =>
  roundSeed(now + enemyId + 1n, round) % 100n < 50n;

/** The first timestamp at or after the round's start whose AI roll passes for `enemyId`. */
function passingNow(round: bigint, enemyId: bigint): bigint {
  let now = T0 + round * TEN_S;
  while (!rollPasses(now, round, enemyId)) now += 1n;
  return now;
}

const events = (ctx: any, characterId: bigint) =>
  rows(ctx, 'event_private').filter((e: any) => e.characterId === characterId);
const lines = (ctx: any, characterId: bigint, pattern: RegExp) =>
  events(ctx, characterId).filter((e: any) => pattern.test(e.message));
const enemyRow = (ctx: any, id: bigint) => rows(ctx, 'combat_enemy').find((e: any) => e.id === id);
const characterRow = (ctx: any, id: bigint) => rows(ctx, 'character').find((c: any) => c.id === id);

/** An enemy's auto-attack line on character 1 (hit, crit, miss, dodge, parry or block). */
const autoAttackOn = (name: string) =>
  new RegExp(`^${name} (strikes you|lands a crushing blow)|^${name}'s strike misses you|^You (dodge|parry|block) ${name}'s strike`);

/** The rule ability of a role by kind (memberAbilities, Plan 02), with overrides for the test. */
function roleAbility(role: string, kind: string, over: Record<string, unknown> = {}) {
  const found = memberAbilities(role).find((a) => a.kind === kind);
  if (!found) throw new Error(`no ${kind} ability for role ${role}`);
  return { ...found, ...over };
}
const mend = (over: Record<string, unknown> = {}) => roleAbility('healer', 'heal', over);
const brace = (over: Record<string, unknown> = {}) => roleAbility('tank', 'shield', over);

type Member = {
  id: bigint;
  name: string;
  role: string;
  hp: bigint;
  maxHp?: bigint;
  abilities?: Record<string, unknown>[];
};

/**
 * A running fight (combat 1, round 1 open) against the listed members. Each member has its own
 * enemy_template (id = the member id) with its role and abilities. Member ids must start at 1n
 * (the fixture's spawn row points at template 1).
 */
function roleFight(
  members: Member[],
  opts: { targetEnemyId?: bigint; playerHp?: bigint; players?: 1 | 2; extra?: Record<string, any[]> } = {},
): Record<string, any[]> {
  const seed = fightSeed({
    withOpenRound: true,
    playerHp: BIG,
    players: opts.players ?? 1,
    enemies: members.map((m) => ({ id: m.id, name: m.name, hp: m.hp, maxHp: m.maxHp ?? m.hp })),
    extra: opts.extra,
  });
  const base = seed.enemy_template[0];
  seed.enemy_template = members.map((m) => ({ ...base, id: m.id, name: m.name, role: m.role }));
  for (const row of seed.combat_enemy) {
    row.enemyTemplateId = row.id;
    // the fixture's rows predate combat_enemy.level (0 = the template's level)
    if (row.level === undefined) row.level = 0n;
  }
  seed.enemy_ability = [
    ...(seed.enemy_ability ?? []),
    ...members.flatMap((m) =>
      (m.abilities ?? []).map((a, j) => ({ id: m.id * 10n + BigInt(j), enemyTemplateId: m.id, ...a })),
    ),
  ];
  for (const c of seed.character) {
    if (opts.targetEnemyId !== undefined) c.combatTargetEnemyId = opts.targetEnemyId;
    if (opts.playerHp !== undefined) c.hp = opts.playerHp;
  }
  return seed;
}

/** A self-heal the player uses instead of attacking, so the enemies keep their HP. */
const REST = {
  id: 1n,
  characterId: 1n,
  name: 'Rest',
  description: 'Catch your breath.',
  kind: 'heal',
  targetRule: 'self',
  resourceType: 'none',
  resourceCost: 0n,
  castSeconds: 0n,
  cooldownSeconds: 0n,
  scaling: 'wis',
  value1: 1n,
  value2: undefined,
  damageType: undefined,
  effectType: undefined,
  effectMagnitude: undefined,
  effectDuration: undefined,
  levelRequired: 1n,
  isGenerated: false,
};

/** Character 1 chooses Rest for `round` (seed `extra: { ability_template: [REST] }` first). */
function restIn(ctx: any, round: bigint) {
  ctx.db.combat_action.insert({
    id: 0n,
    combatId: 1n,
    characterId: 1n,
    roundNumber: round,
    actionType: 'ability',
    abilityTemplateId: REST.id,
    targetEnemyId: undefined,
    targetCharacterId: undefined,
    submittedAt: { microsSinceUnixEpoch: T0 },
  });
}

function columnProblems(ctx: any): string[] {
  const out: string[] = [];
  for (const table of ['combat_enemy', 'combat_enemy_cast', 'combat_enemy_effect']) {
    for (const row of rows(ctx, table)) {
      for (const p of rowColumnProblems(table, row)) out.push(`${table}: ${p}`);
    }
  }
  return out;
}

const RAT: Member = { id: 1n, name: 'Cave Rat', role: 'damage', hp: 30n, maxHp: 100n };

describe('a support heals the most hurt ally of its own fight (D-53)', () => {
  it('an immediate heal lands on the hurt ally, never the player, and names it in healTargetEnemyId', () => {
    const seed = roleFight(
      [RAT, { id: 2n, name: 'Mender', role: 'healer', hp: BIG, abilities: [mend({ castSeconds: 0n })] }],
      { targetEnemyId: 2n, playerHp: BIG / 2n },
    );
    const ctx = fightCtx(seed);
    fire(ctx, passingNow(1n, 2n));

    expect(enemyRow(ctx, 1n).currentHp).toBeGreaterThan(30n);
    expect(characterRow(ctx, 1n).hp).toBeLessThanOrEqual(BIG / 2n);
    expect(lines(ctx, 1n, /^Mender mends Cave Rat\.$/)).toHaveLength(1);
    expect(enemyRow(ctx, 2n).healTargetEnemyId).toBe(1n);
    expect(columnProblems(ctx)).toEqual([]);
  });

  it('with every enemy at full HP the support never casts Mend and auto-attacks instead (10 rounds)', () => {
    const seed = roleFight(
      [
        { id: 1n, name: 'Cave Rat', role: 'damage', hp: BIG },
        { id: 2n, name: 'Mender', role: 'healer', hp: BIG, abilities: [mend()] },
      ],
      { extra: { ability_template: [REST] } },
    );
    const ctx = fightCtx(seed);
    for (let round = 1n; round <= 10n; round++) {
      restIn(ctx, round);
      fire(ctx, passingNow(round, 2n));
    }
    expect(lines(ctx, 1n, /Mend/)).toHaveLength(0);
    expect(lines(ctx, 1n, /mends|recovers/)).toHaveLength(0);
    expect(rows(ctx, 'combat_enemy_cast')).toHaveLength(0);
    expect(lines(ctx, 1n, autoAttackOn('Mender'))).toHaveLength(10);
    expect(enemyRow(ctx, 2n).healTargetEnemyId).toBe(0n);
    expect(enemyRow(ctx, 1n).currentHp).toBe(BIG);
  });

  it('a wind-up heal stores its ally in combat_enemy_cast.targetEnemyId and lands on it', () => {
    const seed = roleFight(
      [RAT, { id: 2n, name: 'Mender', role: 'healer', hp: BIG, abilities: [mend()] }],
      { targetEnemyId: 2n },
    );
    const ctx = fightCtx(seed);
    fire(ctx, passingNow(1n, 2n));

    const casts = rows(ctx, 'combat_enemy_cast');
    expect(casts).toHaveLength(1);
    expect(casts[0]).toMatchObject({ enemyId: 2n, abilityKey: 'family_mend', targetEnemyId: 1n });
    expect(casts[0].targetCharacterId ?? undefined).toBeUndefined();
    expect(casts[0].targetPetId ?? undefined).toBeUndefined();
    expect(lines(ctx, 1n, /^Mender begins to cast Mend\.$/)).toHaveLength(1);
    expect(enemyRow(ctx, 2n).healTargetEnemyId).toBe(1n);
    expect(enemyRow(ctx, 1n).currentHp).toBe(30n);
    expect(columnProblems(ctx)).toEqual([]);

    fire(ctx, T0 + 2n * TEN_S);
    expect(enemyRow(ctx, 1n).currentHp).toBeGreaterThan(30n);
    expect(lines(ctx, 1n, /^Mender mends Cave Rat\.$/)).toHaveLength(1);
    expect(rows(ctx, 'combat_enemy_cast')).toHaveLength(0);
    // still shown while the heal has just landed; cleared at the support's next action
    expect(enemyRow(ctx, 2n).healTargetEnemyId).toBe(1n);
  });

  it('the heal target is cleared at the support\'s next round action', () => {
    const seed = roleFight(
      [RAT, { id: 2n, name: 'Mender', role: 'healer', hp: BIG, abilities: [mend({ castSeconds: 0n })] }],
      { targetEnemyId: 2n },
    );
    const ctx = fightCtx(seed);
    fire(ctx, passingNow(1n, 2n));
    expect(enemyRow(ctx, 2n).healTargetEnemyId).toBe(1n);
    // round 2: Mend is cooling down (10 s = 3 rounds), so the support auto-attacks
    fire(ctx, passingNow(2n, 2n));
    expect(lines(ctx, 1n, /^Mender mends/)).toHaveLength(1);
    expect(enemyRow(ctx, 2n).healTargetEnemyId).toBe(0n);
  });

  it('when the stored ally dies before landing, the heal lands on another hurt ally', () => {
    const seed = roleFight(
      [
        RAT,
        { id: 2n, name: 'Cave Bat', role: 'damage', hp: 50n, maxHp: 100n },
        { id: 3n, name: 'Mender', role: 'healer', hp: BIG, abilities: [mend()] },
      ],
      { targetEnemyId: 3n },
    );
    const ctx = fightCtx(seed);
    fire(ctx, passingNow(1n, 3n));
    expect(rows(ctx, 'combat_enemy_cast')[0]).toMatchObject({ enemyId: 3n, targetEnemyId: 1n });

    ctx.db.combat_enemy.id.update({ ...enemyRow(ctx, 1n), currentHp: 0n });
    fire(ctx, T0 + 2n * TEN_S);
    expect(enemyRow(ctx, 2n).currentHp).toBeGreaterThan(50n);
    expect(lines(ctx, 1n, /^Mender mends Cave Bat\.$/)).toHaveLength(1);
    expect(lines(ctx, 1n, /fizzles/)).toHaveLength(0);
    expect(enemyRow(ctx, 3n).healTargetEnemyId).toBe(2n);
  });

  it('when the stored ally dies and nobody else is hurt, the heal fizzles and never lands on a player', () => {
    const seed = roleFight(
      [RAT, { id: 2n, name: 'Mender', role: 'healer', hp: BIG, abilities: [mend()] }],
      { playerHp: BIG / 2n, extra: { ability_template: [REST] } },
    );
    const ctx = fightCtx(seed);
    restIn(ctx, 1n);
    fire(ctx, passingNow(1n, 2n));
    expect(rows(ctx, 'combat_enemy_cast')[0]).toMatchObject({ enemyId: 2n, targetEnemyId: 1n });

    ctx.db.combat_enemy.id.update({ ...enemyRow(ctx, 1n), currentHp: 0n });
    restIn(ctx, 2n);
    fire(ctx, T0 + 2n * TEN_S);
    expect(lines(ctx, 1n, /^Mender's Mend fizzles\.$/)).toHaveLength(1);
    expect(lines(ctx, 1n, /^Mend restores/)).toHaveLength(0);
    expect(lines(ctx, 1n, /mends|recovers/)).toHaveLength(0);
    expect(rows(ctx, 'combat_enemy_cast')).toHaveLength(0);
    expect(enemyRow(ctx, 2n).healTargetEnemyId).toBe(0n);
  });
});

describe('a tank shields an unshielded ally (D-53)', () => {
  it('Brace (shield, self) puts a damage_shield on the tank and names it in healTargetEnemyId', () => {
    const seed = roleFight([{ id: 1n, name: 'Warder', role: 'tank', hp: BIG, abilities: [brace()] }]);
    const ctx = fightCtx(seed);
    fire(ctx, passingNow(1n, 1n));

    const shields = rows(ctx, 'combat_enemy_effect').filter((e: any) => e.effectType === 'damage_shield');
    expect(shields).toHaveLength(1);
    expect(shields[0]).toMatchObject({ enemyId: 1n, sourceAbility: 'Brace' });
    expect(shields[0].magnitude).toBeGreaterThan(0n);
    expect(lines(ctx, 1n, /^Warder is shielded by Brace\.$/)).toHaveLength(1);
    expect(enemyRow(ctx, 1n).healTargetEnemyId).toBe(1n);
    expect(columnProblems(ctx)).toEqual([]);
  });

  it('a self shield is skipped while the tank is already shielded: it auto-attacks instead', () => {
    const seed = roleFight([{ id: 1n, name: 'Warder', role: 'tank', hp: BIG, abilities: [brace()] }], {
      extra: {
        combat_enemy_effect: [
          { id: 1n, combatId: 1n, enemyId: 1n, effectType: 'damage_shield', magnitude: 50n, roundsRemaining: 5n, sourceAbility: 'Old Ward', ownerCharacterId: undefined },
        ],
      },
    });
    const ctx = fightCtx(seed);
    fire(ctx, passingNow(1n, 1n));

    const shields = rows(ctx, 'combat_enemy_effect').filter((e: any) => e.effectType === 'damage_shield');
    expect(shields.map((s: any) => s.sourceAbility)).toEqual(['Old Ward']);
    expect(lines(ctx, 1n, /shielded by Brace/)).toHaveLength(0);
    expect(rows(ctx, 'combat_enemy_cooldown')).toHaveLength(0);
    expect(lines(ctx, 1n, autoAttackOn('Warder'))).toHaveLength(1);
    expect(enemyRow(ctx, 1n).healTargetEnemyId).toBe(0n);
  });

  it('a single_ally shield picks an unshielded ally when the caster is shielded', () => {
    const seed = roleFight(
      [
        { id: 1n, name: 'Cave Rat', role: 'damage', hp: BIG },
        { id: 2n, name: 'Warder', role: 'tank', hp: BIG, abilities: [brace({ targetRule: 'single_ally' })] },
      ],
      {
        extra: {
          combat_enemy_effect: [
            { id: 1n, combatId: 1n, enemyId: 2n, effectType: 'damage_shield', magnitude: 50n, roundsRemaining: 5n, sourceAbility: 'Old Ward', ownerCharacterId: undefined },
          ],
        },
      },
    );
    const ctx = fightCtx(seed);
    fire(ctx, passingNow(1n, 2n));

    const braced = rows(ctx, 'combat_enemy_effect').filter((e: any) => e.sourceAbility === 'Brace');
    expect(braced).toHaveLength(1);
    expect(braced[0].enemyId).toBe(1n);
    expect(lines(ctx, 1n, /^Cave Rat is shielded by Brace\.$/)).toHaveLength(1);
    expect(enemyRow(ctx, 2n).healTargetEnemyId).toBe(1n);
  });
});

describe('the enemy target is written on its row (D-40)', () => {
  const restFight = (extra: Record<string, any[]> = {}, players: 1 | 2 = 1) =>
    roleFight([{ id: 1n, name: 'Cave Rat', role: 'damage', hp: BIG }], {
      players,
      extra: { ability_template: [REST], ...extra },
    });

  it('an auto-attack on Aldric writes aggroTargetCharacterId; an unchanged target is not rewritten', () => {
    const ctx = fightCtx(restFight());
    restIn(ctx, 1n);
    fire(ctx, T0 + TEN_S);
    const after1 = enemyRow(ctx, 1n);
    expect(after1.aggroTargetCharacterId).toBe(1n);
    expect(after1.aggroTargetPetId ?? undefined).toBeUndefined();
    expect(lines(ctx, 1n, autoAttackOn('Cave Rat'))).toHaveLength(1);
    expect(columnProblems(ctx)).toEqual([]);

    restIn(ctx, 2n);
    fire(ctx, T0 + 2n * TEN_S);
    expect(lines(ctx, 1n, autoAttackOn('Cave Rat'))).toHaveLength(2);
    // the same target: the row was not written again (the mock replaces the object on every update)
    expect(enemyRow(ctx, 1n)).toBe(after1);
  });

  it('a damage ability on Aldric writes aggroTargetCharacterId', () => {
    const seed = roleFight([
      {
        id: 1n,
        name: 'Cave Rat',
        role: 'damage',
        hp: BIG,
        abilities: [{ abilityKey: 'bolt', name: 'Bolt', kind: 'damage', castSeconds: 0n, cooldownSeconds: 0n, targetRule: 'aggro' }],
      },
    ]);
    const ctx = fightCtx(seed);
    fire(ctx, passingNow(1n, 1n));
    expect(lines(ctx, 1n, /^Cave Rat's Bolt hits you for \d+ damage\.$/)).toHaveLength(1);
    expect(enemyRow(ctx, 1n).aggroTargetCharacterId).toBe(1n);
  });

  it('a wind-up writes the target when it is announced', () => {
    const seed = roleFight([
      {
        id: 1n,
        name: 'Cave Rat',
        role: 'damage',
        hp: BIG,
        abilities: [{ abilityKey: 'bolt', name: 'Bolt', kind: 'damage', castSeconds: 2n, cooldownSeconds: 0n, targetRule: 'aggro' }],
      },
    ]);
    const ctx = fightCtx(seed);
    fire(ctx, passingNow(1n, 1n));
    expect(rows(ctx, 'combat_enemy_cast')).toHaveLength(1);
    expect(enemyRow(ctx, 1n).aggroTargetCharacterId).toBe(1n);
  });

  it('a pet with the top aggro writes aggroTargetPetId and clears the character', () => {
    const pet = {
      id: 1n, characterId: 1n, combatId: 1n, name: 'Rex', level: 1n, currentHp: 500n, maxHp: 500n,
      attackDamage: 4n, abilityKey: undefined, nextAbilityAt: undefined, abilityCooldownSeconds: undefined,
      targetEnemyId: 1n, nextAutoAttackAt: undefined, expiresAtMicros: undefined,
    };
    const seed = restFight({
      active_pet: [pet],
      aggro_entry: [{ id: 50n, combatId: 1n, enemyId: 1n, characterId: 1n, petId: 1n, value: 100_000n }],
    });
    seed.combat_enemy[0].aggroTargetCharacterId = 1n;
    const ctx = fightCtx(seed);
    restIn(ctx, 1n);
    fire(ctx, T0 + TEN_S);
    expect(lines(ctx, 1n, /^Cave Rat strikes Rex for \d+ damage\./)).toHaveLength(1);
    const enemy = enemyRow(ctx, 1n);
    expect(enemy.aggroTargetPetId).toBe(1n);
    expect(enemy.aggroTargetCharacterId ?? undefined).toBeUndefined();
  });

  it('a new top-aggro character rewrites the target', () => {
    const ctx = fightCtx(restFight({}, 2));
    restIn(ctx, 1n);
    fire(ctx, T0 + TEN_S);
    const first = enemyRow(ctx, 1n).aggroTargetCharacterId as bigint;
    expect([1n, 2n]).toContain(first);
    const other = first === 1n ? 2n : 1n;
    const entry = rows(ctx, 'aggro_entry').find((e: any) => e.enemyId === 1n && e.characterId === other && !e.petId);
    ctx.db.aggro_entry.id.update({ ...entry, value: 1_000_000n });
    restIn(ctx, 2n);
    fire(ctx, T0 + 2n * TEN_S);
    expect(enemyRow(ctx, 1n).aggroTargetCharacterId).toBe(other);
  });
});

describe('an enemy shield absorbs player auto-attacks and pet attacks (D-53, T-51.3.1.1-14)', () => {
  const ward = (magnitude: bigint) => ({
    id: 1n, combatId: 1n, enemyId: 1n, effectType: 'damage_shield', magnitude, roundsRemaining: 50n,
    sourceAbility: 'Brace', ownerCharacterId: undefined,
  });
  const shieldOf = (ctx: any) =>
    rows(ctx, 'combat_enemy_effect').find((e: any) => e.enemyId === 1n && e.effectType === 'damage_shield');
  const numberIn = (message: string): bigint => BigInt(/(\d+) damage/.exec(message)![1]);
  /** One Cave Rat with a ward; the player is level 30 so a fist hit is bigger than 1. */
  const wardedFight = (magnitude: bigint, extra: Record<string, any[]> = {}) => {
    const seed = roleFight([{ id: 1n, name: 'Cave Rat', role: 'damage', hp: BIG }], {
      extra: { combat_enemy_effect: [ward(magnitude)], ...extra },
    });
    seed.character[0].level = 30n;
    return seed;
  };

  it('a player auto-attack into a large shield leaves the enemy HP untouched and drains the shield', () => {
    const ctx = fightCtx(wardedFight(1_000n));
    fire(ctx, T0 + TEN_S);
    const absorbed = lines(ctx, 1n, /^A ward on Cave Rat absorbs \d+ damage\.$/);
    expect(absorbed).toHaveLength(1);
    const n = numberIn(absorbed[0].message);
    expect(n).toBeGreaterThan(0n);
    expect(enemyRow(ctx, 1n).currentHp).toBe(BIG);
    expect(shieldOf(ctx).magnitude).toBe(1_000n - n);
    expect(lines(ctx, 1n, /^Your fists (hits|crits) Cave Rat for 0 damage/)).toHaveLength(1);
  });

  it('a shield smaller than the hit is used up and the rest reaches the enemy', () => {
    const ctx = fightCtx(wardedFight(1n));
    fire(ctx, T0 + TEN_S);
    expect(lines(ctx, 1n, /^A ward on Cave Rat absorbs 1 damage\.$/)).toHaveLength(1);
    const hit = lines(ctx, 1n, /^Your fists (hits|crits) Cave Rat for \d+ damage/);
    expect(hit).toHaveLength(1);
    const dealt = numberIn(hit[0].message);
    expect(dealt).toBeGreaterThan(0n);
    expect(enemyRow(ctx, 1n).currentHp).toBe(BIG - dealt);
    expect(shieldOf(ctx)).toBeUndefined();
  });

  it('a pet attack into a shield is absorbed: the enemy HP stays and the owner sees the ward', () => {
    const pet = {
      id: 1n, characterId: 1n, combatId: 1n, name: 'Rex', level: 1n, currentHp: 5_000n, maxHp: 5_000n,
      attackDamage: 20n, abilityKey: undefined, nextAbilityAt: undefined, abilityCooldownSeconds: undefined,
      targetEnemyId: 1n, nextAutoAttackAt: undefined, expiresAtMicros: undefined,
    };
    const ctx = fightCtx(wardedFight(1_000n, { ability_template: [REST], active_pet: [pet] }));
    for (let round = 1n; round <= 3n; round++) {
      restIn(ctx, round);
      fire(ctx, T0 + round * TEN_S);
    }
    const petHits = lines(ctx, 1n, /^Rex hits Cave Rat for \d+\.$/);
    const wards = lines(ctx, 1n, /^A ward on Cave Rat absorbs \d+ damage\.$/);
    expect(wards.length).toBeGreaterThan(0);
    expect(petHits.length).toBe(wards.length);
    for (const line of petHits) expect(line.message).toBe('Rex hits Cave Rat for 0.');
    const absorbed = wards.reduce((sum: bigint, w: any) => sum + numberIn(w.message), 0n);
    expect(enemyRow(ctx, 1n).currentHp).toBe(BIG);
    expect(shieldOf(ctx).magnitude).toBe(1_000n - absorbed);
  });
});
