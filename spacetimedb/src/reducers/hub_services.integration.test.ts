/**
 * Phase 51.3.1.1 Plan 09 (D-59 to D-64): hubs and their services through the real submit_intent
 * handler captured from index.ts, on the strict mock db. Each region is written by the real staged
 * world writers (writeRegionStart, writeRegionFill) with a canned reply (no LLM call), so the hub
 * count, the vendor and banker, the crafting station and the bind stone all come from the server's
 * rules. Region ids are found by looping over hubCountFor, never hard-coded.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { hubCountFor, hubSeed } from '../data/density_rules';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };
const ts = { microsSinceUnixEpoch: T0 };
// computeRegionDanger adds 50 + (timestamp % 51) to the source danger, capped at 800.
const DANGER_STEP = 50n + (T0 % 51n);

let submitIntent: (...args: any[]) => any;
let worldGen: typeof import('../helpers/world_gen');

beforeAll(async () => {
  await import('../index');
  const h = capturedReducer('submit_intent');
  if (typeof h !== 'function') {
    throw new Error("capturedReducer('submit_intent') is not a function: STOP and report; never edit production code to fix this.");
  }
  submitIntent = h;
  worldGen = await import('../helpers/world_gen');
}, 120_000);

/** The first region id whose hub count at `danger` (not a starter) is `count`. */
function regionIdWithHubCount(danger: bigint, count: number): bigint {
  for (let id = 2n; id < 2002n; id += 1n) {
    if (hubCountFor(danger, false, hubSeed(id)) === count) return id;
  }
  throw new Error(`no region id with hub count ${count} at danger ${danger}`);
}

const PERSONALITY = { traits: ['quiet'], speechPattern: 'slow', knowledgeDomains: ['trade'], secrets: [], affinityMultiplier: 1.0 };

const START_REPLY = {
  regionName: 'Mirefold',
  regionDescription: 'A wet country.',
  biome: 'swamp',
  startLocation: { name: 'Reed Landing', description: 'A landing of reeds.', terrainType: 'town', levelOffset: 0 },
};

function fillReply(locations: any[]) {
  return {
    dominantFaction: 'none',
    landmarks: [],
    threats: [],
    locations,
    npcs: [
      { name: 'Hesk Marrow', gender: 'male', npcType: 'vendor', locationName: 'Reed Landing', description: 'A trader.', greeting: 'Buy.', personality: PERSONALITY },
      { name: 'Ada Coyne', gender: 'female', npcType: 'banker', locationName: 'Reed Landing', description: 'A banker.', greeting: 'Welcome.', personality: PERSONALITY },
    ],
    enemies: [{ name: 'Fen Stalker', creatureType: 'beast', role: 'melee', terrainTypes: 'woods, swamp', groupMin: 1, groupMax: 2, level: 2 }],
  };
}

const HOSTILE = [
  { name: 'Sallow Wood', description: 'Wet trees.', terrainType: 'woods', isSafe: false, levelOffset: 0, connectsTo: ['Reed Landing'] },
  { name: 'Black Fen', description: 'Black water.', terrainType: 'swamp', isSafe: false, levelOffset: 1, connectsTo: ['Sallow Wood'] },
];

/** Writes a non-starter region with id `regionId` at `danger`, then stands the character at `placeName` (default the arrival point). */
function regionWorld(regionId: bigint, danger: bigint, locations: any[] = HOSTILE, placeName?: string) {
  const sourceDanger = danger >= 800n ? 800n : danger - DANGER_STEP;
  const ctx = createMockCtx({
    seed: {
      player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
      character: [{ id: 1n, ownerUserId: 7n, name: 'Mirel', level: 3n, locationId: 0n, boundLocationId: 0n }],
      region: [{ id: regionId - 1n, name: 'Source', dangerMultiplier: sourceDanger }],
      world_state: [{ id: 1n, isNight: false, nextTransitionAtMicros: T0 + 3_600_000_000n }],
      item_template: [],
    },
    sender: alice,
    timestampMicros: T0,
    strict: true,
  });
  const genState = { id: 5n, playerId: alice, characterId: 1n, sourceLocationId: 0n, sourceRegionId: regionId - 1n, step: 'FILLING', createdAt: ts, updatedAt: ts };
  const { region, startLocation } = worldGen.writeRegionStart(ctx, START_REPLY, genState);
  expect(region.id).toBe(regionId);
  expect(region.dangerMultiplier).toBe(danger);
  const { locations: newLocations, boundary } = worldGen.writeRegionFill(ctx, fillReply(locations), genState, region, startLocation);
  const places = (ctx.db._tables.location as any[]).filter((l: any) => l.regionId === regionId);
  const here = placeName ? places.find((l: any) => l.name === placeName) : places.find((l: any) => l.id === startLocation.id);
  const character = ctx.db._tables.character[0];
  ctx.db.character.id.update({ ...character, locationId: here.id, boundLocationId: here.id });
  return { ctx, region, startLocation, newLocations, boundary, places, here };
}

const events = (ctx: any): any[] => ctx.db._tables.event_private ?? [];
const lastMessage = (ctx: any): any => events(ctx)[events(ctx).length - 1];

describe('a region with no hub (D-59, D-64)', () => {
  const regionId = regionIdWithHubCount(800n, 0);

  it('bank refuses with "There is no bank here." at the arrival point', () => {
    const { ctx } = regionWorld(regionId, 800n);
    submitIntent(ctx, { characterId: 1n, text: 'bank' });
    expect(lastMessage(ctx)).toMatchObject({ kind: 'system', message: 'There is no bank here.' });
  });

  it('look shows no bank, no shop, no crafting station and no bind stone line', () => {
    const { ctx, here } = regionWorld(regionId, 800n);
    expect(here.isHub).toBe(false);
    submitIntent(ctx, { characterId: 1n, text: 'look' });
    const look = lastMessage(ctx);
    expect(look.kind).toBe('look');
    expect(look.message).toContain('Reed Landing');
    expect(look.message).not.toContain('[bank]');
    expect(look.message).not.toContain('[shop]');
    expect(look.message).not.toContain('crafting station');
    expect(look.message).not.toContain('[bind]');
    // The vendor and banker the reply placed here are ordinary locals now.
    expect(look.message).toContain('[Hesk Marrow]');
  });

  it('no location of the region has a bind stone or a station, the arrival point included', () => {
    const { places, startLocation, newLocations } = regionWorld(regionId, 800n);
    expect(places.filter((l: any) => l.isHub)).toEqual([]);
    expect(places.filter((l: any) => l.bindStone)).toEqual([]);
    expect(places.filter((l: any) => l.craftingAvailable)).toEqual([]);
    expect(places.find((l: any) => l.id === startLocation.id).bindStone).toBe(false);
    expect(newLocations.length).toBe(2);
  });
});

describe('a region with a hub (D-59 to D-64)', () => {
  const regionId = regionIdWithHubCount(150n, 1);

  it('at the hub with a station, look shows the bank, the shop, the crafting station and the bind stone', () => {
    const { ctx, here } = regionWorld(regionId, 150n);
    expect(here).toMatchObject({ isHub: true, isSafe: true, craftingAvailable: true, bindStone: true });
    submitIntent(ctx, { characterId: 1n, text: 'look' });
    const look = lastMessage(ctx);
    expect(look.message).toContain('[bank]');
    expect(look.message).toContain('[shop]');
    expect(look.message).toContain('A crafting station is available');
    expect(look.message).toContain('[bind]');
  });

  it('at a place that is not a hub, bank refuses and look shows no bank, shop or crafting station', () => {
    const { ctx, here } = regionWorld(regionId, 150n, HOSTILE, 'Sallow Wood');
    expect(here.isHub).toBe(false);
    submitIntent(ctx, { characterId: 1n, text: 'bank' });
    expect(lastMessage(ctx)).toMatchObject({ kind: 'system', message: 'There is no bank here.' });
    submitIntent(ctx, { characterId: 1n, text: 'look' });
    const look = lastMessage(ctx);
    expect(look.kind).toBe('look');
    expect(look.message).not.toContain('[bank]');
    expect(look.message).not.toContain('[shop]');
    expect(look.message).not.toContain('crafting station');
  });

  it('every hub has a bind stone; a non-starter arrival point that is not a hub has none', () => {
    // The reply marks Sallow Wood as the hub; with a count of 1 it takes the hub, and the arrival point does not.
    const marked = [{ ...HOSTILE[0], isHub: true }, HOSTILE[1]];
    const { places, startLocation } = regionWorld(regionId, 150n, marked);
    const hubs = places.filter((l: any) => l.isHub);
    expect(hubs.map((h: any) => h.name)).toEqual(['Sallow Wood']);
    for (const hub of hubs) expect(hub.bindStone).toBe(true);
    const arrival = places.find((l: any) => l.id === startLocation.id);
    expect(arrival).toMatchObject({ isHub: false, bindStone: false, craftingAvailable: false });
  });
});
