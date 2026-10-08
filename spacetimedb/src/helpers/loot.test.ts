/**
 * Phase 51.3 Plan 05: the victory loot helpers (helpers/loot.ts) on the strict mock db under the
 * recording schema. Each test seeds item templates, economy rows and named_enemy rows and checks one
 * behavior of the per-enemy roll: which pool a pick comes from, the dials, the rarity rule (legendary
 * only from a boss or a fight-exact named foe), the jewelry floor, gold and the scroll drop.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createMockCtx } from './test-utils';
import {
  DEFAULT_DIALS,
  ROLL_INDEX,
  SCROLL_DROP_BASE_PCT,
  creatureProfile,
  goldReward,
  lootSeed,
  rollBelow,
  scaledChancePct,
} from '../data/economy_rules';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

let loot: typeof import('./loot');

beforeAll(async () => {
  await import('../schema/tables');
  loot = await import('./loot');
}, 120_000);

const T0 = 1_700_000_000_000_000n;
type Seed = Record<string, any[]>;

const ctxFor = (seed: Seed, ts: bigint = T0) =>
  createMockCtx({ seed, strict: true, timestampMicros: ts } as any);

/** Point the ctx at another server time (every roll seed reads ctx.timestamp). */
const at = (ctx: any, ts: bigint) => {
  ctx.timestamp = { microsSinceUnixEpoch: ts };
  return ctx;
};

const item = (id: bigint, name: string, extra: Record<string, any> = {}) => ({
  id,
  name,
  slot: 'resource',
  rarity: 'common',
  armorClassBonus: 0n,
  requiredLevel: 1n,
  tier: 1n,
  isJunk: false,
  ...extra,
});

const JUNK_IDS = [100n, 101n];
const ROUGH_HIDE = 110n;
const SWORD_L1 = 200n;
const AMULET_L1 = 201n;
const BLADE_L45 = 210n;
const TRAINING_SWORD = 220n;

const ITEMS = {
  junk: [
    item(100n, 'Rat Tail', { slot: 'junk', isJunk: true }),
    item(101n, 'Torn Pelt', { slot: 'junk', isJunk: true }),
  ],
  hide: item(ROUGH_HIDE, 'Rough Hide', { slot: 'material' }),
  sword: item(SWORD_L1, 'Iron Sword', { slot: 'mainHand', requiredLevel: 1n }),
  amulet: item(AMULET_L1, 'Plain Amulet', { slot: 'neck', requiredLevel: 1n, armorClassBonus: 0n }),
  blade45: item(BLADE_L45, 'Ancient Blade', { slot: 'mainHand', requiredLevel: 45n }),
  training: item(TRAINING_SWORD, 'Training Sword', { slot: 'mainHand', requiredLevel: 1n }),
};

const BEAST = { id: 1n, name: 'Cave Rat', level: 1n, creatureType: 'beast', isBoss: false };
const HIGH = { id: 2n, name: 'Ash Wyrm', level: 45n, creatureType: 'beast', isBoss: false };

const COMBAT = { id: 1n, locationId: 10n, createdAt: { microsSinceUnixEpoch: T0 } };
const PARTICIPANTS = [{ id: 1n, combatId: 1n, characterId: 1n }];

function world(extra: Seed = {}): Seed {
  const seed: Seed = {
    region: [{ id: 1n, name: 'Ashen Reach', dangerMultiplier: 100n }],
    location: [{ id: 10n, name: 'The Crossing', regionId: 1n }],
    enemy_template: [BEAST, HIGH],
    item_template: [...ITEMS.junk, ITEMS.hide, ITEMS.sword, ITEMS.amulet, ITEMS.blade45, ITEMS.training],
  };
  for (const [table, rowsToAdd] of Object.entries(extra)) seed[table] = [...(seed[table] ?? []), ...rowsToAdd];
  return seed;
}

const dialsRow = (patch: Record<string, unknown>) => ({ id: 1n, ...DEFAULT_DIALS, ...patch });

/** Every roll of one enemy across `n` server times. */
function rollsOver(ctx: any, lc: any, enemyRow: any, template: any, n: number, characterId = 1n) {
  const out: any[][] = [];
  for (let k = 0; k < n; k += 1) {
    at(ctx, T0 + BigInt(k) * 1_000_003n);
    out.push(loot.rollEnemyLoot(ctx, lc, enemyRow, template, characterId));
  }
  return out;
}

const commons = (items: any[]) => items.filter((i) => i.kind === 'common');
const gears = (items: any[]) => items.filter((i) => i.kind === 'gear');

describe('fightNamedTemplateIds: only a named foe killed in this fight counts', () => {
  it('counts a participant row that died at the fight location at or after the encounter began', () => {
    const named = (id: bigint, extra: Record<string, any>) => ({
      id,
      characterId: 1n,
      name: `Named ${id}`,
      enemyTemplateId: id,
      locationId: 10n,
      isAlive: false,
      lastKilledAt: { microsSinceUnixEpoch: T0 },
      ...extra,
    });
    const ctx = ctxFor(
      world({
        named_enemy: [
          named(5n, {}),
          named(6n, { lastKilledAt: { microsSinceUnixEpoch: T0 - 1n } }),
          named(7n, { locationId: 11n }),
          named(8n, { isAlive: true }),
          named(9n, { characterId: 2n }),
          named(11n, { lastKilledAt: undefined }),
          named(12n, { lastKilledAt: { microsSinceUnixEpoch: T0 + 5n } }),
        ],
      }),
    );
    const ids = loot.fightNamedTemplateIds(ctx, COMBAT, PARTICIPANTS);
    expect([...ids].sort((a, b) => (a < b ? -1 : 1))).toEqual([5n, 12n]);
  });

  it('a combat without createdAt counts nothing', () => {
    const ctx = ctxFor(
      world({
        named_enemy: [
          { id: 1n, characterId: 1n, name: 'N', enemyTemplateId: 5n, locationId: 10n, isAlive: false, lastKilledAt: { microsSinceUnixEpoch: T0 } },
        ],
      }),
    );
    expect(loot.fightNamedTemplateIds(ctx, { id: 1n, locationId: 10n }, PARTICIPANTS).size).toBe(0);
  });
});

describe('lootLevelOf: the one place loot reads an enemy level', () => {
  it('returns the template level when the row has no spawn level', () => {
    const ctx = ctxFor(world());
    expect(loot.lootLevelOf(ctx, { id: 1n }, BEAST)).toBe(1n);
    expect(loot.lootLevelOf(ctx, { id: 1n, level: 0n }, HIGH)).toBe(45n);
  });

  it('reads the spawn level of the combat_enemy row when one is set (quick 261008-ag8)', () => {
    const ctx = ctxFor(world());
    expect(loot.lootLevelOf(ctx, { id: 1n, level: 7n }, BEAST)).toBe(7n);
  });

  it('a template without a level reads as 1', () => {
    const ctx = ctxFor(world());
    expect(loot.lootLevelOf(ctx, { id: 1n }, { id: 3n })).toBe(1n);
  });
});

describe('rollEnemyLoot: the common pool', () => {
  const AI = [
    { id: 1n, enemyTemplateId: 1n, regionId: 1n, itemTemplateId: 300n, role: 'drop', weight: 40n },
    { id: 2n, enemyTemplateId: 1n, regionId: 1n, itemTemplateId: 301n, role: 'trophy', weight: 25n },
    { id: 3n, enemyTemplateId: 1n, regionId: 1n, itemTemplateId: 302n, role: 'gatherable', weight: 15n },
    { id: 4n, enemyTemplateId: 1n, regionId: 1n, itemTemplateId: 303n, role: 'gear', weight: 10n },
  ];
  const aiItems = [
    item(300n, 'Ember Hide', { slot: 'material' }),
    item(301n, 'Charred Fang', { slot: 'junk', isJunk: true }),
    item(302n, 'Ash Reed', { slot: 'material' }),
    item(303n, 'Ember Cleaver', { slot: 'mainHand', requiredLevel: 1n }),
  ];
  const aiEconomy = [
    { itemTemplateId: 300n, regionId: 1n, role: 'drop', slotKey: '', kind: 'hide', rarity: 'common', terrain: '', timeOfDay: '', enemyTemplateId: 1n },
    { itemTemplateId: 301n, regionId: 1n, role: 'trophy', slotKey: '', kind: '', rarity: 'common', terrain: '', timeOfDay: '', enemyTemplateId: 1n },
    { itemTemplateId: 302n, regionId: 1n, role: 'gather', slotKey: 'common', kind: 'wood', rarity: 'common', terrain: 'plains', timeOfDay: 'any', enemyTemplateId: 0n },
    { itemTemplateId: 303n, regionId: 1n, role: 'gear', slotKey: '', kind: '', rarity: 'common', terrain: '', timeOfDay: '', enemyTemplateId: 1n },
  ];

  it('an enemy with AI rows picks its commons only from its non-gear entries', () => {
    const ctx = ctxFor(world({ enemy_loot_entry: AI, item_template: aiItems, economy_item: aiEconomy }));
    const lc = loot.buildVictoryLootContext(ctx, COMBAT, PARTICIPANTS);
    const all = rollsOver(ctx, lc, { id: 1n, level: 0n }, BEAST, 300);
    const picked = new Set(all.flatMap((items) => commons(items).map((i) => i.itemTemplateId)));
    expect(picked.size).toBeGreaterThan(0);
    for (const id of picked) expect([300n, 301n, 302n]).toContain(id);
  });

  it('an enemy with AI rows can also drop its AI gear (not only the fallback gear)', () => {
    const ctx = ctxFor(world({ enemy_loot_entry: AI, item_template: aiItems, economy_item: aiEconomy }));
    const lc = loot.buildVictoryLootContext(ctx, COMBAT, PARTICIPANTS);
    const gearIds = new Set(rollsOver(ctx, lc, { id: 1n }, BEAST, 600).flatMap((items) => gears(items).map((i) => i.itemTemplateId)));
    expect(gearIds.has(303n)).toBe(true);
    for (const id of gearIds) expect([303n, SWORD_L1, AMULET_L1]).toContain(id);
  });

  it('an enemy without rows picks from the fallback pool (junk and matching drop materials)', () => {
    const ctx = ctxFor(world());
    const lc = loot.buildVictoryLootContext(ctx, COMBAT, PARTICIPANTS);
    const picked = new Set(rollsOver(ctx, lc, { id: 1n }, BEAST, 300).flatMap((items) => commons(items).map((i) => i.itemTemplateId)));
    expect(picked.has(ROUGH_HIDE)).toBe(true);
    for (const id of picked) expect([...JUNK_IDS, ROUGH_HIDE]).toContain(id);
  });

  it('an enemy with creatureType empty uses the beast profile', () => {
    const ctx = ctxFor(world());
    const lc = loot.buildVictoryLootContext(ctx, COMBAT, PARTICIPANTS);
    const blank = { ...BEAST, creatureType: '' };
    const picked = new Set(rollsOver(ctx, lc, { id: 1n }, blank, 300).flatMap((items) => commons(items).map((i) => i.itemTemplateId)));
    expect(picked.has(ROUGH_HIDE)).toBe(true);
    at(ctx, T0);
    expect(loot.rollEnemyGold(ctx, lc, { id: 1n }, blank, 1n)).toBe(
      goldReward(creatureProfile('beast'), 1n, lootSeed(T0, 1n, 1n), 100n),
    );
  });

  it('a world with only junk templates still drops a junk item and gold of at least 1', () => {
    const ctx = ctxFor({
      region: [{ id: 1n, name: 'Ashen Reach', dangerMultiplier: 100n }],
      location: [{ id: 10n, name: 'The Crossing', regionId: 1n }],
      enemy_template: [BEAST],
      item_template: ITEMS.junk,
    });
    const lc = loot.buildVictoryLootContext(ctx, COMBAT, PARTICIPANTS);
    for (let k = 0n; k < 50n; k += 1n) {
      at(ctx, T0 + k * 7n);
      const items = loot.rollEnemyLoot(ctx, lc, { id: 1n }, BEAST, 1n);
      expect(commons(items).length).toBe(1);
      expect(JUNK_IDS).toContain(commons(items)[0].itemTemplateId);
      expect(loot.rollEnemyGold(ctx, lc, { id: 1n }, BEAST, 1n)).toBeGreaterThanOrEqual(1n);
    }
  });
});

describe('rollEnemyLoot: the drop-rate dial and pins', () => {
  const AI3 = [
    { id: 1n, enemyTemplateId: 1n, regionId: 1n, itemTemplateId: 300n, role: 'drop', weight: 40n },
    { id: 2n, enemyTemplateId: 1n, regionId: 1n, itemTemplateId: 301n, role: 'trophy', weight: 25n },
    { id: 3n, enemyTemplateId: 1n, regionId: 1n, itemTemplateId: 302n, role: 'gatherable', weight: 15n },
  ];
  const aiItems = [item(300n, 'Ember Hide'), item(301n, 'Charred Fang', { isJunk: true, slot: 'junk' }), item(302n, 'Ash Reed')];

  it('drop rate 0 returns nothing at all', () => {
    const ctx = ctxFor(world({ economy_dials: [dialsRow({ dropRatePct: 0n })] }));
    const lc = loot.buildVictoryLootContext(ctx, COMBAT, PARTICIPANTS);
    for (const items of rollsOver(ctx, lc, { id: 1n }, BEAST, 200)) expect(items).toEqual([]);
  });

  it('drop rate 300 makes 3 common picks when the pool has 3 entries', () => {
    const ctx = ctxFor(world({ economy_dials: [dialsRow({ dropRatePct: 300n })], enemy_loot_entry: AI3, item_template: aiItems }));
    const lc = loot.buildVictoryLootContext(ctx, COMBAT, PARTICIPANTS);
    for (const items of rollsOver(ctx, lc, { id: 1n }, BEAST, 50)) {
      expect(commons(items).map((i) => i.itemTemplateId).sort()).toEqual([300n, 301n, 302n]);
    }
  });

  // Review CR-01: a pin is exact, so a small weight pinned at 50 still drops (it was floored to 0).
  it('a junk entry pinned at 50 still drops, and less often than unpinned', () => {
    const count = (pins: any[]) => {
      const ctx = ctxFor(world({ economy_item_dial: pins }));
      const lc = loot.buildVictoryLootContext(ctx, COMBAT, PARTICIPANTS);
      return rollsOver(ctx, lc, { id: 1n }, BEAST, 1500).flatMap(commons).filter((i) => i.itemTemplateId === 100n).length;
    };
    const plain = count([]);
    const halved = count([{ itemTemplateId: 100n, dropRatePct: 50n }]);
    expect(halved).toBeGreaterThan(0);
    expect(halved).toBeLessThan(plain);
  });

  it('an item pinned at 0 is never picked', () => {
    const ctx = ctxFor(
      world({
        enemy_loot_entry: AI3,
        item_template: aiItems,
        economy_item_dial: [{ itemTemplateId: 300n, dropRatePct: 0n }],
      }),
    );
    const lc = loot.buildVictoryLootContext(ctx, COMBAT, PARTICIPANTS);
    const picked = new Set(rollsOver(ctx, lc, { id: 1n }, BEAST, 400).flatMap((items) => commons(items).map((i) => i.itemTemplateId)));
    expect(picked.has(300n)).toBe(false);
    expect(picked.size).toBeGreaterThan(0);
  });

  // Review A WR-04: essences and modifier reagents read the item pins too (a pin was silently ignored).
  describe('essence and modifier-reagent drops read the item pins', () => {
    const ESSENCE = 120n;
    const GLOW = 121n;
    const extras = [
      item(ESSENCE, 'Lesser Essence'),
      item(GLOW, 'Glowing Stone'),
      item(122n, 'Clear Crystal'),
      item(123n, 'Life Stone'),
    ];
    const count = (pins: any[], kind: string, id: bigint) => {
      const ctx = ctxFor(world({ item_template: extras, economy_item_dial: pins }));
      const lc = loot.buildVictoryLootContext(ctx, COMBAT, PARTICIPANTS);
      return rollsOver(ctx, lc, { id: 1n }, BEAST, 3000).flat().filter((i) => i.kind === kind && i.itemTemplateId === id).length;
    };

    it('an essence pinned at 0 never drops; at 300 it drops more often; at 50 less, but not never', () => {
      const plain = count([], 'essence', ESSENCE);
      expect(plain).toBeGreaterThan(50);
      expect(count([{ itemTemplateId: ESSENCE, dropRatePct: 0n }], 'essence', ESSENCE)).toBe(0);
      expect(count([{ itemTemplateId: ESSENCE, dropRatePct: 300n }], 'essence', ESSENCE)).toBeGreaterThan(plain);
      const half = count([{ itemTemplateId: ESSENCE, dropRatePct: 50n }], 'essence', ESSENCE);
      expect(half).toBeGreaterThan(0);
      expect(half).toBeLessThan(plain);
    });

    it('a reagent pinned at 0 never drops while the other reagents still do', () => {
      expect(count([], 'modifier', GLOW)).toBeGreaterThan(20);
      expect(count([{ itemTemplateId: GLOW, dropRatePct: 0n }], 'modifier', GLOW)).toBe(0);
      expect(count([{ itemTemplateId: GLOW, dropRatePct: 0n }], 'modifier', 122n)).toBeGreaterThan(20);
    });

    it('no pin leaves the essence roll exactly as before (roll below the scaled chance)', () => {
      const ctx = ctxFor(world({ item_template: extras }));
      const lc = loot.buildVictoryLootContext(ctx, COMBAT, PARTICIPANTS);
      for (let k = 0n; k < 300n; k += 1n) {
        const ts = T0 + k * 1_000_003n;
        at(ctx, ts);
        const want = rollBelow(lootSeed(ts, 1n, 1n), ROLL_INDEX.ESSENCE, 100n) < scaledChancePct(6n, 100n);
        expect(loot.rollEnemyLoot(ctx, lc, { id: 1n }, BEAST, 1n).some((i: any) => i.kind === 'essence')).toBe(want);
      }
    });
  });

  it('the region override of the fight region applies', () => {
    const ctx = ctxFor(world({ economy_region_dial: [{ regionId: 1n, dropRatePct: 0n }] }));
    const lc = loot.buildVictoryLootContext(ctx, COMBAT, PARTICIPANTS);
    expect(lc.dials.dropRatePct).toBe(0n);
    for (const items of rollsOver(ctx, lc, { id: 1n }, BEAST, 50)) expect(items).toEqual([]);
  });
});

describe('rollEnemyLoot: rarity follows the mix; legendary needs a boss or a named foe', () => {
  it('a normal enemy never drops legendary even at rarity +2, boss +2 and every tier at 300', () => {
    const ctx = ctxFor(
      world({
        economy_dials: [
          dialsRow({
            rarityShift: 2n,
            bossRarityBonus: 2n,
            tierCommonPct: 300n,
            tierUncommonPct: 300n,
            tierRarePct: 300n,
            tierEpicPct: 300n,
            tierLegendaryPct: 300n,
          }),
        ],
      }),
    );
    const lc = loot.buildVictoryLootContext(ctx, COMBAT, PARTICIPANTS);
    const drops = rollsOver(ctx, lc, { id: 1n }, HIGH, 2000).flatMap(gears);
    expect(drops.length).toBeGreaterThan(100);
    expect(drops.some((d) => d.qualityTier === 'legendary')).toBe(false);
    expect(drops.some((d) => d.qualityTier === 'epic')).toBe(true);
  });

  it('a fight-exact named foe at level 45 drops legendary at least once over 2,000 seeds', () => {
    const ctx = ctxFor(
      world({
        named_enemy: [
          { id: 1n, characterId: 1n, name: 'Old Ash', enemyTemplateId: 2n, locationId: 10n, isAlive: false, lastKilledAt: { microsSinceUnixEpoch: T0 } },
        ],
      }),
    );
    const lc = loot.buildVictoryLootContext(ctx, COMBAT, PARTICIPANTS, [{ id: 1n, combatId: 1n, enemyTemplateId: 2n }]);
    const drops = rollsOver(ctx, lc, { id: 1n }, HIGH, 2000).flatMap(gears);
    expect(drops.some((d) => d.qualityTier === 'legendary')).toBe(true);
    for (const d of drops) expect(d.itemTemplateId).toBe(BLADE_L45);
  });

  // Review WR-01: pull_named_enemy spawns a group of the named template; only one row is the named foe.
  it('only one combat_enemy row per named_enemy row gets the named boost, not its companions', () => {
    const ctx = ctxFor(
      world({
        named_enemy: [
          { id: 1n, characterId: 1n, name: 'Old Ash', enemyTemplateId: 2n, locationId: 10n, isAlive: false, lastKilledAt: { microsSinceUnixEpoch: T0 } },
        ],
      }),
    );
    const fight = [
      { id: 7n, combatId: 1n, enemyTemplateId: 2n },
      { id: 5n, combatId: 1n, enemyTemplateId: 2n },
      { id: 9n, combatId: 1n, enemyTemplateId: 2n },
    ];
    expect([...loot.fightNamedEnemyRowIds(ctx, COMBAT, PARTICIPANTS, fight)]).toEqual([5n]);
    const lc = loot.buildVictoryLootContext(ctx, COMBAT, PARTICIPANTS, fight);
    const named = rollsOver(ctx, lc, { id: 5n }, HIGH, 2000).flatMap(gears);
    expect(named.some((d) => d.qualityTier === 'legendary')).toBe(true);
    for (const companion of [7n, 9n]) {
      const drops = rollsOver(ctx, lc, { id: companion }, HIGH, 2000).flatMap(gears);
      expect(drops.length).toBeGreaterThan(100);
      expect(drops.some((d) => d.qualityTier === 'legendary')).toBe(false);
    }
  });

  it('two named rows of one template claim two different rows; the table is read when no rows are given', () => {
    const killed = { isAlive: false, locationId: 10n, lastKilledAt: { microsSinceUnixEpoch: T0 } };
    const ctx = ctxFor(
      world({
        named_enemy: [
          { id: 1n, characterId: 1n, name: 'Old Ash', enemyTemplateId: 2n, ...killed },
          { id: 2n, characterId: 1n, name: 'Young Ash', enemyTemplateId: 2n, ...killed },
        ],
        combat_enemy: [
          { id: 3n, combatId: 1n, enemyTemplateId: 2n },
          { id: 4n, combatId: 1n, enemyTemplateId: 2n },
          { id: 6n, combatId: 1n, enemyTemplateId: 2n },
          { id: 8n, combatId: 2n, enemyTemplateId: 2n },
        ],
      }),
    );
    expect([...loot.fightNamedEnemyRowIds(ctx, COMBAT, PARTICIPANTS)].sort()).toEqual([3n, 4n]);
  });

  it('gear drops carry craft quality, and affixes only above common', () => {
    const ctx = ctxFor(world());
    const lc = loot.buildVictoryLootContext(ctx, COMBAT, PARTICIPANTS);
    const drops = rollsOver(ctx, lc, { id: 1n }, HIGH, 600).flatMap(gears);
    expect(drops.length).toBeGreaterThan(0);
    for (const d of drops) {
      expect(['standard', 'reinforced', 'exquisite']).toContain(d.craftQuality);
      expect(d.isNamed).toBe(false);
      if (d.qualityTier === 'common') expect(d.affixDataJson).toBeUndefined();
      else expect(typeof d.affixDataJson).toBe('string');
    }
  });

  it('jewelry with no armor rolled common becomes uncommon', () => {
    const ctx = ctxFor({
      region: [{ id: 1n, name: 'Ashen Reach', dangerMultiplier: 100n }],
      location: [{ id: 10n, name: 'The Crossing', regionId: 1n }],
      enemy_template: [BEAST],
      item_template: [...ITEMS.junk, ITEMS.amulet],
    });
    const lc = loot.buildVictoryLootContext(ctx, COMBAT, PARTICIPANTS);
    const drops = rollsOver(ctx, lc, { id: 1n }, BEAST, 400).flatMap(gears);
    expect(drops.length).toBeGreaterThan(0);
    for (const d of drops) {
      expect(d.itemTemplateId).toBe(AMULET_L1);
      expect(d.qualityTier).toBe('uncommon');
    }
  });

  // Review A WR-05: quest rewards and crafted (recipe output) templates are not free kill drops, and
  // an epic template never enters the fallback pool.
  it('the gear pool skips quest rewards, recipe outputs and epic templates; a rare one is light', () => {
    const extra = {
      item_template: [
        item(230n, "Varek's Blade", { slot: 'mainHand', requiredLevel: 1n, rarity: 'rare' }),
        item(231n, 'Quest-won Tide Ring', { slot: 'earrings', requiredLevel: 1n }),
        item(232n, 'Frayed Robe', { slot: 'chest', requiredLevel: 1n }),
        item(233n, 'Gilded Axe', { slot: 'mainHand', requiredLevel: 1n, rarity: 'epic' }),
        item(234n, 'Stormglass Helm', { slot: 'head', requiredLevel: 1n, rarity: 'rare' }),
      ],
      quest_template: [
        { id: 1n, name: 'A Blade', rewardType: 'item', rewardItemName: "Varek's Blade" },
        { id: 2n, name: 'A Ring', rewardType: 'item', rewardItemName: 'Tide Ring' },
      ],
      recipe_template: [{ id: 900n, key: 'rule:x', name: 'Frayed Robe', outputTemplateId: 232n }],
    };
    const ctx = ctxFor(world(extra));
    const lc = loot.buildVictoryLootContext(ctx, COMBAT, PARTICIPANTS);
    const poolIds = lc.gearTemplates.map((t: any) => t.id);
    for (const never of [230n, 231n, 232n]) expect(poolIds).not.toContain(never);
    const counts = new Map<bigint, number>();
    for (const d of rollsOver(ctx, lc, { id: 1n }, BEAST, 1500).flatMap(gears)) {
      counts.set(d.itemTemplateId, (counts.get(d.itemTemplateId) ?? 0) + 1);
    }
    expect(counts.get(233n) ?? 0).toBe(0);
    expect(counts.get(234n) ?? 0).toBeGreaterThan(0);
    expect(counts.get(234n) ?? 0).toBeLessThan(counts.get(SWORD_L1) ?? 0);
  });

  it('the gear pool skips starter, junk and out-of-band templates', () => {
    const ctx = ctxFor(world());
    const lc = loot.buildVictoryLootContext(ctx, COMBAT, PARTICIPANTS);
    const ids = new Set(rollsOver(ctx, lc, { id: 1n }, BEAST, 800).flatMap(gears).map((d) => d.itemTemplateId));
    expect(ids.has(TRAINING_SWORD)).toBe(false);
    expect(ids.has(BLADE_L45)).toBe(false);
    expect(ids.has(SWORD_L1)).toBe(true);
  });
});

describe('rollEnemyLoot: independent seeds per combat_enemy row', () => {
  it('two rows of one template never share a seed and differ over 20 timestamps', () => {
    const ctx = ctxFor(world({ economy_dials: [dialsRow({ dropRatePct: 200n })] }));
    const lc = loot.buildVictoryLootContext(ctx, COMBAT, PARTICIPANTS);
    let differs = 0;
    for (let k = 0n; k < 20n; k += 1n) {
      at(ctx, T0 + k * 13n);
      expect(lootSeed(T0 + k * 13n, 1n, 1n)).not.toBe(lootSeed(T0 + k * 13n, 1n, 2n));
      const a = JSON.stringify(loot.rollEnemyLoot(ctx, lc, { id: 1n }, BEAST, 1n), (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
      const b = JSON.stringify(loot.rollEnemyLoot(ctx, lc, { id: 2n }, BEAST, 1n), (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
      if (a !== b) differs += 1;
    }
    expect(differs).toBeGreaterThan(0);
  });

  it('the same seed always gives the same rows', () => {
    const ctx = ctxFor(world());
    const lc = loot.buildVictoryLootContext(ctx, COMBAT, PARTICIPANTS);
    at(ctx, T0 + 99n);
    const a = loot.rollEnemyLoot(ctx, lc, { id: 1n }, BEAST, 1n);
    const lc2 = loot.buildVictoryLootContext(ctx, COMBAT, PARTICIPANTS);
    expect(loot.rollEnemyLoot(ctx, lc2, { id: 1n }, BEAST, 1n)).toEqual(a);
  });
});

describe('rollEnemyGold', () => {
  it('equals goldReward(creatureProfile(type), level, seed, goldPct)', () => {
    const ctx = ctxFor(world({ economy_dials: [dialsRow({ goldPct: 250n })] }));
    const lc = loot.buildVictoryLootContext(ctx, COMBAT, PARTICIPANTS);
    for (let k = 0n; k < 30n; k += 1n) {
      at(ctx, T0 + k);
      const seed = lootSeed(T0 + k, 1n, 3n);
      expect(loot.rollEnemyGold(ctx, lc, { id: 3n }, HIGH, 1n)).toBe(goldReward(creatureProfile('beast'), 45n, seed, 250n));
    }
  });

  it('uses the spawn level of the row', () => {
    const ctx = ctxFor(world());
    const lc = loot.buildVictoryLootContext(ctx, COMBAT, PARTICIPANTS);
    expect(loot.rollEnemyGold(ctx, lc, { id: 3n, level: 9n }, BEAST, 1n)).toBe(
      goldReward(creatureProfile('beast'), 9n, lootSeed(T0, 1n, 3n), 100n),
    );
  });
});

describe('rollEnemyLoot: recipe scrolls from bosses and named foes', () => {
  const scrollWorld = (extra: Seed = {}) =>
    world({
      item_template: [item(400n, 'Scroll: Ember Blade'), item(401n, 'Scroll: Ash Mail'), item(402n, 'Scroll: Grey Ring')],
      region_recipe: [
        { recipeTemplateId: 500n, regionId: 1n, tier: 'rare', learnBy: 'scroll', scrollTemplateId: 400n, foreignRegionIds: '[]' },
        { recipeTemplateId: 501n, regionId: 1n, tier: 'epic', learnBy: 'scroll', scrollTemplateId: 401n, foreignRegionIds: '[]' },
        { recipeTemplateId: 502n, regionId: 1n, tier: 'common', learnBy: 'research', scrollTemplateId: 0n, foreignRegionIds: '[]' },
        { recipeTemplateId: 503n, regionId: 2n, tier: 'rare', learnBy: 'scroll', scrollTemplateId: 402n, foreignRegionIds: '[]' },
      ],
      ...extra,
    });

  it('the base chance is 10% (owner, 2026-10-08)', () => {
    expect(SCROLL_DROP_BASE_PCT).toBe(10n);
  });

  it('a boss drops a scroll exactly when the scroll roll is under 10% times the drop rate', () => {
    const ctx = ctxFor(scrollWorld());
    const lc = loot.buildVictoryLootContext(ctx, COMBAT, PARTICIPANTS);
    expect(lc.scrollRecipes.map((r: any) => r.scrollTemplateId).sort()).toEqual([400n, 401n]);
    const boss = { ...BEAST, isBoss: true };
    let expected = 0;
    let got = 0;
    const seen = new Set<bigint>();
    for (let k = 0n; k < 2000n; k += 1n) {
      const ts = T0 + k * 1_000_003n;
      at(ctx, ts);
      if (rollBelow(lootSeed(ts, 1n, 1n), ROLL_INDEX.SCROLL, 100n) < scaledChancePct(SCROLL_DROP_BASE_PCT, 100n)) expected += 1;
      const scrolls = loot.rollEnemyLoot(ctx, lc, { id: 1n }, boss, 1n).filter((i: any) => i.kind === 'scroll');
      got += scrolls.length;
      for (const s of scrolls) seen.add(s.itemTemplateId);
    }
    expect(got).toBe(expected);
    expect(got).toBeGreaterThan(100);
    expect(got).toBeLessThan(300);
    expect([...seen].sort()).toEqual([400n, 401n]);
  });

  it('the companions of a named foe (same template) never drop a scroll (review WR-01)', () => {
    const ctx = ctxFor(
      scrollWorld({
        named_enemy: [
          { id: 1n, characterId: 1n, name: 'Old Rat', enemyTemplateId: 1n, locationId: 10n, isAlive: false, lastKilledAt: { microsSinceUnixEpoch: T0 } },
        ],
      }),
    );
    const fight = [{ id: 1n, combatId: 1n, enemyTemplateId: 1n }, { id: 2n, combatId: 1n, enemyTemplateId: 1n }];
    const lc = loot.buildVictoryLootContext(ctx, COMBAT, PARTICIPANTS, fight);
    expect(rollsOver(ctx, lc, { id: 1n }, BEAST, 1000).flat().some((i) => i.kind === 'scroll')).toBe(true);
    expect(rollsOver(ctx, lc, { id: 2n }, BEAST, 1000).flat().some((i) => i.kind === 'scroll')).toBe(false);
  });

  it('an ordinary kill never drops a scroll', () => {
    const ctx = ctxFor(scrollWorld());
    const lc = loot.buildVictoryLootContext(ctx, COMBAT, PARTICIPANTS);
    const all = rollsOver(ctx, lc, { id: 1n }, BEAST, 1000).flat();
    expect(all.some((i) => i.kind === 'scroll')).toBe(false);
  });

  // Review CR-01: (1 * 50) / 100 floored the legendary scroll weight to 0 at any tier dial below 100.
  it('a legendary scroll tier at 50% still drops, at about half its share', () => {
    const base = scrollWorld({ economy_dials: [dialsRow({ tierLegendaryPct: 50n })] });
    base.item_template = [...base.item_template, item(403n, 'Scroll: Star Forge')];
    base.region_recipe = [
      ...base.region_recipe,
      { recipeTemplateId: 504n, regionId: 1n, tier: 'legendary', learnBy: 'scroll', scrollTemplateId: 403n, foreignRegionIds: '[]' },
    ];
    const ctx = ctxFor(base);
    const lc = loot.buildVictoryLootContext(ctx, COMBAT, PARTICIPANTS);
    const boss = { ...BEAST, isBoss: true };
    const scrolls = rollsOver(ctx, lc, { id: 1n }, boss, 4000).flat().filter((i) => i.kind === 'scroll');
    const legendary = scrolls.filter((i) => i.itemTemplateId === 403n).length;
    expect(scrolls.length).toBeGreaterThan(200);
    expect(legendary).toBeGreaterThan(0);
    // rare 6, epic 3, legendary 1 at 50%: legendary is 1 part in 19 (about 5%).
    expect(legendary / scrolls.length).toBeLessThan(0.12);
  });

  it('a tier weight of 0 removes that scroll tier', () => {
    const ctx = ctxFor(scrollWorld({ economy_dials: [dialsRow({ tierEpicPct: 0n })] }));
    const lc = loot.buildVictoryLootContext(ctx, COMBAT, PARTICIPANTS);
    const boss = { ...BEAST, isBoss: true };
    const ids = new Set(rollsOver(ctx, lc, { id: 1n }, boss, 2000).flat().filter((i) => i.kind === 'scroll').map((i) => i.itemTemplateId));
    expect([...ids]).toEqual([400n]);
  });
});

describe('buildVictoryLootContext: never throws on missing rows', () => {
  it('a missing location reads as danger 100 and the global dials', () => {
    const ctx = ctxFor({ item_template: ITEMS.junk });
    const lc = loot.buildVictoryLootContext(ctx, { id: 1n, locationId: 99n }, PARTICIPANTS);
    expect(lc.danger).toBe(100n);
    expect(lc.regionId).toBeUndefined();
    expect(lc.scrollRecipes).toEqual([]);
    at(ctx, T0);
    expect(commons(loot.rollEnemyLoot(ctx, lc, { id: 1n }, BEAST, 1n)).length).toBe(1);
  });
});
