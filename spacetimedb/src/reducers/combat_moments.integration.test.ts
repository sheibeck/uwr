/**
 * Phase 46.1 Plan 08 (RND-05): big moments inside resolveRound, through the REAL captured reducers
 * on a strict mock db. A picked moment writes one private combat_moment row (before the enqueue) and
 * one combat_narration job; a refusal or a throwing helper never stops the round.
 *
 * Deterministic setups: enemies with 400 HP are not killed by a fist; a character DoT or an enemy
 * DoT moves HP by a known amount, so a near death or a phase change does not depend on a hit roll.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
// @ts-ignore node types are not part of this module's tsconfig (same as other source-reading tests)
import { readFileSync } from 'node:fs';
import { capturedReducer, rowColumnProblems } from '../helpers/schema_recorder';
import { resolveRouteInput } from '../helpers/llm_inputs';
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

// The moment helper can be told to throw, to prove a round never depends on narration.
const narrationControl = vi.hoisted(() => ({ throwOnMoment: false }));
vi.mock('../helpers/combat_narration', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../helpers/combat_narration')>();
  return {
    ...actual,
    enqueueCombatMomentNarration: (...args: Parameters<typeof actual.enqueueCombatMomentNarration>) => {
      if (narrationControl.throwOnMoment) throw new Error('narration helper exploded');
      return actual.enqueueCombatMomentNarration(...args);
    },
  };
});

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

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  narrationControl.throwOnMoment = false;
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
});

const TEN_S = 10_000_000n;

function fire(ctx: any, atMicros?: bigint) {
  if (atMicros !== undefined) ctx.timestamp = { microsSinceUnixEpoch: atMicros };
  const tick = openTickArg(ctx);
  ctx.sender = MODULE;
  handlers.resolve_round_timer(ctx, tick);
  const table = ctx.db._tables.round_timer_tick ?? [];
  const idx = table.findIndex((r: any) => r.scheduledId === tick.arg.scheduledId);
  if (idx >= 0) table.splice(idx, 1);
}

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

const autoAttack = (over: Record<string, unknown> = {}) => ({
  id: 1n,
  combatId: 1n,
  characterId: 1n,
  roundNumber: 1n,
  actionType: 'auto_attack',
  abilityTemplateId: undefined,
  targetEnemyId: undefined,
  targetCharacterId: undefined,
  submittedAt: { microsSinceUnixEpoch: T0 },
  ...over,
});

const characterDot = (magnitude: bigint) => ({
  id: 1n,
  characterId: 1n,
  effectType: 'dot',
  magnitude,
  roundsRemaining: 3n,
  sourceAbility: 'Rot',
});

const enemyDot = (enemyId: bigint, magnitude: bigint) => ({
  id: 1n,
  combatId: 1n,
  enemyId,
  effectType: 'dot',
  magnitude,
  roundsRemaining: 3n,
  sourceAbility: 'Burn',
  ownerCharacterId: undefined,
});

const momentRow = (id: bigint, over: Record<string, unknown> = {}) => ({
  id,
  combatId: 1n,
  kind: 'near_death',
  subjectKey: `character:${id + 10n}`,
  roundNumber: id,
  createdAt: { microsSinceUnixEpoch: T0 },
  ...over,
});

const moments = (ctx: any) => rows(ctx, 'combat_moment');
const jobs = (ctx: any) => rows(ctx, 'llm_job').filter((j: any) => j.route === 'combat_narration');
const request = (job: any) => JSON.parse(job.requestJson);
const input = (ctx: any, job: any) => resolveRouteInput(ctx, job) as any;
const ticksFor = (ctx: any) => rows(ctx, 'round_timer_tick').filter((r: any) => r.combatId === 1n);
const roundTwoIsOpen = (ctx: any) => {
  const open = rows(ctx, 'combat_round').filter((r: any) => r.roundNumber === 2n);
  return open.length === 1 && open[0].state === 'action_select' && ticksFor(ctx).length === 1;
};

/** Two enemies; the first (the character's target) has 1 HP and dies to the auto-attack. */
const firstKillSeed = (extra: Record<string, any[]> = {}, over: Record<string, unknown> = {}) =>
  fightSeed({
    withOpenRound: true,
    enemies: [
      { id: 1n, name: 'Cave Rat', hp: 1n },
      { id: 2n, name: 'Cave Bat', hp: 400n },
    ],
    extra: { combat_action: [autoAttack()], ...extra },
    ...over,
  });

describe('a kill moment (RND-05)', () => {
  it('the first kill writes one moment row and one narration job naming the killer', () => {
    const ctx = fightCtx(firstKillSeed(), MODULE, T0 + TEN_S);
    fire(ctx);

    expect(moments(ctx)).toHaveLength(1);
    expect(moments(ctx)[0]).toMatchObject({ combatId: 1n, kind: 'kill', subjectKey: 'first', roundNumber: 1n });
    for (const row of moments(ctx)) expect(rowColumnProblems('combat_moment', row)).toEqual([]);

    expect(jobs(ctx)).toHaveLength(1);
    const req = request(jobs(ctx)[0]);
    expect(req.narrativeType).toBe('kill');
    expect(req.roundNumber).toBe('1');
    const decoded = input(ctx, jobs(ctx)[0]);
    expect(decoded.momentSubject).toBe('Cave Rat');
    expect(decoded.momentFirst).toBe(true);
    expect(decoded.playerActions).toHaveLength(1);
    expect(decoded.playerActions[0].characterName).toBe('Aldric');
    expect(decoded.playerActions[0].abilityName).toBeUndefined();
    expect(decoded.playerActions[0].damageDealt > 0n).toBe(true);

    expect(rows(ctx, 'combat_round').find((r: any) => r.roundNumber === 2n)?.narrationCount).toBe(1n);
    expect(roundTwoIsOpen(ctx)).toBe(true);
  });

  it('an ability kill carries the ability name', () => {
    const seed = firstKillSeed({
      ability_template: [ability()],
      combat_action: [
        autoAttack({ actionType: 'ability', abilityTemplateId: 1n }),
      ],
    });
    const ctx = fightCtx(seed, MODULE, T0 + TEN_S);
    fire(ctx);

    expect(moments(ctx)).toHaveLength(1);
    const decoded = input(ctx, jobs(ctx)[0]);
    expect(decoded.playerActions).toHaveLength(1);
    expect(decoded.playerActions[0]).toMatchObject({ characterName: 'Aldric', abilityName: 'Fire Bolt' });
    expect(decoded.playerActions[0].damageDealt > 0n).toBe(true);
  });

  it('a kill by a DoT has no killer line', () => {
    const seed = fightSeed({
      withOpenRound: true,
      enemies: [
        { id: 1n, name: 'Cave Rat', hp: 3n },
        { id: 2n, name: 'Cave Bat', hp: 400n },
      ],
      // The character targets the second enemy; the first one dies to its DoT at the end of the round.
      extra: { combat_action: [autoAttack({ targetEnemyId: 2n })], combat_enemy_effect: [enemyDot(1n, 50n)] },
    });
    seed.character[0].combatTargetEnemyId = 2n;
    const ctx = fightCtx(seed, MODULE, T0 + TEN_S);
    fire(ctx);

    expect(moments(ctx)).toHaveLength(1);
    expect(moments(ctx)[0]).toMatchObject({ kind: 'kill', subjectKey: 'first' });
    const decoded = input(ctx, jobs(ctx)[0]);
    expect(decoded.momentSubject).toBe('Cave Rat');
    expect(decoded.playerActions).toEqual([]);
  });

  it('a boss kill with a second enemy alive carries the boss flag', () => {
    const ctx = fightCtx(firstKillSeed({}, { isBoss: true }), MODULE, T0 + TEN_S);
    fire(ctx);

    expect(moments(ctx)).toHaveLength(1);
    expect(moments(ctx)[0]).toMatchObject({ kind: 'kill', subjectKey: 'enemy:1' });
    const decoded = input(ctx, jobs(ctx)[0]);
    expect(decoded.momentBossOrNamed).toBe(true);
    expect(decoded.momentSubject).toBe('Cave Rat');
  });

  it('a named foe (a named_enemy row of a participant with the same template) counts as named', () => {
    const named = {
      id: 1n,
      characterId: 1n,
      name: 'Old Gnaw',
      enemyTemplateId: 1n,
      locationId: 10n,
      isAlive: true,
      lastKilledAt: undefined,
      respawnMinutes: 30n,
    };
    const ctx = fightCtx(firstKillSeed({ named_enemy: [named] }), MODULE, T0 + TEN_S);
    fire(ctx);
    expect(input(ctx, jobs(ctx)[0]).momentBossOrNamed).toBe(true);
    expect(moments(ctx)[0].subjectKey).toBe('enemy:1');
  });

  it('a plain first kill is not flagged as a boss', () => {
    const ctx = fightCtx(firstKillSeed(), MODULE, T0 + TEN_S);
    fire(ctx);
    expect(input(ctx, jobs(ctx)[0]).momentBossOrNamed).toBe(false);
  });
});

describe('near death and phase moments (RND-05)', () => {
  const nearDeathSeed = (extra: Record<string, any[]> = {}) => {
    const seed = fightSeed({
      withOpenRound: true,
      playerHp: 25n,
      enemies: [{ id: 1n, name: 'Cave Rat', hp: 4000n, attackDamage: 0n }],
      extra: { combat_action: [autoAttack()], character_effect: [characterDot(12n)], ...extra },
    });
    return seed;
  };

  it('a character crossing below 20% HP fires once, and a second drop fires nothing', () => {
    const ctx = fightCtx(nearDeathSeed(), MODULE, T0 + TEN_S);
    fire(ctx);

    expect(moments(ctx)).toHaveLength(1);
    expect(moments(ctx)[0]).toMatchObject({ kind: 'near_death', subjectKey: 'character:1', roundNumber: 1n });
    expect(request(jobs(ctx)[0]).narrativeType).toBe('near_death');
    expect(input(ctx, jobs(ctx)[0]).momentSubject).toBe('Aldric');
    const hpAfterRound1 = rows(ctx, 'character').find((c: any) => c.id === 1n).hp;
    expect(hpAfterRound1 > 0n && hpAfterRound1 * 100n < 2000n).toBe(true);

    // Back above the line, then down again in round 2: the same character does not fire twice.
    const character = rows(ctx, 'character').find((c: any) => c.id === 1n);
    character.hp = 25n;
    rows(ctx, 'combat_action').push(autoAttack({ id: 2n, roundNumber: 2n }));
    fire(ctx, T0 + 2n * TEN_S);
    expect(moments(ctx)).toHaveLength(1);
    expect(jobs(ctx)).toHaveLength(1);
    expect(rows(ctx, 'combat_round').find((r: any) => r.roundNumber === 3n)?.narrationCount).toBe(1n);
  });

  it('a named enemy crossing 50% fires a phase moment', () => {
    const named = {
      id: 1n,
      characterId: 1n,
      name: 'Old Gnaw',
      enemyTemplateId: 1n,
      locationId: 10n,
      isAlive: true,
      lastKilledAt: undefined,
      respawnMinutes: 30n,
    };
    const seed = fightSeed({
      withOpenRound: true,
      enemies: [{ id: 1n, name: 'Old Gnaw', hp: 600n, maxHp: 1000n, attackDamage: 0n }],
      extra: {
        combat_action: [autoAttack()],
        named_enemy: [named],
        combat_enemy_effect: [enemyDot(1n, 200n)],
      },
    });
    const ctx = fightCtx(seed, MODULE, T0 + TEN_S);
    fire(ctx);

    expect(moments(ctx)).toHaveLength(1);
    expect(moments(ctx)[0]).toMatchObject({ kind: 'phase', subjectKey: 'enemy:1', roundNumber: 1n });
    expect(request(jobs(ctx)[0]).narrativeType).toBe('phase');
    expect(input(ctx, jobs(ctx)[0]).momentSubject).toBe('Old Gnaw');
  });

  it('an enemy that is not a boss or named fires no phase moment', () => {
    const seed = fightSeed({
      withOpenRound: true,
      enemies: [{ id: 1n, name: 'Cave Rat', hp: 600n, maxHp: 1000n, attackDamage: 0n }],
      extra: { combat_action: [autoAttack()], combat_enemy_effect: [enemyDot(1n, 200n)] },
    });
    const ctx = fightCtx(seed, MODULE, T0 + TEN_S);
    fire(ctx);
    expect(moments(ctx)).toHaveLength(0);
    expect(jobs(ctx)).toHaveLength(0);
    expect(roundTwoIsOpen(ctx)).toBe(true);
  });

  it('a near death and a first kill in the same round give one row, the near death', () => {
    const seed = firstKillSeed({ character_effect: [characterDot(12n)] }, { playerHp: 25n });
    const ctx = fightCtx(seed, MODULE, T0 + TEN_S);
    fire(ctx);

    expect(moments(ctx)).toHaveLength(1);
    expect(moments(ctx)[0]).toMatchObject({ kind: 'near_death', subjectKey: 'character:1' });
    expect(jobs(ctx)).toHaveLength(1);
    expect(request(jobs(ctx)[0]).narrativeType).toBe('near_death');
  });
});

describe('the budget and the end of the fight (RND-05)', () => {
  it('three moment rows already in the fight: no new row, no job, the round still resolves', () => {
    const seed = firstKillSeed({ combat_moment: [momentRow(1n), momentRow(2n), momentRow(3n)] });
    const ctx = fightCtx(seed, MODULE, T0 + TEN_S);
    fire(ctx);

    expect(moments(ctx)).toHaveLength(3);
    expect(jobs(ctx)).toHaveLength(0);
    expect(roundTwoIsOpen(ctx)).toBe(true);
    expect(rows(ctx, 'combat_round').find((r: any) => r.roundNumber === 2n)?.narrationCount).toBe(3n);
  });

  it('two moment rows already in the fight leave room for exactly one more', () => {
    const seed = firstKillSeed({ combat_moment: [momentRow(1n), momentRow(2n)] });
    const ctx = fightCtx(seed, MODULE, T0 + TEN_S);
    fire(ctx);
    expect(moments(ctx)).toHaveLength(3);
    expect(jobs(ctx)).toHaveLength(1);
    expect(rows(ctx, 'combat_round').find((r: any) => r.roundNumber === 2n)?.narrationCount).toBe(3n);
  });

  it('the round that ends the fight writes no moment row; one outro job carries that round number', () => {
    const seed = fightSeed({
      withOpenRound: true,
      enemies: [{ id: 1n, name: 'Cave Rat', hp: 1n }],
      extra: { combat_action: [autoAttack()] },
    });
    const ctx = fightCtx(seed, MODULE, T0 + TEN_S);
    fire(ctx);

    expect(rows(ctx, 'combat_encounter')[0].state).toBe('resolved');
    expect(moments(ctx)).toHaveLength(0);
    expect(jobs(ctx)).toHaveLength(1);
    const req = request(jobs(ctx)[0]);
    expect(req.narrativeType).toBe('victory');
    expect(req.roundNumber).toBe('1');
  });

  it('the fight moment rows go when the fight ends (leave-fight cleanup unchanged)', () => {
    const seed = fightSeed({
      withOpenRound: true,
      enemies: [{ id: 1n, name: 'Cave Rat', hp: 1n }],
      extra: { combat_action: [autoAttack()], combat_moment: [momentRow(1n)] },
    });
    const ctx = fightCtx(seed, MODULE, T0 + TEN_S);
    fire(ctx);
    expect(moments(ctx)).toHaveLength(0);
  });
});

describe('narration never holds up a round (RND-05)', () => {
  it('a refused enqueue still writes the moment row, writes no job, posts nothing and throws nothing', () => {
    const seed = firstKillSeed();
    seed.llm_admin_state = [];
    const ctx = fightCtx(seed, MODULE, T0 + TEN_S);
    const before = rows(ctx, 'event_private').length;
    expect(() => fire(ctx)).not.toThrow();

    expect(moments(ctx)).toHaveLength(1);
    expect(jobs(ctx)).toHaveLength(0);
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    const posted = rows(ctx, 'event_private').slice(before).filter((e: any) => /narrat/i.test(e.message));
    expect(posted).toEqual([]);
    expect(roundTwoIsOpen(ctx)).toBe(true);
    expect(rows(ctx, 'combat_round').find((r: any) => r.roundNumber === 2n)?.narrationCount).toBe(1n);
  });

  it('a throwing narration helper cannot stop the round: moment row and next round are both written', () => {
    narrationControl.throwOnMoment = true;
    const ctx = fightCtx(firstKillSeed(), MODULE, T0 + TEN_S);
    expect(() => fire(ctx)).not.toThrow();

    expect(moments(ctx)).toHaveLength(1);
    expect(jobs(ctx)).toHaveLength(0);
    expect(rows(ctx, 'combat_encounter')[0].state).toBe('active');
    expect(roundTwoIsOpen(ctx)).toBe(true);
    expect(rows(ctx, 'combat_round').find((r: any) => r.roundNumber === 1n)?.state).toBe('resolved');
  });
});

describe('source rules for the moment wiring', () => {
  const source: string = readFileSync(new URL('./combat.ts', import.meta.url), 'utf8');

  it('detects with detectMoment once, enqueues the moment once and keeps both outro calls', () => {
    expect(source.match(/detectMoment\(/g)).toHaveLength(1);
    expect(source.match(/enqueueCombatMomentNarration\(ctx, combat/g)).toHaveLength(1);
    expect(source.match(/enqueueCombatOutroNarration\(ctx, combat/g)).toHaveLength(2);
  });

  it('writes the moment row before the enqueue', () => {
    const insertAt = source.indexOf('combat_moment.insert');
    const enqueueAt = source.indexOf('enqueueCombatMomentNarration(ctx, combat');
    expect(insertAt).toBeGreaterThan(-1);
    expect(insertAt).toBeLessThan(enqueueAt);
  });
});
