/**
 * Phase 46.1 review fix WR-03, through the real captured reducers on a strict mock db.
 *
 * markParticipantDead and clearCharacterEffectsOnDeath re-read the character row, so the stale
 * pre-damage row a caller holds cannot restore HP through an hp_bonus buff (the player would stay
 * alive as far as character.hp goes while the participant row says dead).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
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

describe('a stale pre-damage row cannot restore HP of a dying player (WR-03)', () => {
  const hpBonus = (characterId: bigint) => ({
    id: 10n, characterId, effectType: 'hp_bonus', magnitude: 20n, roundsRemaining: 5n, sourceAbility: 'Fortify',
  });

  it('an enemy strike that kills a player with an hp_bonus buff leaves hp at 0 and drops the bonus from maxHp', () => {
    const buildSeed = () => {
      const seed = fightSeed({
        players: 2,
        withOpenRound: true,
        playerHp: BIG,
        enemies: [{ id: 1n, name: 'Cave Rat', hp: BIG, attackDamage: 5_000n }],
        extra: { character_effect: [hpBonus(ALICE_ID)] },
      });
      const alice = seed.character.find((c: any) => c.id === ALICE_ID);
      alice.hp = 5n;
      alice.maxHp = 100n;
      for (const entry of seed.aggro_entry.filter((a: any) => a.characterId === ALICE_ID)) entry.value = 100n;
      return seed;
    };

    // the strike can miss; take the first moment it lands
    let ctx: any;
    for (let k = 0n; k < 400n; k++) {
      ctx = fightCtx(buildSeed(), MODULE, T0 + TEN_S + k);
      fire(ctx);
      if (participant(ctx, ALICE_ID)?.status === 'dead') break;
    }
    expect(participant(ctx, ALICE_ID)?.status).toBe('dead');
    expect(character(ctx, ALICE_ID).hp).toBe(0n);
    expect(character(ctx, ALICE_ID).maxHp).toBe(80n);
    expect(rows(ctx, 'character_effect').filter((e: any) => e.characterId === ALICE_ID)).toHaveLength(0);
  });

  it('a DoT tick that kills a player with an hp_bonus buff leaves hp at 0', () => {
    const seed = fightSeed({
      players: 2,
      withOpenRound: true,
      playerHp: BIG,
      enemies: [{ id: 1n, name: 'Cave Rat', hp: BIG, attackDamage: 5n }],
      extra: {
        character_effect: [
          hpBonus(ALICE_ID),
          { id: 11n, characterId: ALICE_ID, effectType: 'dot', magnitude: 1_000n, roundsRemaining: 3n, sourceAbility: 'Venom' },
        ],
      },
    });
    const alice = seed.character.find((c: any) => c.id === ALICE_ID);
    alice.hp = 50n;
    alice.maxHp = 100n;
    const ctx = fightCtx(seed, MODULE, T0 + TEN_S);
    fire(ctx);

    expect(lines(ctx, ALICE_ID, /You suffer 1000 damage from Venom/)).toHaveLength(1);
    expect(participant(ctx, ALICE_ID).status).toBe('dead');
    expect(character(ctx, ALICE_ID).hp).toBe(0n);
    expect(character(ctx, ALICE_ID).maxHp).toBe(80n);
  });
});
