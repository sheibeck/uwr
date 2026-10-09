import { describe, expect, it } from 'vitest';
import * as nearby from './nearby';
import { nearbyRows } from './nearby';

// 51.3.1.1-19: resources are pools now (Nearby resource cards), so the node kind, visibleNodes and
// nodeStatus are gone. NPC, bind stone, object and player rows are unchanged ('Also here').

describe('the node kind is retired (51.3.1.1-19)', () => {
  it('exports no node helpers', () => {
    expect('visibleNodes' in nearby).toBe(false);
    expect('nodeStatus' in nearby).toBe(false);
  });

  it('rows carry no nodeStatus and take no nodes input', () => {
    const rows = nearbyRows({
      npcs: [{ id: 1n, name: 'Ferryman', npcType: 'quest' }],
      players: [],
      selfId: null,
    });
    expect(rows).toHaveLength(1);
    expect('nodeStatus' in rows[0]).toBe(false);
    expect(rows.some((r) => (r.kind as string) === 'node')).toBe(false);
  });
});

describe('nearbyRows', () => {
  const base = {
    npcs: [
      { id: 2n, name: 'Marisol', npcType: 'vendor' },
      { id: 1n, name: 'ferryman', npcType: 'quest' },
    ],
    players: [
      { id: 5n, name: 'Zed', level: 4n, online: true },
      { id: 6n, name: 'Amy', level: 7n, online: true },
      { id: 9n, name: 'Me', level: 3n, online: true },
    ],
    selfId: 9n,
  };

  it('orders npc, object, player and alphabetically inside a group', () => {
    const rows = nearbyRows({ ...base, objects: [{ id: 50n, name: 'Old Well' }] });
    expect(rows.map((r) => `${r.kind}:${r.name}`)).toEqual([
      'npc:ferryman',
      'npc:Marisol',
      'object:Old Well',
      'player:Amy',
      'player:Zed',
    ]);
  });

  it('writes the hint per kind and flags vendors', () => {
    const rows = nearbyRows({ ...base, objects: [{ id: 50n, name: 'Old Well' }] });
    const hint = (name: string) => rows.find((r) => r.name === name)!.hint;
    expect(hint('Marisol')).toBe('NPC');
    expect(hint('Old Well')).toBe('');
    expect(hint('Amy')).toBe('Lv 7');
    expect(rows.filter((r) => r.vendor).map((r) => r.name)).toEqual(['Marisol']);
  });

  it('carries the player level and none for an NPC', () => {
    const rows = nearbyRows(base);
    expect(rows.find((r) => r.name === 'Marisol')).toMatchObject({ level: null });
    expect(rows.find((r) => r.name === 'Amy')).toMatchObject({ level: 7n });
  });

  it('excludes the player and defaults objects to none', () => {
    const rows = nearbyRows(base);
    expect(rows.some((r) => r.name === 'Me')).toBe(false);
    expect(rows.some((r) => r.kind === 'object')).toBe(false);
  });

  it('lists a player only when online is exactly true (CONTEXT Area 2)', () => {
    const rows = nearbyRows({
      npcs: [],
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
      players: [
        { id: 5n, name: 'Zed', level: 4n, online: false },
        { id: 6n, name: 'Amy', level: 7n, online: true },
      ],
      bindStone: { placeName: 'The Crossing', bound: false },
      selfId: null,
    });
    expect(rows.map((r) => `${r.kind}:${r.name}`)).toEqual(['npc:Ferryman', 'bindStone:Bind stone', 'player:Amy']);
  });

  it('hints In your party for a party member and Lv n for anyone else', () => {
    const rows = nearbyRows({ ...base, partyIds: new Set([6n]) });
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
      players: [],
      selfId: null,
    });
    expect(rows.map((r) => r.id)).toEqual([3n, 8n]);
  });

  it('returns [] when nothing is here', () => {
    expect(nearbyRows({ npcs: [], players: [], selfId: null })).toEqual([]);
    expect(nearbyRows({ npcs: [], players: [], objects: [], selfId: 1n })).toEqual([]);
  });
});

describe('nearbyRows bind stone', () => {
  const base = {
    npcs: [{ id: 1n, name: 'Ferryman', npcType: 'quest' }],
    players: [{ id: 5n, name: 'Zed', level: 4n, online: true }],
    objects: [{ id: 50n, name: 'Old Well' }],
    selfId: 9n,
  };

  it('puts the bind stone after every NPC and before objects', () => {
    const rows = nearbyRows({ ...base, bindStone: { placeName: 'The Crossing', bound: false } });
    expect(rows.map((r) => r.kind)).toEqual(['npc', 'bindStone', 'object', 'player']);
  });

  it('has a fixed name and an empty hint when not bound', () => {
    const row = nearbyRows({ ...base, bindStone: { placeName: 'The Crossing', bound: false } }).find(
      (r) => r.kind === 'bindStone',
    )!;
    expect(row).toMatchObject({ name: 'Bind stone', hint: '', bound: false, vendor: false });
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
