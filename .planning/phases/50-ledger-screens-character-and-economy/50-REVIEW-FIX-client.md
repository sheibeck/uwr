---
phase: 50-ledger-screens-character-and-economy
fixed_at: 2026-10-06T17:00:00Z
review_path: .planning/phases/50-ledger-screens-character-and-economy/50-REVIEW-client.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 50: Code Review Fix Report (client)

**Fixed at:** 2026-10-06
**Source review:** `.planning/phases/50-ledger-screens-character-and-economy/50-REVIEW-client.md`
**Iteration:** 1

**Summary:**
- Critical and warning findings in scope: 8 (CR-01, WR-01 to WR-07)
- Fixed: 8
- Skipped: 0
- Info items fixed: IN-01, IN-02, IN-03, IN-07, IN-08, IN-09 (try-out step 3), IN-10
- Info items not changed: IN-04, IN-05, IN-06, IN-11 (reasons below)

Gate on the final tree: `pnpm exec vitest run --dir src --maxWorkers=2` 141 files and 3090 tests passed; `pnpm exec vue-tsc -b` clean; `pnpm build` clean (bundle guard: 4 files scanned). Nothing under `spacetimedb/` or `src/module_bindings` was touched.

## Fixed Issues

### CR-01: Crafted or affixed items are salvaged on one click

**Files modified:** `src/inventory/inspector.ts`, `src/inventory/inspector.test.ts`, `src/inventory/Inspector.component.test.ts`
**Commit:** a3850a1d
**Applied fix:** `needsConfirm` is now `rarity !== 'common' || equipped || crafted || affixed`, where `crafted` is a non-empty `craftQuality` and `affixed` is any non-implicit affix on the instance. Tests: crafted `common` item with `craftQuality: 'exquisite'` and with `'standard'`, a prefix-affixed common item, an implicit-only or other-instance affix (no confirm), and the component asks first with `reducers.salvageItem` not called. Logic change: requires human verification.

### WR-01: Food has no action; `eat_food` is never called

**Files modified:** `src/ledger/ledgerContext.ts`, `src/ledger/ledgerData.ts`, `src/inventory/inspector.ts`, `src/inventory/Inspector.vue`, plus tests (`ledgerData.test.ts`, `inspector.test.ts`, `Inspector.component.test.ts`, `InventoryScreen.test.ts`)
**Commit:** a3850a1d
**Applied fix:** `eatFood({ characterId, itemInstanceId })` added to `LedgerReducers` and the hub's forwarding map (argument names confirmed against `src/module_bindings/eat_food_reducer.ts`). Food with `slot === 'food'` that is not one of the four `use_item` keys gets a primary of kind `eat` (`Eat item`, mobile `Eat`) that runs `reducers.eatFood` through the screen's action runner. The existing `Use` action for the four `use_item` keys is unchanged. Logic change: requires human verification.

### WR-02: Nearby Trade steals focus and loses the opener on mobile

**Files modified:** `src/rails/NearbyList.vue`, `src/frame/useScreens.ts`, `src/frame/AppFrame.vue`, `src/rails/ContextContent.test.ts`, `src/frame/useScreens.test.ts`, new `src/frame/screenFocus.test.ts`
**Commit:** c3cc3457
**Applied fix:**
- `trade()` no longer calls `closeScreen()`, so no deferred focus return is scheduled. `openScreen` already replaces the open screen, and `VendorScreen` already handles new arguments without a remount.
- A new `useScreens.replace(screen)` swaps the active screen and keeps the original opener (`openFromMore` is now the same function).
- `AppFrame.openScreen` uses `replace` when the focused control is inside an open mobile sheet (the Map sheet's Trade button unmounts with the sheet), so the Map tab stays the opener. Otherwise the focused control is the opener.
- New frame tests: desktop with Inventory open leaves focus on the Trade drawer's close button; closing Trade returns focus to the Trade button; mobile from inside the Map sheet leaves focus on the Trade sheet's close button and closing returns it to the Map tab.

### WR-03: Focus falls to `body` when an action removes the focused control

**Files modified:** `src/crafting/CraftingScreen.vue`, `src/crafting/RecipeList.vue`, `src/vendor/VendorScreen.vue`, `src/crafting/CraftingScreen.test.ts`, `src/vendor/VendorScreen.test.ts`
**Commits:** efa809e0 (crafting), 336c6b53 (vendor)
**Applied fix:** after the mobile recipe row opens the detail view, focus moves to the `All recipes` button; after `Show all n recipes` removes itself, focus moves to the first recipe row; after a `Vendors here` pick, focus moves to the vendor name (`tabindex="-1"`, desktop band and mobile row). Each has an `activeElement` test.

### WR-04: Materials on hand is hidden when no recipes are known

**Files modified:** `src/crafting/CraftingScreen.vue`, `src/crafting/RecipeList.vue`, `src/crafting/CraftingScreen.test.ts`
**Commit:** efa809e0
**Applied fix:** the empty state keeps the layout shell. Desktop at 1200px and wider shows the Materials column (without a second Discover button, since the list's empty state has its own); desktop below that and mobile show the Materials disclosure at the top of the list's empty state. The detail column is dropped while no recipe exists. Tests cover wide, narrow and mobile.

### WR-05: Empty lines flash before subscriptions apply

**Files modified:** `src/vendor/ForSale.vue`, `src/vendor/SellPanel.vue`, `src/stats/StatsScreen.vue`, plus `SellPanel.test.ts`, `VendorScreen.test.ts`, `StatsScreen.test.ts`
**Commit:** 336c6b53
**Applied fix:** `ForSale` renders no empty line, rows or table until `vendorStockApplied`, and marks the rows region `aria-busy` meanwhile. `SellPanel`'s "Nothing in your backpack to sell." and the Stats gear bars wait for `itemsApplied`. The loading state is "nothing renders" (the same convention as Inventory and Crafting, which render nothing until applied); no new loading copy was added because none is approved.

### WR-06: Mobile "Choose rank N perk" has no 44px target

**Files modified:** `src/stats/RenownPanel.vue`, `src/stats/StatsScreen.test.ts`
**Commit:** 0d616d8c
**Applied fix:** `:class="{ mobile: props.mobile }"` on the panel root and a `.mobile .choose-button::after` hit area 44px tall, as the review suggested. Source and class tests added.

### WR-07: A server refusal is treated as a successful perk take

**Files modified:** `src/stats/PerkChooser.vue`, `src/stats/RenownPanel.vue`, `src/stats/PerkChooser.test.ts`, `src/stats/StatsScreen.test.ts`
**Commit:** 0d616d8c
**Applied fix:** `PerkChooser` emits `taken` only when the chosen pending row is gone from `ledger.pendingPerks` after the call resolves. On a refusal the chooser stays open and the notice line shows the server text. Because a real take deletes the rows before the promise resolves (so the chooser can unmount before it emits), `RenownPanel` also watches the lowest pending rank while the chooser is open; a change or clear closes it and moves focus to the perk heading. Tests cover the refusal (resolved call, row remains, chooser stays) and the take (row removed, `taken` emitted, focus on the heading). Logic change: requires human verification.

## Info items fixed

- **IN-01** (`14204758`): `emptyCount` is `max(0, cap - used)` in `src/inventory/backpack.ts`; test with an instance whose template has not arrived.
- **IN-02** (`14204758`): the four character-keyed ledger bindings (items, known recipes, pending perks, last sale) use the `'immediate'` swap in `src/ledger/ledgerData.ts`; test that a character change empties the rows and `itemsApplied` at once.
- **IN-03** (`775deca6`): `junkSummary` skips quest items, matching `sellRows` and the server fix; test added.
- **IN-07** (`2ccbec34`): the 50-17 guard now allows `(min-width: 1200px)` only in `src/(inventory|stats|vendor|crafting)/`, and asserts `WIDE_QUERY` equals the 1200px tier.
- **IN-08** (`0d616d8c`, `a3850a1d`, `336c6b53`): escape tests for `StatsMeta` (character name, bind location), the mobile identity row, the `Vendors here` list and the salvage prompt.
- **IN-09** (`17e4164f`): 50-23-SUMMARY try-out step 3 corrected (travel closes Trade, so "no longer nearby" is not reachable by walking away); the salvage line in step 1 now mentions crafted and affixed items. Step 4's Materials claim is true after WR-04.
- **IN-10** (`14204758`): mobile chip hit area is `width: max(100%, 44px)`, centred, 44px tall.

## Not changed

### IN-11: craft-quality hint wording

**File:** `src/crafting/craftingModel.ts:369`
**Reason:** the two sources conflict, so no edit was made. The UI-SPEC "Owner decisions" bullet gives `Higher-tier {material} would make it {NextTier}.` as an example ("For example"). 50-RESEARCH Open Question 11 is RESOLVED to `A recipe with a tier {n+1} primary material would make it {NextTier}.`, says it replaces that example, was committed after the UI-SPEC, and plan 50-21 pins it. The code and its tests match OQ11 exactly. If the owner wants the shorter UI-SPEC phrasing, it is a one-line change in `recipeDetail` plus the two test strings (`craftingModel.test.ts:315,318`, `CraftingScreen.test.ts:536`); it needs an owner call.

### IN-04, IN-05, IN-06

Not in the requested set. IN-04 (off-hand loss caption) and IN-06 (snapshot the Sell all junk prompt) are optional polish; IN-05 (buy-back place rule is stricter on the client than the server) is a decision between client and server and is noted only.

### JustSold `attempt = 'ok'` after a refused buy-back (WR-07 aside)

Left as is; the review calls it harmless today.

---

_Fixed: 2026-10-06_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
