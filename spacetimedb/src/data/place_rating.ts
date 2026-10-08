// place_rating.ts
// The one shared place safety rating rule of Phase 51.3.1.1 (UI-SPEC "Rating rule", D-08, D-34).
// Shared by the client (`@game-data/place_rating`: header, Here card, exits, chips, Map, encounter foot)
// and the server (look text, World event names), so no two surfaces ever disagree (UI-SPEC P2).
//
// Pure module: no ctx, no clock, no randomness. Every number comes from DENSITY_RULES (integer tenths,
// no floats); Phase 52.5 tunes them there.

import { DENSITY_RULES } from './density_rules';

export const RATING_KEYS = ['safe', 'quiet', 'risky', 'deadly', 'unknown'] as const;
export type RatingKey = (typeof RATING_KEYS)[number];

/** Short labels. The long rating lines live in density_lines.ts. */
export const RATING_WORDS: Record<RatingKey, string> = {
  safe: 'Safe',
  quiet: 'Quiet',
  risky: 'Risky',
  deadly: 'Deadly',
  unknown: 'Unknown',
};

/** The word an uncharted place shows (existing copy). */
const UNCHARTED_WORD = 'Danger unknown';

export interface RatingFamily {
  /** The family's public density level, 0..3. */
  level: number;
  /** The family's top level. */
  lvHi: bigint;
}

export interface PlaceRatingInput {
  isSafe: boolean;
  isUncharted?: boolean;
  /** False while the place's pool rows have not applied yet: the rating is Unknown, never Safe. */
  ready: boolean;
  families: readonly RatingFamily[];
  /** The viewer's level (or the party's lowest level, D-56). */
  playerLevel: bigint;
  /** A living boss or named enemy at the place raises the rating one step (D-34). */
  bossOrNamedHere?: boolean;
}

/** The weight of one family in tenths, by its gap to the player (family top level minus player level). */
function weightX10(gap: number): number {
  for (const band of DENSITY_RULES.RATING_WEIGHT_X10) {
    if (gap <= band.maxGap) return band.w;
  }
  return DENSITY_RULES.RATING_WEIGHT_ABOVE_X10;
}

const STEP_UP: Record<'quiet' | 'risky' | 'deadly', 'quiet' | 'risky' | 'deadly'> = {
  quiet: 'risky',
  risky: 'deadly',
  deadly: 'deadly',
};

/**
 * The rating of a place for one viewer. Safe for a safe place, 'Danger unknown' for an uncharted one,
 * Unknown (no word) while the rows are not ready, otherwise Quiet / Risky / Deadly from
 * sum(density level x weight(gap)). A non-safe place with every family wiped out reads Quiet (B3).
 */
export function placeRating(input: PlaceRatingInput): { key: RatingKey; word: string } {
  if (input.isSafe) return { key: 'safe', word: RATING_WORDS.safe };
  if (input.isUncharted) return { key: 'unknown', word: UNCHARTED_WORD };
  if (!input.ready) return { key: 'unknown', word: '' };

  let scoreX10 = 0;
  for (const family of input.families) {
    const level = Math.max(0, Math.floor(Number(family.level)));
    if (level === 0) continue;
    const gap = Number(family.lvHi - input.playerLevel);
    scoreX10 += level * weightX10(gap);
  }

  let key: 'quiet' | 'risky' | 'deadly';
  if (scoreX10 <= DENSITY_RULES.RATING_QUIET_MAX_X10) key = 'quiet';
  else if (scoreX10 <= DENSITY_RULES.RATING_RISKY_MAX_X10) key = 'risky';
  else key = 'deadly';

  if (input.bossOrNamedHere) key = STEP_UP[key];
  return { key, word: RATING_WORDS[key] };
}

/**
 * The level range shown beside the rating (`Lv a-b`). Wiped-out families still count: the range
 * describes who lives there. Null when the place has no families.
 */
export function ratingLevelRange(
  families: readonly { lvLo: bigint; lvHi: bigint }[],
): { lo: bigint; hi: bigint } | null {
  if (families.length === 0) return null;
  let lo = families[0]!.lvLo;
  let hi = families[0]!.lvHi;
  for (const family of families) {
    if (family.lvLo < lo) lo = family.lvLo;
    if (family.lvHi > hi) hi = family.lvHi;
  }
  return { lo, hi };
}
