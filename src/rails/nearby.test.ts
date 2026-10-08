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
      { id: 5n, name: 'Zed', level: 4n, online: true },
      { id: 6n, name: 'Amy', level: 7n, online: true },
      { id: 9n, name: 'Me', level: 3n, online: true },
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
    expect(hint('Marisol')).toBe('NPC');
    expect(hint('Old Well')).toBe('');
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

  it('lists a player only when online is exactly true (CONTEXT Area 2)', () => {
    const rows = nearbyRows({
      npcs: [],
      nodes: [],
      players: [
        { id: 1n, name: 'Here', level: 2n, online: true },
        { id: 2n, name: 'Gone', level: 2n, online: false },
        { id: 3n, name: 'Unset', level: 2n, online: null },
        { id: 4n, name: 'Missing', level: 2n },
      ],
      selfId: null,
    });
    expect(rows.map((r) => r.name)).toEqual(['Here']);
  });

  it('keeps every other kind and the order when players are filtered', () => {
    const rows = nearbyRows({
      npcs: [{ id: 1n, name: 'Ferryman', npcType: 'quest' }],
      nodes: [{ id: 10n, name: 'Copper Vein', state: 'available' }],
      players: [
        { id: 5n, name: 'Zed', level: 4n, online: false },
        { id: 6n, name: 'Amy', level: 7n, online: true },
      ],
      bindStone: { placeName: 'The Crossing', bound: false },
      selfId: null,
    });
    expect(rows.map((r) => `${r.kind}:${r.name}`)).toEqual([
      'npc:Ferryman',
      'bindStone:Bind stone',
      'node:Copper Vein',
      'player:Amy',
    ]);
  });

  it('hints In your party for a party member and Lv n for anyone else', () => {
    const rows = nearbyRows({
      ...base,
      partyIds: new Set([6n]),
    });
    const hint = (name: string) => rows.find((r) => r.name === name)!.hint;
    expect(hint('Amy')).toBe('In your party');
    expect(hint('Zed')).toBe('Lv 4');
  });

  it('hints Lv n for everyone without partyIds or with an empty set', () => {
    expect(nearbyRows(base).find((r) => r.name === 'Amy')!.hint).toBe('Lv 7');
    expect(nearbyRows({ ...base, partyIds: new Set() }).find((r) => r.name === 'Amy')!.hint).toBe('Lv 7');
  });

  it('keeps the level on a party member row', () => {
    const rows = nearbyRows({ ...base, partyIds: new Set([6n]) });
    expect(rows.find((r) => r.name === 'Amy')).toMatchObject({ level: 7n });
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

describe('nearbyRows bind stone', () => {
  const base = {
    npcs: [{ id: 1n, name: 'Ferryman', npcType: 'quest' }],
    nodes: [{ id: 10n, name: 'Copper Vein', state: 'available' }],
    players: [{ id: 5n, name: 'Zed', level: 4n, online: true }],
    objects: [{ id: 50n, name: 'Old Well' }],
    selfId: 9n,
  };

  it('puts the bind stone after every NPC and before objects', () => {
    const rows = nearbyRows({ ...base, bindStone: { placeName: 'The Crossing', bound: false } });
    expect(rows.map((r) => r.kind)).toEqual(['npc', 'bindStone', 'object', 'node', 'player']);
  });

  it('has a fixed name and an empty hint when not bound', () => {
    const row = nearbyRows({ ...base, bindStone: { placeName: 'The Crossing', bound: false } }).find(
      (r) => r.kind === 'bindStone',
    )!;
    expect(row).toMatchObject({ name: 'Bind stone', hint: '', bound: false, vendor: false, nodeStatus: null });
  });

  it('says Bound here when bound', () => {
    const row = nearbyRows({ ...base, bindStone: { placeName: 'The Crossing', bound: true } }).find(
      (r) => r.kind === 'bindStone',
    )!;
    expect(row).toMatchObject({ name: 'Bind stone', hint: 'Bound here', bound: true });
  });

  it('has no bind stone row without one', () => {
    expect(nearbyRows(base).some((r) => r.kind === 'bindStone')).toBe(false);
    expect(nearbyRows({ ...base, bindStone: null }).some((r) => r.kind === 'bindStone')).toBe(false);
  });

  it('keeps the NPC hint and an empty object hint', () => {
    const rows = nearbyRows(base);
    expect(rows.find((r) => r.kind === 'npc')!.hint).toBe('NPC');
    expect(rows.find((r) => r.kind === 'object')!.hint).toBe('');
  });
});
