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

// ---- Task 2 cases are added below ----
void calculateFleeChance;
