import { describe, it, expect, vi } from 'vitest';

// Mock dependencies that import SpacetimeDB modules
vi.mock('../helpers/npc_affinity', () => ({
  getAffinityForNpc: () => 0n,
}));

vi.mock('../helpers/location', () => ({
  getWorldState: (ctx: any) => ctx.db.world_state.id.find(1n),
}));

import { buildLookOutput } from './intent';

// Mock db that simulates SpacetimeDB table operations
function createMockDb(data: Record<string, any[]> = {}) {
  const tables: Record<string, any[]> = {};
  for (const [k, v] of Object.entries(data)) {
    tables[k] = [...v];
  }

  return new Proxy({} as any, {
    get: (_: any, tableName: string) => ({
      insert: (row: any) => {
        (tables[tableName] ??= []).push(row);
        return row;
      },
      id: {
        find: (id: bigint) => (tables[tableName] ?? []).find((r: any) => r.id === id),
      },
      iter: () => tables[tableName] ?? [],
      by_location: {
        filter: (locId: bigint) => (tables[tableName] ?? []).filter((r: any) => r.locationId === locId),
      },
      by_from: {
        filter: (id: bigint) => (tables[tableName] ?? []).filter((r: any) => r.fromLocationId === id),
      },
      by_to: {
        filter: (id: bigint) => (tables[tableName] ?? []).filter((r: any) => r.toLocationId === id),
      },
      by_character: {
        filter: (id: bigint) => (tables[tableName] ?? []).filter((r: any) => r.characterId === id),
      },
      by_owner: {
        filter: (id: bigint) => (tables[tableName] ?? []).filter((r: any) => r.ownerId === id),
      },
    }),
  });
}

describe('buildLookOutput', () => {
  it('returns array containing location name and description', () => {
    const db = createMockDb({
      location: [{ id: 1n, name: 'Test Town', description: 'A lovely town.', isSafe: true, bindStone: false, craftingAvailable: false }],
      world_state: [{ id: 1n, isNight: false, nextTransitionAtMicros: 2000000000000n }],
      npc: [],
      character: [],
      enemy_spawn: [],
      resource_node: [],
      location_connection: [],
    });

    const ctx = {
      db,
      timestamp: { microsSinceUnixEpoch: 1000000000000n },
    };

    const character = { id: 10n, locationId: 1n, level: 1n };
    const parts = buildLookOutput(ctx, character);

    expect(parts.length).toBeGreaterThan(0);
    expect(parts[0]).toBe('Test Town');
    expect(parts[1]).toBe('A lovely town.');
    expect(parts.some((p: string) => p.includes('safe area'))).toBe(true);
  });

  it('returns empty array if location not found', () => {
    const db = createMockDb({
      location: [],
    });
    const ctx = {
      db,
      timestamp: { microsSinceUnixEpoch: 1000000000000n },
    };
    const character = { id: 10n, locationId: 999n, level: 1n };
    const parts = buildLookOutput(ctx, character);
    expect(parts).toEqual([]);
  });

  it('includes NPC names and service markers', () => {
    const db = createMockDb({
      location: [{ id: 1n, name: 'Market', description: 'Busy market.', isSafe: true, bindStone: true, craftingAvailable: true }],
      world_state: [{ id: 1n, isNight: false, nextTransitionAtMicros: 2000000000000n }],
      npc: [
        { id: 1n, name: 'Bob the Vendor', npcType: 'vendor', locationId: 1n },
        { id: 2n, name: 'Alice the Banker', npcType: 'banker', locationId: 1n },
      ],
      character: [],
      enemy_spawn: [],
      resource_node: [],
      location_connection: [],
    });

    const ctx = {
      db,
      timestamp: { microsSinceUnixEpoch: 1000000000000n },
    };

    const character = { id: 10n, locationId: 1n, level: 1n };
    const parts = buildLookOutput(ctx, character);
    const joined = parts.join('\n');

    expect(joined).toContain('Bob the Vendor');
    expect(joined).toContain('Alice the Banker');
    expect(joined).toContain('[bank]');
    expect(joined).toContain('[shop]');
    expect(joined).toContain('[bind]');
    expect(joined).toContain('[craft]');
  });

  it('includes exit names', () => {
    const db = createMockDb({
      location: [
        { id: 1n, name: 'Town', description: 'A town.', isSafe: true, bindStone: false, craftingAvailable: false },
        { id: 2n, name: 'Forest', description: 'Dark forest.', isSafe: false, bindStone: false, craftingAvailable: false },
      ],
      world_state: [{ id: 1n, isNight: false, nextTransitionAtMicros: 2000000000000n }],
      npc: [],
      character: [],
      enemy_spawn: [],
      resource_node: [],
      location_connection: [
        { id: 1n, fromLocationId: 1n, toLocationId: 2n },
      ],
    });

    const ctx = {
      db,
      timestamp: { microsSinceUnixEpoch: 1000000000000n },
    };

    const character = { id: 10n, locationId: 1n, level: 1n };
    const parts = buildLookOutput(ctx, character);
    const joined = parts.join('\n');

    expect(joined).toContain('Forest');
    expect(joined).toContain('Exits:');
  });
});
