---
phase: 50-ledger-screens-character-and-economy
plan: 24
subsystem: vendor-base-stock
tags: [spacetimedb, vendor, scheduled-table, economy, publish, local, gap-closure]

requires:
  - phase: 50-05
    provides: "vendor_inventory, buy_item, shared vendor pricing"
  - phase: 50-07
    provides: "sell_item, sellInstanceToVendor, resale list price"
  - phase: 50-08
    provides: "buy-back row and the quest-item refusal"
provides:
  - "data/vendor_stock.ts: pure base-stock rules (profile, category, area band, rarity weights, seeded weighted pick, list price, batch planner)"
  - "Private tables vendor_base_stock (marker) and vendor_restock_tick (scheduled), guarded restock_vendors reducer, first fill armed on connect"
  - "buy_item and sell_all_junk now require a vendor at the character's location"
affects: [50-26 (finite vendor stock, buy-above-sell price floor, sell quantity picker), 50-25]

tech-stack:
  added: []
  patterns:
    - "Marker table beside a public table: restock deletes only rows it can prove it wrote"
    - "ensure-if-empty scheduled tick armed in init and clientConnected (init does not rerun on republish)"

key-files:
  created:
    - spacetimedb/src/data/vendor_stock.ts
    - spacetimedb/src/data/vendor_stock.test.ts
    - spacetimedb/src/reducers/vendor_restock.test.ts
  modified:
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/index.ts
    - spacetimedb/src/reducers/items.ts
    - spacetimedb/src/reducers/quest_item_sale.test.ts
    - spacetimedb/src/reducers/scheduled_guard.integration.test.ts
    - src/vendor/VendorScreen.test.ts
    - src/module_bindings/types.ts

key-decisions:
  - "Starter templates stay eligible as base stock; STARTER_ITEM_NAMES only governs loot drops"
  - "A sale of a template that is already listed as base stock adds no row, so that row rotates at the next restock (same accept-and-document call as review IN-03)"
  - "sell_all_junk takes no npc id, so its vendor rule is 'some vendor npc at the character's location' (the typed 'sell junk' rule); its signature and bindings are unchanged"

requirements-completed: [LDG-08]

status: complete
duration: ~35min
completed: 2026-10-06
---

# Phase 50 Plan 24: Area-appropriate vendor base stock with restock Summary

Every vendor now carries up to 8 deterministic, rarity-weighted base-stock listings chosen by rules from existing item templates to suit the vendor's role and its area's level band, refilled about every 15 minutes by a module-identity-guarded scheduled tick that never touches player-sold listings; published to the owner's local database with the key intact and nothing cleared.

## Commits

| Commit | Message |
|--------|---------|
| a8232715 | fix(50): buy_item and sell_all_junk require a vendor at the location (orchestrator addition, see Deviations) |
| ffd4eeac | feat(50-24): pure vendor base-stock rules with tests and a client render test (Task 1) |
| 984e6ac0 | feat(50-24): guarded restock_vendors tick with private base-stock marker and first fill on connect (Task 2) |
| dee657c1 | chore(50-24): regenerate bindings (VendorBaseStock and VendorRestockTick row types) (Task 3) |

## What changed

- `spacetimedb/src/data/vendor_stock.ts` (imports only `./item_rules` and `./mechanical_vocabulary`; no unseeded random source; the word "spacetimedb" does not appear):
  - `vendorProfileOf` reads the NPC's own description, greeting and `knowledgeDomains` into smith, outfitter, provisioner or general (whole-word keyword hits with plural handling; ties go to the earlier profile).
  - `stockCategoryOf`, `areaLevel`, `levelBand` (levels = area level +/- 1, tiers from max(1, floor(level/3))), `rarityWeight` (16:4:1, epic and legendary 0), `isBaseStockCandidate`, `listPriceFor`, `restockSeed`, `pickBaseStock` (64-bit LCG, input-order independent), `selectBaseStock`, `planRestockBatch`.
  - Constants: `BASE_STOCK_SIZE` 8, interval 900_000_000n (15 min), continue 1_000_000n (1 s), batch 20.
- `schema/tables.ts`: private `vendor_base_stock` (listingId pk, npcId, index `by_vendor`) and private scheduled `vendor_restock_tick` (scheduledId, scheduledAt, afterNpcId). `vendor_inventory` is not changed.
- `index.ts`: `restock_vendors` (guard is the first statement), `restockVendor`, `ensureVendorRestockScheduled` called in `init` and `clientConnected`.
- `reducers/items.ts` (orchestrator addition): `buy_item` and `sell_all_junk` refuse with `There is no vendor here.` through `failItem` before any write.
- `src/vendor/VendorScreen.test.ts`: new describe "ForSale base stock (Plan 50-24)". No client source change.

## TDD evidence

- Task 1 RED: `vendor_stock.test.ts` failed with `Cannot find module './vendor_stock'` (no tests ran). GREEN: 35 tests pass.
- Task 2 RED: `vendor_restock.test.ts` failed with `capturedReducer('restock_vendors') is not a function` (17 skipped). GREEN: 17 tests pass on the first run after the implementation.
- Orchestrator addition: all existing sell/buy tests already seeded a vendor at the character's location, so none pinned the old behavior; new real-handler tests added to `quest_item_sale.test.ts` (buy_item: non-vendor npc, missing npc, vendor elsewhere, control; sell_all_junk: non-vendor only, no npc, vendor elsewhere, control).

## Gate results

- Targeted run (vendor_restock, scheduled_guard, vendor_stock, vendor_buyback, quest_item_sale, vendor_pricing_parity, views/vendor_buyback, src/schema): 11 files, 258 tests, all passed.
- Full spacetimedb suite, `measurement.results.test.ts` excluded: 109 files, 4422 tests, all passed.
- `pnpm exec vitest run --dir src --maxWorkers=2`: 141 files, 3093 tests, all passed.
- `pnpm exec vue-tsc -b`: exit 0 (before and after the bindings regeneration).
- Grep gates: no `Math.random` and no "spacetimedb" in `vendor_stock.ts`; two import specifiers; `ensureVendorRestockScheduled(ctx);` appears 2 times and `scheduledReducers['restock_vendors']` 1 time in `index.ts`; "ripple" appears only in the existing banned-word guard tests.
- The full module run touched `claude_request.test.ts.snap` (line endings only, empty `git diff --ignore-cr-at-eol`); restored with `git restore`.

## Local publish evidence

Key before (saved in the git dir, `uwr-50-24-key-before.txt`):

```
 key_set | key_length
---------+------------
 true    | 108
```

Command, exactly: `spacetime publish uwr -p spacetimedb --server local --break-clients < /dev/null` (exit 0). Output tail:

```
Checking for breaking changes...
Database Migration Plan
Created user table: vendor_base_stock (private)
    Columns: listing_id U64, npc_id U64
    Unique constraints: vendor_base_stock_listing_id_key on [listing_id]
    Indexes: vendor_base_stock_listing_id_idx_btree on [listing_id]; vendor_base_stock_npc_id_idx_btree on [npc_id]
Created user table: vendor_restock_tick (private)
    Columns: scheduled_id U64, scheduled_at (Interval | Time), after_npc_id U64
    Auto-increment constraints: vendor_restock_tick_scheduled_id_seq on scheduled_id
    Schedule: Calls reducer: restock_vendors

Publishing module...
Updated database with name: uwr, identity: c200f2029b92b15e2164adf6951b34cc614ea4063d36996c58cac1799244c14a
```

Exactly two private tables created, no other migration line, nothing cleared. No maincloud, no `--clear-database`, no push, no server started or stopped.

Key after (live query): `true | 108`.

Log excerpt (`spacetime logs --server local uwr | tail`; zero lines match "panic"):

```
INFO: Updated program to aad6d14b6ee389d78a8e7c199dc44b58d7b86c9e8a76ea67dc5966fca9d25306
INFO: Creating table `vendor_base_stock`
INFO: Creating table `vendor_restock_tick`
INFO: Database updated
```

Bindings (`pnpm spacetime:generate -y`): only `src/module_bindings/types.ts` changed, 13 insertions and 0 deletions: the `VendorBaseStock` and `VendorRestockTick` object types and their type exports. No reducer binding (scheduled reducer of a private table).

## What each local vendor stocks now

The owner's client had already reconnected after the publish, so `clientConnected` armed the first tick and the first fill had run when queried (read-only `spacetime sql`). One tick is pending at 2026-10-06T21:23:43Z, afterNpcId 0. 16 base-stock rows have a marker; 4 other rows are player-sold and have none.

Both vendors read as provisioners; their locations are area level 1 (dm 100 and 169, offset 0), so the band is required level 1-2 gear and tier 1 consumables and materials. Only tier 1 materials appear (tier 2 and 3 materials such as Iron Ore and Void Crystal are out of band).

| Vendor | Base stock (template id, list price) |
|--------|--------------------------------------|
| Sabeth Orrowyn (npc 1, Orrin Sill) | Clear Water (33, 2), Resin (35, 2), Wild Berries (38, 2), Herbs (40, 2), Salt (41, 2), Rough Hide (51, 4), Lesser Essence (60, 6), Mana Pearl (69, 6) |
| Hesper Duhallow (npc 4098, Cormorant Stair) | Dry Grass (36, 2), Murky Water (45, 2), Iron Shard (46, 4), Lamp Oil (49, 2), Rough Hide (51, 4), Bone Shard (52, 4), Lesser Essence (60, 6), Glowing Stone (63, 6) |

Hesper also keeps four player-sold listings that restock never touches (Herbs 40, Copper Ore 50, Life Stone 68, Clear Water 33); none is duplicated in her base stock.

## Where base-stock quantity would hook in (note for 50-26)

Base stock has no quantity: `vendor_inventory` has none and `buy_item` never decrements. To give base stock a finite quantity per restock without touching player listings:

- Store it on the marker. `vendor_base_stock` (one row per base listing, written only by `restockVendor` in `index.ts`) can gain a `quantity` column, or 50-26 can add `quantity` to `vendor_inventory` and have `restockVendor` set it at the insert (the single `ctx.db.vendor_inventory.insert({...})` call there).
- Choose it in the restock selection. `selectBaseStock` / `pickBaseStock` in `data/vendor_stock.ts` return templates only; a per-pick quantity (for example a rarity-weighted count from the same seeded generator state, so it stays deterministic per vendor and tick) would be added there and written by `restockVendor`.
- Restock already deletes and rewrites only marked rows each tick, so a restock naturally resets base-stock quantity to full; player-sold listings keep their own quantity. Because a sale of an already-listed template adds no row today, 50-26 will also need to decide whether such a sale increments that listing's quantity.
- Not added here, by instruction.

## Deviations from Plan

### Orchestrator addition (documented as a deviation)

**1. [Rule 2 - Missing critical functionality] buy_item and sell_all_junk vendor-presence rule**
- **Found during:** before Task 1 (orchestrator instruction, following the server review fix for `sell_item`)
- **Issue:** `buy_item` never checked the npc and `sell_all_junk` never checked for a vendor, so both worked anywhere.
- **Fix:** `buy_item` refuses with `There is no vendor here.` unless the npc exists, is a vendor and is at the character's location, before the listing is read or anything is written. `sell_all_junk` (no npc argument) refuses with the same line unless some vendor npc is at the character's location. Real-handler tests added; no existing test needed changing.
- **Files modified:** spacetimedb/src/reducers/items.ts, spacetimedb/src/reducers/quest_item_sale.test.ts
- **Commit:** a8232715

### Auto-fixed issues

**2. [Rule 1 - Bug in the plan's test] Bindings-column check was too coarse**
- **Found during:** Task 1 (client test)
- **Issue:** the plan's check "vendor_inventory_table.ts has no 'source' text" fails on the generated file's own header comment ("MODIFY TABLES IN YOUR MODULE SOURCE CODE").
- **Fix:** the test now checks only the `__t.row({...})` definition (and that it contains `npcId`) for `base` and `source`.
- **Files modified:** src/vendor/VendorScreen.test.ts
- **Commit:** ffd4eeac

No other deviations. No prompt, Keeper Bible, route or client source change.

## Owner try-out note

The first fill has already run on the local database (the client reconnected). To see it, reload http://localhost:5173. At Cormorant Stair, Trade with Hesper Duhallow; at Orrin Sill, Trade with Sabeth Orrowyn. For sale lists up to 8 tier 1 materials, weighted toward common. Stock rotates about every 15 minutes, and anything a player sells that was not already listed stays listed through every restock. Buying and selling now need a vendor at your location (Buy and Sell all junk included).

## Deferred UAT (milestone end)

A smith or general vendor in a higher-danger region shows gear in that region's band.

## Known stubs

None.

## Threat flags

None beyond the plan's threat model (the two new tables are private; the scheduled reducer is guarded and covered by the scheduled-guard tests).

## Self-Check: PASSED

- Files exist: vendor_stock.ts, vendor_stock.test.ts, vendor_restock.test.ts, this SUMMARY.
- Commits exist: a8232715, ffd4eeac, 984e6ac0, dee657c1.
