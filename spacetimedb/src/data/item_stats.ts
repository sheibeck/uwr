// Per-instance item stats: one rule shared by the server's examine helper and the client
// inventory, Stats bars and item comparison, so the numbers can never drift. An item's stats
// are its template fields plus every item_affix magnitude (prefixes, suffixes and the implicit
// craft-quality affixes all live in item_affix under the same stat key names the template uses).
// No imports, so the client can reach it through @game-data. Browser-safe, ES2020 only, never throws.

export const ITEM_STAT_KEYS = [
  'strBonus',
  'dexBonus',
  'intBonus',
  'wisBonus',
  'chaBonus',
  'hpBonus',
  'manaBonus',
  'armorClassBonus',
  'magicResistanceBonus',
  'lifeOnHit',
  'cooldownReduction',
  'manaRegen',
  'weaponBaseDamage',
  'weaponDps',
] as const;

export type ItemStatKey = (typeof ITEM_STAT_KEYS)[number];
export type ItemStatTotals = Record<ItemStatKey, bigint>;

export function emptyItemStats(): ItemStatTotals {
  return {
    strBonus: 0n,
    dexBonus: 0n,
    intBonus: 0n,
    wisBonus: 0n,
    chaBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 0n,
    magicResistanceBonus: 0n,
    lifeOnHit: 0n,
    cooldownReduction: 0n,
    manaRegen: 0n,
    weaponBaseDamage: 0n,
    weaponDps: 0n,
  };
}

function isStatKey(key: unknown): key is ItemStatKey {
  return typeof key === 'string' && (ITEM_STAT_KEYS as readonly string[]).indexOf(key) !== -1;
}

/**
 * Template stat fields plus the sum of the instance's affix magnitudes. A missing or non-bigint
 * template field counts as 0n; an affix with an unknown statKey is ignored; a negative magnitude
 * subtracts.
 */
export function sumItemStats(
  template: Readonly<Record<string, unknown>>,
  affixes: ReadonlyArray<{ statKey: string; magnitude: bigint }>,
): ItemStatTotals {
  const totals = emptyItemStats();
  if (template) {
    for (const key of ITEM_STAT_KEYS) {
      const v = template[key];
      if (typeof v === 'bigint') totals[key] += v;
    }
  }
  if (affixes) {
    for (const affix of affixes) {
      if (!affix) continue;
      const key = affix.statKey;
      if (isStatKey(key) && typeof affix.magnitude === 'bigint') totals[key] += affix.magnitude;
    }
  }
  return totals;
}

/** Key-by-key sum into a new object; neither input is changed. */
export function addItemStats(a: ItemStatTotals, b: ItemStatTotals): ItemStatTotals {
  const out = emptyItemStats();
  for (const key of ITEM_STAT_KEYS) out[key] = a[key] + b[key];
  return out;
}
