---
phase: 50-ledger-screens-character-and-economy
plan: 32
subsystem: inventory-backpack-tiles
tags: [vue, inventory, backpack, tile-size, stack-count, design-guards, client, gap-closure]
status: complete

requires:
  - phase: 50-30
    provides: "the Inventory screen, BackpackGrid and ItemTile this plan resizes"
provides:
  - "BACKPACK_COLUMNS, BACKPACK_TILE_MAX_PX, BACKPACK_TILE_MIN_PX, BACKPACK_GAP_PX, backpackTileSize, stackCountText (src/inventory/backpack.ts)"
  - "A capped backpack grid at the Inventory mock's tile size, left-aligned"
  - "The mock's top-right 'x{n}' stack count and the neutral-200 common ring"
affects: [50-33, 50-34, 50-35, 50-36, 50-37, 50-38]

key-files:
  created:
    - src/inventory/BackpackGrid.test.ts
  modified:
    - src/inventory/backpack.ts
    - src/inventory/backpack.test.ts
    - src/inventory/BackpackGrid.vue
    - src/inventory/EquippedSlots.vue
    - src/inventory/InventoryScreen.test.ts
    - src/ledger/ItemTile.vue
    - src/ledger/itemModel.ts
    - src/ledger/itemModel.test.ts
    - src/ledger/parts.test.ts

key-decisions:
  - "Tracks are capped, not stretched: minmax(44px, 58px) desktop and minmax(44px, 66px) mobile with a 4px gap (the mock's 6px maps to the 4px spacing step); the .backpack column has a matching max-width so the heading and chips line up with the grid"
  - "Common tile ring at rest is neutral-200 (the mock), superseding UI-SPEC A9 (neutral-600), by the owner's request to follow the updated mock"
  - "stackCountText treats a missing quantity as 1n and shows 'x{n}' for every stackable, including x1"

requirements-completed: [LDG-01]

duration: 35min
completed: 2026-10-06
---

# Phase 50 Plan 32: Backpack tiles at the mock size Summary

Backpack squares are capped at the Inventory mock's size (58px desktop, 66px mobile, never under 44px) instead of stretching with the column, and every stack shows the mock's top-right 'x{n}' count.

## Commits

- 2ffc76b9 feat(50-32): backpack tile size rule and x{n} stack count text (Task 1)
- 88143eb6 feat(50-32): capped backpack grid, top-right x{n} count, mock rings, 0.06em slot labels (Task 2)

## What changed

- **backpack.ts:** the four constants, `backpackTileSize(columnWidthPx, mobile)` = min(max, max(44, floor((width - gap * (cols - 1)) / cols))) and `stackCountText` ('x14', 'x1' for a stackable, '' for a non-stackable at 1, 'x2' for a non-stackable at 2, a missing quantity counts as 1).
- **BackpackGrid.vue:** `.grid` is `repeat(6, minmax(44px, 58px))`, gap 4px, `justify-content: start`; `.grid.mobile` is `repeat(5, minmax(44px, 66px))`. `.backpack` has `max-width: calc(6 * 58px + 5 * 4px)` (mobile `calc(5 * 66px + 4 * 4px)`). Columns stay 6 and 5, so the keyboard steps are unchanged.
- **ItemTile.vue:** the count is `stackCountText(...)`, rendered top-right (`top: 4px; right: 4px`, no `bottom`); the aria-label adds ', quantity n' whenever the count shows.
- **itemModel.ts:** `COMMON_RING_REST` is `var(--color-neutral-200)`. Rings stay 1px at rest and 2px selected (already so in ItemTile).
- **EquippedSlots.vue:** slot label tracking 0.1em to 0.06em, nothing else.

## TDD evidence

- Task 1 RED: `backpack.test.ts` 10 failed, 13 passed (the new describe, import not yet exported). GREEN: 23 of 23.
- Task 2 RED: 12 failed (BackpackGrid.test.ts 5, InventoryScreen mobile column pin, itemModel ring, 4 ItemTile tests in parts.test.ts and the quantity text). GREEN: `vitest run src/inventory src/ledger src/styles` 19 files, 354 tests passed (design guards included: designContract, colors.guard, tokens.client pin 23, scrollbars). `vue-tsc -b` exits 0.
- Full `vitest run src`: 263 of 264 files pass; the only failure is the known baseline `spacetimedb/src/helpers/measurement.results.test.ts` (2 tests).

## Tile size, before and after (backpack tile edge in px)

Old = 6 columns of 1fr with an 8px gap in the column width (viewport - 252 - 48 - 608 at >= 1200 where the column is 300 + 260 + 48 narrower; stacked layout 316 to 615). New = `backpackTileSize`.

| Viewport / column | Column width | Old | New |
|---|---|---|---|
| 1200 | 292 | 42 (below the 44px minimum, so it overflowed) | 45 |
| 1280 | 372 | 55.3 | 58 |
| 1440 | 532 | 82 | 58 |
| 1920 | 1012 | 162 | 58 |
| 900 to 1199 (stacked) | 316 to 615 | 46 to 96 | 49 to 58 |
| 390 mobile (5 columns) | 358 | 65.2 | 66 |

At exactly 1280 the tile was already about the mock's size (55 vs the mock's 58.33), so the fix shows on wider windows (1440 and up) and in the stacked 900 to 1199 range. Tests assert: at 1920 the new size is at most half the old, smaller at 1440, never above 58 across 316 to 615 and smaller wherever the old size was above 58, and within 3px of the old size at 1280.

## Deviations from Plan

None - plan executed as written. Small notes:
- The plan's existing-label updates ('Ore, common, quantity 1' for stackables) needed no edits to existing InventoryScreen expectations: the existing fixtures use non-stackable templates (`tpl` default `stackable: false`), so their labels are unchanged. New tests cover the stackable x1 label.
- Test-only: the new BackpackGrid.test.ts builds its own small ledger context rather than importing `worldContext` from InventoryScreen.test.ts (importing it would re-run that file's suites).
- The 1200 row shows the old formula going under 44px (the tile's min-width made it overflow); the new rule holds 45.

## Known Stubs

None.

## Threat Flags

None. T-50-136 (text nodes only; the existing escape tests for `<img onerror>` names in parts.test.ts and InventoryScreen.test.ts still pass; the count is a generated 'x{n}' string) and T-50-137 (tracks minmax 44px, tile min size pinned by source tests) are implemented.

## Deferred UAT (milestone end)

Check the backpack at 1280, 1920 and 390x844: squares stay at the mock size (58px / 66px), the heading and chips line up with the grid, 'x{n}' sits top-right, common rings are light.

## Self-Check: PASSED

- Files exist: src/inventory/BackpackGrid.test.ts and the edited files listed above.
- Commits 2ffc76b9 and 88143eb6 exist on master.
