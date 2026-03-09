import { describe, it, expect, vi } from 'vitest';

// Mock spacetimedb/server for SenderError
vi.mock('spacetimedb/server', () => ({
  SenderError: class extends Error { constructor(msg: string) { super(msg); } },
}));

// Mock external data dependencies used by items.ts
vi.mock('../data/class_stats', () => ({
  normalizeClassName: (name: string) => name.toLowerCase(),
}));

vi.mock('../data/combat_scaling', () => ({
  getWeaponSpeed: (type: string) => {
    const speeds: Record<string, bigint> = {
      dagger: 3_000_000n, rapier: 3_000_000n,
      sword: 3_500_000n, blade: 3_500_000n, mace: 3_500_000n,
      axe: 4_000_000n, staff: 5_000_000n, bow: 5_000_000n, greatsword: 5_000_000n,
    };
    return speeds[type] ?? 4_000_000n;
  },
}));

vi.mock('../data/combat_constants', () => ({
  DEFAULT_WEAPON_SPEED_MICROS: 4_000_000n,
  TWO_HANDED_WEAPON_TYPES: new Set(['staff', 'bow', 'greatsword']),
}));

vi.mock('../data/item_defs', () => ({
  STARTER_WEAPON_DEFS: {},
}));

vi.mock('../data/affix_catalog', () => ({
  PREFIXES: [
    {
      key: 'fierce', name: 'Fierce', type: 'prefix',
      slots: ['mainHand', 'offHand', 'chest', 'legs'],
      statKey: 'strBonus', minTier: 1, magnitudeByTier: [1n, 2n, 3n, 4n],
    },
    {
      key: 'arcane', name: 'Arcane', type: 'prefix',
      slots: ['mainHand', 'offHand', 'chest'],
      statKey: 'intBonus', minTier: 1, magnitudeByTier: [1n, 2n, 3n, 4n],
    },
  ],
  SUFFIXES: [
    {
      key: 'of_might', name: 'of Might', type: 'suffix',
      slots: ['mainHand', 'offHand', 'chest', 'legs'],
      statKey: 'hpBonus', minTier: 1, magnitudeByTier: [2n, 4n, 6n, 8n],
    },
  ],
  AFFIX_COUNT_BY_QUALITY: {
    common: 0,
    uncommon: 1,
    rare: 2,
    epic: 3,
    legendary: 4,
  },
}));

import { createMockCtx } from './test-utils';
import {
  isTwoHandedWeapon,
  getWorldTier,
  getMaxTierForLevel,
  rollQualityTier,
  rollQualityForDrop,
  generateAffixData,
  buildDisplayName,
  getEquippedBonuses,
  getEquippedWeaponStats,
  findItemTemplateByName,
  getItemCount,
  addItemToInventory,
  getInventorySlotCount,
  hasInventorySpace,
  removeItemFromInventory,
  MAX_INVENTORY_SLOTS,
  EQUIPMENT_SLOTS,
  TIER_RARITY_WEIGHTS,
  TIER_QUALITY_WEIGHTS,
} from './items';

// ─── Helper: build a basic item template row ───
function makeTemplate(overrides: Record<string, any> = {}) {
  return {
    id: 1n,
    name: 'Iron Sword',
    slot: 'mainHand',
    stackable: false,
    rarity: 'common',
    weaponType: 'sword',
    weaponBaseDamage: 5n,
    weaponDps: 2n,
    strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n,
    hpBonus: 0n, manaBonus: 0n, armorClassBonus: 0n, magicResistanceBonus: 0n,
    vendorValue: 10n,
    description: 'A standard sword.',
    ...overrides,
  };
}

function makeInstance(overrides: Record<string, any> = {}) {
  // Note: ownerId is the field the mock by_owner index uses,
  // ownerCharacterId is what the production code writes/reads.
  // We include both so both the mock index and the production insert path work.
  const charId = overrides.ownerCharacterId ?? overrides.ownerId ?? 10n;
  return {
    id: 100n,
    templateId: 1n,
    ownerId: charId,
    ownerCharacterId: charId,
    equippedSlot: undefined as string | undefined,
    quantity: 1n,
    ...overrides,
    // Ensure ownerId always matches ownerCharacterId for mock index
    ...(overrides.ownerCharacterId ? { ownerId: overrides.ownerCharacterId } : {}),
  };
}

// ═══════════════════════════════════════════════════════════════
//  Part 1: Inventory Helpers (TEST-03)
// ═══════════════════════════════════════════════════════════════

describe('addItemToInventory', () => {
  it('inserts new item_instance for non-stackable items', () => {
    const ctx = createMockCtx({
      seed: {
        item_template: [makeTemplate({ id: 1n, stackable: false })],
        item_instance: [],
      },
    });
    addItemToInventory(ctx, 10n, 1n, 1n);
    const rows = ctx.db.item_instance._rows();
    expect(rows.length).toBe(1);
    expect(rows[0].templateId).toBe(1n);
    expect(rows[0].ownerCharacterId).toBe(10n);
  });

  it('stacks quantity for stackable items with existing stack', () => {
    const existing = makeInstance({ id: 50n, templateId: 2n, ownerCharacterId: 10n, quantity: 3n });
    const ctx = createMockCtx({
      seed: {
        item_template: [makeTemplate({ id: 2n, stackable: true, name: 'Herb' })],
        item_instance: [existing],
      },
    });
    addItemToInventory(ctx, 10n, 2n, 5n);
    const rows = ctx.db.item_instance._rows();
    // Should update existing row, not insert new
    expect(rows.length).toBe(1);
    expect(rows[0].quantity).toBe(8n);
  });

  it('creates new row for stackable item when no existing stack found', () => {
    const ctx = createMockCtx({
      seed: {
        item_template: [makeTemplate({ id: 3n, stackable: true, name: 'Ore' })],
        item_instance: [],
      },
    });
    addItemToInventory(ctx, 10n, 3n, 2n);
    const rows = ctx.db.item_instance._rows();
    expect(rows.length).toBe(1);
    expect(rows[0].quantity).toBe(2n);
  });

  it('throws when template not found', () => {
    const ctx = createMockCtx({ seed: { item_template: [], item_instance: [] } });
    expect(() => addItemToInventory(ctx, 10n, 999n, 1n)).toThrow('Item template missing');
  });

  it('does not stack equipped items of same template', () => {
    const equipped = makeInstance({ id: 50n, templateId: 4n, ownerCharacterId: 10n, quantity: 1n, equippedSlot: 'mainHand' });
    const ctx = createMockCtx({
      seed: {
        item_template: [makeTemplate({ id: 4n, stackable: true, name: 'Stackable Weapon' })],
        item_instance: [equipped],
      },
    });
    addItemToInventory(ctx, 10n, 4n, 1n);
    const rows = ctx.db.item_instance._rows();
    // Should insert new row, not update equipped item
    expect(rows.length).toBe(2);
  });
});

describe('removeItemFromInventory', () => {
  it('reduces quantity for stackable items', () => {
    const ctx = createMockCtx({
      seed: {
        item_instance: [makeInstance({ id: 50n, templateId: 1n, ownerCharacterId: 10n, quantity: 5n })],
      },
    });
    removeItemFromInventory(ctx, 10n, 1n, 2n);
    const rows = ctx.db.item_instance._rows();
    expect(rows.length).toBe(1);
    expect(rows[0].quantity).toBe(3n);
  });

  it('deletes row when quantity reaches 0', () => {
    const ctx = createMockCtx({
      seed: {
        item_instance: [makeInstance({ id: 50n, templateId: 1n, ownerCharacterId: 10n, quantity: 3n })],
      },
    });
    removeItemFromInventory(ctx, 10n, 1n, 3n);
    const rows = ctx.db.item_instance._rows();
    expect(rows.length).toBe(0);
  });

  it('removes non-stackable item entirely (quantity 1)', () => {
    const ctx = createMockCtx({
      seed: {
        item_instance: [makeInstance({ id: 50n, templateId: 1n, ownerCharacterId: 10n, quantity: 1n })],
      },
    });
    removeItemFromInventory(ctx, 10n, 1n, 1n);
    const rows = ctx.db.item_instance._rows();
    expect(rows.length).toBe(0);
  });

  it('throws when not enough materials', () => {
    const ctx = createMockCtx({
      seed: {
        item_instance: [makeInstance({ id: 50n, templateId: 1n, ownerCharacterId: 10n, quantity: 1n })],
      },
    });
    expect(() => removeItemFromInventory(ctx, 10n, 1n, 5n)).toThrow('Not enough materials');
  });

  it('skips equipped items when removing', () => {
    const ctx = createMockCtx({
      seed: {
        item_instance: [
          makeInstance({ id: 50n, templateId: 1n, ownerCharacterId: 10n, quantity: 1n, equippedSlot: 'mainHand' }),
        ],
      },
    });
    expect(() => removeItemFromInventory(ctx, 10n, 1n, 1n)).toThrow('Not enough materials');
  });
});

describe('getEquippedBonuses', () => {
  it('sums stat bonuses from all equipped items', () => {
    const template1 = makeTemplate({ id: 1n, strBonus: 3n, dexBonus: 1n, armorClassBonus: 5n });
    const template2 = makeTemplate({ id: 2n, name: 'Shield', strBonus: 1n, hpBonus: 10n, armorClassBonus: 3n });
    const ctx = createMockCtx({
      seed: {
        item_template: [template1, template2],
        item_instance: [
          makeInstance({ id: 100n, templateId: 1n, ownerCharacterId: 10n, equippedSlot: 'mainHand' }),
          makeInstance({ id: 101n, templateId: 2n, ownerCharacterId: 10n, equippedSlot: 'offHand' }),
        ],
        item_affix: [],
      },
    });
    const bonuses = getEquippedBonuses(ctx, 10n);
    expect(bonuses.str).toBe(4n);
    expect(bonuses.dex).toBe(1n);
    expect(bonuses.armorClassBonus).toBe(8n);
    expect(bonuses.hpBonus).toBe(10n);
  });

  it('includes affix bonuses from item_affix table', () => {
    const template = makeTemplate({ id: 1n, strBonus: 2n });
    const ctx = createMockCtx({
      seed: {
        item_template: [template],
        item_instance: [
          makeInstance({ id: 100n, templateId: 1n, ownerCharacterId: 10n, equippedSlot: 'mainHand' }),
        ],
        item_affix: [
          { id: 1n, instanceId: 100n, statKey: 'strBonus', magnitude: 3n, affixKey: 'fierce', affixType: 'prefix', affixName: 'Fierce' },
          { id: 2n, instanceId: 100n, statKey: 'hpBonus', magnitude: 5n, affixKey: 'of_might', affixType: 'suffix', affixName: 'of Might' },
        ],
      },
    });
    const bonuses = getEquippedBonuses(ctx, 10n);
    expect(bonuses.str).toBe(5n); // 2 template + 3 affix
    expect(bonuses.hpBonus).toBe(5n);
  });

  it('returns zero bonuses when nothing equipped', () => {
    const ctx = createMockCtx({
      seed: {
        item_template: [],
        item_instance: [],
        item_affix: [],
      },
    });
    const bonuses = getEquippedBonuses(ctx, 10n);
    expect(bonuses.str).toBe(0n);
    expect(bonuses.dex).toBe(0n);
    expect(bonuses.hpBonus).toBe(0n);
    expect(bonuses.armorClassBonus).toBe(0n);
  });

  it('ignores unequipped items', () => {
    const template = makeTemplate({ id: 1n, strBonus: 5n });
    const ctx = createMockCtx({
      seed: {
        item_template: [template],
        item_instance: [
          makeInstance({ id: 100n, templateId: 1n, ownerCharacterId: 10n, equippedSlot: undefined }),
        ],
        item_affix: [],
      },
    });
    const bonuses = getEquippedBonuses(ctx, 10n);
    expect(bonuses.str).toBe(0n);
  });
});

describe('getEquippedWeaponStats', () => {
  it('returns weapon stats from equipped mainHand weapon', () => {
    const template = makeTemplate({ id: 1n, weaponBaseDamage: 10n, weaponDps: 5n, weaponType: 'sword' });
    const ctx = createMockCtx({
      seed: {
        item_template: [template],
        item_instance: [
          makeInstance({ id: 100n, templateId: 1n, ownerCharacterId: 10n, equippedSlot: 'mainHand' }),
        ],
        item_affix: [],
      },
    });
    const stats = getEquippedWeaponStats(ctx, 10n);
    expect(stats.baseDamage).toBe(10n);
    expect(stats.dps).toBe(5n);
    expect(stats.name).toBe('Iron Sword');
    expect(stats.weaponType).toBe('sword');
  });

  it('includes weapon affix damage bonuses', () => {
    const template = makeTemplate({ id: 1n, weaponBaseDamage: 10n, weaponDps: 5n, weaponType: 'sword' });
    const ctx = createMockCtx({
      seed: {
        item_template: [template],
        item_instance: [
          makeInstance({ id: 100n, templateId: 1n, ownerCharacterId: 10n, equippedSlot: 'mainHand' }),
        ],
        item_affix: [
          { id: 1n, instanceId: 100n, statKey: 'weaponBaseDamage', magnitude: 3n, affixKey: 'keen', affixType: 'prefix', affixName: 'Keen' },
          { id: 2n, instanceId: 100n, statKey: 'weaponDps', magnitude: 2n, affixKey: 'of_speed', affixType: 'suffix', affixName: 'of Speed' },
        ],
      },
    });
    const stats = getEquippedWeaponStats(ctx, 10n);
    expect(stats.baseDamage).toBe(13n); // 10 + 3
    expect(stats.dps).toBe(7n); // 5 + 2
  });

  it('returns defaults when no weapon equipped', () => {
    const ctx = createMockCtx({
      seed: {
        item_template: [],
        item_instance: [],
        item_affix: [],
      },
    });
    const stats = getEquippedWeaponStats(ctx, 10n);
    expect(stats.baseDamage).toBe(0n);
    expect(stats.dps).toBe(0n);
    expect(stats.name).toBe('');
    expect(stats.weaponType).toBe('');
    expect(stats.speed).toBe(4_000_000n);
  });
});

describe('getItemCount', () => {
  it('returns total quantity across all instances of a template', () => {
    const ctx = createMockCtx({
      seed: {
        item_instance: [
          makeInstance({ id: 100n, templateId: 5n, ownerCharacterId: 10n, quantity: 3n }),
          makeInstance({ id: 101n, templateId: 5n, ownerCharacterId: 10n, quantity: 2n }),
        ],
      },
    });
    expect(getItemCount(ctx, 10n, 5n)).toBe(5n);
  });

  it('returns 0n for items not in inventory', () => {
    const ctx = createMockCtx({
      seed: { item_instance: [] },
    });
    expect(getItemCount(ctx, 10n, 999n)).toBe(0n);
  });

  it('excludes equipped items from count', () => {
    const ctx = createMockCtx({
      seed: {
        item_instance: [
          makeInstance({ id: 100n, templateId: 5n, ownerCharacterId: 10n, quantity: 1n, equippedSlot: 'mainHand' }),
          makeInstance({ id: 101n, templateId: 5n, ownerCharacterId: 10n, quantity: 2n }),
        ],
      },
    });
    expect(getItemCount(ctx, 10n, 5n)).toBe(2n);
  });
});

describe('hasInventorySpace', () => {
  it('returns true when under MAX_INVENTORY_SLOTS', () => {
    const ctx = createMockCtx({
      seed: {
        item_template: [makeTemplate({ id: 1n, stackable: false })],
        item_instance: [
          makeInstance({ id: 100n, templateId: 1n, ownerCharacterId: 10n }),
        ],
      },
    });
    expect(hasInventorySpace(ctx, 10n, 1n)).toBe(true);
  });

  it('returns true when item is stackable and existing stack found', () => {
    // Fill inventory to max with unique templates, then add stackable matching existing
    const instances = Array.from({ length: MAX_INVENTORY_SLOTS }, (_, i) =>
      makeInstance({ id: BigInt(100 + i), templateId: BigInt(i + 1), ownerCharacterId: 10n })
    );
    const templates = Array.from({ length: MAX_INVENTORY_SLOTS }, (_, i) =>
      makeTemplate({ id: BigInt(i + 1), name: `Item ${i}`, stackable: i === 0 })
    );
    const ctx = createMockCtx({
      seed: {
        item_template: templates,
        item_instance: instances,
      },
    });
    // Template 1 is stackable and already exists — should have space
    expect(hasInventorySpace(ctx, 10n, 1n)).toBe(true);
  });

  it('returns false when at slot limit with non-stackable item', () => {
    const instances = Array.from({ length: MAX_INVENTORY_SLOTS }, (_, i) =>
      makeInstance({ id: BigInt(100 + i), templateId: BigInt(i + 1), ownerCharacterId: 10n })
    );
    const templates = Array.from({ length: MAX_INVENTORY_SLOTS + 1 }, (_, i) =>
      makeTemplate({ id: BigInt(i + 1), name: `Item ${i}`, stackable: false })
    );
    const ctx = createMockCtx({
      seed: {
        item_template: templates,
        item_instance: instances,
      },
    });
    // Template 51 is non-stackable and inventory is full
    expect(hasInventorySpace(ctx, 10n, BigInt(MAX_INVENTORY_SLOTS + 1))).toBe(false);
  });

  it('returns false when template not found', () => {
    const ctx = createMockCtx({
      seed: { item_template: [], item_instance: [] },
    });
    expect(hasInventorySpace(ctx, 10n, 999n)).toBe(false);
  });
});

describe('getInventorySlotCount', () => {
  it('counts unique unequipped item_instance rows for character', () => {
    const ctx = createMockCtx({
      seed: {
        item_instance: [
          makeInstance({ id: 100n, templateId: 1n, ownerCharacterId: 10n }),
          makeInstance({ id: 101n, templateId: 2n, ownerCharacterId: 10n }),
          makeInstance({ id: 102n, templateId: 3n, ownerCharacterId: 10n, equippedSlot: 'chest' }),
        ],
      },
    });
    expect(getInventorySlotCount(ctx, 10n)).toBe(2);
  });

  it('returns 0 when no items', () => {
    const ctx = createMockCtx({
      seed: { item_instance: [] },
    });
    expect(getInventorySlotCount(ctx, 10n)).toBe(0);
  });
});

describe('findItemTemplateByName', () => {
  it('finds template by case-insensitive name match', () => {
    const ctx = createMockCtx({
      seed: {
        item_template: [
          makeTemplate({ id: 1n, name: 'Iron Sword' }),
          makeTemplate({ id: 2n, name: 'Steel Shield' }),
        ],
      },
    });
    const result = findItemTemplateByName(ctx, 'iron sword');
    expect(result).not.toBeNull();
    expect(result!.id).toBe(1n);
  });

  it('returns null for unknown name', () => {
    const ctx = createMockCtx({
      seed: {
        item_template: [makeTemplate({ id: 1n, name: 'Iron Sword' })],
      },
    });
    const result = findItemTemplateByName(ctx, 'Mythril Staff');
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
//  Part 2: Equipment Generation (TEST-05)
// ═══════════════════════════════════════════════════════════════

describe('getWorldTier', () => {
  it('maps level 1-10 to tier 1', () => {
    expect(getWorldTier(1n)).toBe(1);
    expect(getWorldTier(10n)).toBe(1);
  });

  it('maps level 11-20 to tier 2', () => {
    expect(getWorldTier(11n)).toBe(2);
    expect(getWorldTier(20n)).toBe(2);
  });

  it('maps level 21-30 to tier 3', () => {
    expect(getWorldTier(21n)).toBe(3);
    expect(getWorldTier(30n)).toBe(3);
  });

  it('maps level 31-40 to tier 4', () => {
    expect(getWorldTier(31n)).toBe(4);
    expect(getWorldTier(40n)).toBe(4);
  });

  it('maps level 41+ to tier 5', () => {
    expect(getWorldTier(41n)).toBe(5);
    expect(getWorldTier(50n)).toBe(5);
  });
});

describe('getMaxTierForLevel', () => {
  it('is an alias for getWorldTier', () => {
    expect(getMaxTierForLevel(5n)).toBe(getWorldTier(5n));
    expect(getMaxTierForLevel(25n)).toBe(getWorldTier(25n));
    expect(getMaxTierForLevel(45n)).toBe(getWorldTier(45n));
  });
});

describe('rollQualityTier', () => {
  const VALID_RARITIES = ['common', 'uncommon', 'rare', 'epic'];

  it('returns a valid rarity string', () => {
    for (let seed = 0n; seed < 100n; seed++) {
      const result = rollQualityTier(15n, seed);
      expect(VALID_RARITIES).toContain(result);
    }
  });

  it('T1 without danger returns common or uncommon only via standard path', () => {
    // Without dangerMultiplier, T1 uses standard path (not level-scaled)
    for (let seed = 0n; seed < 100n; seed++) {
      const result = rollQualityTier(5n, seed);
      // T1 weights: [95, 5, 0, 0] — only common and uncommon
      expect(['common', 'uncommon']).toContain(result);
    }
  });

  it('T1 with danger uses level-scaled uncommon chance', () => {
    // With dangerMultiplier, T1 uses special path
    const result = rollQualityTier(5n, 0n, 100n);
    expect(['common', 'uncommon']).toContain(result);
  });

  it('higher tier levels can produce rare and epic', () => {
    // T5 weights: [10, 20, 40, 30] — all rarities possible
    const results = new Set<string>();
    for (let seed = 0n; seed < 200n; seed++) {
      results.add(rollQualityTier(45n, seed));
    }
    expect(results.size).toBeGreaterThan(1); // Should produce variety
  });

  it('different seeds produce potentially different results', () => {
    const results = new Set<string>();
    for (let seed = 0n; seed < 100n; seed++) {
      results.add(rollQualityTier(25n, seed));
    }
    // T3 has varied weights, should produce multiple rarities
    expect(results.size).toBeGreaterThan(1);
  });
});

describe('rollQualityForDrop', () => {
  const VALID_QUALITIES = ['standard', 'reinforced', 'exquisite'];

  it('returns a valid quality string', () => {
    for (let seed = 0n; seed < 100n; seed++) {
      const result = rollQualityForDrop(15n, seed);
      expect(VALID_QUALITIES).toContain(result);
    }
  });

  it('T1 only produces standard quality', () => {
    // T1 weights: [100, 0, 0] — standard only
    for (let seed = 0n; seed < 100n; seed++) {
      expect(rollQualityForDrop(5n, seed)).toBe('standard');
    }
  });

  it('higher tiers can produce reinforced and exquisite', () => {
    const results = new Set<string>();
    for (let seed = 0n; seed < 200n; seed++) {
      results.add(rollQualityForDrop(45n, seed));
    }
    expect(results.size).toBeGreaterThan(1);
  });

  it('different seeds produce potentially different results', () => {
    const results = new Set<string>();
    for (let seed = 0n; seed < 100n; seed++) {
      results.add(rollQualityForDrop(25n, seed));
    }
    expect(results.size).toBeGreaterThan(1);
  });
});

describe('generateAffixData', () => {
  it('returns empty array for common quality', () => {
    const result = generateAffixData('mainHand', 'common', 42n);
    expect(result).toEqual([]);
  });

  it('returns 1 affix for uncommon quality', () => {
    const result = generateAffixData('mainHand', 'uncommon', 42n);
    expect(result.length).toBe(1);
    expect(result[0].affixType).toBe('prefix');
    expect(result[0].affixName).toBeDefined();
    expect(result[0].statKey).toBeDefined();
  });

  it('returns 2 affixes for rare quality', () => {
    const result = generateAffixData('mainHand', 'rare', 42n);
    expect(result.length).toBe(2);
    // Should have prefix and suffix
    const types = result.map(a => a.affixType);
    expect(types).toContain('prefix');
    expect(types).toContain('suffix');
  });

  it('each affix has required fields', () => {
    const result = generateAffixData('mainHand', 'epic', 42n);
    for (const affix of result) {
      expect(affix).toHaveProperty('affixKey');
      expect(affix).toHaveProperty('affixType');
      expect(affix).toHaveProperty('magnitude');
      expect(affix).toHaveProperty('statKey');
      expect(affix).toHaveProperty('affixName');
    }
  });

  it('rare items have capped total magnitude', () => {
    const result = generateAffixData('mainHand', 'rare', 42n);
    const totalMagnitude = result.reduce((sum, a) => sum + a.magnitude, 0n);
    expect(totalMagnitude).toBeLessThanOrEqual(4n);
  });
});

describe('buildDisplayName', () => {
  it('returns base name when no affixes', () => {
    expect(buildDisplayName('Iron Sword', [])).toBe('Iron Sword');
  });

  it('prepends prefix to base name', () => {
    const result = buildDisplayName('Iron Sword', [
      { affixType: 'prefix', affixName: 'Fierce' },
    ]);
    expect(result).toBe('Fierce Iron Sword');
  });

  it('appends suffix to base name', () => {
    const result = buildDisplayName('Iron Sword', [
      { affixType: 'suffix', affixName: 'of Might' },
    ]);
    expect(result).toBe('Iron Sword of Might');
  });

  it('combines prefix + base + suffix correctly', () => {
    const result = buildDisplayName('Iron Sword', [
      { affixType: 'prefix', affixName: 'Fierce' },
      { affixType: 'suffix', affixName: 'of Might' },
    ]);
    expect(result).toBe('Fierce Iron Sword of Might');
  });
});

describe('isTwoHandedWeapon', () => {
  it('returns true for two-handed weapon types', () => {
    expect(isTwoHandedWeapon('staff')).toBe(true);
    expect(isTwoHandedWeapon('bow')).toBe(true);
    expect(isTwoHandedWeapon('greatsword')).toBe(true);
  });

  it('returns false for one-handed types', () => {
    expect(isTwoHandedWeapon('sword')).toBe(false);
    expect(isTwoHandedWeapon('dagger')).toBe(false);
    expect(isTwoHandedWeapon('mace')).toBe(false);
    expect(isTwoHandedWeapon('axe')).toBe(false);
  });

  it('returns false for unknown types', () => {
    expect(isTwoHandedWeapon('nunchucks')).toBe(false);
  });
});

describe('EQUIPMENT_SLOTS', () => {
  it('contains all expected equipment slots', () => {
    const expected = ['head', 'chest', 'wrists', 'hands', 'belt', 'legs', 'boots', 'earrings', 'neck', 'cloak', 'mainHand', 'offHand'];
    for (const slot of expected) {
      expect(EQUIPMENT_SLOTS.has(slot)).toBe(true);
    }
  });
});

describe('TIER_RARITY_WEIGHTS', () => {
  it('has entries for tiers 1-5', () => {
    for (let tier = 1; tier <= 5; tier++) {
      expect(TIER_RARITY_WEIGHTS[tier]).toBeDefined();
      expect(TIER_RARITY_WEIGHTS[tier].length).toBe(4);
    }
  });

  it('weights sum to 100 for each tier', () => {
    for (let tier = 1; tier <= 5; tier++) {
      const sum = TIER_RARITY_WEIGHTS[tier].reduce((a, b) => a + b, 0);
      expect(sum).toBe(100);
    }
  });
});

describe('TIER_QUALITY_WEIGHTS', () => {
  it('has entries for tiers 1-5', () => {
    for (let tier = 1; tier <= 5; tier++) {
      expect(TIER_QUALITY_WEIGHTS[tier]).toBeDefined();
      expect(TIER_QUALITY_WEIGHTS[tier].length).toBe(3);
    }
  });

  it('weights sum to 100 for each tier', () => {
    for (let tier = 1; tier <= 5; tier++) {
      const sum = TIER_QUALITY_WEIGHTS[tier].reduce((a, b) => a + b, 0);
      expect(sum).toBe(100);
    }
  });
});
