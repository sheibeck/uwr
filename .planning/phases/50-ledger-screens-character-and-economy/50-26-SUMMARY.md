---
phase: 50-ledger-screens-character-and-economy
plan: 26
subsystem: vendor-finite-stock-price-floor-sell-quantity
tags: [spacetimedb, vendor, economy, finite-stock, pricing, sell-quantity, publish, local, gap-closure]

requires:
  - phase: 50-24
    provides: "vendor base stock, vendor_base_stock marker, restockVendor"
  - phase: 50-25
    provides: "generated templates that a vendor may stock"
provides:
  - "vendor_inventory.quantity (defaulted u64, last column): every listing is finite"
  - "data/vendor_pricing.ts unitSellCeiling and listingBuyPrice: the shared price floor"
  - "data/vendor_stock.ts BASE_STOCK_QUANTITY and baseStockQuantity: seeded per-rarity restock quantity"
  - "helpers/vendor_sale.ts findVendorListing, addToVendorListing, takeFromVendorListing; sellInstanceToVendor with quantity and partial split"
  - "sell_item_quantity reducer; buy_item, buyback_last_sale and typed sell N on the new rules"
affects: [50-27 (client: x n, sold out, sell quantity picker), phase 51]

key-files:
  created:
    - spacetimedb/src/reducers/vendor_quantity.test.ts
    - src/module_bindings/sell_item_quantity_reducer.ts
  modified:
    - spacetimedb/src/data/vendor_pricing.ts
    - spacetimedb/src/data/vendor_pricing.test.ts
    - spacetimedb/src/data/vendor_stock.ts
    - spacetimedb/src/data/vendor_stock.test.ts
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/helpers/vendor_sale.ts
    - spacetimedb/src/reducers/items.ts
    - spacetimedb/src/reducers/intent.ts
    - spacetimedb/src/index.ts
    - spacetimedb/src/reducers/vendor_buyback.test.ts
    - spacetimedb/src/reducers/quest_item_sale.test.ts
    - spacetimedb/src/reducers/vendor_pricing_parity.test.ts
    - spacetimedb/src/reducers/vendor_restock.test.ts
    - src/module_bindings/types.ts
    - src/module_bindings/vendor_inventory_table.ts
    - src/module_bindings/index.ts
    - src/module_bindings/types/reducers.ts

key-decisions:
  - "Storage is a defaulted column on vendor_inventory (quantity u64 default 1n, appended last), not a companion table; precedent 46.1-09 (six defaulted u64 columns, one on a public table, no clear)"
  - "A new reducer sell_item_quantity; sell_item keeps its exact three-argument layout (BSATN is positional, so a fourth field would break every old client) and sells the whole instance through the same helper"
  - "Floor = max(raw discounted price, unitSellCeiling + 1), where unitSellCeiling is the exact per-unit payout rounded down once, so no stack size ever beats it"
  - "Typed sell N counts units; it records buy-back only when it touches a single stack (a sale spanning stacks is a bulk sale, like sell junk)"
  - "sellInstanceToVendor credits the CURRENT character row, so a bulk caller selling several stacks never overwrites earlier gold with a stale copy"

requirements-completed: [LDG-08, LDG-09]

status: complete
completed: 2026-10-06
---

# Phase 50 Plan 26: Finite vendor stock, price floor and sell quantity (server) Summary

Every vendor listing is now finite: sales add the sold units, buys and buy-backs take exactly what they move, base stock sells out until restock, and one shared floor makes every buy cost strictly more per unit than any sale of the same item pays; a stack can be sold in part through the new `sell_item_quantity` or typed `sell N`, and the owner's local database runs it after an additive publish with the key intact and nothing cleared.

## Commits

| Commit | Message |
|--------|---------|
| 1e0e9194 | feat(50-26): price floor and seeded base-stock quantity rules with grid tests (Task 1) |
| 7c5289c3 | feat(50-26): finite vendor stock, price floor and sell_item_quantity with real-handler tests (Task 2) |
| 308f9869 | chore(50-26): regenerate bindings (VendorInventory.quantity and sell_item_quantity) (Task 3) |

## The price floor

`listingBuyPrice = max(raw discounted price, unitSellCeiling + 1)`, with
`unitSellCeiling = floor(vendorValue x (100 + applied sell perk) x (1000 + max(0, sell mod)) / 100000)`.

Worked example (v = 3, sell perk 5, sell mod 330): `sellPayout(3, 1)` is 3, but `sellPayout(3, 100)` is 418 (4.18 each, because each call rounds). A plain "sell of one + 1" floor of 4 would let a player sell 100 for 418, buy them back one at a time for 400 and print 18 gold per pass. `unitSellCeiling` is 4, so the floor is 5 and 100 x 5 = 500 > 418. Proof: `sellPayout(v, N) <= N x exact rate < N x (unitSellCeiling + 1)`, and buying N units one at a time costs `N x listingBuyPrice`.

At normal Charisma the floor never binds (list price 2v), so existing prices did not move (the parity test numbers are unchanged). Buy-back is the only exception and keeps its exact refund.

## Storage evidence (research 1)

- SDK spacetimedb 2.10.1 supports `.default(value)` on a column.
- Precedent publish on this database, 46.1-09: the exact same command migrated six defaulted u64 columns onto five existing tables, one of them the PUBLIC `ability_cooldown`, with no clear and key_length 108 before and after. This publish printed the same shape: "Created column in table vendor_inventory + quantity: U64 (default: U64(1))".
- The column is last (pin: `combat_round_schema.test.ts` style) and has a default; the strict mock treats a defaulted column as required in an insert, so the source-scan test proves exactly two insert sites (helpers/vendor_sale.ts and index.ts), each writing `quantity`.
- The client already receives the column through the existing per-vendor filtered subscription; no new subscription.

## Reducer signature evidence (research 4)

The SDK serialises reducer arguments as a positional BSATN product with no field tags. A client built against three u64 fields sends 24 bytes, which a server expecting a fourth field cannot decode, so every Sell from an old bundle (including the owner's open tab and the old maincloud bundle) would fail. Therefore `sell_item_quantity({ characterId, itemInstanceId, npcId, quantity })` is new, and `sell_item` keeps its exact signature. The bindings diff shows additions only.

## TDD evidence

- Task 1 RED (exports missing): `vendor_pricing.test.ts` and `vendor_stock.test.ts` 9 failed, 61 passed (70). GREEN: 73 passed in the three targeted files (incl. `no_ripple_word.test.ts`). vendor_pricing.ts still has no import line; vendor_stock.ts still imports only `./item_rules` and `./mechanical_vocabulary`.
- Task 2 RED: `vendor_quantity.test.ts` failed to start with `capturedReducer('sell_item_quantity') is not a function` (59 skipped). GREEN on the first run after the implementation: 59 passed. Existing tests were then updated mechanically (see below).

## Gate results

- Targeted (vendor_quantity, vendor_buyback, quest_item_sale, vendor_pricing_parity, vendor_restock, scheduled_guard.integration, src/data, src/schema): 35 files, 1101 tests, all passed.
- Full spacetimedb suite, `measurement.results.test.ts` excluded: 112 files, 4570 tests, all passed.
- `pnpm exec vitest run --dir src --maxWorkers=2`: 142 files, 3100 tests, all passed (before and after the bindings regeneration).
- `pnpm exec vue-tsc -b`: exit 0 (after Task 1, Task 2 and the regeneration). `pnpm build`: exit 0.
- Grep gates: comment-filtered `buyPrice(` in items.ts 0; `vendor_inventory.insert(` in intent.ts 0; `Math.random` in vendor_stock.ts 0; `takeFromVendorListing(` in items.ts 3; `baseStockQuantity(` in index.ts 1; `quantity: t.u64().default(1n)` in tables.ts 1 with 0 removed lines; `'sell_item_quantity'` 1; sell_item argument line still present exactly once; "ripple" only in the banned-word guard test.
- The full module run touched `claude_request.test.ts.snap` (line endings only, empty `git diff --ignore-cr-at-eol`); restored with `git restore`.

## Local publish evidence

Key before (saved in the git dir, `uwr-50-26-key-before.txt`; checked with `grep -qE "true +[|] +108"`):

```
 key_set | key_length
---------+------------
 true    | 108
```

Server ping 200. Command, exactly: `spacetime publish uwr -p spacetimedb --server local --break-clients < /dev/null` (exit 0). Output tail:

```
Build finished successfully.
Uploading to local => http://127.0.0.1:3000
Checking for breaking changes...
Database Migration Plan
Created column in table vendor_inventory
    + quantity: U64 (default: U64(1,))
!!! Warning: All clients will be disconnected due to breaking schema changes

Skipping confirmation due to --yes
Publishing module...
Updated database with name: uwr, identity: c200f2029b92b15e2164adf6951b34cc614ea4063d36996c58cac1799244c14a
```

The only migration line is the one additive column (the "All clients will be disconnected" warning is the expected `--break-clients` banner, same as 46.1-09). No clear prompt, no refusal, no maincloud, no `--clear-database`, no push, no server started or stopped. The CLI printed its usual `tsc not found in node_modules` line before `Build finished successfully` (also present for the earlier local publishes of this phase).

Key after (live query): `true | 108`.

Log excerpt (`spacetime logs --server local uwr | tail -n 80`; zero lines match "panic"):

```
2026-10-06T21:31:08.625532Z  INFO: Updated program to c464a2fc...
2026-10-06T21:31:08.626304Z  INFO: Database updated
2026-10-06T21:47:31.359299Z  INFO: Updated program to dacd4cc3bef5174c3239ec0d4e1758b1fae52ce0a432ac2092b5958d6279c19b
2026-10-06T21:47:31.361320Z  INFO: Disconnecting all users
2026-10-06T21:47:31.361440Z  INFO: Database updated
```

Live listings right after the publish (`SELECT id, npc_id, item_template_id, quantity FROM vendor_inventory`, read-only): 20 rows, every one reads quantity 1 (12 for npc 4098 Hesper Duhallow, ids 1-4 and 45-52; 8 for npc 1 Sabeth Orrowyn, ids 37-44). Rows from before the publish read 1 (the default); base rows get rarity quantities (common 3-5, uncommon 2-3, rare 1-2) at the next restock tick.

Bindings (`pnpm spacetime:generate -y`), additions only, 0 deletions:

```
2	0	src/module_bindings/index.ts
1	0	src/module_bindings/types.ts
2	0	src/module_bindings/types/reducers.ts
1	0	src/module_bindings/vendor_inventory_table.ts
?? src/module_bindings/sell_item_quantity_reducer.ts  (new, params: characterId, itemInstanceId, npcId, quantity)
```

`VendorInventory` gained `quantity: __t.u64()` (in types.ts and vendor_inventory_table.ts); index.ts gained the import and the `__reducerSchema("sell_item_quantity", ...)` line; types/reducers.ts gained the import and `SellItemQuantityParams`. Only the five allowlisted paths changed.

## Rules as built

- **buy_item** (order): owner, vendor here, template, stock (first listing of the template with quantity >= 1, by id; else `{Vendor} has no more {item}.`), bag, price (`listingBuyPrice` with both perk percents and both Charisma mods), gold, then debit, add the item, `takeFromVendorListing(1)`. A player listing at 0 is deleted; a marked base listing stays at 0 until restock.
- **Sales** (`sell_item`, `sell_item_quantity`, typed single, typed N) all add exactly the sold units through `addToVendorListing`; a base listing that receives player units loses its marker so restock never deletes them.
- **sell_item_quantity**: refuses 0 (`Choose at least one to sell.`) and above the stack (`You only have {n} {item}.`) before any write; a partial sale lowers the stack in place (same id, affixes and fields), the sold units carry no affixes and the buy-back row stores `affixesJson` '[]'.
- **buyback_last_sale**: stock check after the place check and before the bag check (`{Vendor} has already sold {item}.`); refund stays exactly the stored price; takes the recorded quantity out of the listing.
- **Typed `sell N <item>`**: N counts units across the matching stacks through the shared helper (one payout per stack), and records buy-back exactly when it touches a single stack. **Typed `shop`** hides sold-out listings and shows ` x{quantity}` (written as the multiplication sign U+00D7).
- **Restock**: every base row inserts `baseStockQuantity(pick.rarity, restockSeed(npc.id, tickMicros), pick.id)`.

## Existing tests updated (mechanical)

- `vendor_buyback.test.ts`: the pre-existing listing seed gains quantity 2n; the damaged-snapshot case seeds a quantity 1n listing and asserts the table is empty afterwards.
- `quest_item_sale.test.ts`: listing seeds gain quantity; the typed 'sell N' per-instance case became "sells N units from the first stack and records one buy-back row" plus a new "spans stacks ... records nothing" case; header comment updated.
- `vendor_pricing_parity.test.ts`: seeds gain quantity 1n; the expectation is `listingBuyPrice` (numbers unchanged, the floor does not bind).
- `vendor_restock.test.ts`: fixtures gain quantity; the price row test also asserts `baseStockQuantity`; the buy test expects `listingBuyPrice` and one unit less; the column pin is now six columns ending with quantity.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 1 - Bug] Stale character row overwrote gold in a multi-stack typed sale**
- **Found during:** Task 2 (first run of the updated quest_item_sale tests: 'sell 2 shard' paid 7 instead of 14).
- **Issue:** the typed `sell N` loop calls `sellInstanceToVendor` once per touched stack with the same `character` object; the helper wrote `{ ...character, gold: character.gold + value }`, so the second stack's credit overwrote the first.
- **Fix:** the helper credits the current row (`ctx.db.character.id.find(character.id) ?? character`).
- **Files modified:** spacetimedb/src/helpers/vendor_sale.ts. Covered by the spans-stacks test.
- **Commit:** 7c5289c3

No other deviations. Line references from the plan predated 50-24 and 50-25; every file was re-read and matched by content. No prompt, Keeper Bible, route or LLM change; "ripple" is not in the new source. No STATE.md or ROADMAP.md edit (instruction).

## Known stubs

None.

## Threat flags

None beyond the plan's threat model (the new reducer shares `requireCharacterOwnedBy`, the ownership, equipped and vendor-here checks through `sellFromBag`; every refusal is a deep-equal no-write test).

## Owner try-out note

Reload http://localhost:5173 (the publish disconnected all clients, so the tab reconnects). Buying from a vendor now runs out: a second Buy after the last unit says "{Vendor} has no more {item}.", and selling then buying back moves exactly the sold units. The For sale table showing quantities, the Sell picker and the sold-out state arrive with plan 50-27; today's Sell still sells a whole stack.

## Deferred UAT (milestone end)

At high Charisma, the price shown and charged for an item is always above its sell value.

## Self-Check: PASSED

- Files exist: vendor_quantity.test.ts, sell_item_quantity_reducer.ts, this SUMMARY.
- Commits exist: 1e0e9194, 7c5289c3, 308f9869.
