import { toSql } from 'spacetimedb';
import { tables } from '../module_bindings';

// Typed, filtered subscription SQL for the Phase 50 ledger screens. item_instance, item_affix,
// item_template, vendor_inventory, recipe_discovered, recipe_template and pending_renown_perk are
// public tables: the client filters each one to scope its cache, not to protect data (pre-existing,
// not widened by this phase). The last sale comes only from the per-sender my_vendor_buyback view,
// which the server scopes to the caller; it is the one query without a WHERE.

export interface LedgerQueries {
  myVendorBuyback: string;
  itemInstances(characterId: bigint): string;
  vendorStock(npcId: bigint): string;
  recipesKnown(characterId: bigint): string;
  pendingPerks(characterId: bigint): string;
  /** Non-empty list: an OR chain on item_instance_id. */
  itemAffixes(ids: readonly bigint[]): string;
  /** Non-empty list: an OR chain on id. */
  itemTemplates(ids: readonly bigint[]): string;
  /** Non-empty list: an OR chain on id. */
  recipeTemplates(ids: readonly bigint[]): string;
}

function requireIds(ids: readonly bigint[]): void {
  if (ids.length === 0) throw new Error('[ledger queries] an id list must not be empty');
}

export function ledgerQueries(): LedgerQueries {
  return {
    myVendorBuyback: toSql(tables.myVendorBuyback),
    itemInstances: (characterId) =>
      toSql(tables.itemInstance.where((r) => r.ownerCharacterId.eq(characterId))),
    vendorStock: (npcId) => toSql(tables.vendorInventory.where((r) => r.npcId.eq(npcId))),
    recipesKnown: (characterId) =>
      toSql(tables.recipeDiscovered.where((r) => r.characterId.eq(characterId))),
    pendingPerks: (characterId) =>
      toSql(tables.pendingRenownPerk.where((r) => r.characterId.eq(characterId))),
    itemAffixes: (ids) => {
      requireIds(ids);
      return toSql(
        tables.itemAffix.where((r) =>
          ids.map((id) => r.itemInstanceId.eq(id)).reduce((a, b) => a.or(b)),
        ),
      );
    },
    itemTemplates: (ids) => {
      requireIds(ids);
      return toSql(
        tables.itemTemplate.where((r) => ids.map((id) => r.id.eq(id)).reduce((a, b) => a.or(b))),
      );
    },
    recipeTemplates: (ids) => {
      requireIds(ids);
      return toSql(
        tables.recipeTemplate.where((r) => ids.map((id) => r.id.eq(id)).reduce((a, b) => a.or(b))),
      );
    },
  };
}
