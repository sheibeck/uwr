/**
 * Phase 46.1 review fix WR-02, through the real captured reducers on a strict mock db.
 *
 * A character killed mid-round (here by an enemy ability, which writes hp 0 without marking the
 * participant dead) is dead for the rest of that round: later enemies never target a 0-HP
 * character, so they no longer lose their action to a corpse.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
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
  const h = capturedReducer('resolve_round_timer');
  if (typeof h !== 'function') {
    throw new Error("capturedReducer('resolve_round_timer') is not a function: the schema recorder could not capture it.");
  }
  handlers.resolve_round_timer = h;
}, 120_000);

const TEN_S = 10_000_000n;
const BIG = 1_000_000n;
const ALICE_ID = 1n;
const BOB_ID = 2n;

function fire(ctx: any) {
  const tick = openTickArg(ctx);
  ctx.sender = MODULE;
  handlers.resolve_round_timer(ctx, tick);
  const table = ctx.db._tables.round_timer_tick ?? [];
  const idx = table.findIndex((r: any) => r.scheduledId === tick.arg.scheduledId);
  if (idx >= 0) table.splice(idx, 1);
}

const lines = (ctx: any, characterId: bigint, pattern: RegExp) =>
  rows(ctx, 'event_private').filter((e: any) => e.characterId === characterId && pattern.test(e.message));
const character = (ctx: any, id: bigint) => rows(ctx, 'character').find((c: any) => c.id === id);
const participant = (ctx: any, characterId: bigint) =>
  rows(ctx, 'combat_participant').find((p: any) => p.characterId === characterId);

/** The enemy ability AI roll of the module (50% chance) for an enemy of combat 1 in round 1. */
const rollPasses = (now: bigint, enemyId: bigint): boolean => roundSeed(now + enemyId + 1n, 1n) % 100n < 50n;
function passingNow(enemyIds: bigint[], from: bigint = T0 + TEN_S): bigint {
  let now = from;
  while (!enemyIds.every((id) => rollPasses(now, id))) now += 1n;
  return now;
}

const bolt = (over: Record<string, unknown> = {}) => ({
  id: 1n,
  enemyTemplateId: 1n,
  abilityKey: 'bolt',
  name: 'Bolt',
  kind: 'damage',
  castSeconds: 0n,
  cooldownSeconds: 0n,
  targetRule: 'lowest_hp',
  ...over,
});

/** Aldric (1) and Brienne (2), two enemies; Aldric is one hit from death. */
function twoPlayerTwoEnemySeed(opts: { secondEnemyHasAbilities: boolean }) {
  const seed = fightSeed({
    players: 2,
    withOpenRound: true,
    playerHp: BIG,
    enemies: [
      { id: 1n, name: 'Cave Rat', hp: BIG, attackDamage: 5n },
      { id: 2n, name: opts.secondEnemyHasAbilities ? 'Cave Rat' : 'Cave Bat', hp: BIG, attackDamage: 5n },
    ],
    extra: { enemy_ability: [bolt()] },
  });
  seed.character.find((c: any) => c.id === ALICE_ID).hp = 1n;
  return seed;
}

describe('a character killed mid-round is not targeted again that round (WR-02)', () => {
  it('lowest_hp: the second enemy hits the living player instead of the 0-HP corpse', () => {
    const now = passingNow([1n, 2n]);
    const ctx = fightCtx(twoPlayerTwoEnemySeed({ secondEnemyHasAbilities: true }), MODULE, now);
    fire(ctx);

    // enemy 1's Bolt killed Aldric (hp 1); enemy 2 must have chosen Brienne, not the corpse
    expect(lines(ctx, ALICE_ID, /Cave Rat's Bolt hits you for \d+ damage/)).toHaveLength(1);
    expect(lines(ctx, BOB_ID, /Cave Rat's Bolt hits you for \d+ damage/)).toHaveLength(1);
    expect(character(ctx, ALICE_ID).hp).toBe(0n);
    expect(character(ctx, BOB_ID).hp).toBeLessThan(BIG);
    // the death is marked at the end of the round, as before
    expect(participant(ctx, ALICE_ID).status).toBe('dead');
    expect(rows(ctx, 'combat_encounter')[0].state).toBe('active');
  });

  it('aggro: a second enemy whose top aggro is the corpse attacks the living player', () => {
    const seed = twoPlayerTwoEnemySeed({ secondEnemyHasAbilities: false });
    // enemy 2 is a Cave Bat of a template with no abilities, so it auto-attacks its top aggro
    seed.enemy_template.push({ ...seed.enemy_template[0], id: 2n, name: 'Cave Bat' });
    seed.combat_enemy.find((e: any) => e.id === 2n).enemyTemplateId = 2n;
    for (const entry of seed.aggro_entry.filter((a: any) => a.enemyId === 2n && a.characterId === ALICE_ID)) {
      entry.value = 100n;
    }
    const now = passingNow([1n]);
    const ctx = fightCtx(seed, MODULE, now);
    fire(ctx);

    expect(character(ctx, ALICE_ID).hp).toBe(0n);
    const batAttack = /Cave Bat (strikes you|lands a crushing blow)|Cave Bat's strike misses you|You (dodge|parry|block) Cave Bat/;
    expect(lines(ctx, BOB_ID, batAttack)).toHaveLength(1);
    expect(lines(ctx, ALICE_ID, batAttack)).toHaveLength(0);
  });

  it('with every player at 0 HP the enemies have no target at all (no ability, no attack)', () => {
    const seed = twoPlayerTwoEnemySeed({ secondEnemyHasAbilities: true });
    for (const c of seed.character) c.hp = 0n;
    const now = passingNow([1n, 2n]);
    const ctx = fightCtx(seed, MODULE, now);
    fire(ctx);
    expect(lines(ctx, ALICE_ID, /Bolt|strikes you/)).toHaveLength(0);
    expect(lines(ctx, BOB_ID, /Bolt|strikes you/)).toHaveLength(0);
  });
});
