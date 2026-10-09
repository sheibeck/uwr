// place_rating.ts
// The one shared place safety rating rule of Phase 51.3.1.1 (D-73, D-34, D-56; D-73 replaces the UI-SPEC
// summed score of D-08). Shared by the client (`@game-data/place_rating`: header, Here card, exits, chips,
// Map, encounter foot) and the server (look text, World event names), so no two surfaces ever disagree
// (UI-SPEC P2).
//
// D-73, level first, crowds nudge: the toughest PRESENT family (density level above 0) sets the base by
// its top level minus the party's lowest level (Quiet, Risky, Deadly); a crowd (any family Overrun, or
// enough living families) raises it one step; a living boss or named enemy raises it one more (D-34);
// Deadly is the cap.
//
// Pure module: no ctx, no clock, no randomness. Every threshold comes from DENSITY_RULES; Phase 52.5
// tunes them there.

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
  /** The party's lowest level (D-56); a solo viewer's own level. */
  playerLevel: bigint;
  /** A living boss or named enemy at the place raises the rating one step (D-34). */
  bossOrNamedHere?: boolean;
}

const STEP_UP: Record<'quiet' | 'risky' | 'deadly', 'quiet' | 'risky' | 'deadly'> = {
  quiet: 'risky',
  risky: 'deadly',
  deadly: 'deadly',
};

/**
 * The rating of a place for one viewer or party. Safe for a safe place, 'Danger unknown' for an
 * uncharted one, Unknown (no word) while the rows are not ready. Otherwise (D-73):
 *   - the present families are those whose density level is above 0; with none the base is Quiet (B3);
 *   - else the gap (the highest lvHi among them minus playerLevel) gives Quiet at RATING_GAP_QUIET_MAX
 *     or below, Risky at RATING_GAP_RISKY_MAX or below, Deadly above;
 *   - a crowd (any present family at RATING_CROWD_LEVEL, or RATING_CROWD_FAMILIES or more present
 *     families) raises it one step;
 *   - a living boss or named enemy here raises it one more step (D-34); Deadly is the cap.
 */
export function placeRating(input: PlaceRatingInput): { key: RatingKey; word: string } {
  if (input.isSafe) return { key: 'safe', word: RATING_WORDS.safe };
  if (input.isUncharted) return { key: 'unknown', word: UNCHARTED_WORD };
  if (!input.ready) return { key: 'unknown', word: '' };

  let key: 'quiet' | 'risky' | 'deadly' = 'quiet';
  let present = 0;
  let overrun = false;
  let topLvHi: bigint | null = null;
  for (const family of input.families) {
    const level = Math.max(0, Math.floor(Number(family.level)));
    if (level === 0) continue;
    present += 1;
    if (level >= DENSITY_RULES.RATING_CROWD_LEVEL) overrun = true;
    if (topLvHi === null || family.lvHi > topLvHi) topLvHi = family.lvHi;
  }

  if (topLvHi !== null) {
    const gap = Number(topLvHi - input.playerLevel);
    if (gap <= DENSITY_RULES.RATING_GAP_QUIET_MAX) key = 'quiet';
    else if (gap <= DENSITY_RULES.RATING_GAP_RISKY_MAX) key = 'risky';
    else key = 'deadly';
    if (overrun || present >= DENSITY_RULES.RATING_CROWD_FAMILIES) key = STEP_UP[key];
  }

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
