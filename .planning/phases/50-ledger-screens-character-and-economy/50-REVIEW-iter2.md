---
phase: 50-ledger-screens-character-and-economy
reviewed: 2026-10-06T22:21:18Z
depth: deep
iteration: 2
scope: "git diff e2f6dcb6..HEAD -- spacetimedb/src src (src/module_bindings excluded): server and client review fixes, gap plans 50-24, 50-25, 50-26, 50-27"
files_reviewed: 63
files_reviewed_list:
  - spacetimedb/src/data/crafting_rules.test.ts
  - spacetimedb/src/data/crafting_rules.ts
  - spacetimedb/src/data/inventory_rules.ts
  - spacetimedb/src/data/recipe_rules.test.ts
  - spacetimedb/src/data/recipe_rules.ts
  - spacetimedb/src/data/vendor_pricing.test.ts
  - spacetimedb/src/data/vendor_pricing.ts
  - spacetimedb/src/data/vendor_stock.test.ts
  - spacetimedb/src/data/vendor_stock.ts
  - spacetimedb/src/helpers/items.ts
  - spacetimedb/src/helpers/vendor_sale.ts
  - spacetimedb/src/index.ts
  - spacetimedb/src/reducers/craft_quality.test.ts
  - spacetimedb/src/reducers/intent.ts
  - spacetimedb/src/reducers/items.ts
  - spacetimedb/src/reducers/items_crafting.ts
  - spacetimedb/src/reducers/quest_item_sale.test.ts
  - spacetimedb/src/reducers/recipe_discovery.test.ts
  - spacetimedb/src/reducers/scheduled_guard.integration.test.ts
  - spacetimedb/src/reducers/vendor_buyback.test.ts
  - spacetimedb/src/reducers/vendor_pricing_parity.test.ts
  - spacetimedb/src/reducers/vendor_quantity.test.ts
  - spacetimedb/src/reducers/vendor_restock.test.ts
  - spacetimedb/src/schema/tables.ts
  - src/crafting/CraftingScreen.test.ts
  - src/crafting/CraftingScreen.vue
  - src/crafting/RecipeList.vue
  - src/crafting/generatedRecipes.test.ts
  - src/frame/AppFrame.vue
  - src/frame/frameContract.test.ts
  - src/frame/screenFocus.test.ts
  - src/frame/useScreens.test.ts
  - src/frame/useScreens.ts
  - src/inventory/Inspector.component.test.ts
  - src/inventory/Inspector.vue
  - src/inventory/InventoryScreen.test.ts
  - src/inventory/backpack.test.ts
  - src/inventory/backpack.ts
  - src/inventory/inspector.test.ts
  - src/inventory/inspector.ts
  - src/ledger/FilterChips.vue
  - src/ledger/InlineConfirm.vue
  - src/ledger/ledgerContext.ts
  - src/ledger/ledgerData.test.ts
  - src/ledger/ledgerData.ts
  - src/ledger/parts.test.ts
  - src/rails/ContextContent.test.ts
  - src/rails/NearbyList.vue
  - src/stats/PerkChooser.test.ts
  - src/stats/PerkChooser.vue
  - src/stats/RenownPanel.vue
  - src/stats/StatsScreen.test.ts
  - src/stats/StatsScreen.vue
  - src/vendor/ForSale.vue
  - src/vendor/JustSold.test.ts
  - src/vendor/JustSold.vue
  - src/vendor/SellPanel.test.ts
  - src/vendor/SellPanel.vue
  - src/vendor/SellQuantity.vue
  - src/vendor/VendorScreen.test.ts
  - src/vendor/VendorScreen.vue
  - src/vendor/vendorModel.test.ts
  - src/vendor/vendorModel.ts
findings:
  critical: 2
  warning: 3
  info: 7
  total: 12
status: issues_found
---

# Phase 50: Code Review Report (iteration 2)

**Reviewed:** 2026-10-06T22:21:18Z
**Depth:** deep. Cross-file: salvage_item, MATERIAL_DEFS, BASIC_RESOURCES, quest reward templates, hunger.ts, and the generated bindings for `sell_item_quantity` and `eat_food`.
**Files Reviewed:** 63
**Status:** issues_found

## Summary

This pass covers everything committed after e2f6dcb6:
- the iteration-1 server and client fixes
- 50-24: vendor base stock and the restock tick
- 50-25: rule-based recipe generation
- 50-26: finite stock, the price floor and `sell_item_quantity`
- 50-27: the client quantity picker and the sold-out states

**What holds up:**
- **Price floor.** `listingBuyPrice = max(raw, unitSellCeiling + 1)` holds on every buy path:
  - The proof is sound. `sellPayout` rounds down per call, so `sellPayout(v, q) <= q x exact rate < q x (ceiling + 1)`.
  - `buy_item` and the client For sale table both charge it.
  - There is no typed buy path.
  - Buy-back is the only exception, as the owner decided.
  - Swapping Charisma gear does not beat the floor, because buy and sell modifiers move together.
- **Finite stock conservation.** Every sale adds exactly the units sold (`addToVendorListing`). Every buy or buy-back takes exactly what it moves (`takeFromVendorListing`).
  - `buy_item` refuses at 0.
  - Buy-back checks that the listing still holds `sale.quantity`.
  - Reducers are serialized transactions, so buy, buy-back, sell and restock cannot interleave. No path creates or destroys a vendor unit, so sell-and-buy-back no longer duplicates.
- **Bigint safety.** Bigint quantities cannot underflow:
  - `sellInstanceToVendor` refuses `quantity < 1` and `quantity > have` before any write.
  - `takeFromVendorListing` clamps at 0.
  - The IN-01 orphan path passes `min(sale.quantity, listing.quantity)`.
- **Gold credit.** The typed multi-stack fix (credit the current row) is correct.
- **Restock.**
  - The guard is the first statement.
  - Work is bounded to 20 vendors per tick, with a cursor.
  - Only marked rows are deleted.
  - The marker is removed when a player sells into a base listing (`vendor_sale.ts:148-150`).
  - Templates that already have a player listing are excluded, so restock never adds a second row for the same template.
  - Arming the tick on connect is idempotent.
- **Recipe generation.**
  - It is pure and deterministic.
  - The key is `gen:{category}:{primary}+{secondary}:L{level}`.
  - `recipesByKey` stores each recipe once and shares it.
  - Every `item_template` and `recipe_template` column is supplied with the right type (checked against `schema/tables.ts:353-438`).
  - Generated recipes pass `planCraft`.
- **Client.**
  - The hub forwards `sellItemQuantity(a)` with object syntax, and its argument names match `sell_item_quantity_reducer.ts`.
  - The picker clamps to `1..stack`, accepts at most 9 digits, gives 44px targets on mobile and keeps the InlineConfirm focus and Esc pattern.
  - Sold-out rows keep their place and read `Sold out` through `aria-describedby`.
  - Just sold waits for `vendorStockApplied` before it can show `sold`.

**Main concerns:**
1. **Item duplication through crafting and salvage (CR-01).** The new generated recipes plug into the old `salvage_item` yield table. A Void Crystal accessory consumes 2 Void Crystal and salvages back to 3, an unbounded duplication and gold loop for the price of one Scrap Cloth.
2. **Unauthenticated item minting (CR-02).** `grant_item` and `create_item_template` are public reducers with no admin gate. Any client can mint any item or invent templates with any `vendorValue`. This predates the phase, but it defeats every economy guarantee this iteration adds, and both new systems now consume player-created templates (base stock and recipe material keys).

## Iteration-1 findings: verification

| Finding | Status | Evidence |
|---|---|---|
| Server CR-01 `sell_all_junk` sells quest items | Fixed | `items.ts:283` skips `isQuestItemTemplate` |
| Server WR-01 `planCraft` repeated material | Fixed | `crafting_rules.ts` merges with `need()`, then checks the merged totals |
| Server WR-02 `sell_item` npc not checked | Fixed | `items.ts:186-189` (`sellFromBag`). Also extended to `buy_item` (`:115-118`) and `sell_all_junk` (`:271-274`) |
| Server WR-03 orphaned affixes | Fixed | `items.ts:292-294` |
| Server WR-04 craft decorates an older instance | Fixed | `addItemToInventory` returns the row (`helpers/items.ts`), used at `items_crafting.ts:203` |
| Server IN-01 missing template reports "full" | Fixed | `items.ts:226-233` |
| Server IN-02 stackable buy-back fields | Documented | `vendor_sale.ts:83-87` |
| Server IN-03 buy-back deletes a shared listing | Resolved by 50-26 | Buy-back now takes only `sale.quantity` units |
| Server IN-04 perk percent text | Fixed | `appliedSellBonusPercent` / `appliedBuyDiscountPercent` on all five lines |
| Server IN-05 capacity comment | Fixed (comment) | `inventory_rules.ts:1-3` |
| Server IN-06 req3 skip by template id | Fixed | Requirement 3 is decided by position |
| Server IN-07 temporary item buy-back | Fixed | `vendor_sale.ts:267` |
| Server IN-08 test gaps | Fixed | Tests present |
| Client CR-01 crafted salvage confirmation | Fixed | `inspector.ts` `needsConfirm` includes `crafted` and `affixed` |
| Client WR-01 `eat_food` | Fixed | Kind `eat`, `Inspector.vue:117-119`; the hub forwards it |
| Client WR-02 Nearby Trade focus | Fixed | `NearbyList.vue` no longer closes first; `AppFrame.vue` uses the `replace` path for mobile sheets |
| Client WR-03 focus to body | Fixed | `CraftingScreen.vue`, `RecipeList.vue`, `VendorScreen.vue` |
| Client WR-04 Materials hidden with no recipes | Fixed | Empty-state shell keeps the column or the disclosure |
| Client WR-05 empty-state flash | Fixed | `ForSale` and `SellPanel` gate on the applied flags; Stats gear bars gate on `itemsApplied` |
| Client WR-06 44px choose button | Fixed | `RenownPanel.vue` `.mobile .choose-button::after` |
| Client WR-07 refusal treated as a take | Fixed | `PerkChooser.vue:60`, plus the `RenownPanel` rank watch |
| Client IN-01, 02, 03, 07, 08, 09, 10 | Fixed | As in `50-REVIEW-FIX-client.md` |
| Client IN-04, 05, 06, 11 | Open (accepted) | Unchanged; IN-05 is still a client/server mismatch |

No regressions were found in the iteration-1 fixes.

## Critical Issues

### CR-01: Crafting then salvaging a generated Void Crystal accessory turns 2 Void Crystal into 3 (unbounded item and gold duplication)

**File:**
- `spacetimedb/src/reducers/items_crafting.ts:369-377` (salvage material yield) and `:383-387` (reagent filter)
- `spacetimedb/src/data/crafting_rules.ts:203-207`, `:367-371`
- `spacetimedb/src/data/recipe_rules.ts:571` (`tier: primary.tier`)

**Issue:**
- **How the loop works.** 50-25 makes every carried material pair craftable, and the output template takes the primary material's tier. `salvage_item` still pays out by the old table: slot and tier pick the material, and `SALVAGE_YIELD_BY_TIER` sets the count (`{1: 2, 2: 2, 3: 3}`). Nothing ties the yield to what the recipe consumed. Trace:
  1. Bag: Void Crystal x2 (tier 3, value 10) and Scrap Cloth x1 (value 1), at a station. `recipeCandidates` gives `gen:accessory:void_crystal+scrap_cloth:L{n}`, which is "Void Crystal Pendant" (slot `neck`, tier 3).
  2. `craft_recipe` consumes 2 Void Crystal and 1 Scrap Cloth. `planCraft` passes without an Essence.
  3. `salvage_item`: `neck` at tier 3 gives `'Void Crystal'`, yield `SALVAGE_YIELD_BY_TIER[3] = 3n`.
  4. Net per cycle: +1 Void Crystal (sells for 10 or more) for 1 Scrap Cloth (base stock at provisioners, about 2 to 3 gold). It repeats forever, so the player mints items and gold.
- **The same rule also leaks value elsewhere:**
  - **Vendor base stock.** Generated gear is always `rarity: 'common'` and its `requiredLevel` is the area level, so outfitters and general vendors in a level 1-2 area stock "Void Crystal Pendant" (`vendorValue` 21) with 3 to 5 units per restock. With the 50% buy-discount perk, `listingBuyPrice` falls to the floor of 22. Salvaging gives 3 Void Crystal, worth 30. The floor protects sale against buy, but not salvage against buy.
  - **Reagent drops.** Crafted tier 2 and 3 armor gets an implicit `armorClassBonus` affix (`items_crafting.ts:246-258`). The salvage reagent filter counts implicit affixes, so a Shadowhide Jerkin (3 Shadowhide in, 3 Shadowhide back out) also yields a free Iron Ward 12% of the time. The only cost is the cheap secondary.
- **Test coverage.** No test crafts a tier 3 accessory and salvages it. `recipe_discovery.test.ts:533` checks only the tier 1 Iron Shard Dagger (3 in, 2 out).

**Fix:** Bound salvage by what the item is worth and by what the recipe consumed. Ignore implicit affixes for reagent drops:
```ts
// salvage_item, before the yield
const recipe = [...ctx.db.recipe_template.iter()].find((r) => r.outputTemplateId === instance.templateId);
let yieldCount = SALVAGE_YIELD_BY_TIER[Number(tier)] ?? 2n;
if (materialTemplate.vendorValue > 0n) {
  const byValue = template.vendorValue / materialTemplate.vendorValue;   // salvage never beats the item's value
  if (byValue < yieldCount) yieldCount = byValue;
}
if (recipe && recipe.req1TemplateId === materialTemplate.id && yieldCount >= recipe.req1Count) {
  yieldCount = recipe.req1Count - 1n;                                     // never a net gain of the primary
}
if (yieldCount > 0n) addItemToInventory(ctx, character.id, materialTemplate.id, yieldCount);
...
const affixStatKeys = new Set([...ctx.db.item_affix.by_instance.filter(instance.id)]
  .filter((a) => a.affixType !== 'implicit').map((a) => a.statKey));
```
Add a grid test. For every category and every material tier, run research, craft and salvage, then assert that the vendor value salvaged is strictly below the vendor value consumed. Also assert that buying any base-stock gear at `listingBuyPrice` and salvaging it never returns more sale value than the price paid.

### CR-02: `grant_item` and `create_item_template` let any client mint items and templates (pre-existing, but it voids the 50-24, 50-25 and 50-26 guarantees)

**File:**
- `spacetimedb/src/reducers/items.ts:37-99` (`create_item_template`, no auth at all)
- `spacetimedb/src/reducers/items.ts:101-106` (`grant_item`, owner check only)
- Both are exported to clients (`src/module_bindings/grant_item_reducer.ts`, `create_item_template_reducer.ts`).

**Issue:** Neither reducer checks for an admin, so any connected identity can:
- **Mint items.** It calls `grant_item({ characterId: own, templateId })` for any template, as many times as it likes, and sells the results. Finite stock, the price floor and buy-back are all bypassed.
- **Invent templates.** It calls `create_item_template` with `vendorValue` up to `u64::MAX`, `rarity: 'common'` and `slot: 'resource'`/`'consumable'`/any gear slot. Since this phase, such a template also:
  - becomes vendor base stock for every vendor of the matching profile and band (`stockCategoryOf` accepts it; `restock_vendors` reads every `item_template`), so it pollutes every shop
  - enters recipe generation by name. A template named `"void crystal"` maps to key `void_crystal` (`materialKey` lowercases), and `generatedOutput` sets the shared output `vendorValue` from `primary.vendorValue`, so a forged value is written into a shared world recipe and output template.

The finding is pre-existing (since 6f22b2d9). It is classified Critical because this iteration's whole purpose is closing economy exploits, and these two reducers make every one of those fixes moot.

**Fix:** Gate both reducers with the existing admin check (as `set_app_version` does), or delete them if nothing calls them. The client calls neither (`grep grantItem|createItemTemplate src` finds nothing outside the bindings).
```ts
spacetimedb.reducer('grant_item', {...}, (ctx, args) => {
  requireAdmin(ctx);   // pass requireAdmin through deps
  ...
});
```
Add real-handler tests that show a non-admin call throws and writes nothing.

## Warnings

### WR-01: `buy_item` ignores the listing's quality tier: it sells from a listing the player did not pick and can break someone else's buy-back

**File:** `spacetimedb/src/reducers/items.ts:123-127, 156-157`; `src/vendor/vendorModel.ts:230-276` (rows keyed per listing; rarity from the template only); `src/vendor/ForSale.vue:77-85`

**Issue:**
- **Where tier-split listings come from.** Sales are listed per template and tier (`findVendorListing`). A crafted item is stored with `qualityTier: 'common'`, while base stock has `undefined`, so one template can sit in two listings. Rare loot sold whole gives a `'rare'` listing.
- **What the client sends.** The For sale table shows one row per listing, but both rows look identical (rarity comes from the template). Buy sends only `itemTemplateId`.
- **What the server does.** `buy_item` takes one unit from the lowest-id listing of that template that has stock, whatever its tier, and always hands out a plain instance. As a result:
  - The row the player clicked may not be the one that goes down. For example, they click the `×5` base row and the `×1` player-sold row disappears.
  - A rare-tier unit is sold as a plain common item.
  - The seller of that unit then gets `{Vendor} has already sold {item}.` on buy-back, because `findVendorListing(..., sale.qualityTier)` now finds 0, even though base units of the same template are still on the shelf.
- **Why it matters now.** Before finite stock this was cosmetic. With finite stock it moves real units between listings.

**Fix:** Buy a specific listing. Add a reducer `buy_listing({ characterId, listingId })` (positional BSATN, so `buy_item` keeps its layout for old clients) that checks `listing.npcId` against the vendor here, uses `listing.qualityTier` for the instance (`qualityTier` on the new instance), and calls `takeFromVendorListing(listing, 1n)`. Have `ForSale.onBuy` send `row.key`, and use the runner key `buy:${listingId}`. If that is out of scope, at least make `buy_item` prefer the listing with `qualityTier === undefined` and document the behavior.

### WR-02: Selling one unit into a base-stock listing turns all of its base units into permanent player stock and stops that template from rotating

**File:** `spacetimedb/src/helpers/vendor_sale.ts:141-151`; `spacetimedb/src/index.ts:352-364`

**Issue:**
- **What happens.** `addToVendorListing` merges player units into the existing base row and deletes its marker. Selling 1 Herbs into a base listing of `×5` gives a `×6` row that restock never touches again. From then on, `excludeTemplateIds` keeps that template out of every later base selection until a buyer empties the row.
- **Effects:**
  - **Bounded work.** Each restock adds up to `BASE_STOCK_SIZE` fresh marked rows, while the de-marked ones stay. A player who sells one cheap unit into each new base row every 15 minutes grows a vendor's listing count without the 8-row bound, up to the size of the template pool.
  - **Owner rule.** "Base stock gets a finite quantity per restock" stops holding for those units. A player can also keep a rotating rare listing from leaving.
  - **Test.** The 50-26 test only checks that player units survive, not what happens to the base units.

**Fix:** Keep player units in their own row. In `addToVendorListing`, ignore marked rows when looking for an existing listing:
```ts
const existing = [...ctx.db.vendor_inventory.by_vendor.filter(input.npcId)]
  .filter((row: any) => !ctx.db.vendor_base_stock.listingId.find(row.id) && sameTemplateAndTier(row, input))
  .sort(byId)[0];
```
`buyback_last_sale` must look up the same non-base row, or any row with enough stock. Restock already excludes templates that have a player row, so the next tick drops the base row and no duplicate is ever created. `buy_item` then sells base units first (lowest id). Update `stillStocked` in `vendorModel.ts:558` to match.

### WR-03: Recipe generation reads materials by name only, so quest items, gear or junk with a material's name become recipe inputs, and the first holder's template id is baked into the shared recipe

**File:** `spacetimedb/src/reducers/items_crafting.ts:42-59`; `spacetimedb/src/data/recipe_rules.ts:294-330`

**Issue:**
- **How a non-material gets in.** The bag passed to `recipeCandidates` is every non-equipped instance of every template. `materialKind` matches on `materialKey(name)` (lowercased, with underscores) and never looks at `slot`. A quest item (`slot: 'quest'`), a quest reward (`questRewardItemName` avoids only exact-case clashes, so `"stone"` or `"Salt"` pass) or a junk or gear template that shares a material's key is therefore treated as that material.
- **What it costs the holder.** `craft_recipe` then consumes it, and nothing in `planCraft` or `removeItemFromInventory` refuses a quest template.
- **What it costs everyone else.** `heldParts` picks the lowest held template id per key, and the recipe is stored once per key with that id as `req1TemplateId`/`req2TemplateId`. If the first discoverer held the impostor, every later discoverer of that key gets a recipe that needs the impostor template, and they can never craft it.

**Fix:** Build the bag only from real materials:
```ts
const template = ctx.db.item_template.id.find(templateId);
if (!template || template.slot !== 'material' || isQuestItemTemplate(template)) continue;
```
Also add a `heldParts` test with two templates sharing a key, one of them a quest item.

## Info

### IN-01: The typed `shop` lists the raw list price, not the price `buy_item` charges

**File:** `spacetimedb/src/reducers/intent.ts:549`
**Issue:** The line shows `${vi.price} gold`, the list price before the perk discount, the Charisma discount and the floor. The For sale table and `buy_item` use `listingBuyPrice`, so the console and the screen disagree.
**Fix:** Compute `listingBuyPrice({...})` with the character's perks and modifiers, as `buy_item` does.

### IN-02: "Crafting then selling never beats selling the inputs" is not strictly true

**File:** `spacetimedb/src/data/recipe_rules.ts:548, 573`
**Issue:**
- **Rounding.** Selling the output once rounds once, while the inputs, sold as separate stacks, round per stack. With a sell bonus, `floor(S x k)` can exceed `sum(floor(v_i x n_i x k))`. Example: k = 1.33, 3 Copper Ore plus 1 Scrap Cloth; the inputs pay 7 + 1 = 8 and the output (value 7) pays 9.
- **Minimum value.** `max(1, summed)` gives an output worth 1 when the inputs are worth 0.

The gain is tiny and bounded, but the 50-25 summary states the opposite.
**Fix:** Correct the comment and summary, or set `vendorValue` from the rounded-down sum of the input payouts.

### IN-03: `areaLevel` is defined twice

**File:** `spacetimedb/src/data/recipe_rules.ts:204`, `spacetimedb/src/data/vendor_stock.ts:189`
**Issue:** The two functions are identical and must stay that way (the recipe level and the base-stock band are meant to agree). Nothing pins them together.
**Fix:** Keep one, and import it in the other module (both are import-light `@game-data` modules), or add a parity test.

### IN-04: The picker's typed number only takes effect on `change`, so the prompt and the confirm label lag behind the field

**File:** `src/vendor/SellQuantity.vue:46-56, 80-87`
**Issue:**
- **The lag.** A player who types `7` and clicks the confirm button, which still reads `Sell 1`, sells 7: `change` fires on blur, before the click.
- **No announcement.** The prompt that carries the payout (`Sell q of n … for g gold?`) is not in a live region, so screen-reader users hear no new total after the minus, plus, 1 and All buttons.

**Fix:** Parse on `@input` (keep the reset-on-invalid behaviour for `change`). Put the prompt inside InlineConfirm in an `aria-live="polite"` span.

### IN-05: Buy-back rows from before 50-26 can be refused as "already sold"

**File:** `spacetimedb/src/reducers/items.ts:242-245`; `spacetimedb/src/schema/tables.ts:895`
**Issue:** Listings created before the column existed read `quantity` 1 (the default). A pre-50-26 buy-back row for a stack sale (`sale.quantity > 1`) now fails `listing.quantity < sale.quantity` and stays until the next sale. This only affects local data.
**Fix:** Accept it (greenfield), or treat a legacy listing as covering the recorded quantity once.

### IN-06: Typed `sell N` edge cases

**File:** `spacetimedb/src/reducers/intent.ts:969, 1023-1027`
**Issue:**
- **Zero quantity.** `sell 0 shard` sells one unit (`wanted` is forced up to 1n), while the window path refuses 0 with `Choose at least one to sell.`.
- **Mixed templates.** The name match is a substring, so `sell 5 shard` can span Iron Shard and Bone Shard stacks. The line then says `You sell 5x Bone Shard`, naming only the last template.

**Fix:** Refuse `wanted < 1n` with the window's line, and restrict the plan to the template of the first match (or name every template in the line).

### IN-07: Test gaps

**Files:** `spacetimedb/src/reducers/recipe_discovery.test.ts`, `vendor_quantity.test.ts`, `vendor_restock.test.ts`, `quest_item_sale.test.ts`
**Issue:** These cases have no test:
- craft then salvage net yield for tier 2 and 3 primaries, and for accessories (CR-01)
- a non-admin `grant_item` or `create_item_template` (CR-02)
- `buy_item` with two listings of one template at different tiers, and the effect on the seller's buy-back (WR-01)
- the base units after a player sells into a base row, and the vendor's row count over several restocks (WR-02)
- a bag holding a quest or gear template with a material's name (WR-03)

**Fix:** Add the listed real-handler tests.

---

_Reviewed: 2026-10-06T22:21:18Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
