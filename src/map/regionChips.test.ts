import { describe, expect, it } from 'vitest';
import { regionChips, regionLevelRange } from './regionChips';

const regions = [
  { id: 1n, name: 'Zephyr Downs', dangerMultiplier: 300n },
  { id: 2n, name: 'Ashfall Wilds', dangerMultiplier: 500n },
  { id: 3n, name: 'ashfall wilds', dangerMultiplier: 700n },
  { id: 4n, name: 'Bleakmoor', dangerMultiplier: 900n },
];

const place = (id: bigint, regionId: bigint, over: Partial<{ terrainType: string; isSafe: boolean; levelOffset: bigint }> = {}) => ({
  id,
  regionId,
  terrainType: 'woods',
  isSafe: false,
  levelOffset: 0n,
  ...over,
});

describe('regionLevelRange', () => {
  it('spans the known non-safe places (ranges 2-4 and 5 give 2-5)', () => {
    const rs = [
      { id: 7n, dangerMultiplier: 200n },
      { id: 8n, dangerMultiplier: 500n },
    ];
    // region 7: base 2 with offset 1 is level 3, range 2-4; region 8: base 5 with offset 0 is exactly 5
    const places = [place(1n, 7n, { levelOffset: 1n }), place(2n, 8n)];
    expect(regionLevelRange(places, rs)).toEqual({ lo: 2, hi: 5 });
  });

  it('is null when every known place is safe, and skips uncharted places', () => {
    expect(regionLevelRange([place(1n, 1n, { isSafe: true, terrainType: 'town' })], regions)).toBeNull();
    expect(regionLevelRange([place(1n, 1n, { isSafe: true, terrainType: 'uncharted' })], regions)).toBeNull();
    expect(regionLevelRange([], regions)).toBeNull();
  });

  it('ignores a safe place next to a dangerous one', () => {
    const places = [place(1n, 1n, { isSafe: true, terrainType: 'town' }), place(2n, 1n)];
    expect(regionLevelRange(places, regions)).toEqual({ lo: 3, hi: 3 });
  });
});

describe('regionChips', () => {
  const drawn = [
    place(1n, 1n),
    place(2n, 2n, { levelOffset: 1n }),
    place(3n, 3n),
    place(4n, 4n, { isSafe: true, terrainType: 'town' }),
  ];

  it('lists your region first, then by name with base sensitivity, then by id', () => {
    const chips = regionChips({ drawn, regions, currentRegionId: 1n, shownRegionId: null });
    expect(chips.map((c) => c.regionId)).toEqual([1n, 2n, 3n, 4n]);
  });

  it('keeps your region first even when its name sorts last', () => {
    const chips = regionChips({ drawn, regions, currentRegionId: 4n, shownRegionId: null });
    expect(chips.map((c) => c.regionId)).toEqual([4n, 2n, 3n, 1n]);
  });

  it('labels Lv a-b, Lv n and Safe', () => {
    const chips = regionChips({ drawn, regions, currentRegionId: 1n, shownRegionId: null });
    const label = (id: bigint) => chips.find((c) => c.regionId === id)?.levelLabel;
    expect(label(1n)).toBe('Lv 3');
    expect(label(2n)).toBe('Lv 5–7');
    expect(label(4n)).toBe('Safe');
    expect(chips.find((c) => c.regionId === 4n)?.range).toBeNull();
    expect(chips.find((c) => c.regionId === 2n)?.range).toEqual({ lo: 5, hi: 7 });
  });

  it('marks the shown region and falls back to your region', () => {
    const shown = regionChips({ drawn, regions, currentRegionId: 1n, shownRegionId: 3n });
    expect(shown.filter((c) => c.isShown).map((c) => c.regionId)).toEqual([3n]);
    const fallback = regionChips({ drawn, regions, currentRegionId: 1n, shownRegionId: null });
    expect(fallback.filter((c) => c.isShown).map((c) => c.regionId)).toEqual([1n]);
  });

  it('marks only the current region as yours', () => {
    const chips = regionChips({ drawn, regions, currentRegionId: 2n, shownRegionId: null });
    expect(chips.filter((c) => c.isYours).map((c) => c.regionId)).toEqual([2n]);
  });

  it('does not list a region with no drawn place', () => {
    const chips = regionChips({ drawn: [place(1n, 1n)], regions, currentRegionId: 1n, shownRegionId: null });
    expect(chips.map((c) => c.regionId)).toEqual([1n]);
  });

  it('has no lock or level gate field', () => {
    const [chip] = regionChips({ drawn, regions, currentRegionId: 1n, shownRegionId: null });
    for (const key of Object.keys(chip)) expect(key).not.toMatch(/lock|gate|minLevel/i);
  });

  it('adds the band of the range top only when a player level is given', () => {
    const without = regionChips({ drawn, regions, currentRegionId: 1n, shownRegionId: null });
    expect(without.every((c) => c.band === null)).toBe(true);
    const withLevel = regionChips({ drawn, regions, currentRegionId: 1n, shownRegionId: null, playerLevel: 3 });
    expect(withLevel.find((c) => c.regionId === 1n)?.band).toBe('even');
    expect(withLevel.find((c) => c.regionId === 2n)?.band).toBe('deadly');
    expect(withLevel.find((c) => c.regionId === 4n)?.band).toBeNull();
  });
});
