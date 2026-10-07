/**
 * Passage collapse (plan 51-03): an explored passage (terrainType 'passage') is a stop only while
 * someone stands in it. collapsePassageIfEmpty links the own-side neighbours to the far-side
 * neighbours, re-homes or deletes every row that points at the passage, and deletes it. The seed
 * is modelled on local passage 6: own place 5 in region 1, passage 6 in region 1, far place 4097
 * in region 4097. The strict mock db throws on an unknown table or accessor.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
// @ts-ignore node types are not part of this module's tsconfig (same as other source-reading tests)
import { readFileSync } from 'node:fs';
import { createMockCtx } from './test-utils';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

let passages: typeof import('./passages');
let online: typeof import('./online');

beforeAll(async () => {
  await import('../schema/tables');
  passages = await import('./passages');
  online = await import('./online');
});

const T0 = 1_700_000_000_000_000n;
const ALICE = { toHexString: () => 'a'.repeat(64) };

const place = (id: bigint, name: string, regionId: bigint, terrainType = 'plains') => ({
  id,
  name,
  description: `${name} lies here.`,
  zone: 'z',
  regionId,
  isSafe: true,
  bindStone: false,
  craftingAvailable: false,
  terrainType,
  levelOffset: 0n,
});

const link = (a: bigint, b: bigint, base = 1000n) => [
  { id: base + a * 10n + b, fromLocationId: a, toLocationId: b },
  { id: base + b * 10n + a, fromLocationId: b, toLocationId: a },
];

const character = (id: bigint, locationId: bigint, over: Record<string, unknown> = {}) => ({
  id,
  ownerUserId: 7n,
  name: `Char${id}`,
  locationId,
  boundLocationId: 5n,
  ...over,
});

/** The local passage-6 shape; extra rows are merged over it. */
function world(extra: Record<string, any[]> = {}, opts: { passage?: any } = {}) {
  const base: Record<string, any[]> = {
    location: [place(5n, 'Own Place', 1n), opts.passage ?? place(6n, 'The Narrows', 1n, 'passage'), place(4097n, 'Far Place', 4097n)],
    location_connection: [...link(5n, 6n), ...link(6n, 4097n)],
  };
  const seed: Record<string, any[]> = { ...base };
  for (const [k, v] of Object.entries(extra)) seed[k] = k in base ? [...base[k], ...v] : v;
  return createMockCtx({ seed, sender: ALICE, timestampMicros: T0, strict: true });
}

const table = (ctx: any, name: string): any[] => ctx.db._tables[name] ?? [];
const edges = (ctx: any): string[] =>
  table(ctx, 'location_connection').map((r) => `${r.fromLocationId}>${r.toLocationId}`).sort();
const locationIds = (ctx: any): bigint[] => table(ctx, 'location').map((r) => r.id);

describe('onlineCharacterIds', () => {
  it('returns the activeCharacterId of every player row that has one', () => {
    const ctx = createMockCtx({
      seed: {
        player: [
          { id: ALICE, userId: 7n, activeCharacterId: 1n },
          { id: { toHexString: () => 'b'.repeat(64) }, userId: 8n, activeCharacterId: undefined },
          { id: { toHexString: () => 'c'.repeat(64) }, userId: 9n, activeCharacterId: 3n },
        ],
      },
      strict: true,
    });
    const ids = online.onlineCharacterIds(ctx);
    expect([...ids].sort()).toEqual([1n, 3n]);
  });
});

describe('passageSides', () => {
  it('splits the neighbours into own side and far side', () => {
    const ctx = world();
    const sides = passages.passageSides(ctx, ctx.db.location.id.find(6n));
    expect(sides.own.map((l: any) => l.id)).toEqual([5n]);
    expect(sides.far.map((l: any) => l.id)).toEqual([4097n]);
  });

  it('orders each side by id and dedupes repeated connection rows', () => {
    const ctx = world({
      location: [place(3n, 'Other Own', 1n)],
      location_connection: [...link(3n, 6n, 2000n), { id: 9999n, fromLocationId: 6n, toLocationId: 5n }],
    });
    const sides = passages.passageSides(ctx, ctx.db.location.id.find(6n));
    expect(sides.own.map((l: any) => l.id)).toEqual([3n, 5n]);
    expect(sides.far.map((l: any) => l.id)).toEqual([4097n]);
  });
});

describe('collapsePassageIfEmpty', () => {
  it('with nobody at the passage: links own to far both ways, deletes the passage, its connections and its visited rows', () => {
    const ctx = world({
      visited_location: [
        { id: 1n, characterId: 1n, locationId: 6n, firstVisitedAt: ctx0(), fromLocationId: 5n },
        { id: 2n, characterId: 1n, locationId: 5n, firstVisitedAt: ctx0() },
      ],
    });
    expect(passages.collapsePassageIfEmpty(ctx, 6n)).toBe(true);
    expect(locationIds(ctx)).toEqual([5n, 4097n]);
    expect(edges(ctx)).toEqual(['4097>5', '5>4097']);
    expect(table(ctx, 'visited_location').map((r) => r.id)).toEqual([2n]);
  });

  it('does not duplicate a link that already exists', () => {
    const ctx = world({ location_connection: link(5n, 4097n, 3000n) });
    expect(passages.collapsePassageIfEmpty(ctx, 6n)).toBe(true);
    expect(edges(ctx)).toEqual(['4097>5', '5>4097']);
  });

  it('links every own neighbour to every far neighbour', () => {
    const ctx = world({
      location: [place(3n, 'Other Own', 1n), place(4098n, 'Other Far', 4097n)],
      location_connection: [...link(3n, 6n, 2000n), ...link(6n, 4098n, 2100n)],
    });
    expect(passages.collapsePassageIfEmpty(ctx, 6n)).toBe(true);
    expect(edges(ctx)).toEqual(['3>4097', '3>4098', '4097>3', '4097>5', '4098>3', '4098>5', '5>4097', '5>4098']);
  });

  it('with a character at the passage it returns false and changes nothing', () => {
    const ctx = world({ character: [character(1n, 6n)] });
    const before = JSON.stringify(ctx.db._tables, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v));
    expect(passages.collapsePassageIfEmpty(ctx, 6n)).toBe(false);
    expect(JSON.stringify(ctx.db._tables, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v))).toBe(before);
  });

  it('with no far neighbour it returns false and changes nothing', () => {
    const ctx = world({ location_connection: [] });
    ctx.db._tables.location_connection.length = 0;
    ctx.db._tables.location_connection.push(...link(5n, 6n));
    expect(passages.collapsePassageIfEmpty(ctx, 6n)).toBe(false);
    expect(locationIds(ctx)).toEqual([5n, 6n, 4097n]);
    expect(edges(ctx)).toEqual(['5>6', '6>5']);
  });

  it('with no own neighbour it returns false and changes nothing', () => {
    const ctx = world();
    ctx.db._tables.location_connection.length = 0;
    ctx.db._tables.location_connection.push(...link(6n, 4097n));
    expect(passages.collapsePassageIfEmpty(ctx, 6n)).toBe(false);
    expect(locationIds(ctx)).toEqual([5n, 6n, 4097n]);
    expect(edges(ctx)).toEqual(['4097>6', '6>4097']);
  });

  it.each(['uncharted', 'town', 'plains'])('a %s location is not a passage and is left alone', (terrainType) => {
    const ctx = world({}, { passage: place(6n, 'Not A Passage', 1n, terrainType) });
    expect(passages.collapsePassageIfEmpty(ctx, 6n)).toBe(false);
    expect(locationIds(ctx)).toEqual([5n, 6n, 4097n]);
    expect(edges(ctx)).toEqual(['4097>6', '5>6', '6>4097', '6>5']);
  });

  it('a missing location returns false', () => {
    const ctx = world();
    expect(passages.collapsePassageIfEmpty(ctx, 999n)).toBe(false);
  });
});

function ctx0() {
  return { microsSinceUnixEpoch: 5n };
}

describe('re-home: rows that point at the passage move to the lowest-id own neighbour', () => {
  const collapse = (extra: Record<string, any[]>) => {
    const ctx = world(extra);
    expect(passages.collapsePassageIfEmpty(ctx, 6n)).toBe(true);
    return ctx;
  };

  it('character.boundLocationId', () => {
    const ctx = collapse({ character: [character(1n, 5n, { boundLocationId: 6n }), character(2n, 5n, { boundLocationId: 4097n })] });
    expect(table(ctx, 'character').map((c) => [c.id, c.locationId, c.boundLocationId])).toEqual([
      [1n, 5n, 5n],
      [2n, 5n, 4097n],
    ]);
  });

  it('quest_template targetLocationId and sourceLocationId', () => {
    const ctx = collapse({
      quest_template: [
        { id: 1n, name: 'A', targetLocationId: 6n, sourceLocationId: 6n },
        { id: 2n, name: 'B', targetLocationId: 4097n, sourceLocationId: undefined },
        { id: 3n, name: 'C', targetLocationId: undefined, sourceLocationId: 6n },
      ],
    });
    expect(table(ctx, 'quest_template').map((q) => [q.id, q.targetLocationId, q.sourceLocationId])).toEqual([
      [1n, 5n, 5n],
      [2n, 4097n, undefined],
      [3n, undefined, 5n],
    ]);
  });

  it.each([
    ['quest_item', { id: 1n, characterId: 1n, questTemplateId: 1n, name: 'Relic', discovered: true, looted: false }],
    ['named_enemy', { id: 1n, characterId: 1n, name: 'Gor', enemyTemplateId: 1n, isAlive: true, respawnMinutes: 5n }],
    ['corpse', { id: 1n, characterId: 1n, createdAt: ctx0() }],
    ['event_objective', { id: 1n, eventId: 1n, objectiveType: 'explore', name: 'Cross', targetCount: 1n, currentCount: 0n }],
    ['npc', { id: 1n, name: 'Hale', npcType: 'vendor', description: 'd', greeting: 'g' }],
    ['combat_encounter', { id: 1n, state: 'ended', addCount: 0n, pendingAddCount: 0n }],
  ])('%s rows at the passage move to the own neighbour; rows elsewhere stay', (tableName, row) => {
    const ctx = collapse({
      [tableName as string]: [
        { ...(row as any), locationId: 6n },
        { ...(row as any), id: 2n, locationId: 4097n },
      ],
    });
    expect(table(ctx, tableName as string).map((r) => [r.id, r.locationId])).toEqual([
      [1n, 5n],
      [2n, 4097n],
    ]);
  });

  it('vendor_buyback rows move to the own neighbour', () => {
    const ctx = collapse({
      vendor_buyback: [
        { characterId: 1n, npcId: 1n, npcName: 'Hale', locationId: 6n, templateId: 1n, itemName: 'x', rarity: 'common', quantity: 1n, price: 1n },
        { characterId: 2n, npcId: 1n, npcName: 'Hale', locationId: 4097n, templateId: 1n, itemName: 'x', rarity: 'common', quantity: 1n, price: 1n },
      ],
    });
    expect(table(ctx, 'vendor_buyback').map((r) => [r.characterId, r.locationId])).toEqual([
      [1n, 5n],
      [2n, 4097n],
    ]);
  });

  it('event_spawn_item is re-homed, never deleted, and keeps its event, name and collection state', () => {
    const ctx = collapse({
      event_spawn_item: [
        { id: 1n, eventId: 9n, locationId: 6n, name: 'Shard', collected: true, collectedByCharacterId: 3n },
        { id: 2n, eventId: 9n, locationId: 4097n, name: 'Shard', collected: false, collectedByCharacterId: undefined },
      ],
    });
    expect(table(ctx, 'event_spawn_item')).toEqual([
      { id: 1n, eventId: 9n, locationId: 5n, name: 'Shard', collected: true, collectedByCharacterId: 3n },
      { id: 2n, eventId: 9n, locationId: 4097n, name: 'Shard', collected: false, collectedByCharacterId: undefined },
    ]);
  });

  it('re-homes to the lowest-id own neighbour', () => {
    const ctx = world({
      location: [place(3n, 'Lowest Own', 1n)],
      location_connection: link(3n, 6n, 2000n),
      character: [character(1n, 5n, { boundLocationId: 6n })],
    });
    expect(passages.collapsePassageIfEmpty(ctx, 6n)).toBe(true);
    expect(table(ctx, 'character')[0].boundLocationId).toBe(3n);
  });
});

describe('removal: rows that only make sense at the passage are deleted', () => {
  const collapse = (extra: Record<string, any[]>) => {
    const ctx = world(extra);
    expect(passages.collapsePassageIfEmpty(ctx, 6n)).toBe(true);
    return ctx;
  };

  it.each([
    ['search_result', { id: 1n, characterId: 1n, foundResources: false, foundQuestItem: false, foundNamedEnemy: false, searchedAt: ctx0() }],
    ['resource_node', { id: 1n, itemTemplateId: 1n, name: 'Ore', timeOfDay: 'any', quantity: 1n, state: 'available' }],
    ['event_spawn_enemy', { id: 1n, eventId: 1n, spawnId: 1n }],
    ['location_enemy_template', { id: 1n, enemyTemplateId: 1n }],
    ['pull_state', { id: 1n, characterId: 1n, enemySpawnId: 1n, pullType: 'careful', state: 'ended' }],
  ])('%s rows at the passage are deleted; rows elsewhere stay', (tableName, row) => {
    const ctx = collapse({
      [tableName as string]: [
        { ...(row as any), locationId: 6n },
        { ...(row as any), id: 2n, locationId: 5n },
      ],
    });
    expect(table(ctx, tableName as string).map((r) => [r.id, r.locationId])).toEqual([[2n, 5n]]);
  });

  it('enemy_respawn_tick rows at the passage are deleted by scheduledId', () => {
    const ctx = collapse({
      enemy_respawn_tick: [
        { scheduledId: 1n, scheduledAt: { tag: 'Time' }, locationId: 6n },
        { scheduledId: 2n, scheduledAt: { tag: 'Time' }, locationId: 5n },
      ],
    });
    expect(table(ctx, 'enemy_respawn_tick').map((r) => [r.scheduledId, r.locationId])).toEqual([[2n, 5n]]);
  });

  it('a deleted enemy_spawn takes its enemy_spawn_member rows; members of a spawn at 5 stay', () => {
    const ctx = collapse({
      enemy_spawn: [
        { id: 1n, locationId: 6n, enemyTemplateId: 1n, name: 'Wolves', state: 'available', groupCount: 2n },
        { id: 2n, locationId: 5n, enemyTemplateId: 1n, name: 'Rats', state: 'available', groupCount: 1n },
      ],
      enemy_spawn_member: [
        { id: 1n, spawnId: 1n, enemyTemplateId: 1n, roleTemplateId: 1n },
        { id: 2n, spawnId: 1n, enemyTemplateId: 1n, roleTemplateId: 1n },
        { id: 3n, spawnId: 2n, enemyTemplateId: 1n, roleTemplateId: 1n },
      ],
    });
    expect(table(ctx, 'enemy_spawn').map((r) => r.id)).toEqual([2n]);
    expect(table(ctx, 'enemy_spawn_member').map((r) => r.id)).toEqual([3n]);
  });
});

describe('history is kept', () => {
  it('world_gen_state.sourceLocationId and a visited row fromLocationId at another place keep the deleted id', () => {
    const ctx = world({
      world_gen_state: [{ id: 1n, sourceLocationId: 6n, step: 'COMPLETE' }],
      visited_location: [{ id: 1n, characterId: 1n, locationId: 4097n, firstVisitedAt: ctx0(), fromLocationId: 6n }],
    });
    expect(passages.collapsePassageIfEmpty(ctx, 6n)).toBe(true);
    expect(table(ctx, 'world_gen_state')[0].sourceLocationId).toBe(6n);
    expect(table(ctx, 'visited_location')[0].fromLocationId).toBe(6n);
  });
});

describe('PASSAGE_LOCATION_COLUMNS covers every location-id column in the schema', () => {
  it('classifies each `locationId` / `*LocationId` column of schema/tables.ts exactly once', () => {
    const source: string = readFileSync(new URL('../schema/tables.ts', import.meta.url), 'utf-8');
    const found: string[] = [];
    let current = '';
    for (const line of source.split('\n')) {
      const tableName = /name: '([a-z_]+)'/.exec(line);
      if (tableName) current = tableName[1];
      const column = /^\s*(locationId|[A-Za-z]*LocationId):\s*t\./.exec(line);
      if (column) found.push(`${current}.${column[1]}`);
    }
    const lists = passages.PASSAGE_LOCATION_COLUMNS;
    const classified = [...lists.rehome, ...lists.remove, ...lists.keep, ...lists.collapse, ...lists.ignore];

    const duplicated = classified.filter((c, i) => classified.indexOf(c) !== i);
    expect(duplicated, `classified twice: ${duplicated.join(', ')}`).toEqual([]);
    const unclassified = found.filter((c) => !classified.includes(c));
    expect(unclassified, `new location-id column(s) not in PASSAGE_LOCATION_COLUMNS: ${unclassified.join(', ')}`).toEqual([]);
    const stale = classified.filter((c) => !found.includes(c));
    expect(stale, `stale PASSAGE_LOCATION_COLUMNS entries: ${stale.join(', ')}`).toEqual([]);
    expect(found).toHaveLength(26);
    expect([lists.rehome.length, lists.remove.length, lists.keep.length, lists.collapse.length, lists.ignore.length]).toEqual([
      11, 8, 3, 3, 1,
    ]);
  });
});
