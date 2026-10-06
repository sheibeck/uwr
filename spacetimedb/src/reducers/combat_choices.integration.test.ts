/**
 * Phase 46.1 Plan 06 (RND-01, RND-02, RND-04): the round-choice input through the REAL captured
 * reducers (use_ability, submit_combat_action, flee_combat, move_character, tick_casts,
 * resolve_round_timer) on a strict mock db. Rows come from the shared TEST-ONLY fixture
 * (helpers/combat_fight_fixture.ts).
 *
 * The mock never deletes a fired scheduled row (the platform does, after the reducer returns), so
 * `fire` removes it, the way the runtime would.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer, rowColumnProblems } from '../helpers/schema_recorder';
import { calculateFleeChance } from '../helpers/combat_perks';
import { roundSeed } from '../helpers/combat_rounds';
import {
  T0,
  MODULE,
  ALICE,
  BOB,
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
  for (const name of [
    'use_ability',
    'submit_combat_action',
    'flee_combat',
    'move_character',
    'tick_casts',
    'resolve_round_timer',
  ]) {
    const h = capturedReducer(name);
    if (typeof h !== 'function') {
      throw new Error(`capturedReducer('${name}') is not a function: the schema recorder could not capture it.`);
    }
    handlers[name] = h;
  }
}, 120_000);

const TEN_S = 10_000_000n;

function fire(ctx: any, atMicros?: bigint) {
  if (atMicros !== undefined) ctx.timestamp = { microsSinceUnixEpoch: atMicros };
  const tick = openTickArg(ctx);
  const sender = ctx.sender;
  ctx.sender = MODULE;
  handlers.resolve_round_timer(ctx, tick);
  ctx.sender = sender;
  const table = ctx.db._tables.round_timer_tick ?? [];
  const idx = table.findIndex((r: any) => r.scheduledId === tick.arg.scheduledId);
  if (idx >= 0) table.splice(idx, 1);
}

const events = (ctx: any, characterId: bigint) =>
  rows(ctx, 'event_private').filter((e: any) => e.characterId === characterId);
const lines = (ctx: any, characterId: bigint, pattern: RegExp) =>
  events(ctx, characterId).filter((e: any) => pattern.test(e.message));
const roundRows = (ctx: any) =>
  [...rows(ctx, 'combat_round')].sort((a: any, b: any) => (a.roundNumber < b.roundNumber ? -1 : 1));
const ticksFor = (ctx: any, combatId = 1n) => rows(ctx, 'round_timer_tick').filter((r: any) => r.combatId === combatId);
const actions = (ctx: any) => rows(ctx, 'combat_action');

const ability = (over: Record<string, unknown> = {}) => ({
  id: 1n,
  characterId: 1n,
  name: 'Fire Bolt',
  description: 'A bolt of fire.',
  kind: 'damage',
  targetRule: 'enemy',
  resourceType: 'mana',
  resourceCost: 10n,
  castSeconds: 0n,
  cooldownSeconds: 8n,
  scaling: 'int',
  value1: 5n,
  value2: undefined,
  damageType: 'fire',
  effectType: undefined,
  effectMagnitude: undefined,
  effectDuration: undefined,
  levelRequired: 1n,
  isGenerated: false,
  ...over,
});

function schemaProblems(ctx: any): string[] {
  const out: string[] = [];
  for (const table of ['combat_round', 'combat_action', 'ability_cooldown', 'round_timer_tick']) {
    for (const row of rows(ctx, table)) {
      for (const p of rowColumnProblems(table, row)) out.push(`${table}: ${p}`);
    }
  }
  return out;
}

const BIG = 10_000n;
const ratFight = (over: Record<string, any> = {}) =>
  fightSeed({ withOpenRound: true, enemies: [{ id: 1n, name: 'Cave Rat', hp: BIG }], ...over });

/** A third character (id 3) that is not in the fight, or is in another fight. */
function strangerRow(inFightTwo: boolean) {
  const seed = ratFight({ players: 2 });
  const base = seed.character.find((c: any) => c.id === 1n);
  seed.character.push({ ...base, id: 3n, ownerUserId: 9n, name: 'Stranger' });
  if (inFightTwo) {
    seed.combat_encounter.push({ ...seed.combat_encounter[0], id: 2n });
    seed.combat_participant.push({ id: 9n, combatId: 2n, characterId: 3n, status: 'active', nextAutoAttackAt: 0n });
  }
  return seed;
}

describe('a solo choice resolves the round at once (RND-01)', () => {
  it('use_ability in combat resolves round 1 in the same call and opens round 2 with a fresh deadline', () => {
    const seed = ratFight({ extra: { ability_template: [ability()] } });
    const ctx = fightCtx(seed, ALICE, T0 + 3_000_000n);
    const oldTick = openTickArg(ctx).arg;
    handlers.use_ability(ctx, { characterId: 1n, abilityTemplateId: 1n });

    const [r1, r2, ...rest] = roundRows(ctx);
    expect(rest).toHaveLength(0);
    expect(r1).toMatchObject({ roundNumber: 1n, state: 'resolved' });
    expect(r2).toMatchObject({
      roundNumber: 2n,
      state: 'action_select',
      startedAtMicros: T0 + 3_000_000n,
      timerExpiresAtMicros: T0 + 3_000_000n + TEN_S,
    });
    expect(lines(ctx, 1n, /^You use Fire Bolt on Cave Rat\.$/)).toHaveLength(1);
    const ticks = ticksFor(ctx);
    expect(ticks).toHaveLength(1);
    expect(ticks[0].roundNumber).toBe(2n);
    expect(ticks.some((t: any) => t.scheduledId === oldTick.scheduledId)).toBe(false);
    expect(actions(ctx)).toHaveLength(0);
    expect(schemaProblems(ctx)).toEqual([]);
  });

  it('submit_combat_action without an ability is an auto-attack ready that resolves a solo round', () => {
    const ctx = fightCtx(ratFight(), ALICE);
    handlers.submit_combat_action(ctx, { characterId: 1n });
    expect(lines(ctx, 1n, /^You ready an attack\.$/)).toHaveLength(1);
    expect(roundRows(ctx).map((r: any) => [r.roundNumber, r.state])).toEqual([
      [1n, 'resolved'],
      [2n, 'action_select'],
    ]);
    expect(lines(ctx, 1n, /Your fists hit/)).toHaveLength(1);
  });

  it('an active fight with no round rows gets round 1 from the choice and resolves it for a solo player', () => {
    const seed = fightSeed({ enemies: [{ id: 1n, name: 'Cave Rat', hp: BIG }] });
    const ctx = fightCtx(seed, ALICE);
    expect(rows(ctx, 'combat_round')).toHaveLength(0);
    handlers.submit_combat_action(ctx, { characterId: 1n });
    expect(roundRows(ctx).map((r: any) => [r.roundNumber, r.state])).toEqual([
      [1n, 'resolved'],
      [2n, 'action_select'],
    ]);
    expect(ticksFor(ctx)).toHaveLength(1);
  });

  it('a choice after the deadline but before the tick ran is recorded for the open round and resolves it; the old tick is then stale', () => {
    const ctx = fightCtx(ratFight(), ALICE, T0 + TEN_S + 1_000_000n);
    const oldTick = openTickArg(ctx).arg;
    handlers.submit_combat_action(ctx, { characterId: 1n });
    expect(roundRows(ctx).map((r: any) => [r.roundNumber, r.state])).toEqual([
      [1n, 'resolved'],
      [2n, 'action_select'],
    ]);
    const before = JSON.stringify(roundRows(ctx), (_k, v) => (typeof v === 'bigint' ? `${v}n` : v));
    const eventsBefore = rows(ctx, 'event_private').length;
    ctx.sender = MODULE;
    handlers.resolve_round_timer(ctx, { arg: oldTick });
    ctx.sender = ALICE;
    expect(JSON.stringify(roundRows(ctx), (_k, v) => (typeof v === 'bigint' ? `${v}n` : v))).toBe(before);
    expect(rows(ctx, 'event_private')).toHaveLength(eventsBefore);
    expect(ticksFor(ctx)).toHaveLength(1);
  });
});

describe('two players: the round waits for both (RND-01, RND-04)', () => {
  it('the first choice leaves the round open with one auto_attack row; the second resolves it', () => {
    const ctx = fightCtx(ratFight({ players: 2 }), ALICE);
    handlers.submit_combat_action(ctx, { characterId: 1n });
    expect(roundRows(ctx).map((r: any) => [r.roundNumber, r.state])).toEqual([[1n, 'action_select']]);
    expect(actions(ctx)).toHaveLength(1);
    expect(actions(ctx)[0]).toMatchObject({ characterId: 1n, roundNumber: 1n, actionType: 'auto_attack' });
    expect(actions(ctx)[0].abilityTemplateId).toBeUndefined();

    ctx.sender = BOB;
    handlers.submit_combat_action(ctx, { characterId: 2n });
    expect(roundRows(ctx).map((r: any) => [r.roundNumber, r.state])).toEqual([
      [1n, 'resolved'],
      [2n, 'action_select'],
    ]);
    expect(lines(ctx, 1n, /Your fists hit/)).toHaveLength(1);
    expect(lines(ctx, 2n, /Your fists hit/)).toHaveLength(1);
    expect(actions(ctx)).toHaveLength(0);
  });

  it('a second choice by the same player replaces the first (one row), and the replacement is what resolves', () => {
    const seed = ratFight({
      players: 2,
      extra: { ability_template: [ability({ id: 1n, name: 'Fire Bolt' }), ability({ id: 2n, name: 'Frost Bolt' })] },
    });
    const ctx = fightCtx(seed, ALICE);
    handlers.use_ability(ctx, { characterId: 1n, abilityTemplateId: 1n });
    handlers.use_ability(ctx, { characterId: 1n, abilityTemplateId: 2n });
    expect(actions(ctx)).toHaveLength(1);
    expect(actions(ctx)[0]).toMatchObject({ characterId: 1n, actionType: 'ability', abilityTemplateId: 2n });
    expect(roundRows(ctx)[0].state).toBe('action_select');

    ctx.sender = BOB;
    handlers.submit_combat_action(ctx, { characterId: 2n });
    expect(lines(ctx, 1n, /^You use Frost Bolt on Cave Rat\.$/)).toHaveLength(1);
    expect(lines(ctx, 1n, /^You use Fire Bolt/)).toHaveLength(0);
  });

  it('a choice and then a switch to auto-attack keeps one row with no ability id', () => {
    const ctx = fightCtx(ratFight({ players: 2, extra: { ability_template: [ability()] } }), ALICE);
    handlers.use_ability(ctx, { characterId: 1n, abilityTemplateId: 1n });
    handlers.submit_combat_action(ctx, { characterId: 1n });
    expect(actions(ctx)).toHaveLength(1);
    expect(actions(ctx)[0].actionType).toBe('auto_attack');
    expect(actions(ctx)[0].abilityTemplateId).toBeUndefined();
  });

  it('a dead player is not waited on: the living one resolves the round alone', () => {
    const seed = ratFight({ players: 2 });
    const bob = seed.character.find((c: any) => c.id === 2n);
    bob.hp = 0n;
    seed.combat_participant.find((p: any) => p.characterId === 2n).status = 'dead';
    const ctx = fightCtx(seed, ALICE);
    handlers.submit_combat_action(ctx, { characterId: 1n });
    expect(roundRows(ctx).map((r: any) => r.state)).toEqual(['resolved', 'action_select']);
  });
});

describe('choice validation posts a visible line and writes nothing (RND-01)', () => {
  const rejected = (ctx: any, pattern: RegExp, characterId = 1n) => {
    expect(lines(ctx, characterId, pattern)).toHaveLength(1);
    expect(actions(ctx)).toHaveLength(0);
    expect(roundRows(ctx).map((r: any) => r.state)).toEqual(['action_select']);
  };

  it('a dead participant cannot act', () => {
    const seed = ratFight({ extra: { ability_template: [ability()] } });
    seed.character[0].hp = 0n;
    seed.combat_participant[0].status = 'dead';
    const ctx = fightCtx(seed, ALICE);
    handlers.use_ability(ctx, { characterId: 1n, abilityTemplateId: 1n });
    rejected(ctx, /^You cannot act right now\.$/);
  });

  it('an unknown ability is rejected', () => {
    const ctx = fightCtx(ratFight(), ALICE);
    handlers.submit_combat_action(ctx, { characterId: 1n, abilityTemplateId: 99n });
    rejected(ctx, /Unknown ability|Ability not available/);
  });

  it('another character\'s ability is rejected', () => {
    const seed = ratFight({ extra: { ability_template: [ability({ characterId: 2n })] } });
    const ctx = fightCtx(seed, ALICE);
    handlers.use_ability(ctx, { characterId: 1n, abilityTemplateId: 1n });
    rejected(ctx, /Ability not available/);
  });

  it('an ability above the character level is rejected', () => {
    const ctx = fightCtx(ratFight({ extra: { ability_template: [ability({ levelRequired: 5n })] } }), ALICE);
    handlers.use_ability(ctx, { characterId: 1n, abilityTemplateId: 1n });
    rejected(ctx, /Ability not unlocked/);
  });

  it('a utility ability keeps the at-peace refusal', () => {
    const ctx = fightCtx(ratFight({ extra: { ability_template: [ability({ kind: 'utility' })] } }), ALICE);
    handlers.use_ability(ctx, { characterId: 1n, abilityTemplateId: 1n });
    rejected(ctx, /^This ability can only be used when you are at peace\.$/);
  });

  it('an ability blocked for 2 more rounds names the rounds; 1 is singular', () => {
    const cd = (rounds: bigint) => ({
      ability_template: [ability()],
      ability_cooldown: [
        { id: 1n, characterId: 1n, abilityTemplateId: 1n, startedAtMicros: T0, durationMicros: rounds * TEN_S, roundsRemaining: rounds },
      ],
    });
    const two = fightCtx(ratFight({ extra: cd(2n) }), ALICE);
    handlers.use_ability(two, { characterId: 1n, abilityTemplateId: 1n });
    rejected(two, /^Fire Bolt is on cooldown for 2 more rounds\.$/);
    const one = fightCtx(ratFight({ extra: cd(1n) }), ALICE);
    handlers.use_ability(one, { characterId: 1n, abilityTemplateId: 1n });
    rejected(one, /^Fire Bolt is on cooldown for 1 more round\.$/);
  });

  it('not enough mana or stamina is rejected', () => {
    const seed = ratFight({ extra: { ability_template: [ability()] } });
    seed.character[0].mana = 5n;
    const ctx = fightCtx(seed, ALICE);
    handlers.use_ability(ctx, { characterId: 1n, abilityTemplateId: 1n });
    rejected(ctx, /Not enough mana/);

    const seed2 = ratFight({ extra: { ability_template: [ability({ resourceType: 'stamina' })] } });
    seed2.character[0].stamina = 5n;
    const ctx2 = fightCtx(seed2, ALICE);
    handlers.use_ability(ctx2, { characterId: 1n, abilityTemplateId: 1n });
    rejected(ctx2, /Not enough stamina/);
  });

  it('an ally target in another fight or in no fight is rejected (the stranger heal hole)', () => {
    for (const inFightTwo of [true, false]) {
      const seed = strangerRow(inFightTwo);
      seed.ability_template = [ability({ kind: 'heal', name: 'Mend', targetRule: 'ally' })];
      const ctx = fightCtx(seed, ALICE);
      handlers.use_ability(ctx, { characterId: 1n, abilityTemplateId: 1n, targetCharacterId: 3n });
      expect(lines(ctx, 1n, /^That target is not in this fight\.$/)).toHaveLength(1);
      expect(actions(ctx)).toHaveLength(0);
      expect(rows(ctx, 'character').find((c: any) => c.id === 3n).hp).toBe(BIG);
    }
  });

  it('an ally target that is dead is rejected', () => {
    const seed = ratFight({ players: 2, extra: { ability_template: [ability({ kind: 'heal', name: 'Mend', targetRule: 'ally' })] } });
    seed.character.find((c: any) => c.id === 2n).hp = 0n;
    const ctx = fightCtx(seed, ALICE);
    handlers.use_ability(ctx, { characterId: 1n, abilityTemplateId: 1n, targetCharacterId: 2n });
    expect(lines(ctx, 1n, /^That target is not in this fight\.$/)).toHaveLength(1);
  });

  it('an enemy of another fight or a dead enemy is rejected', () => {
    const seed = ratFight({ enemies: [{ id: 1n, name: 'Cave Rat', hp: BIG }, { id: 2n, name: 'Dead Rat', hp: 0n, maxHp: 40n }] });
    seed.combat_enemy.push({ ...seed.combat_enemy[0], id: 3n, combatId: 2n });
    const ctx = fightCtx(seed, ALICE);
    for (const enemyId of [3n, 2n]) {
      handlers.submit_combat_action(ctx, { characterId: 1n, targetEnemyId: enemyId });
    }
    expect(lines(ctx, 1n, /^That enemy is not in this fight\.$/)).toHaveLength(2);
    expect(actions(ctx)).toHaveLength(0);
    expect(rows(ctx, 'character').find((c: any) => c.id === 1n).combatTargetEnemyId).toBe(1n);
  });

  it('an unknown enemy id is rejected', () => {
    const ctx = fightCtx(ratFight(), ALICE);
    handlers.submit_combat_action(ctx, { characterId: 1n, targetEnemyId: 404n });
    rejected(ctx, /^That enemy is not in this fight\.$/);
  });
});

describe('valid targets and confirmations (RND-04)', () => {
  it('a valid targetEnemyId becomes the current target and is stored on the row', () => {
    const seed = ratFight({
      players: 2,
      enemies: [{ id: 1n, name: 'Cave Rat', hp: BIG }, { id: 2n, name: 'Big Rat', hp: BIG }],
    });
    const ctx = fightCtx(seed, ALICE);
    handlers.submit_combat_action(ctx, { characterId: 1n, targetEnemyId: 2n });
    expect(rows(ctx, 'character').find((c: any) => c.id === 1n).combatTargetEnemyId).toBe(2n);
    expect(actions(ctx)[0]).toMatchObject({ actionType: 'auto_attack', targetEnemyId: 2n });
  });

  it('a valid ally target (active participant of the same fight) is stored on the row', () => {
    const seed = ratFight({ players: 2, extra: { ability_template: [ability({ kind: 'heal', name: 'Mend', targetRule: 'ally' })] } });
    const ctx = fightCtx(seed, ALICE);
    handlers.use_ability(ctx, { characterId: 1n, abilityTemplateId: 1n, targetCharacterId: 2n });
    expect(actions(ctx)).toHaveLength(1);
    expect(actions(ctx)[0]).toMatchObject({ actionType: 'ability', abilityTemplateId: 1n, targetCharacterId: 2n });
    expect(schemaProblems(ctx)).toEqual([]);
  });

  it('confirmation lines name the ability or the attack', () => {
    const ctx = fightCtx(ratFight({ players: 2, extra: { ability_template: [ability()] } }), ALICE);
    handlers.use_ability(ctx, { characterId: 1n, abilityTemplateId: 1n });
    expect(lines(ctx, 1n, /^You ready Fire Bolt\.$/)).toHaveLength(1);
    expect(events(ctx, 1n).find((e: any) => /^You ready Fire Bolt\.$/.test(e.message)).kind).toBe('combat');
    handlers.submit_combat_action(ctx, { characterId: 1n });
    expect(lines(ctx, 1n, /^You ready an attack\.$/)).toHaveLength(1);
  });
});

describe('cooldown source by place (RND-03)', () => {
  const wallClock = [{ id: 1n, characterId: 1n, abilityTemplateId: 1n, startedAtMicros: T0, durationMicros: 60_000_000n, roundsRemaining: 0n }];

  it('in combat a live wall-clock cooldown with no rounds does not block the choice', () => {
    const ctx = fightCtx(ratFight({ players: 2, extra: { ability_template: [ability()], ability_cooldown: wallClock } }), ALICE);
    handlers.use_ability(ctx, { characterId: 1n, abilityTemplateId: 1n });
    expect(actions(ctx)).toHaveLength(1);
    expect(lines(ctx, 1n, /on cooldown/)).toHaveLength(0);
  });

  it('out of combat a live wall-clock cooldown still refuses', () => {
    const ctx = fightCtx(startSeed({ ability_template: [ability({ kind: 'heal', name: 'Mend', targetRule: 'self' })], ability_cooldown: wallClock }), ALICE);
    handlers.use_ability(ctx, { characterId: 1n, abilityTemplateId: 1n });
    expect(lines(ctx, 1n, /^Ability is on cooldown\.$/)).toHaveLength(1);
    expect(actions(ctx)).toHaveLength(0);
  });

  it('out of combat a ready ability still executes at once and starts a wall-clock cooldown', () => {
    const ctx = fightCtx(startSeed({ ability_template: [ability({ kind: 'heal', name: 'Mend', targetRule: 'self', value1: 5n, resourceType: 'stamina' })] }), ALICE);
    handlers.use_ability(ctx, { characterId: 1n, abilityTemplateId: 1n });
    expect(lines(ctx, 1n, /^You use Mend on yourself\.$/)).toHaveLength(1);
    expect(actions(ctx)).toHaveLength(0);
    const cd = rows(ctx, 'ability_cooldown');
    expect(cd).toHaveLength(1);
    expect(cd[0]).toMatchObject({ roundsRemaining: 0n, startedAtMicros: T0 });
    expect(cd[0].durationMicros).toBeGreaterThan(0n);
  });
});

describe('ownership (T-46.1-06-01)', () => {
  it('a call naming another player\'s character throws before any write', () => {
    const seed = ratFight({ players: 2, extra: { ability_template: [ability({ characterId: 2n })] } });
    for (const [name, args] of [
      ['submit_combat_action', { characterId: 2n }],
      ['use_ability', { characterId: 2n, abilityTemplateId: 1n }],
      ['flee_combat', { characterId: 2n }],
    ] as const) {
      const ctx = fightCtx(seed, ALICE);
      const snapshot = JSON.stringify(
        [rows(ctx, 'combat_action'), rows(ctx, 'combat_round'), rows(ctx, 'event_private')],
        (_k, v) => (typeof v === 'bigint' ? `${v}n` : v),
      );
      expect(() => handlers[name](ctx, args)).toThrow();
      expect(
        JSON.stringify([rows(ctx, 'combat_action'), rows(ctx, 'combat_round'), rows(ctx, 'event_private')], (_k, v) =>
          typeof v === 'bigint' ? `${v}n` : v,
        ),
      ).toBe(snapshot);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Task 2: flee as a round choice, mid-fight joiners, casts inside a fight
// ---------------------------------------------------------------------------------------------

/** A timestamp after round 1 opened at which the quick-123 roll for character `id` is below / at or above the chance. */
function timeWithRoll(id: bigint, round: bigint, dangerMultiplier: bigint, wantSuccess: boolean): bigint {
  const chance = calculateFleeChance(dangerMultiplier);
  for (let d = 0n; d < 1000n; d++) {
    const ts = T0 + 1_000_000n + d;
    const roll = Number(roundSeed(ts + id * 13n, round) % 100n);
    if (wantSuccess ? roll < chance : roll >= chance) return ts;
  }
  throw new Error('no timestamp found');
}

function groupSeed(seed: Record<string, any[]>) {
  for (const c of seed.character) c.groupId = 5n;
  seed.group = [{ id: 5n, leaderCharacterId: 1n }];
  seed.group_member = [
    { id: 1n, groupId: 5n, characterId: 1n, followLeader: true },
    { id: 2n, groupId: 5n, characterId: 2n, followLeader: true },
  ];
  return seed;
}

describe('flee is a round choice (RND-01, RND-04)', () => {
  it('flee_combat records a flee row without an ability, posts the attempt line and leaves the round open for the party', () => {
    const ctx = fightCtx(ratFight({ players: 2 }), ALICE);
    handlers.flee_combat(ctx, { characterId: 1n });
    expect(actions(ctx)).toHaveLength(1);
    expect(actions(ctx)[0]).toMatchObject({ characterId: 1n, actionType: 'flee', roundNumber: 1n });
    expect(actions(ctx)[0].abilityTemplateId).toBeUndefined();
    expect(lines(ctx, 1n, /^You attempt to flee\.\.\.$/)).toHaveLength(1);
    expect(roundRows(ctx).map((r: any) => r.state)).toEqual(['action_select']);
    expect(rows(ctx, 'combat_participant').every((p: any) => p.status === 'active')).toBe(true);
  });

  it('the group line is posted for a grouped character', () => {
    const ctx = fightCtx(groupSeed(ratFight({ players: 2 })), ALICE);
    handlers.flee_combat(ctx, { characterId: 1n });
    expect(rows(ctx, 'event_group').filter((e: any) => /Aldric attempts to flee\./.test(e.message)).length).toBeGreaterThan(0);
  });

  it('a successful flee removes the character from the fight and carries its cooldowns out', () => {
    const ts = timeWithRoll(1n, 1n, 100n, true);
    const seed = ratFight({
      extra: {
        ability_template: [ability()],
        ability_cooldown: [
          { id: 1n, characterId: 1n, abilityTemplateId: 1n, startedAtMicros: T0, durationMicros: 2n * TEN_S, roundsRemaining: 2n },
        ],
        active_pet: [
          { id: 1n, characterId: 1n, combatId: 1n, name: 'Wolf', level: 1n, currentHp: 20n, maxHp: 20n, attackDamage: 3n },
        ],
      },
    });
    seed.aggro_entry.push({ id: 50n, combatId: 1n, enemyId: 1n, characterId: 1n, petId: 1n, value: 0n });
    const ctx = fightCtx(seed, ALICE, ts);
    handlers.flee_combat(ctx, { characterId: 1n });

    expect(lines(ctx, 1n, /^You successfully flee\.$/)).toHaveLength(1);
    expect(rows(ctx, 'combat_participant').filter((p: any) => p.characterId === 1n)).toHaveLength(0);
    expect(rows(ctx, 'aggro_entry').filter((a: any) => a.characterId === 1n)).toHaveLength(0);
    expect(rows(ctx, 'active_pet')).toHaveLength(0);
    const alice = rows(ctx, 'character').find((c: any) => c.id === 1n);
    expect(alice.combatTargetEnemyId).toBeUndefined();
    expect(alice.lastCombatEndAt).toBe(ts);
    const cooldown = rows(ctx, 'ability_cooldown');
    expect(cooldown).toHaveLength(1);
    expect(cooldown[0]).toMatchObject({ roundsRemaining: 0n, startedAtMicros: ts, durationMicros: 8_000_000n });
    expect(actions(ctx).filter((a: any) => a.characterId === 1n)).toHaveLength(0);
  });

  it('a solo successful flee ends the fight: no narration job, spawn released, every round row gone', () => {
    const ts = timeWithRoll(1n, 1n, 100n, true);
    const ctx = fightCtx(ratFight(), ALICE, ts);
    handlers.flee_combat(ctx, { characterId: 1n });
    expect(rows(ctx, 'combat_encounter')[0].state).toBe('resolved');
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'enemy_spawn')[0]).toMatchObject({ state: 'available' });
    expect(rows(ctx, 'enemy_spawn')[0].lockedCombatId).toBeUndefined();
    expect(rows(ctx, 'combat_round')).toHaveLength(0);
    expect(rows(ctx, 'round_timer_tick')).toHaveLength(0);
    expect(rows(ctx, 'combat_action')).toHaveLength(0);
    expect(rows(ctx, 'combat_participant')).toHaveLength(0);
    // The character was already gone: the enemy attacked nobody.
    expect(lines(ctx, 1n, /Cave Rat (strikes you|lands a crushing blow)/)).toHaveLength(0);
  });

  it('a group flee success: the other player keeps fighting and the next round no longer waits for the one who fled', () => {
    const ts = timeWithRoll(1n, 1n, 100n, true);
    const ctx = fightCtx(ratFight({ players: 2 }), ALICE, ts);
    handlers.flee_combat(ctx, { characterId: 1n });
    ctx.sender = BOB;
    handlers.submit_combat_action(ctx, { characterId: 2n });
    expect(roundRows(ctx).map((r: any) => [r.roundNumber, r.state])).toEqual([
      [1n, 'resolved'],
      [2n, 'action_select'],
    ]);
    expect(rows(ctx, 'combat_participant').map((p: any) => p.characterId)).toEqual([2n]);
    expect(rows(ctx, 'combat_encounter')[0].state).toBe('active');
    expect(lines(ctx, 2n, /Your fists hit/)).toHaveLength(1);
    expect(lines(ctx, 1n, /Your fists hit/)).toHaveLength(0);
    // Round 2 waits only for BOB: his choice alone resolves it.
    handlers.submit_combat_action(ctx, { characterId: 2n });
    expect(roundRows(ctx).map((r: any) => r.state)).toEqual(['resolved', 'resolved', 'action_select']);
  });

  it('a failed flee posts the failure, keeps the player active, skips their attack and waits for them again next round', () => {
    const ts = timeWithRoll(1n, 1n, 300n, false);
    const seed = ratFight();
    seed.region[0].dangerMultiplier = 300n;
    const ctx = fightCtx(seed, ALICE, ts);
    handlers.flee_combat(ctx, { characterId: 1n });
    expect(lines(ctx, 1n, /^You fail to flee!$/)).toHaveLength(1);
    expect(lines(ctx, 1n, /Your fists hit/)).toHaveLength(0);
    expect(rows(ctx, 'combat_participant')[0].status).toBe('active');
    expect(rows(ctx, 'combat_encounter')[0].state).toBe('active');
    expect(lines(ctx, 1n, /Cave Rat (strikes you|lands a crushing blow)|strike misses you|You (dodge|parry|block) Cave Rat/).length)
      .toBeGreaterThan(0);
    expect(roundRows(ctx).map((r: any) => [r.roundNumber, r.state])).toEqual([
      [1n, 'resolved'],
      [2n, 'action_select'],
    ]);
    expect(actions(ctx)).toHaveLength(0);
    handlers.submit_combat_action(ctx, { characterId: 1n });
    expect(roundRows(ctx).map((r: any) => r.state)).toEqual(['resolved', 'resolved', 'action_select']);
  });

  it('success and failure both post the group line', () => {
    for (const success of [true, false]) {
      const dm = success ? 100n : 300n;
      const ts = timeWithRoll(1n, 1n, dm, success);
      const seed = groupSeed(ratFight({ players: 2 }));
      seed.region[0].dangerMultiplier = dm;
      const ctx = fightCtx(seed, ALICE, ts);
      handlers.flee_combat(ctx, { characterId: 1n });
      ctx.sender = BOB;
      handlers.submit_combat_action(ctx, { characterId: 2n });
      const pattern = success ? /Aldric successfully flees\./ : /Aldric fails to flee\./;
      expect(rows(ctx, 'event_group').filter((e: any) => pattern.test(e.message)).length).toBeGreaterThan(0);
    }
  });

  it('no participant is ever left in the old unresolved fleeing status', () => {
    for (const [dm, success] of [[100n, true], [300n, false]] as const) {
      const ts = timeWithRoll(1n, 1n, dm, success);
      const seed = ratFight({ players: 2 });
      seed.region[0].dangerMultiplier = dm;
      const ctx = fightCtx(seed, ALICE, ts);
      handlers.flee_combat(ctx, { characterId: 1n });
      expect(rows(ctx, 'combat_participant').some((p: any) => p.status === 'fleeing')).toBe(false);
      ctx.sender = BOB;
      handlers.submit_combat_action(ctx, { characterId: 2n });
      expect(rows(ctx, 'combat_participant').some((p: any) => p.status === 'fleeing')).toBe(false);
    }
  });

  it('a flee by a dead character is refused with a visible line', () => {
    const seed = ratFight();
    seed.character[0].hp = 0n;
    seed.combat_participant[0].status = 'dead';
    const ctx = fightCtx(seed, ALICE);
    handlers.flee_combat(ctx, { characterId: 1n });
    expect(lines(ctx, 1n, /^You cannot act right now\.$/)).toHaveLength(1);
    expect(actions(ctx)).toHaveLength(0);
  });
});

describe('a mid-fight joiner is waited on (RND-01)', () => {
  function joinSeed() {
    const seed = ratFight();
    seed.combat_encounter[0].groupId = 5n;
    seed.character[0].groupId = 5n;
    seed.character.push({
      ...seed.character[0],
      id: 2n,
      ownerUserId: 8n,
      name: 'Brienne',
      locationId: 20n,
      groupId: 5n,
      combatTargetEnemyId: undefined,
    });
    seed.player.push({ id: BOB, userId: 8n, activeCharacterId: 2n });
    seed.group = [{ id: 5n, leaderCharacterId: 1n }];
    seed.group_member = [
      { id: 1n, groupId: 5n, characterId: 1n, followLeader: true },
      { id: 2n, groupId: 5n, characterId: 2n, followLeader: true },
    ];
    seed.location = [
      { ...seed.location[0], isSafe: true },
      { id: 20n, name: 'The Cellar', description: 'Damp.', zone: 'z', regionId: 1n, isSafe: true },
    ];
    seed.location_connection = [
      { id: 1n, fromLocationId: 20n, toLocationId: 10n },
      { id: 2n, fromLocationId: 10n, toLocationId: 20n },
    ];
    seed.ability_cooldown = [
      { id: 1n, characterId: 2n, abilityTemplateId: 7n, startedAtMicros: T0 - 3_000_000n, durationMicros: 12_000_000n, roundsRemaining: 0n },
    ];
    return seed;
  }

  it('travelling into the fight adds a participant with nextAutoAttackAt 0 and converted cooldowns, and the open round waits for it', () => {
    const ctx = fightCtx(joinSeed(), BOB);
    handlers.move_character(ctx, { characterId: 2n, locationId: 10n });
    const joiner = rows(ctx, 'combat_participant').find((p: any) => p.characterId === 2n);
    expect(joiner).toMatchObject({ combatId: 1n, status: 'active', nextAutoAttackAt: 0n });
    const cd = rows(ctx, 'ability_cooldown').find((c: any) => c.characterId === 2n);
    expect(cd.roundsRemaining).toBe(3n);
    expect(rows(ctx, 'aggro_entry').some((a: any) => a.characterId === 2n)).toBe(true);

    ctx.sender = ALICE;
    handlers.submit_combat_action(ctx, { characterId: 1n });
    expect(roundRows(ctx).map((r: any) => r.state)).toEqual(['action_select']); // still waiting for the joiner
    ctx.sender = BOB;
    handlers.submit_combat_action(ctx, { characterId: 2n });
    expect(roundRows(ctx).map((r: any) => r.state)).toEqual(['resolved', 'action_select']);
  });

  it('the deadline resolves the round without the joiner choosing', () => {
    const ctx = fightCtx(joinSeed(), BOB);
    handlers.move_character(ctx, { characterId: 2n, locationId: 10n });
    fire(ctx, T0 + TEN_S);
    expect(roundRows(ctx).map((r: any) => r.state)).toEqual(['resolved', 'action_select']);
    expect(lines(ctx, 2n, /Your fists hit/)).toHaveLength(1);
  });
});

describe('casts never act inside a fight (T-46.1-06-07)', () => {
  const cast = (characterId: bigint) => ({
    id: 1n,
    characterId,
    abilityTemplateId: 1n,
    targetCharacterId: undefined,
    endsAtMicros: T0 - 1n,
  });

  it('a finished cast of a character in an active fight is cancelled with the combat line and executes nothing', () => {
    const seed = ratFight({
      extra: { ability_template: [ability({ kind: 'heal', name: 'Mend', targetRule: 'self' })], character_cast: [cast(1n)] },
    });
    seed.character[0].hp = 50n;
    const ctx = fightCtx(seed, MODULE);
    handlers.tick_casts(ctx, { arg: { scheduledId: 1n } });
    expect(rows(ctx, 'character_cast')).toHaveLength(0);
    expect(lines(ctx, 1n, /^Your casting is interrupted by combat\.$/)).toHaveLength(1);
    expect(lines(ctx, 1n, /Mend/)).toHaveLength(0);
    expect(rows(ctx, 'character').find((c: any) => c.id === 1n).hp).toBe(50n);
    expect(rows(ctx, 'ability_cooldown')).toHaveLength(0);
  });

  it('the same cast outside a fight still completes', () => {
    const seed = startSeed({
      ability_template: [ability({ kind: 'heal', name: 'Mend', targetRule: 'self', resourceType: 'stamina' })],
      character_cast: [cast(1n)],
    });
    seed.character[0].hp = 50n;
    const ctx = fightCtx(seed, MODULE);
    handlers.tick_casts(ctx, { arg: { scheduledId: 1n } });
    expect(rows(ctx, 'character_cast')).toHaveLength(0);
    expect(lines(ctx, 1n, /interrupted by combat/)).toHaveLength(0);
    expect(lines(ctx, 1n, /Mend/).length).toBeGreaterThan(0);
    expect(rows(ctx, 'ability_cooldown')).toHaveLength(1);
  });
});
