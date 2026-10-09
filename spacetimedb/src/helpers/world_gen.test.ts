import { describe, it, expect, vi, beforeAll } from 'vitest';
// @ts-ignore node types are not part of this module's tsconfig (same as other source-reading tests)
import { readFileSync, readdirSync } from 'node:fs';
// @ts-ignore see above
import { fileURLToPath } from 'node:url';

// Mock dependencies that import SpacetimeDB modules
const poolCalls: bigint[] = [];
vi.mock('./location', async (importOriginal) => ({
  // The real helpers (the region fill seeds resource pools from the gather tables, Plan 09) ...
  ...(await importOriginal<typeof import('./location')>()),
  // ... with connections as the real helper writes them: one row per direction.
  connectLocations: (ctx: any, fromId: bigint, toId: bigint) => {
    ctx.db.location_connection.insert({ id: 0n, fromLocationId: fromId, toLocationId: toId });
    ctx.db.location_connection.insert({ id: 0n, fromLocationId: toId, toLocationId: fromId });
  },
}));
vi.mock('./families', async (importOriginal) => ({
  // The real family layer (the region fill builds families and pools, Plan 09); only the lazy
  // arrival net is recorded.
  ...(await importOriginal<typeof import('./families')>()),
  ensurePoolsForLocation: (_ctx: any, locationId: bigint) => {
    poolCalls.push(locationId);
  },
}));
vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

import {
  writeRegionStart,
  writeRegionFill,
  ensureRegionServices,
  findRegionStart,
  buildWorldFillInput,
  startWorldFill,
  failWorldFill,
  retryWorldFill,
  WORLD_START_MILESTONE_LINE,
  WORLD_FILL_FAILED_MESSAGE,
  WORLD_FILL_REFUSED_MESSAGE,
  WORLD_FILL_RETRY_LINE,
  worldFillCompleteLine,
  computeRegionDanger,
  startWorldGeneration,
  buildRegionContext,
  regionFillHint,
  nowhereToGoLine,
  REGION_FILL_PENDING_HINT,
  REGION_FILL_FAILED_HINT,
  regionHubCount,
  readHubMarks,
} from './world_gen';
import { hubCountFor, hubHasStation, hubSeed, stationSeed } from '../data/density_rules';
import { enemyStatsForLevel } from '../data/enemy_rules';
import { memberAbilities } from '../data/family_rules';
import { createMockDb, createMockCtx } from './test-utils';
import { rowColumnProblems } from './schema_recorder';
import { resolveRouteInput } from './llm_inputs';
import { buildRouteLayers } from '../data/llm_layers';
import { utcDay } from './llm_budget';
import { setLlmEnabled, patchAdminState } from './llm_admin_state';
import { LLM_RESTING_LINE } from './llm_queue';
import { LLM_PLAYER_DAILY_COST_MICRO_USD } from '../data/llm_limits';

beforeAll(async () => {
  await import('../schema/tables');
});

function createMockTx() {
  const db = createMockDb();
  return {
    db,
    timestamp: { microsSinceUnixEpoch: 1000000000000n },
  };
}

const PERSONALITY = { traits: ['quiet'], speechPattern: 'slow', knowledgeDomains: ['ferries'], secrets: [], affinityMultiplier: 1.0 };

/** A stage-1 (world_gen_start) reply. */
function baseStartReply(overrides: any = {}) {
  return {
    regionName: 'Test Region',
    regionDescription: 'A test region.',
    biome: 'forest',
    startLocation: { name: 'Safe Haven', description: 'A safe place.', terrainType: 'town', levelOffset: 0 },
    firstNpc: {
      name: 'Oswin Tarr',
      gender: 'male',
      npcType: 'lore',
      description: 'A figure at the crossing.',
      greeting: 'Well met.',
      personality: PERSONALITY,
    },
    ...overrides,
  };
}

/** A stage-2 (world_gen fill) reply. */
function baseFillReply(overrides: any = {}) {
  return {
    dominantFaction: 'none',
    landmarks: ['Old Tree'],
    threats: ['wolves'],
    locations: [
      { name: 'Dark Woods', description: 'Spooky woods.', terrainType: 'woods', isSafe: false, levelOffset: 1, connectsTo: ['Safe Haven'] },
    ],
    npcs: [],
    enemies: [
      { name: 'Wolf', creatureType: 'beast', role: 'melee', terrainTypes: 'woods', groupMin: 1, groupMax: 2, level: 1 },
    ],
    ...overrides,
  };
}

/** The enemy templates the reply named: every template except the server-made filler members (Plan 09). */
function replyEnemyTemplates(tx: any): any[] {
  const fillers = new Set(tx.db.family_member._rows().filter((m: any) => m.filler).map((m: any) => m.enemyTemplateId));
  return tx.db.enemy_template._rows().filter((e: any) => !fillers.has(e.id));
}

function baseGenState(overrides: any = {}) {
  return {
    id: 1n,
    sourceRegionId: 100n,
    sourceLocationId: 0n,
    characterId: 10n,
    ...overrides,
  };
}

/** Stage 1 then stage 2 on one tx, like the two applies. */
function writeBoth(tx: any, start: any, fill: any, genState: any = baseGenState(), starterRace?: string) {
  const s = writeRegionStart(tx, start, genState, starterRace);
  const f = writeRegionFill(tx, fill, genState, s.region, s.startLocation);
  return { ...s, ...f };
}

describe('writeRegionStart', () => {
  it('inserts one region, one safe start location (not a hub: no bind stone, no station, Plan 09 D-63 D-64) and one NPC at it', () => {
    const tx = createMockTx();
    tx.db.region.insert({ id: 100n, name: 'Source', dangerMultiplier: 100n });
    const { region, startLocation, firstNpc } = writeRegionStart(tx, baseStartReply(), baseGenState());

    expect(tx.db.region._rows().filter((r: any) => r.name === 'Test Region')).toHaveLength(1);
    expect(region).toMatchObject({ name: 'Test Region', biome: 'forest', regionType: 'generated', isGenerated: true, generatedByCharacterId: 10n });
    expect(tx.db.location._rows()).toHaveLength(1);
    expect(startLocation).toMatchObject({
      name: 'Safe Haven',
      description: 'A safe place.',
      zone: 'Test Region',
      regionId: region.id,
      isSafe: true,
      terrainType: 'town',
      bindStone: false,
      craftingAvailable: false,
      isHub: false,
    });
    expect(tx.db.npc._rows()).toHaveLength(1);
    expect(firstNpc).toMatchObject({ name: 'Oswin Tarr', locationId: startLocation.id, npcType: 'lore', gender: 'male' });
    // Stage 1 writes no enemies and no services: those are stage 2.
    expect(tx.db.enemy_template._rows()).toHaveLength(0);
    expect(tx.db.location_enemy_template._rows()).toHaveLength(0);
  });

  it('the start location falls back to the region description and a plains terrain', () => {
    const tx = createMockTx();
    const { startLocation } = writeRegionStart(
      tx,
      baseStartReply({ startLocation: { name: 'Landing' } }),
      baseGenState(),
    );
    expect(startLocation.description).toBe('A test region.');
    expect(startLocation.terrainType).toBe('plains');
    expect(startLocation.levelOffset).toBe(0n);
  });

  it('never makes the start location uncharted, whatever the model says', () => {
    const tx = createMockTx();
    const { startLocation } = writeRegionStart(
      tx,
      baseStartReply({ startLocation: { name: 'Landing', terrainType: 'uncharted' } }),
      baseGenState(),
    );
    expect(startLocation.terrainType).toBe('plains');
  });

  it('a starter marks the region for the race and sets the danger to 100', () => {
    const tx = createMockTx();
    const { region } = writeRegionStart(tx, baseStartReply(), baseGenState({ sourceRegionId: 0n }), 'kobold');
    expect(region.starterForRace).toBe('kobold');
    expect(region.dangerMultiplier).toBe(100n);
  });

  it('a non-starter raises the danger and connects the start location and the source location both ways', () => {
    const tx = createMockTx();
    tx.db.region.insert({ id: 100n, name: 'Source', dangerMultiplier: 100n });
    const { region, startLocation } = writeRegionStart(tx, baseStartReply(), baseGenState({ sourceLocationId: 50n }));
    expect(region.dangerMultiplier).toBeGreaterThanOrEqual(150n);
    expect(region.dangerMultiplier).toBeLessThanOrEqual(200n);
    expect(region.starterForRace).toBeUndefined();
    const conns = tx.db.location_connection._rows().map((c: any) => [c.fromLocationId, c.toLocationId]);
    expect(conns).toContainEqual([startLocation.id, 50n]);
    expect(conns).toContainEqual([50n, startLocation.id]);
  });

  it('a starter has no source location to connect', () => {
    const tx = createMockTx();
    writeRegionStart(tx, baseStartReply(), baseGenState({ sourceRegionId: 0n, sourceLocationId: 0n }));
    expect(tx.db.location_connection._rows()).toHaveLength(0);
  });

  it('a reply without firstNpc writes no NPC', () => {
    const tx = createMockTx();
    const { firstNpc } = writeRegionStart(tx, baseStartReply({ firstNpc: undefined }), baseGenState());
    expect(firstNpc).toBeNull();
    expect(tx.db.npc._rows()).toHaveLength(0);
  });

  it('a model levelOffset that is not a safe integer never throws', () => {
    for (const levelOffset of [1.5, Number.NaN, Infinity, 'abc', null, 9999]) {
      const tx = createMockTx();
      const { startLocation } = writeRegionStart(
        tx,
        baseStartReply({ startLocation: { name: 'Landing', levelOffset } }),
        baseGenState(),
      );
      expect(typeof startLocation.levelOffset).toBe('bigint');
    }
  });
});

describe('findRegionStart', () => {
  it('returns the lowest-id non-uncharted location of the region', () => {
    const tx = createMockTx();
    tx.db.location.insert({ id: 9n, name: 'Edge', regionId: 7n, terrainType: 'uncharted' });
    tx.db.location.insert({ id: 12n, name: 'Later', regionId: 7n, terrainType: 'woods' });
    tx.db.location.insert({ id: 11n, name: 'First', regionId: 7n, terrainType: 'town' });
    tx.db.location.insert({ id: 3n, name: 'Elsewhere', regionId: 8n, terrainType: 'town' });
    expect(findRegionStart(tx, 7n).name).toBe('First');
  });

  it('returns null for a region with no charted location', () => {
    const tx = createMockTx();
    tx.db.location.insert({ id: 9n, name: 'Edge', regionId: 7n, terrainType: 'uncharted' });
    expect(findRegionStart(tx, 7n)).toBeNull();
    expect(findRegionStart(tx, 99n)).toBeNull();
  });
});

describe('writeRegionFill', () => {
  it('inserts fallback vendor and banker at the start location when the model omits them', () => {
    const tx = createMockTx();
    tx.db.region.insert({ id: 100n, name: 'Source', dangerMultiplier: 100n });
    const { startLocation } = writeBoth(tx, baseStartReply({ firstNpc: undefined }), baseFillReply({ npcs: [] }));

    const allNpcs = tx.db.npc._rows();
    const vendorNpc = allNpcs.find((n: any) => n.npcType === 'vendor');
    const bankerNpc = allNpcs.find((n: any) => n.npcType === 'banker');
    expect(vendorNpc).toBeDefined();
    expect(vendorNpc.name).toBe('The Reluctant Merchant');
    expect(vendorNpc.locationId).toBe(startLocation.id);
    expect(bankerNpc).toBeDefined();
    expect(bankerNpc.name).toBe('The Ledger Keeper');
    expect(bankerNpc.locationId).toBe(startLocation.id);
  });

  it('does NOT create a duplicate vendor or banker when the model includes them at the start location', () => {
    const tx = createMockTx();
    tx.db.region.insert({ id: 100n, name: 'Source', dangerMultiplier: 100n });
    writeBoth(
      tx,
      baseStartReply(),
      baseFillReply({
        npcs: [
          { name: 'Shopkeep', npcType: 'vendor', locationName: 'Safe Haven', description: 'A vendor.', greeting: 'Hello.', personality: PERSONALITY },
          { name: 'Banker Bob', npcType: 'banker', locationName: 'Safe Haven', description: 'A banker.', greeting: 'Welcome.', personality: PERSONALITY },
        ],
      }),
    );
    const allNpcs = tx.db.npc._rows();
    const vendors = allNpcs.filter((n: any) => n.npcType === 'vendor');
    const bankers = allNpcs.filter((n: any) => n.npcType === 'banker');
    expect(vendors.map((n: any) => n.name)).toEqual(['Shopkeep']);
    expect(bankers.map((n: any) => n.name)).toEqual(['Banker Bob']);
  });

  it('the start location keeps bindStone and craftingAvailable, and no new location gets either', () => {
    const tx = createMockTx();
    tx.db.region.insert({ id: 100n, name: 'Source', dangerMultiplier: 100n });
    writeBoth(
      tx,
      baseStartReply(),
      baseFillReply({
        locations: [
          { name: 'Second Haven', description: 'Also safe.', terrainType: 'town', isSafe: true, levelOffset: 0, connectsTo: ['Safe Haven'] },
          { name: 'Dark Woods', description: 'Spooky woods.', terrainType: 'woods', isSafe: false, levelOffset: 1, connectsTo: [] },
        ],
      }),
    );
    const byName = (n: string) => tx.db.location._rows().find((l: any) => l.name === n);
    expect(byName('Safe Haven')).toMatchObject({ bindStone: true, craftingAvailable: true });
    expect(byName('Second Haven')).toMatchObject({ bindStone: false, craftingAvailable: false });
    expect(byName('Dark Woods')).toMatchObject({ bindStone: false, craftingAvailable: false });
  });

  it('updates dominantFaction, landmarks and threats on the region', () => {
    const tx = createMockTx();
    const { region } = writeBoth(tx, baseStartReply(), baseFillReply({ dominantFaction: 'Ash Court', landmarks: ['The Slag Spire'], threats: ['ember wolves'] }));
    const stored = tx.db.region._rows().find((r: any) => r.id === region.id);
    expect(stored.dominantFaction).toBe('Ash Court');
    expect(JSON.parse(stored.landmarks)).toEqual(['The Slag Spire']);
    expect(JSON.parse(stored.threats)).toEqual(['ember wolves']);
    // The stage-1 fields are kept.
    expect(stored).toMatchObject({ name: 'Test Region', biome: 'forest' });
  });

  it('skips a location whose name matches the start location or an earlier one, case-insensitively', () => {
    const tx = createMockTx();
    const { locations } = writeBoth(
      tx,
      baseStartReply(),
      baseFillReply({
        locations: [
          { name: 'SAFE HAVEN', description: 'A rename attempt.', terrainType: 'town', isSafe: true, levelOffset: 0, connectsTo: [] },
          { name: 'Dark Woods', description: 'First.', terrainType: 'woods', isSafe: false, levelOffset: 0, connectsTo: [] },
          { name: 'dark woods', description: 'Second.', terrainType: 'woods', isSafe: false, levelOffset: 0, connectsTo: [] },
        ],
      }),
    );
    expect(locations.map((l: any) => l.name)).toEqual(['Dark Woods']);
    const names = tx.db.location._rows().map((l: any) => l.name);
    expect(names.filter((n: string) => n.toLowerCase() === 'safe haven')).toEqual(['Safe Haven']);
    // The start location keeps its stage-1 description.
    expect(tx.db.location._rows().find((l: any) => l.name === 'Safe Haven').description).toBe('A safe place.');
    expect(tx.db.location._rows().find((l: any) => l.name === 'Dark Woods').description).toBe('First.');
  });

  it('resolves connectsTo against the start location plus the new names and never connects twice', () => {
    const tx = createMockTx();
    const { startLocation, locations } = writeBoth(
      tx,
      baseStartReply(),
      baseFillReply({
        locations: [
          { name: 'Road', description: 'r', terrainType: 'plains', isSafe: false, levelOffset: 0, connectsTo: ['Safe Haven', 'Pit', 'Nowhere'] },
          { name: 'Pit', description: 'p', terrainType: 'mountains', isSafe: false, levelOffset: 1, connectsTo: ['Road'] },
        ],
      }),
    );
    const [road, pit] = locations;
    const conns = tx.db.location_connection._rows();
    const count = (a: bigint, b: bigint) => conns.filter((c: any) => c.fromLocationId === a && c.toLocationId === b).length;
    expect(count(road.id, startLocation.id)).toBe(1);
    expect(count(startLocation.id, road.id)).toBe(1);
    expect(count(road.id, pit.id)).toBe(1);
    expect(count(pit.id, road.id)).toBe(1);
  });

  it('connects the first new location to the start location when no new location reached it', () => {
    const tx = createMockTx();
    const { startLocation, locations } = writeBoth(
      tx,
      baseStartReply(),
      baseFillReply({
        locations: [
          { name: 'Alpha', description: 'a', terrainType: 'plains', isSafe: false, levelOffset: 0, connectsTo: ['Beta'] },
          { name: 'Beta', description: 'b', terrainType: 'plains', isSafe: false, levelOffset: 0, connectsTo: ['Alpha'] },
        ],
      }),
    );
    const conns = tx.db.location_connection._rows();
    const touchesStart = conns.filter((c: any) => c.fromLocationId === startLocation.id).map((c: any) => c.toLocationId);
    expect(touchesStart).toEqual([locations[0].id]);
  });

  it('connects every new location to the region, including one with no connectsTo at all', () => {
    const tx = createMockTx();
    const { startLocation, locations } = writeBoth(
      tx,
      baseStartReply(),
      baseFillReply({
        locations: [
          { name: 'Alpha', description: 'a', terrainType: 'plains', isSafe: false, levelOffset: 0, connectsTo: ['Safe Haven'] },
          { name: 'Lonely', description: 'l', terrainType: 'plains', isSafe: false, levelOffset: 0, connectsTo: [] },
          { name: 'Island A', description: 'a', terrainType: 'plains', isSafe: false, levelOffset: 0, connectsTo: ['Island B'] },
          { name: 'Island B', description: 'b', terrainType: 'plains', isSafe: false, levelOffset: 0, connectsTo: ['Island A'] },
        ],
      }),
    );
    // Walk the connection graph from the start location.
    const seen = new Set<bigint>([startLocation.id]);
    const queue = [startLocation.id];
    while (queue.length) {
      const id = queue.shift() as bigint;
      for (const c of tx.db.location_connection._rows()) {
        if (c.fromLocationId === id && !seen.has(c.toLocationId)) {
          seen.add(c.toLocationId);
          queue.push(c.toLocationId);
        }
      }
    }
    for (const l of locations) expect(seen.has(l.id)).toBe(true);
  });

  it('tolerates missing or malformed arrays', () => {
    const tx = createMockTx();
    expect(() =>
      writeBoth(tx, baseStartReply(), { dominantFaction: 'x', locations: 'no', npcs: null, enemies: undefined }),
    ).not.toThrow();
    // Boundary anchored on the start location when there are no new locations.
    const boundary = tx.db.location._rows().find((l: any) => l.terrainType === 'uncharted');
    expect(boundary).toBeDefined();
    const start = tx.db.location._rows().find((l: any) => l.name === 'Safe Haven');
    expect(tx.db.location_connection._rows().some((c: any) => c.fromLocationId === start.id && c.toLocationId === boundary.id)).toBe(true);
  });

  it("links every enemy's family to the new non-safe locations only", () => {
    // Plan 09: step 6 is buildRegionFamilies, so the Wolf comes with its three filler members.
    const tx = createMockTx();
    const { locations } = writeBoth(
      tx,
      baseStartReply(),
      baseFillReply({
        locations: [
          { name: 'Second Haven', description: 's', terrainType: 'town', isSafe: true, levelOffset: 0, connectsTo: ['Safe Haven'] },
          { name: 'Dark Woods', description: 'd', terrainType: 'woods', isSafe: false, levelOffset: 1, connectsTo: ['Safe Haven'] },
        ],
      }),
    );
    const links = tx.db.location_enemy_template._rows();
    const wolf = tx.db.enemy_template._rows().find((t: any) => t.name === 'Wolf');
    expect(links).toHaveLength(4);
    expect(links.map((l: any) => l.enemyTemplateId)).toContain(wolf.id);
    const darkWoods = locations.find((l: any) => l.name === 'Dark Woods').id;
    expect(links.every((l: any) => l.locationId === darkWoods)).toBe(true);
  });

  it('places an NPC at its exact locationName, else at the start location', () => {
    const tx = createMockTx();
    const { startLocation, locations } = writeBoth(
      tx,
      baseStartReply(),
      baseFillReply({
        npcs: [
          { name: 'Mara Quill', gender: 'female', npcType: 'lore', locationName: 'Dark Woods', description: 'A hermit.', greeting: 'Hm.', personality: PERSONALITY },
          { name: 'Lost Soul', gender: 'male', npcType: 'lore', locationName: 'Nowhere In Particular', description: 'Adrift.', greeting: '...', personality: PERSONALITY },
          { name: 'Wrong Case', gender: 'male', npcType: 'lore', locationName: 'dark woods', description: 'Adrift.', greeting: '...', personality: PERSONALITY },
        ],
      }),
    );
    const at = (n: string) => tx.db.npc._rows().find((x: any) => x.name === n).locationId;
    expect(at('Mara Quill')).toBe(locations[0].id);
    expect(at('Lost Soul')).toBe(startLocation.id);
    expect(at('Wrong Case')).toBe(startLocation.id);
  });

  it('skips an NPC whose name already stands at that location (the stage-1 NPC is never repeated)', () => {
    const tx = createMockTx();
    writeBoth(
      tx,
      baseStartReply(),
      baseFillReply({
        npcs: [
          { name: 'oswin tarr', gender: 'male', npcType: 'lore', locationName: 'Safe Haven', description: 'Again.', greeting: 'Again.', personality: PERSONALITY },
          { name: 'Oswin Tarr', gender: 'male', npcType: 'lore', locationName: 'Dark Woods', description: 'Elsewhere is fine.', greeting: 'Hi.', personality: PERSONALITY },
        ],
      }),
    );
    const oswins = tx.db.npc._rows().filter((n: any) => n.name.toLowerCase() === 'oswin tarr');
    expect(oswins).toHaveLength(2);
    expect(oswins.map((n: any) => n.description).sort()).toEqual(['A figure at the crossing.', 'Elsewhere is fine.']);
  });

  it('adds the uncharted boundary on the last non-safe new location', () => {
    const tx = createMockTx();
    const { region, boundary, locations } = writeBoth(
      tx,
      baseStartReply(),
      baseFillReply({
        locations: [
          { name: 'Road', description: 'r', terrainType: 'plains', isSafe: false, levelOffset: 0, connectsTo: ['Safe Haven'] },
          { name: 'Pit', description: 'p', terrainType: 'mountains', isSafe: false, levelOffset: 1, connectsTo: ['Road'] },
          { name: 'Chapel', description: 'c', terrainType: 'town', isSafe: true, levelOffset: 0, connectsTo: ['Road'] },
        ],
      }),
    );
    expect(boundary).toMatchObject({ name: 'The Edge Beyond Test Region', terrainType: 'uncharted', zone: 'Uncharted', regionId: region.id, isSafe: true });
    const pit = locations.find((l: any) => l.name === 'Pit');
    expect(tx.db.location_connection._rows().some((c: any) => c.fromLocationId === pit.id && c.toLocationId === boundary.id)).toBe(true);
  });

  it('anchors the boundary on the last new location when every new location is safe', () => {
    const tx = createMockTx();
    const { boundary, locations } = writeBoth(
      tx,
      baseStartReply(),
      baseFillReply({
        locations: [
          { name: 'Chapel', description: 'c', terrainType: 'town', isSafe: true, levelOffset: 0, connectsTo: ['Safe Haven'] },
          { name: 'Inn', description: 'i', terrainType: 'town', isSafe: true, levelOffset: 0, connectsTo: ['Chapel'] },
        ],
      }),
    );
    const inn = locations.find((l: any) => l.name === 'Inn');
    expect(tx.db.location_connection._rows().some((c: any) => c.fromLocationId === inn.id && c.toLocationId === boundary.id)).toBe(true);
  });

  it('a model number that is not a safe integer never throws (levelOffset, level, groupMin, groupMax)', () => {
    const tx = createMockTx();
    expect(() =>
      writeBoth(
        tx,
        baseStartReply(),
        baseFillReply({
          locations: [{ name: 'Road', description: 'r', terrainType: 'plains', isSafe: false, levelOffset: 2.5, connectsTo: [] }],
          enemies: [
            { name: 'A', creatureType: 'beast', role: 'melee', groupMin: 1.5, groupMax: Number.NaN, level: Infinity },
            { name: 'B', creatureType: 'beast', role: 'melee', groupMin: 'x', groupMax: null, level: 'high' },
            { name: 'C', creatureType: 'beast', role: 'melee', groupMin: 9, groupMax: 2, level: 1 },
          ],
        }),
      ),
    ).not.toThrow();
    for (const e of tx.db.enemy_template._rows()) {
      expect(typeof e.groupMin).toBe('bigint');
      expect(typeof e.groupMax).toBe('bigint');
      expect(e.groupMax >= e.groupMin).toBe(true);
    }
  });

  it('every row it writes matches the recorded schema', () => {
    const tx = createMockTx();
    tx.db.region.insert({ id: 100n, name: 'Source', dangerMultiplier: 100n });
    writeBoth(
      tx,
      baseStartReply(),
      baseFillReply({
        npcs: [{ name: 'Mara Quill', gender: 'female', npcType: 'lore', locationName: 'Dark Woods', description: 'A hermit.', greeting: 'Hm.', personality: PERSONALITY }],
      }),
      baseGenState({ sourceLocationId: 50n }),
    );
    for (const table of ['region', 'location', 'location_connection', 'npc', 'enemy_template', 'enemy_role_template', 'enemy_ability', 'location_enemy_template']) {
      for (const row of tx.db[table]._rows()) {
        if (table === 'region' && row.id === 100n) continue;
        expect(rowColumnProblems(table, row)).toEqual([]);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Plan 09: the region fill builds families and pools by rule (D-20, D-25, D-26, D-61)
// ---------------------------------------------------------------------------

/** A strict tx (accessors from the recorded schema), with the gather items the fill's terrains read. */
function createStrictTx(seed: Record<string, any[]> = {}) {
  const items = ['Wood', 'Peat', 'Scrap Cloth', 'Flax', 'Herbs'].map((name, i) => ({ id: 700n + BigInt(i), name, slot: 'resource' }));
  const db = createMockDb({ item_template: items, ...seed }, { strict: true });
  return { db, timestamp: { microsSinceUnixEpoch: 1000000000000n } };
}

const rowsOf = (tx: any, table: string): any[] => tx.db._tables[table] ?? [];

/** Three new places (woods and swamp hostile, plains camp safe) and two enemy types. */
function familyFillReply(overrides: any = {}) {
  return baseFillReply({
    locations: [
      { name: 'Sallow Wood', description: 'w', terrainType: 'woods', isSafe: false, levelOffset: 0, connectsTo: ['Safe Haven'] },
      { name: 'Black Fen', description: 'f', terrainType: 'swamp', isSafe: false, levelOffset: 1, connectsTo: ['Sallow Wood'] },
      { name: 'Reed Camp', description: 'c', terrainType: 'plains', isSafe: true, levelOffset: 0, connectsTo: ['Safe Haven'] },
    ],
    enemies: [
      { name: 'Fen Stalker', creatureType: 'beast', role: 'melee', terrainTypes: 'woods, swamp', groupMin: 1, groupMax: 2, level: 2 },
      { name: 'Drowned Seer', creatureType: 'undead', role: 'caster', terrainTypes: 'swamp', groupMin: 1, groupMax: 1, level: 2 },
    ],
    ...overrides,
  });
}

describe('writeRegionFill builds families and pools by rule (Plan 09 Task 1)', () => {
  it('two enemy types become two families with fillers, linked by terrain, rivals both ways, with creature and resource pools', () => {
    const tx = createStrictTx({ region: [{ id: 100n, name: 'Source', dangerMultiplier: 100n }] });
    const { region, startLocation, locations, boundary } = writeBoth(tx, baseStartReply(), familyFillReply());
    const place = (name: string) => locations.find((l: any) => l.name === name);
    const wood = place('Sallow Wood');
    const fen = place('Black Fen');
    const camp = place('Reed Camp');

    const families = rowsOf(tx, 'creature_family');
    expect(families.map((f: any) => f.key)).toEqual([`${region.id}:beast`, `${region.id}:undead`]);
    const [beast, undead] = families;
    const membersOf = (family: any) => rowsOf(tx, 'family_member').filter((m: any) => m.familyId === family.id);
    for (const family of families) {
      expect(membersOf(family).map((m: any) => m.role).sort()).toEqual(['caster', 'damage', 'healer', 'tank']);
      expect(membersOf(family).filter((m: any) => m.filler)).toHaveLength(3);
    }

    const linkedAt = (loc: any) =>
      rowsOf(tx, 'location_enemy_template').filter((l: any) => l.locationId === loc.id).map((l: any) => l.enemyTemplateId);
    for (const m of membersOf(beast)) {
      expect(linkedAt(wood)).toContain(m.enemyTemplateId);
      expect(linkedAt(fen)).toContain(m.enemyTemplateId);
    }
    for (const m of membersOf(undead)) {
      expect(linkedAt(fen)).toContain(m.enemyTemplateId);
      expect(linkedAt(wood)).not.toContain(m.enemyTemplateId);
    }
    expect(linkedAt(startLocation)).toEqual([]);
    expect(linkedAt(camp)).toEqual([]);

    expect(rowsOf(tx, 'family_relation').map((r: any) => [r.familyId, r.otherFamilyId, r.kind])).toEqual([
      [beast.id, undead.id, 'rival'],
      [undead.id, beast.id, 'rival'],
    ]);

    const pools = (loc: any, kind: string) => rowsOf(tx, 'place_pool').filter((p: any) => p.locationId === loc.id && p.kind === kind);
    expect(pools(wood, 'creature').map((p: any) => [p.refId, p.homeLevel])).toEqual([[beast.id, 2n]]);
    expect(pools(fen, 'creature').map((p: any) => p.refId)).toEqual([beast.id, undead.id]);
    expect(pools(fen, 'creature')[0].homeLevel).toBe(2n);
    expect(pools(startLocation, 'creature')).toEqual([]);
    expect(pools(camp, 'creature')).toEqual([]);
    for (const loc of [startLocation, wood, fen, camp]) expect(pools(loc, 'resource').length).toBeGreaterThan(0);
    expect(rowsOf(tx, 'place_pool').filter((p: any) => p.locationId === boundary.id)).toEqual([]);
  });

  it('a reply with no enemies still gets resource pools and no creature family', () => {
    const tx = createStrictTx();
    const { startLocation, locations } = writeBoth(tx, baseStartReply(), familyFillReply({ enemies: [] }));
    expect(rowsOf(tx, 'creature_family')).toEqual([]);
    expect(rowsOf(tx, 'place_pool').filter((p: any) => p.kind === 'creature')).toEqual([]);
    for (const loc of [startLocation, ...locations]) {
      expect(rowsOf(tx, 'place_pool').some((p: any) => p.locationId === loc.id && p.kind === 'resource')).toBe(true);
    }
  });

  it('every family and pool row it writes matches the recorded schema', () => {
    const tx = createStrictTx();
    writeBoth(tx, baseStartReply(), familyFillReply());
    for (const table of ['creature_family', 'family_member', 'family_relation', 'place_pool', 'pool_level']) {
      expect(rowsOf(tx, table).length).toBeGreaterThan(0);
      for (const row of rowsOf(tx, table)) expect(rowColumnProblems(table, row)).toEqual([]);
    }
  });
});

describe('ensureRegionServices', () => {
  it('adds the missing vendor and banker once, and is safe to run twice', () => {
    const tx = createMockTx();
    const loc = tx.db.location.insert({ id: 0n, name: 'Hub', regionId: 1n, terrainType: 'town' });
    ensureRegionServices(tx, loc);
    ensureRegionServices(tx, loc);
    const npcs = tx.db.npc._rows();
    expect(npcs.filter((n: any) => n.npcType === 'vendor')).toHaveLength(1);
    expect(npcs.filter((n: any) => n.npcType === 'banker')).toHaveLength(1);
  });
});

describe('computeRegionDanger', () => {
  it('returns a value 50-100 greater than source danger for non-starter regions', () => {
    const sourceDanger = 100n;
    const result = computeRegionDanger(sourceDanger, 1000000n, false);
    expect(result).toBeGreaterThanOrEqual(150n);
    expect(result).toBeLessThanOrEqual(200n);
  });

  it('returns exactly 100n for starter regions regardless of timestamp', () => {
    expect(computeRegionDanger(100n, 1000000n, true)).toBe(100n);
    expect(computeRegionDanger(150n, 9999999n, true)).toBe(100n);
    expect(computeRegionDanger(200n, 0n, true)).toBe(100n);
  });

  it('caps danger at 800n for non-starter regions', () => {
    const result = computeRegionDanger(800n, 1000000n, false);
    expect(result).toBe(800n);
  });
});

describe('starter region behavior (stage 1 and stage 2)', () => {
  it('starter region (sourceRegionId=0n) gets dangerMultiplier=100n', () => {
    const tx = createMockTx();
    // No source region seeded (sourceRegionId=0n means first region)
    const starterGenState = { id: 1n, sourceRegionId: 0n, sourceLocationId: 0n, characterId: 10n };
    const { region } = writeBoth(tx, baseStartReply(), baseFillReply(), starterGenState);
    expect(region.dangerMultiplier).toBe(100n);
  });

  it('starter region enemies are all clamped to level 1', () => {
    const tx = createMockTx();
    const fill = baseFillReply({
      enemies: [
        { name: 'Wolf', creatureType: 'beast', role: 'melee', terrainTypes: 'woods', groupMin: 1, groupMax: 2, level: 3 },
        { name: 'Bandit', creatureType: 'humanoid', role: 'melee', terrainTypes: 'plains', groupMin: 1, groupMax: 1, level: 2 },
      ],
    });
    const starterGenState = { id: 1n, sourceRegionId: 0n, sourceLocationId: 0n, characterId: 10n };
    writeBoth(tx, baseStartReply(), fill, starterGenState);

    const enemies = replyEnemyTemplates(tx);
    expect(enemies.length).toBe(2);
    // The server-made filler members of the families (Plan 09) sit at the region base level too.
    for (const enemy of tx.db.enemy_template._rows()) {
      expect(enemy.level).toBe(1n);
    }
  });

  it('non-starter region (sourceRegionId != 0n) gets increased danger', () => {
    const tx = createMockTx();
    tx.db.region.insert({ id: 100n, name: 'Source', dangerMultiplier: 100n });
    const { region } = writeBoth(tx, baseStartReply(), baseFillReply());
    // Danger should be 150-200 (increase of 50-100)
    expect(region.dangerMultiplier).toBeGreaterThanOrEqual(150n);
    expect(region.dangerMultiplier).toBeLessThanOrEqual(200n);
  });
});

describe('validator retention on model output', () => {
  function enemyLevels(tx: any): bigint[] {
    return replyEnemyTemplates(tx).map((e: any) => e.level);
  }

  it('clamps enemy levels far above and far below the danger band of a non-starter region into the band', () => {
    const tx = createMockTx();
    tx.db.region.insert({ id: 100n, name: 'Source', dangerMultiplier: 500n });
    const fill = baseFillReply({
      enemies: [
        { name: 'Titan', creatureType: 'beast', role: 'melee', level: 99 },
        { name: 'Sapling', creatureType: 'beast', role: 'melee', level: -7 },
        { name: 'Native', creatureType: 'beast', role: 'melee' },
      ],
    });
    const { region } = writeBoth(tx, baseStartReply(), fill);
    const base = region.dangerMultiplier / 100n;
    const [tooHigh, tooLow, defaulted] = enemyLevels(tx);
    // Source danger 500 plus 50-100, so the band sits well above level 2
    expect(base).toBeGreaterThanOrEqual(5n);
    expect(tooHigh).toBe(base + 1n);
    expect(tooLow).toBe(base - 1n);
    expect(defaulted >= base - 1n && defaulted <= base + 1n).toBe(true);
    for (const level of enemyLevels(tx)) {
      expect(level >= base - 1n && level <= base + 1n).toBe(true);
    }
  });

  it('derives enemy stats from the clamped level, not from the model-provided level', () => {
    const tx = createMockTx();
    tx.db.region.insert({ id: 100n, name: 'Source', dangerMultiplier: 500n });
    writeBoth(tx, baseStartReply(), baseFillReply({ enemies: [{ name: 'Titan', creatureType: 'beast', role: 'melee', level: 99 }] }));
    const [enemy] = tx.db.enemy_template._rows();
    expect(enemy.maxHp).toBe(enemy.level * 12n + 20n);
    expect(enemy.baseDamage).toBe(enemy.level * 3n + 5n);
    expect(enemy.xpReward).toBe(enemy.level * 15n + 10n);
  });

  it('a starter region keeps every enemy at level 1, including extreme and missing levels', () => {
    const tx = createMockTx();
    const fill = baseFillReply({
      enemies: [
        { name: 'Titan', creatureType: 'beast', role: 'melee', level: 99 },
        { name: 'Sapling', creatureType: 'beast', role: 'melee', level: -4 },
        { name: 'Native', creatureType: 'beast', role: 'melee' },
      ],
    });
    const { region } = writeBoth(tx, baseStartReply(), fill, { id: 1n, sourceRegionId: 0n, sourceLocationId: 0n, characterId: 10n });
    expect(region.dangerMultiplier).toBe(100n);
    expect(enemyLevels(tx)).toEqual([1n, 1n, 1n]);
  });

  it('caps the region danger at 800 so enemy levels never exceed 9', () => {
    const tx = createMockTx();
    tx.db.region.insert({ id: 100n, name: 'Source', dangerMultiplier: 800n });
    const { region } = writeBoth(tx, baseStartReply(), baseFillReply({ enemies: [{ name: 'Titan', creatureType: 'beast', role: 'melee', level: 99 }] }));
    expect(region.dangerMultiplier).toBe(800n);
    expect(enemyLevels(tx)).toEqual([9n]);
  });
});

// ---------------------------------------------------------------------------
// startWorldGeneration (Phase 41, plan 14, PIPE-01 / PIPE-04)
// ---------------------------------------------------------------------------

describe('startWorldGeneration', () => {
  const T0 = 1_700_000_000_000_000n;
  const alice = { toHexString: () => 'a'.repeat(64) };
  const ts = { microsSinceUnixEpoch: T0 };

  const genStateRow = (over: Record<string, unknown> = {}) => ({
    id: 5n,
    playerId: alice,
    characterId: 10n,
    sourceLocationId: 0n,
    sourceRegionId: 0n,
    step: 'PENDING',
    createdAt: ts,
    updatedAt: ts,
    ...over,
  });
  const charRow = (over: Record<string, unknown> = {}) => ({
    id: 10n,
    ownerUserId: 7n,
    name: 'Aldric',
    race: 'Kobold',
    className: 'Ashweaver',
    locationId: 0n,
    ...over,
  });
  const newCtx = (seed: Record<string, any[]> = {}) =>
    createMockCtx({
      seed: {
        player: [{ id: alice, userId: 7n }],
        character: [charRow()],
        world_gen_state: [genStateRow()],
        ...seed,
      },
      sender: alice,
      timestampMicros: T0,
      strict: true,
    });
  const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
  const stateOf = (ctx: any) => rows(ctx, 'world_gen_state')[0];
  const exhaustDay = (ctx: any) =>
    ctx.db.llm_player_budget.insert({
      id: 0n,
      playerId: alice,
      dayUtc: utcDay(ctx.timestamp),
      reservedMicroUsd: 0n,
      spentMicroUsd: LLM_PLAYER_DAILY_COST_MICRO_USD,
      calls: 1n,
    });

  const starterSeed = () => ({
    region: [{ id: 1n, name: 'Emberdeep', dangerMultiplier: 100n, starterForRace: 'kobold', biome: 'cavern' }],
    location: [
      { id: 20n, name: 'The Gate', regionId: 1n, isSafe: false, terrainType: 'cavern' },
      { id: 21n, name: 'Hearthhold', regionId: 1n, isSafe: true, terrainType: 'town' },
      { id: 22n, name: 'The Edge Beyond Emberdeep', regionId: 1n, isSafe: true, terrainType: 'uncharted' },
    ],
    npc: [{ id: 30n, name: 'Varek', npcType: 'vendor', locationId: 21n }],
  });

  it('reuses a matching starter region with no model call: places the character, completes the state, posts the arrival', () => {
    poolCalls.length = 0;
    const ctx = newCtx(starterSeed());
    expect(startWorldGeneration(ctx, stateOf(ctx))).toBe('reused');

    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
    expect(rows(ctx, 'character')[0]).toMatchObject({ locationId: 21n, boundLocationId: 21n });
    expect(stateOf(ctx)).toMatchObject({ step: 'COMPLETE', generatedRegionId: 1n });
    expect(poolCalls).toEqual([21n]);
    const events = rows(ctx, 'event_private');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'narrative', characterId: 10n, ownerUserId: 7n });
    expect(events[0].message).toContain('You open your eyes in Hearthhold, Emberdeep.');
    expect(events[0].message).toContain('You notice Varek nearby.');
  });

  describe('review WR-B02: reusing a starter region whose second half is missing', () => {
    /** The first character's starter state for region 1, at the given step. */
    const firstState = (step: string) =>
      genStateRow({ id: 4n, characterId: 9n, step, generatedRegionId: 1n });

    it('a failed fill: the arrival names [explore] instead of promising [travel], and explore retries the fill', () => {
      const ctx = newCtx({ ...starterSeed(), world_gen_state: [firstState('FILL_ERROR'), genStateRow()] });
      expect(startWorldGeneration(ctx, rows(ctx, 'world_gen_state')[1])).toBe('reused');
      const arrival = rows(ctx, 'event_private')[0].message as string;
      expect(arrival).toContain(REGION_FILL_FAILED_HINT);
      expect(arrival).not.toContain('[travel] to move');

      // The retry path is there for this later character too: the failed fill is handed over and re-enqueued.
      const placed = rows(ctx, 'character')[0];
      expect(placed.locationId).toBe(21n);
      expect(retryWorldFill(ctx, placed, alice)).toBe('started');
      const failed = rows(ctx, 'world_gen_state').find((s: any) => s.id === 4n);
      expect(failed).toMatchObject({ step: 'FILLING', characterId: 10n });
      expect(rows(ctx, 'llm_job').map((j: any) => j.route)).toEqual(['world_gen']);
    });

    it('a fill still running: the arrival asks for a moment instead of promising [travel]', () => {
      const ctx = newCtx({ ...starterSeed(), world_gen_state: [firstState('FILLING'), genStateRow()] });
      expect(startWorldGeneration(ctx, rows(ctx, 'world_gen_state')[1])).toBe('reused');
      const arrival = rows(ctx, 'event_private')[0].message as string;
      expect(arrival).toContain(REGION_FILL_PENDING_HINT);
      expect(arrival).not.toContain('[travel] to move');
    });

    it('a finished region with exits still offers [travel]', () => {
      const seed = {
        ...starterSeed(),
        world_gen_state: [firstState('COMPLETE'), genStateRow()],
        location_connection: [
          { id: 1n, fromLocationId: 21n, toLocationId: 20n },
          { id: 2n, fromLocationId: 20n, toLocationId: 21n },
        ],
      };
      const ctx = newCtx(seed);
      expect(startWorldGeneration(ctx, rows(ctx, 'world_gen_state')[1])).toBe('reused');
      const arrival = rows(ctx, 'event_private')[0].message as string;
      expect(arrival).toContain('Try [look] to examine your surroundings, or [travel] to move.');
      expect(arrival).not.toContain(REGION_FILL_FAILED_HINT);
    });

    it('the hints are in voice, name the Keeper as he, and are safe for the console', () => {
      for (const line of [REGION_FILL_PENDING_HINT, REGION_FILL_FAILED_HINT]) {
        expect(line).not.toMatch(/[!<]/);
        expect(line).not.toMatch(/\b(it|its|they|their)\b/i);
      }
      expect(REGION_FILL_FAILED_HINT).toContain('[explore]');
      expect(REGION_FILL_FAILED_HINT).toMatch(/\bhe\b/);
    });

    it('regionFillHint and nowhereToGoLine: FILLING asks for a moment, FILL_ERROR names [explore], otherwise plain', () => {
      const plain = newCtx(starterSeed());
      expect(regionFillHint(plain, 1n)).toBeNull();
      expect(nowhereToGoLine(plain, 21n)).toBe('There is nowhere to go from here.');
      expect(nowhereToGoLine(plain, 999n)).toBe('There is nowhere to go from here.');

      const failed = newCtx({ ...starterSeed(), world_gen_state: [firstState('FILL_ERROR')] });
      expect(regionFillHint(failed, 1n)).toBe(REGION_FILL_FAILED_HINT);
      expect(regionFillHint(failed, 2n)).toBeNull();
      expect(nowhereToGoLine(failed, 21n)).toBe(`There is nowhere to go from here yet. ${REGION_FILL_FAILED_HINT}`);

      const both = newCtx({ ...starterSeed(), world_gen_state: [firstState('FILL_ERROR'), genStateRow({ id: 6n, step: 'FILLING', generatedRegionId: 1n })] });
      expect(regionFillHint(both, 1n)).toBe(REGION_FILL_PENDING_HINT);
    });
  });

  it('does not reuse a starter region of another race: it enqueues instead', () => {
    const seed = starterSeed();
    seed.region[0].starterForRace = 'elf';
    const ctx = newCtx(seed);
    expect(startWorldGeneration(ctx, stateOf(ctx))).toBe('enqueued');
    expect(rows(ctx, 'llm_job')).toHaveLength(1);
    expect(rows(ctx, 'character')[0].locationId).toBe(0n);
  });

  it('enqueues one world_gen_start job and one dispatch, moves the state to GENERATING and snapshots the input', () => {
    const ctx = newCtx({
      character_creation_state: [
        { id: 1n, playerId: alice, step: 'COMPLETE', archetype: 'mystic', createdAt: ts, updatedAt: ts },
      ],
    });
    expect(startWorldGeneration(ctx, stateOf(ctx))).toBe('enqueued');

    const jobs = rows(ctx, 'llm_job');
    expect(jobs).toHaveLength(1);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ route: 'world_gen_start', playerId: alice, characterId: 10n, status: 'pending' });
    expect(JSON.parse(jobs[0].dedupeKey)).toEqual([alice.toHexString(), 'world_gen_start', '5']);
    expect(rowColumnProblems('llm_job', jobs[0])).toEqual([]);
    expect(stateOf(ctx).step).toBe('GENERATING');
    expect(rowColumnProblems('world_gen_state', stateOf(ctx))).toEqual([]);

    const req = JSON.parse(jobs[0].requestJson);
    expect(req.genStateId).toBe('5');
    expect(typeof req.genStateId).toBe('string');
    const input = resolveRouteInput(ctx, jobs[0]) as any;
    expect(input).toEqual({
      worldContext: '',
      characterRace: 'Kobold',
      characterClass: 'Ashweaver',
      characterArchetype: 'mystic',
      sourceRegionName: 'the known world',
      neighborRegions: [],
    });
    expect(() => buildRouteLayers('world_gen_start', input)).not.toThrow();
  });

  it("uses the source region's name and buildRegionContext's neighbours for an explore", () => {
    const seed = {
      region: [
        { id: 1n, name: 'Ashen Reach', dangerMultiplier: 100n, biome: 'volcanic' },
        { id: 2n, name: 'Far Reach', dangerMultiplier: 200n, biome: 'forest', threats: 'wolves' },
      ],
      location: [
        { id: 10n, name: 'The Crossing', regionId: 1n },
        { id: 11n, name: 'The Mill', regionId: 2n },
      ],
      location_connection: [{ id: 1n, fromLocationId: 10n, toLocationId: 11n }],
      world_gen_state: [genStateRow({ sourceLocationId: 10n, sourceRegionId: 1n })],
      character: [charRow({ locationId: 10n })],
    };
    const ctx = newCtx(seed);
    expect(startWorldGeneration(ctx, stateOf(ctx))).toBe('enqueued');
    const input = resolveRouteInput(ctx, rows(ctx, 'llm_job')[0]) as any;
    expect(input.sourceRegionName).toBe('Ashen Reach');
    expect(input.neighborRegions).toEqual(buildRegionContext(ctx, 1n));
    expect(input.neighborRegions).toEqual([{ name: 'Far Reach', biome: 'forest', threats: 'wolves' }]);
    // No archetype row: the default.
    expect(input.characterArchetype).toBe('warrior');
  });

  it('a second start for the same state while its job is active is a duplicate with one job', () => {
    const ctx = newCtx();
    expect(startWorldGeneration(ctx, stateOf(ctx))).toBe('enqueued');
    expect(startWorldGeneration(ctx, stateOf(ctx))).toBe('duplicate');
    expect(rows(ctx, 'llm_job')).toHaveLength(1);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(1);
    expect(rows(ctx, 'llm_player_budget')[0].calls).toBe(1n);
    expect(stateOf(ctx).step).toBe('GENERATING');
  });

  const REFUSED_LINE =
    'The Keeper strains but cannot shape this realm right now. Type [explore] to try again later.';

  it('a refused request for a placed character sets ERROR with an in-voice message and posts the [explore] line privately', () => {
    const ctx = newCtx({
      character: [charRow({ locationId: 100n })],
      location: [{ id: 100n, name: 'The Crossing', regionId: 1n }],
      region: [{ id: 1n, name: 'Ashen Reach', dangerMultiplier: 100n }],
      world_gen_state: [genStateRow({ sourceLocationId: 100n, sourceRegionId: 1n })],
    });
    exhaustDay(ctx);
    expect(startWorldGeneration(ctx, stateOf(ctx))).toBe('refused');

    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
    expect(rows(ctx, 'llm_player_budget')[0].reservedMicroUsd).toBe(0n);
    expect(stateOf(ctx).step).toBe('ERROR');
    const message: string = stateOf(ctx).errorMessage;
    expect(message).toBe('The Keeper strains but cannot shape this realm right now.');
    // world_gen_state is public: nothing numeric and no budget words.
    expect(message).not.toMatch(/\d/);
    expect(message).not.toMatch(/budget|limit|daily/i);
    const events = rows(ctx, 'event_private');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'system', characterId: 10n, ownerUserId: 7n, message: REFUSED_LINE });
    expect(rows(ctx, 'event_creation')).toHaveLength(0);
  });

  it('a refused request for a character not yet placed posts the line as a creation_error event', () => {
    const ctx = newCtx();
    exhaustDay(ctx);
    expect(startWorldGeneration(ctx, stateOf(ctx))).toBe('refused');
    expect(stateOf(ctx).step).toBe('ERROR');
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    const events = rows(ctx, 'event_creation');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'creation_error', playerId: alice, message: REFUSED_LINE });
    // WR-06: the line is stored as one Keeper segment, like the failure path.
    expect(events[0].segments).toEqual([
      { kind: 'narration', speaker: 'The Keeper', text: REFUSED_LINE, speakerNpcId: undefined },
    ]);
    expect(rows(ctx, 'event_private')).toHaveLength(0);
  });
});

describe('startWorldGeneration: resting refusals (Phase 43)', () => {
  const T0 = 1_700_000_000_000_000n;
  const alice = { toHexString: () => 'a'.repeat(64) };
  const ts = { microsSinceUnixEpoch: T0 };
  const genStateRow = () => ({
    id: 5n,
    playerId: alice,
    characterId: 10n,
    sourceLocationId: 100n,
    sourceRegionId: 1n,
    step: 'PENDING',
    createdAt: ts,
    updatedAt: ts,
  });
  const newCtx = (placed: boolean) =>
    createMockCtx({
      seed: {
        player: [{ id: alice, userId: 7n }],
        character: [
          { id: 10n, ownerUserId: 7n, name: 'Aldric', race: 'Kobold', className: 'Ashweaver', locationId: placed ? 100n : 0n },
        ],
        location: [{ id: 100n, name: 'The Crossing', regionId: 1n }],
        region: [{ id: 1n, name: 'Ashen Reach', dangerMultiplier: 100n }],
        world_gen_state: [genStateRow()],
      },
      sender: alice,
      timestampMicros: T0,
      strict: true,
    });
  const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
  const RESTING_EXPLORE = `${LLM_RESTING_LINE} Type [explore] to try again.`;

  it.each([
    ['halted', (ctx: any) => setLlmEnabled(ctx, false)],
    ['ceiling', (ctx: any) => patchAdminState(ctx, { dailyCeilingMicroUsd: 1n })],
  ])('a %s refusal for a placed character stores the resting line and posts one private line that names [explore]', (_name, trip) => {
    const ctx = newCtx(true);
    trip(ctx);
    expect(startWorldGeneration(ctx, rows(ctx, 'world_gen_state')[0])).toBe('refused');

    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
    expect(rows(ctx, 'world_gen_state')[0]).toMatchObject({ step: 'ERROR', errorMessage: LLM_RESTING_LINE });
    const events = rows(ctx, 'event_private');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'system', characterId: 10n, message: RESTING_EXPLORE });
    expect(events[0].message.startsWith(LLM_RESTING_LINE)).toBe(true);
    expect(rows(ctx, 'event_creation')).toHaveLength(0);
  });

  it('a halted refusal for a character not yet placed posts one creation_error line starting with the resting line', () => {
    const ctx = newCtx(false);
    setLlmEnabled(ctx, false);
    expect(startWorldGeneration(ctx, rows(ctx, 'world_gen_state')[0])).toBe('refused');
    expect(rows(ctx, 'world_gen_state')[0]).toMatchObject({ step: 'ERROR', errorMessage: LLM_RESTING_LINE });
    const events = rows(ctx, 'event_creation');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'creation_error', playerId: alice, message: RESTING_EXPLORE });
    expect(events[0].segments).toEqual([
      { kind: 'narration', speaker: 'The Keeper', text: RESTING_EXPLORE, speakerNpcId: undefined },
    ]);
    expect(rows(ctx, 'event_private')).toHaveLength(0);
  });

  it('a daily_cost refusal still uses the old strains-but-cannot-shape message', () => {
    const ctx = newCtx(true);
    ctx.db.llm_player_budget.insert({
      id: 0n,
      playerId: alice,
      dayUtc: utcDay(ctx.timestamp),
      reservedMicroUsd: 0n,
      spentMicroUsd: LLM_PLAYER_DAILY_COST_MICRO_USD,
      calls: 1n,
    });
    expect(startWorldGeneration(ctx, rows(ctx, 'world_gen_state')[0])).toBe('refused');
    expect(rows(ctx, 'world_gen_state')[0].errorMessage).toBe('The Keeper strains but cannot shape this realm right now.');
    expect(rows(ctx, 'event_private')[0].message).toBe(
      'The Keeper strains but cannot shape this realm right now. Type [explore] to try again later.',
    );
  });
});

// ---------------------------------------------------------------------------
// Staged fill: buildWorldFillInput, startWorldFill, failWorldFill, retryWorldFill (Phase 43, LAT-03)
// ---------------------------------------------------------------------------

describe('staged world fill (Phase 43)', () => {
  const T0 = 1_700_000_000_000_000n;
  const alice = { toHexString: () => 'a'.repeat(64) };
  const bob = { toHexString: () => 'b'.repeat(64) };
  const ts = { microsSinceUnixEpoch: T0 };

  const stateRow = (over: Record<string, unknown> = {}) => ({
    id: 5n,
    playerId: alice,
    characterId: 10n,
    sourceLocationId: 0n,
    sourceRegionId: 0n,
    step: 'GENERATING',
    createdAt: ts,
    updatedAt: ts,
    ...over,
  });
  const charRow = (over: Record<string, unknown> = {}) => ({
    id: 10n,
    ownerUserId: 7n,
    name: 'Aldric',
    race: 'Kobold',
    className: 'Ashweaver',
    locationId: 0n,
    ...over,
  });
  const newCtx = (seed: Record<string, any[]> = {}) =>
    createMockCtx({
      seed: {
        player: [{ id: alice, userId: 7n }, { id: bob, userId: 8n }],
        character: [charRow()],
        world_gen_state: [stateRow()],
        ...seed,
      },
      sender: alice,
      timestampMicros: T0,
      strict: true,
    });
  const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
  const stateOf = (ctx: any) => rows(ctx, 'world_gen_state')[0];
  const exhaustDay = (ctx: any, who: any = alice) =>
    ctx.db.llm_player_budget.insert({
      id: 0n,
      playerId: who,
      dayUtc: utcDay(ctx.timestamp),
      reservedMicroUsd: 0n,
      spentMicroUsd: LLM_PLAYER_DAILY_COST_MICRO_USD,
      calls: 1n,
    });

  /** Stage 1 landed: region, start location and first NPC written, generatedRegionId recorded. */
  function landStageOne(ctx: any, reply: any = baseStartReply()) {
    const state = stateOf(ctx);
    const { region, startLocation, firstNpc } = writeRegionStart(ctx, reply, state);
    ctx.db.world_gen_state.id.update({ ...state, generatedRegionId: region.id });
    return { region, startLocation, firstNpc, state: stateOf(ctx) };
  }

  const stageOneRowNames = (ctx: any) => ({
    regions: rows(ctx, 'region').map((r: any) => r.name),
    locations: rows(ctx, 'location').map((l: any) => l.name),
    firstNpc: rows(ctx, 'npc').filter((n: any) => n.name === 'Oswin Tarr').length,
  });

  describe('buildWorldFillInput', () => {
    it('reads the region, start location, people there and character context back from the stored rows', () => {
      const ctx = newCtx({
        region: [
          { id: 100n, name: 'Ashen Reach', dangerMultiplier: 100n, biome: 'volcanic' },
          { id: 200n, name: 'Far Reach', dangerMultiplier: 200n, biome: 'forest', threats: 'wolves' },
        ],
        location: [
          { id: 50n, name: 'The Crossing', regionId: 100n, terrainType: 'passage' },
          { id: 60n, name: 'The Mill', regionId: 200n, terrainType: 'plains' },
        ],
        location_connection: [
          { id: 1n, fromLocationId: 50n, toLocationId: 60n },
          { id: 2n, fromLocationId: 60n, toLocationId: 50n },
        ],
        world_gen_state: [stateRow({ sourceLocationId: 50n, sourceRegionId: 100n })],
      });
      const { state } = landStageOne(ctx, baseStartReply({ firstNpc: { ...baseStartReply().firstNpc, gender: 'female' } }));
      const input = buildWorldFillInput(ctx, state);
      expect(input).toEqual({
        regionName: 'Test Region',
        biome: 'forest',
        startLocation: { name: 'Safe Haven', description: 'A safe place.', terrainType: 'town' },
        npcsPresent: [{ name: 'Oswin Tarr', npcType: 'lore', gender: 'female' }],
        characterRace: 'Kobold',
        characterClass: 'Ashweaver',
        characterArchetype: 'warrior',
        sourceRegionName: 'Ashen Reach',
        // The new region is now connected to the source region and must not list itself.
        neighborRegions: [{ name: 'Far Reach', biome: 'forest', threats: 'wolves' }],
        // Plan 51.3.1.1-23 (D-62): the server's hub count and whether the arrival point is a hub.
        hubCount: regionHubCount(rows(ctx, 'region').find((r: any) => r.name === 'Test Region'), false),
        arrivalIsHub: false,
      });
      expect(() => buildRouteLayers('world_gen', input)).not.toThrow();
    });

    it('a starter reads "the known world" and no neighbours', () => {
      const ctx = newCtx();
      const { state } = landStageOne(ctx);
      const input = buildWorldFillInput(ctx, state);
      expect(input.sourceRegionName).toBe('the known world');
      expect(input.neighborRegions).toEqual([]);
    });

    it('throws a plain Error when the region or the start location is missing', () => {
      const ctx = newCtx();
      expect(() => buildWorldFillInput(ctx, stateOf(ctx))).toThrow(/region is missing/);
      expect(() => buildWorldFillInput(ctx, { ...stateOf(ctx), generatedRegionId: 99n })).toThrow(/region is missing/);
      const region = ctx.db.region.insert({ id: 0n, name: 'Hollow', dangerMultiplier: 100n, regionType: 'generated' });
      expect(() => buildWorldFillInput(ctx, { ...stateOf(ctx), generatedRegionId: region.id })).toThrow(/no start location/);
    });
  });

  describe('startWorldFill', () => {
    it('enqueues one world_gen job keyed by the state, moves the state to FILLING and snapshots the stage-1 facts', () => {
      const ctx = newCtx();
      const { state } = landStageOne(ctx);
      expect(startWorldFill(ctx, state)).toBe('enqueued');

      const jobs = rows(ctx, 'llm_job');
      expect(jobs).toHaveLength(1);
      expect(rows(ctx, 'llm_dispatch')).toHaveLength(1);
      expect(jobs[0]).toMatchObject({ route: 'world_gen', playerId: alice, characterId: 10n, status: 'pending' });
      expect(JSON.parse(jobs[0].dedupeKey)).toEqual([alice.toHexString(), 'world_gen', '5']);
      expect(JSON.parse(jobs[0].requestJson).genStateId).toBe('5');
      expect(rowColumnProblems('llm_job', jobs[0])).toEqual([]);

      expect(stateOf(ctx)).toMatchObject({ step: 'FILLING', generatedRegionId: state.generatedRegionId });
      expect(stateOf(ctx).errorMessage).toBeUndefined();
      expect(rowColumnProblems('world_gen_state', stateOf(ctx))).toEqual([]);

      const input = resolveRouteInput(ctx, jobs[0]) as any;
      expect(input.regionName).toBe('Test Region');
      expect(input.npcsPresent).toEqual([{ name: 'Oswin Tarr', npcType: 'lore', gender: 'male' }]);
      expect(() => buildRouteLayers('world_gen', input)).not.toThrow();
    });

    it('a second call while the job is active is a duplicate with one job', () => {
      const ctx = newCtx();
      const { state } = landStageOne(ctx);
      expect(startWorldFill(ctx, state)).toBe('enqueued');
      expect(startWorldFill(ctx, stateOf(ctx))).toBe('duplicate');
      expect(rows(ctx, 'llm_job')).toHaveLength(1);
      expect(rows(ctx, 'llm_dispatch')).toHaveLength(1);
      expect(stateOf(ctx).step).toBe('FILLING');
    });

    it('an active stage-1 job for the same state does not block the fill (distinct route in the dedupe key)', () => {
      const ctx = newCtx({ world_gen_state: [stateRow({ step: 'PENDING' })] });
      expect(startWorldGeneration(ctx, stateOf(ctx))).toBe('enqueued');
      const { state } = landStageOne(ctx);
      expect(startWorldFill(ctx, state)).toBe('enqueued');
      expect(rows(ctx, 'llm_job').map((j: any) => j.route)).toEqual(['world_gen_start', 'world_gen']);
    });

    it.each([
      ['halted', (ctx: any) => setLlmEnabled(ctx, false)],
      ['ceiling', (ctx: any) => patchAdminState(ctx, { dailyCeilingMicroUsd: 1n })],
    ])('a %s refusal fails the fill with the resting line and keeps stage 1 playable', (_name, trip) => {
      const ctx = newCtx({ character: [charRow({ locationId: 100n })] });
      const { startLocation } = landStageOne(ctx);
      const before = stageOneRowNames(ctx);
      trip(ctx);
      expect(startWorldFill(ctx, stateOf(ctx))).toBe('refused');

      expect(rows(ctx, 'llm_job')).toHaveLength(0);
      expect(stateOf(ctx)).toMatchObject({ step: 'FILL_ERROR', errorMessage: LLM_RESTING_LINE });
      const events = rows(ctx, 'event_private');
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ kind: 'system', characterId: 10n, message: `${LLM_RESTING_LINE} Type [explore] to try again.` });
      expect(stageOneRowNames(ctx).regions).toEqual(before.regions);
      expect(stageOneRowNames(ctx).locations).toEqual(before.locations);
      expect(stageOneRowNames(ctx).firstNpc).toBe(1);
      const here = rows(ctx, 'npc').filter((n: any) => n.locationId === startLocation.id).map((n: any) => n.npcType);
      expect(here).toEqual(expect.arrayContaining(['vendor', 'banker']));
    });

    it('any other refusal stores the refused message (no digits, no budget words) and posts one line that names [explore]', () => {
      const ctx = newCtx({ character: [charRow({ locationId: 100n })] });
      landStageOne(ctx);
      exhaustDay(ctx);
      expect(startWorldFill(ctx, stateOf(ctx))).toBe('refused');

      expect(rows(ctx, 'llm_job')).toHaveLength(0);
      expect(rows(ctx, 'llm_player_budget')[0].reservedMicroUsd).toBe(0n);
      expect(stateOf(ctx)).toMatchObject({ step: 'FILL_ERROR', errorMessage: WORLD_FILL_REFUSED_MESSAGE });
      expect(stateOf(ctx).errorMessage).not.toMatch(/\d/);
      expect(stateOf(ctx).errorMessage).not.toMatch(/budget|limit|daily/i);
      const events = rows(ctx, 'event_private');
      expect(events).toHaveLength(1);
      expect(events[0].message).toBe(`${WORLD_FILL_REFUSED_MESSAGE} Type [explore] to try again.`);
    });

    it('a state whose stage 1 cannot be read fails the fill with the failed message and enqueues nothing', () => {
      const ctx = newCtx({ character: [charRow({ locationId: 100n })] });
      expect(startWorldFill(ctx, stateOf(ctx))).toBe('refused');
      expect(rows(ctx, 'llm_job')).toHaveLength(0);
      expect(stateOf(ctx)).toMatchObject({ step: 'FILL_ERROR', errorMessage: WORLD_FILL_FAILED_MESSAGE });
    });

    it('never enqueues a second job on its own after a refusal', () => {
      const ctx = newCtx();
      landStageOne(ctx);
      exhaustDay(ctx);
      expect(startWorldFill(ctx, stateOf(ctx))).toBe('refused');
      expect(rows(ctx, 'llm_job')).toHaveLength(0);
      expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
    });
  });

  describe('failWorldFill', () => {
    it('sets FILL_ERROR, keeps every stage-1 row, adds the vendor and banker and posts one private line for a placed character', () => {
      const ctx = newCtx({ character: [charRow({ locationId: 100n })] });
      const { startLocation, region } = landStageOne(ctx);
      const before = stageOneRowNames(ctx);
      failWorldFill(ctx, stateOf(ctx), WORLD_FILL_FAILED_MESSAGE);

      expect(stateOf(ctx)).toMatchObject({ step: 'FILL_ERROR', errorMessage: WORLD_FILL_FAILED_MESSAGE, generatedRegionId: region.id });
      expect(stageOneRowNames(ctx).locations).toEqual(before.locations);
      expect(stageOneRowNames(ctx).firstNpc).toBe(1);
      const types = rows(ctx, 'npc').filter((n: any) => n.locationId === startLocation.id).map((n: any) => n.npcType).sort();
      expect(types).toEqual(['banker', 'lore', 'vendor']);
      const events = rows(ctx, 'event_private');
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        kind: 'system',
        characterId: 10n,
        ownerUserId: 7n,
        message: `${WORLD_FILL_FAILED_MESSAGE} Type [explore] to try again.`,
      });
      expect(rows(ctx, 'event_creation')).toHaveLength(0);
    });

    it('posts a creation_error line for a character that is not placed yet', () => {
      const ctx = newCtx();
      landStageOne(ctx);
      failWorldFill(ctx, stateOf(ctx), WORLD_FILL_FAILED_MESSAGE);
      const events = rows(ctx, 'event_creation');
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ kind: 'creation_error', playerId: alice });
      expect(events[0].message).toContain('[explore]');
      expect(rows(ctx, 'event_private')).toHaveLength(0);
    });

    it('running it twice never duplicates the vendor or banker', () => {
      const ctx = newCtx({ character: [charRow({ locationId: 100n })] });
      landStageOne(ctx);
      failWorldFill(ctx, stateOf(ctx), WORLD_FILL_FAILED_MESSAGE);
      failWorldFill(ctx, stateOf(ctx), WORLD_FILL_FAILED_MESSAGE);
      expect(rows(ctx, 'npc').filter((n: any) => n.npcType === 'vendor')).toHaveLength(1);
      expect(rows(ctx, 'npc').filter((n: any) => n.npcType === 'banker')).toHaveLength(1);
    });

    it('a state with no stored region (stage 1 never landed) still reports the failure', () => {
      const ctx = newCtx({ character: [charRow({ locationId: 100n })] });
      expect(() => failWorldFill(ctx, stateOf(ctx), WORLD_FILL_FAILED_MESSAGE)).not.toThrow();
      expect(stateOf(ctx).step).toBe('FILL_ERROR');
      expect(rows(ctx, 'npc')).toHaveLength(0);
    });

    it('never enqueues anything', () => {
      const ctx = newCtx();
      landStageOne(ctx);
      failWorldFill(ctx, stateOf(ctx), WORLD_FILL_FAILED_MESSAGE);
      expect(rows(ctx, 'llm_job')).toHaveLength(0);
      expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
    });
  });

  describe('retryWorldFill', () => {
    const explorer = (over: Record<string, unknown> = {}) =>
      charRow({ id: 11n, ownerUserId: 8n, name: 'Bree', ...over });

    /** A failed fill for a region reached from location 50, with the explorer standing at `at`. */
    const failedSeed = (at: 'source' | 'region' | 'nowhere', over: Record<string, unknown> = {}) => {
      const ctx = newCtx({
        region: [{ id: 100n, name: 'Ashen Reach', dangerMultiplier: 100n }],
        location: [{ id: 50n, name: 'The Passage', regionId: 100n, terrainType: 'passage' }],
        character: [charRow({ locationId: 50n }), explorer()],
        world_gen_state: [stateRow({ sourceLocationId: 50n, sourceRegionId: 100n, ...over })],
      });
      const { startLocation, state } = landStageOne(ctx);
      ctx.db.world_gen_state.id.update({ ...state, step: 'FILL_ERROR', errorMessage: WORLD_FILL_FAILED_MESSAGE });
      const where = at === 'source' ? 50n : at === 'region' ? startLocation.id : 999n;
      ctx.db.character.id.update({ ...rows(ctx, 'character')[1], locationId: where });
      return { ctx, startLocation };
    };

    it.each(['source', 'region'] as const)(
      'started: a FILL_ERROR state matched by the %s hands the state to the explorer and re-enqueues the fill',
      (at) => {
        const { ctx } = failedSeed(at);
        expect(retryWorldFill(ctx, rows(ctx, 'character')[1], bob)).toBe('started');
        expect(stateOf(ctx)).toMatchObject({ step: 'FILLING', playerId: bob, characterId: 11n });
        expect(stateOf(ctx).errorMessage).toBeUndefined();
        const jobs = rows(ctx, 'llm_job');
        expect(jobs).toHaveLength(1);
        expect(jobs[0]).toMatchObject({ route: 'world_gen', playerId: bob, characterId: 11n, status: 'pending' });
        expect(JSON.parse(jobs[0].dedupeKey)).toEqual([bob.toHexString(), 'world_gen', '5']);
      },
    );

    it('busy: a matching FILLING state starts nothing', () => {
      const { ctx } = failedSeed('region');
      ctx.db.world_gen_state.id.update({ ...stateOf(ctx), step: 'FILLING' });
      expect(retryWorldFill(ctx, rows(ctx, 'character')[1], bob)).toBe('busy');
      expect(rows(ctx, 'llm_job')).toHaveLength(0);
      expect(stateOf(ctx).playerId).toBe(alice);
    });

    it('none: nothing matches, the state is COMPLETE or ERROR, or the character is not placed', () => {
      const away = failedSeed('nowhere');
      expect(retryWorldFill(away.ctx, rows(away.ctx, 'character')[1], bob)).toBe('none');

      for (const step of ['COMPLETE', 'ERROR', 'GENERATING', 'PENDING']) {
        const { ctx } = failedSeed('region');
        ctx.db.world_gen_state.id.update({ ...stateOf(ctx), step });
        expect(retryWorldFill(ctx, rows(ctx, 'character')[1], bob)).toBe('none');
        expect(rows(ctx, 'llm_job')).toHaveLength(0);
      }

      const { ctx } = failedSeed('region');
      expect(retryWorldFill(ctx, { ...rows(ctx, 'character')[1], locationId: 0n }, bob)).toBe('none');
    });

    it('refused: a refused enqueue leaves the state FILL_ERROR and posts the refusal line once', () => {
      const { ctx } = failedSeed('region');
      exhaustDay(ctx, bob);
      expect(retryWorldFill(ctx, rows(ctx, 'character')[1], bob)).toBe('refused');
      expect(stateOf(ctx)).toMatchObject({ step: 'FILL_ERROR', errorMessage: WORLD_FILL_REFUSED_MESSAGE });
      expect(rows(ctx, 'llm_job')).toHaveLength(0);
      const lines = rows(ctx, 'event_private').filter((e: any) => e.characterId === 11n);
      expect(lines).toHaveLength(1);
      expect(lines[0].message).toBe(`${WORLD_FILL_REFUSED_MESSAGE} Type [explore] to try again.`);
    });
  });
});

describe('staged world copy (Phase 43)', () => {
  const LINES = [
    WORLD_START_MILESTONE_LINE,
    WORLD_FILL_FAILED_MESSAGE,
    WORLD_FILL_REFUSED_MESSAGE,
    WORLD_FILL_RETRY_LINE,
    worldFillCompleteLine('Cinderfall'),
  ];

  it('pins the final wording', () => {
    expect(WORLD_START_MILESTONE_LINE).toBe(
      'The Keeper clears his throat. This ground will do; the rest of the region is still being remembered.',
    );
    expect(WORLD_FILL_FAILED_MESSAGE).toBe(
      'The Keeper loses the thread of the rest of the map. What he has already shown you will hold.',
    );
    expect(WORLD_FILL_REFUSED_MESSAGE).toBe(
      'The Keeper cannot finish remembering this region right now. What he has shown you will hold.',
    );
    expect(WORLD_FILL_RETRY_LINE).toBe('The Keeper squints at the half-remembered land and tries again...');
    expect(worldFillCompleteLine('Cinderfall')).toBe(
      'The rest of Cinderfall settles into place. Try [travel] to see where the roads lead.',
    );
  });

  it('the Keeper is he; no line calls him or anyone it or they', () => {
    for (const line of LINES) {
      expect(line).not.toMatch(/\b(it|its|itself|they|them|their|themselves)\b/i);
    }
    for (const line of [WORLD_START_MILESTONE_LINE, WORLD_FILL_FAILED_MESSAGE, WORLD_FILL_REFUSED_MESSAGE, WORLD_FILL_RETRY_LINE]) {
      expect(line).toContain('The Keeper');
    }
    expect(WORLD_START_MILESTONE_LINE).toContain('his throat');
  });

  it('the lines stored on the public state carry no digit and no budget word', () => {
    for (const line of [WORLD_FILL_FAILED_MESSAGE, WORLD_FILL_REFUSED_MESSAGE]) {
      expect(line).not.toMatch(/\d/);
      expect(line).not.toMatch(/budget|limit|daily|ceiling|anthropic|claude/i);
    }
  });
});

describe('world_gen.ts schedules no retry of its own', () => {

  it('schedules nothing and enqueues the fill from exactly one place (startWorldFill)', () => {
    const source = readFileSync(fileURLToPath(new URL('./world_gen.ts', import.meta.url)), 'utf8');
    const text = source
      .split('\n')
      .filter((l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l))
      .join('\n');
    expect(text).not.toMatch(/setTimeout|setInterval|\.schedule|world_gen_tick/);
    const enqueues = text.match(/route: 'world_gen'/g) ?? [];
    expect(enqueues).toHaveLength(1);
  });
});

describe('NPC gender in the staged writers (Plan 41-18, PR-02 and PR-05)', () => {
  function npcItem(overrides: any = {}) {
    return {
      name: 'Oswin Tarr',
      npcType: 'lore',
      locationName: 'Safe Haven',
      description: 'A figure at the crossing.',
      greeting: 'Well met.',
      personality: PERSONALITY,
      ...overrides,
    };
  }
  /** The fill NPCs through stage 2 (the start location holds no stage-1 NPC here). */
  function run(npcs: any[]) {
    const tx = createMockTx();
    tx.db.region.insert({ id: 100n, name: 'Source', dangerMultiplier: 100n });
    writeBoth(tx, baseStartReply({ firstNpc: undefined }), baseFillReply({ npcs }));
    return tx.db.npc._rows();
  }
  /** The stage-1 first NPC. */
  function runFirst(npc: any) {
    const tx = createMockTx();
    writeRegionStart(tx, baseStartReply({ firstNpc: npc }), baseGenState());
    return tx.db.npc._rows();
  }

  it('keeps a valid model gender, trimmed and case-insensitive', () => {
    expect(run([npcItem({ gender: 'female' })]).find((n: any) => n.name === 'Oswin Tarr').gender).toBe('female');
    expect(run([npcItem({ gender: 'Female ' })]).find((n: any) => n.name === 'Oswin Tarr').gender).toBe('female');
    expect(runFirst(npcItem({ gender: 'Female ' }))[0].gender).toBe('female');
  });

  it('reads the pronouns in the description when the gender is missing', () => {
    const description = 'She keeps the ferry and her ledger.';
    expect(run([npcItem({ description })]).find((n: any) => n.name === 'Oswin Tarr').gender).toBe('female');
    expect(runFirst(npcItem({ description }))[0].gender).toBe('female');
  });

  it('clamps an invalid gender and falls back to the name hash', () => {
    expect(run([npcItem({ gender: 'it', description: 'A figure at the crossing.' })]).find((n: any) => n.name === 'Oswin Tarr').gender).toBe('male');
    expect(runFirst(npcItem({ gender: 'they' }))[0].gender).toBe('male');
  });

  it('gives the safety-net vendor and banker a gender', () => {
    const rows = run([]);
    expect(rows.find((n: any) => n.npcType === 'vendor').gender).toBe('male');
    expect(rows.find((n: any) => n.npcType === 'banker').gender).toBe('female');
  });

  it('every inserted npc row, first NPC included, has a gender in NPC_GENDERS', () => {
    const rows = run([npcItem({ gender: 42 }), npcItem({ name: 'Mara Quill', gender: undefined })]);
    expect(rows.length).toBeGreaterThan(2);
    for (const r of rows) expect(['male', 'female']).toContain(r.gender);
    for (const r of runFirst(npcItem({ gender: 7 }))) expect(['male', 'female']).toContain(r.gender);
  });
});

// ---------------------------------------------------------------------------
// Plan 09 Task 3: hubs, their vendor and banker, crafting stations and bind stones (D-59 to D-64)
// ---------------------------------------------------------------------------

describe('hubs (Plan 09 Task 3, D-59 to D-64)', () => {
  const T0 = 1_700_000_000_000_000n;
  const alice = { toHexString: () => 'a'.repeat(64) };
  const ts = { microsSinceUnixEpoch: T0 };
  // computeRegionDanger adds 50 + (timestamp % 51) to the source danger, capped at 800.
  const DANGER_STEP = 50n + (T0 % 51n);

  /** The first region id whose hub count at `danger` (not a starter) is `count`. Never a hard-coded roll. */
  function regionIdWithHubCount(danger: bigint, count: number, from = 2n): bigint {
    for (let id = from; id < from + 2000n; id += 1n) {
      if (hubCountFor(danger, false, hubSeed(id)) === count) return id;
    }
    throw new Error(`no region id with hub count ${count} at danger ${danger}`);
  }

  /** A strict ctx whose next region insert gets `regionId` at `danger`, with a stage-2 state for it. */
  function hubCtx(regionId: bigint, danger: bigint, extra: Record<string, any[]> = {}) {
    const sourceDanger = danger >= 800n ? 800n : danger - DANGER_STEP;
    const items = ['Wood', 'Peat', 'Scrap Cloth', 'Flax', 'Herbs'].map((name, i) => ({ id: 700n + BigInt(i), name, slot: 'resource' }));
    return createMockCtx({
      seed: {
        player: [{ id: alice, userId: 7n }],
        character: [{ id: 10n, ownerUserId: 7n, name: 'Aldric', race: 'Kobold', className: 'Ashweaver', locationId: 0n }],
        region: [{ id: regionId - 1n, name: 'Source', dangerMultiplier: sourceDanger }],
        world_gen_state: [
          {
            id: 5n,
            playerId: alice,
            characterId: 10n,
            sourceLocationId: 0n,
            sourceRegionId: regionId - 1n,
            step: 'GENERATING',
            createdAt: ts,
            updatedAt: ts,
          },
        ],
        item_template: items,
        ...extra,
      },
      sender: alice,
      timestampMicros: T0,
      strict: true,
    });
  }
  const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
  const stateOf = (ctx: any) => rows(ctx, 'world_gen_state')[0];
  const placesOf = (ctx: any, regionId: bigint) => rows(ctx, 'location').filter((l: any) => l.regionId === regionId);
  const npcsAt = (ctx: any, locationId: bigint) => rows(ctx, 'npc').filter((n: any) => n.locationId === locationId);
  const servicesAt = (ctx: any, locationId: bigint) =>
    npcsAt(ctx, locationId)
      .map((n: any) => n.npcType)
      .filter((t: string) => t === 'vendor' || t === 'banker')
      .sort();

  function stageOne(ctx: any, reply: any = baseStartReply()) {
    const state = stateOf(ctx);
    const out = writeRegionStart(ctx, reply, state);
    ctx.db.world_gen_state.id.update({ ...state, generatedRegionId: out.region.id });
    return out;
  }
  function both(ctx: any, fill: any, start: any = baseStartReply()) {
    const s = stageOne(ctx, start);
    const f = writeRegionFill(ctx, fill, stateOf(ctx), s.region, s.startLocation);
    return { ...s, ...f };
  }
  const SERVICE_NPCS = [
    { name: 'Shopkeep', gender: 'male', npcType: 'vendor', locationName: 'Safe Haven', description: 'A vendor.', greeting: 'Hello.', personality: PERSONALITY },
    { name: 'Banker Bob', gender: 'male', npcType: 'banker', locationName: 'Safe Haven', description: 'A banker.', greeting: 'Welcome.', personality: PERSONALITY },
  ];

  it('regionHubCount reads hubCountFor on the region id and danger', () => {
    for (const id of [3n, 17n, 40n]) {
      expect(regionHubCount({ id, dangerMultiplier: 400n }, false)).toBe(hubCountFor(400n, false, hubSeed(id)));
    }
    expect(regionHubCount({ id: 9n, dangerMultiplier: 800n }, true)).toBe(1);
  });

  it('readHubMarks: the arrival first when marked, then marked locations by name; unknown names are ignored', () => {
    const arrival = { id: 1n, name: 'Safe Haven' };
    const byName = new Map<string, any>([
      ['sallow wood', { id: 2n }],
      ['black fen', { id: 3n }],
    ]);
    const fill = {
      arrival: { isHub: true },
      locations: [
        { name: 'Black Fen', isHub: true },
        { name: 'Sallow Wood' },
        { name: 'Nowhere', isHub: true },
        { name: 'sallow wood', isHub: true },
      ],
    };
    expect(readHubMarks(fill, arrival, byName)).toEqual([1n, 3n, 2n]);
    expect(readHubMarks({ locations: [{ name: 'Black Fen' }] }, arrival, byName)).toEqual([]);
    expect(readHubMarks(baseFillReply(), arrival, byName)).toEqual([]);
  });

  it('writeRegionStart, starter: the arrival point is safe, a hub, with a crafting station and a bind stone', () => {
    const ctx = hubCtx(2n, 150n);
    const { startLocation } = writeRegionStart(ctx, baseStartReply(), { ...stateOf(ctx), sourceRegionId: 0n }, 'kobold');
    expect(startLocation).toMatchObject({ isSafe: true, isHub: true, craftingAvailable: true, bindStone: true });
  });

  it('writeRegionStart, not a starter: safe when the reply says nothing (an old reply), not a hub, no station and no bind stone (D-63, D-64)', () => {
    const ctx = hubCtx(2n, 150n);
    const { startLocation } = stageOne(ctx);
    expect(startLocation).toMatchObject({ isSafe: true, isHub: false, craftingAvailable: false, bindStone: false });
  });

  it('the reply shape of today with hub count 1: the arrival point is the only hub, keeps the reply vendor and banker, with a station and a bind stone', () => {
    const regionId = regionIdWithHubCount(150n, 1);
    const ctx = hubCtx(regionId, 150n);
    const { region, startLocation, locations } = both(
      ctx,
      familyFillReply({
        locations: [
          { name: 'Sallow Wood', description: 'w', terrainType: 'woods', isSafe: false, levelOffset: 0, connectsTo: ['Safe Haven'] },
          { name: 'Reed Camp', description: 'c', terrainType: 'plains', isSafe: true, levelOffset: 0, connectsTo: ['Safe Haven'] },
        ],
        npcs: SERVICE_NPCS,
      }),
    );
    expect(region.id).toBe(regionId);
    expect(region.dangerMultiplier).toBe(150n);
    const arrival = rows(ctx, 'location').find((l: any) => l.id === startLocation.id);
    expect(arrival).toMatchObject({ isHub: true, isSafe: true, craftingAvailable: true, bindStone: true });
    expect(npcsAt(ctx, arrival.id).filter((n: any) => n.npcType === 'vendor').map((n: any) => n.name)).toEqual(['Shopkeep']);
    expect(npcsAt(ctx, arrival.id).filter((n: any) => n.npcType === 'banker').map((n: any) => n.name)).toEqual(['Banker Bob']);
    for (const loc of locations) {
      const row = rows(ctx, 'location').find((l: any) => l.id === loc.id);
      expect(row).toMatchObject({ isHub: false, craftingAvailable: false, bindStone: false });
    }
    expect(rows(ctx, 'location').filter((l: any) => l.isHub)).toHaveLength(1);
  });

  it('two marked locations where the count is 1: the first mark is the hub, made safe with services and no creature pool; the second keeps its pools', () => {
    const regionId = regionIdWithHubCount(150n, 1);
    const ctx = hubCtx(regionId, 150n);
    const { startLocation, locations } = both(
      ctx,
      familyFillReply({
        locations: [
          { name: 'Sallow Wood', description: 'w', terrainType: 'woods', isSafe: false, isHub: true, levelOffset: 0, connectsTo: ['Safe Haven'] },
          { name: 'Black Fen', description: 'f', terrainType: 'swamp', isSafe: false, isHub: true, levelOffset: 1, connectsTo: ['Sallow Wood'] },
        ],
      }),
    );
    const row = (name: string) => rows(ctx, 'location').find((l: any) => l.name === name);
    const wood = row('Sallow Wood');
    const fen = row('Black Fen');
    expect(wood).toMatchObject({ isHub: true, isSafe: true, bindStone: true });
    expect(wood.craftingAvailable).toBe(hubHasStation(150n, false, stationSeed(regionId, wood.id)));
    expect(servicesAt(ctx, wood.id)).toEqual(['banker', 'vendor']);
    expect(rows(ctx, 'place_pool').filter((p: any) => p.locationId === wood.id && p.kind === 'creature')).toEqual([]);
    expect(fen).toMatchObject({ isHub: false, isSafe: false });
    expect(rows(ctx, 'place_pool').some((p: any) => p.locationId === fen.id && p.kind === 'creature')).toBe(true);
    expect(rows(ctx, 'location').find((l: any) => l.id === startLocation.id)).toMatchObject({ isHub: false, bindStone: false });
    expect(servicesAt(ctx, startLocation.id)).toEqual([]);
    expect(locations).toHaveLength(2);
  });

  it('hub count 0: no hub, no vendor or banker anywhere in the region (theirs become lore), no station, no bind stone', () => {
    const regionId = regionIdWithHubCount(800n, 0);
    const ctx = hubCtx(regionId, 800n);
    const { region, startLocation, locations, boundary } = both(
      ctx,
      familyFillReply({
        npcs: [
          ...SERVICE_NPCS,
          { name: 'Wren Hale', gender: 'female', npcType: 'vendor', locationName: 'Sallow Wood', description: 'A peddler.', greeting: 'Hm.', personality: PERSONALITY },
        ],
      }),
    );
    expect(region.dangerMultiplier).toBe(800n);
    const places = placesOf(ctx, region.id);
    expect(places.filter((l: any) => l.isHub)).toEqual([]);
    expect(places.filter((l: any) => l.craftingAvailable)).toEqual([]);
    const npcs = rows(ctx, 'npc').filter((n: any) => places.some((l: any) => l.id === n.locationId));
    expect(npcs.filter((n: any) => n.npcType === 'vendor' || n.npcType === 'banker')).toEqual([]);
    for (const name of ['Shopkeep', 'Banker Bob', 'Wren Hale']) {
      expect(npcs.find((n: any) => n.name === name)).toMatchObject({ npcType: 'lore' });
    }
    // D-64: the arrival point keeps its stage-1 value (no bind stone), and no new place gets one.
    expect(places.find((l: any) => l.id === startLocation.id).bindStone).toBe(false);
    for (const loc of [...locations, boundary]) {
      expect(places.find((l: any) => l.id === loc.id).bindStone).toBe(false);
    }
  });

  it('hub count 2 with one other safe place: both are hubs with services; each station is the server roll', () => {
    const regionId = regionIdWithHubCount(400n, 2);
    const ctx = hubCtx(regionId, 400n);
    const { region, startLocation } = both(
      ctx,
      familyFillReply({
        locations: [
          { name: 'Sallow Wood', description: 'w', terrainType: 'woods', isSafe: false, levelOffset: 0, connectsTo: ['Safe Haven'] },
          { name: 'Reed Camp', description: 'c', terrainType: 'plains', isSafe: true, levelOffset: 0, connectsTo: ['Safe Haven'] },
        ],
      }),
    );
    expect(region.dangerMultiplier).toBe(400n);
    const hubs = placesOf(ctx, region.id).filter((l: any) => l.isHub);
    const camp = placesOf(ctx, region.id).find((l: any) => l.name === 'Reed Camp');
    expect(hubs.map((h: any) => h.id).sort()).toEqual([startLocation.id, camp.id].sort());
    for (const hub of hubs) {
      expect(hub).toMatchObject({ isSafe: true, bindStone: true });
      expect(servicesAt(ctx, hub.id)).toEqual(['banker', 'vendor']);
      expect(hub.craftingAvailable).toBe(hubHasStation(400n, false, stationSeed(regionId, hub.id)));
    }
  });

  it('a starter region fill: the arrival point stays the only hub whatever the reply marks', () => {
    const ctx = hubCtx(2n, 150n);
    ctx.db.world_gen_state.id.update({ ...stateOf(ctx), sourceRegionId: 0n });
    const { startLocation } = both(
      ctx,
      familyFillReply({
        arrival: { isHub: false },
        locations: [{ name: 'Reed Camp', description: 'c', terrainType: 'town', isSafe: true, isHub: true, levelOffset: 0, connectsTo: ['Safe Haven'] }],
      }),
    );
    const hubs = rows(ctx, 'location').filter((l: any) => l.isHub);
    expect(hubs.map((h: any) => h.id)).toEqual([startLocation.id]);
    expect(hubs[0]).toMatchObject({ isSafe: true, craftingAvailable: true, bindStone: true });
    expect(servicesAt(ctx, startLocation.id)).toEqual(['banker', 'vendor']);
  });

  it('failWorldFill at danger 150: the arrival point becomes the hub with a vendor and a banker; a second call inserts nothing', () => {
    const regionId = regionIdWithHubCount(150n, 1);
    const ctx = hubCtx(regionId, 150n);
    const { startLocation } = stageOne(ctx);
    failWorldFill(ctx, stateOf(ctx), WORLD_FILL_FAILED_MESSAGE);
    expect(rows(ctx, 'location').find((l: any) => l.id === startLocation.id)).toMatchObject({
      isHub: true,
      isSafe: true,
      bindStone: true,
      craftingAvailable: hubHasStation(150n, false, stationSeed(regionId, startLocation.id)),
    });
    expect(servicesAt(ctx, startLocation.id)).toEqual(['banker', 'vendor']);
    const before = { npc: rows(ctx, 'npc').length, location: rows(ctx, 'location').length };
    failWorldFill(ctx, stateOf(ctx), WORLD_FILL_FAILED_MESSAGE);
    expect({ npc: rows(ctx, 'npc').length, location: rows(ctx, 'location').length }).toEqual(before);
  });

  it('failWorldFill where the hub count is 0: no hub, no vendor and no banker', () => {
    const regionId = regionIdWithHubCount(800n, 0);
    const ctx = hubCtx(regionId, 800n);
    const { startLocation } = stageOne(ctx, baseStartReply({ firstNpc: { ...baseStartReply().firstNpc, npcType: 'vendor' } }));
    failWorldFill(ctx, stateOf(ctx), WORLD_FILL_FAILED_MESSAGE);
    expect(rows(ctx, 'location').filter((l: any) => l.isHub)).toEqual([]);
    expect(servicesAt(ctx, startLocation.id)).toEqual([]);
    expect(npcsAt(ctx, startLocation.id).map((n: any) => [n.name, n.npcType])).toEqual([['Oswin Tarr', 'lore']]);
  });

  it('a fill retried after a failed fill keeps the arrival hub as the only hub and adds no second vendor or banker', () => {
    const regionId = regionIdWithHubCount(150n, 1);
    const ctx = hubCtx(regionId, 150n);
    const { region, startLocation } = stageOne(ctx);
    failWorldFill(ctx, stateOf(ctx), WORLD_FILL_FAILED_MESSAGE);
    writeRegionFill(
      ctx,
      familyFillReply({
        locations: [{ name: 'Reed Camp', description: 'c', terrainType: 'town', isSafe: true, isHub: true, levelOffset: 0, connectsTo: ['Safe Haven'] }],
      }),
      stateOf(ctx),
      region,
      startLocation,
    );
    expect(rows(ctx, 'location').filter((l: any) => l.isHub).map((l: any) => l.id)).toEqual([startLocation.id]);
    expect(rows(ctx, 'npc').filter((n: any) => n.npcType === 'vendor')).toHaveLength(1);
    expect(rows(ctx, 'npc').filter((n: any) => n.npcType === 'banker')).toHaveLength(1);
  });

  it('reuseStarterRegion places the character at the hub even when another safe, charted place has a lower id', () => {
    const ctx = createMockCtx({
      seed: {
        player: [{ id: alice, userId: 7n }],
        character: [{ id: 10n, ownerUserId: 7n, name: 'Aldric', race: 'Kobold', className: 'Ashweaver', locationId: 0n }],
        world_gen_state: [
          { id: 5n, playerId: alice, characterId: 10n, sourceLocationId: 0n, sourceRegionId: 0n, step: 'PENDING', createdAt: ts, updatedAt: ts },
        ],
        region: [{ id: 1n, name: 'Emberdeep', dangerMultiplier: 100n, starterForRace: 'kobold', biome: 'cavern' }],
        location: [
          { id: 20n, name: 'Quiet Chapel', regionId: 1n, isSafe: true, isHub: false, terrainType: 'town' },
          { id: 21n, name: 'Hearthhold', regionId: 1n, isSafe: true, isHub: true, terrainType: 'town' },
        ],
      },
      sender: alice,
      timestampMicros: T0,
      strict: true,
    });
    expect(startWorldGeneration(ctx, stateOf(ctx))).toBe('reused');
    expect(rows(ctx, 'character')[0]).toMatchObject({ locationId: 21n, boundLocationId: 21n });
  });

  it('every location and npc row the hub step writes matches the recorded schema', () => {
    const regionId = regionIdWithHubCount(400n, 2);
    const ctx = hubCtx(regionId, 400n);
    both(ctx, familyFillReply({ npcs: SERVICE_NPCS }));
    for (const table of ['location', 'npc']) {
      for (const row of rows(ctx, table)) expect(rowColumnProblems(table, row)).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// Plan 23: the approved reply shape (families, place words, hub marks) and the arrival point's isSafe
// (D-25, D-46, D-59 to D-63). Canned replies only: nothing here enqueues or calls the model.
// ---------------------------------------------------------------------------

describe('AI families, place words and the arrival isSafe (Plan 23)', () => {
  const T0 = 1_700_000_000_000_000n;
  const alice = { toHexString: () => 'a'.repeat(64) };
  const ts = { microsSinceUnixEpoch: T0 };
  const DANGER_STEP = 50n + (T0 % 51n);

  function regionIdWithHubCount(danger: bigint, count: number, from = 2n): bigint {
    for (let id = from; id < from + 2000n; id += 1n) {
      if (hubCountFor(danger, false, hubSeed(id)) === count) return id;
    }
    throw new Error(`no region id with hub count ${count} at danger ${danger}`);
  }

  function aiCtx(regionId: bigint, danger: bigint, extra: Record<string, any[]> = {}) {
    const sourceDanger = danger >= 800n ? 800n : danger - DANGER_STEP;
    const items = ['Wood', 'Peat', 'Scrap Cloth', 'Flax', 'Herbs'].map((name, i) => ({ id: 700n + BigInt(i), name, slot: 'resource' }));
    return createMockCtx({
      seed: {
        player: [{ id: alice, userId: 7n }],
        character: [{ id: 10n, ownerUserId: 7n, name: 'Aldric', race: 'Kobold', className: 'Ashweaver', locationId: 0n }],
        region: [{ id: regionId - 1n, name: 'Source', dangerMultiplier: sourceDanger }],
        world_gen_state: [
          { id: 5n, playerId: alice, characterId: 10n, sourceLocationId: 0n, sourceRegionId: regionId - 1n, step: 'GENERATING', createdAt: ts, updatedAt: ts },
        ],
        item_template: items,
        ...extra,
      },
      sender: alice,
      timestampMicros: T0,
      strict: true,
    });
  }
  const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
  const stateOf = (ctx: any) => rows(ctx, 'world_gen_state')[0];
  const locRow = (ctx: any, name: string) => rows(ctx, 'location').find((l: any) => l.name === name);
  const servicesAt = (ctx: any, locationId: bigint) =>
    rows(ctx, 'npc')
      .filter((n: any) => n.locationId === locationId)
      .map((n: any) => n.npcType)
      .filter((t: string) => t === 'vendor' || t === 'banker')
      .sort();
  const membersOf = (ctx: any, family: any) => rows(ctx, 'family_member').filter((m: any) => m.familyId === family.id);
  const linkedAt = (ctx: any, loc: any) =>
    rows(ctx, 'location_enemy_template').filter((l: any) => l.locationId === loc.id).map((l: any) => l.enemyTemplateId);
  const creaturePools = (ctx: any, loc: any) =>
    rows(ctx, 'place_pool').filter((p: any) => p.locationId === loc.id && p.kind === 'creature').map((p: any) => p.refId);

  function stageOne(ctx: any, reply: any = baseStartReply()) {
    const out = writeRegionStart(ctx, reply, stateOf(ctx));
    ctx.db.world_gen_state.id.update({ ...stateOf(ctx), generatedRegionId: out.region.id });
    return out;
  }
  function both(ctx: any, fill: any, start: any = baseStartReply()) {
    const s = stageOne(ctx, start);
    const f = writeRegionFill(ctx, fill, stateOf(ctx), s.region, s.startLocation);
    return { ...s, ...f };
  }
  function stageOneStarter(ctx: any) {
    ctx.db.world_gen_state.id.update({ ...stateOf(ctx), sourceRegionId: 0n });
    const out = writeRegionStart(ctx, baseStartReply(), stateOf(ctx), 'kobold');
    ctx.db.world_gen_state.id.update({ ...stateOf(ctx), generatedRegionId: out.region.id });
    return out;
  }
  const startReply = (over: Record<string, unknown>) =>
    baseStartReply({ startLocation: { ...baseStartReply().startLocation, ...over } });

  const member = (role: string, name: string) => ({ role, name });
  /** The approved reply shape: three hostile places, a marked safe camp, two families and place words. */
  function aiFillReply(overrides: any = {}): any {
    return {
      dominantFaction: 'The Brine Wardens',
      landmarks: ['The Salt Stair'],
      threats: ['skitterers in the reeds'],
      arrival: { shortName: 'Haven', placeNoun: 'the haven', isHub: false },
      locations: [
        { name: 'Sallow Wood', shortName: 'Sallow', placeNoun: 'the wood', description: 'w', terrainType: 'woods', isHub: false, isSafe: false, levelOffset: 0, connectsTo: ['Safe Haven'] },
        { name: 'Black Fen', shortName: 'Black Fen', placeNoun: 'the black fen', description: 'f', terrainType: 'swamp', isHub: false, isSafe: false, levelOffset: 1, connectsTo: ['Sallow Wood'] },
        { name: 'Grey Moor', shortName: 'Moor', placeNoun: 'the moor', description: 'm', terrainType: 'plains', isHub: false, isSafe: false, levelOffset: 0, connectsTo: ['Safe Haven'] },
        { name: 'Reed Camp', shortName: 'Reed Camp', placeNoun: 'the camp', description: 'c', terrainType: 'plains', isHub: true, isSafe: true, levelOffset: 0, connectsTo: ['Safe Haven'] },
      ],
      npcs: [],
      families: [
        {
          name: 'Saltcrust Skitterers',
          singularNoun: 'skitterer',
          pluralNoun: 'skitterers',
          creatureType: 'beast',
          iconKey: 'insect',
          temperament: 'aggressive',
          ambushVerb: 'swarm',
          ambushRest: 'up through the salt',
          members: [
            member('tank', 'Skitter Shellback'),
            member('damage', 'Skitter Pincer'),
            member('support', 'Skitter Tender'),
            member('caster', 'Skitter Saltspitter'),
          ],
          fitLocations: ['Sallow Wood', 'Black Fen'],
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
          members: [member('tank', 'Tollman Warden'), member('damage', 'Tollman Hook'), member('caster', 'Tollman Bellringer')],
          fitLocations: ['Black Fen'],
          relations: [],
        },
      ],
      ...overrides,
    };
  }

  it('two AI families: their names, nouns and words, 7 new members with server stats and rule abilities, linked and pooled only at their fit places, rivals both ways; place words stored', () => {
    const regionId = regionIdWithHubCount(150n, 1);
    const ctx = aiCtx(regionId, 150n);
    const { startLocation } = both(ctx, aiFillReply());
    const wood = locRow(ctx, 'Sallow Wood');
    const fen = locRow(ctx, 'Black Fen');
    const moor = locRow(ctx, 'Grey Moor');
    const camp = locRow(ctx, 'Reed Camp');
    expect(camp).toMatchObject({ isHub: true, isSafe: true });

    const families = rows(ctx, 'creature_family');
    expect(families.map((f: any) => f.name)).toEqual(['Saltcrust Skitterers', 'Drowned Tollmen']);
    const [skitter, toll] = families;
    expect(skitter).toMatchObject({
      key: `ai:${regionId}:saltcrust skitterers`,
      regionId,
      singularNoun: 'skitterer',
      pluralNoun: 'skitterers',
      creatureType: 'beast',
      iconKey: 'insect',
      temperament: 'aggressive',
      ambushVerb: 'swarm',
      ambushRest: 'up through the salt',
    });
    expect(toll).toMatchObject({ singularNoun: 'tollman', pluralNoun: 'tollmen', temperament: 'wary', ambushVerb: 'rise' });

    // 7 member templates, all new, AI-named, canonical roles (support -> healer), server stats and abilities.
    const templates = rows(ctx, 'enemy_template');
    expect(templates).toHaveLength(7);
    expect(membersOf(ctx, skitter).map((m: any) => [m.role, m.filler])).toEqual([
      ['tank', false],
      ['damage', false],
      ['healer', false],
      ['caster', false],
    ]);
    expect(membersOf(ctx, toll).map((m: any) => m.role)).toEqual(['tank', 'damage', 'caster']);
    const tender = templates.find((e: any) => e.name === 'Skitter Tender');
    expect(tender.role).toBe('healer');
    const stats = enemyStatsForLevel(1n);
    for (const t of templates) {
      expect(t).toMatchObject({ level: 1n, maxHp: stats.maxHp, baseDamage: stats.baseDamage, groupMin: 1n, groupMax: 1n });
      const m = rows(ctx, 'family_member').find((x: any) => x.enemyTemplateId === t.id);
      expect(t.role).toBe(m.role);
      const keys = rows(ctx, 'enemy_ability').filter((a: any) => a.enemyTemplateId === t.id).map((a: any) => a.abilityKey);
      expect(keys).toEqual(memberAbilities(m.role).map((a) => a.abilityKey));
    }

    // Links and creature pools only at the fit places.
    for (const m of membersOf(ctx, skitter)) {
      expect(linkedAt(ctx, wood)).toContain(m.enemyTemplateId);
      expect(linkedAt(ctx, fen)).toContain(m.enemyTemplateId);
    }
    for (const m of membersOf(ctx, toll)) {
      expect(linkedAt(ctx, fen)).toContain(m.enemyTemplateId);
      expect(linkedAt(ctx, wood)).not.toContain(m.enemyTemplateId);
    }
    for (const loc of [moor, camp, startLocation]) expect(linkedAt(ctx, loc)).toEqual([]);
    expect(creaturePools(ctx, wood)).toEqual([skitter.id]);
    expect(creaturePools(ctx, fen)).toEqual([skitter.id, toll.id]);
    for (const loc of [moor, camp, startLocation]) expect(creaturePools(ctx, loc)).toEqual([]);
    // Home densities are the server's (creatureHomeLevels), never from the reply.
    for (const p of rows(ctx, 'place_pool').filter((x: any) => x.kind === 'creature')) {
      expect([1n, 2n, 3n]).toContain(p.homeLevel);
    }

    // The relation, stored both ways.
    expect(rows(ctx, 'family_relation').map((r: any) => [r.familyId, r.otherFamilyId, r.kind])).toEqual([
      [skitter.id, toll.id, 'rival'],
      [toll.id, skitter.id, 'rival'],
    ]);

    // Place words on the new places and on the arrival point.
    expect([wood, fen, moor, camp].map((l: any) => [l.shortName, l.placeNoun])).toEqual([
      ['Sallow', 'the wood'],
      ['Black Fen', 'the black fen'],
      ['Moor', 'the moor'],
      ['Reed Camp', 'the camp'],
    ]);
    expect(rows(ctx, 'location').find((l: any) => l.id === startLocation.id)).toMatchObject({ shortName: 'Haven', placeNoun: 'the haven' });
  });

  it('a prey relation is stored with its inverse (the other family names this one its predator)', () => {
    const regionId = regionIdWithHubCount(150n, 1);
    const ctx = aiCtx(regionId, 150n);
    const fill = aiFillReply();
    fill.families[0].relations = [{ family: 'Drowned Tollmen', kind: 'prey' }];
    both(ctx, fill);
    const [skitter, toll] = rows(ctx, 'creature_family');
    expect(rows(ctx, 'family_relation').map((r: any) => [r.familyId, r.otherFamilyId, r.kind])).toEqual([
      [skitter.id, toll.id, 'prey'],
      [toll.id, skitter.id, 'predator'],
    ]);
  });

  it('a hostile reply: clean names, a family fit only to the safe arrival point and the hub placed by terrain, no unknown relation, no number from the reply', () => {
    const regionId = regionIdWithHubCount(150n, 1);
    const ctx = aiCtx(regionId, 150n);
    const { startLocation } = both(
      ctx,
      aiFillReply({
        arrival: { shortName: '<script>x</script>', placeNoun: 'The Haven!', isHub: false },
        families: [
          {
            name: '<b>Gloom</b> Rats {{color:red}}',
            singularNoun: 'rat <i>',
            pluralNoun: 'rats',
            creatureType: 'dragon',
            iconKey: 'laser',
            temperament: 'furious',
            ambushVerb: 'ran',
            ambushRest: '<img src=x> from 99 holes',
            level: 40,
            groupMin: 9,
            groupMax: 30,
            members: [
              { role: 'tank', name: 'Rat <b>King</b>', level: 50, maxHp: 99999 },
              { role: 'boss', name: 'Rat God' },
              { role: 'caster', name: 'Rat Mage 7' },
            ],
            fitLocations: ['Safe Haven', 'Reed Camp', 'Nowhere'],
            relations: [
              { family: 'Nobody At All', kind: 'rival' },
              { family: 'Gloom Rats', kind: 'prey' },
              { family: 'x', kind: 'friend' },
            ],
          },
        ],
      }),
    );
    const families = rows(ctx, 'creature_family');
    expect(families).toHaveLength(1);
    const [family] = families;
    expect(family.name).not.toMatch(/[<>{}]/);
    expect(family.name).toContain('Gloom');
    expect(family).toMatchObject({ creatureType: 'beast', temperament: 'wary', iconKey: '' });
    for (const t of rows(ctx, 'enemy_template')) {
      expect(t.name).not.toMatch(/[<>{}0-9]/);
      expect(t).toMatchObject({ level: 1n, groupMin: 1n, groupMax: 1n, maxHp: enemyStatsForLevel(1n).maxHp });
    }
    expect(rows(ctx, 'enemy_template').some((t: any) => t.name === 'Rat God')).toBe(false);
    expect(rows(ctx, 'family_relation')).toEqual([]);
    // Never the safe arrival point or the hub: placed by its usual terrain (beast: woods, plains, swamp).
    const hostIds = ['Sallow Wood', 'Black Fen', 'Grey Moor'].map((n) => locRow(ctx, n).id);
    const pooled = rows(ctx, 'place_pool').filter((p: any) => p.kind === 'creature').map((p: any) => p.locationId);
    expect([...pooled].sort()).toEqual([...hostIds].sort());
    expect(creaturePools(ctx, startLocation)).toEqual([]);
    expect(creaturePools(ctx, locRow(ctx, 'Reed Camp'))).toEqual([]);
    // Unusable place words are stored clean or empty, never as markup.
    const arrival = rows(ctx, 'location').find((l: any) => l.id === startLocation.id);
    expect(arrival.shortName).not.toMatch(/[<>]/);
    expect(arrival.placeNoun).toBe('');
  });

  it('a family fit to a non-safe, non-hub arrival point lives there with a creature pool (D-61)', () => {
    const regionId = regionIdWithHubCount(150n, 1);
    const ctx = aiCtx(regionId, 150n);
    const fill = aiFillReply();
    fill.families[1].fitLocations = ['Safe Haven'];
    const { startLocation } = both(ctx, fill, startReply({ terrainType: 'swamp', isSafe: false }));
    const arrival = rows(ctx, 'location').find((l: any) => l.id === startLocation.id);
    expect(arrival).toMatchObject({ isSafe: false, isHub: false, bindStone: false, craftingAvailable: false });
    const toll = rows(ctx, 'creature_family').find((f: any) => f.name === 'Drowned Tollmen');
    expect(creaturePools(ctx, arrival)).toEqual([toll.id]);
    for (const m of membersOf(ctx, toll)) expect(linkedAt(ctx, arrival)).toContain(m.enemyTemplateId);
    expect(servicesAt(ctx, arrival.id)).toEqual([]);
  });

  it('writeRegionStart takes the model isSafe for a non-starter; the starter arrival point stays a safe hub with a station (D-61, D-63)', () => {
    const ctxA = aiCtx(2n, 150n);
    expect(writeRegionStart(ctxA, startReply({ isSafe: false }), stateOf(ctxA)).startLocation).toMatchObject({
      isSafe: false,
      isHub: false,
      craftingAvailable: false,
      bindStone: false,
    });
    const ctxB = aiCtx(2n, 150n);
    expect(writeRegionStart(ctxB, startReply({ isSafe: true }), stateOf(ctxB)).startLocation).toMatchObject({ isSafe: true, isHub: false });
    const ctxC = aiCtx(2n, 150n);
    expect(
      writeRegionStart(ctxC, startReply({ isSafe: false }), { ...stateOf(ctxC), sourceRegionId: 0n }, 'kobold').startLocation,
    ).toMatchObject({ isSafe: true, isHub: true, craftingAvailable: true, bindStone: true });
    // A stage-1 reply from before the approved wording has no isSafe: that wording asked for a safe place.
    const ctxD = aiCtx(2n, 150n);
    expect(writeRegionStart(ctxD, baseStartReply(), stateOf(ctxD)).startLocation).toMatchObject({ isSafe: true });
    // Only a real boolean false makes it unsafe.
    const ctxE = aiCtx(2n, 150n);
    expect(writeRegionStart(ctxE, startReply({ isSafe: 'false' }), stateOf(ctxE)).startLocation).toMatchObject({ isSafe: true });
  });

  it('arrival.isHub true where the count is 1: the arrival point becomes the safe hub with a vendor and a banker, even when stage 1 wrote it unsafe (D-59, D-62)', () => {
    const regionId = regionIdWithHubCount(150n, 1);
    const ctx = aiCtx(regionId, 150n);
    const fill = aiFillReply({ arrival: { shortName: 'Haven', placeNoun: 'the haven', isHub: true } });
    fill.locations = fill.locations.map((l: any) => ({ ...l, isHub: false }));
    const { startLocation } = both(ctx, fill, startReply({ isSafe: false }));
    expect(startLocation.isSafe).toBe(false);
    const arrival = rows(ctx, 'location').find((l: any) => l.id === startLocation.id);
    expect(arrival).toMatchObject({ isHub: true, isSafe: true, bindStone: true });
    expect(servicesAt(ctx, arrival.id)).toEqual(['banker', 'vendor']);
    expect(rows(ctx, 'location').filter((l: any) => l.isHub).map((l: any) => l.id)).toEqual([arrival.id]);
    expect(creaturePools(ctx, arrival)).toEqual([]);
  });

  it('a reply that marks hubs where the count is 0 leaves the region with no hub, no vendor and no banker', () => {
    const regionId = regionIdWithHubCount(800n, 0);
    const ctx = aiCtx(regionId, 800n);
    const fill = aiFillReply({
      arrival: { shortName: 'Haven', placeNoun: 'the haven', isHub: true },
      npcs: [
        { name: 'Shopkeep', gender: 'male', npcType: 'vendor', locationName: 'Reed Camp', description: 'A vendor.', greeting: 'Hello.', personality: PERSONALITY },
      ],
    });
    const { region } = both(ctx, fill);
    const places = rows(ctx, 'location').filter((l: any) => l.regionId === region.id);
    expect(places.filter((l: any) => l.isHub)).toEqual([]);
    const npcs = rows(ctx, 'npc').filter((n: any) => places.some((l: any) => l.id === n.locationId));
    expect(npcs.filter((n: any) => n.npcType === 'vendor' || n.npcType === 'banker')).toEqual([]);
  });

  it('buildWorldFillInput carries the server hub count and whether the arrival point is a hub (D-62)', () => {
    const regionId = regionIdWithHubCount(150n, 2);
    const ctx = aiCtx(regionId, 150n);
    const { region } = stageOne(ctx);
    const input = buildWorldFillInput(ctx, stateOf(ctx));
    expect(input.hubCount).toBe(regionHubCount(region, false));
    expect(input.hubCount).toBe(2);
    expect(input.arrivalIsHub).toBe(false);
    expect(buildRouteLayers('world_gen', input).volatile).toContain('\nHubs: two.\n');

    const starter = aiCtx(2n, 150n);
    stageOneStarter(starter);
    const starterInput = buildWorldFillInput(starter, stateOf(starter));
    expect(starterInput).toMatchObject({ hubCount: 1, arrivalIsHub: true });
    expect(buildRouteLayers('world_gen', starterInput).volatile).toContain('\nHubs: one. The arrival point is a hub.\n');
  });

  it('an old-shape reply (enemies, no families) still builds families by rule and stores empty place words', () => {
    const regionId = regionIdWithHubCount(150n, 1);
    const ctx = aiCtx(regionId, 150n);
    const { region, startLocation, locations } = both(ctx, familyFillReply());
    expect(rows(ctx, 'creature_family').map((f: any) => f.key)).toEqual([`${region.id}:beast`, `${region.id}:undead`]);
    for (const loc of [startLocation, ...locations]) {
      expect(rows(ctx, 'location').find((l: any) => l.id === loc.id)).toMatchObject({ shortName: '', placeNoun: '' });
    }
  });

  it('a reply with families writes no enemy template outside the family members, even with stray enemies', () => {
    const regionId = regionIdWithHubCount(150n, 1);
    const ctx = aiCtx(regionId, 150n);
    both(ctx, aiFillReply({ enemies: [{ name: 'Stray Wolf', creatureType: 'beast', role: 'melee', terrainTypes: 'woods', level: 9 }] }));
    const memberIds = new Set(rows(ctx, 'family_member').map((m: any) => m.enemyTemplateId));
    expect(rows(ctx, 'enemy_template').filter((t: any) => !memberIds.has(t.id))).toEqual([]);
    expect(rows(ctx, 'enemy_template').some((t: any) => t.name === 'Stray Wolf')).toBe(false);
  });

  it('a families array with no usable family falls back to the rule path from the enemies', () => {
    const regionId = regionIdWithHubCount(150n, 1);
    const ctx = aiCtx(regionId, 150n);
    const { region } = both(ctx, aiFillReply({ families: [null, 'x', 7], enemies: familyFillReply().enemies }));
    expect(rows(ctx, 'creature_family').map((f: any) => f.key)).toEqual([`${region.id}:beast`, `${region.id}:undead`]);
  });

  it('a name already taken by an existing enemy template or family is made unique', () => {
    const regionId = regionIdWithHubCount(150n, 1);
    const ctx = aiCtx(regionId, 150n, {
      enemy_template: [{ id: 900n, name: 'Skitter Pincer', role: 'damage', level: 1n }],
      creature_family: [
        {
          id: 900n,
          regionId: 1n,
          key: '1:undead',
          name: 'Drowned Tollmen',
          singularNoun: 'tollman',
          pluralNoun: 'tollmen',
          temperament: 'wary',
          iconKey: '',
          creatureType: 'undead',
          ambushVerb: '',
          ambushRest: '',
          fitTerrains: '',
        },
      ],
    });
    both(ctx, aiFillReply());
    const fresh = rows(ctx, 'creature_family').filter((f: any) => f.id !== 900n);
    expect(fresh).toHaveLength(2);
    expect(fresh.map((f: any) => f.name)).not.toContain('Drowned Tollmen');
    const names = rows(ctx, 'enemy_template').map((t: any) => t.name);
    expect(names.filter((n: string) => n === 'Skitter Pincer')).toHaveLength(1);
  });

  it('every row the AI family path writes matches the recorded schema', () => {
    const regionId = regionIdWithHubCount(150n, 1);
    const ctx = aiCtx(regionId, 150n);
    both(ctx, aiFillReply());
    for (const table of ['location', 'creature_family', 'family_member', 'family_relation', 'enemy_template', 'enemy_role_template', 'enemy_ability', 'place_pool', 'pool_level']) {
      expect(rows(ctx, table).length, table).toBeGreaterThan(0);
      for (const row of rows(ctx, table)) expect(rowColumnProblems(table, row)).toEqual([]);
    }
  });
});
