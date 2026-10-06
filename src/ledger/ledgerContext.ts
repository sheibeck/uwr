import { computed } from 'vue';
import type { InjectionKey, Ref } from 'vue';
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

// The ledger data contract (Phase 50): what the Inventory, Stats, Vendor and Crafting screens read
// and call. The session owns the hub; the screens inject it through LEDGER_KEY and mount bare
// against the inert default (tests and the Phase 45 shell).

type List<T> = Readonly<Ref<readonly T[]>>;

/** Reducers the ledger screens call: object arguments, never positional. */
export interface LedgerReducers {
  equipItem(a: { characterId: bigint; itemInstanceId: bigint }): Promise<void>;
  unequipItem(a: { characterId: bigint; slot: string }): Promise<void>;
  useItem(a: { characterId: bigint; itemInstanceId: bigint }): Promise<void>;
  eatFood(a: { characterId: bigint; itemInstanceId: bigint }): Promise<void>;
  salvageItem(a: { characterId: bigint; itemInstanceId: bigint }): Promise<void>;
  learnRecipeScroll(a: { characterId: bigint; itemInstanceId: bigint }): Promise<void>;
  sellItem(a: { characterId: bigint; itemInstanceId: bigint; npcId: bigint }): Promise<void>;
  sellItemQuantity(a: { characterId: bigint; itemInstanceId: bigint; npcId: bigint; quantity: bigint }): Promise<void>;
  sellAllJunk(a: { characterId: bigint }): Promise<void>;
  buyItem(a: { characterId: bigint; npcId: bigint; itemTemplateId: bigint }): Promise<void>;
  /** Buy one unit from the listing the player clicked (the For sale row key). */
  buyListing(a: { characterId: bigint; listingId: bigint }): Promise<void>;
  buybackLastSale(a: { characterId: bigint }): Promise<void>;
  researchRecipes(a: { characterId: bigint }): Promise<void>;
  craftRecipe(a: {
    characterId: bigint;
    recipeTemplateId: bigint;
    catalystTemplateId?: bigint;
    modifier1TemplateId?: bigint;
    modifier2TemplateId?: bigint;
    modifier3TemplateId?: bigint;
  }): Promise<void>;
  chooseRenownPerk(a: { characterId: bigint; perkId: bigint }): Promise<void>;
}

/** The vendor the open Trade screen shows. */
export interface VendorTarget {
  npcId: bigint;
  npcName: string;
}

export interface LedgerData {
  /** The socket is connected and a connection object exists. */
  readonly connected: Readonly<Ref<boolean>>;
  /** The active character's item instances (equipped and in the backpack). */
  readonly items: List<ItemInstance>;
  /** The item_instance subscription has applied (an empty list then means an empty bag). */
  readonly itemsApplied: Readonly<Ref<boolean>>;
  /** Affixes of the active character's rolled, crafted and equipped instances. */
  readonly affixes: List<ItemAffix>;
  /** Templates the screens need (owned, vendor stock, recipe parts, the last sale), by id. */
  readonly templates: Readonly<Ref<ReadonlyMap<bigint, ItemTemplate>>>;
  /** The vendor the open Trade screen shows, or null; the header meta reads it. */
  readonly vendorTarget: Readonly<Ref<VendorTarget | null>>;
  /** The open vendor's stock; empty while no vendor is open. */
  readonly vendorStock: List<VendorInventory>;
  /** The vendor stock subscription has applied. */
  readonly vendorStockApplied: Readonly<Ref<boolean>>;
  /** The recipes the active character has discovered. */
  readonly recipesKnown: List<RecipeDiscovered>;
  /** The recipe_discovered subscription has applied. */
  readonly recipesApplied: Readonly<Ref<boolean>>;
  /** Definitions of the known recipes, by id. */
  readonly recipes: Readonly<Ref<ReadonlyMap<bigint, RecipeTemplate>>>;
  /** Renown perk choices waiting for the active character. */
  readonly pendingPerks: List<PendingRenownPerk>;
  /** The sender's last single sale (my_vendor_buyback), or null. */
  readonly lastSale: Readonly<Ref<VendorBuyback | null>>;
  /** Null unless connected: reducers are never exposed while reconnecting. */
  readonly reducers: Readonly<Ref<LedgerReducers | null>>;
  /** Open (or close, with null) the vendor stock subscription for an NPC. */
  setVendor(target: VendorTarget | null): void;
  /** Forget the vendor target (logout). */
  reset(): void;
  /** Dispose every binding and watcher. */
  dispose(): void;
}

export const LEDGER_KEY: InjectionKey<LedgerData> = Symbol('uwr.ledger');

// A constant, read-only ref. computed() keeps rows out of deep reactivity.
function constant<T>(value: T): Readonly<Ref<T>> {
  return computed(() => value);
}

function empty<T>(): List<T> {
  return constant<readonly T[]>([]);
}

export function createInertLedger(): LedgerData {
  return {
    connected: constant(false),
    items: empty<ItemInstance>(),
    itemsApplied: constant(false),
    affixes: empty<ItemAffix>(),
    templates: constant<ReadonlyMap<bigint, ItemTemplate>>(new Map()),
    vendorTarget: constant<VendorTarget | null>(null),
    vendorStock: empty<VendorInventory>(),
    vendorStockApplied: constant(false),
    recipesKnown: empty<RecipeDiscovered>(),
    recipesApplied: constant(false),
    recipes: constant<ReadonlyMap<bigint, RecipeTemplate>>(new Map()),
    pendingPerks: empty<PendingRenownPerk>(),
    lastSale: constant<VendorBuyback | null>(null),
    reducers: constant<LedgerReducers | null>(null),
    setVendor() {},
    reset() {},
    dispose() {},
  };
}
