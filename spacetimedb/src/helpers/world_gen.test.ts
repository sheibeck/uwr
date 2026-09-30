import { describe, it, expect, vi } from 'vitest';

// Mock dependencies that import SpacetimeDB modules
vi.mock('./location', () => ({
  connectLocations: (ctx: any, fromId: bigint, toId: bigint) => {
    ctx.db.location_connection.insert({ id: 0n, fromLocationId: fromId, toLocationId: toId });
  },
}));

import { writeGeneratedRegion, findHomeLocation, computeRegionDanger } from './world_gen';
import { createMockDb } from './test-utils';

function createMockTx() {
  const db = createMockDb();
  return {
    db,
    timestamp: { microsSinceUnixEpoch: 1000000000000n },
  };
}

function baseParsedData(overrides: any = {}) {
  return {
    regionName: 'Test Region',
    regionDescription: 'A test region.',
    biome: 'forest',
    dominantFaction: 'none',
    landmarks: ['Old Tree'],
    threats: ['wolves'],
    locations: [
      { name: 'Safe Haven', description: 'A safe place.', terrainType: 'town', isSafe: true, levelOffset: 0, connectsTo: ['Dark Woods'] },
      { name: 'Dark Woods', description: 'Spooky woods.', terrainType: 'woods', isSafe: false, levelOffset: 1, connectsTo: ['Safe Haven'] },
    ],
    npcs: [],
    enemies: [
      { name: 'Wolf', creatureType: 'beast', role: 'melee', terrainTypes: 'woods', groupMin: 1, groupMax: 2, level: 1 },
    ],
    ...overrides,
  };
}

function baseGenState() {
  return {
    id: 1n,
    sourceRegionId: 100n,
    sourceLocationId: 0n,
    characterId: 10n,
  };
}

describe('findHomeLocation', () => {
  it('returns first safe non-uncharted location', () => {
    const locations: Record<string, any> = {
      'Danger Zone': { isSafe: false, terrainType: 'woods' },
      'Safe Town': { isSafe: true, terrainType: 'town' },
      'Another Safe': { isSafe: true, terrainType: 'town' },
    };
    const result = findHomeLocation(locations);
    expect(result).toBe(locations['Safe Town']);
  });

  it('falls back to first non-uncharted if no safe locations', () => {
    const locations: Record<string, any> = {
      'Danger Zone': { isSafe: false, terrainType: 'woods' },
      'Uncharted': { isSafe: true, terrainType: 'uncharted' },
    };
    const result = findHomeLocation(locations);
    expect(result).toBe(locations['Danger Zone']);
  });

  it('returns null if empty', () => {
    expect(findHomeLocation({})).toBeNull();
  });
});

describe('writeGeneratedRegion', () => {
  it('inserts fallback vendor and banker when LLM omits them', () => {
    const tx = createMockTx();
    // Pre-seed the source region so dangerMultiplier lookup works
    tx.db.region.insert({ id: 100n, name: 'Source', dangerMultiplier: 100n });

    const parsed = baseParsedData({ npcs: [] });
    writeGeneratedRegion(tx, parsed, baseGenState());

    const allNpcs = tx.db.npc._rows();
    const vendorNpc = allNpcs.find((n: any) => n.npcType === 'vendor');
    const bankerNpc = allNpcs.find((n: any) => n.npcType === 'banker');

    expect(vendorNpc).toBeDefined();
    expect(vendorNpc.name).toBe('The Reluctant Merchant');
    expect(bankerNpc).toBeDefined();
    expect(bankerNpc.name).toBe('The Ledger Keeper');
  });

  it('does NOT create duplicate vendor/banker when LLM includes them', () => {
    const tx = createMockTx();
    tx.db.region.insert({ id: 100n, name: 'Source', dangerMultiplier: 100n });

    const parsed = baseParsedData({
      npcs: [
        { name: 'Shopkeep', npcType: 'vendor', locationName: 'Safe Haven', description: 'A vendor.', greeting: 'Hello.', personality: { traits: ['friendly'], speechPattern: 'cheerful', knowledgeDomains: ['goods'], secrets: [], affinityMultiplier: 1.0 } },
        { name: 'Banker Bob', npcType: 'banker', locationName: 'Safe Haven', description: 'A banker.', greeting: 'Welcome.', personality: { traits: ['careful'], speechPattern: 'formal', knowledgeDomains: ['banking'], secrets: [], affinityMultiplier: 1.0 } },
      ],
    });

    writeGeneratedRegion(tx, parsed, baseGenState());

    const allNpcs = tx.db.npc._rows();
    const vendors = allNpcs.filter((n: any) => n.npcType === 'vendor');
    const bankers = allNpcs.filter((n: any) => n.npcType === 'banker');

    expect(vendors.length).toBe(1);
    expect(vendors[0].name).toBe('Shopkeep');
    expect(bankers.length).toBe(1);
    expect(bankers[0].name).toBe('Banker Bob');
  });

  it('home location always has bindStone and craftingAvailable', () => {
    const tx = createMockTx();
    tx.db.region.insert({ id: 100n, name: 'Source', dangerMultiplier: 100n });

    const parsed = baseParsedData();
    writeGeneratedRegion(tx, parsed, baseGenState());

    const allLocations = tx.db.location._rows();
    const safeLocation = allLocations.find((l: any) => l.name === 'Safe Haven');

    expect(safeLocation).toBeDefined();
    expect(safeLocation.bindStone).toBe(true);
    expect(safeLocation.craftingAvailable).toBe(true);
  });
});

describe('computeRegionDanger', () => {
  it('returns a value 50-100 greater than source danger for non-starter regions', () => {
    const sourceDanger = 100n;
    const result = computeRegionDanger(sourceDanger, 1000000n, false);
    expect(result).toBeGreaterThanOrEqual(150n);
    expect(result).toBeLessThanOrEqual(200n);
  });

  it('returns exactly 100n for starter regions regardless of timestamp', () => {
    expect(computeRegionDanger(100n, 1000000n, true)).toBe(100n);
    expect(computeRegionDanger(150n, 9999999n, true)).toBe(100n);
    expect(computeRegionDanger(200n, 0n, true)).toBe(100n);
  });

  it('caps danger at 800n for non-starter regions', () => {
    const result = computeRegionDanger(800n, 1000000n, false);
    expect(result).toBe(800n);
  });
});

describe('writeGeneratedRegion - starter region behavior', () => {
  function createMockTx() {
    const db = createMockDb();
    return {
      db,
      timestamp: { microsSinceUnixEpoch: 1000000000000n },
    };
  }

  it('starter region (sourceRegionId=0n) gets dangerMultiplier=100n', () => {
    const tx = createMockTx();
    // No source region seeded (sourceRegionId=0n means first region)
    const parsed = baseParsedData();
    const starterGenState = { id: 1n, sourceRegionId: 0n, sourceLocationId: 0n, characterId: 10n };
    const region = writeGeneratedRegion(tx, parsed, starterGenState);
    expect(region.dangerMultiplier).toBe(100n);
  });

  it('starter region enemies are all clamped to level 1', () => {
    const tx = createMockTx();
    const parsed = baseParsedData({
      enemies: [
        { name: 'Wolf', creatureType: 'beast', role: 'melee', terrainTypes: 'woods', groupMin: 1, groupMax: 2, level: 3 },
        { name: 'Bandit', creatureType: 'humanoid', role: 'melee', terrainTypes: 'plains', groupMin: 1, groupMax: 1, level: 2 },
      ],
    });
    const starterGenState = { id: 1n, sourceRegionId: 0n, sourceLocationId: 0n, characterId: 10n };
    writeGeneratedRegion(tx, parsed, starterGenState);

    const enemies = tx.db.enemy_template._rows();
    expect(enemies.length).toBe(2);
    for (const enemy of enemies) {
      expect(enemy.level).toBe(1n);
    }
  });

  it('non-starter region (sourceRegionId != 0n) gets increased danger', () => {
    const tx = createMockTx();
    tx.db.region.insert({ id: 100n, name: 'Source', dangerMultiplier: 100n });
    const parsed = baseParsedData();
    const region = writeGeneratedRegion(tx, parsed, baseGenState());
    // Danger should be 150-200 (increase of 50-100)
    expect(region.dangerMultiplier).toBeGreaterThanOrEqual(150n);
    expect(region.dangerMultiplier).toBeLessThanOrEqual(200n);
  });
});

describe('validator retention on model output', () => {
  function createMockTx() {
    const db = createMockDb();
    return { db, timestamp: { microsSinceUnixEpoch: 1000000000000n } };
  }

  function enemyLevels(tx: any): bigint[] {
    return tx.db.enemy_template._rows().map((e: any) => e.level);
  }

  it('clamps enemy levels far above and far below the danger band of a non-starter region into the band', () => {
    const tx = createMockTx();
    tx.db.region.insert({ id: 100n, name: 'Source', dangerMultiplier: 500n });
    const parsed = baseParsedData({
      enemies: [
        { name: 'Titan', creatureType: 'beast', role: 'melee', level: 99 },
        { name: 'Sapling', creatureType: 'beast', role: 'melee', level: -7 },
        { name: 'Native', creatureType: 'beast', role: 'melee' },
      ],
    });
    const region = writeGeneratedRegion(tx, parsed, baseGenState());
    const base = region.dangerMultiplier / 100n;
    const [tooHigh, tooLow, defaulted] = enemyLevels(tx);
    // Source danger 500 plus 50-100, so the band sits well above level 2
    expect(base).toBeGreaterThanOrEqual(5n);
    expect(tooHigh).toBe(base + 1n);
    expect(tooLow).toBe(base - 1n);
    expect(defaulted >= base - 1n && defaulted <= base + 1n).toBe(true);
    for (const level of enemyLevels(tx)) {
      expect(level >= base - 1n && level <= base + 1n).toBe(true);
    }
  });

  it('derives enemy stats from the clamped level, not from the model-provided level', () => {
    const tx = createMockTx();
    tx.db.region.insert({ id: 100n, name: 'Source', dangerMultiplier: 500n });
    const parsed = baseParsedData({ enemies: [{ name: 'Titan', creatureType: 'beast', role: 'melee', level: 99 }] });
    writeGeneratedRegion(tx, parsed, baseGenState());
    const [enemy] = tx.db.enemy_template._rows();
    expect(enemy.maxHp).toBe(enemy.level * 12n + 20n);
    expect(enemy.baseDamage).toBe(enemy.level * 3n + 5n);
    expect(enemy.xpReward).toBe(enemy.level * 15n + 10n);
  });

  it('a starter region keeps every enemy at level 1, including extreme and missing levels', () => {
    const tx = createMockTx();
    const parsed = baseParsedData({
      enemies: [
        { name: 'Titan', creatureType: 'beast', role: 'melee', level: 99 },
        { name: 'Sapling', creatureType: 'beast', role: 'melee', level: -4 },
        { name: 'Native', creatureType: 'beast', role: 'melee' },
      ],
    });
    const region = writeGeneratedRegion(tx, parsed, { id: 1n, sourceRegionId: 0n, sourceLocationId: 0n, characterId: 10n });
    expect(region.dangerMultiplier).toBe(100n);
    expect(enemyLevels(tx)).toEqual([1n, 1n, 1n]);
  });

  it('caps the region danger at 800 so enemy levels never exceed 9', () => {
    const tx = createMockTx();
    tx.db.region.insert({ id: 100n, name: 'Source', dangerMultiplier: 800n });
    const parsed = baseParsedData({ enemies: [{ name: 'Titan', creatureType: 'beast', role: 'melee', level: 99 }] });
    const region = writeGeneratedRegion(tx, parsed, baseGenState());
    expect(region.dangerMultiplier).toBe(800n);
    expect(enemyLevels(tx)).toEqual([9n]);
  });
});
