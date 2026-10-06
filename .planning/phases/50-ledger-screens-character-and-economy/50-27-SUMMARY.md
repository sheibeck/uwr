---
phase: 50-ledger-screens-character-and-economy
plan: 27
subsystem: vendor-finite-stock-sell-quantity-client
tags: [vue, vendor, finite-stock, sell-quantity, inline-confirm, client, gap-closure]

requires:
  - phase: 50-26
    provides: "VendorInventory.quantity, sell_item_quantity reducer, listingBuyPrice in the shared pricing module"
provides:
  - "vendorModel: ForSaleRow quantity, quantityText and soldOut; floored prices; needsQuantity, clampSellQuantity, parseSellQuantity, quantitySale; buybackCard stock check ('sold')"
  - "For sale shows 'x n' after the item name and a Sold out state; Just sold shows the quantity and the already-sold reason"
  - "SellQuantity stepper in InlineConfirm default slot; SellPanel picker for stacks wired to sellItemQuantity"
  - "LedgerData hub forwards sellItemQuantity"
affects: [phase 51]

key-files:
  created:
    - src/vendor/SellQuantity.vue
  modified:
    - src/vendor/vendorModel.ts
    - src/vendor/vendorModel.test.ts
    - src/ledger/ledgerContext.ts
    - src/ledger/ledgerData.ts
    - src/ledger/ledgerData.test.ts
    - src/vendor/ForSale.vue
    - src/vendor/JustSold.vue
    - src/vendor/JustSold.test.ts
    - src/vendor/VendorScreen.test.ts
    - src/ledger/InlineConfirm.vue
    - src/vendor/SellPanel.vue
    - src/vendor/SellPanel.test.ts

key-decisions:
  - "Every For sale price is listingBuyPrice from @game-data/vendor_pricing, so the price shown is the price charged"
  - "The quantity reaches the client only through the existing per-vendor filtered subscription; queries.ts is untouched"
  - "The hub keeps sellItem for old clients; no component calls it any more"

requirements-completed: [LDG-08, LDG-09]

status: complete
completed: 2026-10-06
---

# Phase 50 Plan 27: Finite stock, sold out and the sell quantity picker (client) Summary

The Trade screen now shows how many of each item a vendor has ("x3", the last one reads "x1") and a Sold out state with Buy unavailable and explained, every price is the server's floored price, selling a stack asks how many through an inline 1 / minus / number / plus / All picker that states the exact payout, and the Just sold card shows the quantity and says when the vendor has already resold it.

## Commits

| Commit | Message |
|--------|---------|
| e6897f14 | feat(50-27): vendor model stock, floored price, quantity sale and buy-back stock check; hub forwards sellItemQuantity (Task 1) |
| a5d5b44b | feat(50-27): For sale shows x n and Sold out; Just sold shows the quantity and the already-sold state (Task 2) |
| c227e1aa | feat(50-27): sell quantity picker for stacks in InlineConfirm slot, wired to sellItemQuantity (Task 3) |

## What changed

- **vendorModel.ts.** `forSaleRows` carries `quantity`, `quantityText` and `soldOut` and prices with `listingBuyPrice` (template vendorValue, both perk percents, both Charisma mods). A listing at 0 has the reason `SOLD_OUT_REASON` ("Sold out") before the gold and bag reasons, tone muted; the sort is unchanged so a row that sells out keeps its place. New `needsQuantity`, `clampSellQuantity` (1..max), `parseSellQuantity` (digits only, at most nine), `quantitySale` (exact `sellPayout`, prompt `Sell {q} of {n} {name} for {gold} gold?`, confirm `Sell {q}`), and `buybackCard` takes an optional sixth `stock` argument with a new `sold` state in the server's order (gold, place, sold, full).
- **Hub.** `LedgerReducers.sellItemQuantity` and the forwarding map entry. `queries.ts` is untouched (empty `git diff`); the vendorStock SQL is unchanged.
- **ForSale.vue.** Both layouts wrap the name in `span.item-line` followed by `span.qty` (text node). Sold out arrives as the model reason, so the existing aria-disabled, aria-describedby and onBuy guard apply; no new logic.
- **JustSold.vue.** Passes `ledger.vendorStockApplied.value ? ledger.vendorStock.value : null` to `buybackCard`, so no sold state can flash before the stock subscription applies.
- **InlineConfirm.vue.** One optional default `<slot />` between the prompt and the decisions; nothing else changed (Inspector, junk and creation tests stay green).
- **SellQuantity.vue (new).** The stepper inside InlineConfirm: 1, minus (PhMinus), a text input with `inputmode="numeric"`, plus (PhPlus), All; it only emits clamped quantities, resets the field on anything that is not digits, and pins 44px targets on mobile (`.stepper.mobile`).
- **SellPanel.vue.** Sell on a stack (`needsQuantity`) opens one picker under that row (`tr.picker-row` with one 3-column cell on desktop, `li.picker-item` on mobile) at quantity 1, exclusive with the Sell all junk confirmation; Sell on a single item calls `sellItemQuantity` with quantity 1n at once. Confirm runs through the row's runner key `sell:{id}`; the next-row focus watch is armed only for a whole sale; after a partial sale focus returns to that row's Sell; a rejected call keeps the picker open. The Sell button carries `aria-expanded` only for stack rows. The picker closes when the vendor leaves or the row goes, and the picked quantity follows a shrinking stack.

## TDD evidence (RED then GREEN) and gate counts

- Task 1 RED (new exports missing): `vendorModel.test.ts` and `ledgerData.test.ts` 14 failed. GREEN: `vendorModel`, `ledgerData`, `queries`, `gameDataAlias` 4 files, 103 tests pass; vue-tsc exit 0. Comment-filtered raw discount call in vendorModel.ts: 0.
- Task 2 RED: 7 failed (6 new stock and Just sold cases plus one existing expectation that the floor changed, recomputed with `listingBuyPrice`). GREEN: `src/vendor`, `src/styles`, `src/ledger` 15 files, 315 tests pass.
- Task 3 RED: 32 failed in `SellPanel.test.ts` and `VendorScreen.test.ts` (the old `sellItem` path, no picker, no SellQuantity). GREEN: `src/vendor`, `src/ledger`, `src/inventory`, `src/styles` 19 files, 464 tests pass.
- Final gates: `pnpm exec vitest run --dir src --maxWorkers=2`: 142 files, 3161 tests, all passed (design guards included, token pin stays at 23). `pnpm exec vue-tsc -b`: exit 0. `pnpm build`: exit 0 ("bundle clean: 4 files scanned"). Full spacetimedb suite, `measurement.results.test.ts` excluded: 112 files, 4570 tests, all passed (no server change in this plan).
- Grep gates: `<slot` in InlineConfirm.vue 1; `PhMinus` and `PhPlus` 2 each in SellQuantity.vue; `v-html|<svg` 0 in ForSale, JustSold and SellQuantity; `reducers.sellItemQuantity(` in SellPanel.vue 1 and the comment-filtered `reducers.sellItem(` 0; `min-height: 44px` 2 in SellQuantity.vue; "ripple" does not appear in any new source (it appears only in two existing guard tests).
- `git status --porcelain spacetimedb src/module_bindings` is empty. The commits touch exactly the 13 paths in `files_modified`. The module run touched `claude_request.test.ts.snap` (line endings only, empty `git diff --ignore-cr-at-eol`); restored with `git restore`.

## Discretion choices

- **Stock display.** "x n" for every n of 1 or more, so "x1" tells the player it is the last one; a sold-out row keeps its place in the sort so rows never jump under the pointer or focus (tested: the same Buy element keeps its focus and index when its listing goes from 1 to 0).
- **Picker default and placement.** The picker opens at quantity 1 (the safe default, matching InlineConfirm's focus on Keep it), directly under its row, one at a time.
- **Copy.** Prompt `Sell {q} of {n} {name} for {gold} gold?`, confirm `Sell {q}`, visible controls "1", the minus icon, the number field, the plus icon, "All"; aria-labels "Set to one", "One fewer", "Quantity, 1 to {n}", "One more", "Set to all {n}"; group label "How many to sell".
- **Number field.** A text input with `inputmode="numeric"` (no native spinners); a change keeps only digits, clamps to 1..n and puts the previous value back on anything else.

## Deviations from Plan

None - plan executed as written. The existing expectations the floor changed (the XSS name test and the "Not enough gold" Bread case) were recomputed with `listingBuyPrice` inside the tests, never as new literals, as the plan asked. The working-tree files in `src/vendor` are CRLF while some others are LF; edits preserved each file's own line endings.

## Known stubs

None.

## Threat flags

None beyond the plan's threat model (names, stock text and the buy-back reason reach the page only as text nodes, with escape tests on both layouts; the client clamps and accepts digits only while the server re-checks everything; runner keys ignore repeats while pending).

## Owner try-out note

Reload http://localhost:5173 and open Trade with Hesper Duhallow or Sabeth Orrowyn. For sale shows "x n" after each item and a listing sells out (Sold out, Buy unavailable). Selling a stack opens the picker (1, minus, number, plus, All) with the exact payout; a single item still sells in one click. A sale followed by Buy back returns exactly what was sold; buying back after another character bought some says "{Vendor} has already sold {item}."

## Deferred UAT (milestone end)

The picker at 390x844 (44px targets) and the sold-out row on mobile.

## Self-Check: PASSED

- Files exist: SellQuantity.vue and this SUMMARY.
- Commits exist: e6897f14, a5d5b44b, c227e1aa.
