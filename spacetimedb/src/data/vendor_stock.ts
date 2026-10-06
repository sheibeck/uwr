// Vendor base stock: the one rule set that decides what a vendor sells before any player sells it
// anything. Owner decision (Phase 50 CONTEXT, vendor base stock): stock is chosen by rules from item
// templates that already exist (the starter set and play), to suit the vendor's role and the area's
// level band, weighted toward common, with no LLM call and no new prompt.
// Callers: the restock_vendors reducer in the module's index file, and the client vendor test
// through @game-data (list price). Imports only ./mechanical_vocabulary, ./item_rules and ./recipe_rules (all import-light), so it stays
// browser-safe through @game-data. ES2020 only, never throws.
// Selection is seeded and deterministic: the same vendor, templates and tick time always give the
// same stock, from a 64-bit generator seeded with the vendor id and the tick timestamp. Nothing
// here reads an unseeded source.
import { isQuestItemTemplate, isRecipeScrollName } from './item_rules';
import { areaLevel } from './recipe_rules';
import { EQUIPMENT_SLOTS, QUALITY_TIERS, type ItemCategory, type QualityTier } from './mechanical_vocabulary';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How many base-stock listings a vendor carries (a small fixed count). */
export const BASE_STOCK_SIZE = 8;
/** Base stock is replaced about every 15 minutes. */
export const VENDOR_RESTOCK_INTERVAL_MICROS = 900_000_000n;
/** The next batch of the same pass runs one second later. */
export const VENDOR_RESTOCK_CONTINUE_MICROS = 1_000_000n;
/** Vendors restocked per tick, which bounds the work of one tick. */
export const VENDOR_RESTOCK_BATCH = 20;

/** Weighted toward common (16:4:1). Epic and legendary are never base stock. */
export const STOCK_RARITY_WEIGHTS: Record<QualityTier, bigint> = {
  common: 16n,
  uncommon: 4n,
  rare: 1n,
  epic: 0n,
  legendary: 0n,
};

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export const VENDOR_PROFILES = ['smith', 'outfitter', 'provisioner', 'general'] as const;
export type VendorProfile = (typeof VENDOR_PROFILES)[number];

export type StockCategory = Extract<ItemCategory, 'weapon' | 'armor' | 'accessory' | 'consumable' | 'resource'>;

/** What each profile sells: a provisioner sells food, consumables and materials; a smith sells weapons and armor. */
export const PROFILE_CATEGORIES: Record<VendorProfile, readonly StockCategory[]> = {
  smith: ['weapon', 'armor'],
  outfitter: ['armor', 'accessory'],
  provisioner: ['consumable', 'resource'],
  general: ['weapon', 'armor', 'accessory', 'consumable', 'resource'],
};

/** Lowercase singular words that point at a profile. The general profile has none. */
const PROFILE_KEYWORDS: Record<'smith' | 'outfitter' | 'provisioner', readonly string[]> = {
  smith: [
    'smith', 'blacksmith', 'weaponsmith', 'armorsmith', 'armorer', 'armourer', 'forge', 'anvil', 'weapon',
    'blade', 'sword', 'axe', 'mace', 'spear', 'dagger', 'armor', 'armour', 'mail', 'steel', 'shield',
    'bowyer', 'fletcher',
  ],
  outfitter: [
    'outfitter', 'tailor', 'clothier', 'tanner', 'leatherworker', 'cloak', 'clothes', 'clothing', 'garment',
    'boot', 'glove', 'hat', 'jewel', 'jeweler', 'jeweller', 'jewelry', 'jewellery', 'trinket', 'ring',
    'amulet', 'necklace', 'charm', 'bauble', 'curio',
  ],
  provisioner: [
    'provisioner', 'provision', 'supply', 'supplies', 'food', 'ration', 'bread', 'meat', 'fish', 'eel',
    'cheese', 'soup', 'stew', 'ale', 'tea', 'herb', 'salt', 'oil', 'lamp', 'lantern', 'candle', 'rope',
    'waterskin', 'pickled', 'grocer', 'grain', 'flour', 'torch', 'kindling', 'bandage', 'poultice', 'tonic',
    'potion',
  ],
};

const COUNTED_PROFILES = ['smith', 'outfitter', 'provisioner'] as const;

function hitsKeyword(token: string, keywords: readonly string[]): boolean {
  if (keywords.indexOf(token) !== -1) return true;
  if (token.length > 1 && token.charAt(token.length - 1) === 's' && keywords.indexOf(token.slice(0, -1)) !== -1) {
    return true;
  }
  if (token.length > 2 && token.slice(-2) === 'es' && keywords.indexOf(token.slice(0, -2)) !== -1) return true;
  return false;
}

/** The text a vendor's role is read from: description, greeting and every knowledgeDomains string. */
function profileText(vendor: {
  description?: string | null;
  greeting?: string | null;
  personalityJson?: string | null;
}): string {
  const parts: string[] = [];
  if (vendor && typeof vendor.description === 'string') parts.push(vendor.description);
  if (vendor && typeof vendor.greeting === 'string') parts.push(vendor.greeting);
  if (vendor && typeof vendor.personalityJson === 'string' && vendor.personalityJson !== '') {
    try {
      const parsed: unknown = JSON.parse(vendor.personalityJson);
      const domains =
        parsed !== null && typeof parsed === 'object' ? (parsed as { knowledgeDomains?: unknown }).knowledgeDomains : undefined;
      if (Array.isArray(domains)) {
        for (const entry of domains) {
          if (typeof entry === 'string') parts.push(entry);
        }
      }
    } catch (_error) {
      // Malformed personality text contributes nothing.
    }
  }
  return parts.join(' ');
}

/**
 * The vendor's role, read from its own text (there is no role column beyond npcType). The profile with
 * the most keyword hits wins, ties go to the earlier profile, and no hit at all means 'general'.
 */
export function vendorProfileOf(vendor: {
  description?: string | null;
  greeting?: string | null;
  personalityJson?: string | null;
}): VendorProfile {
  const tokens = profileText(vendor).toLowerCase().match(/[a-z]+/g) || [];
  let best: VendorProfile = 'general';
  let bestHits = 0;
  for (const profile of COUNTED_PROFILES) {
    const keywords = PROFILE_KEYWORDS[profile];
    let hits = 0;
    for (const token of tokens) {
      if (hitsKeyword(token, keywords)) hits += 1;
    }
    if (hits > bestHits) {
      best = profile;
      bestHits = hits;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

/** The item_template fields the rules read. */
export interface StockTemplate {
  id: bigint;
  name: string;
  slot: string;
  rarity: string;
  tier: bigint;
  isJunk: boolean;
  requiredLevel: bigint;
  vendorValue: bigint;
  weaponType?: string | null;
  wellFedDurationMicros?: bigint | null;
}

const ACCESSORY_SLOTS = ['neck', 'earrings', 'cloak'];

/**
 * Which stock category a template belongs to, or null when it can never be base stock: quest items,
 * junk, recipe scrolls and any slot this rule does not know.
 */
export function stockCategoryOf(template: StockTemplate): StockCategory | null {
  if (!template) return null;
  if (isQuestItemTemplate(template)) return null;
  if (template.isJunk || template.slot === 'junk') return null;
  if (isRecipeScrollName(template.name)) return null;
  const slot = template.slot;
  if ((EQUIPMENT_SLOTS as readonly string[]).indexOf(slot) !== -1) {
    if (slot === 'mainHand') return 'weapon';
    if (slot === 'offHand') {
      return typeof template.weaponType === 'string' && template.weaponType !== '' ? 'weapon' : 'armor';
    }
    if (ACCESSORY_SLOTS.indexOf(slot) !== -1) return 'accessory';
    return 'armor';
  }
  const fed = typeof template.wellFedDurationMicros === 'bigint' && template.wellFedDurationMicros > 0n;
  if (slot === 'food' || slot === 'consumable' || fed) return 'consumable';
  if (slot === 'material' || slot === 'resource') return 'resource';
  return null;
}

// ---------------------------------------------------------------------------
// Area level and band
// ---------------------------------------------------------------------------

function maxBig(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

// The area's level is defined once, in recipe_rules (the region's base level, danger / 100, plus the
// location offset, at least 1). The recipe level and the base-stock band must always agree, so this
// module re-exports that one function instead of keeping a second copy.
export { areaLevel };

/**
 * The level and tier window stock must fit. Levels follow the enemy clamp of world generation (the
 * area level plus or minus one); tiers follow the generated-template rule tier = max(1, floor(level / 3)),
 * applied to the band's top level.
 */
export function levelBand(level: bigint): { minLevel: bigint; maxLevel: bigint; minTier: bigint; maxTier: bigint } {
  const minLevel = maxBig(1n, level - 1n);
  const maxLevel = level + 1n;
  const maxTier = maxBig(1n, maxLevel / 3n);
  const minTier = maxBig(1n, maxTier - 1n);
  return { minLevel, maxLevel, minTier, maxTier };
}

/** The selection weight of a rarity: 0n for anything that is never stocked (or not a rarity). */
export function rarityWeight(rarity: string | null | undefined): bigint {
  if (typeof rarity !== 'string') return 0n;
  const key = rarity.trim().toLowerCase();
  if ((QUALITY_TIERS as readonly string[]).indexOf(key) === -1) return 0n;
  return STOCK_RARITY_WEIGHTS[key as QualityTier];
}

/**
 * True when a template may be base stock for a vendor profile in an area of this level. Gear fits by
 * required level; consumables and materials fit by tier (their required level is 1 everywhere).
 * Starter templates stay eligible.
 */
export function isBaseStockCandidate(template: StockTemplate, profile: VendorProfile, level: bigint): boolean {
  const category = stockCategoryOf(template);
  if (category === null) return false;
  if ((PROFILE_CATEGORIES[profile] as readonly string[]).indexOf(category) === -1) return false;
  if (rarityWeight(template.rarity) <= 0n) return false;
  const band = levelBand(level);
  if (category === 'consumable' || category === 'resource') {
    return template.tier >= band.minTier && template.tier <= band.maxTier;
  }
  return template.requiredLevel >= band.minLevel && template.requiredLevel <= band.maxLevel;
}

// ---------------------------------------------------------------------------
// Price and seed
// ---------------------------------------------------------------------------

/**
 * The list price of a vendor_inventory row: twice the vendor value, or 10 for a worthless item. This
 * is the same price a player resale gets. buy_item then applies the rapport price on top.
 */
export function listPriceFor(vendorValue: bigint): bigint {
  return vendorValue > 0n ? vendorValue * 2n : 10n;
}

/** The seed for one vendor at one restock tick (a context-based seed in the round-seed style). */
export function restockSeed(npcId: bigint, tickMicros: bigint): bigint {
  return tickMicros + npcId * 7919n;
}

/**
 * Units in stock for a base listing, by rarity. Weighted like the rarity weights, so common stock is
 * plentiful and rare stock is one or two.
 */
export const BASE_STOCK_QUANTITY: Readonly<Record<'common' | 'uncommon' | 'rare', readonly [bigint, bigint]>> = {
  common: [3n, 5n],
  uncommon: [2n, 3n],
  rare: [1n, 2n],
};

/**
 * The seeded, deterministic quantity of one base listing: within its rarity range, from the restock
 * seed and the template id. Anything that is not base-stock rarity gets 1n. Never 0n.
 */
export function baseStockQuantity(rarity: string | null | undefined, seed: bigint, templateId: bigint): bigint {
  const key = typeof rarity === 'string' ? rarity.trim().toLowerCase() : '';
  if (!Object.prototype.hasOwnProperty.call(BASE_STOCK_QUANTITY, key)) return 1n;
  const [min, max] = BASE_STOCK_QUANTITY[key as 'common' | 'uncommon' | 'rare'];
  const state = BigInt.asUintN(
    64,
    (BigInt.asUintN(64, seed) ^ BigInt.asUintN(64, templateId * 2654435761n)) * 6364136223846793005n + 1442695040888963407n,
  );
  return min + (state >> 33n) % (max - min + 1n);
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/**
 * Weighted picks without replacement, from a 64-bit linear congruential generator. The candidates are
 * sorted by id first, so the input order never matters. Returns the picks sorted by id.
 */
export function pickBaseStock<T extends { id: bigint; rarity: string }>(
  candidates: readonly T[],
  seed: bigint,
  count: number,
): T[] {
  const pool = candidates.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const picked: T[] = [];
  let state = BigInt.asUintN(64, seed);
  while (picked.length < count) {
    let total = 0n;
    for (const candidate of pool) total += rarityWeight(candidate.rarity);
    if (total <= 0n) break;
    state = BigInt.asUintN(64, state * 6364136223846793005n + 1442695040888963407n);
    const roll = (state >> 33n) % total;
    let cumulative = 0n;
    for (let i = 0; i < pool.length; i += 1) {
      cumulative += rarityWeight(pool[i].rarity);
      if (roll < cumulative) {
        picked.push(pool[i]);
        pool.splice(i, 1);
        break;
      }
    }
  }
  return picked.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * The base stock for one vendor at one tick: the templates that suit its profile and area band,
 * minus those it already lists, picked by seeded weights.
 */
export function selectBaseStock<T extends StockTemplate>(input: {
  templates: readonly T[];
  vendor: { id: bigint; description?: string | null; greeting?: string | null; personalityJson?: string | null };
  dangerMultiplier: bigint;
  levelOffset: bigint;
  excludeTemplateIds: readonly bigint[];
  tickMicros: bigint;
  count?: number;
}): T[] {
  const profile = vendorProfileOf(input.vendor);
  const level = areaLevel(input.dangerMultiplier, input.levelOffset);
  const excluded = input.excludeTemplateIds;
  const candidates = input.templates.filter(
    (template) => isBaseStockCandidate(template, profile, level) && excluded.indexOf(template.id) === -1,
  );
  return pickBaseStock(candidates, restockSeed(input.vendor.id, input.tickMicros), input.count === undefined ? BASE_STOCK_SIZE : input.count);
}

// ---------------------------------------------------------------------------
// Batching
// ---------------------------------------------------------------------------

/**
 * Which vendors one tick restocks: the unique ids above the cursor, ascending, first batchSize of
 * them. `more` says whether any remain; nextAfterNpcId is the cursor for the next tick (0n when done).
 */
export function planRestockBatch(
  vendorIds: readonly bigint[],
  afterNpcId: bigint,
  batchSize: number,
): { batch: bigint[]; more: boolean; nextAfterNpcId: bigint } {
  const unique: bigint[] = [];
  for (const id of vendorIds) {
    if (id > afterNpcId && unique.indexOf(id) === -1) unique.push(id);
  }
  unique.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const size = batchSize > 0 ? Math.floor(batchSize) : 0;
  const batch = unique.slice(0, size);
  const more = unique.length > batch.length;
  return { batch, more, nextAfterNpcId: more ? batch[batch.length - 1] : 0n };
}
