import { computed, effectScope, shallowRef } from 'vue';
import type { Ref, ShallowRef } from 'vue';
import type {
  ActionResult,
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
import { decodeResultLines } from '@game-data/action_result';
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
//   my_action_result     key: the active character id (the view is scoped by the sender on the
//                        server): the last craft, salvage or Discover
//   my_vendor_buyback    key: the active character id (the view is scoped by the sender on the server)
//   item_affix           key: ids of owned instances that are rolled (quality tier), crafted
//                        (craft quality) or equipped, so gear totals are exact; none, no binding
//   item_template        key: owned template ids, the open vendor's stock, the known recipes'
//                        parts and output, the last sale's template, the last result's templates
//                        and the parts of the recipes that make owned items
//   recipe_template      key: the discovered recipe template ids (recipes), and a second binding
//                        on the owned template ids by output_template_id (outputRecipes)
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
    myActionResult: Row<ActionResult>;
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
    // `made` hears each new binding with the ids of its key.
    function keyedIdList<R>(
      key: Readonly<Ref<string | null>>,
      table: (c: C) => TableLike<R>,
      sql: (ids: bigint[]) => string,
      idOf: (row: R) => bigint,
      made?: (binding: TableBinding<C, R>, ids: ReadonlySet<bigint>) => void,
    ) {
      return createKeyed<C, string, TableBinding<C, R>>({
        key,
        conn: input.conn,
        make: (k) => {
          const ids = parseIdListKey(k);
          const set = new Set(ids);
          const binding = deps.bind<R>({ table, sql: [sql(ids)], filter: (row) => set.has(idOf(row)) });
          made?.(binding, set);
          return binding;
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
    // The result row, like the last sale: the view is scoped by the sender on the server, and the
    // immediate swap plus the character filter keep a previous character's result from showing.
    const lastResultKeyed = keyedTable<ActionResult, bigint>(
      characterKey,
      (c) => c.db.myActionResult,
      () => queries.myActionResult,
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
    const lastResultRows = keyedRows(lastResultKeyed);
    const lastResult = computed<ActionResult | null>(() => lastResultRows.value[0] ?? null);

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

    // The recipes that make an item the character owns (the salvage cap and the result card read
    // them). Keyed by every owned template id, so it never depends on the template subscription.
    const outputKey = computed<string | null>(() =>
      idListKey(itemRows.value.map((row) => row.templateId)),
    );
    // The template ids each output binding covers. The default swap keeps the old binding current
    // (and applied) until the new key applies, so "applied" alone would read a template the old key
    // never asked about as "no recipe makes it" (WR-03, iteration 3).
    const outputCovers = new WeakMap<object, ReadonlySet<bigint>>();
    const outputRecipesKeyed = keyedIdList<RecipeTemplate>(
      outputKey,
      (c) => c.db.recipeTemplate,
      queries.recipesByOutput,
      (row) => row.outputTemplateId,
      (binding, ids) => outputCovers.set(binding, ids),
    );
    const outputRecipeRows = keyedRows(outputRecipesKeyed);
    // Applied for every owned template: the shown binding has applied and its key holds each owned
    // template id. A dropped template (a salvaged item) keeps it true; a new one makes it false until
    // the new key applies.
    const outputRecipesApplied = computed<boolean>(() => {
      const binding = outputRecipesKeyed.current.value;
      if (binding === null || !binding.applied.value) return false;
      const covers = outputCovers.get(binding);
      if (covers === undefined) return false;
      return itemRows.value.every((row) => covers.has(row.templateId));
    });

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
      for (const recipe of outputRecipeRows.value) {
        ids.push(recipe.req1TemplateId, recipe.req2TemplateId);
        if (recipe.req3TemplateId !== undefined && recipe.req3TemplateId !== null) {
          ids.push(recipe.req3TemplateId);
        }
      }
      const sale = lastSale.value;
      if (sale !== null) ids.push(sale.templateId);
      const result = lastResult.value;
      if (result !== null) {
        if (result.templateId !== undefined && result.templateId !== null) ids.push(result.templateId);
        for (const line of decodeResultLines(result.linesJson)) ids.push(line.templateId);
      }
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

    const outputRecipes = computed<ReadonlyMap<bigint, RecipeTemplate>>(() => {
      const map = new Map<bigint, RecipeTemplate>();
      for (const row of outputRecipeRows.value) {
        const known = map.get(row.outputTemplateId);
        if (known === undefined || row.id < known.id) map.set(row.outputTemplateId, row);
      }
      return map;
    });

    return {
      keyed: [
        itemsKeyed,
        recipesKnownKeyed,
        pendingPerksKeyed,
        lastSaleKeyed,
        lastResultKeyed,
        vendorStockKeyed,
        affixesKeyed,
        recipesKeyed,
        outputRecipesKeyed,
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
      lastResult,
      outputRecipes,
      outputRecipesApplied,
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
      buyListing: (a) => r.buyListing(a),
      buybackLastSale: (a) => r.buybackLastSale(a),
      researchRecipes: (a) => r.researchRecipes(a),
      craftRecipe: (a) => r.craftRecipe(a),
      craftRecipeCount: (a) => r.craftRecipeCount(a),
      chooseRenownPerk: (a) => r.chooseRenownPerk(a),
      consolidateStacks: (a) => r.consolidateStacks(a),
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
    lastResult: run.lastResult,
    outputRecipes: run.outputRecipes,
    outputRecipesApplied: run.outputRecipesApplied,
    reducers,
    setVendor,
    reset,
    dispose,
  };
}
