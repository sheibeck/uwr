/**
 * Phase 51.3 Plan 07 (SC2, SC5), review A WR-06: the REAL finish_gather scheduled reducer, captured
 * from index.ts on the strict mock db. CONTEXT Area 1: "a dial change takes effect on the next roll
 * only. Loot already dropped and nodes already found keep their rolls." The gather dial therefore
 * applied when a node was spawned (the node spawner, retired in Phase 51.3.1.1 Plan 27, stored the scaled quantity),
 * and finish_gather yields the node's stored quantity before the perk bonuses, whatever the dial says
 * by then. A modifier reagent node still yields exactly 1; a node with no stored quantity falls back
 * to today's 2 to 6 roll.
 *
 * Phase 51.3.1.1 Plan 12 adds the pool path (poolId > 0): there the dial applies at the finish, on the
 * pool's density yield (see the last describe block).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { MODULE, startSeed } from '../helpers/combat_fight_fixture';
import { DEFAULT_DIALS } from '../data/economy_rules';
import { REGION_ID, ORCHARD_ID, IRON_ORE_ID, poolWorld, poolCtx, seedPools } from '../helpers/pool_fixture';
import { createPool, setPoolCount } from '../helpers/pools';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;

let finish: (...args: any[]) => any;
beforeAll(async () => {
  await import('../index');
  const h = capturedReducer('finish_gather');
  if (typeof h !== 'function') {
    throw new Error("capturedReducer('finish_gather') is not a function: STOP and report; never edit production code to fix this.");
  }
  finish = h as (...args: any[]) => any;
}, 120_000);

const NODE_ID = 1n;
/** The base yield today's formula gives for this clock and node id. */
const baseAt = (ts: bigint): bigint => 2n + ((ts + NODE_ID) % 5n);
/** A clock whose base yield is `want` (2 to 6). */
const tsForBase = (want: bigint): bigint => {
  for (let k = 0n; k < 5n; k += 1n) if (baseAt(T0 + k) === want) return T0 + k;
  throw new Error('no clock');
};

const STONE = 100n;
const REAGENT = 101n;

function newCtx(opts: {
  ts: bigint;
  nodeName?: string;
  nodeTemplate?: bigint;
  dials?: Record<string, any> | null;
  regionDial?: Record<string, any> | null;
  quantity?: bigint;
}) {
  const nodeName = opts.nodeName ?? 'Stone';
  return createMockCtx({
    seed: {
      character: [{ ...startSeed().character[0], id: 1n, locationId: 10n }],
      location: [{ id: 10n, name: 'The Crossing', regionId: 1n, terrainType: 'mountains', levelOffset: 0n }],
      region: [{ id: 1n, name: 'Ashen Reach', dangerMultiplier: 100n }],
      resource_node: [
        {
          id: NODE_ID,
          locationId: 10n,
          characterId: 1n,
          itemTemplateId: opts.nodeTemplate ?? STONE,
          name: nodeName,
          timeOfDay: 'any',
          quantity: opts.quantity ?? 4n,
          state: 'harvesting',
          lockedByCharacterId: 1n,
          respawnAtMicros: undefined,
        },
      ],
      resource_gather: [{ id: 1n, characterId: 1n, nodeId: NODE_ID, endsAtMicros: opts.ts }],
      item_template: [
        { id: STONE, name: 'Stone', slot: 'material', stackable: true, rarity: 'common', tier: 1n, isJunk: false },
        { id: REAGENT, name: 'Glowing Stone', slot: 'material', stackable: true, rarity: 'common', tier: 1n, isJunk: false },
      ],
      item_instance: [],
      economy_dials: opts.dials === null ? [] : [{ id: 1n, ...DEFAULT_DIALS, ...(opts.dials ?? {}) }],
      economy_region_dial: opts.regionDial ? [{ regionId: 1n, ...opts.regionDial }] : [],
      renown_perk: [],
      combat_participant: [],
      group_member: [],
    },
    sender: MODULE,
    databaseIdentity: MODULE,
    timestampMicros: opts.ts,
    strict: true,
  } as any);
}

const bagCount = (ctx: any, templateId: bigint): bigint =>
  (ctx.db._tables.item_instance ?? [])
    .filter((r: any) => r.templateId === templateId)
    .reduce((n: bigint, r: any) => n + (r.quantity ?? 1n), 0n);

const run = (ctx: any) => finish(ctx, { arg: { scheduledId: 1n, gatherId: 1n } });

describe('finish_gather yields the quantity the node was found with', () => {
  it('yields the stored quantity at every dial: a change after the node was found never alters it', () => {
    for (const quantity of [1n, 3n, 9n, 18n]) {
      for (const dial of [{ gatherRatePct: 50n }, { gatherRatePct: 100n }, { gatherRatePct: 300n }, null]) {
        const ctx = newCtx({ ts: tsForBase(6n), dials: dial, quantity });
        run(ctx);
        expect(bagCount(ctx, STONE)).toBe(quantity);
      }
    }
  });

  it('a region override set after the node was found changes nothing either', () => {
    const ctx = newCtx({ ts: tsForBase(4n), dials: { gatherRatePct: 100n }, regionDial: { gatherRatePct: 300n }, quantity: 5n });
    run(ctx);
    expect(bagCount(ctx, STONE)).toBe(5n);
  });

  it('a node with no stored quantity falls back to the 2 to 6 roll, without the dial', () => {
    for (const want of [2n, 4n, 6n]) {
      const ctx = newCtx({ ts: tsForBase(want), dials: { gatherRatePct: 300n }, quantity: 0n });
      run(ctx);
      expect(bagCount(ctx, STONE)).toBe(want);
    }
  });
});

describe('a modifier reagent still yields exactly 1', () => {
  for (const pct of [50n, 100n, 300n]) {
    it(`at ${pct} percent`, () => {
      const ctx = newCtx({ ts: tsForBase(6n), nodeName: 'Glowing Stone', nodeTemplate: REAGENT, dials: { gatherRatePct: pct } });
      run(ctx);
      expect(bagCount(ctx, REAGENT)).toBe(1n);
    });
  }
});

// ---------------------------------------------------------------------------
// Phase 51.3.1.1 Plan 12 (D-38), Plan 27 (D-72): the pool path. A pool gather (poolId > 0) yields one
// at any non-zero density level at the finish (yieldForLevel), then the 51.3 gather dial (gatherYield, the region's
// effective gatherRatePct), then the same perk and racial bonuses as the node path. A modifier
// reagent still yields exactly 1.
// ---------------------------------------------------------------------------

const GLOWING = 303n;

function poolGatherCtx(opts: { count: bigint; dial?: bigint; regionDial?: bigint; reagent?: boolean; racialLootBonus?: bigint }) {
  const seed = poolWorld();
  const iron = seed.item_template.find((r: any) => r.id === IRON_ORE_ID);
  seed.item_template.push({ ...iron, id: GLOWING, name: 'Glowing Stone' });
  seed.economy_dials = opts.dial === undefined ? [] : [{ id: 1n, ...DEFAULT_DIALS, gatherRatePct: opts.dial }];
  if (opts.regionDial !== undefined) seed.economy_region_dial = [{ regionId: REGION_ID, gatherRatePct: opts.regionDial }];
  if (opts.racialLootBonus !== undefined) {
    seed.character = seed.character.map((c: any) => (c.id === 1n ? { ...c, racialLootBonus: opts.racialLootBonus } : c));
  }
  const ctx = poolCtx(seed, MODULE, T0);
  const pools = seedPools(ctx);
  setPoolCount(ctx, pools.goblinsOrchard, 0n, T0);
  const pool = createPool(
    ctx,
    { regionId: REGION_ID, locationId: ORCHARD_ID, kind: 'resource', refId: opts.reagent ? GLOWING : IRON_ORE_ID, homeLevel: 3 },
    T0,
  );
  setPoolCount(ctx, pool, opts.count, T0);
  const gather = ctx.db.resource_gather.insert({ id: 0n, characterId: 1n, nodeId: 0n, endsAtMicros: T0, poolId: pool.id });
  return { ctx, gatherId: gather.id };
}

const ownBag = (ctx: any, templateId: bigint): bigint =>
  (ctx.db._tables.item_instance ?? [])
    .filter((r: any) => r.ownerCharacterId === 1n && r.templateId === templateId)
    .reduce((n: bigint, r: any) => n + (r.quantity ?? 1n), 0n);

describe('the pool path: one per gather, then the gather dial (Phase 51.3.1.1 D-72)', () => {
  const cases: [bigint, bigint | undefined, bigint][] = [
    [66n, undefined, 1n], // Plentiful, no dial row (default 100): one per gather (D-72)
    [66n, 100n, 1n],
    [66n, 200n, 2n], // the dial doubles the one
    [100n, 300n, 3n], // Abundant is still one, then x3
    [100n, 50n, 1n], // never below 1
    [20n, 50n, 1n], // Sparse never drops below 1
  ];
  for (const [count, dial, want] of cases) {
    it(`count ${count} at dial ${dial ?? 'default'} yields ${want}`, () => {
      const { ctx, gatherId } = poolGatherCtx({ count, dial });
      finish(ctx, { arg: { scheduledId: 1n, gatherId } });
      expect(ownBag(ctx, IRON_ORE_ID)).toBe(want);
    });
  }

  it('the region override is the effective dial', () => {
    const { ctx, gatherId } = poolGatherCtx({ count: 66n, dial: 100n, regionDial: 300n });
    finish(ctx, { arg: { scheduledId: 1n, gatherId } });
    expect(ownBag(ctx, IRON_ORE_ID)).toBe(3n);
  });

  it('the racial bonus still applies after the dial', () => {
    const { ctx, gatherId } = poolGatherCtx({ count: 66n, dial: 200n, racialLootBonus: 100n });
    finish(ctx, { arg: { scheduledId: 1n, gatherId } });
    expect(ownBag(ctx, IRON_ORE_ID)).toBe(3n); // 1 x 2 (dial) + 1 (racial: bonuses still add, D-72)
  });

  for (const pct of [50n, 100n, 300n]) {
    it(`a modifier reagent pool yields exactly 1 at ${pct} percent`, () => {
      const { ctx, gatherId } = poolGatherCtx({ count: 100n, dial: pct, reagent: true, racialLootBonus: 100n });
      finish(ctx, { arg: { scheduledId: 1n, gatherId } });
      expect(ownBag(ctx, GLOWING)).toBe(1n);
    });
  }
});
