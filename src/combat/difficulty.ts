// Difficulty ("con") of a hostile relative to the player (48-UI-SPEC "Difficulty colors", CMB-01).
//
// The rule is the old client's level-difference rule: diff = enemy level - player level.
// A missing enemy template counts as diff 0. Components apply the color by class name against
// the --color-con-* tokens, so this module holds no color value of its own.

export type ConClass =
  | 'con-gray'
  | 'con-light-green'
  | 'con-blue'
  | 'con-white'
  | 'con-yellow'
  | 'con-orange'
  | 'con-red';

export interface ConView {
  className: ConClass;
  /** Custom property name that carries the color, for example '--color-con-red'. */
  token: string;
  /** Meaning word used in title and aria-label. */
  meaning: string;
}

function view(className: ConClass, meaning: string): ConView {
  return { className, token: `--${className.replace('con-', 'color-con-')}`, meaning };
}

/** Difficulty of an enemy of `enemyLevel` for a player of `playerLevel`. */
export function conFor(enemyLevel: bigint | null | undefined, playerLevel: bigint): ConView {
  const diff = enemyLevel === null || enemyLevel === undefined ? 0n : enemyLevel - playerLevel;
  if (diff <= -5n) return view('con-gray', 'Trivial');
  if (diff <= -2n) return view('con-light-green', 'Easy');
  if (diff === -1n) return view('con-blue', 'Slightly easy');
  if (diff === 0n) return view('con-white', 'Even match');
  if (diff === 1n) return view('con-yellow', 'Tough');
  if (diff === 2n) return view('con-orange', 'Hard');
  return view('con-red', 'Deadly');
}
