// Travel rules shared by the server and the client.
//
// travelStaminaCost is the one stamina rule: performTravel uses it in both its check loop and its
// deduction loop, and the client imports it through @game-data/travel_config to show the same cost,
// so the two can never disagree. This file imports nothing so the browser can import it.
// CROSS_REGION_COOLDOWN_MICROS is applied on the server only; the client never reads it.
export const TRAVEL_CONFIG = {
  WITHIN_REGION_STAMINA: 5n,     // Stamina cost per character for same-region travel
  CROSS_REGION_STAMINA: 10n,     // Stamina cost per character for cross-region travel
  CROSS_REGION_COOLDOWN_MICROS: 5n * 60n * 1_000_000n, // 5 minutes in microseconds
};

export interface TravelEffectLike {
  effectType: string;
  roundsRemaining: bigint;
  magnitude: bigint | number;
}

/** Sum of the active travel_discount effects (an expired row or another effect type counts 0). */
export function travelEffectDiscount(effects: readonly TravelEffectLike[]): bigint {
  let total = 0n;
  for (const e of effects) {
    if (e.effectType === 'travel_discount' && e.roundsRemaining > 0n) total += BigInt(e.magnitude);
  }
  return total;
}

/**
 * One traveller's stamina cost: base (within a region or across) plus the racial increase, minus the
 * racial discount and the active travel_discount effects, never below 0.
 */
export function travelStaminaCost(input: {
  crossRegion: boolean;
  racialIncrease?: bigint | null;
  racialDiscount?: bigint | null;
  effectDiscount: bigint;
}): bigint {
  const base = input.crossRegion ? TRAVEL_CONFIG.CROSS_REGION_STAMINA : TRAVEL_CONFIG.WITHIN_REGION_STAMINA;
  const rawCost = base + (input.racialIncrease ?? 0n);
  const totalDiscount = (input.racialDiscount ?? 0n) + input.effectDiscount;
  return rawCost > totalDiscount ? rawCost - totalDiscount : 0n;
}
