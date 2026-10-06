---
phase: 50-ledger-screens-character-and-economy
plan: 08
subsystem: spacetimedb
tags: [spacetimedb, reducer, buy-back, vendor]

requires:
  - phase: 50-06
    provides: "private vendor_buyback table and my_vendor_buyback view"
  - phase: 50-07
    provides: "sellInstanceToVendor, parseAffixSnapshot, the recorded row"
provides:
  - "reducer buyback_last_sale({ characterId }) in spacetimedb/src/reducers/items.ts"
  - "restoreBuyback in spacetimedb/src/helpers/vendor_sale.ts"
  - "delete_character removes the character's vendor_buyback row"
affects: [50-09 publish and bindings (buybackLastSale), 50-19 Just sold card]

tech-stack:
  added: []
  patterns:
    - "A reducer whose only argument is the character id; price, item and place all come from the caller's own private row"

key-files:
  created:
    - spacetimedb/src/reducers/vendor_buyback.test.ts
  modified:
    - spacetimedb/src/helpers/vendor_sale.ts
    - spacetimedb/src/reducers/items.ts
    - spacetimedb/src/reducers/characters.ts

key-decisions:
  - "The restored item is a new instance with identical data (new item and affix ids); a stackable template goes through addItemToInventory so it merges onto an existing stack"
  - "Only the listing the sale created (listingId set) is removed on buy-back; a pre-existing listing stays"
  - "The place rule compares character.locationId with the stored sale locationId; npcName is only for the message"

requirements-completed: [LDG-09]

status: complete
duration: 15min
completed: 2026-10-06
---

# Phase 50 Plan 08: buyback_last_sale reducer Summary

A misclicked sale can now be undone exactly, once, by its owner, at the place of the sale: `buyback_last_sale({ characterId })` charges exactly the stored price, restores the item and its affixes, removes the listing that sale created and clears the row.

## Reducer behavior (`spacetimedb/src/reducers/items.ts`)

Argument object is exactly `{ characterId: t.u64() }`. Order, every check before the first write:

1. `requireCharacterOwnedBy` (throws SenderError `Not your character` for another user's character, `Character not found` if missing)
2. no `vendor_buyback` row for the character: `Nothing to buy back.`
3. gold below the stored price: `Not enough gold to buy that back.`
4. `character.locationId !== sale.locationId`: `Go back to {npcName} to buy that back.`
5. `!hasInventorySpace(ctx, character.id, sale.templateId)`: `Your backpack is full.`

Refusals use `failItem` (a private `system` line). Then: debit the price, `restoreBuyback`, delete the `vendor_inventory` row `sale.listingId` when set and still present, delete the `vendor_buyback` row, append the private `reward` line `You buy back {itemName} for {price} gold.`

`restoreBuyback(ctx, character, sale, addItemToInventory)` (`helpers/vendor_sale.ts`): stackable template calls `addItemToInventory(ctx, character.id, templateId, quantity)`; otherwise it inserts an `item_instance` with the stored quality tier, craft quality, display name, `isNamed`, `isTemporary` and quantity, then one `item_affix` row per valid `parseAffixSnapshot` entry (`BigInt(magnitude)`).

`delete_character` (`reducers/characters.ts`) now runs `ctx.db.vendor_buyback.characterId.delete(characterId)` right before the character row is deleted (a delete of a missing key is a no-op).

## Task Commits

1. Task 1: reducer, `restoreBuyback`, tests: `0b3d6ca7`
2. Task 2: `delete_character` cleanup and its two tests: `e3c09e67`

## Verification

- `vendor_buyback.test.ts`: 15 tests (round trip with two affixes including a negative magnitude, craft quality, flags and a new id; pre-existing listing kept; stack merge; 50 rows with a stackable stack merges; second sale replaces the first; sell_all_junk leaves the row; repeat buy back answers `Nothing to buy back.`; four refusals with deep-equal state; bob calling alice's id throws; malformed `affixesJson`; delete_character with and without a row). Written first and run RED (`capturedReducer('buyback_last_sale')` missing, then the cleanup assertion), then GREEN.
- `vendor_buyback` (reducer), `quest_item_sale`, `vendor_pricing_parity` and `views/vendor_buyback`: 4 files, 93 tests pass with `--maxWorkers=1`.
- `grep -c "'buyback_last_sale', { characterId: t.u64() }" items.ts` = 1; `grep -c "restoreBuyback(" items.ts` = 1; `grep -c "vendor_buyback.characterId.delete(characterId)" characters.ts` = 1.

## Deviations from Plan

None. `hasInventorySpace` was already in the shared `reducerDeps` in `index.ts`; it was added to the `items.ts` destructure only.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register (T-50-24 to T-50-28 mitigated and tested: owner check first, refund equals stored price with the row cleared in the same call, listing removed, `parseAffixSnapshot` never throws, place rule with the vendor named in the refusal).

## Self-Check: PASSED

- FOUND: reducers/vendor_buyback.test.ts, helpers/vendor_sale.ts (restoreBuyback)
- FOUND commits: 0b3d6ca7, e3c09e67
