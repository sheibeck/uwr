---
phase: 50-ledger-screens-character-and-economy
fixed_at: 2026-10-06T23:00:00Z
review_path: .planning/phases/50-ledger-screens-character-and-economy/50-REVIEW-iter2.md
iteration: 2
findings_in_scope: 12
fixed: 11
skipped: 1
status: partial
---

# Phase 50: Code Review Fix Report (iteration 2)

**Fixed at:** 2026-10-06
**Source review:** `.planning/phases/50-ledger-screens-character-and-economy/50-REVIEW-iter2.md`
**Iteration:** 2

**Summary:**
- Findings in scope: 12 (2 critical, 3 warning, 7 info)
- Fixed: 11
- Skipped: 1 (IN-05, accepted by design)
- IN-07 (test gaps) is closed by the tests added with each fix.

## Fixed Issues

### CR-01: craft then salvage duplicated items

**Files modified:** `spacetimedb/src/reducers/items_crafting.ts`, `spacetimedb/src/reducers/recipe_discovery.test.ts`
**Commit:** 8d88b657
**Applied fix:**
- `salvage_item` caps the material yield two ways: by the item's `vendorValue` (the materials returned are never worth more than the item) and by the count the matching recipe consumed of that material (`req1`, `req2`, `req3`). A yield of 0 writes "nothing usable was left" and still removes the item.
- The reagent drop ignores `implicit` affixes (the craft-quality ones), so a crafted tier 2 or 3 armor no longer gives a free Iron Ward.
- Real-handler tests: Void Crystal Pendant (2 in, at most 2 out); crafted tier 3 armor and weapon; the implicit affix gives no reagent while a real suffix affix still does; an 8-cycle craft and salvage loop never raises the bag's vendor value; a grid over every generated gear recipe (craft, salvage, salvaged value <= consumed value). The tests fail with the caps removed (checked).
- Logic fix, so: **fixed: requires human verification** of the cap rule (the owner may prefer `req1Count - 1` from the review, which returns one fewer of the primary).

### CR-02: `grant_item` and `create_item_template` public with no admin check

**Files modified:** `spacetimedb/src/reducers/items.ts`, `spacetimedb/src/reducers/item_admin_gate.test.ts` (new)
**Commit:** c89ba5ed
**Applied fix:**
- Caller search: no client, script, test or admin command calls either reducer. The only references are the definitions and the generated bindings. `.planning` documents both as admin utilities (ROADMAP "the admin `grant_item`", plan 32-02 "kept as potential admin utilities").
- Decision: gated both with the existing `requireAdmin` (first statement, before any read or write) instead of deleting them, so the admin tool stays and the bindings do not change.
- Tests: a non-admin is refused with `Admin only` and nothing is written (also before the slot check); an admin still grants and creates.

### WR-03: recipe generation counted non-materials by name

**Files modified:** `spacetimedb/src/reducers/items_crafting.ts`, `spacetimedb/src/reducers/recipe_discovery.test.ts`
**Commit:** dc5b508e
**Applied fix:** `research_recipes` builds the bag only from templates with `slot === 'material'` that are not quest items. Tests: a quest item, a gear piece and a junk item that share a material's name are ignored and never consumed; a first discoverer who holds an impostor still stores the real template ids in the shared recipe, and a second character can craft it. The tests fail without the filter (checked).

### WR-02: player-sold units merged into base-stock rows

**Files modified:** `spacetimedb/src/helpers/vendor_sale.ts`, `spacetimedb/src/reducers/items.ts`, `spacetimedb/src/reducers/vendor_quantity.test.ts`, `spacetimedb/src/reducers/vendor_restock.test.ts`, `src/vendor/vendorModel.ts`, `src/vendor/vendorModel.test.ts`
**Commit:** 118f6488
**Applied fix:**
- `addToVendorListing` merges only into a player row (no base-stock marker) of the same template and tier, else creates one. Base rows keep their units and their marker, so restock replaces them as a whole and never converts them.
- New helpers `isBaseStockListing`, `findPlayerListing`, `findBuybackListing`. Buy-back takes from the player row when it still holds the recorded quantity, else from any row of that template and tier that does; the orphan-template path only touches the player row.
- Client `stillStocked` now says "any row holds the units".
- Tests updated (the two 50-26 tests that asserted the merge) and added: a second sale raises the same player row; a buy-back leaves the base row alone; a loop of 8 restocks with a sale into every base row keeps the base count at or below `BASE_STOCK_SIZE` and one player row per template and tier.

### WR-01: buying took a unit from a listing the player did not click

**Files modified:** `spacetimedb/src/reducers/items.ts`, `spacetimedb/src/reducers/vendor_quantity.test.ts`, `src/ledger/ledgerContext.ts`, `src/ledger/ledgerData.ts`, `src/ledger/ledgerData.test.ts`, `src/vendor/ForSale.vue`, `src/vendor/VendorScreen.test.ts`
**Commit:** 8ea8af7a
**Applied fix:**
- New additive reducer `buy_listing({ characterId, listingId })`. The vendor is the listing's own npc (must be a vendor at the character's location). It honours the listing's quality tier (a single piece keeps it), the price floor (`listingBuyPrice`), stock and the capacity check, and takes exactly one unit from that row.
- `buy_item` keeps its argument layout and now delegates to the same shared function: it picks a plain (no tier) row with stock first, then the lowest id.
- Client: `LedgerReducers.buyListing`, the hub forwards it with object syntax, the For sale Buy sends `{ characterId, listingId: row.key }` through the runner with key `buy:${listingId}` (so two rows of one template have independent pending states).
- Tests: clicking the base row lowers only the base row and the seller's buy-back still works; clicking the rare row hands out the rare tier and the seller's buy-back is refused cleanly; refusals leave every table unchanged (missing listing, sold out, non-vendor, other place, gold, other player's character); legacy `buy_item` ordering; client: the listing id is sent, two rows of one template send their own ids.

### IN-01: typed `shop` showed the list price

**Files modified:** `spacetimedb/src/reducers/intent.ts`, `spacetimedb/src/reducers/vendor_quantity.test.ts`
**Commit:** 3d47ff1c (with IN-06)
**Applied fix:** the line shows `listingBuyPrice` with the character's perks and modifiers. A test shows the printed number equals the gold `buy_item` takes, with and without the perk.

### IN-06: typed `sell 0` sold one

**Files modified:** `spacetimedb/src/reducers/intent.ts`, `spacetimedb/src/reducers/vendor_quantity.test.ts`
**Commit:** 3d47ff1c
**Applied fix:** `sell 0 <item>` (and `00`) is refused with the window's line `Choose at least one to sell.` before any write. The mixed-template substring case from the same finding was not part of the request and is unchanged.

### IN-03: `areaLevel` defined twice

**Files modified:** `spacetimedb/src/data/vendor_stock.ts`, `spacetimedb/src/data/vendor_stock.test.ts`
**Commit:** 681492cd
**Applied fix:** `vendor_stock.ts` re-exports the single `areaLevel` from `recipe_rules.ts`. A test pins that it is the same function and agrees on a grid. The import-list pin test was updated.

### IN-02: crafted output value could exceed the inputs after rounding

**Files modified:** `spacetimedb/src/data/recipe_rules.ts`, `spacetimedb/src/data/recipe_rules.test.ts`
**Commits:** 8a9c6997, a4dc8f66
**Applied fix:** the output `vendorValue` is the summed input value less 2 (at least 1). A brute-force search found that 2 is the smallest cut that keeps the output payout at or below the two input stacks' payouts for every perk (0 to 100) and Charisma rate; the test checks over 10,000 combinations. Inputs worth nothing at all still get the 1 gold minimum. Existing column tests moved (7 to 5, 5 to 3, 3 to 1, 3 to 1). The 50-25 summary sentence "never beats" is now true for the rate range tested.

### IN-04: quantity picker lag and no announcement

**Files modified:** `src/vendor/SellQuantity.vue`, `src/ledger/InlineConfirm.vue`, `src/vendor/SellPanel.test.ts`
**Commit:** 5f4f8f6a
**Applied fix:** the number field parses on `input` (a half-typed empty or zero value waits for `change`; a number over the stack clamps in the field at once). The InlineConfirm prompt is `aria-live="polite"` and `aria-atomic="true"`. No new styling, tokens, colors or icons.

### Bindings (additive)

**Files modified:** `src/module_bindings/buy_listing_reducer.ts` (new), `src/module_bindings/index.ts`, `src/module_bindings/types/reducers.ts`
**Commit:** 3b549f3c
**Change:** exactly the `buy_listing` reducer: one new file with `characterId` and `listingId` (u64), two lines in `index.ts` (import and `__reducerSchema("buy_listing", ...)`), two lines in `types/reducers.ts` (import and `BuyListingParams`). Nothing was removed, because `grant_item` and `create_item_template` were gated, not deleted.

## Skipped Issues

### IN-05: buy-back rows from before 50-26 can be refused as "already sold"

**File:** `spacetimedb/src/reducers/items.ts` (buy-back), `spacetimedb/src/schema/tables.ts`
**Reason:** accepted, no change. A pre-50-26 listing reads `quantity` 1 (the column default), which is indistinguishable from a post-50-26 listing that buyers legitimately bought down to 1, so "cover the recorded quantity once" would reopen the duplication hole that finite stock closed. It only touches old local rows, the refusal line is accurate for the current stock, and the owner's greenfield rule says no compat shims. The row is replaced by the next sale.
**Original issue:** a legacy buy-back row for a stack sale fails `listing.quantity < sale.quantity` and stays until the next sale.

## Verification

| Gate | Result |
|---|---|
| spacetimedb suite, excluding `measurement.results.test.ts` | 113 files, 4601 tests passed |
| `pnpm exec vitest run --dir src --maxWorkers=2` | 142 files, 3169 tests passed (run before and after the bindings) |
| `pnpm exec vue-tsc -b` | clean after the bindings (before them, the only error was the missing `buyListing` binding type) |
| `pnpm build` | passed, bundle clean |

Note on order: the client gates `vue-tsc` and `build` cannot pass before the publish, because the client calls the new `buy_listing` reducer and its type exists only in the regenerated bindings. The server suite and the client vitest suite ran before the publish; vue-tsc, build and the client suite were run again after the bindings.

## Publish (local only)

- Command: `spacetime publish uwr -p spacetimedb --server local --break-clients < /dev/null` (exactly as given). No prompt or refusal appeared. No `--clear-database`, no maincloud, no push, no server started (the local server was already up, ping 200).
- Key before: `true | 108` (`grep -qE "true +[|] +108"` matched). Key after: `true | 108` (matched). No panic in the last 80 log lines.
- `pnpm spacetime:generate -y`: wrote `buy_listing_reducer.ts`, `index.ts`, `types/reducers.ts`; the diff is the additive `buy_listing` bindings only (listed above).

## Notes

- A test run changed `spacetimedb/src/helpers/__snapshots__/claude_request.test.ts.snap` by line endings only; it was restored with `git restore` each time and never committed.
- Client source files in `src/vendor` and `src/ledger` use CRLF in the working tree; edits kept each file's endings.

---

_Fixed: 2026-10-06_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
