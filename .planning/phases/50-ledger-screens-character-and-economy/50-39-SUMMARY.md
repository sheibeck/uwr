---
phase: 50-ledger-screens-character-and-economy
plan: 39
subsystem: ui
tags: [vue, inventory, header, organize, consolidate-stacks, backpack, tile-size, client, gap-closure]
status: complete

requires:
  - phase: 50-32
    provides: backpack tile constants and the capped grid
  - phase: 50-34
    provides: Inventory screen runner, NoticeLine wiring and the result card
provides:
  - Inventory header per mock 10a ("{used} / 50 slots", then gold and Organize after the spacer, then close)
  - Frame actions slot in Drawer and Sheet (ScreenDef.actions)
  - Organize = server consolidate_stacks through the ledger hub, runner key 'bag-organize'
  - bagRunner (one action runner per ledger hub, shared by the screen and its header actions)
  - backpackColumns fill rule and a fill-width backpack grid with a measured column count (--bag-columns)
affects: [50-40 salvage preview (src/ledger), 50-38 crafting salvage tab]

tech-stack:
  added: []
  patterns:
    - "Sibling components that must share pending/rejection state share one runner per hub: bagRunner(ledger, game) (WeakMap + detached effectScope)"
    - "Runtime column count: ResizeObserver on the column sets an inline custom property (--bag-columns), CSS does the track fill"

key-files:
  created:
    - src/inventory/bagRunner.ts
    - src/inventory/bagRunner.test.ts
    - src/inventory/InventoryActions.vue
  modified:
    - src/inventory/backpack.ts
    - src/inventory/backpack.test.ts
    - src/inventory/BackpackGrid.vue
    - src/inventory/BackpackGrid.test.ts
    - src/inventory/InventoryMeta.vue
    - src/inventory/InventoryScreen.vue
    - src/inventory/InventoryScreen.test.ts
    - src/ledger/ledgerContext.ts
    - src/ledger/ledgerData.ts
    - src/ledger/ledgerData.test.ts
    - src/frame/Drawer.vue
    - src/frame/Sheet.vue
    - src/frame/AppFrame.vue
    - src/frame/Drawer.test.ts
    - src/frame/Sheet.test.ts
    - src/frame/AppFrame.screens.test.ts
    - src/screens/screens.ts
    - src/styles/tokens.client.test.ts

key-decisions:
  - "The sort is always applied: Organize is the server merge (consolidate_stacks) plus the already-sorted view (compareBagItems: type, rarity best first, name). No client sort switch, no new reducer"
  - "The frame gains an actions slot after the spacer, before the close button (ScreenDef.actions); InventoryMeta keeps only the slot count, InventoryActions holds the gold and Organize"
  - "Organize is an icon-only 44px button named 'Organize backpack' on mobile (the mobile mock draws none, but merging must not be desktop only)"
  - "bagRunner shares one runner per ledger hub so an Organize rejection reaches the screen's notice line"
  - "Empty cells stay aria-hidden and keyboard-skipped; an empty bag keeps the UI-SPEC empty state; filters show only matching items"
  - "71px tiles at 1280 (5 columns), because a 64px tile cannot fill the 372px column (5.5 columns); 6 columns would be the 58.7px the owner called slightly too small"

requirements-completed: [LDG-01]

duration: 75min
completed: 2026-10-07
---

# Phase 50 Plan 39: Inventory header, Organize and the fill-width backpack Summary

**Mock 10a's Inventory header (slot count, gold, Organize via consolidate_stacks) through a new frame actions slot, plus a backpack grid that draws all 50 slots across the full column with tiles of at most 72px (71px at 1280).**

## Accomplishments

- **Fill rule.** `backpackColumns(width, mobile)` picks the fewest columns whose tile is at most 72px (`ceil((w + 4) / 76)`, dropping a column while the share is under 44). `backpackTileSize` follows it. A sweep over every desktop width from 292 to 2600 pins: tile 56 to 72px, the grid fits, and the leftover is under `cols` px.
- **Header.** Drawer and Sheet render `span.drawer-actions` / `span.sheet-actions` after the spacer when an `actions` slot is given. The Inventory registry entry sets `actions: InventoryActions`; AppFrame passes it in both layouts.
- **Organize.** `InventoryActions` shows the gold once, then `button.organize` (PhSortAscending). A click runs `consolidateStacks({ characterId })` under `'bag-organize'`: inert (aria-disabled) offline or pending, a second click sends nothing, nothing is optimistic. A rejection shows "Couldn't send that. Try again." in the Inventory screen's notice line, and the server's "Inventory organized" line reaches the same line.
- **Grid.** `BackpackGrid` observes the backpack column (desktop only, feature-detected, disconnected on unmount), sets the inline `--bag-columns`, and steps ArrowUp and ArrowDown by the measured count. The desktop `.backpack` max-width is gone. Mobile is unchanged (5 columns of at most 66px, 44px minimum, no observer).
- **Hub.** `LedgerReducers.consolidateStacks` forwards to the generated `conn.reducers.consolidateStacks`. No server, bindings or publish change (`git status --porcelain spacetimedb src/module_bindings` is empty).

## Tile table

Backpack column width = viewport - 252 rail - 48 drawer padding - 300 - 260 - 48 gaps at 1200 and up. "Old" is the 50-32 tile (cap 58px, six 1fr-style tracks); the unclamped 50-32 stretch is in brackets where it differed.

| Viewport | Column px | Columns | Tile (new) | Old 50-32 tile |
|----------|-----------|---------|------------|----------------|
| 1200 | 292 | 4 | 70px | 45px (stretch 42) |
| 1280 | 372 | 5 | 71px | 58px |
| 1366 | 458 | 7 | 62px | 58px |
| 1440 | 532 | 8 | 63px | 58px |
| 1920 | 1012 | 14 | 68px | 58px |
| 2560 | 1652 | 22 | 71px | 58px |
| 900 (stacked) | 316 | 5 | 60px | 49px |
| 1000 (stacked) | 416 | 6 | 66px | 58px |
| 1100 (stacked) | 516 | 7 | 70px | 58px |
| 1199 (stacked) | 615 | 9 | 64px | 58px |
| 390 (mobile) | 358 | 5 (fixed) | 66px | 66px |

## Decisions

- **Sort always applied.** The bag already sorted by Gear, Material, Food, Recipe, Other, Quest, Junk, then rarity best first, then name (`compareBagItems`, unchanged), so Organize is the server merge plus that view. A test named "the bag is always in Organize order (type, rarity best first, name)" pins it.
- **Frame actions slot.** The mock puts the gold and Organize after the spacer, which the old title / meta / spacer / close header could not express. The slot is generic (`ScreenDef.actions`), used only by Inventory.
- **Organize icon-only on mobile.** 44px, `aria-label="Organize backpack"`, `title="Organize"`. The 390 header fits title, count, gold, Organize and close.
- **Shared bag runner.** The header actions and the screen are siblings, so `bagRunner(ledger, game)` keeps one runner per ledger hub in a WeakMap, created in a detached effect scope. Tested: it keeps updating `pending` after the component that asked first has unmounted.
- **Empty cells keyboard-skipped; empty bag keeps the empty state.** Under All a non-empty bag draws exactly 50 cells (item tiles, then aria-hidden empties); End from the first tile lands on the last item tile; Gear, Materials and Food draw only matching items with no empty cells.
- **71px at 1280.** The column is 372px; a 64px tile would need 5.5 columns, so the rule picks 5 columns at 71px.

## TDD evidence

- **Task 1 RED:** 8 failed / 43 passed across backpack, bagRunner and ledgerData tests (missing `backpackColumns`, 58px cap, no `consolidateStacks`, no `bagRunner` module). GREEN: 123 passed across backpack, bagRunner, ledgerData and InventoryScreen tests.
- **Task 2 RED:** Drawer and Sheet actions-slot cases failed, and InventoryScreen and AppFrame.screens failed to load (no `InventoryActions.vue`). GREEN: 25 files / 502 tests passed (frame, screens, InventoryScreen, styles).
- **Task 3 RED:** 4 of 14 BackpackGrid tests failed (the new track rule, the max-width, the observer and the `--bag-columns` style); GREEN: 14 of 14.
- **Gates:** `src/inventory src/ledger src/styles src/frame src/screens` all green except the one tokens guard case fixed below; `npx vue-tsc -b` exits 0; `pnpm build` exits 0 (bundle clean). Full `npx vitest run`: 276 files passed, 8807 tests passed, 2 failed in 3 files, all the known baselines (call_log_report, proof_rules, measurement.results).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The var() definitions guard rejected `--bag-columns`**
- **Found during:** Task 3 verification (`src/styles/tokens.client.test.ts`, "every var(--name) ... is defined")
- **Issue:** The guard only knew properties declared in nocturne.css and tokens.client.css, and the token pin (23) forbids adding a token. The grid's `var(--bag-columns, 6)` is a property the component sets itself through an inline style.
- **Fix:** The guard now also counts a custom property as defined when a `.vue` file sets it as an inline style key (`'--name':` in the template or script). No token was added, the pin at 23 holds, and every other undefined var still fails.
- **Files modified:** src/styles/tokens.client.test.ts
- **Commit:** 0b71a77e

**2. [Plan scope] Registry assertion lives in AppFrame.screens.test.ts**
- The plan's file list has no screens.test.ts, so `getScreen('bag').actions` and "every other screen has none" are asserted in AppFrame.screens.test.ts.

None otherwise: the plan executed as written.

## Commits

- cf2e50f3 feat(50-39): fill rule for backpack columns, hub consolidateStacks, shared bag runner
- 321cd1f3 feat(50-39): Inventory header per mock 10a, gold and Organize in a frame actions slot
- 0b71a77e feat(50-39): backpack grid fills the column with all 50 slots and measured columns

## Notes for later plans

- **50-40 (salvage preview, src/ledger) and 50-38 (crafting salvage tab).** `bagRunner(ledger, game)` lives in `src/inventory/bagRunner.ts`; any screen that must share pending and rejection with a sibling header component can use the same pattern. The hub now has `consolidateStacks`; the 50-38 salvage tab needs nothing from this plan. The Inventory header actions slot (`ScreenDef.actions`, `#actions`) is available to the Crafting screen if its header ever needs controls. `InventoryMeta` no longer shows the gold, so do not look for a `.gold` there; it is in `.drawer-actions` / `.sheet-actions`.
- Drawer.vue, Sheet.vue and AppFrame.vue are CRLF files; edits preserved that.

## Deferred UAT (milestone end)

- Check the Inventory header and grid at 1280, 1920 and 390x844. Press Organize with two partial stacks of one material (they should merge and the notice line should say "Inventory organized: ..."). Check that 50 slots are drawn under All and that the arrows skip the empty cells.
- The owner may prefer a 68px cap with an 8px gap instead of 72px with 4px (one constant in `backpack.ts`, plus the `minmax(44px, 72px)` pin in `BackpackGrid.vue` and its test).

## Known Stubs

None.

## Threat Flags

None. The only new call is `consolidate_stacks`, which the server already ownership-checks (T-50-157); text nodes only (T-50-159).

## Self-Check: PASSED

- src/inventory/bagRunner.ts, src/inventory/InventoryActions.vue and this SUMMARY exist.
- Commits cf2e50f3, 321cd1f3 and 0b71a77e exist.
