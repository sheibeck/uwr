// Route level labels for the Here card (47-UI-SPEC "Context Rail Contract", CON-04).
//
// Rule from CONTEXT "Routes out" and the server's spawn rule: the destination's target level is
// placeTargetLevelFor (the server's computeLocationTargetLevel at base 1) and its band is
// placeLevelBand, both imported from @game-data/enemy_rules so the client never copies them.
// An offset of 0 spawns the exact level; any other offset spawns one level either side.
// Research A5 offered a region-wide min/max variant; the per-location rule is used because
// CONTEXT names the location's own levelOffset. Swapping is a change to routeLevel alone.
// Number() is used for the math only.

import { placeLevelBand, placeTargetLevelFor } from '@game-data/enemy_rules';

export type RouteLevel = { safe: true } | { safe: false; lo: number; hi: number };

export interface RouteView {
  locationId: bigint;
  name: string;
  level: RouteLevel;
  label: string;
}

/**
 * The place's target level, the server's computeLocationTargetLevel(ctx, locationId, 1n), through
 * the shared placeTargetLevelFor rule. An unknown region reads as the rule's default multiplier.
 */
export function placeTargetLevel(
  place: { regionId: bigint; levelOffset: bigint },
  regions: readonly { id: bigint; dangerMultiplier: bigint }[],
): bigint {
  const region = regions.find((r) => r.id === place.regionId);
  return placeTargetLevelFor(region?.dangerMultiplier, place.levelOffset);
}

export function routeLevel(
  dest: { isSafe: boolean; regionId: bigint; levelOffset: bigint },
  regions: readonly { id: bigint; dangerMultiplier: bigint }[],
): RouteLevel {
  if (dest.isSafe) return { safe: true };
  const band = placeLevelBand(placeTargetLevel(dest, regions), dest.levelOffset);
  return { safe: false, lo: Number(band.min), hi: Number(band.max) };
}

/** 'Safe', 'Lv 6' or 'Lv 5–7' (en dash). */
export function routeLevelLabel(level: RouteLevel): string {
  if (level.safe) return 'Safe';
  return level.lo === level.hi ? `Lv ${level.lo}` : `Lv ${level.lo}–${level.hi}`;
}

function compareNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

/** One row per distinct destination reachable from `fromId`, ordered by name then id. */
export function routesFrom(
  connections: readonly { fromLocationId: bigint; toLocationId: bigint }[],
  fromId: bigint | null,
  locations: readonly {
    id: bigint;
    name: string;
    isSafe: boolean;
    regionId: bigint;
    levelOffset: bigint;
  }[],
  regions: readonly { id: bigint; dangerMultiplier: bigint }[],
): RouteView[] {
  if (fromId === null) return [];
  const byId = new Map<bigint, (typeof locations)[number]>();
  for (const location of locations) byId.set(location.id, location);

  const seen = new Set<bigint>();
  const out: RouteView[] = [];
  for (const connection of connections) {
    if (connection.fromLocationId !== fromId) continue;
    if (seen.has(connection.toLocationId)) continue;
    const dest = byId.get(connection.toLocationId);
    if (!dest) continue;
    seen.add(connection.toLocationId);
    const level = routeLevel(dest, regions);
    out.push({ locationId: dest.id, name: dest.name, level, label: routeLevelLabel(level) });
  }
  out.sort((a, b) => {
    const byName = compareNames(a.name, b.name);
    if (byName !== 0) return byName;
    return a.locationId < b.locationId ? -1 : a.locationId > b.locationId ? 1 : 0;
  });
  return out;
}
