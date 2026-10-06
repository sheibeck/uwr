// Renown perk rules: one pure lookup shared by the server's price math (getPerkBonusByField in
// helpers/renown.ts) and the client vendor rapport and Stats perk tags, so the percent a screen
// shows is the percent the server applies. Imports only ./renown_data (itself import-free), so the
// client can reach it through @game-data. Browser-safe, ES2020 only, never throws.
import { RENOWN_PERK_POOLS } from './renown_data';

type PoolPerk = (typeof RENOWN_PERK_POOLS)[number][number];

function findPoolPerk(perkKey: string): PoolPerk | null {
  for (const rankNum in RENOWN_PERK_POOLS) {
    const found = RENOWN_PERK_POOLS[Number(rankNum)].find((p) => p.key === perkKey);
    if (found) return found;
  }
  return null;
}

/**
 * Sum of one effect field over the character's perk keys: pool lookup by exact key across every
 * rank, bigint converted with Number, plus perLevelBonus times the level for a scalesWithLevel
 * perk when a level is passed. Each key counts, as the server does today.
 *
 * Passive perks chosen through the new path are stored as renown_rank{N}_{name}, which never
 * equals a pool key, so they add nothing today; see
 * .planning/todos/pending/2026-10-06-renown-passive-perks-no-effect.md.
 */
export function perkBonusByField(
  perkKeys: ReadonlyArray<string>,
  fieldName: string,
  characterLevel?: bigint,
): number {
  let total = 0;
  for (const perkKey of perkKeys) {
    const perkDef = findPoolPerk(perkKey);
    if (!perkDef) continue;
    const effect = perkDef.effect;
    const fieldValue = (effect as any)[fieldName];
    if (fieldValue === undefined || fieldValue === null) continue;
    let value = typeof fieldValue === 'bigint' ? Number(fieldValue) : fieldValue;
    if (effect.scalesWithLevel && effect.perLevelBonus && characterLevel !== undefined) {
      value += effect.perLevelBonus * Number(characterLevel);
    }
    total += value;
  }
  return total;
}

function sanitizedName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * A readable perk name. An exact pool key gives the pool name; a renown_rank{N}_{name} key gives
 * the matching rank-N pool name; anything else is humanized (prefix stripped, underscores to
 * spaces, each word capitalized).
 */
export function perkDisplayName(perkKey: string): string {
  if (typeof perkKey !== 'string' || perkKey === '') return '';
  const exact = findPoolPerk(perkKey);
  if (exact) return exact.name;

  const prefixed = /^renown_rank(\d+)_(.+)$/.exec(perkKey);
  let rest = perkKey;
  if (prefixed) {
    const pool = RENOWN_PERK_POOLS[Number(prefixed[1])];
    const wanted = prefixed[2].replace(/^_+|_+$/g, '');
    if (pool) {
      const hit = pool.find((p) => sanitizedName(p.name) === wanted);
      if (hit) return hit.name;
    }
    rest = prefixed[2];
  }
  const words = rest.split('_').filter((w) => w !== '');
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
