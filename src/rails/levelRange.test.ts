import { describe, expect, it } from 'vitest';
import { routeLevel, routeLevelLabel, routesFrom } from './levelRange';

const regions = [
  { id: 1n, dangerMultiplier: 100n },
  { id: 6n, dangerMultiplier: 600n },
];

describe('routeLevel', () => {
  it('is safe for a safe destination whatever the region', () => {
    expect(routeLevel({ isSafe: true, regionId: 6n, levelOffset: 3n }, regions)).toEqual({ safe: true });
  });

  it('is the exact level for offset 0', () => {
    expect(routeLevel({ isSafe: false, regionId: 6n, levelOffset: 0n }, regions)).toEqual({ safe: false, lo: 6, hi: 6 });
  });

  it('spreads one level either side for a non-zero offset', () => {
    expect(routeLevel({ isSafe: false, regionId: 6n, levelOffset: 2n }, regions)).toEqual({ safe: false, lo: 7, hi: 9 });
    expect(routeLevel({ isSafe: false, regionId: 6n, levelOffset: -1n }, regions)).toEqual({ safe: false, lo: 4, hi: 6 });
  });

  it('floors the level at 1', () => {
    expect(routeLevel({ isSafe: false, regionId: 6n, levelOffset: -7n }, regions)).toEqual({ safe: false, lo: 1, hi: 2 });
    expect(routeLevel({ isSafe: false, regionId: 1n, levelOffset: -50n }, regions)).toEqual({ safe: false, lo: 1, hi: 2 });
  });

  it('uses base level 1 when the region row is missing', () => {
    expect(routeLevel({ isSafe: false, regionId: 99n, levelOffset: 0n }, regions)).toEqual({ safe: false, lo: 1, hi: 1 });
    expect(routeLevel({ isSafe: false, regionId: 99n, levelOffset: 2n }, [])).toEqual({ safe: false, lo: 2, hi: 4 });
  });

  it('floors a fractional danger multiplier', () => {
    expect(routeLevel({ isSafe: false, regionId: 7n, levelOffset: 0n }, [{ id: 7n, dangerMultiplier: 349n }])).toEqual({
      safe: false,
      lo: 3,
      hi: 3,
    });
  });
});

describe('routeLevelLabel', () => {
  it('reads Safe, a single level or a range with an en dash', () => {
    expect(routeLevelLabel({ safe: true })).toBe('Safe');
    expect(routeLevelLabel({ safe: false, lo: 6, hi: 6 })).toBe('Lv 6');
    expect(routeLevelLabel({ safe: false, lo: 7, hi: 9 })).toBe('Lv 7–9');
  });
});

describe('routesFrom', () => {
  const locations = [
    { id: 1n, name: 'Crossroads', isSafe: true, regionId: 1n, levelOffset: 0n },
    { id: 2n, name: 'gloamwood', isSafe: false, regionId: 6n, levelOffset: 0n },
    { id: 3n, name: 'Ashen Pass', isSafe: false, regionId: 6n, levelOffset: 2n },
    { id: 4n, name: 'Ashen Pass', isSafe: true, regionId: 1n, levelOffset: 0n },
  ];

  it('keeps routes out of the given location, ordered by name case-insensitively then id', () => {
    const connections = [
      { fromLocationId: 1n, toLocationId: 2n },
      { fromLocationId: 1n, toLocationId: 4n },
      { fromLocationId: 1n, toLocationId: 3n },
      { fromLocationId: 2n, toLocationId: 1n },
    ];
    const out = routesFrom(connections, 1n, locations, regions);
    expect(out.map((r) => [r.locationId, r.name, r.label])).toEqual([
      [3n, 'Ashen Pass', 'Lv 7–9'],
      [4n, 'Ashen Pass', 'Safe'],
      [2n, 'gloamwood', 'Lv 6'],
    ]);
  });

  it('dedupes two connections to one destination', () => {
    const connections = [
      { fromLocationId: 1n, toLocationId: 2n },
      { fromLocationId: 1n, toLocationId: 2n },
    ];
    expect(routesFrom(connections, 1n, locations, regions)).toHaveLength(1);
  });

  it('skips destinations with no location row', () => {
    expect(routesFrom([{ fromLocationId: 1n, toLocationId: 77n }], 1n, locations, regions)).toEqual([]);
  });

  it('returns [] for no connections or no current location', () => {
    expect(routesFrom([], 1n, locations, regions)).toEqual([]);
    expect(routesFrom([{ fromLocationId: 1n, toLocationId: 2n }], null, locations, regions)).toEqual([]);
    expect(routesFrom([{ fromLocationId: 5n, toLocationId: 2n }], 1n, locations, regions)).toEqual([]);
  });
});
