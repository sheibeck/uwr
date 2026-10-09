// Phase 51.3.1.2 (Bigger Regions), Plan 05: the region writers split in two.
//   writeRegionPlaces   stage 2a: region facts, the new places by the server's place count (D-03), the
//                       server shape (D-05), the hop gradient (D-04), hubs (D-07, D-62), the host floor,
//                       NPCs, services and the Edge Beyond doorway at the farthest place (D-05)
//   writeRegionFamilies stage 2b: the families from the region's real charted place count (D-08, D-66, D-67)
//   writeRegionFill     the legacy one-reply path (a world_gen job queued before the publish)
import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('./location', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./location')>()),
  // Connections as the real helper writes them: one row per direction.
  connectLocations: (ctx: any, fromId: bigint, toId: bigint) => {
    ctx.db.location_connection.insert({ id: 0n, fromLocationId: fromId, toLocationId: toId });
    ctx.db.location_connection.insert({ id: 0n, fromLocationId: toId, toLocationId: fromId });
  },
}));
vi.mock('./families', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./families')>()),
  ensurePoolsForLocation: () => {},
}));
vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

import {
  writeRegionStart,
  writeRegionPlaces,
  regionChartedPlaces,
  regionHubCount,
} from './world_gen';
import { hubCountFor, hubSeed } from '../data/density_rules';
import { DENSITY_RULES } from '../data/density_rules';
import { shapeRegionEdges } from '../data/region_shape';
import { createMockCtx } from './test-utils';
import { rowColumnProblems } from './schema_recorder';

beforeAll(async () => {
  await import('../schema/tables');
});

// ---------------------------------------------------------------------------
// Setup (the minimal mock-ctx pattern of world_gen.test.ts)
// ---------------------------------------------------------------------------

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };
const ts = { microsSinceUnixEpoch: T0 };
const DANGER_STEP = 50n + (T0 % 51n);
const SOURCE_LOCATION = 50n;
const PERSONALITY = { traits: ['quiet'], speechPattern: 'slow', knowledgeDomains: ['ferries'], secrets: [], affinityMultiplier: 1.0 };

function regionIdWithHubCount(danger: bigint, count: number, from = 2n): bigint {
  for (let id = from; id < from + 2000n; id += 1n) {
    if (hubCountFor(danger, false, hubSeed(id)) === count) return id;
  }
  throw new Error(`no region id with hub count ${count} at danger ${danger}`);
}

/** A world with a source region and its border place 50n; the state is GENERATING from that place. */
function makeCtx(regionId: bigint, danger = 150n) {
  const sourceDanger = danger - DANGER_STEP;
  const items = ['Wood', 'Peat', 'Scrap Cloth', 'Flax', 'Herbs'].map((name, i) => ({ id: 700n + BigInt(i), name, slot: 'resource' }));
  return createMockCtx({
    seed: {
      player: [{ id: alice, userId: 7n }],
      character: [{ id: 10n, ownerUserId: 7n, name: 'Aldric', race: 'Kobold', className: 'Ashweaver', locationId: SOURCE_LOCATION }],
      region: [{ id: regionId - 1n, name: 'Source', dangerMultiplier: sourceDanger }],
      location: [
        {
          id: SOURCE_LOCATION,
          name: 'Source Gate',
          description: 'g',
          zone: 'Source',
          regionId: regionId - 1n,
          levelOffset: 0n,
          isSafe: true,
          terrainType: 'plains',
          bindStone: false,
          craftingAvailable: false,
          shortName: '',
          placeNoun: '',
          isHub: false,
        },
      ],
      world_gen_state: [
        { id: 5n, playerId: alice, characterId: 10n, sourceLocationId: SOURCE_LOCATION, sourceRegionId: regionId - 1n, step: 'FILLING', createdAt: ts, updatedAt: ts },
      ],
      item_template: items,
    },
    sender: alice,
    timestampMicros: T0,
    strict: true,
  });
}

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const stateOf = (ctx: any) => rows(ctx, 'world_gen_state')[0];
const locRow = (ctx: any, name: string) => rows(ctx, 'location').find((l: any) => l.name === name);

function startReply(over: Record<string, unknown> = {}) {
  return {
    regionName: 'Test Region',
    regionDescription: 'A test region.',
    biome: 'forest',
    startLocation: { name: 'Safe Haven', description: 'A safe place.', terrainType: 'town', levelOffset: 0, ...over },
    firstNpc: { name: 'Oswin Tarr', gender: 'male', npcType: 'lore', description: 'A figure at the crossing.', greeting: 'Well met.', personality: PERSONALITY },
  };
}

function stageOne(ctx: any, start: any = startReply()) {
  const out = writeRegionStart(ctx, start, stateOf(ctx));
  ctx.db.world_gen_state.id.update({ ...stateOf(ctx), generatedRegionId: out.region.id });
  return out;
}

/** One reply location: hostile plains with a reply levelOffset of 9 (the server never reads it, D-04). */
function place(name: string, over: Record<string, unknown> = {}) {
  return { name, description: `About ${name}.`, terrainType: 'plains', isHub: false, isSafe: false, levelOffset: 9, connectsTo: [] as string[], ...over };
}

/** n places in a chain: Place 1 to the arrival point, Place i to Place i - 1. */
function chain(n: number, over: Record<string, unknown> = {}) {
  return Array.from({ length: n }, (_, i) => place(`Place ${i + 1}`, { connectsTo: [i === 0 ? 'Safe Haven' : `Place ${i}`], ...over }));
}

/** A stage-2a reply (no families). */
function placesReply(locations: any[], over: Record<string, unknown> = {}) {
  return {
    dominantFaction: 'The Brine Wardens',
    landmarks: ['The Salt Stair'],
    threats: ['skitterers in the reeds'],
    arrival: { shortName: 'Haven', placeNoun: 'the haven', isHub: false },
    locations,
    npcs: [] as any[],
    ...over,
  };
}

function world(opts: { hubs?: number; start?: any } = {}) {
  const regionId = regionIdWithHubCount(150n, opts.hubs ?? 1);
  const ctx = makeCtx(regionId);
  const { region, startLocation } = stageOne(ctx, opts.start ?? startReply());
  expect(region.id).toBe(regionId);
  return { ctx, region, startLocation };
}

function places2a(ctx: any, region: any, startLocation: any, reply: any, placeCount: number | null) {
  return writeRegionPlaces(ctx, reply, stateOf(ctx), region, startLocation, { placeCount });
}

/** The region's charted places (not the doorway, not the source region). */
const charted = (ctx: any, regionId: bigint) =>
  rows(ctx, 'location').filter((l: any) => l.regionId === regionId && l.terrainType !== 'uncharted');

/** In-region undirected edges between charted places, smaller id first, no repeats. */
function regionEdges(ctx: any, regionId: bigint): [bigint, bigint][] {
  const ids = new Set<bigint>(charted(ctx, regionId).map((l: any) => l.id));
  const seen = new Set<string>();
  const out: [bigint, bigint][] = [];
  for (const c of rows(ctx, 'location_connection')) {
    if (!ids.has(c.fromLocationId) || !ids.has(c.toLocationId)) continue;
    const a = c.fromLocationId < c.toLocationId ? c.fromLocationId : c.toLocationId;
    const b = c.fromLocationId < c.toLocationId ? c.toLocationId : c.fromLocationId;
    const key = `${a}:${b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([a, b]);
  }
  return out;
}

function hopsOver(edges: readonly [bigint, bigint][], start: bigint): Map<bigint, number> {
  const hops = new Map<bigint, number>([[start, 0]]);
  const queue = [start];
  while (queue.length > 0) {
    const at = queue.shift() as bigint;
    for (const [a, b] of edges) {
      const next = a === at ? b : b === at ? a : null;
      if (next === null || hops.has(next)) continue;
      hops.set(next, hops.get(at)! + 1);
      queue.push(next);
    }
  }
  return hops;
}

const neighbours = (ctx: any, id: bigint): bigint[] =>
  rows(ctx, 'location_connection').filter((c: any) => c.fromLocationId === id).map((c: any) => c.toLocationId);

const services = (ctx: any, locationId: bigint) =>
  rows(ctx, 'npc')
    .filter((n: any) => n.locationId === locationId && (n.npcType === 'vendor' || n.npcType === 'banker'))
    .map((n: any) => n.npcType)
    .sort();

const SNAP_TABLES = ['region', 'location', 'location_connection', 'npc'];
const snapshot = (ctx: any) => Object.fromEntries(SNAP_TABLES.map((t) => [t, rows(ctx, t).map((r: any) => ({ ...r }))]));

// ---------------------------------------------------------------------------
// Task 1: writeRegionPlaces
// ---------------------------------------------------------------------------

describe('writeRegionPlaces: place count, trim and floor (D-03, Pitfall 11)', () => {
  it('11 usable places with placeCount 9 keep the first 8 in reply order, plus the doorway; trimmed names are ignored everywhere', () => {
    const { ctx, region, startLocation } = world();
    const locations = chain(11);
    locations[2] = { ...locations[2]!, connectsTo: ['Place 2', 'Place 10'] };
    locations[9] = { ...locations[9]!, isHub: true, isSafe: true };
    const reply = placesReply(locations, {
      npcs: [
        { name: 'Mara Quill', gender: 'female', npcType: 'lore', locationName: 'Place 10', description: 'A hermit.', greeting: 'Hm.', personality: PERSONALITY },
        { name: 'Bram Teller', gender: 'male', npcType: 'lore', locationName: 'Place 4', description: 'A guide.', greeting: 'Ho.', personality: PERSONALITY },
      ],
    });
    const out = places2a(ctx, region, startLocation, reply, 9);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.locations.map((l: any) => l.name)).toEqual(['Place 1', 'Place 2', 'Place 3', 'Place 4', 'Place 5', 'Place 6', 'Place 7', 'Place 8']);
    expect(charted(ctx, region.id)).toHaveLength(9);
    expect(out.boundary).toMatchObject({ name: 'The Edge Beyond Test Region', terrainType: 'uncharted', regionId: region.id });
    for (const name of ['Place 9', 'Place 10', 'Place 11']) expect(locRow(ctx, name)).toBeUndefined();
    // The NPC naming a trimmed place stands at the arrival point; the other at its place.
    expect(rows(ctx, 'npc').find((n: any) => n.name === 'Mara Quill').locationId).toBe(startLocation.id);
    expect(rows(ctx, 'npc').find((n: any) => n.name === 'Bram Teller').locationId).toBe(locRow(ctx, 'Place 4').id);
    // The hub mark on a trimmed place is ignored: the one hub is a kept place.
    const hubs = charted(ctx, region.id).filter((l: any) => l.isHub);
    expect(hubs).toHaveLength(regionHubCount(region, false));
    // Region facts are written.
    expect(rows(ctx, 'region').find((r: any) => r.id === region.id)).toMatchObject({ dominantFaction: 'The Brine Wardens' });
  });

  it('placeCount 9 with 5 usable places writes 5 (6 in all, at the floor)', () => {
    const { ctx, region, startLocation } = world();
    const out = places2a(ctx, region, startLocation, placesReply(chain(5)), 9);
    expect(out.ok).toBe(true);
    expect(charted(ctx, region.id)).toHaveLength(6);
    expect(DENSITY_RULES.REGION_PLACES_FLOOR).toBe(6);
  });

  it('placeCount 9 with 4 usable places returns too_few and leaves location, connection, npc and region rows unchanged (T-51.3.1.2-15)', () => {
    const { ctx, region, startLocation } = world();
    const before = snapshot(ctx);
    const reply = placesReply(chain(4), {
      npcs: [{ name: 'Mara Quill', gender: 'female', npcType: 'vendor', locationName: 'Place 1', description: 'A hermit.', greeting: 'Hm.', personality: PERSONALITY }],
    });
    expect(places2a(ctx, region, startLocation, reply, 9)).toEqual({ ok: false, reason: 'too_few' });
    expect(snapshot(ctx)).toEqual(before);
  });

  it('with no place count: 3 usable places write 3 (no floor), 12 write 9 (REGION_PLACES_MAX - 1)', () => {
    const small = world();
    const a = places2a(small.ctx, small.region, small.startLocation, placesReply(chain(3)), null);
    expect(a.ok).toBe(true);
    expect(charted(small.ctx, small.region.id)).toHaveLength(4);

    const big = world();
    const b = places2a(big.ctx, big.region, big.startLocation, placesReply(chain(12)), null);
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.locations.map((l: any) => l.name)).toEqual(chain(9).map((l) => l.name));
  });

  it('a duplicate name (case-insensitive, the arrival point included) is skipped before counting', () => {
    const { ctx, region, startLocation } = world();
    const dupes = [place('SAFE HAVEN'), place('Place 1', { connectsTo: ['Safe Haven'] }), place('place 1'), place('Place 2'), place('Place 3'), place('Place 4')];
    const before = snapshot(ctx);
    // Six items but four usable names: 5 places in all, below the floor.
    expect(places2a(ctx, region, startLocation, placesReply(dupes), 9)).toEqual({ ok: false, reason: 'too_few' });
    expect(snapshot(ctx)).toEqual(before);

    const again = world();
    const out = places2a(again.ctx, again.region, again.startLocation, placesReply(dupes), null);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.locations.map((l: any) => l.name)).toEqual(['Place 1', 'Place 2', 'Place 3', 'Place 4']);
    expect(locRow(again.ctx, 'Safe Haven').description).toBe('A safe place.');
  });
});

describe('writeRegionPlaces: deliberate shape (D-05)', () => {
  const names = (n: number) => Array.from({ length: n }, (_, i) => `Place ${i + 1}`);
  const SHAPES: Record<string, any[]> = {
    chain: chain(9),
    'nine-spoke star on the arrival point': names(9).map((n) => place(n, { connectsTo: ['Safe Haven'] })),
    'two components': names(9).map((n, i) =>
      place(n, { connectsTo: i < 4 ? [i === 0 ? 'Safe Haven' : `Place ${i}`] : i === 4 ? [] : [`Place ${i}`] }),
    ),
    'self loops and unknown names': names(9).map((n, i) => place(n, { connectsTo: [n, 'Nowhere', i % 2 === 0 ? 'Safe Haven' : 'Elsewhere'] })),
    'a dense clique': names(9).map((n) => place(n, { connectsTo: ['Safe Haven', ...names(9).filter((m) => m !== n)] })),
  };

  for (const [label, locations] of Object.entries(SHAPES)) {
    it(`${label}: every place reachable, at most 4 exits unless only bridges remain, the source passage kept`, () => {
      const { ctx, region, startLocation } = world();
      const out = places2a(ctx, region, startLocation, placesReply(locations), null);
      expect(out.ok).toBe(true);
      const edges = regionEdges(ctx, region.id);
      const hops = hopsOver(edges, startLocation.id);
      for (const loc of charted(ctx, region.id)) expect(hops.has(loc.id), loc.name).toBe(true);
      for (const loc of charted(ctx, region.id)) {
        const mine = edges.filter(([a, b]) => a === loc.id || b === loc.id);
        if (mine.length <= DENSITY_RULES.EXIT_DEGREE_CAP) continue;
        // Over the cap: every remaining edge must be a bridge.
        for (const edge of mine) {
          const rest = edges.filter((e) => e !== edge);
          const reached = hopsOver(rest, startLocation.id);
          expect(charted(ctx, region.id).some((l: any) => !reached.has(l.id)), `${loc.name} keeps a non-bridge edge`).toBe(true);
        }
      }
      expect(neighbours(ctx, startLocation.id)).toContain(SOURCE_LOCATION);
      expect(neighbours(ctx, SOURCE_LOCATION)).toContain(startLocation.id);
      // No connection row is written twice.
      const keys = rows(ctx, 'location_connection').map((c: any) => `${c.fromLocationId}>${c.toLocationId}`);
      expect(new Set(keys).size).toBe(keys.length);
    });
  }

  it('the in-region edges are exactly shapeRegionEdges over the reply connectsTo (index 0 the arrival point)', () => {
    const { ctx, region, startLocation } = world();
    const locations = SHAPES['a dense clique']!;
    const out = places2a(ctx, region, startLocation, placesReply(locations), null);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const ids = [startLocation.id, ...out.locations.map((l: any) => l.id)];
    const indexOf = new Map<string, number>([['safe haven', 0], ...locations.map((l: any, i: number) => [l.name.toLowerCase(), i + 1] as [string, number])]);
    const raw: [number, number][] = [];
    locations.forEach((l: any, i: number) => {
      for (const target of l.connectsTo) {
        const j = indexOf.get(String(target).toLowerCase());
        if (j !== undefined) raw.push([i + 1, j]);
      }
    });
    const expected = shapeRegionEdges({ count: ids.length, edges: raw }).map(([a, b]) => `${ids[a]}:${ids[b]}`).sort();
    expect(regionEdges(ctx, region.id).map(([a, b]) => `${a}:${b}`).sort()).toEqual(expected);
  });
});

describe('writeRegionPlaces: hop gradient (D-04)', () => {
  it('with the arrival offset 1: 1 hop is 1, 2 hops 2, 5 hops 3; the reply levelOffset of 9 is ignored', () => {
    const { ctx, region, startLocation } = world({ start: startReply({ levelOffset: 1 }) });
    expect(startLocation.levelOffset).toBe(1n);
    const out = places2a(ctx, region, startLocation, placesReply(chain(6)), null);
    expect(out.ok).toBe(true);
    const offset = (n: string) => locRow(ctx, n).levelOffset;
    expect(offset('Safe Haven')).toBe(1n);
    expect(offset('Place 1')).toBe(1n);
    expect(offset('Place 2')).toBe(2n);
    expect(offset('Place 3')).toBe(2n);
    expect(offset('Place 4')).toBe(3n);
    expect(offset('Place 5')).toBe(3n);
    expect(offset('Place 6')).toBe(3n);
    for (const loc of charted(ctx, region.id)) expect(loc.levelOffset).not.toBe(9n);
  });
});

describe('writeRegionPlaces: hubs, host floor and the doorway (D-05, D-07, D-59, D-62)', () => {
  for (const hubCount of [0, 1, 2]) {
    it(`hub count ${hubCount}: regionHubCount hubs, each safe with a vendor and a banker; no vendor or banker elsewhere`, () => {
      const { ctx, region, startLocation } = world({ hubs: hubCount });
      const locations = chain(8).map((l, i) => (i === 3 ? { ...l, isSafe: true, terrainType: 'town' } : l));
      const out = places2a(
        ctx,
        region,
        startLocation,
        placesReply(locations, {
          npcs: [{ name: 'Tam Coin', gender: 'male', npcType: 'vendor', locationName: 'Place 7', description: 'A peddler.', greeting: 'Buy?', personality: PERSONALITY }],
        }),
        9,
      );
      expect(out.ok).toBe(true);
      const hubs = charted(ctx, region.id).filter((l: any) => l.isHub);
      expect(hubs).toHaveLength(regionHubCount(region, false));
      expect(hubs).toHaveLength(hubCount);
      for (const hub of hubs) {
        expect(hub.isSafe).toBe(true);
        expect(services(ctx, hub.id)).toEqual(['banker', 'vendor']);
      }
      for (const loc of rows(ctx, 'location').filter((l: any) => l.regionId === region.id && !l.isHub)) {
        expect(services(ctx, loc.id)).toEqual([]);
      }
    });
  }

  it('every new place marked safe and no hub: at least 4 hosts after the write, the flipped ones the farthest; a hub is never flipped', () => {
    const { ctx, region, startLocation } = world({ hubs: 1 });
    const out = places2a(ctx, region, startLocation, placesReply(chain(9, { isSafe: true })), null);
    expect(out.ok).toBe(true);
    const edges = regionEdges(ctx, region.id);
    const hops = hopsOver(edges, startLocation.id);
    const all = charted(ctx, region.id);
    const hosts = all.filter((l: any) => !l.isSafe && !l.isHub);
    expect(hosts.length).toBeGreaterThanOrEqual(DENSITY_RULES.MIN_HOST_PLACES);
    expect(hosts).toHaveLength(DENSITY_RULES.MIN_HOST_PLACES);
    for (const hub of all.filter((l: any) => l.isHub)) expect(hub.isSafe).toBe(true);
    // Every flipped place is at least as far as every non-hub place that stayed safe.
    const stayedSafe = all.filter((l: any) => l.isSafe && !l.isHub && l.id !== startLocation.id);
    const nearestFlipped = Math.min(...hosts.map((l: any) => hops.get(l.id)!));
    for (const loc of stayedSafe) expect(hops.get(loc.id)!).toBeLessThanOrEqual(nearestFlipped);
    expect(hosts.map((l: any) => l.name).sort()).toEqual(['Place 6', 'Place 7', 'Place 8', 'Place 9']);
  });

  it('the arrival point keeps its stage-1 safety (never flipped by the host floor)', () => {
    const { ctx, region, startLocation } = world({ hubs: 0, start: startReply({ terrainType: 'plains' }) });
    expect(startLocation.isSafe).toBe(true);
    const out = places2a(ctx, region, startLocation, placesReply(chain(2, { isSafe: true })), null);
    expect(out.ok).toBe(true);
    expect(locRow(ctx, 'Safe Haven').isSafe).toBe(true);
    expect(locRow(ctx, 'Place 1').isSafe).toBe(false);
    expect(locRow(ctx, 'Place 2').isSafe).toBe(false);
  });

  it('the doorway is a new uncharted place connected only to the farthest non-safe non-hub place (ties by lowest id)', () => {
    const { ctx, region, startLocation } = world({ hubs: 1 });
    const locations = [
      place('Place 1', { connectsTo: ['Safe Haven'] }),
      place('Place 2', { connectsTo: ['Place 1'] }),
      place('Place 3', { connectsTo: ['Place 1'] }),
      place('Place 4', { connectsTo: ['Place 2'], isSafe: true, terrainType: 'town' }),
      place('Place 5', { connectsTo: ['Safe Haven'] }),
      place('Place 6', { connectsTo: ['Place 5'] }),
    ];
    const out = places2a(ctx, region, startLocation, placesReply(locations), null);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const doorway = out.boundary;
    expect(doorway).toMatchObject({ name: 'The Edge Beyond Test Region', terrainType: 'uncharted', zone: 'Uncharted', isSafe: true, regionId: region.id });
    expect(charted(ctx, region.id).some((l: any) => l.id === doorway.id)).toBe(false);
    // Place 4 (3 hops) is safe; Place 2 and Place 3 tie at 2 hops: the lower id wins.
    expect(locRow(ctx, 'Place 4').isSafe).toBe(true);
    expect(neighbours(ctx, doorway.id)).toEqual([locRow(ctx, 'Place 2').id]);
    expect(rows(ctx, 'location_connection').filter((c: any) => c.toLocationId === doorway.id).map((c: any) => c.fromLocationId)).toEqual([
      locRow(ctx, 'Place 2').id,
    ]);
  });

  it('never writes a family, member, enemy link, enemy template or creature pool, even with families and enemies in the reply', () => {
    const { ctx, region, startLocation } = world();
    const reply = placesReply(chain(8), {
      families: [{ name: 'Saltcrust Skitterers', singularNoun: 'skitterer', pluralNoun: 'skitterers', members: [{ role: 'tank', name: 'Skitter Shellback' }] }],
      enemies: [{ name: 'Wolf', creatureType: 'beast', role: 'melee', terrainTypes: 'plains', level: 1 }],
    });
    expect(places2a(ctx, region, startLocation, reply, 9).ok).toBe(true);
    for (const table of ['creature_family', 'family_member', 'location_enemy_template', 'enemy_template']) {
      expect(rows(ctx, table), table).toEqual([]);
    }
    expect(rows(ctx, 'place_pool').filter((p: any) => p.kind === 'creature')).toEqual([]);
  });

  it('every row it writes matches the recorded schema', () => {
    const { ctx, region, startLocation } = world();
    places2a(ctx, region, startLocation, placesReply(chain(9)), 10);
    for (const table of ['region', 'location', 'location_connection', 'npc']) {
      for (const row of rows(ctx, table)) {
        if (table === 'region' && row.id !== region.id) continue;
        if (table === 'location' && row.id === SOURCE_LOCATION) continue;
        expect(rowColumnProblems(table, row)).toEqual([]);
      }
    }
  });
});

describe('regionChartedPlaces', () => {
  it('the arrival point first, then the other charted places by id; the doorway excluded', () => {
    const { ctx, region, startLocation } = world();
    const out = places2a(ctx, region, startLocation, placesReply(chain(7)), 8);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const got = regionChartedPlaces(ctx, region.id);
    expect(got.map((l: any) => l.id)).toEqual([startLocation.id, ...out.locations.map((l: any) => l.id)]);
    expect(got.some((l: any) => l.terrainType === 'uncharted')).toBe(false);
  });
});
