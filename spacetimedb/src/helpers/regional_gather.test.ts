/**
 * Phase 51.3 Plan 07: a region's AI gatherables join that region's resource node pool, only on
 * matching terrain, resolved by template id (never by name), at the GATHER_WEIGHTS (common 15,
 * uncommon 8, rare 3). Another region's gatherables never appear, and a location with no regional
 * rows keeps today's pool exactly. Strict mock db under the recording schema.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createMockCtx } from './test-utils';

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

// The resource node spawner was retired in Phase 51.3.1.1 Plan 27: regional gatherables now
// reach players through the resource pools (helpers/families.ts seedResourcePools), which read the
// same getGatherableResourceTemplates table tested above.
