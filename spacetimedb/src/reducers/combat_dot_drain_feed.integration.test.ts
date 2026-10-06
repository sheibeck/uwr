/**
 * Quick 261006-hbk: the health bar "does not move" while the feed reports hits. The row was right:
 * a DoT the player put on an enemy heals the caster DOT_LIFE_DRAIN_PERCENT of every tick in the
 * same round transaction, and that heal posted no line. A hit of 5 then moved the bar by 1, a
 * Shoot of 11 by 7, with nothing in the feed to say why. These tests pin that the caster's feed
 * accounts for the drain (the hp actually restored), through the real captured resolve_round_timer
 * handler on a strict mock db.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { T0, MODULE, fightSeed, fightCtx, rows, openTickArg } from '../helpers/combat_fight_fixture';
import { DOT_LIFE_DRAIN_PERCENT } from '../data/combat_scaling';

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
const MAX_HP = 122n;
const DOT_TICK = 9n;
const DRAIN = (DOT_TICK * DOT_LIFE_DRAIN_PERCENT) / 100n; // 4

/** Resolve the open round the way the scheduler does. */
function fire(ctx: any) {
  const tick = openTickArg(ctx);
  ctx.sender = MODULE;
  handlers.resolve_round_timer(ctx, tick);
  const table = ctx.db._tables.round_timer_tick ?? [];
  const idx = table.findIndex((r: any) => r.scheduledId === tick.arg.scheduledId);
  if (idx >= 0) table.splice(idx, 1);
}

const messages = (ctx: any, characterId: bigint): string[] =>
  rows(ctx, 'event_private').filter((e: any) => e.characterId === characterId).map((e: any) => e.message);
const hpOf = (ctx: any, characterId: bigint): bigint =>
  rows(ctx, 'character').find((c: any) => c.id === characterId).hp;
const drainLines = (ctx: any, characterId: bigint) =>
  rows(ctx, 'event_private').filter(
    (e: any) => e.characterId === characterId && /^Your Grudge Brand heals you for \d+\.$/.test(e.message),
  );

/** Sum of the numbers a set of lines reports, by pattern (first capture group). */
function total(lines: string[], pattern: RegExp): bigint {
  let sum = 0n;
  for (const line of lines) {
    const match = pattern.exec(line);
    if (match) sum += BigInt(match[1]);
  }
  return sum;
}

const grudgeBrand = (over: Record<string, unknown> = {}) => ({
  id: 1n,
  combatId: 1n,
  enemyId: 1n,
  effectType: 'dot',
  magnitude: DOT_TICK,
  roundsRemaining: 3n,
  sourceAbility: 'Grudge Brand',
  ownerCharacterId: 1n,
  ...over,
});

const stun = { id: 2n, combatId: 1n, enemyId: 1n, effectType: 'stun', magnitude: 0n, roundsRemaining: 2n, sourceAbility: 'Daze', ownerCharacterId: 1n };

function seed(opts: { hp?: bigint; enemyEffects: any[]; players?: 1 | 2 }) {
  const s = fightSeed({
    withOpenRound: true,
    players: opts.players ?? 1,
    playerHp: MAX_HP,
    enemies: [{ id: 1n, name: 'Brine Sentinel', hp: 1_000_000n, attackDamage: 8n }],
    extra: { combat_enemy_effect: opts.enemyEffects },
  });
  for (const c of s.character) {
    c.maxHp = MAX_HP;
    c.hp = opts.hp ?? MAX_HP;
  }
  return s;
}

describe('the caster feed accounts for the DoT life drain (261006-hbk)', () => {
  it('a hit and a drain in one round: the feed reports both, and they add up to the hp the bar shows', () => {
    const ctx = fightCtx(seed({ enemyEffects: [grudgeBrand()] }), MODULE, T0 + TEN_S);
    fire(ctx);

    const feed = messages(ctx, 1n);
    const hit = total(feed, /^Brine Sentinel (?:strikes you|lands a crushing blow) for (\d+)/);
    expect(hit).toBeGreaterThan(DRAIN); // the enemy hit landed, and for more than the drain gives back
    expect(drainLines(ctx, 1n)).toHaveLength(1);
    const healed = total(feed, /^Your Grudge Brand heals you for (\d+)\.$/);
    expect(healed).toBe(DRAIN);
    expect(hpOf(ctx, 1n)).toBe(MAX_HP - hit + healed);
  });

  it('reports the hp actually restored, not the nominal drain, when the heal reaches max hp', () => {
    // The enemy is stunned, so the drain is the only hp change of the round.
    const ctx = fightCtx(seed({ hp: MAX_HP - 2n, enemyEffects: [grudgeBrand(), stun] }), MODULE, T0 + TEN_S);
    fire(ctx);

    expect(hpOf(ctx, 1n)).toBe(MAX_HP);
    expect(drainLines(ctx, 1n).map((e: any) => e.message)).toEqual(['Your Grudge Brand heals you for 2.']);
  });

  it('posts no drain line when the caster is already at max hp', () => {
    const ctx = fightCtx(seed({ enemyEffects: [grudgeBrand(), stun] }), MODULE, T0 + TEN_S);
    fire(ctx);

    expect(hpOf(ctx, 1n)).toBe(MAX_HP);
    expect(drainLines(ctx, 1n)).toHaveLength(0);
    // the tick itself is still reported
    expect(messages(ctx, 1n)).toContain(`Grudge Brand sears Brine Sentinel for ${DOT_TICK}.`);
  });

  it('the drain line is a heal line, private to the caster', () => {
    const ctx = fightCtx(seed({ players: 2, hp: MAX_HP - 10n, enemyEffects: [grudgeBrand(), stun] }), MODULE, T0 + TEN_S);
    fire(ctx);

    const [line] = drainLines(ctx, 1n);
    expect(line).toMatchObject({ kind: 'heal', ownerUserId: 7n, message: `Your Grudge Brand heals you for ${DRAIN}.` });
    expect(drainLines(ctx, 2n)).toHaveLength(0);
    expect(hpOf(ctx, 2n)).toBe(MAX_HP - 10n); // the other player is not healed
  });

  it('every tick that restores hp is reported: two rounds, two lines', () => {
    const ctx = fightCtx(seed({ hp: MAX_HP - 20n, enemyEffects: [grudgeBrand(), { ...stun, roundsRemaining: 3n }] }), MODULE, T0 + TEN_S);
    fire(ctx);
    ctx.timestamp = { microsSinceUnixEpoch: T0 + 2n * TEN_S };
    fire(ctx);

    expect(drainLines(ctx, 1n)).toHaveLength(2);
    expect(hpOf(ctx, 1n)).toBe(MAX_HP - 20n + 2n * DRAIN);
  });
});
