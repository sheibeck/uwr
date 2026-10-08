// density_rules.ts
// The one shared density rules file of Phase 51.3.1.1 (SC6, D-51): every tunable density number is a
// named constant in DENSITY_RULES below, and every density rule is a pure, seeded function over them.
// No dial or admin command ships in this phase; Phase 52.5 puts its dials on these names.
//
// Pure module: no ctx, no Math.random, no clock reads. Every roll goes through economyRoll / rollBelow
// with a fixed POOL_ROLL index (never an additive offset on one timestamp, 51.3 review IN-02).
// The client imports it through `@game-data/density_rules` (the enemy_rules.ts precedent).

import { economyRoll, rollBelow, pickWeighted, pickWithoutReplacement } from './economy_rules';
import { ENEMY_ROLES } from './mechanical_vocabulary';

// ---------------------------------------------------------------------------
// Freezing helper
// ---------------------------------------------------------------------------

type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends readonly (infer V)[]
    ? readonly DeepReadonly<V>[]
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === 'object') {
    for (const inner of Object.values(value as Record<string, unknown>)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

// ---------------------------------------------------------------------------
// Constants (SC6, D-51)
// ---------------------------------------------------------------------------

interface GapBand { maxGap: number; pct: number }
interface WeightBand { maxGap: number; w: number }
interface DangerBand { maxDanger: number; pct: number }

export const DENSITY_RULES = deepFreeze({
  // --- Counts and levels ---
  COUNT_MAX: 100n, // D-05: a pool counts 0..100, hidden from players
  STABLE_FLOOR: 34n, // Scarce is 1..33, Stable starts here
  OVERRUN_FLOOR: 67n, // Overrun starts here
  CREATURE_HOME_COUNT: { 1: 25n, 2: 50n } as Record<number, bigint>, // D-18: a creature home is never 3
  RESOURCE_HOME_COUNT: { 1: 33n, 2: 66n, 3: 100n } as Record<number, bigint>, // D-38: band tops, so two gathers drop a level
  OVERRUN_SURGE_COUNT: 75n, // D-36: a vacuum surges the rival to Overrun
  VACUUM_RIVAL_HOME_LEVEL: 2, // D-36: the surging rival settles back to Stable

  // --- Depletion and regrowth ---
  DEPLETION_BY_ROLE: { tank: 8n, caster: 7n, healer: 6n, damage: 5n } as Record<string, bigint>, // D-16: points per kill
  CREATURE_REGROW_MICROS_PER_POINT: 15_000_000n, // D-19: regrowth in minutes (4 points a minute)
  OVERRUN_SETTLE_MICROS_PER_POINT: 9_000_000n, // MD-13: about one level per 5 minutes back to home
  WIPED_RESET_MICROS: 10_800_000_000n, // D-37: a wiped-out family stays gone 3 hours
  WIPED_RETURN_COUNT: 20n, // D-37: then returns Scarce at this count
  RESOURCE_REGROW_MICROS_PER_POINT: 216_000_000n, // D-28: resources regrow over hours, no long reset
  GATHER_DEPLETION_POINTS: 17n, // D-38: about two gathers drop a level
  YIELD_BY_LEVEL: { 0: 0n, 1: 1n, 2: 2n, 3: 3n } as Record<number, bigint>, // D-38: gather yield by density
  HARVEST_CAP_GATHERS: 4n, // D-27: gathers per player per place per window
  HARVEST_WINDOW_MICROS: 1_800_000_000n, // D-28: the harvest window (30 minutes)

  // --- Encounter chance (D-10) ---
  ENCOUNTER_BASE_PCT: [0, 4, 10, 22], // D-10: by density level 0..3
  TEMPERAMENT_PCT: { aggressive: 150, wary: 100, skittish: 40 } as Record<string, number>, // D-10
  GAP_PCT: [
    { maxGap: -5, pct: 0 },
    { maxGap: -3, pct: 40 },
    { maxGap: -1, pct: 70 },
    { maxGap: 0, pct: 100 },
    { maxGap: 2, pct: 130 },
  ] as GapBand[], // D-10: gap = family top level minus party level
  GAP_PCT_ABOVE: 170, // D-10: the family is 3 or more levels above the party
  ENCOUNTER_MAX_PCT: 60, // D-10: the combined chance never passes this
  GATHER_AMBUSH_FACTOR_PCT: 60, // D-13: a gather ambush rolls at this share of the place chance
  QUEST_ITEM_AMBUSH_FACTOR_PCT: 100, // the quest-item pickup ambush draws from the pools

  // --- Groups (D-11) ---
  GROUP_SIZE_BY_LEVEL: { 1: [1, 1], 2: [1, 2], 3: [2, 4] } as Record<number, [number, number]>, // D-11
  GROUP_TRIM_GAP: 4, // D-11: one fewer when the family top level is this far above the party
  HEALER_CAP_UP_TO_THREE: 1, // D-11: support members in a group of 1..3
  HEALER_CAP_FOUR: 2, // D-11: support members in a group of 4
  EXTRA_ROLE_WEIGHTS: { caster: 3, healer: 2, damage: 3, tank: 1 } as Record<string, number>, // D-11: extras lean to casters and support

  // --- Hunters (D-21: low by default, more often where Overrun) ---
  HUNTER_INTERVAL_MICROS: 600_000_000n, // D-21: one hunter check per 10 minutes
  HUNTER_ACTIVITY_PCT: 25, // D-21: share of checks where hunters act
  HUNTER_PLACES_PER_REGION: 1, // D-21: places thinned per active check
  HUNTER_THIN_POINTS: 4n, // D-21: points taken per hunted pool
  HUNTER_LEVEL_WEIGHTS: { 1: 1, 2: 1, 3: 3 } as Record<number, number>, // D-21: Overrun pools hunted more often

  // --- Party and ticks ---
  PARTY_LEVEL_RULE: 'lowest', // D-56: the lowest party member sets the level gap
  POOL_TICK_MICROS: 60_000_000n, // the pool tick runs once a minute
  MIGRATION_CONTINUE_MICROS: 1_000_000n, // the migration cursor continues a second later
  MIGRATION_REGIONS_PER_RUN: 1, // regions migrated per run (bounded transactions)

  // --- Homes ---
  RESOURCE_POOLS_PER_PLACE: 4, // D-26: resource pools at a place
  RESOURCE_HOME_BY_RARITY: { common: 3, uncommon: 2, rare: 1 } as Record<string, number>, // D-38
  STABLE_HOME_FAMILIES_PER_PLACE: 2, // D-46: the first two families of a place are home Stable, the rest Scarce

  // --- Place rating (UI-SPEC Rating rule, D-08: integer tenths, no floats) ---
  RATING_WEIGHT_X10: [
    { maxGap: -2, w: 5 },
    { maxGap: 0, w: 10 },
    { maxGap: 2, w: 16 },
  ] as WeightBand[], // UI-SPEC: weight of one family by its gap to the party
  RATING_WEIGHT_ABOVE_X10: 25, // UI-SPEC: a family 3 or more levels above
  RATING_QUIET_MAX_X10: 22, // UI-SPEC: Quiet up to 2.2
  RATING_RISKY_MAX_X10: 44, // UI-SPEC: Risky up to 4.4, Dangerous above

  // --- Rumours and trends (D-22, D-23) ---
  RUMOR_KEEP_PER_REGION: 5, // D-22: rumours kept per region
  RUMOR_TTL_MICROS: 7_200_000_000n, // D-22: a rumour lasts 2 hours
  RUMOR_PROMPT_MAX: 3, // D-22: rumours fed to one prompt
  TREND_CHECK_MICROS: 1_800_000_000n, // D-23: region trends checked every 30 minutes
  TREND_DELTA_LEVELS: 3, // D-23: summed level change that makes a region wilder or quieter

  // --- Hubs (D-62 supersedes D-60's single hub; danger is the region dangerMultiplier: starter 100, +50..100 a hop, cap 800) ---
  HUB_CHANCE_BY_DANGER: [
    { maxDanger: 200, pct: 100 },
    { maxDanger: 350, pct: 90 },
    { maxDanger: 500, pct: 70 },
    { maxDanger: 650, pct: 45 },
  ] as DangerBand[], // D-62: most regions get a hub, fewer the deeper from civilization
  HUB_CHANCE_ABOVE: 25, // D-62: the deepest regions often have none
  SECOND_HUB_PCT: 10, // D-62: a second hub is rare, rolled only when the first hit
  HUB_MAX_PER_REGION: 2, // D-62
  STARTER_HUB_COUNT: 1, // D-61: the starter region's one hub is its arrival point
  HUB_TERRAINS: ['town', 'city'] as string[], // D-60: the town-terrain tier of the hub choice rule

  // --- Crafting stations (D-63: only at hubs, rarer in wilder regions) ---
  CRAFTING_STATION_CHANCE_BY_DANGER: [
    { maxDanger: 200, pct: 100 },
    { maxDanger: 350, pct: 75 },
    { maxDanger: 500, pct: 50 },
    { maxDanger: 650, pct: 30 },
  ] as DangerBand[], // D-63
  CRAFTING_STATION_CHANCE_ABOVE: 15, // D-63
});

// ---------------------------------------------------------------------------
// Roll indexes: one fixed economyRoll index per roll
// ---------------------------------------------------------------------------

export const POOL_ROLL = Object.freeze({
  ENCOUNTER: 0n,
  ENCOUNTER_POOL: 1n,
  GROUP_SIZE: 2n,
  ROLE_BASE: 10n, // slot i rolls at ROLE_BASE + i
  MEMBER_BASE: 20n, // slot i rolls at MEMBER_BASE + i
  HUNTER_ACTIVE: 40n,
  HUNTER_PICK: 41n,
  SURGE_PICK: 50n,
  HOME_ORDER: 60n,
  RESOURCE_PICK: 70n,
  HUB_COUNT: 80n, // D-62
  HUB_SECOND: 81n, // D-62
  CRAFTING_STATION: 82n, // D-63
});

// ---------------------------------------------------------------------------
// Seeds
// ---------------------------------------------------------------------------

const SEED_PRIMES = [1000003n, 7919n, 104729n, 15485863n, 32452843n, 49979687n, 67867967n, 86028121n];

/**
 * The multiply-add-primes seed shape of lootSeed, with a distinct prime per argument position, so
 * (a, b) and (b, a) seed differently. Positions past the prime list reuse it offset by the position.
 */
export function poolSeed(...parts: bigint[]): bigint {
  let seed = 0n;
  parts.forEach((part, i) => {
    const prime = SEED_PRIMES[i % SEED_PRIMES.length]! + BigInt(Math.floor(i / SEED_PRIMES.length)) * 2n;
    seed += part * prime;
  });
  return BigInt.asUintN(64, seed);
}

/** The encounter phase codes mixed into an encounter seed. */
export const ENCOUNTER_PHASE_CODE = Object.freeze({
  enter: 1n,
  leave: 2n,
  pull: 3n,
  gather: 4n,
  aggro: 5n,
});
export type EncounterPhase = keyof typeof ENCOUNTER_PHASE_CODE;

/** The seed of one encounter roll: server timestamp, party leader, place and phase (T-51.3.1.1-01). */
export function encounterSeed(
  tsMicros: bigint,
  leaderId: bigint,
  placeId: bigint,
  phase: EncounterPhase | bigint,
): bigint {
  const code = typeof phase === 'bigint' ? phase : ENCOUNTER_PHASE_CODE[phase];
  return poolSeed(tsMicros, leaderId, placeId, code);
}

/** Tag mixed into the hub and crafting-station seeds. */
export const HUB_SEED_TAG = 7n;

/**
 * The seed of a region's hub count (D-62). It reads no timestamp: the server computes the count when it
 * builds the fill request and again when it writes the reply, and both must agree.
 */
export function hubSeed(regionId: bigint): bigint {
  return poolSeed(regionId, HUB_SEED_TAG);
}

/** The seed of one hub's crafting-station roll (D-63); no timestamp, like hubSeed. */
export function stationSeed(regionId: bigint, locationId: bigint): bigint {
  return poolSeed(regionId, locationId, HUB_SEED_TAG);
}

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

export type DensityLevel = 0 | 1 | 2 | 3;

/** A count's density level: 0 Wiped out, 1 Scarce (1..33), 2 Stable (34..66), 3 Overrun (67..100). */
export function countToLevel(count: bigint): DensityLevel {
  if (count <= 0n) return 0;
  if (count < DENSITY_RULES.STABLE_FLOOR) return 1;
  if (count < DENSITY_RULES.OVERRUN_FLOOR) return 2;
  return 3;
}

/**
 * The home count of a pool at a home level. A creature home is never Overrun (D-18): a creature home
 * level above 2 reads as 2. A level of 0 or below is 0.
 */
export function homeCount(kind: 'creature' | 'resource', homeLevel: number | bigint): bigint {
  const level = Number(homeLevel);
  if (!(level >= 1)) return 0n;
  if (kind === 'creature') return DENSITY_RULES.CREATURE_HOME_COUNT[Math.min(Math.floor(level), 2)] ?? 0n;
  return DENSITY_RULES.RESOURCE_HOME_COUNT[Math.min(Math.floor(level), 3)] ?? 0n;
}
