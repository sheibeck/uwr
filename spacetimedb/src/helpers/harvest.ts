// harvest.ts
// The per-player, per-place harvest cap of Phase 51.3.1.1 (D-27, D-28; T-51.3.1.1-37, T-51.3.1.1-39).
// A player may gather HARVEST_CAP_GATHERS times at a place per HARVEST_WINDOW_MICROS. The state lives
// in the private pool_harvest table, one row per (character, place); the my_harvest_caps view shows
// only the capped-until time of capped rows, never the count or the window start.
//
// Check harvestCappedFor BEFORE a gather starts; call recordHarvest when the gather pays out.

import { isHarvestCapped, nextHarvest } from '../data/density_rules';
import type { HarvestState } from '../data/density_rules';
import { RESOURCE_GATHER_CAST_MICROS } from './location';
import { getPerkBonusByField } from './renown';

/** The shortest a gather can take, whatever the perks. */
export const MIN_GATHER_MICROS = 500_000n;

/**
 * How long a gather takes for this character: the 8 s cast, shortened by the gatherSpeedBonus perk
 * (percent), never below MIN_GATHER_MICROS. Shared by gather_pool and start_gather_resource.
 */
export function gatherDurationMicros(ctx: any, character: any): bigint {
  const gatherSpeedBonus = getPerkBonusByField(ctx, character.id, 'gatherSpeedBonus', character.level);
  const raw = BigInt(Math.round(Number(RESOURCE_GATHER_CAST_MICROS) * (1 - gatherSpeedBonus / 100)));
  return raw < MIN_GATHER_MICROS ? MIN_GATHER_MICROS : raw;
}

/** The pool_harvest row of a character at a place, or null. */
export function harvestRow(ctx: any, characterId: bigint, locationId: bigint): any | null {
  for (const row of ctx.db.pool_harvest.by_character.filter(characterId)) {
    if (row.locationId === locationId) return row;
  }
  return null;
}

function stateOf(row: any | null): HarvestState | null {
  if (!row) return null;
  return {
    windowStartMicros: row.windowStartMicros,
    gathers: row.gathers,
    cappedUntilMicros: row.cappedUntilMicros,
  };
}

/** Whether the character is at the harvest cap at this place at `now`. */
export function harvestCappedFor(ctx: any, characterId: bigint, locationId: bigint, now: bigint): boolean {
  return isHarvestCapped(stateOf(harvestRow(ctx, characterId, locationId)), now);
}

/**
 * Records one gather of the character at the place (nextHarvest): the first gather inserts the row, a
 * gather inside the window increments it, the cap gather stores the capped-until time, and a gather
 * after the window starts a fresh window with capped-until 0n (so the view stops listing the place).
 * Returns the written row.
 */
export function recordHarvest(ctx: any, characterId: bigint, locationId: bigint, now: bigint): any {
  const row = harvestRow(ctx, characterId, locationId);
  const next = nextHarvest(stateOf(row), now);
  if (!row) {
    return ctx.db.pool_harvest.insert({
      id: 0n,
      characterId,
      locationId,
      windowStartMicros: next.windowStartMicros,
      gathers: next.gathers,
      cappedUntilMicros: next.cappedUntilMicros,
    });
  }
  const updated = {
    ...row,
    windowStartMicros: next.windowStartMicros,
    gathers: next.gathers,
    cappedUntilMicros: next.cappedUntilMicros,
  };
  ctx.db.pool_harvest.id.update(updated);
  return updated;
}
