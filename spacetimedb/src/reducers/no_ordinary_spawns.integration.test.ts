/**
 * Phase 51.3.1.1 Plan 08 (SC1, D-01, Pitfall 9): ordinary standing spawns are retired. Ordinary creatures
 * live only in pools, so:
 *   - an arrival at a non-safe place with no pools seeds that place's families and pools once (the lazy
 *     safety net, ensurePoolsForLocation) and makes no enemy_spawn row; a second arrival changes nothing;
 *   - the day/night turn respawns nothing;
 *   - respawn_enemy keeps its module-identity guard and drains its pending ticks without spawning;
 *   - the /synccontent bootstrap seeds pools and spawns nothing.
 * Real handlers on the strict mock db over the shared pool world (helpers/pool_fixture.ts). Within-region
 * trips only, so no test reaches world generation (a paid model call).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import {
  T0,
  MODULE,
  ALICE,
  REGION_ID,
  ORCHARD_ID,
  FLATS_ID,
  MARKET_ID,
  SKITTERERS_ID,
  poolWorld,
  poolCtx,
} from '../helpers/pool_fixture';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

let moveCharacter: (...args: any[]) => any;
let tickDayNight: (...args: any[]) => any;
let respawnEnemy: (...args: any[]) => any;
let bootstrap: (ctx: any) => void;

beforeAll(async () => {
  await import('../index');
  const handlers: Record<string, any> = {};
  for (const name of ['move_character', 'tick_day_night', 'respawn_enemy']) {
    const h = capturedReducer(name);
    if (typeof h !== 'function') {
      throw new Error(`capturedReducer('${name}') is not a function: STOP and report; never edit production code to fix this.`);
    }
    handlers[name] = h;
  }
  moveCharacter = handlers.move_character;
  tickDayNight = handlers.tick_day_night;
  respawnEnemy = handlers.respawn_enemy;
  bootstrap = (await import('../helpers/world_gen')).ensureLocationRuntimeBootstrap;
}, 120_000);

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const poolsAt = (ctx: any, locationId: bigint, kind?: string) =>
  rows(ctx, 'place_pool').filter((p: any) => p.locationId === locationId && (!kind || p.kind === kind));
const json = (value: unknown) => JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));

function enemyTemplate(id: bigint, name: string, role: string, creatureType: string) {
  return {
    id,
    name,
    role,
    roleDetail: role,
    abilityProfile: role,
    terrainTypes: 'swamp',
    creatureType,
    timeOfDay: 'any',
    socialGroup: name,
    socialRadius: 0n,
    awareness: 'normal',
    groupMin: 1n,
    groupMax: 1n,
    armorClass: 5n,
    level: 3n,
    maxHp: 60n,
    baseDamage: 8n,
    xpReward: 30n,
  };
}

const spawnRow = (id: bigint, locationId: bigint, enemyTemplateId: bigint, state = 'available') => ({
  id,
  locationId,
  enemyTemplateId,
  name: `Spawn ${id}`,
  state,
  lockedCombatId: undefined,
  groupCount: 1n,
  level: 4n,
});

/**
 * The pool world with the flats linked to one family member (Skitterer 201) and two ungrouped undead
 * types; no pools anywhere. Extra rows as given.
 */
function flatsWorld(extra: Record<string, any[]> = {}) {
  return poolWorld({
    extra: {
      enemy_template: [enemyTemplate(901n, 'Drowned Seer', 'caster', 'undead'), enemyTemplate(902n, 'Bog Wight', 'melee', 'undead')],
      location_enemy_template: [201n, 901n, 902n].map((enemyTemplateId, i) => ({
        id: BigInt(i + 1),
        locationId: FLATS_ID,
        enemyTemplateId,
      })),
      ...extra,
    },
  });
}

describe('arrival seeds pools, never an ordinary spawn (D-01)', () => {
  it('a move to a non-safe place with linked ordinary types and no pools seeds families and pools and makes no spawn', () => {
    const ctx = poolCtx(flatsWorld(), ALICE);
    expect(poolsAt(ctx, FLATS_ID)).toHaveLength(0);
    const spawnsBefore = rows(ctx, 'enemy_spawn').length;

    moveCharacter(ctx, { characterId: 1n, locationId: FLATS_ID });

    expect(rows(ctx, 'character').find((c: any) => c.id === 1n).locationId).toBe(FLATS_ID);
    const creature = poolsAt(ctx, FLATS_ID, 'creature');
    expect(creature.length).toBeGreaterThan(0);
    expect(creature.map((p: any) => p.refId)).toContain(SKITTERERS_ID);
    const undead = rows(ctx, 'creature_family').find((f: any) => f.key === `${REGION_ID}:undead`);
    expect(undead).toBeTruthy();
    expect(creature.map((p: any) => p.refId)).toContain(undead.id);
    expect(rows(ctx, 'enemy_spawn').length).toBe(spawnsBefore);
    expect(rows(ctx, 'enemy_spawn_member')).toHaveLength(0);
  });

  it('a second arrival at the same place inserts no place_pool row and no spawn', () => {
    const ctx = poolCtx(flatsWorld(), ALICE);
    moveCharacter(ctx, { characterId: 1n, locationId: FLATS_ID });
    const flatsPools = json(poolsAt(ctx, FLATS_ID));
    const families = rows(ctx, 'creature_family').length;

    moveCharacter(ctx, { characterId: 1n, locationId: ORCHARD_ID });
    expect(rows(ctx, 'character').find((c: any) => c.id === 1n).locationId).toBe(ORCHARD_ID);
    moveCharacter(ctx, { characterId: 1n, locationId: FLATS_ID });
    expect(rows(ctx, 'character').find((c: any) => c.id === 1n).locationId).toBe(FLATS_ID);

    expect(json(poolsAt(ctx, FLATS_ID))).toBe(flatsPools);
    expect(rows(ctx, 'creature_family').length).toBe(families);
    expect(rows(ctx, 'enemy_spawn')).toHaveLength(0);
  });

  it('an arrival at a safe place seeds no creature pool and no spawn', () => {
    const ctx = poolCtx(flatsWorld(), ALICE);
    moveCharacter(ctx, { characterId: 1n, locationId: MARKET_ID });
    expect(rows(ctx, 'character').find((c: any) => c.id === 1n).locationId).toBe(MARKET_ID);
    expect(poolsAt(ctx, MARKET_ID, 'creature')).toHaveLength(0);
    expect(rows(ctx, 'enemy_spawn')).toHaveLength(0);
  });
});

describe('the day/night turn respawns nothing', () => {
  it('tick_day_night (module) flips the world and leaves enemy_spawn rows untouched, inserting none', () => {
    const ctx = poolCtx(
      flatsWorld({ enemy_spawn: [spawnRow(70n, ORCHARD_ID, 101n), spawnRow(71n, FLATS_ID, 201n, 'engaged')] }),
      MODULE,
      T0 + 3_600_000_000n,
    );
    const spawnsBefore = json(rows(ctx, 'enemy_spawn'));

    tickDayNight(ctx, { arg: { scheduledId: 1n, scheduledAt: { tag: 'Time', value: { microsSinceUnixEpoch: T0 } } } });

    expect(rows(ctx, 'world_state')[0].isNight).toBe(true);
    expect(rows(ctx, 'day_night_tick')).toHaveLength(1);
    expect(json(rows(ctx, 'enemy_spawn'))).toBe(spawnsBefore);
    expect(rows(ctx, 'enemy_spawn_member')).toHaveLength(0);
  });
});

describe('respawn_enemy drains (Pitfall 9: it stays registered)', () => {
  it('with the module sender it returns without inserting an enemy_spawn', () => {
    const ctx = poolCtx(flatsWorld(), MODULE);
    respawnEnemy(ctx, { arg: { scheduledId: 1n, scheduledAt: { tag: 'Time', value: { microsSinceUnixEpoch: T0 } }, locationId: FLATS_ID } });
    expect(rows(ctx, 'enemy_spawn')).toHaveLength(0);
    expect(rows(ctx, 'enemy_spawn_member')).toHaveLength(0);
  });

  it('a forged sender touches no db', () => {
    const ctx = {
      db: new Proxy({}, { get: (_t, prop) => { throw new Error(`db touched: ${String(prop)}`); } }),
      timestamp: { microsSinceUnixEpoch: T0 },
      sender: ALICE,
      databaseIdentity: MODULE,
    };
    expect(() => respawnEnemy(ctx, { arg: { scheduledId: 1n, locationId: FLATS_ID } })).not.toThrow();
  });
});

describe('the /synccontent bootstrap seeds pools, not spawns', () => {
  it('ensureLocationRuntimeBootstrap seeds the non-safe places, clears spawns at safe places and spawns nothing', () => {
    const ctx = poolCtx(flatsWorld({ enemy_spawn: [spawnRow(80n, MARKET_ID, 101n)] }), MODULE);
    bootstrap(ctx);
    expect(poolsAt(ctx, FLATS_ID, 'creature').length).toBeGreaterThan(0);
    expect(poolsAt(ctx, MARKET_ID, 'creature')).toHaveLength(0);
    expect(rows(ctx, 'enemy_spawn')).toHaveLength(0);

    const after = json(rows(ctx, 'place_pool'));
    bootstrap(ctx);
    expect(json(rows(ctx, 'place_pool'))).toBe(after);
    expect(rows(ctx, 'enemy_spawn')).toHaveLength(0);
  });
});
