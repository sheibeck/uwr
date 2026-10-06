// Route level labels for the Here card (47-UI-SPEC "Context Rail Contract", CON-04).
//
// Rule from CONTEXT "Routes out" and the server's spawn rule (spacetimedb/src/helpers/location.ts,
// computeLocationTargetLevel and the maxDiff check): the destination's level is
// floor(region.dangerMultiplier / 100) + the destination's own levelOffset, never below 1.
// An offset of 0 spawns the exact level; any other offset spawns one level either side.
// Research A5 offered a region-wide min/max variant; the per-location rule is used because
// CONTEXT names the location's own levelOffset. Swapping is a change to routeLevel alone.
// Number() is used for the math only.

export type RouteLevel = { safe: true } | { safe: false; lo: number; hi: number };

export interface RouteView {
  locationId: bigint;
  name: string;
  level: RouteLevel;
  label: string;
}

export function routeLevel(
  dest: { isSafe: boolean; regionId: bigint; levelOffset: bigint },
  regions: readonly { id: bigint; dangerMultiplier: bigint }[],
): RouteLevel {
  if (dest.isSafe) return { safe: true };
  const region = regions.find((r) => r.id === dest.regionId);
  const base = region ? Math.floor(Number(region.dangerMultiplier) / 100) : 1;
  const level = Math.max(1, base + Number(dest.levelOffset));
  if (dest.levelOffset === 0n) return { safe: false, lo: level, hi: level };
  return { safe: false, lo: Math.max(1, level - 1), hi: level + 1 };
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
