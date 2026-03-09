import { describe, it, expect, vi } from 'vitest';

// Mock dependencies that import SpacetimeDB modules
vi.mock('../helpers/npc_affinity', () => ({
  getAffinityForNpc: () => 0n,
}));

vi.mock('../helpers/location', () => ({
  getWorldState: (ctx: any) => ctx.db.world_state.id.find(1n),
}));

vi.mock('../helpers/search', () => ({
  performPassiveSearch: () => {},
}));

import { buildLookOutput } from '../helpers/look';
import { createMockDb } from '../helpers/test-utils';

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

  it('includes discovered quest items at character location', () => {
    const db = createMockDb({
      location: [{ id: 1n, name: 'Cave', description: 'A dark cave.', isSafe: false, bindStone: false, craftingAvailable: false }],
      world_state: [{ id: 1n, isNight: false, nextTransitionAtMicros: 2000000000000n }],
      npc: [],
      character: [],
      enemy_spawn: [],
      resource_node: [],
      location_connection: [],
      quest_item: [
        { id: 1n, characterId: 10n, questTemplateId: 1n, locationId: 1n, name: 'Ancient Relic', discovered: true, looted: false },
      ],
    });

    const ctx = {
      db,
      timestamp: { microsSinceUnixEpoch: 1000000000000n },
    };

    const character = { id: 10n, locationId: 1n, level: 1n };
    const parts = buildLookOutput(ctx, character);
    const joined = parts.join('\n');

    expect(joined).toContain('Quest items');
    expect(joined).toContain('Loot Ancient Relic');
  });

  it('does not show looted or undiscovered quest items', () => {
    const db = createMockDb({
      location: [{ id: 1n, name: 'Cave', description: 'A dark cave.', isSafe: false, bindStone: false, craftingAvailable: false }],
      world_state: [{ id: 1n, isNight: false, nextTransitionAtMicros: 2000000000000n }],
      npc: [],
      character: [],
      enemy_spawn: [],
      resource_node: [],
      location_connection: [],
      quest_item: [
        { id: 1n, characterId: 10n, questTemplateId: 1n, locationId: 1n, name: 'Looted Item', discovered: true, looted: true },
        { id: 2n, characterId: 10n, questTemplateId: 2n, locationId: 1n, name: 'Hidden Item', discovered: false, looted: false },
        { id: 3n, characterId: 99n, questTemplateId: 1n, locationId: 1n, name: 'Other Player Item', discovered: true, looted: false },
      ],
    });

    const ctx = {
      db,
      timestamp: { microsSinceUnixEpoch: 1000000000000n },
    };

    const character = { id: 10n, locationId: 1n, level: 1n };
    const parts = buildLookOutput(ctx, character);
    const joined = parts.join('\n');

    expect(joined).not.toContain('Quest items');
    expect(joined).not.toContain('Looted Item');
    expect(joined).not.toContain('Hidden Item');
    expect(joined).not.toContain('Other Player Item');
  });

  it('still works when no quest_item table data exists', () => {
    const db = createMockDb({
      location: [{ id: 1n, name: 'Town', description: 'A town.', isSafe: true, bindStone: false, craftingAvailable: false }],
      world_state: [{ id: 1n, isNight: false, nextTransitionAtMicros: 2000000000000n }],
      npc: [],
      character: [],
      enemy_spawn: [],
      resource_node: [],
      location_connection: [],
      quest_item: [],
    });

    const ctx = {
      db,
      timestamp: { microsSinceUnixEpoch: 1000000000000n },
    };

    const character = { id: 10n, locationId: 1n, level: 1n };
    const parts = buildLookOutput(ctx, character);

    expect(parts.length).toBeGreaterThan(0);
    expect(parts[0]).toBe('Town');
    expect(parts.join('\n')).not.toContain('Quest items');
  });
});
