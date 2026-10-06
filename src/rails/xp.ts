// XP progress into the current level (47-UI-SPEC "XP bar", CON-03).
// Thresholds come from the server's xp.ts through @game-data (server is source of truth).
import { MAX_LEVEL, xpRequiredForLevel } from '@game-data/xp';
import { barFraction } from '../frame/vitals';

export interface XpProgress {
  max: boolean;
  value: number;
  need: number;
  fraction: number;
  text: string;
}

/**
 * Progress into the current level over the amount that level needs. XP below the level floor
 * reads 0; XP above the next threshold (pending level-up) is clamped to the need. At or above
 * MAX_LEVEL the track is full and the text is 'Max level'.
 */
export function xpProgress(c: { xp: bigint; level: bigint }): XpProgress {
  if (c.level >= MAX_LEVEL) return { max: true, value: 1, need: 1, fraction: 1, text: 'Max level' };
  const base = xpRequiredForLevel(c.level);
  const need = xpRequiredForLevel(c.level + 1n) - base;
  const into = c.xp > base ? c.xp - base : 0n;
  const clamped = into > need ? need : into;
  const value = Number(clamped);
  const needNumber = Number(need);
  return {
    max: false,
    value,
    need: needNumber,
    fraction: barFraction(value, needNumber),
    text: `${value} / ${needNumber}`,
  };
}
