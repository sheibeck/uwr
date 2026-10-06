/**
 * Phase 46.1 Plan 05, assumption delta (PROMOTE: the combat round is the unit of time in a fight).
 *
 * Companion invariant: the same scripted fight run under two different clocks (every transaction at
 * T0, versus irregular forward jumps of microseconds to hours) yields identical round-domain state:
 * ability cooldown roundsRemaining, effect roundsRemaining, stun skips, DoT and HoT tick counts per
 * round. While a fight is active nothing about timing may depend on a wall-clock comparison.
 *
 * 46.1-07 extends it with enemy cooldowns, wind-ups, pets and adds, and with a static guard that no
 * round function compares a wall-clock field.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
// @ts-ignore node types are not part of this module's tsconfig (same as other source-reading tests)
import { readFileSync } from 'node:fs';
import { roundSeed } from '../helpers/combat_rounds';
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

// ── 46.1-07: enemy wind-ups and cooldowns, adds and pets under the two clocks ─────────────────────

/**
 * The enemy ability AI rolls roundSeed(now + enemyId + combatId, round) % 100 < 50. The roll is the
 * only place a timestamp enters a decision, as a random seed (never as a deadline); each clock
 * nudges its timestamps by a few microseconds so the roll passes in every round, which makes the
 * scripted fight comparable while the two clocks stay hours apart.
 */
const rollPasses = (now: bigint, round: bigint): boolean => roundSeed(now + 1n + 1n, round) % 100n < 50n;
const nudged = (base: bigint, round: bigint): bigint => {
  let now = base;
  while (!rollPasses(now, round)) now += 1n;
  return now;
};
const ROUNDS_ACTORS = 5;
const clockWith = (bases: bigint[]) => bases.map((base, i) => nudged(base, BigInt(i + 1)));
const ACTOR_CLOCK_A = clockWith(Array.from({ length: ROUNDS_ACTORS }, () => T0));
const ACTOR_CLOCK_B = clockWith([T0, T0 + 1n, T0 + 3_600_000_000n, T0 + 3_600_000_007n, T0 + 7_200_000_000n]);

type ActorState = {
  round: number;
  casts: Array<[bigint, bigint]>;
  cooldowns: Array<[string, bigint]>;
  enemyCount: number;
  pendingAdds: number;
  begins: number;
  boltHits: number;
  petAbility: number;
  petAttack: number;
};

function actorSeed() {
  const seed = fightSeed({
    withOpenRound: true,
    playerHp: 1_000_000n,
    enemies: [{ id: 1n, name: 'Cave Rat', hp: 1_000_000n, attackDamage: 5n }],
    extra: {
      enemy_ability: [
        {
          id: 1n, enemyTemplateId: 1n, abilityKey: 'bolt', name: 'Bolt', kind: 'damage',
          castSeconds: 2n, cooldownSeconds: 8n, targetRule: 'aggro',
        },
      ],
      // the add comes from a template with no abilities, so only enemy 1 ever casts
      enemy_spawn: [
        { id: 2n, locationId: 10n, enemyTemplateId: 2n, name: 'Cave Bat', state: 'engaged', lockedCombatId: 1n, groupCount: 0n },
      ],
      combat_pending_add: [
        {
          id: 1n, combatId: 1n, enemyTemplateId: 2n, enemyRoleTemplateId: undefined, spawnId: 2n,
          arriveAtMicros: 1n, arriveAtRound: 3n,
        },
      ],
      active_pet: [
        {
          id: 1n, characterId: 1n, combatId: 1n, name: 'Rex', level: 1n, currentHp: 5_000n, maxHp: 5_000n,
          attackDamage: 4n, abilityKey: 'pet_bleed', nextAbilityAt: 123n, abilityCooldownSeconds: 10n,
          targetEnemyId: undefined, nextAutoAttackAt: 456n, expiresAtMicros: undefined,
        },
      ],
    },
  });
  seed.enemy_template.push({ ...seed.enemy_template[0], id: 2n, name: 'Cave Bat' });
  return seed;
}

function runActorScript(clock: bigint[]): ActorState[] {
  const ctx = fightCtx(actorSeed(), MODULE, clock[0]);
  const out: ActorState[] = [];
  for (let i = 0; i < ROUNDS_ACTORS; i++) {
    ctx.timestamp = { microsSinceUnixEpoch: clock[i] };
    const eventsBefore = rows(ctx, 'event_private').length;
    const tick = openTickArg(ctx);
    ctx.sender = MODULE;
    resolveTimer(ctx, tick);
    const ticks = rows(ctx, 'round_timer_tick');
    const fired = ticks.findIndex((r: any) => r.scheduledId === tick.arg.scheduledId);
    if (fired >= 0) ticks.splice(fired, 1);
    const newLines: string[] = rows(ctx, 'event_private')
      .slice(eventsBefore)
      .filter((e: any) => e.characterId === 1n)
      .map((e: any) => e.message);
    out.push({
      round: i + 1,
      casts: rows(ctx, 'combat_enemy_cast').map((c: any) => [c.announcedRound, c.landsAtRound] as [bigint, bigint]),
      cooldowns: rows(ctx, 'combat_enemy_cooldown').map((c: any) => [c.abilityKey, c.readyAtRound] as [string, bigint]),
      enemyCount: rows(ctx, 'combat_enemy').length,
      pendingAdds: rows(ctx, 'combat_pending_add').length,
      begins: newLines.filter((m) => /begins to cast Bolt/.test(m)).length,
      // the pet draws aggro once it has hit, so a Bolt may land on the pet instead of the player
      boltHits: newLines.filter((m) => /Cave Rat's Bolt hits you|Cave Rat uses Bolt on Rex/.test(m)).length,
      petAbility: newLines.filter((m) => /^Rex rends/.test(m)).length,
      petAttack: newLines.filter((m) => /^Rex (hits|misses) |dodges Rex's attack|parries Rex's attack|blocks Rex's attack/.test(m)).length,
    });
  }
  return out;
}

describe('enemy wind-ups and cooldowns, adds and pets count rounds, not the wall clock (46.1-07)', () => {
  let a: ActorState[];
  let b: ActorState[];
  beforeAll(() => {
    a = runActorScript(ACTOR_CLOCK_A);
    b = runActorScript(ACTOR_CLOCK_B);
  });

  it('the two clocks really are hours apart', () => {
    expect(ACTOR_CLOCK_B[4] - ACTOR_CLOCK_A[4]).toBeGreaterThan(7_000_000_000n);
  });

  it('wind-up, cooldown, add and pet rounds are identical under both clocks, round by round', () => {
    expect(b).toEqual(a);
  });

  it('a wind-up announced in round N lands in round N + 1 and the cooldown is ready from round N + 2', () => {
    // 2 s cast = 1 round of wind-up; 8 s cooldown = 2 rounds, started when announced
    expect(a.map((r) => r.casts)).toEqual([[[1n, 2n]], [], [[3n, 4n]], [], [[5n, 6n]]]);
    expect(a.map((r) => r.cooldowns)).toEqual([
      [['bolt', 3n]], [['bolt', 3n]], [['bolt', 5n]], [['bolt', 5n]], [['bolt', 7n]],
    ]);
    expect(a.map((r) => r.begins)).toEqual([1, 0, 1, 0, 1]);
    expect(a.map((r) => r.boltHits)).toEqual([0, 1, 0, 1, 0]);
  });

  it('the pending add with arriveAtRound 3 joins at the end of round 3', () => {
    expect(a.map((r) => r.enemyCount)).toEqual([1, 1, 2, 2, 2]);
    expect(a.map((r) => r.pendingAdds)).toEqual([1, 1, 0, 0, 0]);
  });

  it('a pet with a 10 s ability uses it in rounds 1 and 4 and swings every round', () => {
    expect(a.map((r) => r.petAbility)).toEqual([1, 0, 0, 1, 0]);
    expect(a.map((r) => r.petAttack)).toEqual([1, 1, 1, 1, 1]);
  });
});

describe('static guard: no round function compares a wall-clock field (46.1-07)', () => {
  const source = readFileSync(new URL('./combat.ts', import.meta.url), 'utf-8') as string;
  const WALL_CLOCK_FIELDS = ['readyAtMicros', 'endsAtMicros', 'arriveAtMicros', 'nextAutoAttackAt', 'nextAbilityAt', 'durationMicros'];
  const FIELD = `(?:${WALL_CLOCK_FIELDS.join('|')})`;
  // a field next to a comparison operator, on either side ("=>" arrows and "=" assignments are not comparisons)
  const COMPARISON = new RegExp(
    `${FIELD}\\s*(?:<=|>=|===|!==|==|!=|<|>)|(?:<=|>=|===|!==|==|!=|(?<![=])<|(?<![=])>)\\s*[\\w.?\\[\\]]*${FIELD}`,
  );
  const ROUND_FUNCTIONS = [
    'processPendingAdds',
    'processPetCombat',
    'tryEnemyAbilityForRound',
    'processEnemyAutoAttackForRound',
    'processPlayerAutoAttackForRound',
    'tickEffectsForRound',
    'resolveRound',
    'submitCombatChoice',
  ];

  /** The function body: from `  const <name> = (` to the next line at the same two-space indent that starts a new definition. */
  function bodyOf(src: string, name: string): string {
    const lines = src.split(/\r?\n/);
    const start = lines.findIndex((l) => l.startsWith(`  const ${name} = (`));
    if (start < 0) return '';
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (/^  (const |spacetimedb\.reducer\(|scheduledReducers\[)/.test(lines[i])) {
        end = i;
        break;
      }
    }
    return lines.slice(start, end).join('\n');
  }

  /** Comments are not code: strip them before looking for comparisons. */
  const stripComments = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it.each(ROUND_FUNCTIONS)('%s has a non-empty body', (name) => {
    const body = bodyOf(source, name);
    expect(body.length).toBeGreaterThan(200);
    expect(body).toContain(`const ${name} = (`);
  });

  it.each(ROUND_FUNCTIONS)('%s never compares a wall-clock field', (name) => {
    const code = stripComments(bodyOf(source, name));
    const hit = code.split('\n').find((line) => COMPARISON.test(line));
    expect(hit).toBeUndefined();
  });

  it('the detector catches comparisons on either side and ignores assignments and arrows', () => {
    for (const bad of [
      'if (cooldown.readyAtMicros > nowMicros) continue;',
      'if (nowMicros >= pending.arriveAtMicros) join();',
      'if (pet.nextAutoAttackAt && pet.nextAutoAttackAt <= nowMicros) {',
      'while (x.durationMicros !== 0n) {',
      'if (nowMicros < row.endsAtMicros) return;',
      'if (pet.nextAbilityAt === undefined) return;',
    ]) {
      expect(COMPARISON.test(bad), bad).toBe(true);
    }
    for (const fine of [
      'readyAtMicros: nowMicros + roundsToEstimateMicros(cooldownLength),',
      'ctx.db.active_pet.id.update({ ...pet, nextAbilityAt: undefined });',
      'const earliest = rows.map((row) => row.arriveAtMicros);',
      'if (pending.arriveAtRound > roundNumber) continue;',
    ]) {
      expect(COMPARISON.test(fine), fine).toBe(false);
    }
  });
});
