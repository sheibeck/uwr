// region_shape.ts
// The rules that size and shape a bigger region (Phase 51.3.1.2: D-03, D-04, D-05). Every number is a
// named constant in DENSITY_RULES (dials arrive in Phase 52.5).
//
// Pure, deterministic module: no table access, no ctx, no timestamp, no Math.random. Every roll is
// seeded by hubSeed(regionId) at a fixed POOL_ROLL index, so the fill request and the reply write agree.
//
// Graph indices: node 0 is the arrival point and nodes 1..count-1 are the new places in reply order.
// The arrival point's passage back to the source region and the Edge Beyond edge are never passed in,
// so they never count toward EXIT_DEGREE_CAP.

import { rollBelow } from './economy_rules';
import { DENSITY_RULES, POOL_ROLL, hubSeed } from './density_rules';

/** A whole, non-negative count: NaN and negatives are 0, fractions are floored. */
function whole(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

// ---------------------------------------------------------------------------
// Place count (D-03)
// ---------------------------------------------------------------------------

/**
 * A region's place count (D-03): REGION_PLACES_MIN..REGION_PLACES_MAX, the arrival point included and
 * the Edge Beyond doorway not counted. Seeded by hubSeed(regionId) at POOL_ROLL.PLACE_COUNT (no
 * timestamp), so the fill request and the reply write roll the same number.
 */
export function placeCountFor(regionId: bigint): number {
  const span = BigInt(DENSITY_RULES.REGION_PLACES_MAX - DENSITY_RULES.REGION_PLACES_MIN + 1);
  return DENSITY_RULES.REGION_PLACES_MIN + Number(rollBelow(hubSeed(regionId), POOL_ROLL.PLACE_COUNT, span));
}

/**
 * How many of a reply's usable new places the server keeps (D-03). With a place count it keeps at most
 * placeCount - 1 (the arrival point is the other one) and fails below REGION_PLACES_FLOOR places in all.
 * With placeCount null (a job asked without a count, in flight at publish) it keeps at most
 * REGION_PLACES_MAX - 1 and never fails.
 */
export function acceptedNewPlaces(usable: number, placeCount: number | null): { keep: number; ok: boolean } {
  const have = whole(usable);
  if (placeCount === null) {
    return { keep: Math.min(have, DENSITY_RULES.REGION_PLACES_MAX - 1), ok: true };
  }
  const keep = Math.min(have, Math.max(0, whole(placeCount) - 1));
  return { keep, ok: keep + 1 >= DENSITY_RULES.REGION_PLACES_FLOOR };
}
