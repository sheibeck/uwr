// ============================================================================
// Economy dial storage (Phase 51.3, pure module: duck-typed transaction)
// ============================================================================
//
// Stores and reads the economy dials:
//   - economy_dials        the global singleton (id 1n): scalar dials, five tier weights, aiEnabled
//   - economy_region_dial  per-region overrides (an undefined field inherits the global value)
//   - economy_item_dial    per-item drop pins
//
// A missing singleton reads as today's tuning with the AI economy off (RESEARCH Pitfall 3): init does
// not run on a republish, so the owner's database has no row until the first dial write, and every roll
// must still work. getDials therefore never fails closed and never throws; the AI switch defaults to
// false, so a missing row can never enable spend. (llmGate in llm_admin_state.ts fails closed because it
// guards money; these dials guard nothing but numbers.)
//
// applyDialChange is the one write path: the /economy command and the admin reducers (Plan 08) both
// call it, so every value is clamped in one place, and an unknown dial, region or item is refused before
// any write.
//
// Imports only data modules, like llm_admin_state.ts, so it loads in plain Node vitest. The clamps and
// the combination rule live in data/economy_rules.ts.
// ============================================================================

import {
  DEFAULT_DIALS,
  DIAL_RANGES,
  clampDial,
  effectiveDials,
  type DialName,
  type EffectiveDials,
  type GlobalDials,
} from '../data/economy_rules';

/** The id of the economy_dials singleton row. */
export const ECONOMY_DIALS_ID = 1n;

/** The five scalar dials, as written by an admin: word -> economy_dials / economy_region_dial column. */
const SCALAR_DIAL_WORDS = {
  rarity: 'rarityShift',
  drop: 'dropRatePct',
  gold: 'goldPct',
  gather: 'gatherRatePct',
  boss: 'bossRarityBonus',
} as const;

/** The five tier weights, as written by an admin: tier word -> economy_dials column. */
const TIER_DIAL_WORDS = {
  common: 'tierCommonPct',
  uncommon: 'tierUncommonPct',
  rare: 'tierRarePct',
  epic: 'tierEpicPct',
  legendary: 'tierLegendaryPct',
} as const;

/** Every dial word an admin can type and the column it writes (frozen). */
export const ECONOMY_DIAL_WORDS: Readonly<Record<string, string>> = Object.freeze({
  ...SCALAR_DIAL_WORDS,
  ...TIER_DIAL_WORDS,
});

type ScalarWord = keyof typeof SCALAR_DIAL_WORDS;
type TierWord = keyof typeof TIER_DIAL_WORDS;

const has = (obj: object, key: string): boolean => Object.prototype.hasOwnProperty.call(obj, key);

// ---------------------------------------------------------------------------
// Reads and the singleton
// ---------------------------------------------------------------------------

function dialsRow(tx: any): any | undefined {
  return tx.db.economy_dials.id.find(ECONOMY_DIALS_ID);
}

/** The global dials. A missing row is DEFAULT_DIALS (today's tuning, AI off); nothing is written. */
export function getDials(tx: any): GlobalDials {
  const row = dialsRow(tx);
  if (!row) return { ...DEFAULT_DIALS };
  const { id: _id, ...stored } = row;
  return { ...DEFAULT_DIALS, ...stored };
}

/** Insert the singleton with today's defaults and the AI off when absent. Returns the row. */
export function ensureEconomyDials(tx: any): any {
  const existing = dialsRow(tx);
  if (existing) return existing;
  return tx.db.economy_dials.insert({ id: ECONOMY_DIALS_ID, ...DEFAULT_DIALS });
}

/** Insert the default row when absent, then apply the patch. Returns the updated row. */
export function patchEconomyDials(tx: any, patch: Record<string, unknown>): any {
  const row = ensureEconomyDials(tx);
  const next = { ...row, ...patch };
  tx.db.economy_dials.id.update(next);
  return next;
}

/** The dials one roll reads: the global row, with the region override on top when a region is given. */
export function loadEffectiveDials(tx: any, regionId?: bigint): EffectiveDials {
  const regionRow = regionId === undefined ? undefined : tx.db.economy_region_dial.regionId.find(regionId);
  return effectiveDials(getDials(tx), regionRow ?? null);
}

/** Every per-item drop pin: item_template id -> percent of the item's base weight. */
export function loadItemPins(tx: any): Map<bigint, bigint> {
  const pins = new Map<bigint, bigint>();
  for (const row of tx.db.economy_item_dial.iter()) pins.set(row.itemTemplateId, row.dropRatePct);
  return pins;
}

// ---------------------------------------------------------------------------
// The one write path
// ---------------------------------------------------------------------------

export type DialScope = 'global' | 'region' | 'tier' | 'item';

export interface DialChange {
  scope: DialScope;
  /** The region id (scope 'region') or item_template id (scope 'item'). */
  scopeId?: bigint;
  /** The word an admin typed: rarity, drop, gold, gather, boss, or a tier name for scope 'tier'. */
  dial: string;
  value: bigint;
}

export type DialChangeResult =
  | { ok: true; column: string; value: bigint; clamped: boolean; min: bigint; max: bigint }
  | { ok: false; reason: 'unknown_dial' | 'unknown_region' | 'unknown_item' | 'bad_scope' };

const refuse = (reason: 'unknown_dial' | 'unknown_region' | 'unknown_item' | 'bad_scope'): DialChangeResult => ({
  ok: false,
  reason,
});

/**
 * Clamp and store one dial. 'global' and 'region' accept the five scalar words, 'tier' the five tier
 * words, 'item' only 'drop' (range itemDropPct). A refusal writes nothing. Success reports the stored
 * column, the stored value, whether the clamp changed it, and the range.
 */
export function applyDialChange(tx: any, change: DialChange): DialChangeResult {
  const { scope, scopeId, dial, value } = change;

  if (scope === 'global' || scope === 'region') {
    if (!has(SCALAR_DIAL_WORDS, dial)) return refuse('unknown_dial');
    const column = SCALAR_DIAL_WORDS[dial as ScalarWord];
    if (scope === 'region' && (scopeId === undefined || !tx.db.region.id.find(scopeId))) {
      return refuse('unknown_region');
    }
    const range = DIAL_RANGES[column as DialName];
    const clamp = clampDial(column as DialName, value);
    if (scope === 'global') {
      patchEconomyDials(tx, { [column]: clamp.value });
    } else {
      const existing = tx.db.economy_region_dial.regionId.find(scopeId);
      if (existing) {
        tx.db.economy_region_dial.regionId.update({ ...existing, [column]: clamp.value });
      } else {
        tx.db.economy_region_dial.insert({
          regionId: scopeId,
          rarityShift: undefined,
          dropRatePct: undefined,
          goldPct: undefined,
          gatherRatePct: undefined,
          bossRarityBonus: undefined,
          [column]: clamp.value,
        });
      }
    }
    return { ok: true, column, value: clamp.value, clamped: clamp.clamped, min: range.min, max: range.max };
  }

  if (scope === 'tier') {
    if (!has(TIER_DIAL_WORDS, dial)) return refuse('unknown_dial');
    const column = TIER_DIAL_WORDS[dial as TierWord];
    const range = DIAL_RANGES.tierPct;
    const clamp = clampDial('tierPct', value);
    patchEconomyDials(tx, { [column]: clamp.value });
    return { ok: true, column, value: clamp.value, clamped: clamp.clamped, min: range.min, max: range.max };
  }

  if (scope === 'item') {
    if (dial !== 'drop') return refuse('unknown_dial');
    if (scopeId === undefined || !tx.db.item_template.id.find(scopeId)) return refuse('unknown_item');
    const range = DIAL_RANGES.itemDropPct;
    const clamp = clampDial('itemDropPct', value);
    const pin = { itemTemplateId: scopeId, dropRatePct: clamp.value };
    if (tx.db.economy_item_dial.itemTemplateId.find(scopeId)) {
      tx.db.economy_item_dial.itemTemplateId.update(pin);
    } else {
      tx.db.economy_item_dial.insert(pin);
    }
    return { ok: true, column: 'dropRatePct', value: clamp.value, clamped: clamp.clamped, min: range.min, max: range.max };
  }

  return refuse('bad_scope');
}

// ---------------------------------------------------------------------------
// Reset and the AI switch
// ---------------------------------------------------------------------------

/**
 * Reset the economy and report how many override rows were removed.
 *  - 'global': every dial column back to its default (aiEnabled is kept), and every region and item row deleted.
 *  - 'region': that region's row deleted.
 *  - 'item':   that item's pin deleted.
 * Idempotent: a second call finds nothing to remove.
 */
export function resetEconomy(
  tx: any,
  scope: 'global' | 'region' | 'item',
  scopeId?: bigint,
): { regions: number; items: number } {
  if (scope === 'region') {
    if (scopeId === undefined || !tx.db.economy_region_dial.regionId.find(scopeId)) return { regions: 0, items: 0 };
    tx.db.economy_region_dial.regionId.delete(scopeId);
    return { regions: 1, items: 0 };
  }
  if (scope === 'item') {
    if (scopeId === undefined || !tx.db.economy_item_dial.itemTemplateId.find(scopeId)) return { regions: 0, items: 0 };
    tx.db.economy_item_dial.itemTemplateId.delete(scopeId);
    return { regions: 0, items: 1 };
  }
  const current = getDials(tx);
  patchEconomyDials(tx, { ...DEFAULT_DIALS, aiEnabled: current.aiEnabled });
  // Snapshot before deleting: deleting while iterating a table is not safe.
  const regionRows = [...tx.db.economy_region_dial.iter()];
  const itemRows = [...tx.db.economy_item_dial.iter()];
  for (const row of regionRows) tx.db.economy_region_dial.regionId.delete(row.regionId);
  for (const row of itemRows) tx.db.economy_item_dial.itemTemplateId.delete(row.itemTemplateId);
  return { regions: regionRows.length, items: itemRows.length };
}

/** The route switch for the AI economy. Patches aiEnabled only. */
export function setAiEnabled(tx: any, enabled: boolean): any {
  return patchEconomyDials(tx, { aiEnabled: enabled });
}
