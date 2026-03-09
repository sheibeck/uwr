import { describe, it, expect, vi } from 'vitest';

// Mock dependencies that import SpacetimeDB modules
vi.mock('./location', () => ({
  connectLocations: (ctx: any, fromId: bigint, toId: bigint) => {
    ctx.db.location_connection.insert({ id: 0n, fromLocationId: fromId, toLocationId: toId });
  },
}));

vi.mock('../data/world_gen', () => ({
  computeRegionDanger: (_sourceDanger: bigint, _timestamp: bigint) => 100n,
}));

import { writeGeneratedRegion, findHomeLocation } from './world_gen';
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
