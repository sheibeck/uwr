import { describe, expect, it } from 'vitest';
import { nearbyRows, nodeStatus, visibleNodes } from './nearby';

describe('nodeStatus', () => {
  it('is gather for an unlocked available node', () => {
    expect(nodeStatus({ state: 'available' })).toBe('gather');
    expect(nodeStatus({ state: 'available', lockedByCharacterId: null })).toBe('gather');
  });

  it('is inUse when locked or harvesting', () => {
    expect(nodeStatus({ state: 'available', lockedByCharacterId: 3n })).toBe('inUse');
    expect(nodeStatus({ state: 'harvesting' })).toBe('inUse');
  });

  it('is depleted for any other state', () => {
    expect(nodeStatus({ state: 'depleted' })).toBe('depleted');
    expect(nodeStatus({ state: 'respawning' })).toBe('depleted');
    expect(nodeStatus({ state: '' })).toBe('depleted');
  });
});

describe('visibleNodes', () => {
  it('keeps shared nodes and the player own nodes', () => {
    const nodes = [
      { id: 1n },
      { id: 2n, characterId: null },
      { id: 3n, characterId: 7n },
      { id: 4n, characterId: 8n },
    ];
    expect(visibleNodes(nodes, 7n).map((n) => n.id)).toEqual([1n, 2n, 3n]);
    expect(visibleNodes(nodes, null).map((n) => n.id)).toEqual([1n, 2n]);
  });
});

describe('nearbyRows', () => {
  const base = {
    npcs: [
      { id: 2n, name: 'Marisol', npcType: 'vendor' },
      { id: 1n, name: 'ferryman', npcType: 'quest' },
    ],
    nodes: [
      { id: 10n, name: 'Copper Vein', state: 'available' },
      { id: 11n, name: 'Ash Tree', state: 'depleted' },
      { id: 12n, name: 'Bramble', state: 'available', lockedByCharacterId: 4n },
    ],
    players: [
      { id: 5n, name: 'Zed', level: 4n },
      { id: 6n, name: 'Amy', level: 7n },
      { id: 9n, name: 'Me', level: 3n },
    ],
    selfId: 9n,
  };

  it('orders npc, object, node, player and alphabetically inside a group', () => {
    const rows = nearbyRows({ ...base, objects: [{ id: 50n, name: 'Old Well' }] });
    expect(rows.map((r) => `${r.kind}:${r.name}`)).toEqual([
      'npc:ferryman',
      'npc:Marisol',
      'object:Old Well',
      'node:Ash Tree',
      'node:Bramble',
      'node:Copper Vein',
      'player:Amy',
      'player:Zed',
    ]);
  });

  it('writes the hint per kind and flags vendors', () => {
    const rows = nearbyRows({ ...base, objects: [{ id: 50n, name: 'Old Well' }] });
    const hint = (name: string) => rows.find((r) => r.name === name)!.hint;
    expect(hint('Marisol')).toBe('NPC · hail');
    expect(hint('Old Well')).toBe('Examine');
    expect(hint('Copper Vein')).toBe('Gather');
    expect(hint('Ash Tree')).toBe('Depleted');
    expect(hint('Bramble')).toBe('In use');
    expect(hint('Amy')).toBe('Lv 7');
    expect(rows.filter((r) => r.vendor).map((r) => r.name)).toEqual(['Marisol']);
  });

  it('carries node status and player level', () => {
    const rows = nearbyRows(base);
    expect(rows.find((r) => r.name === 'Bramble')).toMatchObject({ nodeStatus: 'inUse', level: null });
    expect(rows.find((r) => r.name === 'Amy')).toMatchObject({ nodeStatus: null, level: 7n });
  });

  it('excludes the player and defaults objects to none', () => {
    const rows = nearbyRows(base);
    expect(rows.some((r) => r.name === 'Me')).toBe(false);
    expect(rows.some((r) => r.kind === 'object')).toBe(false);
  });

  it('hides nodes that belong to another character', () => {
    const rows = nearbyRows({
      ...base,
      nodes: [
        { id: 1n, name: 'Mine', state: 'available', characterId: 9n },
        { id: 2n, name: 'Theirs', state: 'available', characterId: 3n },
      ],
    });
    expect(rows.filter((r) => r.kind === 'node').map((r) => r.name)).toEqual(['Mine']);
  });

  it('keeps an NPC and a node with the same name as two rows of different kinds', () => {
    const rows = nearbyRows({
      npcs: [{ id: 1n, name: 'Bramble', npcType: 'quest' }],
      nodes: [{ id: 1n, name: 'Bramble', state: 'available' }],
      players: [],
      selfId: null,
    });
    expect(rows.map((r) => r.kind)).toEqual(['npc', 'node']);
  });

  it('breaks name ties by id', () => {
    const rows = nearbyRows({
      npcs: [
        { id: 8n, name: 'Twin', npcType: 'quest' },
        { id: 3n, name: 'twin', npcType: 'quest' },
      ],
      nodes: [],
      players: [],
      selfId: null,
    });
    expect(rows.map((r) => r.id)).toEqual([3n, 8n]);
  });

  it('returns [] when nothing is here', () => {
    expect(nearbyRows({ npcs: [], nodes: [], players: [], selfId: null })).toEqual([]);
    expect(nearbyRows({ npcs: [], nodes: [], players: [], objects: [], selfId: 1n })).toEqual([]);
  });
});
