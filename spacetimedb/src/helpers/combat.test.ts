import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock SpacetimeDB server module
vi.mock('spacetimedb/server', () => ({
  SenderError: class SenderError extends Error {
    constructor(msg: string) { super(msg); }
  },
}));

// Mock spacetimedb (Timestamp, ScheduleAt used in combat.ts)
vi.mock('spacetimedb', () => ({
  Timestamp: { fromMicros: (m: bigint) => ({ microsSinceUnixEpoch: m }) },
  ScheduleAt: { time: (m: bigint) => ({ tag: 'Time', value: { microsSinceUnixEpoch: m } }) },
}));

// Mock events -- combat.ts imports appendPrivateEvent, appendGroupEvent, logPrivateAndGroup, fail
vi.mock('./events', () => ({
  appendPrivateEvent: vi.fn(),
  appendGroupEvent: vi.fn(),
  logPrivateAndGroup: vi.fn(),
  fail: vi.fn(),
}));

// Mock group dependency
vi.mock('./group', () => ({
  effectiveGroupId: vi.fn(() => null),
}));

// Mock items dependency
vi.mock('./items', () => ({
  getEquippedWeaponStats: vi.fn(() => null),
  getEquippedBonuses: vi.fn(() => ({
    str: 0n, dex: 0n, cha: 0n, wis: 0n, int: 0n,
    armorClass: 0n, magicResist: 0n, maxHp: 0n, maxMana: 0n, maxStamina: 0n,
    dodgeChance: 0n, parryChance: 0n, hitChance: 0n, blockChance: 0n, blockMitigation: 0n,
  })),
}));

// Mock character dependency
vi.mock('./character', () => ({
  partyMembersInLocation: vi.fn(() => []),
}));

// Mock schema/tables -- AggroEntry is imported as a value
vi.mock('../schema/tables', () => ({
  AggroEntry: { rowType: {} },
}));

import {
  abilityResourceCost,
  staminaResourceCost,
  rollAttackOutcome,
  abilityDamageFromWeapon,
  addCharacterEffect,
  convertDurationToRounds,
  hasShieldEquipped,
  abilityCooldownMicros,
  abilityCastMicros,
  sumCharacterEffect,
} from './combat';
import { createMockCtx } from './test-utils';
import { appendPrivateEvent } from './events';

// ============================================================================
// abilityResourceCost (pure function)
// ============================================================================

describe('abilityResourceCost', () => {
  it('returns mana cost for level 1, power 10', () => {
    // 4 + 1*2 + 10 = 16
    expect(abilityResourceCost(1n, 10n)).toBe(16n);
  });

  it('scales with level', () => {
    // level 5: 4 + 5*2 + 10 = 24
    expect(abilityResourceCost(5n, 10n)).toBe(24n);
  });

  it('scales with power', () => {
    // power 20: 4 + 1*2 + 20 = 26
    expect(abilityResourceCost(1n, 20n)).toBe(26n);
  });

  it('handles level 0', () => {
    // 4 + 0 + 5 = 9
    expect(abilityResourceCost(0n, 5n)).toBe(9n);
  });
});

// ============================================================================
// staminaResourceCost (pure function)
// ============================================================================

describe('staminaResourceCost', () => {
  it('returns stamina cost based on power', () => {
    // 2 + 10/2 = 7
    expect(staminaResourceCost(10n)).toBe(7n);
  });

  it('handles odd power (integer division)', () => {
    // 2 + 11/2 = 2 + 5 = 7 (bigint truncation)
    expect(staminaResourceCost(11n)).toBe(7n);
  });

  it('minimum cost at power 0', () => {
    expect(staminaResourceCost(0n)).toBe(2n);
  });
});

// ============================================================================
// convertDurationToRounds (pure function)
// ============================================================================

describe('convertDurationToRounds', () => {
  it('converts microseconds to rounds (4s per round)', () => {
    // EFFECT_ROUND_CONVERSION_MICROS = 4_000_000
    // 8_000_000 / 4_000_000 = 2 rounds
    expect(convertDurationToRounds(8_000_000n)).toBe(2n);
  });

  it('returns minimum 1 round for short durations', () => {
    // MIN_EFFECT_ROUNDS = 1
    expect(convertDurationToRounds(1_000_000n)).toBe(1n);
    expect(convertDurationToRounds(0n)).toBe(1n);
  });

  it('handles exact single round duration', () => {
    expect(convertDurationToRounds(4_000_000n)).toBe(1n);
  });

  it('truncates partial rounds', () => {
    // 10_000_000 / 4_000_000 = 2 (integer division)
    expect(convertDurationToRounds(10_000_000n)).toBe(2n);
  });
});

// ============================================================================
// rollAttackOutcome (deterministic based on seed)
// ============================================================================

describe('rollAttackOutcome', () => {
  it('returns hit with 100n multiplier for normal hit', () => {
    // seed=999 -> roll=999, past all avoidance thresholds -> hit
    const result = rollAttackOutcome(999n, {
      canBlock: false,
      canParry: false,
      canDodge: false,
    });
    expect(result.outcome).toBe('hit');
    expect(result.multiplier).toBe(100n);
  });

  it('returns dodge when roll < dodge chance', () => {
    // dodgeChanceBasis=100 (10%), seed=50 -> roll=50 < 100 -> dodge
    const result = rollAttackOutcome(50n, {
      canBlock: false,
      canParry: false,
      canDodge: true,
      dodgeChanceBasis: 100n,
    });
    expect(result.outcome).toBe('dodge');
    expect(result.multiplier).toBe(0n);
  });

  it('returns parry when roll falls in parry window', () => {
    // dodge=50, parry=100. seed=75 -> roll=75. 75 >= 50 (not dodge), 75 < 50+100=150 -> parry
    const result = rollAttackOutcome(75n, {
      canBlock: false,
      canParry: true,
      canDodge: true,
      dodgeChanceBasis: 50n,
      parryChanceBasis: 100n,
    });
    expect(result.outcome).toBe('parry');
    expect(result.multiplier).toBe(0n);
  });

  it('returns block with damage reduction multiplier', () => {
    // dodge=0, parry=0, block=200 (20%), mitigation=30%. seed=100 -> roll=100 < 200 -> block
    const result = rollAttackOutcome(100n, {
      canBlock: true,
      canParry: false,
      canDodge: false,
      blockChanceBasis: 200n,
      blockMitigationPercent: 30n,
    });
    expect(result.outcome).toBe('block');
    // damageTaken = 100 - 30 = 70
    expect(result.multiplier).toBe(70n);
  });

  it('returns crit when roll falls in crit window', () => {
    // No avoidance. Crit chance for DEX=450 = 500 (50%)
    // seed=200 -> roll=200. 200 < 500 -> crit
    const result = rollAttackOutcome(200n, {
      canBlock: false,
      canParry: false,
      canDodge: false,
      characterDex: 450n,
      weaponName: 'Iron Sword',
    });
    expect(result.outcome).toBe('crit');
    expect(result.multiplier).toBe(175n); // sword crit multiplier
  });

  it('hit bonus reduces avoidance chance', () => {
    // dodgeChanceBasis=100, hitBonus=80 -> net dodge = 20
    // seed=50 -> roll=50 >= 20 -> not dodge -> hit
    const result = rollAttackOutcome(50n, {
      canBlock: false,
      canParry: false,
      canDodge: true,
      dodgeChanceBasis: 100n,
      attackerHitBonus: 80n,
    });
    expect(result.outcome).not.toBe('dodge');
  });
});

// ============================================================================
// abilityDamageFromWeapon (pure function)
// ============================================================================

describe('abilityDamageFromWeapon', () => {
  it('scales weapon damage by percent and adds bonus', () => {
    // (100 * 150) / 100 + 10 = 160
    expect(abilityDamageFromWeapon(100n, 150n, 10n)).toBe(160n);
  });

  it('floors at weapon damage + bonus when scaled is lower', () => {
    // (100 * 50) / 100 + 5 = 55. Since 55 < 100, return 100 + 5 = 105
    expect(abilityDamageFromWeapon(100n, 50n, 5n)).toBe(105n);
  });

  it('handles 100% scaling', () => {
    // (100 * 100) / 100 + 0 = 100. 100 >= 100, return 100
    expect(abilityDamageFromWeapon(100n, 100n, 0n)).toBe(100n);
  });

  it('adds bonus on top of scaling', () => {
    // (50 * 200) / 100 + 20 = 120
    expect(abilityDamageFromWeapon(50n, 200n, 20n)).toBe(120n);
  });
});

// ============================================================================
// addCharacterEffect (needs mock DB)
// ============================================================================

describe('addCharacterEffect', () => {
  let ctx: ReturnType<typeof createMockCtx>;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockCtx({
      seed: {
        character: [{
          id: 1n,
          ownerUserId: 100n,
          hp: 80n,
          maxHp: 100n,
        }],
        character_effect: [],
      },
    });
  });

  it('inserts a new buff effect', () => {
    addCharacterEffect(ctx, 1n, 'str_buff', 5n, 3n, 'warrior_rally');
    const effects = ctx.db.character_effect._rows();
    expect(effects).toHaveLength(1);
    expect(effects[0].characterId).toBe(1n);
    expect(effects[0].effectType).toBe('str_buff');
    expect(effects[0].magnitude).toBe(5n);
    expect(effects[0].roundsRemaining).toBe(3n);
    expect(effects[0].sourceAbility).toBe('warrior_rally');
  });

  it('inserts a DoT effect and applies first tick', () => {
    addCharacterEffect(ctx, 1n, 'dot', 10n, 3n, 'poison');
    const effects = ctx.db.character_effect._rows();
    expect(effects).toHaveLength(1);
    expect(effects[0].effectType).toBe('dot');

    // First tick applied: hp = 80 - 10 = 70
    const char = ctx.db.character.id.find(1n);
    expect(char.hp).toBe(70n);
  });

  it('inserts a HoT effect and applies first tick', () => {
    addCharacterEffect(ctx, 1n, 'regen', 15n, 3n, 'mend');
    const effects = ctx.db.character_effect._rows();
    expect(effects).toHaveLength(1);
    expect(effects[0].effectType).toBe('regen');

    // First tick applied: hp = 80 + 15 = 95 (< maxHp 100)
    const char = ctx.db.character.id.find(1n);
    expect(char.hp).toBe(95n);
  });

  it('HoT does not exceed maxHp', () => {
    addCharacterEffect(ctx, 1n, 'regen', 50n, 3n, 'big_heal');
    const char = ctx.db.character.id.find(1n);
    expect(char.hp).toBe(100n); // capped at maxHp
  });

  it('DoT does not go below 0 hp', () => {
    // Character has 80hp, DoT does 100
    addCharacterEffect(ctx, 1n, 'dot', 100n, 3n, 'lethal_poison');
    const char = ctx.db.character.id.find(1n);
    expect(char.hp).toBe(0n);
  });

  it('updates existing effect instead of inserting duplicate', () => {
    addCharacterEffect(ctx, 1n, 'str_buff', 5n, 3n, 'warrior_rally');
    addCharacterEffect(ctx, 1n, 'str_buff', 10n, 5n, 'warrior_rally');
    const effects = ctx.db.character_effect._rows();
    // Should update in place, not add second row
    expect(effects).toHaveLength(1);
    expect(effects[0].magnitude).toBe(10n);
    expect(effects[0].roundsRemaining).toBe(5n);
  });

  it('different source abilities create separate effects', () => {
    addCharacterEffect(ctx, 1n, 'dot', 5n, 3n, 'poison');
    addCharacterEffect(ctx, 1n, 'dot', 8n, 2n, 'burn');
    const effects = ctx.db.character_effect._rows();
    expect(effects).toHaveLength(2);
  });
});

// ============================================================================
// hasShieldEquipped (needs mock DB)
// ============================================================================

describe('hasShieldEquipped', () => {
  it('returns true when shield in offHand', () => {
    const ctx = createMockCtx({
      seed: {
        item_instance: [{ id: 1n, ownerId: 1n, templateId: 10n, equippedSlot: 'offHand' }],
        item_template: [{ id: 10n, name: 'Wooden Shield', armorType: 'shield' }],
      },
    });
    expect(hasShieldEquipped(ctx, 1n)).toBe(true);
  });

  it('returns false when no offHand item', () => {
    const ctx = createMockCtx({
      seed: {
        item_instance: [{ id: 1n, ownerId: 1n, templateId: 10n, equippedSlot: 'mainHand' }],
        item_template: [{ id: 10n, name: 'Iron Sword', armorType: 'weapon' }],
      },
    });
    expect(hasShieldEquipped(ctx, 1n)).toBe(false);
  });

  it('returns false for offHand that is not a shield', () => {
    const ctx = createMockCtx({
      seed: {
        item_instance: [{ id: 1n, ownerId: 1n, templateId: 10n, equippedSlot: 'offHand' }],
        item_template: [{ id: 10n, name: 'Iron Dagger', armorType: 'weapon' }],
      },
    });
    expect(hasShieldEquipped(ctx, 1n)).toBe(false);
  });
});

// ============================================================================
// abilityCooldownMicros / abilityCastMicros (needs mock DB)
// ============================================================================

describe('abilityCooldownMicros', () => {
  it('returns GCD when ability has no cooldown', () => {
    const ctx = createMockCtx({
      seed: {
        ability_template: [{ id: 1n, cooldownSeconds: 0n }],
      },
    });
    // GLOBAL_COOLDOWN_MICROS = 1_500_000
    expect(abilityCooldownMicros(ctx, 1n)).toBe(1_500_000n);
  });

  it('returns ability cooldown when longer than GCD', () => {
    const ctx = createMockCtx({
      seed: {
        ability_template: [{ id: 1n, cooldownSeconds: 5n }],
      },
    });
    expect(abilityCooldownMicros(ctx, 1n)).toBe(5_000_000n);
  });

  it('returns GCD when ability not found', () => {
    const ctx = createMockCtx({ seed: { ability_template: [] } });
    expect(abilityCooldownMicros(ctx, 999n)).toBe(1_500_000n);
  });
});

describe('abilityCastMicros', () => {
  it('returns cast time in micros', () => {
    const ctx = createMockCtx({
      seed: {
        ability_template: [{ id: 1n, castSeconds: 3n }],
      },
    });
    expect(abilityCastMicros(ctx, 1n)).toBe(3_000_000n);
  });

  it('returns 0 for instant cast', () => {
    const ctx = createMockCtx({
      seed: {
        ability_template: [{ id: 1n, castSeconds: 0n }],
      },
    });
    expect(abilityCastMicros(ctx, 1n)).toBe(0n);
  });
});

// ============================================================================
// sumCharacterEffect (needs mock DB)
// ============================================================================

describe('sumCharacterEffect', () => {
  it('sums magnitudes of matching effect type', () => {
    const ctx = createMockCtx({
      seed: {
        character_effect: [
          { id: 1n, characterId: 1n, effectType: 'str_buff', magnitude: 5n },
          { id: 2n, characterId: 1n, effectType: 'str_buff', magnitude: 3n },
          { id: 3n, characterId: 1n, effectType: 'dex_buff', magnitude: 10n },
        ],
      },
    });
    expect(sumCharacterEffect(ctx, 1n, 'str_buff')).toBe(8n);
    expect(sumCharacterEffect(ctx, 1n, 'dex_buff')).toBe(10n);
  });

  it('returns 0 for no matching effects', () => {
    const ctx = createMockCtx({
      seed: { character_effect: [] },
    });
    expect(sumCharacterEffect(ctx, 1n, 'str_buff')).toBe(0n);
  });
});

// ============================================================================
// Integration Flow: Attack with Crit + DoT
// ============================================================================

describe('combat flow: attack with crit + DoT', () => {
  it('crit hit applies multiplied damage and DoT effect is insertable', () => {
    // Set up a scenario: character attacks, seed triggers crit
    // Step 1: Roll outcome as crit
    const outcome = rollAttackOutcome(200n, {
      canBlock: false,
      canParry: false,
      canDodge: false,
      characterDex: 450n, // high DEX = 50% crit
      weaponName: 'Iron Axe',
      weaponType: 'axe',
    });
    expect(outcome.outcome).toBe('crit');
    expect(outcome.multiplier).toBe(200n); // axe crit = 2.0x

    // Step 2: Calculate ability damage from weapon with crit multiplier
    const baseDamage = abilityDamageFromWeapon(50n, outcome.multiplier, 0n);
    expect(baseDamage).toBe(100n); // 50 * 200 / 100 = 100

    // Step 3: Apply DoT effect to target
    const ctx = createMockCtx({
      seed: {
        character: [{
          id: 2n, ownerUserId: 200n, hp: 200n, maxHp: 200n,
        }],
        character_effect: [],
      },
    });
    addCharacterEffect(ctx, 2n, 'dot', 15n, 3n, 'poison_strike');
    const effects = ctx.db.character_effect._rows();
    expect(effects).toHaveLength(1);
    expect(effects[0].effectType).toBe('dot');

    // DoT first tick applied
    const target = ctx.db.character.id.find(2n);
    expect(target.hp).toBe(185n); // 200 - 15
  });
});

// ============================================================================
// Integration Flow: Healing + HoT
// ============================================================================

describe('combat flow: healing + HoT', () => {
  it('healer applies direct heal and HoT effect', () => {
    const ctx = createMockCtx({
      seed: {
        character: [{
          id: 1n, ownerUserId: 100n, hp: 50n, maxHp: 100n,
        }],
        character_effect: [],
      },
    });

    // Step 1: Direct heal -- simulate applying calculateHealingPower result
    // (tested in combat_scaling.test.ts, just use the value here)
    const healAmount = 30n;
    const char = ctx.db.character.id.find(1n);
    ctx.db.character.id.update({ ...char, hp: char.hp + healAmount });
    expect(ctx.db.character.id.find(1n).hp).toBe(80n);

    // Step 2: Apply HoT effect
    addCharacterEffect(ctx, 1n, 'regen', 10n, 5n, 'cleric_mend');
    const effects = ctx.db.character_effect._rows();
    expect(effects).toHaveLength(1);
    expect(effects[0].effectType).toBe('regen');
    expect(effects[0].roundsRemaining).toBe(5n);

    // First HoT tick applied: 80 + 10 = 90
    const healed = ctx.db.character.id.find(1n);
    expect(healed.hp).toBe(90n);
  });
});

// ============================================================================
// Integration Flow: Block + Reduced Damage
// ============================================================================

describe('combat flow: block reduces incoming damage', () => {
  it('blocked attack applies reduced damage via multiplier', () => {
    // Step 1: Roll a block outcome
    const outcome = rollAttackOutcome(50n, {
      canBlock: true,
      canParry: false,
      canDodge: false,
      blockChanceBasis: 200n,      // 20% on 1000-scale
      blockMitigationPercent: 40n,  // 40% mitigation
    });
    expect(outcome.outcome).toBe('block');
    expect(outcome.multiplier).toBe(60n); // 100 - 40 = 60% damage taken

    // Step 2: Apply the multiplier to base damage
    const baseDamage = 100n;
    const mitigated = (baseDamage * outcome.multiplier) / 100n;
    expect(mitigated).toBe(60n);
  });
});
