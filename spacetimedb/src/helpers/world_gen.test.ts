import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock dependencies that import SpacetimeDB modules
const spawnCalls: bigint[] = [];
vi.mock('./location', () => ({
  connectLocations: (ctx: any, fromId: bigint, toId: bigint) => {
    ctx.db.location_connection.insert({ id: 0n, fromLocationId: fromId, toLocationId: toId });
  },
  ensureSpawnsForLocation: (_ctx: any, locationId: bigint) => {
    spawnCalls.push(locationId);
  },
}));
vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

import {
  writeGeneratedRegion,
  findHomeLocation,
  computeRegionDanger,
  startWorldGeneration,
  buildRegionContext,
} from './world_gen';
import { createMockDb, createMockCtx } from './test-utils';
import { rowColumnProblems } from './schema_recorder';
import { resolveRouteInput } from './llm_inputs';
import { buildRouteLayers } from '../data/llm_layers';
import { utcDay } from './llm_budget';
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

function baseParsedData(overrides: any = {}) {
  return {
    regionName: 'Test Region',
    regionDescription: 'A test region.',
    biome: 'forest',
    dominantFaction: 'none',
    landmarks: ['Old Tree'],
    threats: ['wolves'],
    locations: [
      { name: 'Safe Haven', description: 'A safe place.', terrainType: 'town', isSafe: true, levelOffset: 0, connectsTo: ['Dark Woods'] },
      { name: 'Dark Woods', description: 'Spooky woods.', terrainType: 'woods', isSafe: false, levelOffset: 1, connectsTo: ['Safe Haven'] },
    ],
    npcs: [],
    enemies: [
      { name: 'Wolf', creatureType: 'beast', role: 'melee', terrainTypes: 'woods', groupMin: 1, groupMax: 2, level: 1 },
    ],
    ...overrides,
  };
}

function baseGenState() {
  return {
    id: 1n,
    sourceRegionId: 100n,
    sourceLocationId: 0n,
    characterId: 10n,
  };
}

describe('findHomeLocation', () => {
  it('returns first safe non-uncharted location', () => {
    const locations: Record<string, any> = {
      'Danger Zone': { isSafe: false, terrainType: 'woods' },
      'Safe Town': { isSafe: true, terrainType: 'town' },
      'Another Safe': { isSafe: true, terrainType: 'town' },
    };
    const result = findHomeLocation(locations);
    expect(result).toBe(locations['Safe Town']);
  });

  it('falls back to first non-uncharted if no safe locations', () => {
    const locations: Record<string, any> = {
      'Danger Zone': { isSafe: false, terrainType: 'woods' },
      'Uncharted': { isSafe: true, terrainType: 'uncharted' },
    };
    const result = findHomeLocation(locations);
    expect(result).toBe(locations['Danger Zone']);
  });

  it('returns null if empty', () => {
    expect(findHomeLocation({})).toBeNull();
  });
});

describe('writeGeneratedRegion', () => {
  it('inserts fallback vendor and banker when LLM omits them', () => {
    const tx = createMockTx();
    // Pre-seed the source region so dangerMultiplier lookup works
    tx.db.region.insert({ id: 100n, name: 'Source', dangerMultiplier: 100n });

    const parsed = baseParsedData({ npcs: [] });
    writeGeneratedRegion(tx, parsed, baseGenState());

    const allNpcs = tx.db.npc._rows();
    const vendorNpc = allNpcs.find((n: any) => n.npcType === 'vendor');
    const bankerNpc = allNpcs.find((n: any) => n.npcType === 'banker');

    expect(vendorNpc).toBeDefined();
    expect(vendorNpc.name).toBe('The Reluctant Merchant');
    expect(bankerNpc).toBeDefined();
    expect(bankerNpc.name).toBe('The Ledger Keeper');
  });

  it('does NOT create duplicate vendor/banker when LLM includes them', () => {
    const tx = createMockTx();
    tx.db.region.insert({ id: 100n, name: 'Source', dangerMultiplier: 100n });

    const parsed = baseParsedData({
      npcs: [
        { name: 'Shopkeep', npcType: 'vendor', locationName: 'Safe Haven', description: 'A vendor.', greeting: 'Hello.', personality: { traits: ['friendly'], speechPattern: 'cheerful', knowledgeDomains: ['goods'], secrets: [], affinityMultiplier: 1.0 } },
        { name: 'Banker Bob', npcType: 'banker', locationName: 'Safe Haven', description: 'A banker.', greeting: 'Welcome.', personality: { traits: ['careful'], speechPattern: 'formal', knowledgeDomains: ['banking'], secrets: [], affinityMultiplier: 1.0 } },
      ],
    });

    writeGeneratedRegion(tx, parsed, baseGenState());

    const allNpcs = tx.db.npc._rows();
    const vendors = allNpcs.filter((n: any) => n.npcType === 'vendor');
    const bankers = allNpcs.filter((n: any) => n.npcType === 'banker');

    expect(vendors.length).toBe(1);
    expect(vendors[0].name).toBe('Shopkeep');
    expect(bankers.length).toBe(1);
    expect(bankers[0].name).toBe('Banker Bob');
  });

  it('home location always has bindStone and craftingAvailable', () => {
    const tx = createMockTx();
    tx.db.region.insert({ id: 100n, name: 'Source', dangerMultiplier: 100n });

    const parsed = baseParsedData();
    writeGeneratedRegion(tx, parsed, baseGenState());

    const allLocations = tx.db.location._rows();
    const safeLocation = allLocations.find((l: any) => l.name === 'Safe Haven');

    expect(safeLocation).toBeDefined();
    expect(safeLocation.bindStone).toBe(true);
    expect(safeLocation.craftingAvailable).toBe(true);
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

describe('writeGeneratedRegion - starter region behavior', () => {
  function createMockTx() {
    const db = createMockDb();
    return {
      db,
      timestamp: { microsSinceUnixEpoch: 1000000000000n },
    };
  }

  it('starter region (sourceRegionId=0n) gets dangerMultiplier=100n', () => {
    const tx = createMockTx();
    // No source region seeded (sourceRegionId=0n means first region)
    const parsed = baseParsedData();
    const starterGenState = { id: 1n, sourceRegionId: 0n, sourceLocationId: 0n, characterId: 10n };
    const region = writeGeneratedRegion(tx, parsed, starterGenState);
    expect(region.dangerMultiplier).toBe(100n);
  });

  it('starter region enemies are all clamped to level 1', () => {
    const tx = createMockTx();
    const parsed = baseParsedData({
      enemies: [
        { name: 'Wolf', creatureType: 'beast', role: 'melee', terrainTypes: 'woods', groupMin: 1, groupMax: 2, level: 3 },
        { name: 'Bandit', creatureType: 'humanoid', role: 'melee', terrainTypes: 'plains', groupMin: 1, groupMax: 1, level: 2 },
      ],
    });
    const starterGenState = { id: 1n, sourceRegionId: 0n, sourceLocationId: 0n, characterId: 10n };
    writeGeneratedRegion(tx, parsed, starterGenState);

    const enemies = tx.db.enemy_template._rows();
    expect(enemies.length).toBe(2);
    for (const enemy of enemies) {
      expect(enemy.level).toBe(1n);
    }
  });

  it('non-starter region (sourceRegionId != 0n) gets increased danger', () => {
    const tx = createMockTx();
    tx.db.region.insert({ id: 100n, name: 'Source', dangerMultiplier: 100n });
    const parsed = baseParsedData();
    const region = writeGeneratedRegion(tx, parsed, baseGenState());
    // Danger should be 150-200 (increase of 50-100)
    expect(region.dangerMultiplier).toBeGreaterThanOrEqual(150n);
    expect(region.dangerMultiplier).toBeLessThanOrEqual(200n);
  });
});

describe('validator retention on model output', () => {
  function createMockTx() {
    const db = createMockDb();
    return { db, timestamp: { microsSinceUnixEpoch: 1000000000000n } };
  }

  function enemyLevels(tx: any): bigint[] {
    return tx.db.enemy_template._rows().map((e: any) => e.level);
  }

  it('clamps enemy levels far above and far below the danger band of a non-starter region into the band', () => {
    const tx = createMockTx();
    tx.db.region.insert({ id: 100n, name: 'Source', dangerMultiplier: 500n });
    const parsed = baseParsedData({
      enemies: [
        { name: 'Titan', creatureType: 'beast', role: 'melee', level: 99 },
        { name: 'Sapling', creatureType: 'beast', role: 'melee', level: -7 },
        { name: 'Native', creatureType: 'beast', role: 'melee' },
      ],
    });
    const region = writeGeneratedRegion(tx, parsed, baseGenState());
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
    const parsed = baseParsedData({ enemies: [{ name: 'Titan', creatureType: 'beast', role: 'melee', level: 99 }] });
    writeGeneratedRegion(tx, parsed, baseGenState());
    const [enemy] = tx.db.enemy_template._rows();
    expect(enemy.maxHp).toBe(enemy.level * 12n + 20n);
    expect(enemy.baseDamage).toBe(enemy.level * 3n + 5n);
    expect(enemy.xpReward).toBe(enemy.level * 15n + 10n);
  });

  it('a starter region keeps every enemy at level 1, including extreme and missing levels', () => {
    const tx = createMockTx();
    const parsed = baseParsedData({
      enemies: [
        { name: 'Titan', creatureType: 'beast', role: 'melee', level: 99 },
        { name: 'Sapling', creatureType: 'beast', role: 'melee', level: -4 },
        { name: 'Native', creatureType: 'beast', role: 'melee' },
      ],
    });
    const region = writeGeneratedRegion(tx, parsed, { id: 1n, sourceRegionId: 0n, sourceLocationId: 0n, characterId: 10n });
    expect(region.dangerMultiplier).toBe(100n);
    expect(enemyLevels(tx)).toEqual([1n, 1n, 1n]);
  });

  it('caps the region danger at 800 so enemy levels never exceed 9', () => {
    const tx = createMockTx();
    tx.db.region.insert({ id: 100n, name: 'Source', dangerMultiplier: 800n });
    const parsed = baseParsedData({ enemies: [{ name: 'Titan', creatureType: 'beast', role: 'melee', level: 99 }] });
    const region = writeGeneratedRegion(tx, parsed, baseGenState());
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
    spawnCalls.length = 0;
    const ctx = newCtx(starterSeed());
    expect(startWorldGeneration(ctx, stateOf(ctx))).toBe('reused');

    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
    expect(rows(ctx, 'llm_task')).toHaveLength(0);
    expect(rows(ctx, 'character')[0]).toMatchObject({ locationId: 21n, boundLocationId: 21n });
    expect(stateOf(ctx)).toMatchObject({ step: 'COMPLETE', generatedRegionId: 1n });
    expect(spawnCalls).toEqual([21n]);
    const events = rows(ctx, 'event_private');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'narrative', characterId: 10n, ownerUserId: 7n });
    expect(events[0].message).toContain('You open your eyes in Hearthhold, Emberdeep.');
    expect(events[0].message).toContain('You notice Varek nearby.');
  });

  it('does not reuse a starter region of another race: it enqueues instead', () => {
    const seed = starterSeed();
    seed.region[0].starterForRace = 'elf';
    const ctx = newCtx(seed);
    expect(startWorldGeneration(ctx, stateOf(ctx))).toBe('enqueued');
    expect(rows(ctx, 'llm_job')).toHaveLength(1);
    expect(rows(ctx, 'character')[0].locationId).toBe(0n);
  });

  it('enqueues one world_gen job and one dispatch, moves the state to GENERATING and snapshots the input', () => {
    const ctx = newCtx({
      character_creation_state: [
        { id: 1n, playerId: alice, step: 'COMPLETE', archetype: 'mystic', createdAt: ts, updatedAt: ts },
      ],
    });
    expect(startWorldGeneration(ctx, stateOf(ctx))).toBe('enqueued');

    const jobs = rows(ctx, 'llm_job');
    expect(jobs).toHaveLength(1);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(1);
    expect(rows(ctx, 'llm_task')).toHaveLength(0);
    expect(jobs[0]).toMatchObject({ route: 'world_gen', playerId: alice, characterId: 10n, status: 'pending' });
    expect(JSON.parse(jobs[0].dedupeKey)).toEqual([alice.toHexString(), 'world_gen', '5']);
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
    expect(() => buildRouteLayers('world_gen', input)).not.toThrow();
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
    expect(rows(ctx, 'event_private')).toHaveLength(0);
  });
});
