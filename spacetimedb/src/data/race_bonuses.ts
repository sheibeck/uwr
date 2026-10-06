// Race stat bonuses: one pure rule shared by finalizeCharacter, both level-up sites
// (apply_level_up and the admin level_character) and the client character sheet, so the
// projection the player sees and the stats the server stores can never drift.
// Imports only ./class_stats so the client can reach it through @game-data. Browser-safe,
// ES2020 only, never throws.
import { BASE_STAT, computeBaseStatsForGenerated, detectPrimarySecondary } from './class_stats';
import type { StatKey } from './class_stats';

const STAT_KEYS: readonly StatKey[] = ['str', 'dex', 'cha', 'wis', 'int'];

/** Mirrors validateRaceReply: primary 1..3, secondary 1..2. Older stored rows are re-clamped. */
export const RACE_PRIMARY_BONUS_MAX = 3n;
export const RACE_SECONDARY_BONUS_MAX = 2n;

export interface RaceStatBonus {
  stat: StatKey;
  value: bigint;
}

export interface ParsedRaceBonuses {
  primary: RaceStatBonus | null;
  secondary: RaceStatBonus | null;
  flavor: string | null;
}

export interface CreationStats {
  stats: Record<StatKey, bigint>;
  raceBonus: Record<StatKey, bigint>;
}

export interface StatBlock {
  str: bigint;
  dex: bigint;
  cha: bigint;
  wis: bigint;
  int: bigint;
}

function isStatKey(v: unknown): v is StatKey {
  return typeof v === 'string' && (STAT_KEYS as readonly string[]).indexOf(v) !== -1;
}

function readBonus(raw: unknown, max: bigint): RaceStatBonus | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { stat, value } = raw as { stat?: unknown; value?: unknown };
  if (!isStatKey(stat) || typeof value !== 'number' || !Number.isFinite(value)) return null;
  const whole = BigInt(Math.trunc(value));
  if (whole <= 0n) return null;
  return { stat, value: whole > max ? max : whole };
}

export function parseRaceBonuses(json: string | null | undefined): ParsedRaceBonuses {
  const empty: ParsedRaceBonuses = { primary: null, secondary: null, flavor: null };
  if (typeof json !== 'string' || json.length === 0) return empty;
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return empty;
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return empty;
  const obj = data as { primary?: unknown; secondary?: unknown; flavor?: unknown };
  const flavor = typeof obj.flavor === 'string' && obj.flavor.trim().length > 0 ? obj.flavor.trim() : null;
  return {
    primary: readBonus(obj.primary, RACE_PRIMARY_BONUS_MAX),
    secondary: readBonus(obj.secondary, RACE_SECONDARY_BONUS_MAX),
    flavor,
  };
}

function zeroStats(): Record<StatKey, bigint> {
  return { str: 0n, dex: 0n, cha: 0n, wis: 0n, int: 0n };
}

export function raceBonusDelta(json: string | null | undefined): Record<StatKey, bigint> {
  const delta = zeroStats();
  const parsed = parseRaceBonuses(json);
  for (const b of [parsed.primary, parsed.secondary]) {
    if (b !== null) delta[b.stat] += b.value;
  }
  return delta;
}

/**
 * Final stats for a new character: class base plus race bonus. A primary that is not a stat
 * key means no class bonus yet (projection before the class exists); a secondary that is not
 * a stat key (including 'none') boosts only the primary.
 */
export function computeCreationStats(
  primaryStat: string | null | undefined,
  secondaryStat: string | null | undefined,
  raceBonusesJson: string | null | undefined,
): CreationStats {
  const primary = isStatKey(primaryStat) ? primaryStat : undefined;
  const secondary = isStatKey(secondaryStat) ? secondaryStat : undefined;
  const stats = primary
    ? computeBaseStatsForGenerated(primary, secondary, 1n)
    : { str: BASE_STAT, dex: BASE_STAT, cha: BASE_STAT, wis: BASE_STAT, int: BASE_STAT };
  const raceBonus = raceBonusDelta(raceBonusesJson);
  for (const key of STAT_KEYS) stats[key] += raceBonus[key];
  return { stats, raceBonus };
}

/**
 * Level-up rebuild that keeps the race bonus (D1): remove the bonus before primary/secondary
 * detection, rebuild from the class at `level`, add the bonus back. With no usable bonus the
 * delta is all zero and this is exactly the plain class rebuild.
 */
export function levelUpBaseStats(
  character: StatBlock,
  level: bigint,
  raceBonusesJson: string | null | undefined,
): CreationStats {
  const raceBonus = raceBonusDelta(raceBonusesJson);
  const detection = {
    str: character.str - raceBonus.str,
    dex: character.dex - raceBonus.dex,
    cha: character.cha - raceBonus.cha,
    wis: character.wis - raceBonus.wis,
    int: character.int - raceBonus.int,
  };
  const { primary, secondary } = detectPrimarySecondary(detection);
  const stats = computeBaseStatsForGenerated(primary, secondary, level);
  for (const key of STAT_KEYS) stats[key] += raceBonus[key];
  return { stats, raceBonus };
}
