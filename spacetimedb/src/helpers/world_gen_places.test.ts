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
  writeRegionFamilies,
  writeRegionFill,
  regionChartedPlaces,
  regionHubCount,
} from './world_gen';
import { familyCountFor, hubCountFor, hubSeed } from '../data/density_rules';
import { FAMILY_FEUD_KIND } from '../data/mechanical_vocabulary';
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
  const sourceDanger = danger >= 800n ? 800n : danger - DANGER_STEP;
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
  // Hub count 0 needs a deep region (D-62: below danger 200 every region has a hub).
  const danger = opts.hubs === 0 ? 800n : 150n;
  const regionId = regionIdWithHubCount(danger, opts.hubs ?? 1);
  const ctx = makeCtx(regionId, danger);
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

// ---------------------------------------------------------------------------
// Task 2: writeRegionFamilies and the legacy writeRegionFill
// ---------------------------------------------------------------------------

const member = (role: string, name: string) => ({ role, name });
/** Two valid AI families (the approved 2b reply shape), fit to Place 2 and Place 3. */
function aiFamilies(): any[] {
  return [
    {
      name: 'Saltcrust Skitterers',
      singularNoun: 'skitterer',
      pluralNoun: 'skitterers',
      creatureType: 'beast',
      iconKey: 'insect',
      temperament: 'aggressive',
      ambushVerb: 'swarm',
      ambushRest: 'up through the salt',
      members: [member('tank', 'Skitter Shellback'), member('damage', 'Skitter Pincer'), member('caster', 'Skitter Saltspitter')],
      fitLocations: ['Place 2', 'Place 3'],
      relations: [{ family: 'Drowned Tollmen', kind: 'rival' }],
    },
    {
      name: 'Drowned Tollmen',
      singularNoun: 'tollman',
      pluralNoun: 'tollmen',
      creatureType: 'undead',
      iconKey: 'undead',
      temperament: 'wary',
      ambushVerb: 'rise',
      ambushRest: 'from the black water',
      members: [member('tank', 'Tollman Warden'), member('damage', 'Tollman Hook')],
      fitLocations: ['Place 3'],
      relations: [],
    },
  ];
}

const FAMILY_TABLES = ['creature_family', 'family_member', 'enemy_template', 'location_enemy_template', 'family_relation', 'place_pool', 'pool_level'];
const familyRowsEmpty = (ctx: any) => {
  for (const table of FAMILY_TABLES) expect(rows(ctx, table), table).toEqual([]);
};
const creaturePools = (ctx: any, loc: any) =>
  rows(ctx, 'place_pool').filter((p: any) => p.locationId === loc.id && p.kind === 'creature').map((p: any) => p.refId);

/** A region of `places` charted places (arrival included) written by stage 2a, with its doorway. */
function placedWorld(places: number, opts: { hubs?: number } = {}) {
  const w = world({ hubs: opts.hubs ?? 1 });
  const out = places2a(w.ctx, w.region, w.startLocation, placesReply(chain(places - 1)), places);
  expect(out.ok).toBe(true);
  if (!out.ok) throw new Error('stage 2a refused');
  expect(regionChartedPlaces(w.ctx, w.region.id)).toHaveLength(places);
  return { ...w, boundary: out.boundary };
}

describe('writeRegionFamilies (stage 2b; D-08, D-66, D-67, D-68, D-70, SC3)', () => {
  for (const [places, expected] of [[8, 12], [9, 13], [10, 15]] as const) {
    it(`${places} charted places (the doorway present, not counted) get familyCountFor(${places}) = ${expected} families: the AI ones first, the rest by rule`, () => {
      const { ctx, region, boundary } = placedWorld(places);
      expect(boundary).toBeDefined();
      expect(familyCountFor(places)).toBe(expected);
      const out = writeRegionFamilies(ctx, { families: aiFamilies() }, region, { ruleOnlyAllowed: false });
      expect(out.ok).toBe(true);
      const families = rows(ctx, 'creature_family');
      expect(families).toHaveLength(expected);
      if (out.ok) expect(out.families).toHaveLength(expected);
      expect(families.slice(0, 2).map((f: any) => f.key)).toEqual([`ai:${region.id}:saltcrust skitterers`, `ai:${region.id}:drowned tollmen`]);
      for (const family of families.slice(2)) expect(family.key.startsWith(`rule:${region.id}:`)).toBe(true);
    });
  }

  it('every host place holds 3-5 families; every family is placed; the feud has 0 or 2-3 families; every family has a history; the doorway hosts nothing', () => {
    const { ctx, region, boundary } = placedWorld(9);
    expect(writeRegionFamilies(ctx, { families: aiFamilies() }, region, { ruleOnlyAllowed: false }).ok).toBe(true);
    const hosts = regionChartedPlaces(ctx, region.id).filter((l: any) => !l.isSafe && !l.isHub);
    expect(hosts.length).toBeGreaterThanOrEqual(DENSITY_RULES.MIN_HOST_PLACES);
    for (const host of hosts) {
      const n = creaturePools(ctx, host).length;
      expect(n, host.name).toBeGreaterThanOrEqual(3);
      expect(n, host.name).toBeLessThanOrEqual(5);
    }
    for (const safe of regionChartedPlaces(ctx, region.id).filter((l: any) => l.isSafe || l.isHub)) {
      expect(creaturePools(ctx, safe)).toEqual([]);
    }
    const families = rows(ctx, 'creature_family');
    for (const family of families) {
      expect(rows(ctx, 'place_pool').some((p: any) => p.kind === 'creature' && p.refId === family.id), family.name).toBe(true);
      expect(family.history).not.toBe('');
    }
    const feudIds = new Set(rows(ctx, 'family_relation').filter((r: any) => r.kind === FAMILY_FEUD_KIND).map((r: any) => r.familyId));
    expect([0, 2, 3]).toContain(feudIds.size);
    expect(rows(ctx, 'place_pool').filter((p: any) => p.locationId === boundary.id)).toEqual([]);
    expect(rows(ctx, 'location_enemy_template').filter((l: any) => l.locationId === boundary.id)).toEqual([]);
  });

  it('a reply with no families array returns malformed and writes no family, member, template, link, relation or pool row', () => {
    for (const reply of [{}, { families: 'many' }, null, { families: { name: 'x' } }]) {
      const { ctx, region } = placedWorld(8);
      expect(writeRegionFamilies(ctx, reply, region, { ruleOnlyAllowed: true })).toEqual({ ok: false, reason: 'malformed' });
      familyRowsEmpty(ctx);
    }
  });

  it('families that all fail validation: empty with nothing written when rule completion is not allowed; the whole count by rule when it is', () => {
    const refused = placedWorld(9);
    expect(writeRegionFamilies(refused.ctx, { families: [null, 'x', 7] }, refused.region, { ruleOnlyAllowed: false })).toEqual({
      ok: false,
      reason: 'empty',
    });
    familyRowsEmpty(refused.ctx);

    const ruled = placedWorld(9);
    expect(writeRegionFamilies(ruled.ctx, { families: [null, 'x', 7] }, ruled.region, { ruleOnlyAllowed: true }).ok).toBe(true);
    const keys = rows(ruled.ctx, 'creature_family').map((f: any) => f.key);
    expect(keys).toHaveLength(familyCountFor(9));
    expect(keys.every((k: string) => k.startsWith(`rule:${ruled.region.id}:`))).toBe(true);
  });

  it('every row it writes matches the recorded schema', () => {
    const { ctx, region } = placedWorld(10);
    writeRegionFamilies(ctx, { families: aiFamilies() }, region, { ruleOnlyAllowed: false });
    for (const table of FAMILY_TABLES) {
      expect(rows(ctx, table).length, table).toBeGreaterThan(0);
      for (const row of rows(ctx, table)) expect(rowColumnProblems(table, row)).toEqual([]);
    }
  });
});

describe('writeRegionFill: the legacy one-reply path (a world_gen job queued before the publish)', () => {
  const legacy = (ctx: any, region: any, startLocation: any, fill: any) => writeRegionFill(ctx, fill, stateOf(ctx), region, startLocation);

  it('a one-reply with families and 4 locations writes 5 places (no floor) and familyCountFor(5) = 7 families, AI first', () => {
    const { ctx, region, startLocation } = world();
    const out = legacy(ctx, region, startLocation, { ...placesReply(chain(4)), families: aiFamilies() });
    expect(out.locations).toHaveLength(4);
    expect(out.boundary).toMatchObject({ terrainType: 'uncharted' });
    expect(regionChartedPlaces(ctx, region.id)).toHaveLength(5);
    const families = rows(ctx, 'creature_family');
    expect(families).toHaveLength(7);
    expect(familyCountFor(5)).toBe(7);
    expect(families[0].key).toBe(`ai:${region.id}:saltcrust skitterers`);
  });

  it('a one-reply with 2 locations still completes the region: 3 places and familyCountFor(3) families by the same shape rules', () => {
    const { ctx, region, startLocation } = world({ start: startReply({ levelOffset: 1 }) });
    const out = legacy(ctx, region, startLocation, { ...placesReply(chain(2)), families: [] });
    expect(out.locations.map((l: any) => l.name)).toEqual(['Place 1', 'Place 2']);
    expect(rows(ctx, 'creature_family')).toHaveLength(familyCountFor(3));
    expect(locRow(ctx, 'Place 2').levelOffset).toBe(2n);
  });

  it('an older reply with enemies and no families keeps the rule path (one family per creature type)', () => {
    const { ctx, region, startLocation } = world();
    legacy(ctx, region, startLocation, {
      ...placesReply([place('Sallow Wood', { terrainType: 'woods', connectsTo: ['Safe Haven'] }), place('Black Fen', { terrainType: 'swamp', connectsTo: ['Sallow Wood'] })]),
      enemies: [
        { name: 'Fen Stalker', creatureType: 'beast', role: 'melee', terrainTypes: 'woods, swamp', groupMin: 1, groupMax: 2, level: 2 },
        { name: 'Drowned Seer', creatureType: 'undead', role: 'caster', terrainTypes: 'swamp', groupMin: 1, groupMax: 1, level: 2 },
      ],
    });
    expect(rows(ctx, 'creature_family').map((f: any) => f.key)).toEqual([`${region.id}:beast`, `${region.id}:undead`]);
  });
});
