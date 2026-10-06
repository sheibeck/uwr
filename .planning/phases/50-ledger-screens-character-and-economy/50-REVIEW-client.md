---
phase: 50-ledger-screens-character-and-economy
reviewed: 2026-10-06T23:30:00Z
depth: standard
files_reviewed: 86
files_reviewed_list:
  - src/App.test.ts
  - src/App.vue
  - src/console/useConsole.test.ts
  - src/crafting/CraftingMeta.vue
  - src/crafting/CraftingScreen.test.ts
  - src/crafting/CraftingScreen.vue
  - src/crafting/MaterialsOnHand.vue
  - src/crafting/ReagentPicker.test.ts
  - src/crafting/ReagentPicker.vue
  - src/crafting/RecipeDetail.vue
  - src/crafting/RecipeList.vue
  - src/crafting/craftingModel.test.ts
  - src/crafting/craftingModel.ts
  - src/crafting/useWideLayout.ts
  - src/frame/AppFrame.screens.test.ts
  - src/frame/AppFrame.vue
  - src/frame/frameControls.test.ts
  - src/game/context.ts
  - src/gameDataAlias.test.ts
  - src/input/infoCommands.test.ts
  - src/input/infoCommands.ts
  - src/inventory/BackpackGrid.vue
  - src/inventory/EquippedSlots.vue
  - src/inventory/Inspector.component.test.ts
  - src/inventory/Inspector.vue
  - src/inventory/InventoryMeta.vue
  - src/inventory/InventoryScreen.test.ts
  - src/inventory/InventoryScreen.vue
  - src/inventory/backpack.test.ts
  - src/inventory/backpack.ts
  - src/inventory/inspector.test.ts
  - src/inventory/inspector.ts
  - src/ledger/FilterChips.vue
  - src/ledger/GoldAmount.vue
  - src/ledger/InlineConfirm.vue
  - src/ledger/ItemTile.vue
  - src/ledger/NoticeLine.test.ts
  - src/ledger/NoticeLine.vue
  - src/ledger/SegTabs.vue
  - src/ledger/actionRunner.test.ts
  - src/ledger/actionRunner.ts
  - src/ledger/compare.test.ts
  - src/ledger/compare.ts
  - src/ledger/itemModel.test.ts
  - src/ledger/itemModel.ts
  - src/ledger/ledgerContext.ts
  - src/ledger/ledgerData.test.ts
  - src/ledger/ledgerData.ts
  - src/ledger/parts.test.ts
  - src/ledger/queries.test.ts
  - src/ledger/queries.ts
  - src/module_bindings/buyback_last_sale_reducer.ts
  - src/module_bindings/index.ts
  - src/module_bindings/my_vendor_buyback_table.ts
  - src/module_bindings/types.ts
  - src/module_bindings/types/reducers.ts
  - src/rails/ContextContent.test.ts
  - src/rails/NearbyList.vue
  - src/screens/screens.test.ts
  - src/screens/screens.ts
  - src/session/useSession.test.ts
  - src/session/useSession.ts
  - src/stats/DerivedTable.vue
  - src/stats/FactionList.vue
  - src/stats/PerkChooser.test.ts
  - src/stats/PerkChooser.vue
  - src/stats/RenownPanel.vue
  - src/stats/StatBars.vue
  - src/stats/StatsMeta.vue
  - src/stats/StatsScreen.test.ts
  - src/stats/StatsScreen.vue
  - src/stats/format.test.ts
  - src/stats/format.ts
  - src/stats/statsModel.test.ts
  - src/stats/statsModel.ts
  - src/styles/designContract.test.ts
  - src/vendor/ForSale.vue
  - src/vendor/JustSold.test.ts
  - src/vendor/JustSold.vue
  - src/vendor/SellPanel.test.ts
  - src/vendor/SellPanel.vue
  - src/vendor/VendorMeta.vue
  - src/vendor/VendorScreen.test.ts
  - src/vendor/VendorScreen.vue
  - src/vendor/vendorModel.test.ts
  - src/vendor/vendorModel.ts
findings:
  critical: 1
  warning: 7
  info: 11
  total: 19
status: issues_found
---

# Phase 50: Code Review Report (client)

**Reviewed:** 2026-10-06T23:30:00Z
**Depth:** standard
**Files Reviewed:** 86
**Status:** issues_found

## Summary

I reviewed the Phase 50 client changes: the LedgerData hub, the action runner, the four Ledger screens and their models, the frame changes (`screenArgs`, `ScreenDef.meta`, the Trade title) and the two guard-test edits. Where a client rule mirrors a server rule, I read the server code too: `items.ts`, `items_crafting.ts`, `vendor_sale.ts`, `crafting_rules.ts`, `inventory_rules.ts`, `item_usability.ts`, `hunger.ts`, `renown.ts`, and the SDK's `ReducerResult` path.

**What holds up:**
- **Reducer wiring.**
  - All 12 `LedgerReducers` are reached from the UI. They use object syntax, and their argument names match the generated bindings.
  - Nothing is sent while offline: reducers are null unless connected, and the runner checks `online`. The combat lock closes the screens.
  - Nothing is optimistic.
- **Subscriptions.**
  - Every subscription is filtered, and each keyed binding's client filter matches its query.
  - Logout clears the rows: `activeCharacterId` goes to null, which resets every keyed binding.
  - The hub is disposed with the session.
- **Shared rules.** These all match the server code:
  - `planCraft` parity
  - sell payout and buy price (`sellPayout`, `buyPrice`)
  - the equip rule (`canEquipItem`)
  - the stat sums: `character.str` and the other stat columns are base values, and `getEquippedBonuses` uses the same template-plus-affix sum
  - the derived-stat 1000 scale
- **Text safety.** I found no `v-html`, `innerHTML`, `replaceAll`, `.at` or `Object.hasOwn`.

**Main concerns:**
1. **Crafted gear salvages without confirmation (data loss).** `craft_recipe` stores every crafted item with `qualityTier: 'common'`. As a result, the most expensive items in the crafting loop (essence and reagents consumed, affixes applied) salvage on one click.
2. **Food cannot be eaten from the inventory.** `eat_food` was wired in the v2.2 client and is not wired here, and no other client path calls it.
3. **Focus management.** Nearby's Trade calls `closeScreen()` and then `openScreen()`, so a deferred focus restore steals focus from the newly opened drawer or sheet. Three other actions remove the focused control and leave focus on `body`.
4. **Crafting with no known recipes hides Materials on hand completely.** The owner try-out list says the opposite.

**Guard edits:**
- The 50-22 designContract change is sound.
- The 50-17 frameContract change is acceptable but broader than it needs to be (IN-07).

## Critical Issues

### CR-01: Crafted gear (any quality, with affixes) is salvaged on one click, with no confirmation

**File:** `src/inventory/inspector.ts:251` (rarity from `itemRarity`, line 192)

**Issue:**
- `needsConfirm` is `salvageVisible && (rarity !== 'common' || equipped)`, and `itemRarity` reads `instance.qualityTier` first.
- `craft_recipe` always writes `qualityTier = 'common'` on the crafted instance (`spacetimedb/src/reducers/items_crafting.ts`, `const qualityTier = 'common'`).
- The result: an Exquisite crafted helm with three reagent affixes, sitting in the bag, is destroyed by a single press of `Salvage item`. Salvage cannot be undone, and buy-back does not cover it.
- The CONTEXT default ("salvaging an item above common rarity asks once") was meant to protect valuable items. For crafted gear it protects nothing.
- No test covers a crafted item.

**Fix:** Treat crafted or affixed instances as valuable:
```ts
const crafted = filled(instance.craftQuality);
const affixed = affixesFor(instance.id, affixes).some((a) => a.affixType !== 'implicit');
needsConfirm: salvageVisible && (rarity !== 'common' || equipped || crafted || affixed),
```
Add an `inspector.test.ts` case: a bag item with `qualityTier: 'common'` and `craftQuality: 'exquisite'` must ask first.

## Warnings

### WR-01: Food items have no action; the existing `eat_food` reducer is never called

**File:** `src/inventory/inspector.ts:243`, `src/ledger/ledgerContext.ts:21-41`

**Issue:**
- `Use` is offered only when `category === 'food' && isUsableItemName(name)`. That covers only the four hard-coded `use_item` keys.
- Every other Food-filter item gets no action row: generated foods with `slot: 'food'` and `wellFedDurationMicros > 0`. The server consumes these through `eat_food` (`spacetimedb/src/reducers/hunger.ts:19`).
- `eat_food` is not in `LedgerReducers` and is called nowhere in the client. The v2.2 client called `eatFood` for eatable items (`v2.2-client:src/App.vue:1420`), so this is a regression.
- The UI-SPEC row "Food or consumable: Use" is unmet for real food. This is also the CLAUDE.md "client must call the reducer" rule.

**Fix:**
1. Add `eatFood(a: { characterId; itemInstanceId })` to `LedgerReducers` and to the hub's forwarding map.
2. In `inspectorView`, add a primary of kind `'eat'` when `template.slot === 'food'` and the item is not one of the `use_item` keys: label `Eat item`, mobile label `Eat`.
3. In `Inspector.onPrimary`, call `reducers.eatFood({ characterId, itemInstanceId })` for that kind.
4. Add tests for the kind table and the call.

### WR-02: Nearby Trade steals focus from the new screen and, on mobile, loses the opener

**File:** `src/rails/NearbyList.vue:102-106`, with `src/frame/useScreens.ts:59-66` and `src/frame/AppFrame.vue:60-62`

**Issue:** `trade()` calls `frame.closeScreen()` and then `frame.openScreen('vendor', …)` in the same tick.
- **Stray focus restore.** `close()` schedules `nextTick(() => previousOpener.focus())`. That callback runs after the flush that mounts the new Drawer or Sheet, which has just focused its close button. Focus then jumps to the previous opener: the header Bag button, the earlier Trade button or the Map tab. This breaks "Focus goes to the close button on open".
- **Mobile path.** On mobile, Nearby lives inside the Map sheet (`MapScreen.vue` renders `ContextContent`).
  - The opener recorded for Trade is the Trade button inside the Map sheet, which unmounts.
  - Focus first lands on the Map tab, behind the `aria-modal` Trade sheet.
  - Closing Trade then finds a disconnected opener, so focus falls to `body`.
- This is the main mobile path into Trade, and no test covers the focus behaviour. The pattern is inherited from `useConsole.trade()`, but Phase 50 kept it.

**Fix:** Drop the `closeScreen()` call. `screens.open()` already replaces the active screen, and `screenArgs` is reassigned after the open. If the close is still wanted, add a `replace` path in `useScreens` that keeps the original opener and skips the deferred focus. On mobile, store the Map tab (the sheet's own opener) as the vendor's opener when the clicked element lives inside the closing sheet. Add a frame test: with Bag open, Trade must leave focus on the Trade drawer's close button after `nextTick`.

### WR-03: Focus falls to `body` when an action removes the focused control

**File:**
- `src/crafting/CraftingScreen.vue:40-43` (mobile row opens the detail view, and `v-show` hides the focused row)
- `src/vendor/VendorScreen.vue:108` (`choose()`: the `Vendors here` list is replaced by the band)
- `src/crafting/RecipeList.vue:92` (`Show all {n} recipes` removes itself)

**Issue:** The UI-SPEC Accessibility Contract says focus "never falls to `body`". In each of these three cases the focused button disappears and nothing moves focus. The Sheet trap then sends the next Tab to the close button, and a screen reader announces nothing about the new view. No test covers these cases. The existing mobile test only checks the reverse path, back to the list.

**Fix:**
- **Mobile recipe detail.** After `view.value = 'detail'`, `await nextTick()` and focus the `All recipes` back button, or the `h4` with `tabindex="-1"`.
- **Vendor pick.** After `choose()`, focus the `For sale` heading, or the band name with `tabindex="-1"`.
- **Show all.** After `showAll()`, focus the first recipe row.
- **Tests.** Add an `activeElement` assertion for each case.

### WR-04: With no recipes known, Materials on hand is not shown at all

**File:** `src/crafting/CraftingScreen.vue:63-66`, `src/crafting/RecipeList.vue:114-131`

**Issue:**
- When `noneKnown`, the screen renders only `<RecipeList :selected-id="null">`, with neither `show-materials-disclosure` nor the wide Materials column. `RecipeList`'s `noRecipesKnown` branch then renders only the EmptyState and Discover.
- Materials on hand is therefore hidden on every layout exactly when it matters most: `research_recipes` discovers recipes from the materials you hold.
- The UI-SPEC layout keeps the Materials column at 1200px and wider.
- The 50-23 owner try-out list says that in this state "Materials on hand lists the eight stacks", which is false. The local database has no recipes, so the owner will see this immediately.

**Fix:**
- Keep the layout shell when `noneKnown`:
  - render `MaterialsOnHand mode="column"` at the wide tier
  - pass `show-materials-disclosure` below that tier and on mobile
  - render the disclosure in `RecipeList`'s empty branch as well
- Add a screen test: with no known recipes, the materials grid or disclosure is present.

### WR-05: "{Vendor} has nothing for sale right now." flashes before the stock subscription applies

**File:** `src/vendor/ForSale.vue:53`, `src/vendor/vendorModel.ts:270`

**Issue:**
- `ledger.vendorStockApplied` is exposed but never read anywhere.
- `forSaleEmptyText` returns the empty sentence as soon as `stock.length === 0`. That is always the case for a moment after `setVendor`, because the `vendor_inventory` binding swaps immediately. Every Trade open therefore shows a wrong "nothing for sale" line until the rows arrive.
- This violates the UI-SPEC rule "Nothing renders until the subscription applies, so empty states never flash".
- The same gap, with lower impact, exists elsewhere:
  - `SellPanel.vue:173,251` and `StatsScreen.vue:39` do not gate on `itemsApplied`.
  - Gear segments render as 0 and the sell list as empty until the items apply.
- Every vendor test fakes `vendorStockApplied: ref(true)`, so none covers this.

**Fix:** In `ForSale`, render no empty line and no table while `!ledger.vendorStockApplied.value`. Gate `SellPanel`'s empty line and the Stats gear bars on `ledger.itemsApplied`. Add a test with `vendorStockApplied: false` that asserts no empty text.

### WR-06: The mobile "Choose rank N perk" button has no 44px target

**File:** `src/stats/RenownPanel.vue:60` (template), `133-138` (style)

**Issue:**
- `.choose-button` is a `.tag` with `padding: 4px 8px` and `position: relative`, but it has no `::after` hit-area slop and no mobile `min-height`.
- The component takes a `mobile` prop and never applies it to this button.
- It is the only way to reach the perk chooser on the mobile Renown tab, and the UI-SPEC requires 44px for every mobile control (or an `::after` slop for chips).
- The "keeps the mobile 44px rules in the source" tests do not cover it.

**Fix:**
```css
.renown.mobile .choose-button::after { content: ''; position: absolute; top: 50%; left: 0; right: 0; height: 44px; transform: translateY(-50%); }
```
Also add `:class="{ mobile: props.mobile }"` on the root and a source test.

### WR-07: PerkChooser treats a server refusal as a successful take

**File:** `src/stats/PerkChooser.vue:48-57`, `src/stats/RenownPanel.vue` (`onTaken`)

**Issue:**
- `choose_renown_perk` refuses through `fail()` ("No pending renown perk choices", "Invalid perk selection"), so the reducer promise resolves.
- `take()` emits `taken` whenever `runner.run` resolves true. On a refusal, the chooser therefore closes and focus moves to the perk heading as if the perk had been taken, while the pending rows (and the choose button) are still there.
- The same "resolved means it worked" assumption sits in `JustSold.vue:67`: `attempt = 'ok'` after a refused buy-back, which is harmless today.

**Fix:** Close on the data, not on the promise. Note the chosen `perkId` and emit `taken` only when that pending row is gone from `ledger.pendingPerks` (watch it). The SDK applies the transaction's row updates before it resolves the reducer promise (`node_modules/spacetimedb/dist/sdk/index.mjs:6315-6345`), so a check right after `await` is reliable. Leave the chooser open on a refusal, and let the notice line show the server text.

## Info

### IN-01: Empty-tile count uses the rendered entries, not the slot count

**File:** `src/inventory/backpack.ts:84`

**Issue:** `emptyCount = cap - sorted.length`. `sorted` drops instances whose template has not arrived yet, so the grid shows extra empty tiles (and a wrong free-space picture) while templates load. It can also disagree with the `{used} / {cap}` header.

**Fix:** Use `Math.max(0, usage.cap - usage.used)`.

### IN-02: A character switch shows the previous character's rows until the new subscription applies

**File:** `src/ledger/ledgerData.ts:295-320`

**Issue:**
- Items, known recipes, pending perks and the last sale use the default `onApplied` swap.
- After `activeCharacterId` changes, the old character's bag, perks and last sale stay current, with `itemsApplied` true, until the new binding applies.
- Any action in that window pairs the new `characterId` with old instance or perk ids. The server refuses these, so the impact is low, and the screens are normally closed during a switch.
- The hub applies `'immediate'` to the vendor stock for exactly this reason.

**Fix:** Pass `'immediate'` for the character-keyed bindings, and rely on `itemsApplied` to suppress rendering in the gap.

### IN-03: The Sell all junk preview and the row list disagree about quest-flagged junk; the server path does not refuse quest items

**File:** `src/vendor/vendorModel.ts:335` vs `:398`

**Issue:**
- `sellRows` treats an item that is both quest and junk as an unsellable quest row, but `junkSummary` counts it.
- The reducer the UI calls, `sell_all_junk` (`spacetimedb/src/reducers/items.ts`), has no quest check. 50-23's claim that "the server refuses quest sales on all four sell paths" covers the typed `sell junk` intent, not this reducer.
- No live template is both quest and junk today.

**Fix:** Skip `isQuestItemTemplate` in `junkSummary`, and add the same guard to `sell_all_junk` on the server.

### IN-04: The comparison ignores the off-hand lost to a two-handed weapon

**File:** `src/inventory/inspector.ts:204-210`

**Issue:** `equip_item` auto-unequips the off-hand for a two-handed main-hand weapon. The ▲/▼ rows compare main hand only, so a shield's AC loss is not shown. This matches the UI-SPEC's per-slot rule, but it can mislead.

**Fix:** Optionally add a caption: `Also unequips {off-hand name}`.

### IN-05: The buy-back "place" rule is stricter on the client than on the server

**File:** `src/vendor/vendorModel.ts:495-502`

**Issue:** The client requires both the sale's NPC to equal the open vendor and the location to match. `buyback_last_sale` checks only the location. With two vendors at one location, the client blocks a buy-back the server would allow. This follows the UI-SPEC table, so it is noted only.

**Fix:** Align the two sides, either by adding the NPC check to the server or by dropping it from the client.

### IN-06: The Sell all junk confirmation text is live

**File:** `src/vendor/SellPanel.vue` (`junk.prompt`)

**Issue:** The prompt recomputes while the confirmation is open. Junk looted in between changes the count the player reads, and the server sells whatever is junk at execution time.

**Fix:** Optionally snapshot the count and gold when the confirmation opens, and re-ask if they change.

### IN-07: The guard-test edits

**File:**
- `src/frame/frameContract.test.ts:89` (50-17, outside the scope list; read for this verdict)
- `src/styles/designContract.test.ts:228` (50-22)

**Issue:**
- **50-22, designContract: sound.**
  - Skipping relative specifiers still flags every package and alias import (`@iconify/vue`, `@/…`).
  - The separate `Ph*`-name check still catches a relative re-export of Phosphor names.
  - A local file that wraps another icon library would itself be flagged where it imports the package.
- **50-17, frameContract: acceptable but broad.**
  - `(min-width: 1200px)` is now allowed in every `.vue` file, not only the four Ledger screen folders.
  - The same breakpoint is duplicated as a JS literal in `src/crafting/useWideLayout.ts:9,11`, which no guard checks. The CSS and JS tiers can drift apart.

**Fix:** Scope the 1200px allowance to `src/(inventory|stats|vendor|crafting)/`. Export the 1200 tier from one module next to `DESKTOP_QUERY`, and assert that `WIDE_QUERY` equals it.

### IN-08: Escape-test gaps

**File:** `src/stats/StatsScreen.test.ts`, `src/vendor/VendorScreen.test.ts`, `src/inventory/Inspector.component.test.ts`

**Issue:** No img-onerror test covers these server strings:
- in `StatsMeta`: the character name and the bind-location name
- in the mobile Stats identity row: the character name
- in the `Vendors here` list: the vendor names
- in the salvage `InlineConfirm`: the prompt, which embeds the item name

All of these render as text nodes today, so this is a coverage gap, not a defect.

**Fix:** Add one XSS assertion per surface.

### IN-09: The owner try-out list and deferred UAT have inaccuracies

**File:** `.planning/phases/50-ledger-screens-character-and-economy/50-23-SUMMARY.md` ("Owner try-out list" steps 3 and 4, and the deferred A1 item)

**Issue:**
- **Step 3.** It says "Travel away … with the drawer open to see `… is no longer nearby.`". Route travel goes through `useConsole.travel()`, which calls `frame.closeScreen()`. The drawer also covers the console, so a solo player cannot travel with Trade open. The vendor-left state is reachable only by being moved by the server or by a group leader.
- **Step 4.** The Materials claim is wrong (see WR-04).
- **A1.** The deferred item "Equipped salvage … skipped if the cache had not updated" can be closed. The SDK applies the transaction's row updates and dispatches row callbacks before it resolves the reducer promise (`index.mjs:6336-6345`), so `stillEquipped` sees the unequip.
- A silent skip still happens if `unequip_item` is a no-op, because the slot no longer matches. The confirmation then closes with no feedback (`Inspector.vue:152`).

**Fix:** Correct the try-out steps. Close A1. Optionally show `Couldn't unequip {name}.` when the salvage is skipped.

### IN-10: Short mobile filter chips are narrower than 44px

**File:** `src/ledger/FilterChips.vue` (`.mobile .chip::after`)

**Issue:** The slop is 44px high but extends only 4px on each side. The `All` chip (about 32px wide plus 8px of slop) ends up under 44px wide.

**Fix:** Use `min-width: 44px` on mobile chips, or a slop with `left: 50%; width: max(100%, 44px); transform: translate(-50%, -50%)`.

### IN-11: The quality hint copy differs from the owner's example

**File:** `src/crafting/craftingModel.ts:369`

**Issue:** The owner decision gives the hint as `Higher-tier {material} would make it {NextTier}.`. The code reads `A recipe with a tier 2 primary material would make it Reinforced.`. That wording is accurate, since the recipe fixes its material, but it was not the approved copy.

**Fix:** Confirm with the owner at UAT, or adopt the approved template.

## Test gaps (summary)

- **Salvage:** a crafted item with `qualityTier: 'common'` (CR-01).
- **Food:** a food item gets an Eat action and calls `eat_food` (WR-01).
- **Focus:**
  - after Nearby Trade, on desktop with another drawer open and on mobile from the Map sheet (WR-02)
  - after the mobile recipe-row → detail switch, the `Vendors here` pick and `Show all` (WR-03)
- **Crafting empty state:** Materials on hand is shown with zero known recipes (WR-04).
- **Loading states:** `vendorStockApplied: false` and `itemsApplied: false` render no empty lines (WR-05).
- **Mobile sizing:** a 44px rule for `.choose-button` (WR-06).
- **Perk refusal:** a refused `chooseRenownPerk` (the promise resolves, the row remains) leaves the chooser open (WR-07).
- **Escape tests:** `StatsMeta`, the mobile identity row, the `Vendors here` list and the salvage prompt (IN-08).

---

_Reviewed: 2026-10-06T23:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
