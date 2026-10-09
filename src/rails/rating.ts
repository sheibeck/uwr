// The client safety rating model (51.3.1.1 UI-SPEC "Rating Marks", D-08, D-33, D-34, D-56).
//
// Pure, no Vue. One model over the shared rule in @game-data/place_rating (the server's look text
// uses the same rule), so the header pill, the Here card, the exit rows, the mobile chips, the
// location line and the Map never disagree. The rating is computed per viewer from the public
// density levels (0-3, never a count) and the viewer's level. Until a place's pool rows have
// applied (game.poolsAppliedFor) the rating is Unknown: no word, never Safe. The copy (words and
// rating lines) lives in the shared files; nothing is duplicated here.

import { placeRating, ratingLevelRange } from '@game-data/place_rating';
import type { RatingKey } from '@game-data/place_rating';
import { ratingLine } from '@game-data/density_lines';

export type { RatingKey };

/** The fields of a pool_level row the rating reads (public density only). */
export interface RatingPool {
  kind: string;
  level: bigint;
  lvLo: bigint;
  lvHi: bigint;
}

export interface PlaceRatingView {
  key: RatingKey;
  /** 'Safe', 'Quiet', 'Risky', 'Deadly', 'Danger unknown', or '' while the pools are not ready. */
  word: string;
  /** The rating line ('Nothing here will hurt you.'), '' for Unknown. */
  line: string;
  /** 'Lv 4–5', 'Lv 4', or '' (safe, uncharted, or no family known). */
  levelLabel: string;
}

export interface RatingInput {
  location: { isSafe: boolean; terrainType: string };
  /** The pool_level rows of this place (creature and resource; only creatures rate). */
  poolsHere: readonly RatingPool[];
  /** game.poolsAppliedFor(place): false while loading, outside the loaded regions or unknown. */
  ready: boolean;
  /** The viewer's rating level (viewerRatingLevel); null is treated as not ready. */
  playerLevel: bigint | null;
  /** A living boss or named enemy at the place raises the rating one step (D-34). */
  bossOrNamedHere: boolean;
}

/** 'Lv 4–5' (en dash, the repo's level-range form), 'Lv 4' when equal, '' with no families. */
export function levelLabel(families: readonly { lvLo: bigint; lvHi: bigint }[]): string {
  const range = ratingLevelRange(families);
  if (range === null) return '';
  return range.lo === range.hi ? `Lv ${range.lo}` : `Lv ${range.lo}–${range.hi}`;
}

export function ratingForPlace(input: RatingInput): PlaceRatingView {
  // An uncharted edge is stored as safe by the server; it still reads Danger unknown (checked first).
  const uncharted = input.location.terrainType === 'uncharted';
  const families = input.poolsHere.filter((pool) => pool.kind === 'creature');
  const ready = input.ready && input.playerLevel !== null;
  const { key, word } = placeRating({
    isSafe: input.location.isSafe && !uncharted,
    isUncharted: uncharted,
    ready,
    families: families.map((pool) => ({ level: Number(pool.level), lvHi: pool.lvHi })),
    playerLevel: input.playerLevel ?? 0n,
    bossOrNamedHere: input.bossOrNamedHere,
  });
  const range = key === 'safe' || uncharted ? '' : levelLabel(families);
  return { key, word, line: ratingLine(key), levelLabel: range };
}

/** The scoped colour class every rating host maps to a token (no inline colours). */
export function ratingClass(key: RatingKey): string {
  return `rate-${key}`;
}

/**
 * True when a living named enemy of the viewer, or a boss event spawn, is at the place (D-34).
 * The named rows are the viewer's own (every place); the spawns are the ones the client knows.
 */
export function bossOrNamedAt(
  locationId: bigint,
  namedEnemies: readonly { locationId: bigint; isAlive: boolean }[],
  eventSpawns: readonly { locationId: bigint; enemyTemplateId: bigint }[],
  templates: readonly { id: bigint; isBoss?: boolean | null }[],
): boolean {
  for (const named of namedEnemies) {
    if (named.locationId === locationId && named.isAlive) return true;
  }
  for (const spawn of eventSpawns) {
    if (spawn.locationId !== locationId) continue;
    const template = templates.find((t) => t.id === spawn.enemyTemplateId);
    if (template !== undefined && template.isBoss === true) return true;
  }
  return false;
}

/**
 * The level a place is rated for: the viewer's own level, or in a party the LOWEST level among the
 * members standing with the viewer (D-56: the weakest member decides whether creatures take an
 * interest). Only ONLINE members count, the server's fightRoster rule (D-14): the look text,
 * encounter rolls and draws all rate for that roster. Null with no character.
 */
export function viewerRatingLevel(
  self: { id: bigint; level: bigint; locationId: bigint } | null,
  groupMembers: readonly { characterId: bigint }[],
  characters: readonly { id: bigint; level: bigint; locationId: bigint; online: boolean }[],
): bigint | null {
  if (self === null) return null;
  let lowest = self.level;
  if (groupMembers.length === 0) return lowest;
  const inParty = new Set<bigint>();
  for (const member of groupMembers) inParty.add(member.characterId);
  for (const other of characters) {
    if (other.id === self.id || !inParty.has(other.id) || other.locationId !== self.locationId) continue;
    if (other.online !== true) continue; // the server's fightRoster skips offline members (D-14)
    if (other.level < lowest) lowest = other.level;
  }
  return lowest;
}
