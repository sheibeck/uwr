/**
 * Phase 46.1 Plan 05, assumption delta (PROMOTE: the combat round is the unit of time in a fight).
 *
 * Companion invariant: the same scripted fight run under two different clocks (every transaction at
 * T0, versus irregular forward jumps of microseconds to hours) yields identical round-domain state:
 * ability cooldown roundsRemaining, effect roundsRemaining, stun skips, DoT and HoT tick counts per
 * round. While a fight is active nothing about timing may depend on a wall-clock comparison.
 *
 * 46.1-07 extends this file with enemy cooldowns, wind-ups, pets and adds.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { T0, MODULE, fightSeed, fightCtx, rows, openTickArg } from '../helpers/combat_fight_fixture';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

let resolveTimer: (...args: any[]) => any;

beforeAll(async () => {
  await import('../index');
  const h = capturedReducer('resolve_round_timer');
  if (typeof h !== 'function') throw new Error("capturedReducer('resolve_round_timer') is not a function");
  resolveTimer = h;
}, 120_000);

const ROUNDS = 5;
const CLOCK_A = Array.from({ length: ROUNDS }, () => T0);
const CLOCK_B = [T0, T0 + 1n, T0 + 3_600_000_000n, T0 + 3_600_000_007n, T0 + 7_200_000_000n];

const ENEMY_ATTACK = /Cave Rat (strikes you|lands a crushing blow)|strike misses you|You (dodge|parry|block) Cave Rat/;

type RoundState = {
  round: number;
  cooldowns: Array<[bigint, bigint]>;
  characterEffects: Array<[string, bigint]>;
  enemyEffects: Array<[string, bigint]>;
  enemyAttackLines: number;
  dotLines: number;
  regenLines: number;
  openRound: bigint | undefined;
};

function scriptedSeed() {
  return fightSeed({
    withOpenRound: true,
    playerHp: 1_000_000n,
    enemies: [{ id: 1n, name: 'Cave Rat', hp: 1_000_000n, attackDamage: 5n }],
    extra: {
      ability_template: [
        {
          id: 1n, characterId: 1n, name: 'Fire Bolt', description: 'A bolt of fire.', kind: 'damage', targetRule: 'enemy',
          resourceType: 'mana', resourceCost: 1n, castSeconds: 0n, cooldownSeconds: 12n, scaling: 'int', value1: 5n,
          value2: undefined, damageType: 'fire', effectType: undefined, effectMagnitude: undefined, effectDuration: undefined,
          levelRequired: 1n, isGenerated: false,
        },
      ],
      combat_action: [
        {
          id: 1n, combatId: 1n, characterId: 1n, roundNumber: 1n, actionType: 'ability', abilityTemplateId: 1n,
          targetEnemyId: undefined, targetCharacterId: undefined, submittedAt: { microsSinceUnixEpoch: T0 },
        },
      ],
      character_effect: [
        { id: 1n, characterId: 1n, effectType: 'regen', magnitude: 4n, roundsRemaining: 3n, sourceAbility: 'Mend' },
      ],
      combat_enemy_effect: [
        { id: 1n, combatId: 1n, enemyId: 1n, effectType: 'dot', magnitude: 3n, roundsRemaining: 3n, sourceAbility: 'Burn', ownerCharacterId: undefined },
      ],
    },
  });
}

function runScript(clock: bigint[]): RoundState[] {
  const ctx = fightCtx(scriptedSeed(), MODULE, clock[0]);
  const out: RoundState[] = [];
  for (let i = 0; i < ROUNDS; i++) {
    ctx.timestamp = { microsSinceUnixEpoch: clock[i] };
    if (i === 1) {
      // The scripted stun: lands between round 1 and round 2, one round long.
      ctx.db.combat_enemy_effect.insert({
        id: 0n, combatId: 1n, enemyId: 1n, effectType: 'stun', magnitude: 1n, roundsRemaining: 1n,
        sourceAbility: 'Shield Bash', ownerCharacterId: 1n,
      });
    }
    const eventsBefore = rows(ctx, 'event_private').length;
    const tick = openTickArg(ctx);
    ctx.sender = MODULE;
    resolveTimer(ctx, tick);
    const ticks = rows(ctx, 'round_timer_tick');
    const fired = ticks.findIndex((r: any) => r.scheduledId === tick.arg.scheduledId);
    if (fired >= 0) ticks.splice(fired, 1); // the platform deletes a fired scheduled row
    const newLines: string[] = rows(ctx, 'event_private')
      .slice(eventsBefore)
      .filter((e: any) => e.characterId === 1n)
      .map((e: any) => e.message);
    const open = rows(ctx, 'combat_round').find((r: any) => r.state === 'action_select');
    out.push({
      round: i + 1,
      cooldowns: rows(ctx, 'ability_cooldown').map((r: any) => [r.abilityTemplateId, r.roundsRemaining] as [bigint, bigint]),
      characterEffects: rows(ctx, 'character_effect')
        .map((e: any) => [e.effectType, e.roundsRemaining] as [string, bigint])
        .sort((a, b) => a[0].localeCompare(b[0])),
      enemyEffects: rows(ctx, 'combat_enemy_effect')
        .map((e: any) => [e.effectType, e.roundsRemaining] as [string, bigint])
        .sort((a, b) => a[0].localeCompare(b[0])),
      enemyAttackLines: newLines.filter((m) => ENEMY_ATTACK.test(m)).length,
      dotLines: newLines.filter((m) => /Burn sears Cave Rat/.test(m)).length,
      regenLines: newLines.filter((m) => /Mend soothes you/.test(m)).length,
      openRound: open?.roundNumber,
    });
  }
  return out;
}

describe('rounds, not the wall clock, drive combat timing', () => {
  let a: RoundState[];
  let b: RoundState[];
  beforeAll(() => {
    a = runScript(CLOCK_A);
    b = runScript(CLOCK_B);
  });

  it('round-domain state is identical under both clocks, round by round', () => {
    expect(b).toEqual(a);
  });

  it('ability cooldown counts down in rounds: 12 s is 3 rounds, set on use, one per round', () => {
    expect(a.map((r) => r.cooldowns)).toEqual([[[1n, 2n]], [[1n, 1n]], [], [], []]);
  });

  it('effects with 3 rounds left tick once per round and are gone after the third', () => {
    expect(a.map((r) => r.dotLines)).toEqual([1, 1, 1, 0, 0]);
    expect(a.map((r) => r.regenLines)).toEqual([1, 1, 1, 0, 0]);
    expect(a.map((r) => r.characterEffects.length)).toEqual([1, 1, 0, 0, 0]);
    expect(a[0].characterEffects).toEqual([['regen', 2n]]);
    expect(a[1].characterEffects).toEqual([['regen', 1n]]);
  });

  it('the stun round (round 2) is the only round the enemy takes no action', () => {
    expect(a.map((r) => r.enemyAttackLines > 0)).toEqual([true, false, true, true, true]);
    // the stun row itself is gone once its round is over; the DoT is counted down alongside it
    expect(a[1].enemyEffects).toEqual([['dot', 1n]]);
  });

  it('rounds are numbered with no gap under either clock', () => {
    expect(a.map((r) => r.openRound)).toEqual([2n, 3n, 4n, 5n, 6n]);
    expect(b.map((r) => r.openRound)).toEqual([2n, 3n, 4n, 5n, 6n]);
  });
});
