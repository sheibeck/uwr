// The Map danger rule (51-UI-SPEC "Danger bands").
//
// dd = hi - playerLevel, where hi is the top of the place's level range from routeLevel (the bottom
// is ignored, as in the mock). It is separate on purpose from the combat con rule (conFor), which
// stays the enemy rule. The same helper drives the Map, the rail exits panel, the mobile location
// line, the gate pills, and the screens of 51.1 and 51.2.

import { routeLevel } from '../rails/levelRange';

export type Band = 'easy' | 'even' | 'tough' | 'deadly';

export const BAND_WORD: Record<Band, string> = {
  easy: 'easy',
  even: 'even',
  tough: 'tough',
  deadly: 'deadly',
};

export const BAND_COLOR: Record<Band, string> = {
  easy: 'var(--color-con-light-green)',
  even: 'var(--color-con-blue)',
  tough: 'var(--color-con-yellow)',
  deadly: 'var(--color-con-red)',
};

const SAFE_COLOR = 'var(--color-con-light-green)';
const UNKNOWN_COLOR = 'var(--color-neutral-500)';

/** easy when dd <= -2, even when -2 < dd <= 0, tough when 0 < dd <= 2, deadly when dd > 2. */
export function dangerBand(hi: number, playerLevel: number): Band {
  const dd = hi - playerLevel;
  if (dd <= -2) return 'easy';
  if (dd <= 0) return 'even';
  if (dd <= 2) return 'tough';
  return 'deadly';
}

export interface PlaceDanger {
  kind: 'band' | 'safe' | 'unknown';
  band: Band | null;
  word: string;
  color: string;
  lo: number | null;
  hi: number | null;
  /** 'Lv a–b', 'Lv n', 'Safe' or '' (unknown). */
  levelLabel: string;
}

export function placeDanger(
  place: { terrainType: string; isSafe: boolean; regionId: bigint; levelOffset: bigint },
  regions: readonly { id: bigint; dangerMultiplier: bigint }[],
  playerLevel: number,
): PlaceDanger {
  // An uncharted edge is stored as safe by the server; it still reads unknown, so it is checked first.
  if (place.terrainType === 'uncharted') {
    return {
      kind: 'unknown',
      band: null,
      word: 'Danger unknown',
      color: UNKNOWN_COLOR,
      lo: null,
      hi: null,
      levelLabel: '',
    };
  }
  const level = routeLevel(place, regions);
  if (level.safe) {
    return { kind: 'safe', band: null, word: 'Safe', color: SAFE_COLOR, lo: null, hi: null, levelLabel: 'Safe' };
  }
  const band = dangerBand(level.hi, playerLevel);
  return {
    kind: 'band',
    band,
    word: BAND_WORD[band],
    color: BAND_COLOR[band],
    lo: level.lo,
    hi: level.hi,
    levelLabel: level.lo === level.hi ? `Lv ${level.lo}` : `Lv ${level.lo}–${level.hi}`,
  };
}
