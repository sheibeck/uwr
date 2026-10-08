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

/**
 * The weight of one candidate item after its admin pin: base * pin / 100, the pin clamped to 0..300.
 * The pin replaces the drop rate for that item's weight only. No pin means 100.
 */
export function itemWeight(baseWeight: bigint, itemPct?: bigint | null): bigint {
  const pct = clampDial('itemDropPct', itemPct === undefined || itemPct === null ? DIAL_RANGES.itemDropPct.def : itemPct).value;
  return (baseWeight * pct) / 100n;
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
 * Each tier is then multiplied by its tier weight (floor). A normal foe's legendary weight is forced to
 * 0 as the very last step, whatever the inputs: legendary is a boss and named-foe reward only.
 */
export function rarityMix(
  level: bigint,
  dangerMultiplier: bigint,
  bossOrNamed: boolean,
  dials: EffectiveDials,
): bigint[] {
  const k = bossOrNamed ? dials.rarityShift + 1n + dials.bossRarityBonus : dials.rarityShift;
  const shifted = shiftMix(baseMix(level, dangerMultiplier), k, bossOrNamed ? LEGENDARY_INDEX : EPIC_INDEX);
  const out = shifted.map((w, i) => (w * dials.tierPct[QUALITY_TIERS[i]!]) / 100n);
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
