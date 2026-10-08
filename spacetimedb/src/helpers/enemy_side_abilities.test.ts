/**
 * Phase 51.3.1.1 Plan 04 (D-53): enemy-side heal, shield, drain, execute, taunt and cc in
 * resolveAbility, plus the enemy damage-shield choke point absorbEnemyShield.
 * Strict mock db (accessors come from the recorded schema), so a wrong index or an update that
 * matches no row throws like the real database.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createMockCtx } from './test-utils';
import { resolveAbility, absorbEnemyShield } from './combat';
import type { AbilityActor, AbilityRow } from './combat';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

beforeAll(async () => {
  await import('../schema/tables');
});

const COMBAT = 100n;
const OTHER_COMBAT = 200n;
const CASTER = 10n;
const ALLY_LOW = 11n;
const ALLY_HIGH = 12n;
const STRANGER = 20n; // an enemy of another fight

type Over = Record<string, unknown>;

const enemyRow = (id: bigint, currentHp: bigint, over: Over = {}) => ({
  id,
  combatId: COMBAT,
  enemyTemplateId: 1n,
  displayName: `Wolf ${id}`,
  currentHp,
  maxHp: 100n,
  armorClass: 0n,
  level: 5n,
  poolId: 0n,
  healTargetEnemyId: 0n,
  ...over,
});

function makeCtx(opts: {
  charHp?: bigint;
  charMaxHp?: bigint;
  casterHp?: bigint;
  allyLowHp?: bigint;
  allyHighHp?: bigint;
  enemyEffects?: any[];
  combatTargetEnemyId?: bigint;
} = {}) {
  return createMockCtx({
    strict: true,
    seed: {
      character: [{
        id: 1n, ownerUserId: 10n, name: 'Hero', hp: opts.charHp ?? 80n, maxHp: opts.charMaxHp ?? 100n,
        armorClass: 0n, racialMagicResist: 0n, groupId: undefined,
        combatTargetEnemyId: opts.combatTargetEnemyId, level: 5n,
      }],
      combat_encounter: [{ id: COMBAT, state: 'active' }, { id: OTHER_COMBAT, state: 'active' }],
      combat_enemy: [
        enemyRow(CASTER, opts.casterHp ?? 100n),
        enemyRow(ALLY_LOW, opts.allyLowHp ?? 40n),
        enemyRow(ALLY_HIGH, opts.allyHighHp ?? 90n),
        enemyRow(STRANGER, 10n, { combatId: OTHER_COMBAT }),
      ],
      combat_enemy_effect: opts.enemyEffects ?? [],
      character_effect: [],
      aggro_entry: [
        { id: 1n, combatId: COMBAT, enemyId: CASTER, characterId: 1n, petId: undefined, value: 5n },
      ],
      enemy_template: [{ id: 1n, name: 'Wolf' }],
      combat_participant: [{ id: 1n, combatId: COMBAT, characterId: 1n, status: 'active' }],
      ability_template: [],
      active_pet: [],
      item_instance: [],
      item_template: [],
    },
  });
}

const enemyActor: AbilityActor = {
  type: 'enemy',
  id: CASTER,
  stats: { str: 10n, dex: 5n, int: 5n, wis: 5n, cha: 5n },
  level: 5n,
  name: 'Wolf Mender',
};

const heroActor: AbilityActor = {
  type: 'character',
  id: 1n,
  stats: { str: 10n, dex: 5n, int: 5n, wis: 5n, cha: 5n },
  level: 5n,
  name: 'Hero',
};

const ability = (kind: string, over: Partial<AbilityRow> = {}): AbilityRow => ({
  id: 77n,
  kind,
  targetRule: 'single_enemy',
  value1: 20n,
  value2: undefined,
  damageType: 'physical',
  scaling: 'none',
  effectType: undefined,
  effectMagnitude: undefined,
  effectDuration: undefined,
  name: `Test ${kind}`,
  resourceType: 'none',
  resourceCost: 0n,
  cooldownSeconds: 0n,
  castSeconds: 0n,
  ...over,
});

const rows = (ctx: any, table: string): any[] => ctx.db[table]._rows();
const enemyHp = (ctx: any, id: bigint) => rows(ctx, 'combat_enemy').find((e) => e.id === id)!.currentHp as bigint;
const charHp = (ctx: any) => rows(ctx, 'character')[0].hp as bigint;
const snapshotEnemies = (ctx: any) => rows(ctx, 'combat_enemy').map((e) => [e.id, e.currentHp]);

// ---------------------------------------------------------------------------
// heal
// ---------------------------------------------------------------------------

describe('enemy heal targets an ally enemy, never a player', () => {
  it('heals the named ally (targetEnemyId) and leaves the character alone', () => {
    const ctx = makeCtx({ charHp: 50n });
    resolveAbility(ctx, COMBAT, enemyActor, ability('heal'), 1n, undefined, ALLY_LOW);
    expect(enemyHp(ctx, ALLY_LOW)).toBeGreaterThan(40n);
    expect(enemyHp(ctx, ALLY_LOW)).toBeLessThanOrEqual(100n);
    expect(charHp(ctx)).toBe(50n);
    expect(enemyHp(ctx, ALLY_HIGH)).toBe(90n);
    expect(enemyHp(ctx, CASTER)).toBe(100n);
  });

  it('never heals above maxHp', () => {
    const ctx = makeCtx({ allyLowHp: 99n });
    resolveAbility(ctx, COMBAT, enemyActor, ability('heal', { value1: 500n }), 1n, undefined, ALLY_LOW);
    expect(enemyHp(ctx, ALLY_LOW)).toBe(100n);
  });

  it('without targetEnemyId picks the living ally of this fight with the lowest HP fraction', () => {
    const ctx = makeCtx({ charHp: 50n });
    resolveAbility(ctx, COMBAT, enemyActor, ability('heal'), 1n);
    expect(enemyHp(ctx, ALLY_LOW)).toBeGreaterThan(40n);
    expect(enemyHp(ctx, ALLY_HIGH)).toBe(90n);
    expect(enemyHp(ctx, STRANGER)).toBe(10n);
    expect(charHp(ctx)).toBe(50n);
  });

  it('the caster itself counts as an ally when it is the most hurt', () => {
    const ctx = makeCtx({ casterHp: 20n });
    resolveAbility(ctx, COMBAT, enemyActor, ability('heal'));
    expect(enemyHp(ctx, CASTER)).toBeGreaterThan(20n);
    expect(enemyHp(ctx, ALLY_LOW)).toBe(40n);
  });

  it('falls back to the lowest-fraction ally when the named ally is dead', () => {
    const ctx = makeCtx({ allyHighHp: 0n });
    resolveAbility(ctx, COMBAT, enemyActor, ability('heal'), undefined, undefined, ALLY_HIGH);
    expect(enemyHp(ctx, ALLY_HIGH)).toBe(0n);
    expect(enemyHp(ctx, ALLY_LOW)).toBeGreaterThan(40n);
  });

  it('does nothing when every ally is at full HP', () => {
    const ctx = makeCtx({ allyLowHp: 100n, allyHighHp: 100n, charHp: 50n });
    const before = snapshotEnemies(ctx);
    resolveAbility(ctx, COMBAT, enemyActor, ability('heal'), 1n);
    expect(snapshotEnemies(ctx)).toEqual(before);
    expect(charHp(ctx)).toBe(50n);
  });

  it('tells the active participants who was mended', () => {
    const ctx = makeCtx();
    resolveAbility(ctx, COMBAT, enemyActor, ability('heal'), 1n, undefined, ALLY_LOW);
    const msgs = rows(ctx, 'event_private').map((e) => e.message);
    expect(msgs).toContain(`Wolf Mender mends Wolf ${ALLY_LOW}.`);
  });
});

// ---------------------------------------------------------------------------
// shield and absorbEnemyShield
// ---------------------------------------------------------------------------

describe('enemy shield goes on an ally enemy, never a player', () => {
  it('puts a damage_shield combat_enemy_effect on the named ally', () => {
    const ctx = makeCtx();
    resolveAbility(ctx, COMBAT, enemyActor, ability('shield', { value1: 25n }), 1n, undefined, ALLY_LOW);
    const effects = rows(ctx, 'combat_enemy_effect');
    expect(effects).toHaveLength(1);
    expect(effects[0]).toMatchObject({ combatId: COMBAT, enemyId: ALLY_LOW, effectType: 'damage_shield', magnitude: 25n });
    expect(effects[0].ownerCharacterId).toBeUndefined();
    expect(rows(ctx, 'character_effect')).toHaveLength(0);
  });

  it('defaults to the caster itself without a target', () => {
    const ctx = makeCtx();
    resolveAbility(ctx, COMBAT, enemyActor, ability('shield', { value1: 25n }), 1n);
    const effects = rows(ctx, 'combat_enemy_effect');
    expect(effects).toHaveLength(1);
    expect(effects[0].enemyId).toBe(CASTER);
    expect(rows(ctx, 'character_effect')).toHaveLength(0);
  });
});

const shieldRow = (id: bigint, enemyId: bigint, magnitude: bigint, combatId = COMBAT) => ({
  id, combatId, enemyId, effectType: 'damage_shield', magnitude, roundsRemaining: 3n,
  sourceAbility: 'Brace', ownerCharacterId: undefined,
});

describe('absorbEnemyShield', () => {
  it('a 20-point shield takes 20 of 30 damage, returns 10 and is removed', () => {
    const ctx = makeCtx({ enemyEffects: [shieldRow(1n, ALLY_LOW, 20n)] });
    const enemy = rows(ctx, 'combat_enemy').find((e) => e.id === ALLY_LOW);
    expect(absorbEnemyShield(ctx, COMBAT, enemy, 30n)).toBe(10n);
    expect(rows(ctx, 'combat_enemy_effect')).toHaveLength(0);
  });

  it('a 50-point shield takes all 30 damage, returns 0 and keeps 20 points', () => {
    const ctx = makeCtx({ enemyEffects: [shieldRow(1n, ALLY_LOW, 50n)] });
    const enemy = rows(ctx, 'combat_enemy').find((e) => e.id === ALLY_LOW);
    expect(absorbEnemyShield(ctx, COMBAT, enemy, 30n)).toBe(0n);
    const effects = rows(ctx, 'combat_enemy_effect');
    expect(effects).toHaveLength(1);
    expect(effects[0].magnitude).toBe(20n);
  });

  it('ignores other effect types and other enemies\' shields', () => {
    const ctx = makeCtx({
      enemyEffects: [
        shieldRow(1n, ALLY_HIGH, 50n),
        { ...shieldRow(2n, ALLY_LOW, 9n), effectType: 'armor_down' },
      ],
    });
    const enemy = rows(ctx, 'combat_enemy').find((e) => e.id === ALLY_LOW);
    expect(absorbEnemyShield(ctx, COMBAT, enemy, 30n)).toBe(30n);
    expect(rows(ctx, 'combat_enemy_effect').map((e) => e.magnitude)).toEqual([50n, 9n]);
  });

  it('uses several shields in id order', () => {
    const ctx = makeCtx({ enemyEffects: [shieldRow(2n, ALLY_LOW, 5n), shieldRow(1n, ALLY_LOW, 10n)] });
    const enemy = rows(ctx, 'combat_enemy').find((e) => e.id === ALLY_LOW);
    expect(absorbEnemyShield(ctx, COMBAT, enemy, 12n)).toBe(0n);
    const left = rows(ctx, 'combat_enemy_effect');
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ id: 2n, magnitude: 3n });
  });
});

describe('a player damage ability on a shielded enemy', () => {
  const hit = ability('damage', { value1: 30n });

  it('lowers currentHp only by the damage left after the shield', () => {
    const plain = makeCtx({ allyLowHp: 100n, combatTargetEnemyId: ALLY_LOW });
    resolveAbility(plain, COMBAT, heroActor, hit);
    const full = 100n - enemyHp(plain, ALLY_LOW);
    expect(full).toBeGreaterThan(3n);

    const shielded = makeCtx({
      allyLowHp: 100n,
      combatTargetEnemyId: ALLY_LOW,
      enemyEffects: [shieldRow(1n, ALLY_LOW, 3n)],
    });
    resolveAbility(shielded, COMBAT, heroActor, hit);
    expect(100n - enemyHp(shielded, ALLY_LOW)).toBe(full - 3n);
    expect(rows(shielded, 'combat_enemy_effect')).toHaveLength(0);
  });

  it('leaves currentHp untouched when the shield holds it all', () => {
    const ctx = makeCtx({
      allyLowHp: 100n,
      combatTargetEnemyId: ALLY_LOW,
      enemyEffects: [shieldRow(1n, ALLY_LOW, 10_000n)],
    });
    resolveAbility(ctx, COMBAT, heroActor, hit);
    expect(enemyHp(ctx, ALLY_LOW)).toBe(100n);
    expect(rows(ctx, 'combat_enemy_effect')[0].magnitude).toBeLessThan(10_000n);
  });
});

// ---------------------------------------------------------------------------
// drain and execute
// ---------------------------------------------------------------------------

describe('enemy drain damages the player and heals the caster', () => {
  it('hurts the character and heals the caster by 30% of the damage by default', () => {
    const ctx = makeCtx({ charHp: 100n, casterHp: 50n });
    resolveAbility(ctx, COMBAT, enemyActor, ability('drain', { value1: 30n }), 1n);
    const dealt = 100n - charHp(ctx);
    expect(dealt).toBeGreaterThan(0n);
    expect(enemyHp(ctx, CASTER)).toBe(50n + (dealt * 30n) / 100n);
    expect(enemyHp(ctx, ALLY_LOW)).toBe(40n);
    expect(enemyHp(ctx, ALLY_HIGH)).toBe(90n);
    expect(enemyHp(ctx, STRANGER)).toBe(10n);
  });

  it('uses value2 as the heal share and caps the caster at maxHp', () => {
    const ctx = makeCtx({ charHp: 100n, casterHp: 50n });
    resolveAbility(ctx, COMBAT, enemyActor, ability('drain', { value1: 30n, value2: 50n }), 1n);
    const dealt = 100n - charHp(ctx);
    expect(enemyHp(ctx, CASTER)).toBe(50n + (dealt * 50n) / 100n);

    const capped = makeCtx({ charHp: 100n, casterHp: 99n });
    resolveAbility(capped, COMBAT, enemyActor, ability('drain', { value1: 30n, value2: 100n }), 1n);
    expect(enemyHp(capped, CASTER)).toBe(100n);
  });

  it('does nothing without a player target and never throws', () => {
    const ctx = makeCtx({ casterHp: 50n });
    const before = snapshotEnemies(ctx);
    expect(() => resolveAbility(ctx, COMBAT, enemyActor, ability('drain'))).not.toThrow();
    expect(snapshotEnemies(ctx)).toEqual(before);
    expect(charHp(ctx)).toBe(80n);
  });
});

describe('enemy execute damages the player, double under 30% HP', () => {
  const exec = ability('execute', { value1: 10n });

  it('doubles the hit at 20% HP compared with 80% HP; no enemy HP changes', () => {
    const low = makeCtx({ charHp: 200n, charMaxHp: 1000n });
    const lowBefore = snapshotEnemies(low);
    resolveAbility(low, COMBAT, enemyActor, exec, 1n);
    const lowDealt = 200n - charHp(low);

    const high = makeCtx({ charHp: 800n, charMaxHp: 1000n });
    resolveAbility(high, COMBAT, enemyActor, exec, 1n);
    const highDealt = 800n - charHp(high);

    expect(highDealt).toBeGreaterThan(0n);
    expect(lowDealt).toBeGreaterThanOrEqual(2n * highDealt - 2n);
    expect(lowDealt).toBeLessThanOrEqual(2n * highDealt + 2n);
    expect(snapshotEnemies(low)).toEqual(lowBefore);
  });

  it('does nothing without a player target and never throws', () => {
    const ctx = makeCtx();
    const before = snapshotEnemies(ctx);
    expect(() => resolveAbility(ctx, COMBAT, enemyActor, exec)).not.toThrow();
    expect(snapshotEnemies(ctx)).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// taunt and cc: explicit no-ops for enemies (RESEARCH A6)
// ---------------------------------------------------------------------------

describe('enemy taunt and cc are no-ops', () => {
  for (const kind of ['taunt', 'cc']) {
    it(`${kind}: no aggro row, no enemy effect, no HP change, no throw`, () => {
      const ctx = makeCtx();
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const aggroBefore = rows(ctx, 'aggro_entry').map((r) => ({ ...r }));
      const before = snapshotEnemies(ctx);
      expect(() =>
        resolveAbility(ctx, COMBAT, enemyActor, ability(kind, { effectType: 'stun' }), 1n),
      ).not.toThrow();
      expect(rows(ctx, 'aggro_entry')).toEqual(aggroBefore);
      expect(rows(ctx, 'combat_enemy_effect')).toHaveLength(0);
      expect(rows(ctx, 'character_effect')).toHaveLength(0);
      expect(snapshotEnemies(ctx)).toEqual(before);
      expect(rows(ctx, 'combat_enemy').every((e) => e.aggroTargetCharacterId === undefined)).toBe(true);
      logSpy.mockRestore();
    });
  }
});
