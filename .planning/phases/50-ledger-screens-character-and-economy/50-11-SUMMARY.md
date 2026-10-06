---
phase: 50-ledger-screens-character-and-economy
plan: 11
subsystem: client-models
tags: [vue, models, items, comparison, game-data]

requires:
  - phase: 50-01 through 50-05
    provides: "@game-data item_stats, inventory_rules, item_rules, item_usability, vendor_pricing, perk_rules, faction_rules, crafting_rules"
provides:
  - "src/ledger/itemModel.ts: names, rarity colors, category, icon, slot labels, bag sort"
  - "src/ledger/compare.ts: STAT_ROWS, instanceStats, compareRows, gearStatTotals, affixesFor"
  - "src/inventory/backpack.ts: BAG_FILTERS, slotUsage, slotMetaText, filterBag, bagTiles, FILTER_EMPTY_TEXT"
  - "src/gameDataAlias.test.ts: alias and import-specifier pins for every new @game-data module"
affects: [50-13 ItemTile, 50-14 inspector, 50-15 inventory screen, 50-16 stats model, 50-17 and later vendor and crafting models]

tech-stack:
  added: []
  patterns:
    - "Pure client models over @game-data helpers; colors as var(--...) strings of existing tokens only"

key-files:
  created:
    - src/ledger/itemModel.ts
    - src/ledger/itemModel.test.ts
    - src/ledger/compare.ts
    - src/ledger/compare.test.ts
    - src/inventory/backpack.ts
    - src/inventory/backpack.test.ts
  modified:
    - src/gameDataAlias.test.ts

key-decisions:
  - "compareRows takes already-summed ItemStatTotals (selected, equipped | null), so callers compose it with instanceStats; the model never needs instances"
  - "An instance whose template has not arrived is left out of filterBag and bagTiles until it does; empty tiles are cap minus shown entries, none when the bag is full"
  - "A food-slot, consumable-slot or well-fed template is category food; categoryWord and the icon say Consumable and PhFlask only for a consumable slot that is not well-fed"

requirements-completed: [LDG-01, LDG-02]

status: complete
duration: 25min
completed: 2026-10-06
---

# Phase 50 Plan 11: Pure item, comparison and backpack models Summary

Item naming, rarity colors, category, icon, slot labels and bag sort live in one tested model, comparison rows and Gear totals use the shared per-instance stat sum, and the backpack slot count, filters and empty tiles use the server's capacity rule; every new `@game-data` module is pinned in the alias test.

## Exported signatures

`src/ledger/itemModel.ts`
- `type ItemCategory = 'quest' | 'junk' | 'gear' | 'food' | 'recipe' | 'material' | 'other'`; `RARITY_ORDER`, `type Rarity`
- `itemName(instance, template): string`, `itemRarity(instance, template): Rarity`, `rarityLabel(rarity): string`
- `rarityColor(rarity): string`, `nameColor(rarity, junk): string`, `ringColor(rarity, { junk?, selected? }): string`
- `itemCategory(template): ItemCategory`, `categoryWord(template): string` (empty for gear and other), `itemIcon(template): Component`
- `SLOT_LABELS`, `EQUIP_SLOT_ORDER`, `slotLabel(slot): string`
- `interface BagEntry { instance, template }`, `compareBagItems(a: BagEntry, b: BagEntry): number`

`src/ledger/compare.ts`
- `STAT_ROWS: { key, label, abbr, signed }[]`, `affixesFor(instanceId, affixes)`, `instanceStats(instance, template, affixes): ItemStatTotals`
- `interface CompareRow { key, label, abbr, value, valueText, delta, marker, markerText, srText }`
- `compareRows(selected: ItemStatTotals, equipped: ItemStatTotals | null, { withDelta }): CompareRow[]`
- `gearStatTotals(items, templates, affixes): ItemStatTotals` (equipped instances only)

`src/inventory/backpack.ts`
- `type BagFilterId`, `BAG_FILTERS`, `FILTER_EMPTY_TEXT`, `interface SlotUsage { used, cap, full }`
- `slotUsage(items)`, `slotMetaText(usage, mobile)`, `filterBag(items, templates, filter): BagEntry[]`, `bagTiles(items, templates, filter): { items: BagEntry[]; emptyCount: number }` (items are `{ instance, template }` entries, sorted)

## Verification

- `pnpm exec vitest run src/ledger src/inventory src/gameDataAlias.test.ts src/styles --maxWorkers=2`: 11 files, 157 tests passed (itemModel 17, compare 8, backpack 10, alias 23 of which 17 new).
- `pnpm exec vue-tsc -b`: exit 0. The module no-ripple guard passes.
- `grep -c` checks: `@game-data/item_rules` in itemModel.ts 1; `@game-data/item_stats` in compare.ts 1; `@game-data/inventory_rules` in backpack.ts 1; `= 50` in backpack.ts 0.
- `git diff src/gameDataAlias.test.ts` removed lines: only the four lines of the `specifiers(file)` helper, moved from inside the race_bonuses describe to file scope (assertions unchanged).

## Task commits

1. `427e8134` item model
2. `4c869f8d` comparison and backpack models
3. `c36268bc` alias test pins

## Deviations from Plan

**1. [Interpretation] `bagTiles().items` holds `{ instance, template }` entries rather than bare instances**
- The plan said "sorted instances"; the sort needs each template, and the tile component needs both, so the entry type `BagEntry` is returned (callers read `.instance`).

**2. [Interpretation] compareRows signature**
- The plan names the inputs informally ("selected AC 14 INT 3"); the function takes the two summed `ItemStatTotals`, which is what the tests express. Plan 14 composes it with `instanceStats`.

## Known Stubs

None.

## Threat Flags

None. T-50-37 (built on the server helpers, per-rule tests), T-50-38 (specifier pins prove import-free siblings) and T-50-39 hold.

## Self-Check: PASSED

- FOUND: src/ledger/itemModel.ts, compare.ts, src/inventory/backpack.ts and their tests; src/gameDataAlias.test.ts
- FOUND commits: 427e8134, 4c869f8d, c36268bc
