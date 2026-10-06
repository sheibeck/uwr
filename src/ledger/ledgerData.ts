import { computed, effectScope, shallowRef } from 'vue';
import type { Ref, ShallowRef } from 'vue';
import type {
  ItemAffix,
  ItemInstance,
  ItemTemplate,
  PendingRenownPerk,
  RecipeDiscovered,
  RecipeTemplate,
  VendorBuyback,
  VendorInventory,
} from '../module_bindings/types';
import type { ConnectionStatus } from '../net/connection';
import type { BindTableOptions, ConnLike, TableBinding, TableLike } from '../net/bindTable';
import { createKeyed, idListKey, keyedRows, parseIdListKey } from '../game/keyedBinding';
import type { LedgerData, LedgerReducers, VendorTarget } from './ledgerContext';
import type { LedgerQueries } from './queries';

// The ledger hub (Phase 50): the session-owned subscriptions and reducers of the Inventory, Stats,
// Vendor and Crafting screens. It is separate from the Phase 47 game hub on purpose, so gameData
// stays untouched. Every subscription is filtered to the active character (or the open vendor);
// no whole public table is subscribed.
//
// Scope and key of each subscription:
//   item_instance        key: the active character id (owner_character_id)
//   recipe_discovered    key: the active character id
//   pending_renown_perk  key: the active character id
//   my_vendor_buyback    key: the active character id (the view is scoped by the sender on the server)
//   item_affix           key: ids of owned instances that are rolled (quality tier), crafted
//                        (craft quality) or equipped, so gear totals are exact; none, no binding
//   item_template        key: owned template ids, the open vendor's stock, the known recipes'
//                        parts and output, and the last sale's template
//   recipe_template      key: the discovered recipe template ids
//   vendor_inventory     key: the open vendor's npc id (setVendor), cleared by setVendor(null)
//
// Shared-cache rule: the SDK cache is shared by every subscription of the same table, so each
// keyed binding passes a filter equal to its query. Nothing is optimistic: rows drive every change
// and reducers are null while disconnected.

type Row<T> = TableLike<T>;

export interface LedgerConn extends ConnLike {
  db: {
    itemInstance: Row<ItemInstance>;
    itemAffix: Row<ItemAffix>;
    itemTemplate: Row<ItemTemplate>;
    vendorInventory: Row<VendorInventory>;
    recipeDiscovered: Row<RecipeDiscovered>;
    recipeTemplate: Row<RecipeTemplate>;
    pendingRenownPerk: Row<PendingRenownPerk>;
    myVendorBuyback: Row<VendorBuyback>;
  };
  reducers: LedgerReducers;
}

export interface LedgerInput<C> {
  conn: Readonly<ShallowRef<C | null>>;
  status: Readonly<Ref<ConnectionStatus>>;
  activeCharacterId: Readonly<Ref<bigint | null>>;
}

export interface LedgerDeps<C> {
  bind: <R>(options: BindTableOptions<C, R>) => TableBinding<C, R>;
  queries: LedgerQueries;
}

function isSet(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && value !== '';
}

export function createLedgerData<C extends LedgerConn>(
  deps: LedgerDeps<C>,
  input: LedgerInput<C>,
): LedgerData {
  const { queries } = deps;
  // Every watcher and keyed binding lives in one child scope, so dispose() can stop them all
  // and the session scope still stops them when it ends.
  const scope = effectScope();

  const vendorTarget = shallowRef<VendorTarget | null>(null);
  const connected = computed(() => input.status.value === 'connected' && input.conn.value !== null);
  const characterKey = computed<bigint | null>(() => input.activeCharacterId.value);
  const vendorKey = computed<bigint | null>(() => vendorTarget.value?.npcId ?? null);

  const run = scope.run(() => {
    function keyedTable<R, K extends bigint | string>(
      key: Readonly<Ref<K | null>>,
      table: (c: C) => TableLike<R>,
      sql: (k: K) => string,
      matches: (row: R, k: K) => boolean,
      swap: 'onApplied' | 'immediate' = 'onApplied',
    ) {
      return createKeyed<C, K, TableBinding<C, R>>({
        key,
        conn: input.conn,
        swap,
        make: (k) => deps.bind<R>({ table, sql: [sql(k)], filter: (row) => matches(row, k) }),
      });
    }

    // Id-list keys carry the ids in the key string; the filter checks membership.
    function keyedIdList<R>(
      key: Readonly<Ref<string | null>>,
      table: (c: C) => TableLike<R>,
      sql: (ids: bigint[]) => string,
      idOf: (row: R) => bigint,
    ) {
      return createKeyed<C, string, TableBinding<C, R>>({
        key,
        conn: input.conn,
        make: (k) => {
          const ids = parseIdListKey(k);
          const set = new Set(ids);
          return deps.bind<R>({ table, sql: [sql(ids)], filter: (row) => set.has(idOf(row)) });
        },
      });
    }

    // The character-keyed bindings swap immediately too: after a character switch the previous
    // character's bag, recipes, perks and last sale must never stay current until the new
    // subscription applies (the screens render nothing while itemsApplied and the like are false).
    const itemsKeyed = keyedTable<ItemInstance, bigint>(
      characterKey,
      (c) => c.db.itemInstance,
      queries.itemInstances,
      (row, k) => row.ownerCharacterId === k,
      'immediate',
    );
    const recipesKnownKeyed = keyedTable<RecipeDiscovered, bigint>(
      characterKey,
      (c) => c.db.recipeDiscovered,
      queries.recipesKnown,
      (row, k) => row.characterId === k,
      'immediate',
    );
    const pendingPerksKeyed = keyedTable<PendingRenownPerk, bigint>(
      characterKey,
      (c) => c.db.pendingRenownPerk,
      queries.pendingPerks,
      (row, k) => row.characterId === k,
      'immediate',
    );
    // The view is scoped by the sender on the server; the character filter drops a previous
    // character's row while the cache is shared.
    const lastSaleKeyed = keyedTable<VendorBuyback, bigint>(
      characterKey,
      (c) => c.db.myVendorBuyback,
      () => queries.myVendorBuyback,
      (row, k) => row.characterId === k,
      'immediate',
    );
    // Immediate swap: a new vendor must never show the previous vendor's stock.
    const vendorStockKeyed = keyedTable<VendorInventory, bigint>(
      vendorKey,
      (c) => c.db.vendorInventory,
      queries.vendorStock,
      (row, k) => row.npcId === k,
      'immediate',
    );

    const itemRows = keyedRows(itemsKeyed);
    const recipesKnown = keyedRows(recipesKnownKeyed);
    const pendingPerks = keyedRows(pendingPerksKeyed);
    const vendorStock = keyedRows(vendorStockKeyed);
    const lastSaleRows = keyedRows(lastSaleKeyed);
    const lastSale = computed<VendorBuyback | null>(() => lastSaleRows.value[0] ?? null);

    // Affixes exist only on rolled, crafted or equipped instances.
    const affixKey = computed<string | null>(() => {
      const ids: bigint[] = [];
      for (const row of itemRows.value) {
        if (isSet(row.qualityTier) || isSet(row.craftQuality) || isSet(row.equippedSlot)) {
          ids.push(row.id);
        }
      }
      return idListKey(ids);
    });
    const affixesKeyed = keyedIdList<ItemAffix>(
      affixKey,
      (c) => c.db.itemAffix,
      queries.itemAffixes,
      (row) => row.itemInstanceId,
    );

    const recipeKey = computed<string | null>(() =>
      idListKey(recipesKnown.value.map((row) => row.recipeTemplateId)),
    );
    const recipesKeyed = keyedIdList<RecipeTemplate>(
      recipeKey,
      (c) => c.db.recipeTemplate,
      queries.recipeTemplates,
      (row) => row.id,
    );
    const recipeRows = keyedRows(recipesKeyed);

    const templateKey = computed<string | null>(() => {
      const ids: bigint[] = [];
      for (const row of itemRows.value) ids.push(row.templateId);
      for (const row of vendorStock.value) ids.push(row.itemTemplateId);
      for (const recipe of recipeRows.value) {
        ids.push(recipe.outputTemplateId, recipe.req1TemplateId, recipe.req2TemplateId);
        if (recipe.req3TemplateId !== undefined && recipe.req3TemplateId !== null) {
          ids.push(recipe.req3TemplateId);
        }
      }
      const sale = lastSale.value;
      if (sale !== null) ids.push(sale.templateId);
      return idListKey(ids);
    });
    const templatesKeyed = keyedIdList<ItemTemplate>(
      templateKey,
      (c) => c.db.itemTemplate,
      queries.itemTemplates,
      (row) => row.id,
    );
    const templateRows = keyedRows(templatesKeyed);

    const templates = computed<ReadonlyMap<bigint, ItemTemplate>>(() => {
      const map = new Map<bigint, ItemTemplate>();
      for (const row of templateRows.value) map.set(row.id, row);
      return map;
    });
    const recipes = computed<ReadonlyMap<bigint, RecipeTemplate>>(() => {
      const map = new Map<bigint, RecipeTemplate>();
      for (const row of recipeRows.value) map.set(row.id, row);
      return map;
    });

    return {
      keyed: [
        itemsKeyed,
        recipesKnownKeyed,
        pendingPerksKeyed,
        lastSaleKeyed,
        vendorStockKeyed,
        affixesKeyed,
        recipesKeyed,
        templatesKeyed,
      ],
      items: itemRows,
      itemsApplied: computed(() => itemsKeyed.current.value?.applied.value ?? false),
      affixes: keyedRows(affixesKeyed),
      templates,
      vendorStock,
      vendorStockApplied: computed(() => vendorStockKeyed.current.value?.applied.value ?? false),
      recipesKnown,
      recipesApplied: computed(() => recipesKnownKeyed.current.value?.applied.value ?? false),
      recipes,
      pendingPerks,
      lastSale,
    };
  })!;

  // Reducers exist only while connected; every method forwards its object argument unchanged.
  const reducers = computed<LedgerReducers | null>(() => {
    const conn = input.conn.value;
    if (input.status.value !== 'connected' || conn === null) return null;
    const r = conn.reducers;
    return {
      equipItem: (a) => r.equipItem(a),
      unequipItem: (a) => r.unequipItem(a),
      useItem: (a) => r.useItem(a),
      eatFood: (a) => r.eatFood(a),
      salvageItem: (a) => r.salvageItem(a),
      learnRecipeScroll: (a) => r.learnRecipeScroll(a),
      sellItem: (a) => r.sellItem(a),
      sellItemQuantity: (a) => r.sellItemQuantity(a),
      sellAllJunk: (a) => r.sellAllJunk(a),
      buyItem: (a) => r.buyItem(a),
      buybackLastSale: (a) => r.buybackLastSale(a),
      researchRecipes: (a) => r.researchRecipes(a),
      craftRecipe: (a) => r.craftRecipe(a),
      chooseRenownPerk: (a) => r.chooseRenownPerk(a),
    };
  });

  function setVendor(target: VendorTarget | null): void {
    vendorTarget.value = target;
  }

  function reset(): void {
    vendorTarget.value = null;
  }

  function dispose(): void {
    vendorTarget.value = null;
    scope.stop();
    for (const keyed of run.keyed) keyed.reset();
  }

  return {
    connected,
    items: run.items,
    itemsApplied: run.itemsApplied,
    affixes: run.affixes,
    templates: run.templates,
    vendorTarget,
    vendorStock: run.vendorStock,
    vendorStockApplied: run.vendorStockApplied,
    recipesKnown: run.recipesKnown,
    recipesApplied: run.recipesApplied,
    recipes: run.recipes,
    pendingPerks: run.pendingPerks,
    lastSale: run.lastSale,
    reducers,
    setVendor,
    reset,
    dispose,
  };
}
