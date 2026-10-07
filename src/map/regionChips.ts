// Region chips for the Map (51-CONTEXT "Region list"). Every known region is listed with the level
// range across its known non-safe places. No level lock exists anywhere: whether a crossing is
// possible is the travel timer's business and is added by the components (plans 51-08 and 51-09).

import { dangerBand, placeDanger } from './danger';
import type { Band } from './danger';
import { compareBigint, compareNames } from './order';

export interface RegionPlace {
  id: bigint;
  regionId: bigint;
  terrainType: string;
  isSafe: boolean;
  levelOffset: bigint;
}

export interface RegionDef {
  id: bigint;
  name: string;
  dangerMultiplier: bigint;
}

export interface LevelRange {
  lo: number;
  hi: number;
}

/** Range across the given places, skipping safe and uncharted ones; null when none is left. */
export function regionLevelRange(
  places: readonly RegionPlace[],
  regions: readonly { id: bigint; dangerMultiplier: bigint }[],
): LevelRange | null {
  let range: LevelRange | null = null;
  for (const place of places) {
    const danger = placeDanger(place, regions, 1);
    if (danger.kind !== 'band' || danger.lo === null || danger.hi === null) continue;
    range = range
      ? { lo: Math.min(range.lo, danger.lo), hi: Math.max(range.hi, danger.hi) }
      : { lo: danger.lo, hi: danger.hi };
  }
  return range;
}

export interface RegionChip {
  regionId: bigint;
  name: string;
  /** 'Lv a–b', 'Lv n' or 'Safe'. */
  levelLabel: string;
  range: LevelRange | null;
  /** Band of the range's top for the caller's level; null without a range or without a level. */
  band: Band | null;
  isShown: boolean;
  isYours: boolean;
}

export function regionChips(input: {
  drawn: readonly RegionPlace[];
  regions: readonly RegionDef[];
  currentRegionId: bigint | null;
  shownRegionId: bigint | null;
  playerLevel?: number;
}): RegionChip[] {
  const shownId = input.shownRegionId ?? input.currentRegionId;
  const byRegion = new Map<bigint, RegionPlace[]>();
  for (const place of input.drawn) {
    const list = byRegion.get(place.regionId);
    if (list) list.push(place);
    else byRegion.set(place.regionId, [place]);
  }

  const chips: RegionChip[] = [];
  for (const [regionId, places] of byRegion) {
    const region = input.regions.find((r) => r.id === regionId);
    const range = regionLevelRange(places, input.regions);
    const levelLabel = range === null ? 'Safe' : range.lo === range.hi ? `Lv ${range.lo}` : `Lv ${range.lo}–${range.hi}`;
    chips.push({
      regionId,
      name: region ? region.name : 'Unknown region',
      levelLabel,
      range,
      band: range !== null && input.playerLevel !== undefined ? dangerBand(range.hi, input.playerLevel) : null,
      isShown: regionId === shownId,
      isYours: regionId === input.currentRegionId,
    });
  }

  chips.sort((x, y) => {
    if (x.isYours !== y.isYours) return x.isYours ? -1 : 1;
    return compareNames(x.name, y.name) || compareBigint(x.regionId, y.regionId);
  });
  return chips;
}
