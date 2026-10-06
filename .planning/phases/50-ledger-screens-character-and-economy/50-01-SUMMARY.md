---
phase: 50-ledger-screens-character-and-economy
plan: 01
subsystem: spacetimedb
tags: [spacetimedb, game-data, items, inventory]

requires:
  - phase: 49
    provides: "@game-data shared-helper pattern (race_bonuses.ts), strict mock harness"
provides:
  - "spacetimedb/src/data/item_stats.ts: import-free per-instance stat sum shared by examine and (later) the client"
  - "spacetimedb/src/data/inventory_rules.ts: import-free backpack capacity and slot-count rule"
affects: [50-09 publish, inventory, stats and vendor client plans]

tech-stack:
  added: []
  patterns:
    - "Import-free shared module in data/ with a source pin test (no import specifier) and a differential test against the server's existing helper"

key-files:
  created:
    - spacetimedb/src/data/item_stats.ts
    - spacetimedb/src/data/item_stats.test.ts
    - spacetimedb/src/helpers/item_stats_parity.test.ts
    - spacetimedb/src/data/inventory_rules.ts
    - spacetimedb/src/data/inventory_rules.test.ts
  modified:
    - spacetimedb/src/helpers/examine.ts
    - spacetimedb/src/helpers/items.ts

key-decisions:
  - "getEquippedBonuses is not rewritten; the parity test pins sumItemStats against it instead"
  - "helpers/items.ts re-exports MAX_INVENTORY_SLOTS so index.ts and every reducer import unchanged"

requirements-completed: [LDG-01, LDG-02]

status: complete
duration: 10min
completed: 2026-10-06
---

# Phase 50 Plan 01: Shared item stat sum and backpack capacity rule Summary

One import-free `sumItemStats` (template fields plus every `item_affix` magnitude) now produces the server's examine output, and one import-free capacity rule (`MAX_INVENTORY_SLOTS` 50, non-equipped rows, one stack is one slot) backs `getInventorySlotCount` and `hasInventorySpace`.

## Exported signatures (later plans import these through `@game-data`)

`spacetimedb/src/data/item_stats.ts`:

- `ITEM_STAT_KEYS` (14 keys, `as const`), `type ItemStatKey`, `type ItemStatTotals = Record<ItemStatKey, bigint>`
- `emptyItemStats(): ItemStatTotals`
- `sumItemStats(template: Readonly<Record<string, unknown>>, affixes: ReadonlyArray<{ statKey: string; magnitude: bigint }>): ItemStatTotals`
- `addItemStats(a: ItemStatTotals, b: ItemStatTotals): ItemStatTotals`

`spacetimedb/src/data/inventory_rules.ts`:

- `MAX_INVENTORY_SLOTS = 50`
- `interface BackpackRowLike { templateId?: bigint; equippedSlot?: string | null }`
- `backpackSlotCount(rows: ReadonlyArray<BackpackRowLike>): number`
- `hasBackpackSpace(rows: ReadonlyArray<BackpackRowLike>, templateId: bigint, stackable: boolean): boolean`

## Task Commits

1. Task 1: per-instance stat sum, examine uses it, parity with getEquippedBonuses: `c781fa5e`
2. Task 2: backpack capacity rule, items.ts re-exports and delegates: `a16e1c2c`

Each task is one commit (tests and code together); the RED state was confirmed by running the new test file before the module existed.

## Verification

- `vitest run src/data/item_stats.test.ts src/data/inventory_rules.test.ts src/helpers/item_stats_parity.test.ts src/helpers/examine.test.ts src/helpers/items.test.ts --maxWorkers=1`: 5 files, 142 tests pass (item_stats 9, inventory_rules 13, parity 2).
- `examine.test.ts` and `items.test.ts` are unchanged and green.
- `git diff --stat` on `schema`, `reducers` and `views` is empty.

## Deviations from Plan

None. The plan executed as written.

Notes on moved lines: `EQUIPMENT_SLOTS` in `data/mechanical_vocabulary.ts` is at line ~247 now (planned 215-219); `getEquippedBonuses` and the examine block were found by content. The `STAT_LABELS` keys are all within the 14 stat keys, so the examine output is unchanged; `STAT_KEYS` was removed as unused and `STAT_LABELS` is now typed `[ItemStatKey, string][]`.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

- FOUND: spacetimedb/src/data/item_stats.ts, item_stats.test.ts, inventory_rules.ts, inventory_rules.test.ts, helpers/item_stats_parity.test.ts
- FOUND commits: c781fa5e, a16e1c2c
