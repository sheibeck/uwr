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
  YIELD_BY_LEVEL: { 0: 0n, 1: 1n, 2: 1n, 3: 1n } as Record<number, bigint>, // D-72 (supersedes D-38's 1/2/3): one per gather at any non-zero density; density sets how many gathers a place supports
  GATHER_YIELD_MULTIPLIER: 1n, // D-72: times the base yield; the Phase 52.5 admin dial (default x1)
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
  QUEST_TARGET_PULL_CHANCE_PCT: 40, // D-74: each drawn slot of a family holding a roster member's kill target is that target on this chance; dial in Phase 52.5

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
  MIGRATION_MAX_ATTEMPTS: 5n, // a region that fails this many runs in a row is skipped and recorded

  // --- Homes ---
  RESOURCE_POOLS_PER_PLACE: 4, // D-26: resource pools at a place
  RESOURCE_HOME_BY_RARITY: { common: 3, uncommon: 2, rare: 1 } as Record<string, number>, // D-38
  STABLE_HOME_FAMILIES_PER_PLACE: 2, // D-46: the first two families of a place are home Stable, the rest Scarce

  // --- Place rating (D-73: level first, crowds nudge; replaces the UI-SPEC summed score; dials in Phase 52.5) ---
  RATING_GAP_QUIET_MAX: 0, // D-73: the toughest present family at or below the party's lowest level reads Quiet
  RATING_GAP_RISKY_MAX: 2, // D-73: one or two levels above reads Risky, more reads Deadly
  RATING_CROWD_LEVEL: 3, // D-73: any family at this density (Overrun) crowds the place
  RATING_CROWD_FAMILIES: 3, // D-73: this many living families (density above Wiped out) crowd the place

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

  // --- Families per region and per place (D-66, D-67), feuds (D-70) and histories (D-68); dials arrive in Phase 52.5 ---
  FAMILIES_PER_PLACE_X10: 15, // D-66: about 1.5 families per place, in integer tenths
  FAMILY_COUNT_MIN: 3, // D-66: a region has at least this many families
  FAMILY_COUNT_MAX: 15, // D-66: and at most this many
  PLACE_FAMILIES_MIN: 3, // D-67: families one host place holds, fewer when the region has fewer
  PLACE_FAMILIES_MAX: 5, // D-67
  FEUD_FAMILIES_MIN: 2, // D-70: families in a region's one seeded feud
  FEUD_FAMILIES_MAX: 3, // D-70
  FEUD_CHANCE_PCT: 35, // D-71: a new region seeds a feud only on this chance, so not every region has one
  NPC_FAMILY_HISTORIES_MAX: 4, // D-68: family histories fed to one NPC conversation

  // --- Region size and shape (Phase 51.3.1.2: D-03, D-04, D-05, D-10; dials arrive in Phase 52.5) ---
  REGION_PLACES_MIN: 8, // D-03: the fewest places the server rolls for a region, the arrival point included (the Edge Beyond doorway does not count)
  REGION_PLACES_MAX: 10, // D-03: the most places it rolls
  REGION_PLACES_FLOOR: 6, // D-03: a short reply is accepted down to this many places in all; below it the fill fails
  LEVEL_HOPS_PER_STEP: 2, // D-04: a new place's level offset rises by one per this many hops from the arrival point
  LEVEL_OFFSET_MAX: 2, // D-04: and by at most this much
  EXIT_DEGREE_CAP: 4, // D-05: in-region exits per place, trimmed only where the edge is not a bridge
  MIN_HOST_PLACES: 4, // D-05: places that can host creatures (non-safe, non-hub); the farthest safe places flip to reach it
  ECONOMY_MEDIUM_MIN_PLACES: 8, // D-10: a region this big gets the medium economy (5 gatherables, 5 recipes)
  REGION_NPCS_MAX: 5, // D-06: the most NPCs a stage-2a reply may add besides each hub's vendor and banker (the approved wording asks for 3-5); the rest are dropped (review A WR-06)
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
  PLACE_FAMILY_COUNT: 83n, // D-67
  PLACE_FAMILY_ORDER: 84n, // D-67
  FEUD_COUNT: 85n, // D-70
  FEUD_PICK: 86n, // D-70: pick i rolls at FEUD_PICK + i
  RULE_FAMILY_ORDER: 87n, // D-66: the order of the rule family list (helpers/family_validate.ts)
  FEUD_CHANCE: 88n, // D-71
  PLACE_COUNT: 89n, // D-03
  QUEST_TARGET_BASE: 100n, // D-74: slot i rolls the quest-target chance at QUEST_TARGET_BASE + i
  QUEST_TARGET_PICK_BASE: 110n, // D-74: slot i picks among several targets at QUEST_TARGET_PICK_BASE + i
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

/** Tag mixed into the family, feud and per-place family seeds. */
export const FAMILY_SEED_TAG = 11n;

/**
 * The seed of a region's feud and rule family order (D-66, D-70). No timestamp, like hubSeed, so the
 * fill request and the reply write agree (D-62 precedent).
 */
export function familySeed(regionId: bigint): bigint {
  return poolSeed(regionId, FAMILY_SEED_TAG);
}

/** The seed of one place's family pick (D-67); no timestamp, like familySeed. */
export function placeFamiliesSeed(regionId: bigint, locationId: bigint): bigint {
  return poolSeed(regionId, locationId, FAMILY_SEED_TAG);
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

/** A density level as a table key: 0..3. */
function levelKey(level: number | bigint): DensityLevel {
  const n = Math.floor(Number(level));
  if (!(n >= 1)) return 0;
  return n >= 3 ? 3 : (n as DensityLevel);
}

// ---------------------------------------------------------------------------
// Weighted picks over economy_rules.pickWeighted
// ---------------------------------------------------------------------------

/**
 * One weighted pick of a value. Entries carry their input position as the pickWeighted id, so the
 * result depends only on the seed, the index and the input order. Null when every weight is 0.
 */
function pickValue<V>(items: readonly { value: V; weight: bigint }[], seed: bigint, index: bigint): V | null {
  const entries = items.map((item, i) => ({ itemTemplateId: BigInt(i), weight: item.weight, value: item.value }));
  const pick = pickWeighted(entries, seed, index);
  return pick ? pick.value : null;
}

// ---------------------------------------------------------------------------
// Encounter chance (D-10)
// ---------------------------------------------------------------------------

/** The level-gap factor in percent (gap = family top level minus party level). */
export function gapPct(gap: number): number {
  for (const band of DENSITY_RULES.GAP_PCT) {
    if (gap <= band.maxGap) return band.pct;
  }
  return DENSITY_RULES.GAP_PCT_ABOVE;
}

export interface EncounterPoolInput {
  level: number;
  temperament: string;
  lvHi: bigint;
}

/**
 * One pool's encounter chance in basis points: base by density x temperament x level gap. 0 for a
 * wiped-out family; an unknown temperament reads as wary.
 */
function poolChanceBp(pool: EncounterPoolInput, partyLevel: bigint): bigint {
  const level = levelKey(pool.level);
  if (level === 0) return 0n;
  const base = BigInt(DENSITY_RULES.ENCOUNTER_BASE_PCT[level] ?? 0);
  const temper = BigInt(DENSITY_RULES.TEMPERAMENT_PCT[pool.temperament] ?? DENSITY_RULES.TEMPERAMENT_PCT['wary'] ?? 100);
  const gap = BigInt(gapPct(Number(pool.lvHi - partyLevel)));
  const bp = (base * temper * gap) / 100n; // percent x percent x percent / 100 = basis points
  return bp > 10000n ? 10000n : bp;
}

/**
 * The chance of an encounter at a place in basis points (D-10): 0 at a safe place; per-pool chances
 * combine as 1 - prod(1 - p); factorPct (default 100, e.g. GATHER_AMBUSH_FACTOR_PCT) applies after
 * combining; capped at ENCOUNTER_MAX_PCT.
 */
export function encounterChanceBp(input: {
  isSafe: boolean;
  pools: readonly EncounterPoolInput[];
  partyLevel: bigint;
  factorPct?: number;
}): number {
  if (input.isSafe) return 0;
  let miss = 10000n;
  for (const pool of input.pools) {
    miss = (miss * (10000n - poolChanceBp(pool, input.partyLevel))) / 10000n;
  }
  let hit = 10000n - miss;
  const factor = BigInt(Math.max(0, Math.floor(input.factorPct ?? 100)));
  hit = (hit * factor) / 100n;
  const cap = BigInt(DENSITY_RULES.ENCOUNTER_MAX_PCT * 100);
  return Number(hit > cap ? cap : hit);
}

/** Whether an encounter roll hits a chance in basis points (POOL_ROLL.ENCOUNTER). */
export function encounterHit(seed: bigint, bp: number): boolean {
  return rollBelow(seed, POOL_ROLL.ENCOUNTER, 10000n) < BigInt(Math.floor(bp));
}

/**
 * Which pool an encounter draws from: weighted by each pool's own chance (POOL_ROLL.ENCOUNTER_POOL).
 * Pools that add nothing (wiped out, far below the party) are never picked; null when none adds.
 */
export function pickEncounterPool<T extends EncounterPoolInput>(seed: bigint, pools: readonly T[], partyLevel: bigint): T | null {
  return pickValue(
    pools.map((pool) => ({ value: pool, weight: poolChanceBp(pool, partyLevel) })),
    seed,
    POOL_ROLL.ENCOUNTER_POOL,
  );
}

// ---------------------------------------------------------------------------
// Groups (D-11) and party level (D-56)
// ---------------------------------------------------------------------------

/**
 * How many members an encounter draws: Scarce 1, Stable 1-2, Overrun 2-4 (POOL_ROLL.GROUP_SIZE), one
 * fewer (never below 1) when the family top level is GROUP_TRIM_GAP or more above the party. 0 at level 0.
 */
export function groupSizeFor(level: number, gap: number, seed: bigint): number {
  const key = levelKey(level);
  if (key === 0) return 0;
  const range = DENSITY_RULES.GROUP_SIZE_BY_LEVEL[key];
  if (!range) return 0;
  const lo = range[0] ?? 1;
  const hi = Math.max(lo, range[1] ?? lo);
  let size = lo + Number(rollBelow(seed, POOL_ROLL.GROUP_SIZE, BigInt(hi - lo + 1)));
  if (gap >= DENSITY_RULES.GROUP_TRIM_GAP) size -= 1;
  return Math.max(1, size);
}

/**
 * The roles of a drawn group (D-11). Slot 0 is a tank or damage member when the family has one (else
 * its first non-support role); extras lean to casters and support by EXTRA_ROLE_WEIGHTS; support is
 * capped at HEALER_CAP_UP_TO_THREE (HEALER_CAP_FOUR in a group of 4); a group is never only support,
 * so a support-only family sends one. Only available roles are used; a family of one yields copies.
 * The input order never matters (roles are read in ENEMY_ROLES order, unknown roles after).
 */
export function composeGroupRoles(size: number, available: readonly string[], seed: bigint): string[] {
  if (size <= 0) return [];
  const known = ENEMY_ROLES.filter((role) => available.includes(role)) as string[];
  const unknown = [...new Set(available.filter((role) => !(ENEMY_ROLES as readonly string[]).includes(role)))].sort();
  const roles = [...known, ...unknown];
  if (roles.length === 0) return [];

  const front = roles.filter((role) => role === 'tank' || role === 'damage');
  let first: string;
  if (front.length > 0) {
    first = front[Number(rollBelow(seed, POOL_ROLL.ROLE_BASE, BigInt(front.length)))]!;
  } else {
    const nonSupport = roles.find((role) => role !== 'healer');
    if (nonSupport === undefined) return ['healer'];
    first = nonSupport;
  }

  const cap = size >= 4 ? DENSITY_RULES.HEALER_CAP_FOUR : DENSITY_RULES.HEALER_CAP_UP_TO_THREE;
  const result = [first];
  let healers = 0;
  for (let slot = 1; slot < size; slot += 1) {
    const choices = roles
      .filter((role) => role !== 'healer' || healers < cap)
      .map((role) => ({ value: role, weight: BigInt(Math.max(1, DENSITY_RULES.EXTRA_ROLE_WEIGHTS[role] ?? 1)) }));
    const pick = pickValue(choices, seed, POOL_ROLL.ROLE_BASE + BigInt(slot)) ?? first;
    if (pick === 'healer') healers += 1;
    result.push(pick);
  }
  return result;
}

/**
 * Whether drawn slot `slot` of a family holding a roster member's active kill target is that target
 * (D-74): a seeded roll at POOL_ROLL.QUEST_TARGET_BASE + slot, below QUEST_TARGET_PULL_CHANCE_PCT out of 100.
 */
export function questTargetHit(seed: bigint, slot: number): boolean {
  return rollBelow(seed, POOL_ROLL.QUEST_TARGET_BASE + BigInt(slot), 100n) < BigInt(DENSITY_RULES.QUEST_TARGET_PULL_CHANCE_PCT);
}

/** Which target a hit slot becomes when several are held (D-74, POOL_ROLL.QUEST_TARGET_PICK_BASE + slot); null for none. */
export function pickQuestTarget<T>(seed: bigint, slot: number, targets: readonly T[]): T | null {
  if (targets.length === 0) return null;
  return targets[Number(rollBelow(seed, POOL_ROLL.QUEST_TARGET_PICK_BASE + BigInt(slot), BigInt(targets.length)))]!;
}

/** The party level every roll uses: the LOWEST member (PARTY_LEVEL_RULE 'lowest', D-56); 1 when empty. */
export function partyLevel(levels: readonly bigint[]): bigint {
  if (levels.length === 0) return 1n;
  let low = levels[0]!;
  for (const level of levels) if (level < low) low = level;
  return low;
}

// ---------------------------------------------------------------------------
// Settling (D-19, D-28, D-32, D-37, MD-13)
// ---------------------------------------------------------------------------

export interface SettleInput {
  kind: 'creature' | 'resource';
  count: bigint;
  homeLevel: number | bigint;
  lastSettledMicros: bigint;
  wipedAtMicros: bigint;
}

export interface SettleResult {
  count: bigint;
  lastSettledMicros: bigint;
  wipedAtMicros: bigint;
}

/**
 * Settle a pool lazily up to `now`. Below home it regrows one point per regrow step (creature or
 * resource rate) and never passes home; above home it settles back one point per
 * OVERRUN_SETTLE_MICROS_PER_POINT and never drops below home. lastSettledMicros advances only by the
 * time the points used, so leftover time carries forward and one lazy settle equals many small ones;
 * at home it is `now`. A wiped-out creature family (count 0, wipedAtMicros > 0) stays at 0 until
 * WIPED_RESET_MICROS has passed, then returns at WIPED_RETURN_COUNT and regrows from the reset time.
 * Resources have no long reset. A `now` before lastSettledMicros changes nothing.
 */
export function settleCount(p: SettleInput, now: bigint): SettleResult {
  let count = p.count;
  let last = p.lastSettledMicros;
  let wiped = p.kind === 'creature' ? p.wipedAtMicros : 0n;
  if (now < last) return { count, lastSettledMicros: last, wipedAtMicros: wiped };

  if (p.kind === 'creature' && count <= 0n && wiped > 0n) {
    const resetAt = wiped + DENSITY_RULES.WIPED_RESET_MICROS;
    if (now < resetAt) return { count: 0n, lastSettledMicros: now, wipedAtMicros: wiped };
    count = DENSITY_RULES.WIPED_RETURN_COUNT;
    wiped = 0n;
    last = resetAt > last ? resetAt : last;
  }

  const home = homeCount(p.kind, p.homeLevel);
  if (count < home) {
    const rate = p.kind === 'creature'
      ? DENSITY_RULES.CREATURE_REGROW_MICROS_PER_POINT
      : DENSITY_RULES.RESOURCE_REGROW_MICROS_PER_POINT;
    const points = (now - last) / rate;
    if (count + points >= home) return { count: home, lastSettledMicros: now, wipedAtMicros: wiped };
    return { count: count + points, lastSettledMicros: last + points * rate, wipedAtMicros: wiped };
  }
  if (count > home) {
    const rate = DENSITY_RULES.OVERRUN_SETTLE_MICROS_PER_POINT;
    const points = (now - last) / rate;
    if (count - points <= home) return { count: home, lastSettledMicros: now, wipedAtMicros: wiped };
    return { count: count - points, lastSettledMicros: last + points * rate, wipedAtMicros: wiped };
  }
  return { count, lastSettledMicros: now, wipedAtMicros: wiped };
}

// ---------------------------------------------------------------------------
// Gather yield and the harvest window (D-27, D-28, D-38)
// ---------------------------------------------------------------------------

/**
 * Items one gather yields at a resource pool's density level (D-72): 1 at any non-zero level, 0 at
 * level 0, times GATHER_YIELD_MULTIPLIER (default 1; pass another multiplier only in tests or the
 * future Phase 52.5 dial). Gather perks and racial bonuses add on top in finish_gather.
 */
export function yieldForLevel(level: number, multiplier: bigint = DENSITY_RULES.GATHER_YIELD_MULTIPLIER): bigint {
  return (DENSITY_RULES.YIELD_BY_LEVEL[levelKey(level)] ?? 0n) * multiplier;
}

export interface HarvestState {
  windowStartMicros: bigint;
  gathers: bigint;
  cappedUntilMicros: bigint;
}

/**
 * A player's harvest state after one more gather at a place: a gather after the window (or the first)
 * starts a new window; the HARVEST_CAP_GATHERS-th gather in a window caps the player until the window
 * ends. Callers check isHarvestCapped before gathering.
 */
export function nextHarvest(state: HarvestState | null, now: bigint): HarvestState {
  const capAt = (start: bigint, gathers: bigint): bigint =>
    gathers >= DENSITY_RULES.HARVEST_CAP_GATHERS ? start + DENSITY_RULES.HARVEST_WINDOW_MICROS : 0n;
  if (!state || now >= state.windowStartMicros + DENSITY_RULES.HARVEST_WINDOW_MICROS || now < state.windowStartMicros) {
    return { windowStartMicros: now, gathers: 1n, cappedUntilMicros: capAt(now, 1n) };
  }
  const gathers = state.gathers + 1n;
  return { windowStartMicros: state.windowStartMicros, gathers, cappedUntilMicros: capAt(state.windowStartMicros, gathers) };
}

/** Whether a player is at the harvest cap at `now`. */
export function isHarvestCapped(state: HarvestState | null, now: bigint): boolean {
  return state !== null && now < state.cappedUntilMicros;
}

// ---------------------------------------------------------------------------
// Hunters and the vacuum (D-21, D-36)
// ---------------------------------------------------------------------------

/** Whether hunters act on this check (POOL_ROLL.HUNTER_ACTIVE against HUNTER_ACTIVITY_PCT). */
export function hunterActive(seed: bigint): boolean {
  return rollBelow(seed, POOL_ROLL.HUNTER_ACTIVE, 100n) < BigInt(DENSITY_RULES.HUNTER_ACTIVITY_PCT);
}

/**
 * Up to n pools hunters thin, without replacement, weighted by HUNTER_LEVEL_WEIGHTS (Overrun more
 * often); a wiped-out pool is never picked. Pick i rolls at HUNTER_PICK + i.
 */
export function pickHunterTargets<T extends { level: number }>(seed: bigint, pools: readonly T[], n: number): T[] {
  const entries = pools
    .map((pool, i) => {
      const key = levelKey(pool.level);
      const weight = key === 0 ? 0 : DENSITY_RULES.HUNTER_LEVEL_WEIGHTS[key] ?? 0;
      return { itemTemplateId: BigInt(i), weight: BigInt(weight), pool };
    })
    .filter((entry) => entry.weight > 0n);
  const count = Math.max(0, Math.min(Math.floor(n), entries.length));
  return pickWithoutReplacement(entries, count, seed, POOL_ROLL.HUNTER_PICK).map((entry) => entry.pool);
}

/** The rival or predator that surges into a vacuum (D-36, POOL_ROLL.SURGE_PICK); null when none. */
export function pickSurgeTarget<T>(seed: bigint, candidates: readonly T[]): T | null {
  if (candidates.length === 0) return null;
  return candidates[Number(rollBelow(seed, POOL_ROLL.SURGE_PICK, BigInt(candidates.length)))] ?? null;
}

// ---------------------------------------------------------------------------
// Region trend (D-23)
// ---------------------------------------------------------------------------

/** 'wilder' or 'quieter' when a region's summed creature levels moved TREND_DELTA_LEVELS or more. */
export function regionTrend(sumThen: number, sumNow: number): 'wilder' | 'quieter' | null {
  const delta = sumNow - sumThen;
  if (delta >= DENSITY_RULES.TREND_DELTA_LEVELS) return 'wilder';
  if (delta <= -DENSITY_RULES.TREND_DELTA_LEVELS) return 'quieter';
  return null;
}

// ---------------------------------------------------------------------------
// Home levels (D-18, D-38, D-46)
// ---------------------------------------------------------------------------

/**
 * Home levels of a place's families, by family position: the first STABLE_HOME_FAMILIES_PER_PLACE of a
 * seeded permutation (one HOME_ORDER roll seeds the shuffle) are Stable (2), the rest Scarce (1).
 * Never Overrun (D-18). One family gives [2].
 */
export function creatureHomeLevels(familyCount: number, seed: bigint): number[] {
  const n = Math.max(0, Math.floor(familyCount));
  const order = Array.from({ length: n }, (_, i) => i);
  const shuffleSeed = economyRoll(seed, POOL_ROLL.HOME_ORDER);
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Number(rollBelow(shuffleSeed, BigInt(i), BigInt(i + 1)));
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }
  const levels = new Array<number>(n).fill(1);
  order.forEach((familyIndex, rank) => {
    if (rank < DENSITY_RULES.STABLE_HOME_FAMILIES_PER_PLACE) levels[familyIndex] = 2;
  });
  return levels;
}

/** A resource pool's home level by rarity (D-38); an unknown rarity reads as common. */
export function resourceHomeLevel(rarity: string): number {
  const table = DENSITY_RULES.RESOURCE_HOME_BY_RARITY;
  return table[rarity] ?? table['common'] ?? 3;
}

// ---------------------------------------------------------------------------
// Hubs and crafting stations (D-59 to D-63)
// ---------------------------------------------------------------------------

/** The pct of the first band whose maxDanger is at least `danger`, else `above`. */
export function bandPct(
  bands: readonly { readonly maxDanger: number; readonly pct: number }[],
  above: number,
  danger: bigint | number,
): number {
  const d = Number(danger);
  for (const band of bands) {
    if (d <= band.maxDanger) return band.pct;
  }
  return above;
}

/**
 * How many hubs a region gets (D-62, superseding D-60's single hub): the starter region gets
 * STARTER_HUB_COUNT (D-61); otherwise a HUB_COUNT roll below the danger band's chance gives a hub, and a
 * HUB_SECOND roll below SECOND_HUB_PCT gives a second; never above HUB_MAX_PER_REGION. Seed with
 * hubSeed(regionId) so the fill request and the reply write agree.
 */
export function hubCountFor(dangerMultiplier: bigint | number, isStarter: boolean, seed: bigint): 0 | 1 | 2 {
  const max = DENSITY_RULES.HUB_MAX_PER_REGION;
  const clamp = (n: number): 0 | 1 | 2 => Math.max(0, Math.min(n, max, 2)) as 0 | 1 | 2;
  if (isStarter) return clamp(DENSITY_RULES.STARTER_HUB_COUNT);
  const pct = bandPct(DENSITY_RULES.HUB_CHANCE_BY_DANGER, DENSITY_RULES.HUB_CHANCE_ABOVE, dangerMultiplier);
  if (rollBelow(seed, POOL_ROLL.HUB_COUNT, 100n) >= BigInt(pct)) return 0;
  const second = rollBelow(seed, POOL_ROLL.HUB_SECOND, 100n) < BigInt(DENSITY_RULES.SECOND_HUB_PCT);
  return clamp(second ? 2 : 1);
}

/**
 * Whether a hub has a crafting station (D-63): always in the starter region; otherwise a
 * CRAFTING_STATION roll below the danger band's chance. Seed with stationSeed(regionId, locationId).
 */
export function hubHasStation(dangerMultiplier: bigint | number, isStarter: boolean, seed: bigint): boolean {
  if (isStarter) return true;
  const pct = bandPct(
    DENSITY_RULES.CRAFTING_STATION_CHANCE_BY_DANGER,
    DENSITY_RULES.CRAFTING_STATION_CHANCE_ABOVE,
    dangerMultiplier,
  );
  return rollBelow(seed, POOL_ROLL.CRAFTING_STATION, 100n) < BigInt(pct);
}

export interface HubPlace {
  id: bigint;
  isSafe: boolean;
  terrainType: string;
}

/**
 * The region's hubs, correcting the AI's marks to the server's count (D-60, D-61, D-62):
 * 1. only listed places whose terrain is not 'uncharted' qualify;
 * 2. the starter region's hub is its arrival point (D-61);
 * 3. qualifying existing hubs stay (a retried fill never moves the services);
 * 4. qualifying marks are added in order while fewer than `count` (extras are dropped);
 * 5. while still short, the best remaining place is added by tier: a safe place, then a HUB_TERRAINS
 *    place, then the arrival point; within a tier the arrival point first, then the lowest id. When no
 *    tier has a place left the region gets fewer hubs.
 * Returns the ids in the order chosen.
 */
export function chooseHubs(input: {
  places: readonly HubPlace[];
  arrivalId: bigint;
  count: number;
  isStarter: boolean;
  existingHubIds: readonly bigint[];
  markedIds: readonly bigint[];
}): bigint[] {
  if (input.isStarter) return [input.arrivalId];
  const qualifying = input.places.filter((place) => place.terrainType !== 'uncharted');
  const byId = new Map<bigint, HubPlace>();
  for (const place of qualifying) if (!byId.has(place.id)) byId.set(place.id, place);

  const chosen: bigint[] = [];
  const take = (id: bigint): void => {
    if (byId.has(id) && !chosen.includes(id)) chosen.push(id);
  };
  for (const id of input.existingHubIds) take(id);
  for (const id of input.markedIds) {
    if (chosen.length >= input.count) break;
    take(id);
  }

  const tiers: ((place: HubPlace) => boolean)[] = [
    (place) => place.isSafe,
    (place) => DENSITY_RULES.HUB_TERRAINS.includes(place.terrainType),
    (place) => place.id === input.arrivalId,
  ];
  const rank = (a: HubPlace, b: HubPlace): number => {
    if (a.id === input.arrivalId) return -1;
    if (b.id === input.arrivalId) return 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
  while (chosen.length < input.count) {
    let next: HubPlace | undefined;
    for (const inTier of tiers) {
      next = [...byId.values()].filter((place) => inTier(place) && !chosen.includes(place.id)).sort(rank)[0];
      if (next) break;
    }
    if (!next) break;
    chosen.push(next.id);
  }
  return chosen;
}

// ---------------------------------------------------------------------------
// Families per region and per place (D-66, D-67), feuds (D-70)
// ---------------------------------------------------------------------------

/** A whole, non-negative count; anything not a finite number reads as 0. */
function wholeCount(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/**
 * A region's family count from its size (D-66): about FAMILIES_PER_PLACE_X10 / 10 families per place,
 * at least FAMILY_COUNT_MIN and at most FAMILY_COUNT_MAX. A negative or fractional count is floored and
 * clamped.
 */
export function familyCountFor(placeCount: number): number {
  const raw = Math.floor((wholeCount(placeCount) * DENSITY_RULES.FAMILIES_PER_PLACE_X10) / 10);
  return Math.max(DENSITY_RULES.FAMILY_COUNT_MIN, Math.min(DENSITY_RULES.FAMILY_COUNT_MAX, raw));
}

/**
 * Whether a new region seeds a feud at all (D-71): a FEUD_CHANCE roll below FEUD_CHANCE_PCT. Seed with
 * familySeed(regionId) (no timestamp, so the fill request and the reply write agree).
 */
export function feudHappens(seed: bigint): boolean {
  return rollBelow(seed, POOL_ROLL.FEUD_CHANCE, 100n) < BigInt(DENSITY_RULES.FEUD_CHANCE_PCT);
}

/**
 * How many families a region's one feud holds (D-70, D-71): 0 when the feud chance misses
 * (feudHappens) or there are fewer than FEUD_FAMILIES_MIN families; otherwise FEUD_FAMILIES_MIN to
 * FEUD_FAMILIES_MAX by a FEUD_COUNT roll, never more than the families. Seed with familySeed(regionId).
 */
export function feudCountFor(familyCount: number, seed: bigint): number {
  const families = wholeCount(familyCount);
  const min = DENSITY_RULES.FEUD_FAMILIES_MIN;
  if (families < min || !feudHappens(seed)) return 0;
  const span = BigInt(DENSITY_RULES.FEUD_FAMILIES_MAX - min + 1);
  return Math.min(families, min + Number(rollBelow(seed, POOL_ROLL.FEUD_COUNT, span)));
}

/**
 * The keys of a region's feud (D-70): the count clamped to 0..keys.length; the reply's marks first, in
 * mark order (only keys that exist, no repeats) until the count; then the remaining keys by an
 * equal-weight seeded pick (FEUD_PICK + i; entries carry the key's position as the id). A result
 * shorter than FEUD_FAMILIES_MIN is [] (a feud needs two).
 */
export function pickFeud(input: {
  keys: readonly string[];
  markedKeys: readonly string[];
  count: number;
  seed: bigint;
}): string[] {
  const keys = [...new Set(input.keys)];
  const count = Math.min(wholeCount(input.count), keys.length);
  const feud: string[] = [];
  for (const mark of input.markedKeys) {
    if (feud.length >= count) break;
    if (keys.includes(mark) && !feud.includes(mark)) feud.push(mark);
  }
  const rest = keys
    .map((key, i) => ({ itemTemplateId: BigInt(i), weight: 1n, key }))
    .filter((entry) => !feud.includes(entry.key));
  for (const entry of pickWithoutReplacement(rest, count - feud.length, input.seed, POOL_ROLL.FEUD_PICK)) {
    feud.push(entry.key);
  }
  return feud.length < DENSITY_RULES.FEUD_FAMILIES_MIN ? [] : feud;
}

export interface PlaceFamilyCandidate {
  key: string;
  aiFit: boolean;
  terrainFit: boolean;
  placesSoFar: number;
}

/**
 * The families one host place holds (D-67): PLACE_FAMILIES_MIN to PLACE_FAMILIES_MAX by a
 * PLACE_FAMILY_COUNT roll, capped at the candidates. Candidates are sorted by key and given a seeded
 * rank (one PLACE_FAMILY_ORDER roll seeds the shuffle, the creatureHomeLevels pattern), then ordered by
 * fit tier (the AI's fit, then terrain fit, then the rest), then fewest places so far, then the rank.
 * The result does not depend on the input order. Seed with placeFamiliesSeed(regionId, locationId).
 */
export function pickPlaceFamilies(candidates: readonly PlaceFamilyCandidate[], seed: bigint): string[] {
  const tier = (c: PlaceFamilyCandidate): number => (c.aiFit ? 0 : c.terrainFit ? 1 : 2);
  const sorted = [...candidates].sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : tier(a) - tier(b) || a.placesSoFar - b.placesSoFar,
  );
  const unique = sorted.filter((c, i) => i === 0 || sorted[i - 1]!.key !== c.key);
  const n = unique.length;
  const span = BigInt(DENSITY_RULES.PLACE_FAMILIES_MAX - DENSITY_RULES.PLACE_FAMILIES_MIN + 1);
  const target = Math.min(n, DENSITY_RULES.PLACE_FAMILIES_MIN + Number(rollBelow(seed, POOL_ROLL.PLACE_FAMILY_COUNT, span)));

  const order = Array.from({ length: n }, (_, i) => i);
  const shuffleSeed = economyRoll(seed, POOL_ROLL.PLACE_FAMILY_ORDER);
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Number(rollBelow(shuffleSeed, BigInt(i), BigInt(i + 1)));
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }
  const rank = new Array<number>(n).fill(0);
  order.forEach((candidateIndex, r) => {
    rank[candidateIndex] = r;
  });

  return unique
    .map((c, i) => ({ c, rank: rank[i]! }))
    .sort((a, b) => tier(a.c) - tier(b.c) || a.c.placesSoFar - b.c.placesSoFar || a.rank - b.rank)
    .slice(0, target)
    .map((entry) => entry.c.key);
}

export interface RegionFamilyPlace {
  id: bigint;
  name: string;
  terrainType: string;
}

export interface RegionFamilyInput {
  key: string;
  aiFitNames: readonly string[];
  fitTerrains: readonly string[];
}

/**
 * The families of each host place of a new region (D-67). The caller passes only host places (charted,
 * neither safe nor a hub). Places in id order each run pickPlaceFamilies over every family (aiFit: the
 * family's aiFitNames hold the place name exactly; terrainFit: its fitTerrains hold the place terrain,
 * lowercase; placesSoFar from a running tally) with placeFamiliesSeed(regionId, place.id). Then each
 * family placed nowhere (in input order) joins the place with room (fewer than PLACE_FAMILIES_MAX)
 * where it fits best, then the place with the fewest families, then the lowest id; with no room it
 * stays unplaced (a vacuum can still bring it in by terrain, D-20). Every host place is a key.
 */
export function assignRegionFamilies(input: {
  regionId: bigint;
  places: readonly RegionFamilyPlace[];
  families: readonly RegionFamilyInput[];
}): Map<bigint, string[]> {
  const sortedPlaces = [...input.places].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const places = sortedPlaces.filter((place, i) => i === 0 || sortedPlaces[i - 1]!.id !== place.id);
  const aiFit = (family: RegionFamilyInput, place: RegionFamilyPlace): boolean => family.aiFitNames.includes(place.name);
  const terrainFit = (family: RegionFamilyInput, place: RegionFamilyPlace): boolean => {
    const terrain = place.terrainType.trim().toLowerCase();
    return family.fitTerrains.some((fit) => fit.trim().toLowerCase() === terrain);
  };

  const tally = new Map<string, number>();
  const result = new Map<bigint, string[]>();
  for (const place of places) {
    const picked = pickPlaceFamilies(
      input.families.map((family) => ({
        key: family.key,
        aiFit: aiFit(family, place),
        terrainFit: terrainFit(family, place),
        placesSoFar: tally.get(family.key) ?? 0,
      })),
      placeFamiliesSeed(input.regionId, place.id),
    );
    result.set(place.id, picked);
    for (const key of picked) tally.set(key, (tally.get(key) ?? 0) + 1);
  }

  for (const family of input.families) {
    if ((tally.get(family.key) ?? 0) > 0) continue;
    const fit = (place: RegionFamilyPlace): number => (aiFit(family, place) ? 0 : terrainFit(family, place) ? 1 : 2);
    const size = (place: RegionFamilyPlace): number => (result.get(place.id) ?? []).length;
    const best = places
      .filter((place) => size(place) < DENSITY_RULES.PLACE_FAMILIES_MAX)
      .sort((a, b) => fit(a) - fit(b) || size(a) - size(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
    if (!best) continue;
    result.get(best.id)!.push(family.key);
    tally.set(family.key, 1);
  }
  return result;
}
