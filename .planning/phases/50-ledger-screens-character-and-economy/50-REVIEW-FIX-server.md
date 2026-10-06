---
phase: 50-ledger-screens-character-and-economy
fixed_at: 2026-10-06T00:00:00Z
review_path: .planning/phases/50-ledger-screens-character-and-economy/50-REVIEW-server.md
iteration: 1
findings_in_scope: 13
fixed: 12
skipped: 1
status: partial
---

# Phase 50: Code Review Fix Report (server)

**Fixed at:** 2026-10-06
**Source review:** `.planning/phases/50-ledger-screens-character-and-economy/50-REVIEW-server.md`
**Iteration:** 1
**Branch:** `worktree-agent-a673d6bf23ff90acb` (merged master first; HEAD was behind e2f6dcb6)

**Summary:**
- Findings in scope: 13 (CR-01, WR-01 to WR-04, IN-01 to IN-08)
- Fixed: 12
- Skipped: 1 (IN-03, by instruction)

**Gate:** full `spacetimedb` suite excluding `measurement.results.test.ts`: 107 files, 4358 tests, all passed.
The run touched three `__snapshots__` files (line endings only); restored with `git restore`.
No client files changed. No `ripple` text added (the only hits are the existing banned-word guard test).

## Fixed Issues

### CR-01: The `sell_all_junk` reducer still sells quest items

**Files modified:** `spacetimedb/src/reducers/items.ts`, `spacetimedb/src/reducers/quest_item_sale.test.ts`
**Commit:** 4062b24c
**Applied fix:** `sell_all_junk` now skips templates where `isQuestItemTemplate(template)` is true, as the typed `sell junk` does. Real-handler tests: a junk-and-quest stack (and its affix) survives, the other junk is sold and gold equals only the non-quest payout, the existing buy-back row is untouched; a quest-only junk inventory sells nothing.
**Status:** fixed: requires human verification (logic condition).
**Client note:** the review asked to check that the client "Sell all junk" preview uses the same skip. Not touched here (no client changes allowed); the client preview should be checked in the client review pass.

### WR-01: `planCraft` passes a recipe that repeats a material

**Files modified:** `spacetimedb/src/data/crafting_rules.ts`, `spacetimedb/src/data/crafting_rules.test.ts`, `spacetimedb/src/reducers/craft_quality.test.ts`
**Commit:** adac6cbc (shared with IN-06)
**Applied fix:** requirements are merged first (`need()` per requirement), then each merged total is checked against `countOf`, so req1 == req2 counts the sum. The refusal keeps the server text `Missing materials to craft this recipe.` and happens before any mutation. Tests: planCraft (merged refusal, merged pass, repeating req3) and a `craft_recipe` real-handler test (4 on hand with counts 2 and 3 is refused with nothing changed; 5 crafts).
**Status:** fixed: requires human verification (logic condition).

### WR-02: `sell_item` never checks the npc

**Files modified:** `spacetimedb/src/reducers/items.ts`, `spacetimedb/src/reducers/quest_item_sale.test.ts`
**Commit:** 5e52ac11
**Applied fix:** `sell_item` refuses with `There is no vendor here.` (same wording as the typed path, via `failItem` which calls `fail()`) unless the npc exists, is a vendor and is at `character.locationId`. The check runs after the item guards and before `sellInstanceToVendor`, so a refusal writes nothing. The two pinned tests (non-vendor, missing npc) now assert the refusal and no writes; a vendor at another location is added.
**Also changed:** the third test, "refuses even when the vendor is not a vendor npc" (quest item sold to a non-vendor), now expects the vendor refusal first, which is the typed path's order.
**Not done:** `buy_item` (no location check) and `sell_all_junk` (no vendor at all) were left alone, since the review made those conditional on owner agreement. Owner decision needed.
**Status:** fixed: requires human verification (logic condition).

### WR-03: `sell_all_junk` leaves `item_affix` rows

**Files modified:** `spacetimedb/src/reducers/items.ts`, `spacetimedb/src/reducers/quest_item_sale.test.ts`
**Commit:** 55a39604
**Applied fix:** deletes each sold instance's affix rows before the instance. Test checks that no affix row points at a deleted instance and the kept item's affix stays.

### WR-04: `craft_recipe` can decorate an older instance

**Files modified:** `spacetimedb/src/helpers/items.ts`, `spacetimedb/src/reducers/items_crafting.ts`, `spacetimedb/src/reducers/craft_quality.test.ts`
**Commit:** a9fac279
**Applied fix:** `addItemToInventory` now returns the row it produced (new instance, or the merged stack). `craft_recipe` uses that row instead of searching for the first plain copy. Existing callers ignore the return value. Test: an older plain copy (id 5) in the bag is left plain with no affixes; the newly crafted instance gets quality, display name, suffix and implicit affixes.
**Status:** fixed: requires human verification (logic condition).

### IN-01: Missing template reports "Your backpack is full."

**Files modified:** `spacetimedb/src/reducers/items.ts`, `spacetimedb/src/reducers/vendor_buyback.test.ts`
**Commit:** 59d4bdec
**Applied fix:** `buyback_last_sale` checks the template first, refuses with `That item can no longer be bought back.`, charges nothing, and deletes the dead row plus the resale listing that sale created. Test added.

### IN-02: Stackable buy-back drops instance fields

**Files modified:** `spacetimedb/src/helpers/vendor_sale.ts`
**Commit:** feaa2a9a
**Applied fix:** documented the assumption (stackables never carry quality, name, flags or affixes) in the `restoreBuyback` comment. Comment only.

### IN-04: Perk message shows a percent the math does not use

**Files modified:** `spacetimedb/src/data/vendor_pricing.ts`, `spacetimedb/src/data/vendor_pricing.test.ts`, `spacetimedb/src/helpers/vendor_sale.ts`, `spacetimedb/src/reducers/intent.ts`, `spacetimedb/src/reducers/items.ts`
**Commit:** 56c66cc3
**Applied fix:** new import-free exports `appliedSellBonusPercent` and `appliedBuyDiscountPercent` (whole percent, floored at zero, buy capped at 50). All five perk lines use them: `buy_item`, `sell_all_junk`, `sellInstanceToVendor`, and the typed `sell N` and `sell junk` in `intent.ts` (the same defect sat there). The existing `vendor_pricing` import pin still passes.

### IN-05: Capacity rule header claims a craft gate

**Files modified:** `spacetimedb/src/data/inventory_rules.ts`
**Commit:** feaa2a9a
**Applied fix:** header comment corrected (buy and buy-back gates; `craft_recipe` has no capacity gate). Comment only. No capacity gate was added to craft.

### IN-06: A skipped third requirement can cancel an identical first or second requirement

**Files modified:** `spacetimedb/src/data/crafting_rules.ts`, `spacetimedb/src/data/crafting_rules.test.ts`
**Commit:** adac6cbc (same place as WR-01)
**Applied fix:** requirement 3 is included only when both its template and count exist (by position), never skipped by template id. Tests cover req3 with no count repeating req1, and a repeated req2 keeping the catalyst count honest.

### IN-07: A temporary item sold before logout can be bought back after it

**Files modified:** `spacetimedb/src/helpers/vendor_sale.ts`, `spacetimedb/src/reducers/vendor_buyback.test.ts`
**Commit:** c20d107a
**Applied fix:** `sellInstanceToVendor` pays for an `isTemporary` instance but writes no buy-back row (an earlier row is left alone). Tests added.

### IN-08: Test gaps

**Files modified:** `spacetimedb/src/reducers/items.ts`, `spacetimedb/src/reducers/vendor_buyback.test.ts` (plus tests in the CR-01, WR-01, WR-04 and IN-01 commits)
**Commit:** 3556f5b3
**Applied fix:** all listed gaps now have tests: `sell_all_junk` with a junk-and-quest template (CR-01), repeated material templates in `planCraft` and `craft_recipe` (WR-01), a craft with an older plain copy (WR-04), buy-back with a missing template (IN-01), and a buy-back round trip that starts from the typed `sell <item>` path (this commit). The unused `isClassAllowed` destructure is removed.

## Skipped Issues

### IN-03: The listing a sale created is deleted on buy-back even when other sellers rely on it

**File:** `spacetimedb/src/reducers/items.ts:195-199`
**Reason:** skipped by instruction. A correct fix needs shared listing semantics (tracking which other buy-back rows or sales rely on a listing), and there is no trivial change. Vendor listings are unlimited stock, so the only effect is that the vendor stops offering an item another player sold. Accepted and documented here.
**Original issue:** A's sale creates listing L; B later sells the same template and quality and records no `listingId`; A buys back and deletes L.

## Notes for the orchestrator

- No publish, push or `--clear-database`; no schema change, so a plain local publish is enough when the orchestrator merges.
- The client shares `planCraft` and `vendor_pricing` through `@game-data`: the client's Craft pre-gate now matches the server for repeated materials with no client edit. The "Sell all junk" preview should still be checked against the quest skip.
- `spacetimedb/node_modules` is absent in the worktree; vitest resolved from `C:\projects\uwr\node_modules` and ran fine.

---

_Fixed: 2026-10-06_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
