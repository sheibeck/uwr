/**
 * Phase 51.3.1.1 Plan 12 (SC4, D-13, D-26, D-27, D-28, D-38, D-55): gathering from the shared resource
 * pools. The REAL gather_pool reducer (reducers/pools.ts) and the REAL finish_gather scheduled reducer
 * (reducers/items_gathering.ts), captured from index.ts, on the shared pool world
 * (helpers/pool_fixture.ts, strict mock db):
 *   - gather_pool starts an 8 s gather on a resource pool at the character's place (nodeId 0n);
 *   - finish_gather pays out by the pool's density level at the finish (Abundant 3, Plentiful 2,
 *     Sparse 1), depletes GATHER_DEPLETION_POINTS and records the per-player harvest;
 *   - the per-player, per-place cap, the resource's time of day and an empty pool refuse;
 *   - at a place that is not safe, a seeded roll over the creature pools can turn the gather into an
 *     ambush (origin 'ambush_gather'), drawn from the same pools.
 * Task 3 adds passive search: arrival makes no personal resource nodes.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import {
  T0,
  MODULE,
  ALICE,
  BOB,
  REGION_ID,
  ORCHARD_ID,
  FLATS_ID,
  MARKET_ID,
  GOBLINS_ID,
  IRON_ORE_ID,
  BERRIES_ID,
  poolWorld,
  poolCtx,
  seedPools,
} from '../helpers/pool_fixture';
import { createPool, setPoolCount } from '../helpers/pools';
import { rollEncounter } from '../helpers/encounters';
import { myHarvestCapRows } from '../views/harvest';
import { DENSITY_RULES } from '../data/density_rules';
import {
  exhaustedRefusal,
  gatherResult,
  harvestCapRefusal,
  lastGatherLine,
  outOfTimeRefusal,
} from '../data/density_lines';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const handlers: Record<string, (...args: any[]) => any> = {};
let GATHER_REFUSALS: Record<string, string>;

beforeAll(async () => {
  await import('../index');
  for (const name of ['gather_pool', 'finish_gather']) {
    const h = capturedReducer(name);
    if (typeof h !== 'function') {
      throw new Error(`capturedReducer('${name}') is not a function: STOP and report; never edit production code to fix this.`);
    }
    handlers[name] = h;
  }
  ({ GATHER_REFUSALS } = await import('./pools'));
}, 120_000);

const SEC = 1_000_000n;
const GATHER_MICROS = 8n * SEC;

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const feed = (ctx: any, characterId: bigint): string[] =>
  rows(ctx, 'event_private').filter((e: any) => e.characterId === characterId).map((e: any) => e.message);
const feedRows = (ctx: any, characterId: bigint): any[] => rows(ctx, 'event_private').filter((e: any) => e.characterId === characterId);
const bag = (ctx: any, characterId: bigint, templateId: bigint): bigint =>
  rows(ctx, 'item_instance')
    .filter((r: any) => r.ownerCharacterId === characterId && r.templateId === templateId)
    .reduce((n: bigint, r: any) => n + (r.quantity ?? 1n), 0n);
const poolRow = (ctx: any, id: bigint) => rows(ctx, 'place_pool').find((p: any) => p.id === id);
const gathersOf = (ctx: any, characterId: bigint) => rows(ctx, 'resource_gather').filter((g: any) => g.characterId === characterId);

type WorldOpts = {
  /** The orchard Goblins count (default 0: wiped out, so no gather ambushes). */
  goblins?: bigint;
  /** The orchard Iron Ore count (default its home, 100). */
  iron?: bigint;
  night?: boolean;
  mutate?: (seed: Record<string, any[]>) => void;
};

function world(opts: WorldOpts = {}) {
  const seed = poolWorld();
  if (opts.night) seed.world_state = seed.world_state.map((w: any) => ({ ...w, isNight: true }));
  opts.mutate?.(seed);
  const ctx = poolCtx(seed, ALICE, T0);
  const pools = seedPools(ctx);
  pools.goblinsOrchard = setPoolCount(ctx, pools.goblinsOrchard, opts.goblins ?? 0n, T0).pool;
  if (opts.iron !== undefined) pools.ironOrchard = setPoolCount(ctx, pools.ironOrchard, opts.iron, T0).pool;
  return { ctx, pools };
}

function at(ctx: any, sender: any, ts: bigint) {
  ctx.sender = sender;
  ctx.timestamp = { microsSinceUnixEpoch: ts };
}

const SENDER_OF: Record<string, any> = { '1': ALICE, '2': BOB };

/** gather_pool as the character's owner at `ts`. */
function start(ctx: any, poolId: bigint, characterId = 1n, ts: bigint = T0) {
  at(ctx, SENDER_OF[characterId.toString()], ts);
  handlers.gather_pool(ctx, { characterId, poolId });
}

/** Runs finish_gather (as the module, at the gather's end) for the character's open gather, if any. */
function finish(ctx: any, characterId = 1n) {
  for (const gather of gathersOf(ctx, characterId)) {
    const tick = rows(ctx, 'resource_gather_tick').find((t: any) => t.gatherId === gather.id);
    at(ctx, MODULE, gather.endsAtMicros);
    handlers.finish_gather(ctx, { arg: { scheduledId: tick?.scheduledId ?? 1n, gatherId: gather.id } });
  }
}

/** One full gather: start at `ts`, then finish. */
function gatherOnce(ctx: any, poolId: bigint, characterId = 1n, ts: bigint = T0) {
  start(ctx, poolId, characterId, ts);
  finish(ctx, characterId);
}

describe('gather_pool and finish_gather pay out by density (D-26, D-38)', () => {
  it('a Plentiful pool: a pool gather row and tick, then 2 of the item, 17 points off, one harvest recorded', () => {
    const { ctx, pools } = world({ iron: 66n });
    start(ctx, pools.ironOrchard.id);

    const gathers = gathersOf(ctx, 1n);
    expect(gathers).toHaveLength(1);
    expect(gathers[0]).toMatchObject({ nodeId: 0n, poolId: pools.ironOrchard.id, endsAtMicros: T0 + GATHER_MICROS });
    expect(rows(ctx, 'resource_gather_tick').filter((t: any) => t.gatherId === gathers[0].id)).toHaveLength(1);
    expect(feed(ctx, 1n)).toContain('You begin gathering Iron Ore.');
    expect(bag(ctx, 1n, IRON_ORE_ID)).toBe(0n);

    finish(ctx);
    expect(gathersOf(ctx, 1n)).toHaveLength(0);
    expect(bag(ctx, 1n, IRON_ORE_ID)).toBe(2n);
    expect(feed(ctx, 1n)).toContain(gatherResult('Iron Ore', 2n));
    expect(poolRow(ctx, pools.ironOrchard.id).count).toBe(66n - DENSITY_RULES.GATHER_DEPLETION_POINTS);
    expect(rows(ctx, 'pool_harvest')).toEqual([
      expect.objectContaining({ characterId: 1n, locationId: ORCHARD_ID, gathers: 1n, cappedUntilMicros: 0n }),
    ]);
  });

  it('an Abundant pool yields 3 and a Sparse pool 1', () => {
    for (const [count, want] of [[100n, 3n], [80n, 3n], [40n, 2n], [33n, 1n], [5n, 1n]] as const) {
      const { ctx, pools } = world({ iron: count });
      gatherOnce(ctx, pools.ironOrchard.id);
      expect(bag(ctx, 1n, IRON_ORE_ID)).toBe(want);
    }
  });

  it('two players gathering the same pool both deplete it (D-27: shared)', () => {
    const { ctx, pools } = world();
    gatherOnce(ctx, pools.ironOrchard.id, 1n, T0);
    gatherOnce(ctx, pools.ironOrchard.id, 2n, T0 + 20n * SEC);
    expect(bag(ctx, 1n, IRON_ORE_ID)).toBe(3n);
    expect(bag(ctx, 2n, IRON_ORE_ID)).toBe(3n);
    expect(poolRow(ctx, pools.ironOrchard.id).count).toBe(100n - 2n * DENSITY_RULES.GATHER_DEPLETION_POINTS);
  });

  it('the gather that empties the pool adds the last-gather line after the result', () => {
    const { ctx, pools } = world({ iron: 10n });
    gatherOnce(ctx, pools.ironOrchard.id);
    expect(bag(ctx, 1n, IRON_ORE_ID)).toBe(1n);
    expect(poolRow(ctx, pools.ironOrchard.id).count).toBe(0n);
    const lines = feed(ctx, 1n);
    const result = lines.indexOf(gatherResult('Iron Ore', 1n));
    const last = lines.indexOf(lastGatherLine('Iron Ore'));
    expect(result).toBeGreaterThanOrEqual(0);
    expect(last).toBeGreaterThan(result);
    expect(lastGatherLine('Iron Ore')).toBe('That is the last of the iron ore here, for a while.');
  });

  it('a pool not yet empty prints no last-gather line', () => {
    const { ctx, pools } = world();
    gatherOnce(ctx, pools.ironOrchard.id);
    expect(feed(ctx, 1n)).not.toContain(lastGatherLine('Iron Ore'));
  });
});

describe('the per-player harvest cap (D-27, D-28; T-51.3.1.1-37)', () => {
  it("Alice's 5th gather at the place in the window refuses; my_harvest_caps shows the place; Bob can still gather", () => {
    const { ctx, pools } = world();
    for (let i = 0n; i < DENSITY_RULES.HARVEST_CAP_GATHERS; i += 1n) {
      gatherOnce(ctx, pools.ironOrchard.id, 1n, T0 + i * 20n * SEC);
    }
    expect(bag(ctx, 1n, IRON_ORE_ID)).toBe(3n + 3n + 2n + 2n);
    expect(myHarvestCapRows({ db: ctx.db, sender: ALICE })).toEqual([
      // The window starts when the first gather pays out (T0 + 8 s).
      expect.objectContaining({ locationId: ORCHARD_ID, cappedUntilMicros: T0 + GATHER_MICROS + DENSITY_RULES.HARVEST_WINDOW_MICROS }),
    ]);

    start(ctx, pools.ironOrchard.id, 1n, T0 + 200n * SEC);
    expect(gathersOf(ctx, 1n)).toHaveLength(0);
    expect(feed(ctx, 1n)).toContain(harvestCapRefusal());
    expect(harvestCapRefusal()).toBe('You have taken what you can carry from here for now.');

    gatherOnce(ctx, pools.ironOrchard.id, 2n, T0 + 220n * SEC);
    expect(bag(ctx, 2n, IRON_ORE_ID)).toBe(1n);
    expect(feed(ctx, 2n)).not.toContain(harvestCapRefusal());
  });

  it('the cap lifts when the window ends', () => {
    const { ctx, pools } = world();
    for (let i = 0n; i < DENSITY_RULES.HARVEST_CAP_GATHERS; i += 1n) {
      gatherOnce(ctx, pools.ironOrchard.id, 1n, T0 + i * 20n * SEC);
    }
    start(ctx, pools.ironOrchard.id, 1n, T0 + GATHER_MICROS + DENSITY_RULES.HARVEST_WINDOW_MICROS - 1n);
    expect(gathersOf(ctx, 1n)).toHaveLength(0);
    start(ctx, pools.ironOrchard.id, 1n, T0 + GATHER_MICROS + DENSITY_RULES.HARVEST_WINDOW_MICROS);
    expect(gathersOf(ctx, 1n)).toHaveLength(1);
  });
});

describe('time of day (D-55)', () => {
  it('a night pool refuses during the day with the out-of-time line', () => {
    const { ctx, pools } = world();
    start(ctx, pools.berriesOrchard.id);
    expect(gathersOf(ctx, 1n)).toHaveLength(0);
    expect(feed(ctx, 1n)).toContain(outOfTimeRefusal('Wild Berries', true));
  });

  it('a night pool gathers at night', () => {
    const { ctx, pools } = world({ night: true });
    gatherOnce(ctx, pools.berriesOrchard.id);
    expect(bag(ctx, 1n, BERRIES_ID)).toBe(2n);
  });

  it('a day pool refuses at night', () => {
    const { ctx } = world({ night: true });
    const dayBerries = createPool(
      ctx,
      { regionId: REGION_ID, locationId: ORCHARD_ID, kind: 'resource', refId: 999n, homeLevel: 2, timeOfDay: 'day' },
      T0,
    );
    ctx.db.item_template.insert({ ...rows(ctx, 'item_template').find((r: any) => r.id === BERRIES_ID), id: 999n, name: 'Sun Moss' });
    start(ctx, dayBerries.id);
    expect(gathersOf(ctx, 1n)).toHaveLength(0);
    expect(feed(ctx, 1n)).toContain(outOfTimeRefusal('Sun Moss', false));
  });

  it("an 'any' pool works by day and by night", () => {
    for (const night of [false, true]) {
      const { ctx, pools } = world({ night });
      gatherOnce(ctx, pools.ironOrchard.id);
      expect(bag(ctx, 1n, IRON_ORE_ID)).toBe(3n);
    }
  });
});

describe('an exhausted pool', () => {
  it('refuses with the exhausted line and starts nothing', () => {
    const { ctx, pools } = world({ iron: 0n });
    start(ctx, pools.ironOrchard.id);
    expect(gathersOf(ctx, 1n)).toHaveLength(0);
    expect(feed(ctx, 1n)).toContain(exhaustedRefusal('Iron Ore', 'the orchard'));
    expect(exhaustedRefusal('Iron Ore', 'the orchard')).toBe('There is no iron ore left in the orchard, for now.');
  });

  it('a pool emptied between start and finish yields nothing and prints the exhausted line', () => {
    const { ctx, pools } = world({ iron: 66n });
    start(ctx, pools.ironOrchard.id);
    setPoolCount(ctx, poolRow(ctx, pools.ironOrchard.id), 0n, T0 + SEC);
    finish(ctx);
    expect(gathersOf(ctx, 1n)).toHaveLength(0);
    expect(bag(ctx, 1n, IRON_ORE_ID)).toBe(0n);
    expect(feed(ctx, 1n)).toContain(exhaustedRefusal('Iron Ore', 'the orchard'));
    expect(rows(ctx, 'pool_harvest')).toHaveLength(0);
  });
});

describe('gather_pool refusals start nothing (T-51.3.1.1-38)', () => {
  it("a pool at another place", () => {
    const { ctx } = world();
    const flatsIron = createPool(ctx, { regionId: REGION_ID, locationId: FLATS_ID, kind: 'resource', refId: IRON_ORE_ID, homeLevel: 3 }, T0);
    start(ctx, flatsIron.id);
    expect(gathersOf(ctx, 1n)).toHaveLength(0);
    expect(feed(ctx, 1n)).toContain(GATHER_REFUSALS.notHere);
  });

  it('a pool that does not exist', () => {
    const { ctx } = world();
    start(ctx, 999n);
    expect(gathersOf(ctx, 1n)).toHaveLength(0);
    expect(feed(ctx, 1n)).toContain(GATHER_REFUSALS.notHere);
  });

  it('a creature pool', () => {
    const { ctx, pools } = world({ goblins: 50n });
    start(ctx, pools.goblinsOrchard.id);
    expect(gathersOf(ctx, 1n)).toHaveLength(0);
    expect(rows(ctx, 'combat_encounter')).toHaveLength(0);
    expect(feed(ctx, 1n)).toContain(GATHER_REFUSALS.notHere);
  });

  it('in combat', () => {
    const { ctx, pools } = world({
      mutate: (seed) => {
        seed.combat_encounter = [{ id: 50n, locationId: ORCHARD_ID, groupId: undefined, leaderCharacterId: 1n, state: 'active', roundNumber: 1n, createdAt: { microsSinceUnixEpoch: T0 } }];
        seed.combat_participant = [{ id: 1n, combatId: 50n, characterId: 1n, status: 'active', nextAutoAttackAt: T0 }];
      },
    });
    start(ctx, pools.ironOrchard.id);
    expect(gathersOf(ctx, 1n)).toHaveLength(0);
    expect(feed(ctx, 1n)).toContain(GATHER_REFUSALS.fighting);
  });

  it('already gathering', () => {
    const { ctx, pools } = world();
    start(ctx, pools.ironOrchard.id);
    start(ctx, pools.ironOrchard.id, 1n, T0 + SEC);
    expect(gathersOf(ctx, 1n)).toHaveLength(1);
    expect(feed(ctx, 1n)).toContain(GATHER_REFUSALS.gathering);
  });

  it("someone else's character throws before anything is written", () => {
    const { ctx, pools } = world();
    at(ctx, ALICE, T0);
    expect(() => handlers.gather_pool(ctx, { characterId: 2n, poolId: pools.ironOrchard.id })).toThrow();
    expect(gathersOf(ctx, 2n)).toHaveLength(0);
  });
});

describe('the gather ambush draws from the creature pools (D-13, D-29)', () => {
  /** Timestamps where the 'gather' roll at the orchard hits (or misses) for Alice's roster (level 3). */
  function scan(goblins: bigint, want: boolean, limit = 400): bigint[] {
    const found: bigint[] = [];
    for (let i = 0n; i < BigInt(limit) && found.length < 3; i += 1n) {
      const ts = T0 + i;
      const { ctx } = world({ goblins });
      const hit = rollEncounter(ctx, {
        locationId: ORCHARD_ID,
        isSafe: false,
        partyLevel: 3n,
        phase: 'gather',
        leaderId: 1n,
        now: ts,
        factorPct: DENSITY_RULES.GATHER_AMBUSH_FACTOR_PCT,
      });
      if ((hit !== null) === want) found.push(ts);
    }
    return found;
  }

  it('an aggressive Overrun family: a hitting seed starts the fight instead of the gather', () => {
    const hits = scan(90n, true);
    expect(hits.length).toBeGreaterThan(0);
    for (const ts of hits) {
      const { ctx, pools } = world({ goblins: 90n });
      start(ctx, pools.ironOrchard.id, 1n, ts);
      expect(gathersOf(ctx, 1n)).toHaveLength(0);
      const fights = rows(ctx, 'combat_encounter');
      expect(fights).toHaveLength(1);
      expect(fights[0]).toMatchObject({ origin: 'ambush_gather', originFamilyId: GOBLINS_ID, originName: 'Goblins', originLevel: 3n });
      const ambush = feedRows(ctx, 1n).filter((e: any) => e.kind === 'ambush');
      expect(ambush).toHaveLength(1);
      expect(ambush[0].message.startsWith('While you gather iron ore, ')).toBe(true);
      expect(ambush[0].message.endsWith('!')).toBe(true);
      expect(feedRows(ctx, 2n).some((e: any) => e.kind === 'ambush')).toBe(true); // Bob is in the roster
      expect(poolRow(ctx, pools.ironOrchard.id).count).toBe(100n); // nothing gathered
      expect(feed(ctx, 1n)).not.toContain('You begin gathering Iron Ore.');
    }
  });

  it('a missing seed gathers as usual', () => {
    const misses = scan(90n, false);
    expect(misses.length).toBeGreaterThan(0);
    const { ctx, pools } = world({ goblins: 90n });
    start(ctx, pools.ironOrchard.id, 1n, misses[0]!);
    expect(rows(ctx, 'combat_encounter')).toHaveLength(0);
    expect(gathersOf(ctx, 1n)).toHaveLength(1);
  });

  it('with every family wiped out no seed ambushes', () => {
    for (let i = 0n; i < 60n; i += 1n) {
      const { ctx, pools } = world({ goblins: 0n });
      start(ctx, pools.ironOrchard.id, 1n, T0 + i);
      expect(rows(ctx, 'combat_encounter')).toHaveLength(0);
      expect(gathersOf(ctx, 1n)).toHaveLength(1);
    }
  });

  it('a safe town never ambushes, even with an Overrun family pooled there', () => {
    for (let i = 0n; i < 60n; i += 1n) {
      const { ctx } = world({
        mutate: (seed) => {
          seed.character = seed.character.map((c: any) => ({ ...c, locationId: MARKET_ID }));
        },
      });
      createPool(ctx, { regionId: REGION_ID, locationId: MARKET_ID, kind: 'creature', refId: GOBLINS_ID, homeLevel: 2, count: 95n }, T0);
      const marketIron = createPool(ctx, { regionId: REGION_ID, locationId: MARKET_ID, kind: 'resource', refId: IRON_ORE_ID, homeLevel: 3 }, T0);
      start(ctx, marketIron.id, 1n, T0 + i);
      expect(rows(ctx, 'combat_encounter')).toHaveLength(0);
      expect(gathersOf(ctx, 1n)).toHaveLength(1);
    }
  });
});

describe('legacy node gathers', () => {
  it('a node gather (nodeId > 0, poolId 0) whose node is gone finishes by deleting the row, with no item', () => {
    const { ctx } = world();
    ctx.db.resource_gather.insert({ id: 0n, characterId: 1n, nodeId: 500n, endsAtMicros: T0 + GATHER_MICROS, poolId: 0n });
    finish(ctx);
    expect(gathersOf(ctx, 1n)).toHaveLength(0);
    expect(rows(ctx, 'item_instance')).toHaveLength(0);
  });
});
