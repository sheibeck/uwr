---
phase: 50-ledger-screens-character-and-economy
plan: 10
subsystem: client-data
tags: [vue, spacetimedb, subscriptions, hub]

requires:
  - phase: 50-09
    provides: "tables.myVendorBuyback, VendorBuyback row type, reducers.buybackLastSale"
provides:
  - "src/ledger/ledgerContext.ts: LedgerData, LedgerReducers, VendorTarget, LEDGER_KEY, createInertLedger"
  - "src/ledger/queries.ts: ledgerQueries() typed filtered SQL"
  - "src/ledger/ledgerData.ts: createLedgerData(deps, input), LedgerConn, LedgerInput, LedgerDeps"
  - "src/ledger/actionRunner.ts: createActionRunner, ActionRunner, SEND_ERROR_TEXT"
affects: [50-12 session and App wiring, 50-13 NoticeLine (rejection counter), the four screens]

tech-stack:
  added: []
  patterns:
    - "Session-owned hub separate from the Phase 47 game hub (Phase 49 creation precedent); keyed bindings with a filter equal to each query"

key-files:
  created:
    - src/ledger/ledgerContext.ts
    - src/ledger/queries.ts
    - src/ledger/queries.test.ts
    - src/ledger/ledgerData.ts
    - src/ledger/ledgerData.test.ts
    - src/ledger/actionRunner.ts
    - src/ledger/actionRunner.test.ts
  modified: []

key-decisions:
  - "Vendor stock swaps immediately on a vendor change (not on applied), so a new vendor never shows the previous vendor's stock"
  - "The last sale is the first row of the my_vendor_buyback binding keyed by the active character; the character filter drops a previous character's row from the shared cache"

requirements-completed: [LDG-01, LDG-03, LDG-08, LDG-09, LDG-10]

status: complete
duration: 25min
completed: 2026-10-06
---

# Phase 50 Plan 10: Ledger data hub Summary

A session-owned `LedgerData` hub subscribes, filtered to the active character and the open vendor, to items, affixes, templates, vendor stock, recipes, pending perks and the per-sender last sale, with connected-only reducers and a pending/rejection action runner. `src/game/*` is untouched.

## LedgerData members (src/ledger/ledgerContext.ts)

Readonly refs: `connected`, `items`, `itemsApplied`, `affixes`, `templates` (Map by id), `vendorTarget` (`{ npcId, npcName } | null`), `vendorStock`, `vendorStockApplied`, `recipesKnown`, `recipesApplied`, `recipes` (Map by id), `pendingPerks`, `lastSale` (`VendorBuyback | null`), `reducers` (`LedgerReducers | null`, null unless connected). Methods: `setVendor(target | null)`, `reset()`, `dispose()`. `LedgerReducers` has the 12 reducers with object arguments (equipItem, unequipItem, useItem, salvageItem, learnRecipeScroll, sellItem, sellAllJunk, buyItem, buybackLastSale, researchRecipes, craftRecipe, chooseRenownPerk). `LEDGER_KEY` and `createInertLedger()` give every screen a bare default.

## Hub input (src/ledger/ledgerData.ts)

`createLedgerData<C extends LedgerConn>(deps: { bind, queries }, input: { conn, status, activeCharacterId }): LedgerData`. Subscription keys: items, known recipes, pending perks and last sale by active character id; affixes by owned instances that are rolled, crafted or equipped; templates by the union of owned, vendor stock, recipe parts and output, and the last sale's template; recipe templates by the discovered ids; vendor stock by the open vendor's npc id. Empty id lists never subscribe.

## Action runner (src/ledger/actionRunner.ts)

`createActionRunner({ online })` returns `{ pending, isPending(key), rejection, run(key, call) }`. `run` resolves true when the call resolved, false when ignored (pending), offline, rejected or thrown synchronously; it never throws and increments `rejection` on a rejection. `SEND_ERROR_TEXT` is the notice line text.

## Verification

- `pnpm exec vitest run src/ledger src/styles --maxWorkers=2`: 7 files, 97 tests passed (ledger: queries 10, ledgerData 15, actionRunner 8).
- `pnpm exec vue-tsc -b`: exit 0.
- `git diff --stat src/game`: empty.

## Task commits

1. `dcb99038` ledger context contract, inert default and filtered queries
2. `8f7d9268` ledger hub with keyed subscriptions and connected-only reducers
3. `c9ffead7` action runner

## Deviations from Plan

**1. [Acceptance count, minor] `grep -c "filter:" src/ledger/ledgerData.ts` prints 2, not at least 5**
- The filter is passed once inside each of the two private helpers (`keyedTable`, `keyedIdList`, copied from gameData) that create all eight bindings, so the literal appears twice. Every one of the eight bindings gets a filter equal to its query, and ledgerData.test.ts asserts the filter of each (items, recipes known, perks, last sale, vendor stock, affixes, recipe templates).

**2. [Process] RED run not committed separately**
- Tests and modules were written together per task and committed as one `feat` commit per task, as the plan's task-level commit convention allows; each test file was run green before commit.

## Known Stubs

None.

## Threat Flags

None. T-50-33 accepted (filtered to scope, last sale from the per-sender view), T-50-34 mitigated (keys limited to needed ids, empty lists never subscribe), T-50-35 (no optimistic state, reducers null offline, tested), T-50-36 (runner ignores repeats per key, tested).

## Self-Check: PASSED

- FOUND: src/ledger/ledgerContext.ts, queries.ts, ledgerData.ts, actionRunner.ts and their tests
- FOUND commits: dcb99038, 8f7d9268, c9ffead7
