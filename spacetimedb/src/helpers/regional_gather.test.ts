/**
 * Phase 51.3 Plan 07: a region's AI gatherables join that region's resource node pool, only on
 * matching terrain, resolved by template id (never by name), at the GATHER_WEIGHTS (common 15,
 * uncommon 8, rare 3). Another region's gatherables never appear, and a location with no regional
 * rows keeps today's pool exactly. Strict mock db under the recording schema.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createMockCtx } from './test-utils';
import { DEFAULT_DIALS, gatherYield } from '../data/economy_rules';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

let gather: typeof import('./regional_gather');
let location: typeof import('./location');

beforeAll(async () => {
  await import('../schema/tables');
  gather = await import('./regional_gather');
  location = await import('./location');
}, 120_000);

const T0 = 1_700_000_000_000_000n;

const item = (id: bigint, name: string, extra: Record<string, any> = {}) => ({
  id,
  name,
  slot: 'material',
  rarity: 'common',
  requiredLevel: 1n,
  tier: 1n,
  isJunk: false,
  ...extra,
});

const econ = (itemTemplateId: bigint, regionId: bigint, extra: Record<string, any> = {}) => ({
  itemTemplateId,
  regionId,
  role: 'gather',
  slotKey: `r${regionId}-${itemTemplateId}`,
  kind: 'wood',
  rarity: 'common',
  terrain: 'swamp',
  timeOfDay: 'any',
  enemyTemplateId: 0n,
  ...extra,
});

function world(): Record<string, any[]> {
  return {
    item_template: [
      item(1n, 'Peat'),
      item(50n, 'Bog Reed'),
      item(51n, 'Marsh Lily', { rarity: 'uncommon' }),
      item(52n, 'Gloom Cap', { rarity: 'rare' }),
      item(53n, 'Pine Knot'),
      item(60n, 'Ash Moss'),
      // A same-named lookalike: resolution is by id, so it must never be picked up by name.
      item(61n, 'Bog Reed'),
    ],
    economy_item: [
      econ(50n, 1n),
      econ(51n, 1n, { rarity: 'uncommon' }),
      econ(52n, 1n, { rarity: 'rare', timeOfDay: 'night' }),
      econ(53n, 1n, { terrain: 'woods' }),
      econ(60n, 2n),
      // Tagged as region 1 swamp gather but the template row is gone.
      econ(70n, 1n),
      // Not a gatherable.
      econ(80n, 1n, { role: 'trophy' }),
    ],
    region: [
      { id: 1n, name: 'Mire', dangerMultiplier: 100n },
      { id: 2n, name: 'Cinder', dangerMultiplier: 100n },
    ],
    location: [
      { id: 10n, name: 'Bog', regionId: 1n, terrainType: 'swamp', levelOffset: 0n },
      { id: 20n, name: 'Slag', regionId: 2n, terrainType: 'swamp', levelOffset: 0n },
    ],
    world_state: [{ id: 1n, isNight: false, nextTransitionAtMicros: T0 + 1_000_000n }],
    resource_node: [],
  };
}

const ctxFor = (seed = world()) => createMockCtx({ seed, strict: true, timestampMicros: T0 } as any);

describe('regionalGatherEntries', () => {
  it('returns the region gather rows for the terrain and time, weighted 15, 8, 3, by id', () => {
    const entries = gather.regionalGatherEntries(ctxFor(), 1n, 'swamp', 'night');
    expect(entries.map((e: any) => e.template.id)).toEqual([50n, 51n, 52n]);
    expect(entries.map((e: any) => e.weight)).toEqual([15n, 8n, 3n]);
    expect(entries.map((e: any) => e.timeOfDay)).toEqual(['any', 'any', 'night']);
  });

  it('drops night-only rows by day, keeps everything when there is no time preference', () => {
    expect(gather.regionalGatherEntries(ctxFor(), 1n, 'swamp', 'day').map((e: any) => e.template.id)).toEqual([50n, 51n]);
    expect(gather.regionalGatherEntries(ctxFor(), 1n, 'swamp', undefined).map((e: any) => e.template.id)).toEqual([50n, 51n, 52n]);
    expect(gather.regionalGatherEntries(ctxFor(), 1n, 'swamp', 'any').map((e: any) => e.template.id)).toEqual([50n, 51n, 52n]);
  });

  it('never includes another region, another terrain, a non-gather role or a missing template', () => {
    const ids = gather.regionalGatherEntries(ctxFor(), 1n, 'swamp', 'night').map((e: any) => e.template.id);
    for (const never of [53n, 60n, 61n, 70n, 80n]) expect(ids).not.toContain(never);
    expect(gather.regionalGatherEntries(ctxFor(), 2n, 'swamp', 'day').map((e: any) => e.template.id)).toEqual([60n]);
    expect(gather.regionalGatherEntries(ctxFor(), 1n, 'woods', 'day').map((e: any) => e.template.id)).toEqual([53n]);
    expect(gather.regionalGatherEntries(ctxFor(), 3n, 'swamp', 'day')).toEqual([]);
  });

  it('matches the terrain key case-insensitively', () => {
    expect(gather.regionalGatherEntries(ctxFor(), 1n, ' Swamp ', 'day').map((e: any) => e.template.id)).toEqual([50n, 51n]);
  });
});

describe('getGatherableResourceTemplates with a region', () => {
  it('returns today entries plus the region swamp gatherables', () => {
    const ctx = ctxFor();
    const today = location.getGatherableResourceTemplates(ctx, 'swamp', 'day', 1);
    const withRegion = location.getGatherableResourceTemplates(ctx, 'swamp', 'day', 1, 1n);
    expect(today.map((e: any) => e.template.id)).toEqual([1n]);
    expect(withRegion.map((e: any) => e.template.id)).toEqual([1n, 50n, 51n]);
    expect(withRegion.slice(0, today.length)).toEqual(today);
  });

  it('without a regionId returns exactly today entries', () => {
    const ctx = ctxFor();
    expect(location.getGatherableResourceTemplates(ctx, 'swamp', 'day', 1)).toEqual(
      location.getGatherableResourceTemplates(ctx, 'swamp', 'day', 1, undefined),
    );
  });
});

describe('spawnResourceNode', () => {
  it('can create a node for a regional gatherable at a region-1 swamp location, never for another region', () => {
    const ctx = ctxFor();
    const made = new Set<bigint>();
    for (let offset = 0n; offset < 120n; offset += 1n) {
      const node = location.spawnResourceNode(ctx, 10n, undefined, offset);
      if (node) made.add(node.itemTemplateId);
    }
    expect(made.has(50n) || made.has(51n)).toBe(true);
    expect(made.has(1n)).toBe(true);
    for (const never of [52n, 53n, 60n, 61n]) expect(made.has(never)).toBe(false);
  });

  // Review A WR-04: an admin item pin scales a node's weight in the spawn pool (0 = never).
  it('an item pinned at 0 never spawns as a node; the rest still do', () => {
    const seed = world();
    seed.economy_item_dial = [
      { itemTemplateId: 50n, dropRatePct: 0n },
      { itemTemplateId: 1n, dropRatePct: 0n },
    ];
    const ctx = ctxFor(seed);
    const made = new Set<bigint>();
    for (let offset = 0n; offset < 200n; offset += 1n) {
      const node = location.spawnResourceNode(ctx, 10n, undefined, offset);
      if (node) made.add(node.itemTemplateId);
    }
    expect(made.has(50n)).toBe(false);
    expect(made.has(1n)).toBe(false);
    expect(made.has(51n)).toBe(true);
  });

  it('a pool whose every entry is pinned at 0 spawns nothing and never throws', () => {
    const seed = world();
    const ctx0 = ctxFor(seed);
    const ids = location.getGatherableResourceTemplates(ctx0, 'swamp', 'day', 1, 1n).map((e: any) => e.template.id as bigint);
    seed.economy_item_dial = ids.map((id: bigint) => ({ itemTemplateId: id, dropRatePct: 0n }));
    const ctx = ctxFor(seed);
    expect(location.spawnResourceNode(ctx, 10n, undefined, 0n)).toBeUndefined();
  });

  // Review A WR-06: the gather dial applies when the node is found and is stored on it.
  it('stores the quantity scaled by the gather dial at spawn', () => {
    const plain = ctxFor(world());
    const seed = world();
    seed.economy_dials = [{ id: 1n, ...DEFAULT_DIALS, gatherRatePct: 300n }];
    const tripled = ctxFor(seed);
    let compared = 0;
    for (let offset = 0n; offset < 60n; offset += 1n) {
      const a = location.spawnResourceNode(plain, 10n, undefined, offset);
      const b = location.spawnResourceNode(tripled, 10n, undefined, offset);
      expect(b.itemTemplateId).toBe(a.itemTemplateId);
      expect(a.quantity >= 2n && a.quantity <= 6n).toBe(true);
      expect(b.quantity).toBe(gatherYield(a.quantity, 300n));
      compared += 1;
    }
    expect(compared).toBe(60);
  });

  it('a region override of the gather dial applies at spawn, never below 1', () => {
    const seed = world();
    seed.economy_dials = [{ id: 1n, ...DEFAULT_DIALS, gatherRatePct: 300n }];
    seed.economy_region_dial = [{ regionId: 1n, gatherRatePct: 50n }];
    const ctx = ctxFor(seed);
    const plain = ctxFor(world());
    for (let offset = 0n; offset < 30n; offset += 1n) {
      const a = location.spawnResourceNode(plain, 10n, undefined, offset);
      const b = location.spawnResourceNode(ctx, 10n, undefined, offset);
      expect(b.quantity).toBe(gatherYield(a.quantity, 50n));
      expect(b.quantity >= 1n).toBe(true);
    }
  });

  it('at a region-2 swamp location only region 2 gatherables join the pool', () => {
    const ctx = ctxFor();
    const made = new Set<bigint>();
    for (let offset = 0n; offset < 120n; offset += 1n) {
      const node = location.spawnResourceNode(ctx, 20n, undefined, offset);
      if (node) made.add(node.itemTemplateId);
    }
    expect(made.has(60n)).toBe(true);
    for (const never of [50n, 51n, 52n, 53n]) expect(made.has(never)).toBe(false);
  });
});
