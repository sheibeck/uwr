// Economy rules: the one pure module that holds every runtime economy number of Phase 51.3.
//
// Owns (CONTEXT Area 1 and Area 4): the dial ranges, defaults and clamps; how the dial levels combine
// (global, then region, then item pin; tier weights as a separate axis); the rarity mix by enemy level;
// the independent splitmix64 rolls and their fixed indexes; pick counts, gear chance, gold and gather
// yield; the creature profiles; and the composition of the fallback and AI loot tables. The server owns
// every number (SC2, SC5): the stored dials only ever pass through effectiveDials, and every roll reads
// the result.
//
// Callers (later Phase 51.3 plans): the loot plan (helpers/loot.ts), gathering, the /economy admin
// command and reducers, and the region economy apply. None of them re-derives a number.
//
// Purity rule: this module imports only ./mechanical_vocabulary and ./crafting_rules, never a helper,
// the schema or the server package. ES2020 only, never throws, no clock, no source of chance. Every roll
// is a splitmix64 step over a seed built from ctx values, so a re-run transaction replays identically.
// All math is bigint with floor division; no seed is ever converted to Number.
import { QUALITY_TIERS, type QualityTier } from './mechanical_vocabulary';

// ---------------------------------------------------------------------------
// Dial ranges, defaults and clamps
// ---------------------------------------------------------------------------

export interface DialRange {
  readonly min: bigint;
  readonly max: bigint;
  readonly def: bigint;
}

/** The safe range and the default of every dial. The defaults are today's tuning. */
export const DIAL_RANGES = Object.freeze({
  rarityShift: Object.freeze({ min: -2n, max: 2n, def: 0n }),
  dropRatePct: Object.freeze({ min: 0n, max: 300n, def: 100n }),
  goldPct: Object.freeze({ min: 0n, max: 300n, def: 100n }),
  gatherRatePct: Object.freeze({ min: 50n, max: 300n, def: 100n }),
  bossRarityBonus: Object.freeze({ min: 0n, max: 2n, def: 0n }),
  tierPct: Object.freeze({ min: 0n, max: 300n, def: 100n }),
  itemDropPct: Object.freeze({ min: 0n, max: 300n, def: 100n }),
});

export type DialName = keyof typeof DIAL_RANGES;

/** The global dial row as stored: scalar dials, the five tier weights and the AI route switch. */
export interface GlobalDials {
  rarityShift: bigint;
  dropRatePct: bigint;
  goldPct: bigint;
  gatherRatePct: bigint;
  bossRarityBonus: bigint;
  tierCommonPct: bigint;
  tierUncommonPct: bigint;
  tierRarePct: bigint;
  tierEpicPct: bigint;
  tierLegendaryPct: bigint;
  aiEnabled: boolean;
}

/** A region override: each field is absent (undefined or null) to inherit the global value. */
export interface RegionDials {
  rarityShift?: bigint | null;
  dropRatePct?: bigint | null;
  goldPct?: bigint | null;
  gatherRatePct?: bigint | null;
  bossRarityBonus?: bigint | null;
}

/** The dials after combination and clamping; what every roll reads. */
export interface EffectiveDials {
  rarityShift: bigint;
  dropRatePct: bigint;
  goldPct: bigint;
  gatherRatePct: bigint;
  bossRarityBonus: bigint;
  tierPct: Record<QualityTier, bigint>;
}

/** The singleton defaults. A missing dial row means these (a fresh install behaves as today). */
export const DEFAULT_DIALS: Readonly<GlobalDials> = Object.freeze({
  rarityShift: DIAL_RANGES.rarityShift.def,
  dropRatePct: DIAL_RANGES.dropRatePct.def,
  goldPct: DIAL_RANGES.goldPct.def,
  gatherRatePct: DIAL_RANGES.gatherRatePct.def,
  bossRarityBonus: DIAL_RANGES.bossRarityBonus.def,
  tierCommonPct: DIAL_RANGES.tierPct.def,
  tierUncommonPct: DIAL_RANGES.tierPct.def,
  tierRarePct: DIAL_RANGES.tierPct.def,
  tierEpicPct: DIAL_RANGES.tierPct.def,
  tierLegendaryPct: DIAL_RANGES.tierPct.def,
  aiEnabled: false,
});

/**
 * Clamps one dial value to its safe range. Never throws: a value that is not a bigint gives the
 * dial's default with clamped true. `clamped` is true whenever the returned value differs from the input.
 */
export function clampDial(name: DialName, value: unknown): { value: bigint; clamped: boolean } {
  const range = DIAL_RANGES[name];
  if (typeof value !== 'bigint') return { value: range.def, clamped: true };
  if (value < range.min) return { value: range.min, clamped: true };
  if (value > range.max) return { value: range.max, clamped: true };
  return { value, clamped: false };
}

/**
 * The dials one roll reads: per scalar dial, the region value when present, else the global value,
 * then clamped. A region value REPLACES the global one, it never multiplies it. The tier weights come
 * from the five global tier columns, clamped; they are a separate axis that multiplies the rarity mix.
 * A missing or partial global falls back to the defaults.
 */
export function effectiveDials(
  global: Partial<GlobalDials> | null | undefined,
  region?: RegionDials | null,
): EffectiveDials {
  const g = global ?? {};
  const r = region ?? {};
  const pick = (name: 'rarityShift' | 'dropRatePct' | 'goldPct' | 'gatherRatePct' | 'bossRarityBonus'): bigint => {
    const regional = r[name];
    const raw = regional !== undefined && regional !== null ? regional : g[name] !== undefined ? g[name] : DEFAULT_DIALS[name];
    return clampDial(name, raw).value;
  };
  const tier = (v: bigint | undefined): bigint => clampDial('tierPct', v === undefined ? DIAL_RANGES.tierPct.def : v).value;
  return {
    rarityShift: pick('rarityShift'),
    dropRatePct: pick('dropRatePct'),
    goldPct: pick('goldPct'),
    gatherRatePct: pick('gatherRatePct'),
    bossRarityBonus: pick('bossRarityBonus'),
    tierPct: {
      common: tier(g.tierCommonPct),
      uncommon: tier(g.tierUncommonPct),
      rare: tier(g.tierRarePct),
      epic: tier(g.tierEpicPct),
      legendary: tier(g.tierLegendaryPct),
    },
  };
}

/** The clamped percent of one item pin; no pin (undefined or null) is 100. */
export function pinPct(itemPct?: bigint | null): bigint {
  return clampDial('itemDropPct', itemPct === undefined || itemPct === null ? DIAL_RANGES.itemDropPct.def : itemPct).value;
}

/**
 * The weight of one candidate item after its admin pin: base * pin, the pin clamped to 0..300. There is
 * no division (review CR-01: base * pin / 100 floored a weight of 1 to 0 at 50% and left it unchanged
 * at 150%), so the result is on a x100 scale: compare it only with other weights that also passed
 * through itemWeight. pinWeights does the same for a whole pool and keeps unpinned weights as they are.
 */
export function itemWeight(baseWeight: bigint, itemPct?: bigint | null): bigint {
  return baseWeight * pinPct(itemPct);
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const r = x % y;
    x = y;
    y = r;
  }
  return x;
}

/**
 * Each weight times its percent, exactly. The percents of the weights that count (both above 0) are
 * first divided by their greatest common divisor, so the ratios are kept with no rounding and equal
 * percents leave the weights as they are (the default dials change no roll). A weight or percent of 0
 * (or below) gives 0. Review CR-01: the picks normalize by the total, so no division is needed.
 */
export function scaleWeights(weights: readonly bigint[], pcts: readonly bigint[]): bigint[] {
  let g = 0n;
  weights.forEach((w, i) => {
    const p = pcts[i] ?? 0n;
    if (w > 0n && p > 0n) g = gcd(g, p);
  });
  return weights.map((w, i) => {
    const p = pcts[i] ?? 0n;
    return w > 0n && p > 0n && g > 0n ? w * (p / g) : 0n;
  });
}

/**
 * A pool with the admin item pins applied to every entry at once (scaleWeights over the clamped pins),
 * other fields kept. With no pin in the pool the weights are unchanged; a pin at 50 halves its entry
 * against the rest, even when that entry's weight is 1.
 */
export function pinWeights<T extends { itemTemplateId: bigint; weight: bigint }>(
  entries: readonly T[],
  pins: ReadonlyMap<bigint, bigint>,
): T[] {
  const scaled = scaleWeights(
    entries.map((e) => e.weight),
    entries.map((e) => pinPct(pins.get(e.itemTemplateId))),
  );
  return entries.map((e, i) => ({ ...e, weight: scaled[i]! }));
}

// ---------------------------------------------------------------------------
// Rolls and seeds
// ---------------------------------------------------------------------------

/**
 * The fixed roll index of every independent roll. One seed, many indexes: a gear drop's rarity never
 * follows its gear roll (the old code rolled both from the same number shifted by a constant). Never
 * add an offset to a raw timestamp; add an index here. PICK_BASE uses 2..9 and AI_TABLE_PICK_BASE 41..43.
 */
export const ROLL_INDEX = Object.freeze({
  PICK_COUNT: 1n,
  PICK_BASE: 2n,
  GEAR_CHANCE: 10n,
  GEAR_PICK: 11n,
  RARITY: 12n,
  CRAFT_QUALITY: 13n,
  AFFIX: 14n,
  GOLD: 20n,
  ESSENCE: 21n,
  MODIFIER: 22n,
  SCROLL: 23n,
  SCROLL_PICK: 24n,
  MODIFIER_PICK: 25n,
  GATHER_QTY: 30n,
  AI_TABLE_COUNT: 40n,
  AI_TABLE_PICK_BASE: 41n,
});

/**
 * Roll number `index` of a seed: the splitmix64 step of salvageRoll (data/crafting_rules.ts, reviewed
 * as IN-02), returning the full 64-bit value instead of a percent.
 */
export function economyRoll(seed: bigint, index: bigint): bigint {
  let z = BigInt.asUintN(64, seed + (index + 1n) * 0x9e3779b97f4a7c15n);
  z = BigInt.asUintN(64, (z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n);
  z = BigInt.asUintN(64, (z ^ (z >> 27n)) * 0x94d049bb133111ebn);
  return z ^ (z >> 31n);
}

/** economyRoll below n (0 up to n - 1); 0n when n is not positive. */
export function rollBelow(seed: bigint, index: bigint, n: bigint): bigint {
  if (n <= 0n) return 0n;
  return economyRoll(seed, index) % n;
}

/**
 * The roll seed of one enemy's loot for one character: the server timestamp, the character id and the
 * combat_enemy row id. Two enemies of one template in the same fight have different row ids, so they
 * roll differently (the old seed was timestamp plus character id for all of them).
 */
export function lootSeed(tsMicros: bigint, characterId: bigint, combatEnemyId: bigint): bigint {
  return BigInt.asUintN(64, tsMicros * 1000003n + characterId * 7919n + combatEnemyId * 104729n);
}

/** The seed of a region's table composition for one enemy template (AI loot tables). */
export function regionTableSeed(regionId: bigint, enemyTemplateId: bigint): bigint {
  return BigInt.asUintN(64, regionId * 1000003n + enemyTemplateId * 7919n);
}

// ---------------------------------------------------------------------------
// Rarity mix
// ---------------------------------------------------------------------------

const EPIC_INDEX = 3;
const LEGENDARY_INDEX = 4;

/**
 * The rarity rows of helpers/items.ts TIER_RARITY_WEIGHTS ([common, uncommon, rare, epic] per world
 * tier), copied as bigints so this module stays pure. The parity test pins the copy to the original.
 */
const TIER_ROWS: Readonly<Record<number, readonly [bigint, bigint, bigint, bigint]>> = Object.freeze({
  1: [95n, 5n, 0n, 0n],
  2: [60n, 30n, 9n, 1n],
  3: [35n, 35n, 25n, 5n],
  4: [20n, 35n, 35n, 10n],
  5: [10n, 20n, 40n, 30n],
});

/** The world tier of an enemy level: L1-10 is 1, then 2 up to 20, 3 up to 30, 4 up to 40, else 5. */
function worldTierOf(level: bigint): number {
  if (level <= 10n) return 1;
  if (level <= 20n) return 2;
  if (level <= 30n) return 3;
  if (level <= 40n) return 4;
  return 5;
}

/**
 * The rarity mix of today's rules, as five weights summing to 100 in QUALITY_TIERS order (common,
 * uncommon, rare, epic, legendary). At default dials this IS the old rollQualityTier distribution:
 *   T1 (level 1-10): [100 - u, u, 0, 0, 0], u = min(35, min(30, 5 * level) + db),
 *     db = floor((danger - 120) / 10) when danger > 120, else 0.
 *   T2+ : [wC - b, wU, wR, wE + b, 0], b = min(10, max(0, floor((danger - 120) / 15))).
 * Legendary is always 0 here; only a boss or named shift reaches it (rarityMix).
 */
export function baseMix(level: bigint, dangerMultiplier: bigint): bigint[] {
  const tier = worldTierOf(level);
  if (tier === 1) {
    const levelPct = level * 5n < 30n ? level * 5n : 30n;
    const db = dangerMultiplier > 120n ? (dangerMultiplier - 120n) / 10n : 0n;
    let u = (levelPct < 0n ? 0n : levelPct) + db;
    if (u > 35n) u = 35n;
    return [100n - u, u, 0n, 0n, 0n];
  }
  const row = TIER_ROWS[tier] ?? TIER_ROWS[1]!;
  let b = dangerMultiplier > 120n ? (dangerMultiplier - 120n) / 15n : 0n;
  if (b > 10n) b = 10n;
  return [row[0] - b, row[1], row[2], row[3] + b, 0n];
}

/**
 * A copy of the mix with every tier's weight moved k tiers up (k below zero moves down). A weight
 * that would pass the cap piles on tier `capIndex`; one that would go below common piles on common.
 */
export function shiftMix(mix: readonly bigint[], k: bigint, capIndex: number): bigint[] {
  const out: bigint[] = [0n, 0n, 0n, 0n, 0n];
  const cap = BigInt(capIndex);
  for (let i = 0; i < mix.length && i < out.length; i += 1) {
    let target = BigInt(i) + k;
    if (target > cap) target = cap;
    if (target < 0n) target = 0n;
    out[Number(target)] += mix[i]!;
  }
  return out;
}

/**
 * The mix one kill rolls its gear rarity from, after the dials.
 *  - A normal foe shifts by the rarity dial, capped at epic.
 *  - A boss or named foe shifts by the rarity dial plus a built-in +1 ("better for bosses and named
 *    foes", SC2) plus the boss bonus, capped at legendary.
 * Each tier is then multiplied by its tier weight with exact ratios (scaleWeights, review CR-01: epic at
 * 50% halves epic instead of removing it). The total is no longer always 100; rollRarity normalizes.
 * A normal foe's legendary weight is forced to 0 as the very last step, whatever the inputs: legendary
 * is a boss and named-foe reward only.
 */
export function rarityMix(
  level: bigint,
  dangerMultiplier: bigint,
  bossOrNamed: boolean,
  dials: EffectiveDials,
): bigint[] {
  const k = bossOrNamed ? dials.rarityShift + 1n + dials.bossRarityBonus : dials.rarityShift;
  const shifted = shiftMix(baseMix(level, dangerMultiplier), k, bossOrNamed ? LEGENDARY_INDEX : EPIC_INDEX);
  const out = scaleWeights(shifted, QUALITY_TIERS.map((tier) => dials.tierPct[tier]));
  if (!bossOrNamed) out[LEGENDARY_INDEX] = 0n;
  return out;
}

/** The rarity for one roll: walks the cumulative weights. An all-zero mix gives 'common'. */
export function rollRarity(mix: readonly bigint[], seed: bigint): QualityTier {
  let total = 0n;
  for (const w of mix) total += w > 0n ? w : 0n;
  if (total <= 0n) return 'common';
  const r = rollBelow(seed, ROLL_INDEX.RARITY, total);
  let cumulative = 0n;
  for (let i = 0; i < QUALITY_TIERS.length; i += 1) {
    const w = mix[i] ?? 0n;
    cumulative += w > 0n ? w : 0n;
    if (r < cumulative) return QUALITY_TIERS[i]!;
  }
  return 'common';
}

/**
 * Neck and earrings that carry no armor never drop plain common: they lift to uncommon (the rule of
 * today's loot generator, moved here so the loot plan uses it). Everything else keeps its rarity.
 */
export function jewelryFloor(slot: string, armorClassBonus: bigint, rarity: string): string {
  if ((slot === 'neck' || slot === 'earrings') && armorClassBonus === 0n && rarity === 'common') return 'uncommon';
  return rarity;
}

// ---------------------------------------------------------------------------
// Creature profiles
// ---------------------------------------------------------------------------

export type CreatureKey = 'animal' | 'beast' | 'humanoid' | 'undead' | 'spirit' | 'construct';

export interface CreatureProfile {
  readonly key: CreatureKey;
  /** The base gear chance in percent (plus min(25, 2 * level)). */
  readonly gearChance: bigint;
  readonly goldMin: bigint;
  readonly goldMax: bigint;
  /** The MATERIAL_DEFS dropCreatureTypes this creature can leave behind. */
  readonly dropTypes: readonly string[];
}

/**
 * The last seeded pre-v2.0 per-creature numbers (git 9ac55586^, seeding/ensure_enemies.ts), the
 * fallback when an enemy has no AI loot table. Gear chance is the old gearChance column.
 */
export const CREATURE_PROFILES: Readonly<Record<CreatureKey, CreatureProfile>> = Object.freeze({
  animal: Object.freeze({ key: 'animal', gearChance: 10n, goldMin: 0n, goldMax: 2n, dropTypes: Object.freeze(['animal', 'beast']) }),
  beast: Object.freeze({ key: 'beast', gearChance: 15n, goldMin: 0n, goldMax: 3n, dropTypes: Object.freeze(['beast', 'animal']) }),
  humanoid: Object.freeze({ key: 'humanoid', gearChance: 25n, goldMin: 2n, goldMax: 6n, dropTypes: Object.freeze(['humanoid']) }),
  undead: Object.freeze({ key: 'undead', gearChance: 20n, goldMin: 1n, goldMax: 4n, dropTypes: Object.freeze(['undead']) }),
  spirit: Object.freeze({ key: 'spirit', gearChance: 20n, goldMin: 1n, goldMax: 4n, dropTypes: Object.freeze(['spirit', 'construct']) }),
  construct: Object.freeze({ key: 'construct', gearChance: 20n, goldMin: 1n, goldMax: 4n, dropTypes: Object.freeze(['construct']) }),
});

/**
 * Reconciles the world-gen creatureType enum (beast, undead, humanoid, elemental, construct,
 * aberration) with the material drop types (animal, spirit). elemental and aberration map to spirit;
 * anything unknown, empty or not a string maps to beast. Case-insensitive.
 */
const CREATURE_ALIASES: Readonly<Record<string, CreatureKey>> = Object.freeze({
  animal: 'animal',
  beast: 'beast',
  humanoid: 'humanoid',
  undead: 'undead',
  spirit: 'spirit',
  construct: 'construct',
  elemental: 'spirit',
  aberration: 'spirit',
});

export function canonicalCreature(type: unknown): CreatureKey {
  const key = typeof type === 'string' ? type.trim().toLowerCase() : '';
  return Object.prototype.hasOwnProperty.call(CREATURE_ALIASES, key) ? CREATURE_ALIASES[key]! : 'beast';
}

export function creatureProfile(type: unknown): CreatureProfile {
  return CREATURE_PROFILES[canonicalCreature(type)];
}

// ---------------------------------------------------------------------------
// Counts, chances, gold and gather yield
// ---------------------------------------------------------------------------

/** Today's essence and modifier-reagent chances per kill, in percent (scaled by the drop rate). */
export const ESSENCE_CHANCE_PCT = 6n;
export const MODIFIER_CHANCE_PCT = 10n;
/** The base chance in percent that a boss or named foe drops a recipe scroll, before the drop rate.
 * 10% (owner, 2026-10-08: "I don't want recipe scrolls to be too easy. 25% seems like they might drop too often."). */
export const SCROLL_DROP_BASE_PCT = 10n;
/** Which scroll rarity is picked, before the tier weights: rare 6, epic 3, legendary 1. */
export const SCROLL_TIER_WEIGHTS = Object.freeze({ rare: 6n, epic: 3n, legendary: 1n });

/**
 * How many common picks one kill makes: dropPct / 100, plus one more when a roll below 100 is under
 * the remainder. Exactly 1 at 100%, 0 at 0%, 3 at 300%.
 */
export function pickCount(seed: bigint, dropPct: bigint): bigint {
  const pct = clampDial('dropRatePct', dropPct).value;
  const whole = pct / 100n;
  return rollBelow(seed, ROLL_INDEX.PICK_COUNT, 100n) < pct % 100n ? whole + 1n : whole;
}

/** The chance in percent that a kill also drops gear: (profile base + min(25, 2 * level)) scaled by the drop rate, at most 100. */
export function gearChancePct(profile: CreatureProfile, level: bigint, dropPct: bigint): bigint {
  const pct = clampDial('dropRatePct', dropPct).value;
  const levelPart = 2n * level < 25n ? 2n * level : 25n;
  const raw = ((profile.gearChance + (levelPart > 0n ? levelPart : 0n)) * pct) / 100n;
  return raw > 100n ? 100n : raw;
}

/** The gold of one kill: (goldMin + a roll over the range + level) * goldPct / 100, floored. The level counts as at least 1. */
export function goldReward(profile: CreatureProfile, level: bigint, seed: bigint, goldPct: bigint): bigint {
  const pct = clampDial('goldPct', goldPct).value;
  const span = profile.goldMax - profile.goldMin + 1n;
  const lvl = level > 1n ? level : 1n;
  return ((profile.goldMin + rollBelow(seed, ROLL_INDEX.GOLD, span) + lvl) * pct) / 100n;
}

/** The quantity of one gather after the gather dial: max(1, qty * rate / 100), the rate clamped to 50..300. */
export function gatherYield(qty: bigint, gatherRatePct: bigint): bigint {
  const pct = clampDial('gatherRatePct', gatherRatePct).value;
  const scaled = (qty * pct) / 100n;
  return scaled > 1n ? scaled : 1n;
}

/**
 * Whether a percent chance hits at roll `index` once an admin item pin is applied. With no pin (100)
 * it is exactly the plain roll, rollBelow(seed, index, 100) < chancePct, so an unpinned drop rolls as
 * before. A pin rolls in basis points instead, so the chance is chancePct x pin / 100 with no rounding
 * to whole percents (a 6% drop pinned at 50 is 3%, at 150 it is 9%; a 1% drop pinned at 50 is 0.5%).
 * A pin of 0 never hits. Review A WR-04: essences and modifier reagents read the pins too.
 */
export function pinnedChanceHit(seed: bigint, index: bigint, chancePct: bigint, itemPct?: bigint | null): boolean {
  const pin = pinPct(itemPct);
  if (pin === 100n) return rollBelow(seed, index, 100n) < chancePct;
  return rollBelow(seed, index, 10000n) < chancePct * pin;
}

/** A chance in percent scaled by the drop rate, at most 100. */
export function scaledChancePct(basePct: bigint, dropPct: bigint): bigint {
  const pct = clampDial('dropRatePct', dropPct).value;
  const raw = (basePct * pct) / 100n;
  return raw > 100n ? 100n : raw;
}

/** The material tier a zone supports, from its danger multiplier (the spawnResourceNode rule): below 130 is 1, below 190 is 2, else 3. */
export function zoneTierOf(dangerMultiplier: bigint): bigint {
  if (dangerMultiplier < 130n) return 1n;
  if (dangerMultiplier < 190n) return 2n;
  return 3n;
}

// ---------------------------------------------------------------------------
// Weighted picks
// ---------------------------------------------------------------------------

export interface WeightedEntry {
  itemTemplateId: bigint;
  weight: bigint;
}

function byIdThenWeight(a: WeightedEntry, b: WeightedEntry): number {
  if (a.itemTemplateId !== b.itemTemplateId) return a.itemTemplateId < b.itemTemplateId ? -1 : 1;
  return a.weight === b.weight ? 0 : a.weight > b.weight ? -1 : 1;
}

/**
 * One weighted pick. Candidates sort by template id first, so shuffling the input never changes the
 * result; weight-0 entries are skipped; null when the total weight is 0.
 */
export function pickWeighted<T extends WeightedEntry>(entries: readonly T[], seed: bigint, index: bigint): T | null {
  const pool = entries.filter((e) => e.weight > 0n).sort(byIdThenWeight);
  let total = 0n;
  for (const e of pool) total += e.weight;
  if (total <= 0n) return null;
  const r = rollBelow(seed, index, total);
  let cumulative = 0n;
  for (const e of pool) {
    cumulative += e.weight;
    if (r < cumulative) return e;
  }
  return pool[pool.length - 1] ?? null;
}

/**
 * Up to `count` weighted picks without replacement; pick i rolls at index baseIndex + i, and a picked
 * id leaves the pool. Sorted by template id first (the heaviest wins a repeated id), so the input
 * order never matters. Fewer picks come back when the pool runs out.
 */
export function pickWithoutReplacement<T extends WeightedEntry>(
  entries: readonly T[],
  count: number,
  seed: bigint,
  baseIndex: bigint,
): T[] {
  const sorted = entries.filter((e) => e.weight > 0n).sort(byIdThenWeight);
  const pool: T[] = [];
  for (const e of sorted) {
    if (pool.length === 0 || pool[pool.length - 1]!.itemTemplateId !== e.itemTemplateId) pool.push(e);
  }
  const picked: T[] = [];
  for (let i = 0; i < count; i += 1) {
    const pick = pickWeighted(pool, seed, baseIndex + BigInt(i));
    if (!pick) break;
    picked.push(pick);
    pool.splice(pool.indexOf(pick), 1);
  }
  return picked;
}

// ---------------------------------------------------------------------------
// Fallback loot (no AI table yet): junk, drop materials, own-region materials, level-fit gear
// ---------------------------------------------------------------------------

/** The weights of the fallback pools: the old seed weights for gear, junk 10, materials 6. */
export const FALLBACK_WEIGHTS = Object.freeze({
  junk: 10n,
  material: 6n,
  regionMaterial: 6n,
  gearCommon: 6n,
  gearUncommon: 3n,
  gearRare: 1n,
  gearJewelry: 1n,
});

export interface FallbackPoolInput {
  /** Every junk template (JUNK_DEFS); present in every world, so the pool is never empty. */
  junk: ReadonlyArray<{ itemTemplateId: bigint }>;
  /** The MATERIAL_DEFS templates, resolved to template ids. */
  materials: ReadonlyArray<{
    itemTemplateId: bigint;
    tier: bigint;
    sources: readonly string[];
    dropCreatureTypes?: readonly string[];
  }>;
  /** The materials of the enemy's OWN region only (the caller filters; another region's are never passed). */
  regionMaterials: ReadonlyArray<{ itemTemplateId: bigint; role: string; rarity: string }>;
  creatureType: unknown;
  zoneTier: bigint;
}

/**
 * The fallback "common pick" pool of one creature: all junk at 10; the drop materials whose creature
 * types meet the profile's drop types and whose tier is at most the zone tier at 6; and the own-region
 * gather or drop materials of common or uncommon rarity at 6. One entry per template id.
 */
export function fallbackCommonPool(input: FallbackPoolInput): (WeightedEntry & { role: string })[] {
  const profile = creatureProfile(input.creatureType);
  const pool: (WeightedEntry & { role: string })[] = [];
  const seen = new Set<bigint>();
  const add = (itemTemplateId: bigint, weight: bigint, role: string): void => {
    if (seen.has(itemTemplateId)) return;
    seen.add(itemTemplateId);
    pool.push({ itemTemplateId, weight, role });
  };
  for (const j of input.junk) add(j.itemTemplateId, FALLBACK_WEIGHTS.junk, 'junk');
  for (const m of input.materials) {
    if (!m.sources.includes('drop')) continue;
    if (m.tier > input.zoneTier) continue;
    const types = m.dropCreatureTypes ?? [];
    if (!types.some((t) => profile.dropTypes.includes(t))) continue;
    add(m.itemTemplateId, FALLBACK_WEIGHTS.material, 'material');
  }
  for (const m of input.regionMaterials) {
    if (m.role !== 'gather' && m.role !== 'drop') continue;
    if (m.rarity !== 'common' && m.rarity !== 'uncommon') continue;
    add(m.itemTemplateId, FALLBACK_WEIGHTS.regionMaterial, 'regionMaterial');
  }
  return pool.sort(byIdThenWeight);
}

/**
 * The weight of one gear template in the fallback gear pool, by its real rarity (review A WR-05): common
 * 6, uncommon 3, rare 1, epic and legendary 0 (never a free fallback drop; the dropped quality is
 * rolled separately from the rarity mix). Jewelry (neck, earrings) is 1 up to rare. An unknown rarity
 * string reads as common.
 */
export function gearPoolWeight(gear: { slot: string; rarity: string }): bigint {
  if (gear.rarity === 'epic' || gear.rarity === 'legendary') return 0n;
  if (gear.slot === 'neck' || gear.slot === 'earrings') return FALLBACK_WEIGHTS.gearJewelry;
  if (gear.rarity === 'rare') return FALLBACK_WEIGHTS.gearRare;
  if (gear.rarity === 'uncommon') return FALLBACK_WEIGHTS.gearUncommon;
  return FALLBACK_WEIGHTS.gearCommon;
}

/**
 * Whether an item_template name is a quest reward's (review A WR-05). Quest reward templates carry no
 * origin tag; reducers/quests.ts questRewardItemName names them the quest's rewardItemName, or, when
 * that name is taken, "<NPC>'s <name>" or "Quest-won <name>", then numbered " 2", " 3" and so on.
 * `bases` holds the lowercase rewardItemName of every quest template; `seeded` the lowercase names of
 * seeded gear, which keep their place when a quest only borrowed the name (the reward then got a stem).
 * Case-insensitive, as the name lookups are.
 */
export function isQuestRewardName(name: unknown, bases: ReadonlySet<string>, seeded: ReadonlySet<string>): boolean {
  const n = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').toLowerCase() : '';
  if (n === '' || bases.size === 0) return false;
  if (bases.has(n)) return !seeded.has(n);
  const core = n.replace(/ \d+$/, '');
  if (core.startsWith('quest-won ') && bases.has(core.slice('quest-won '.length))) return true;
  let at = core.indexOf("'s ");
  while (at !== -1) {
    if (bases.has(core.slice(at + 3))) return true;
    at = core.indexOf("'s ", at + 1);
  }
  return false;
}

// ---------------------------------------------------------------------------
// AI loot table composition (the server owns the count; the model supplies only the items)
// ---------------------------------------------------------------------------

export const AI_LOOT_WEIGHTS = Object.freeze({
  drop: 40n,
  trophy: 25n,
  gear: 10n,
  gatherable: 15n,
});

export interface AiLootEntry {
  itemTemplateId: bigint;
  role: 'drop' | 'trophy' | 'gear' | 'gatherable';
  weight: bigint;
}

/**
 * The 4 to 6 entries of one enemy's AI loot table: its drop (40), its trophy (25), its gear (10) and
 * 1 to 3 of the region's gatherables (15 each). The gatherable count and which ones come from a seed of
 * the region and the enemy template, so it is the same every time; it is capped at the gatherables given.
 */
export function aiLootTable(
  regionId: bigint,
  enemyTemplateId: bigint,
  ids: { dropId: bigint; trophyId: bigint; gearId: bigint; gatherableIds: readonly bigint[] },
): AiLootEntry[] {
  const seed = regionTableSeed(regionId, enemyTemplateId);
  const available = ids.gatherableIds.length;
  const wanted = 1 + Number(rollBelow(seed, ROLL_INDEX.AI_TABLE_COUNT, 3n));
  const count = wanted < available ? wanted : available;
  const gatherables = pickWithoutReplacement(
    ids.gatherableIds.map((id) => ({ itemTemplateId: id, weight: AI_LOOT_WEIGHTS.gatherable })),
    count,
    seed,
    ROLL_INDEX.AI_TABLE_PICK_BASE,
  );
  const out: AiLootEntry[] = [
    { itemTemplateId: ids.dropId, role: 'drop', weight: AI_LOOT_WEIGHTS.drop },
    { itemTemplateId: ids.trophyId, role: 'trophy', weight: AI_LOOT_WEIGHTS.trophy },
    { itemTemplateId: ids.gearId, role: 'gear', weight: AI_LOOT_WEIGHTS.gear },
  ];
  for (const g of gatherables) out.push({ itemTemplateId: g.itemTemplateId, role: 'gatherable', weight: g.weight });
  return out;
}
