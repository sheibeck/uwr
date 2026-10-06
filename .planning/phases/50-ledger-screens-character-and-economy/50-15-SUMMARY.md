---
phase: 50-ledger-screens-character-and-economy
plan: 15
subsystem: client-inventory
tags: [vue, inventory, screen, mobile]

requires:
  - phase: 50-12
    provides: "FrameControls isDesktop, ScreenDef.meta slot in the drawer and sheet"
  - phase: 50-14
    provides: "Inspector (card and dock), inspectorView"
provides:
  - "src/inventory/InventoryScreen.vue: the Inventory body (desktop drawer and mobile sheet)"
  - "src/inventory/InventoryMeta.vue: header meta (slot count and gold)"
  - "src/inventory/EquippedSlots.vue, BackpackGrid.vue"
affects: [50-23 screen registration]

tech-stack:
  added: []
  patterns:
    - "Focus after a removal is restored only when focus was actually lost (body or a detached node), so a world event never steals focus"
    - "Roving-tabindex grid whose tile buttons keep native Enter and Space; arrows and Home and End are handled on the group"

key-files:
  created:
    - src/inventory/EquippedSlots.vue
    - src/inventory/BackpackGrid.vue
    - src/inventory/InventoryMeta.vue
    - src/inventory/InventoryScreen.vue
    - src/inventory/InventoryScreen.test.ts
  modified: []

key-decisions:
  - "Below 1200px the whole desk grid is one scroll region (Equipped over Backpack, the 260px inspector sticky beside them); at 1200px and wider each column scrolls on its own"
  - "The Backpack heading is rendered on mobile too, visually hidden, as the focus fallback target"
  - "The empty bag shows the EmptyState inside the Backpack region while the Equipped column stays visible; only a missing character replaces the whole screen"
  - "Filter chips are disabled while offline (UI-SPEC interaction table), though filtering is read-only"

requirements-completed: [LDG-01, LDG-02]

status: complete
duration: 40min
completed: 2026-10-06
---

# Phase 50 Plan 15: Inventory screen Summary

The Inventory screen composes the Equipped slot grid with Gear totals, the filtered backpack grid, the inspector (card on desktop, dock on mobile), the header meta and the notice line, with one action runner shared by the inspector and the notice line. Registration in SCREENS is Plan 23 (the Phase 45 placeholder in `src/screens/` stays mounted until then).

## Components Plan 23 registers

- `InventoryScreen` (`src/inventory/InventoryScreen.vue`): the screen body, no props.
- `InventoryMeta` (`src/inventory/InventoryMeta.vue`): the `ScreenDef.meta` component, no props. It reads the frame's `isDesktop` itself: `{used} / {cap} slots` (Full in `--color-con-orange`) on desktop, `{used} / {cap}` on mobile, then the gold; it renders nothing until a character exists and the items subscription has applied.

## Other components

- `EquippedSlots` props `selectedId`, `compareSlot`, `mobile?`; emits `select(instanceId)`. Twelve cards in `EQUIP_SLOT_ORDER`; a filled slot is a button (`{Slot}: {name}, {rarity}`, `aria-pressed`), an empty one a static `Empty` card; the comparison target gets the 1px accent ring and an accent-300 label; Gear totals show Armor Class from the character row, then base plus `+gear` for each stat with a gear bonus (from `gearStatTotals`), or `No gear bonuses yet.` with nothing equipped.
- `BackpackGrid` props `selectedId`, `filter`, `mobile?`; emits `select`, `update:filter`; exposes `focusFirst()` (first tile, else the heading) and `focusTile(id)`. Group `Backpack items`, one tab stop, arrows by 1 and by the column count (6 desktop, 5 mobile), Home and End; empty tiles up to the cap under All; the EmptyState for an empty bag; the per-filter empty line.

## Screen behavior

- Desktop: grid `300px minmax(0, 1fr) 260px` at 1200px and wider, columns with their own scroll region; the inspector is `position: sticky; top: 0`. Mobile: `SegTabs` 'Inventory view', the dock at the bottom while an item is selected, notice line last.
- Selection is a local id; selecting the selected tile or slot deselects. A removed instance clears the selection and, only if focus was lost, moves focus to the first tile, else the Backpack heading (on the mobile Equipped tab, the selected tab). Closing the dock returns focus to the tile or slot card that was selected. After Equip the same instance stays selected and focus stays on the primary button (now Unequip).
- No character: `Your backpack is empty.` EmptyState (PhBackpack). Before the items subscription applies: nothing renders.

## Verification

- `pnpm exec vitest run src/inventory src/ledger src/styles --maxWorkers=2`: 15 files, 274 tests passed (InventoryScreen.test.ts 46: EquippedSlots 9, BackpackGrid 12, InventoryMeta 4, desktop screen 13, mobile screen 8).
- `pnpm exec vue-tsc -b`: exit 0.
- `grep -c "Your backpack is empty."` totals 2 across InventoryScreen.vue and BackpackGrid.vue; the grid carries `aria-label="Backpack items"`.

## Task commits

1. `506a09f5` equipped slots, backpack grid and header meta
2. `6174e58b` inventory screen composition

## Deviations from Plan

None to scope. Interpretations:

- The empty-bag state lives in `BackpackGrid` (the Equipped column stays visible), and the screen-level empty state is for a missing character; both use the stable line `Your backpack is empty.`
- The 900 to 1199px layout is one scroll region for the stacked columns rather than three independent ones, because stacking Equipped (tall) over Backpack in separate regions would squeeze the backpack.

## Known Stubs

None.

## Threat Flags

None. T-50-50 (text nodes only; escape tests for the slot card, the grid and the screen), T-50-51 (selection derived from subscribed rows, cleared on removal, no optimistic removal) and T-50-52 (focus never falls to body after a removal; tested for both layouts) hold.

## Self-Check: PASSED

- FOUND: src/inventory/EquippedSlots.vue, BackpackGrid.vue, InventoryMeta.vue, InventoryScreen.vue, InventoryScreen.test.ts
- FOUND commits: 506a09f5, 6174e58b
