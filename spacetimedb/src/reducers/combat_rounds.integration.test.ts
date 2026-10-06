/**
 * Phase 46.1 Plan 05 (RND-01 to RND-04): the round lifecycle through the REAL captured reducers
 * (start_combat, resolve_round_timer, combat_loop) on a strict mock db. Rows come from the shared
 * TEST-ONLY fixture (helpers/combat_fight_fixture.ts).
 *
 * The mock never deletes a fired scheduled row (the platform does, after the reducer returns), so
 * `fire` removes it, the way the runtime would.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
// @ts-ignore node types are not part of this module's tsconfig (same as other source-reading tests)
import { readFileSync } from 'node:fs';
import { capturedReducer, rowColumnProblems, snapshotDb } from '../helpers/schema_recorder';
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
  for (const name of ['start_combat', 'resolve_round_timer', 'combat_loop', 'use_ability']) {
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

function call(ctx: any, arg: any, sender: any) {
  ctx.sender = sender;
  handlers.resolve_round_timer(ctx, { arg });
  ctx.sender = MODULE;
}

const events = (ctx: any, characterId: bigint) =>
  rows(ctx, 'event_private').filter((e: any) => e.characterId === characterId);
const lines = (ctx: any, characterId: bigint, pattern: RegExp) =>
  events(ctx, characterId).filter((e: any) => pattern.test(e.message));
const roundRows = (ctx: any) =>
  [...rows(ctx, 'combat_round')].sort((a: any, b: any) => (a.roundNumber < b.roundNumber ? -1 : 1));
const ticksFor = (ctx: any, combatId = 1n) => rows(ctx, 'round_timer_tick').filter((r: any) => r.combatId === combatId);
const ENEMY_ATTACK = /Cave Rat (strikes you|lands a crushing blow)|strike misses you|You (dodge|parry|block) Cave Rat/;

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

const choice = (over: Record<string, unknown> = {}) => ({
  id: 1n,
  combatId: 1n,
  characterId: 1n,
  roundNumber: 1n,
  actionType: 'ability',
  abilityTemplateId: 1n,
  targetEnemyId: undefined,
  targetCharacterId: undefined,
  submittedAt: { microsSinceUnixEpoch: T0 },
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

describe('a new fight opens round 1 (RND-01, RND-04)', () => {
  it('start_combat leaves one open round, one tick, no loop tick and zeroed legacy timers', () => {
    const ctx = fightCtx(startSeed(), ALICE);
    handlers.start_combat(ctx, { characterId: 1n, enemySpawnId: 1n });

    const rounds = rows(ctx, 'combat_round');
    expect(rounds).toHaveLength(1);
    expect(rounds[0]).toMatchObject({
      roundNumber: 1n,
      state: 'action_select',
      timerExpiresAtMicros: T0 + TEN_S,
      startedAtMicros: T0,
    });
    const ticks = rows(ctx, 'round_timer_tick');
    expect(ticks).toHaveLength(1);
    expect(ticks[0].roundNumber).toBe(1n);
    expect(ticks[0].combatId).toBe(rounds[0].combatId);
    expect(ticks[0].scheduledAt.value.microsSinceUnixEpoch).toBe(rounds[0].timerExpiresAtMicros);
    expect(rows(ctx, 'combat_loop_tick')).toHaveLength(0);
    expect(rows(ctx, 'combat_participant').map((p: any) => p.nextAutoAttackAt)).toEqual([0n]);
    expect(rows(ctx, 'combat_enemy').map((e: any) => e.nextAutoAttackAt)).toEqual([0n]);
    expect(schemaProblems(ctx)).toEqual([]);
  });
});

describe('resolve_round_timer resolves the open round', () => {
  it('resolves round 1, opens round 2 with a new deadline and one tick, and deletes the round 1 choices', () => {
    const seed = fightSeed({
      withOpenRound: true,
      extra: { combat_action: [choice({ actionType: 'auto_attack', abilityTemplateId: undefined })] },
    });
    const ctx = fightCtx(seed, MODULE, T0 + TEN_S);
    fire(ctx);

    const [r1, r2, ...rest] = roundRows(ctx);
    expect(rest).toHaveLength(0);
    expect(r1).toMatchObject({ roundNumber: 1n, state: 'resolved' });
    expect(r2).toMatchObject({
      roundNumber: 2n,
      state: 'action_select',
      startedAtMicros: T0 + TEN_S,
      timerExpiresAtMicros: T0 + 2n * TEN_S,
    });
    const ticks = ticksFor(ctx);
    expect(ticks).toHaveLength(1);
    expect(ticks[0].roundNumber).toBe(2n);
    expect(ticks[0].scheduledAt.value.microsSinceUnixEpoch).toBe(T0 + 2n * TEN_S);
    expect(rows(ctx, 'combat_action')).toHaveLength(0);
    expect(lines(ctx, 1n, /Your fists hit/)).toHaveLength(1);
    expect(lines(ctx, 1n, ENEMY_ATTACK).length).toBeGreaterThan(0);
    expect(schemaProblems(ctx)).toEqual([]);
  });

  it('a tick resolves the round even when nobody chose, as a plain auto-attack (no resource, no cooldown, no flee)', () => {
    const ctx = fightCtx(fightSeed({ withOpenRound: true }), MODULE, T0 + TEN_S);
    fire(ctx);
    expect(lines(ctx, 1n, /Your fists hit/)).toHaveLength(1);
    expect(rows(ctx, 'ability_cooldown')).toHaveLength(0);
    expect(rows(ctx, 'character').find((c: any) => c.id === 1n).mana).toBe(50n);
    expect(rows(ctx, 'combat_participant')[0].status).toBe('active');
    expect(rows(ctx, 'combat_encounter')[0].state).toBe('active');
  });

  it('a forged call (sender is not the module identity) leaves the database identical', () => {
    const ctx = fightCtx(fightSeed({ withOpenRound: true }), MODULE, T0 + TEN_S);
    const before = snapshotDb(ctx.db);
    call(ctx, openTickArg(ctx).arg, ALICE);
    expect(snapshotDb(ctx.db)).toBe(before);
  });

  it('a stale or duplicate tick changes nothing', () => {
    const ctx = fightCtx(fightSeed({ withOpenRound: true }), MODULE, T0 + TEN_S);
    const staleArg = openTickArg(ctx).arg;
    fire(ctx);
    const afterFirst = snapshotDb(ctx.db);
    call(ctx, staleArg, MODULE); // round 1 tick, round 2 is open
    expect(snapshotDb(ctx.db)).toBe(afterFirst);
    call(ctx, staleArg, MODULE); // a second delivery of the same tick
    expect(snapshotDb(ctx.db)).toBe(afterFirst);
  });

  it('a tick for a resolved combat changes nothing', () => {
    const seed = fightSeed({ withOpenRound: true });
    seed.combat_encounter[0].state = 'resolved';
    const ctx = fightCtx(seed, MODULE, T0 + TEN_S);
    const before = snapshotDb(ctx.db);
    call(ctx, openTickArg(ctx).arg, MODULE);
    expect(snapshotDb(ctx.db)).toBe(before);
  });

  it('numbers rounds 1, 2, 3 with one open round, deadline = start + 10 s and tick = deadline each time', () => {
    const seed = fightSeed({ withOpenRound: true, enemies: [{ id: 1n, name: 'Cave Rat', hp: 4000n }] });
    const ctx = fightCtx(seed, MODULE, T0);
    let now = T0;
    for (let i = 0; i < 4; i++) {
      now += TEN_S;
      fire(ctx, now);
      const all = roundRows(ctx);
      expect(all.map((r: any) => r.roundNumber)).toEqual(all.map((_: any, k: number) => BigInt(k + 1)));
      expect(all.filter((r: any) => r.state === 'action_select')).toHaveLength(1);
      for (const r of all) expect(r.timerExpiresAtMicros).toBe(r.startedAtMicros + TEN_S);
      const open = all[all.length - 1];
      const ticks = ticksFor(ctx);
      expect(ticks).toHaveLength(1);
      expect(ticks[0].roundNumber).toBe(open.roundNumber);
      expect(ticks[0].scheduledAt.value.microsSinceUnixEpoch).toBe(open.timerExpiresAtMicros);
    }
    expect(roundRows(ctx)).toHaveLength(5);
  });
});

describe('auto-attack target (RND-02)', () => {
  it('a dead current target falls back to the lowest living enemy id', () => {
    const seed = fightSeed({
      withOpenRound: true,
      enemies: [
        { id: 9n, name: 'Husk', hp: 0n },
        { id: 5n, name: 'Grub', hp: 400n },
        { id: 3n, name: 'Bat', hp: 400n },
      ],
    });
    const ctx = fightCtx(seed, MODULE, T0 + TEN_S);
    fire(ctx);
    expect(lines(ctx, 1n, /Your fists hit Bat/)).toHaveLength(1);
    expect(lines(ctx, 1n, /Your fists hit Grub/)).toHaveLength(0);
  });

  it('a living current target is the one attacked', () => {
    const seed = fightSeed({
      withOpenRound: true,
      enemies: [
        { id: 5n, name: 'Grub', hp: 400n },
        { id: 3n, name: 'Bat', hp: 400n },
      ],
    });
    const ctx = fightCtx(seed, MODULE, T0 + TEN_S);
    fire(ctx);
    expect(lines(ctx, 1n, /Your fists hit Grub/)).toHaveLength(1);
    expect(lines(ctx, 1n, /Your fists hit Bat/)).toHaveLength(0);
  });
});

describe('stored ability choices (RND-02, RND-03)', () => {
  it('resolves the ability at the player turn and starts its round cooldown', () => {
    const seed = fightSeed({
      withOpenRound: true,
      extra: { ability_template: [ability()], combat_action: [choice()] },
    });
    const ctx = fightCtx(seed, MODULE, T0 + TEN_S);
    fire(ctx);
    expect(lines(ctx, 1n, /^You use Fire Bolt on Cave Rat\.$/)).toHaveLength(1);
    expect(lines(ctx, 1n, /^Your Fire Bolt hits Cave Rat/)).toHaveLength(1);
    expect(lines(ctx, 1n, /Your fists/)).toHaveLength(0);
    const cooldown = rows(ctx, 'ability_cooldown');
    expect(cooldown).toHaveLength(1);
    expect(cooldown[0]).toMatchObject({ characterId: 1n, abilityTemplateId: 1n, roundsRemaining: 1n });
    expect(rows(ctx, 'character').find((c: any) => c.id === 1n).mana).toBe(40n);
    expect(schemaProblems(ctx)).toEqual([]);
  });

  it('an invalid choice (no mana) posts the failure line and falls back to the auto-attack', () => {
    const seed = fightSeed({
      withOpenRound: true,
      extra: { ability_template: [ability()], combat_action: [choice()] },
    });
    seed.character[0].mana = 0n;
    const ctx = fightCtx(seed, MODULE, T0 + TEN_S);
    fire(ctx);
    const failed = lines(ctx, 1n, /^Ability failed:/);
    const attack = lines(ctx, 1n, /Your fists hit/);
    expect(failed).toHaveLength(1);
    expect(attack).toHaveLength(1);
    expect(failed[0].id < attack[0].id).toBe(true);
    expect(rows(ctx, 'ability_cooldown')).toHaveLength(0);
  });

  it('an ability that is still on a round cooldown falls back to the auto-attack', () => {
    const seed = fightSeed({
      withOpenRound: true,
      extra: {
        ability_template: [ability()],
        combat_action: [choice()],
        ability_cooldown: [
          { id: 1n, characterId: 1n, abilityTemplateId: 1n, startedAtMicros: T0, durationMicros: 2n * TEN_S, roundsRemaining: 2n },
        ],
      },
    });
    const ctx = fightCtx(seed, MODULE, T0 + TEN_S);
    fire(ctx);
    expect(lines(ctx, 1n, /^Ability failed:.*cooldown/)).toHaveLength(1);
    expect(lines(ctx, 1n, /Your fists hit/)).toHaveLength(1);
    expect(rows(ctx, 'ability_cooldown')[0].roundsRemaining).toBe(1n);
  });

  it('an ally target that left the fight fails with a visible line and auto-attacks', () => {
    const seed = fightSeed({
      withOpenRound: true,
      extra: {
        ability_template: [ability({ kind: 'heal', name: 'Mend' })],
        combat_action: [choice({ targetCharacterId: 2n })],
        character: [],
      },
    });
    const ctx = fightCtx(seed, MODULE, T0 + TEN_S);
    fire(ctx);
    expect(lines(ctx, 1n, /^Your target is no longer in the fight\.$/)).toHaveLength(1);
    expect(lines(ctx, 1n, /Your fists hit/)).toHaveLength(1);
    expect(rows(ctx, 'ability_cooldown')).toHaveLength(0);
  });

  it('an ability of another character is refused and auto-attacks', () => {
    const seed = fightSeed({
      withOpenRound: true,
      extra: { ability_template: [ability({ characterId: 99n })], combat_action: [choice()] },
    });
    const ctx = fightCtx(seed, MODULE, T0 + TEN_S);
    fire(ctx);
    expect(lines(ctx, 1n, /^Ability failed:/)).toHaveLength(1);
    expect(lines(ctx, 1n, /Your fists hit/)).toHaveLength(1);
    expect(rows(ctx, 'ability_cooldown')).toHaveLength(0);
  });
});

describe('order of action (RND-03)', () => {
  it('players act in ascending character id, whatever order they were seeded in', () => {
    const seed = fightSeed({
      withOpenRound: true,
      players: 2,
      enemies: [{ id: 1n, name: 'Cave Rat', hp: 4000n }],
    });
    // The participant rows are seeded 2 then 1 by the fixture.
    expect(seed.combat_participant.map((p: any) => p.characterId)).toEqual([2n, 1n]);
    const ctx = fightCtx(seed, MODULE, T0 + TEN_S);
    fire(ctx);
    const first1 = lines(ctx, 1n, /Your fists hit/)[0];
    const first2 = lines(ctx, 2n, /Your fists hit/)[0];
    expect(first1).toBeDefined();
    expect(first2).toBeDefined();
    expect(first1.id < first2.id).toBe(true);
  });

  it('enemies act in ascending enemy id', () => {
    const seed = fightSeed({
      withOpenRound: true,
      enemies: [
        { id: 7n, name: 'Wolf', hp: 4000n },
        { id: 2n, name: 'Rat', hp: 4000n },
      ],
    });
    const ctx = fightCtx(seed, MODULE, T0 + TEN_S);
    fire(ctx);
    const rat = lines(ctx, 1n, /^Rat (strikes you|lands a crushing blow)/)[0];
    const wolf = lines(ctx, 1n, /^Wolf (strikes you|lands a crushing blow)/)[0];
    expect(rat).toBeDefined();
    expect(wolf).toBeDefined();
    expect(rat.id < wolf.id).toBe(true);
  });

  it('a player who died earlier in the round is skipped at their turn', () => {
    const seed = fightSeed({
      withOpenRound: true,
      players: 2,
      enemies: [{ id: 1n, name: 'Cave Rat', hp: 4000n }],
    });
    seed.character.find((c: any) => c.id === 2n).hp = 0n; // already dead
    const ctx = fightCtx(seed, MODULE, T0 + TEN_S);
    fire(ctx);
    expect(lines(ctx, 2n, /Your fists/)).toHaveLength(0);
    expect(lines(ctx, 1n, /Your fists hit/)).toHaveLength(1);
  });
});

describe('effects, stun and DoT/HoT count rounds (RND-03)', () => {
  const stun = (roundsRemaining: bigint) => ({
    id: 1n,
    combatId: 1n,
    enemyId: 1n,
    effectType: 'stun',
    magnitude: 1n,
    roundsRemaining,
    sourceAbility: 'Shield Bash',
    ownerCharacterId: 1n,
  });

  it('a stunned enemy takes no action that round; the stun is then removed and the enemy acts next round', () => {
    const seed = fightSeed({
      withOpenRound: true,
      enemies: [{ id: 1n, name: 'Cave Rat', hp: 4000n }],
      extra: { combat_enemy_effect: [stun(1n)] },
    });
    const ctx = fightCtx(seed, MODULE, T0 + TEN_S);
    fire(ctx);
    expect(lines(ctx, 1n, ENEMY_ATTACK)).toHaveLength(0);
    expect(rows(ctx, 'combat_enemy_effect')).toHaveLength(0);
    fire(ctx, T0 + 2n * TEN_S);
    expect(lines(ctx, 1n, ENEMY_ATTACK).length).toBeGreaterThan(0);
  });

  it('an enemy DoT ticks every round (no every-third gate) and is removed after its last round', () => {
    const seed = fightSeed({
      withOpenRound: true,
      enemies: [{ id: 1n, name: 'Cave Rat', hp: 4000n }],
      extra: {
        combat_enemy_effect: [
          { id: 1n, combatId: 1n, enemyId: 1n, effectType: 'dot', magnitude: 3n, roundsRemaining: 2n, sourceAbility: 'Burn', ownerCharacterId: undefined },
        ],
      },
    });
    const ctx = fightCtx(seed, MODULE, T0 + TEN_S);
    fire(ctx);
    expect(lines(ctx, 1n, /Burn sears Cave Rat for 3/)).toHaveLength(1);
    expect(rows(ctx, 'combat_enemy_effect')[0].roundsRemaining).toBe(1n);
    fire(ctx, T0 + 2n * TEN_S);
    expect(lines(ctx, 1n, /Burn sears Cave Rat for 3/)).toHaveLength(2);
    expect(rows(ctx, 'combat_enemy_effect')).toHaveLength(0);
  });

  it('a regen with 1 round left heals once and is removed', () => {
    const seed = fightSeed({
      withOpenRound: true,
      enemies: [{ id: 1n, name: 'Cave Rat', hp: 4000n }],
      extra: {
        character_effect: [
          { id: 1n, characterId: 1n, effectType: 'regen', magnitude: 7n, roundsRemaining: 1n, sourceAbility: 'Mend' },
        ],
      },
    });
    const ctx = fightCtx(seed, MODULE, T0 + TEN_S);
    fire(ctx);
    expect(lines(ctx, 1n, /Mend soothes you for 7 HP/)).toHaveLength(1);
    expect(rows(ctx, 'character_effect')).toHaveLength(0);
    fire(ctx, T0 + 2n * TEN_S);
    expect(lines(ctx, 1n, /Mend soothes you/)).toHaveLength(1);
  });

  it('round cooldowns drop by one per resolved round', () => {
    const seed = fightSeed({
      withOpenRound: true,
      enemies: [{ id: 1n, name: 'Cave Rat', hp: 4000n }],
      extra: {
        ability_cooldown: [
          { id: 1n, characterId: 1n, abilityTemplateId: 1n, startedAtMicros: T0, durationMicros: 3n * TEN_S, roundsRemaining: 3n },
        ],
      },
    });
    const ctx = fightCtx(seed, MODULE, T0 + TEN_S);
    fire(ctx);
    expect(rows(ctx, 'ability_cooldown')[0].roundsRemaining).toBe(2n);
    fire(ctx, T0 + 2n * TEN_S);
    fire(ctx, T0 + 3n * TEN_S);
    expect(rows(ctx, 'ability_cooldown')).toHaveLength(0);
  });
});

describe('the end of a fight (RND-04)', () => {
  it('victory resolves the fight and removes every round, choice and tick', () => {
    const seed = fightSeed({
      withOpenRound: true,
      enemies: [{ id: 1n, name: 'Cave Rat', hp: 1n }],
      extra: { combat_action: [choice({ actionType: 'auto_attack', abilityTemplateId: undefined })] },
    });
    const ctx = fightCtx(seed, MODULE, T0 + TEN_S);
    fire(ctx);
    expect(rows(ctx, 'combat_encounter')[0].state).toBe('resolved');
    expect(rows(ctx, 'combat_round')).toHaveLength(0);
    expect(rows(ctx, 'combat_action')).toHaveLength(0);
    expect(ticksFor(ctx)).toHaveLength(0);
    expect(rows(ctx, 'combat_participant')).toHaveLength(0);
    expect(lines(ctx, 1n, /falls!/)).toHaveLength(1);
  });

  it('defeat resolves the fight and removes every round, choice and tick', () => {
    const seed = fightSeed({
      withOpenRound: true,
      playerHp: 1n,
      enemies: [{ id: 1n, name: 'Cave Rat', hp: 4000n, attackDamage: 50n }],
      extra: { combat_action: [choice({ actionType: 'auto_attack', abilityTemplateId: undefined })] },
    });
    const ctx = fightCtx(seed, MODULE, T0 + TEN_S);
    fire(ctx);
    expect(rows(ctx, 'combat_encounter')[0].state).toBe('resolved');
    expect(rows(ctx, 'combat_round')).toHaveLength(0);
    expect(rows(ctx, 'combat_action')).toHaveLength(0);
    expect(ticksFor(ctx)).toHaveLength(0);
    expect(lines(ctx, 1n, /You have died/)).toHaveLength(1);
  });
});

describe('source rules for the round engine', () => {
  const source = readFileSync(new URL('./combat.ts', import.meta.url), 'utf-8');

  it('actors are sorted with the bigint comparators and the auto-attack seeds add the round number', () => {
    expect(source).toContain('sortByKey(');
    expect(source).toContain('sortById(');
    expect(source.match(/roundSeed\(/g)!.length).toBeGreaterThanOrEqual(2);
  });

  it('the module-identity guard comes before any read in resolve_round_timer', () => {
    const start = source.indexOf("'resolve_round_timer'");
    const body = source.slice(start, start + 900);
    expect(body.indexOf('ctx.sender.toHexString() !== ctx.databaseIdentity.toHexString()')).toBeGreaterThan(0);
    expect(body.indexOf('ctx.sender.toHexString()')).toBeLessThan(body.indexOf('ctx.db'));
  });

  it('BOB is not seeded in a one-player fight (fixture sanity)', () => {
    expect(fightSeed().player.map((p: any) => p.id)).toEqual([ALICE]);
    expect(fightSeed({ players: 2 }).player.map((p: any) => p.id)).toEqual([ALICE, BOB]);
  });
});
