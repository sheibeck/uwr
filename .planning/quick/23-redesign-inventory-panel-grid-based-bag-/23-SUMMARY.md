---
phase: quick-23
plan: 01
subsystem: ui
tags: [inventory, grid-layout, context-menu, ux]
dependency_graph:
  requires: [ContextMenu component, LocationGrid pattern]
  provides: [Grid-based inventory bag UI]
  affects: [InventoryPanel]
tech_stack:
  added: []
  patterns: [Grid-based RPG bag, Context menu interactions]
key_files:
  created: []
  modified:
    - path: "src/ui/styles.ts"
      summary: "Added 6 bag grid style entries (bagGrid, bagSlot, bagSlotFilled, bagSlotName, bagSlotQuantity, bagSlotSlotLabel) and fixed equipmentSlotName text wrapping"
    - path: "src/components/InventoryPanel.vue"
      summary: "Redesigned backpack from list to 5-column grid with ContextMenu integration, padded empty slots, and preserved all item actions via right-click menus"
decisions:
  - id: "grid-5col"
    summary: "5-column grid layout for 20-slot backpack"
    rationale: "Matches traditional RPG bag UX with visible capacity at a glance"
  - id: "context-menu-actions"
    summary: "Right-click context menus replace inline action buttons"
    rationale: "Cleaner grid cells, matches LocationGrid interaction pattern"
  - id: "padded-slots"
    summary: "Compute padded bagSlots array to show empty positions"
    rationale: "Players see exactly which slots are filled vs available (classic RPG bag feel)"
metrics:
  duration_minutes: 3
  tasks_completed: 2
  files_modified: 2
  completed_at: "2026-02-12T19:23:09Z"
---

# Quick Task 23: Redesign Inventory Panel — Grid-Based Bag

**One-liner:** Replaced backpack list with 5-column grid of visible bag slots, right-click context menus for item actions, and proper text wrapping for long names.

---

## Overview

Redesigned the inventory panel's backpack section from a vertical list to a grid-based RPG bag layout. Players now see all 20 bag positions as squares (5 columns × 4 rows), with filled slots showing rarity-colored item names and empty slots appearing as dimmed placeholders. Right-click context menus provide item actions (Equip/Use/Eat/Delete), matching the LocationGrid interaction pattern.

**Shipped:**
- 5-column grid bag layout showing all 20 slots
- Context menu for item actions on right-click
- Empty slot visualization (darker/dimmed squares)
- Stack count badges and slot-type labels on filled cells
- Text wrapping for long item names in both equipment and bag slots

---

## Tasks Completed

### Task 1: Add bag grid styles to styles.ts

**Commit:** `f23932e`

**What was done:**
- Added 6 new style entries to `styles.ts`:
  - `bagGrid` — CSS Grid container with 5 columns
  - `bagSlot` — Base square cell style (aspect-ratio, borders, flex layout)
  - `bagSlotFilled` — Filled slot override (blue tint, cursor pointer)
  - `bagSlotName` — Item name text with word-break for wrapping
  - `bagSlotQuantity` — Absolute-positioned stack count badge
  - `bagSlotSlotLabel` — Tiny uppercase slot-type label
- Fixed `equipmentSlotName` to enable text wrapping (`wordBreak`, `overflowWrap`)

**Files modified:**
- `src/ui/styles.ts`

**Verification:**
- TypeScript compilation successful (no errors in styles.ts)
- All 6 bag styles present and properly structured

---

### Task 2: Redesign InventoryPanel backpack to grid bag with context menus

**Commit:** `50652d8`

**What was done:**
- Imported `ContextMenu` component and Vue `ref`/`computed`
- Added context menu state (`contextMenu` ref) matching LocationGrid pattern
- Created `openItemContextMenu()` to build action menu based on item properties (equipable/usable/eatable)
- Implemented `bagSlots` computed property to pad inventory items with nulls up to `maxInventorySlots`
- Replaced list template with grid of 20 slots:
  - Empty slots: dim placeholder squares
  - Filled slots: rarity-colored name, slot label, stack count badge
  - Right-click: opens context menu
  - Hover: shows tooltip
- Changed `defineEmits` to `const emit = defineEmits(...)` for use in callbacks
- Added `ContextMenu` component to template with state binding

**Files modified:**
- `src/components/InventoryPanel.vue`

**Verification:**
- TypeScript compilation successful (no errors related to InventoryPanel)
- Grid-based bag with 5 columns visible
- Context menu provides all item actions (Equip/Use/Eat/Delete)
- Tooltips still functional on hover
- Text wrapping works for long item names

---

## Deviations from Plan

None — plan executed exactly as written.

---

## Key Decisions

**1. Grid-5col:** 5-column grid layout for 20-slot backpack
- Matches traditional RPG bag UX where players see capacity at a glance
- Fixed grid prevents layout shift as items are added/removed

**2. Context-menu-actions:** Right-click context menus replace inline action buttons
- Cleaner grid cells without cluttering each slot with 3-4 buttons
- Matches LocationGrid interaction pattern established in quick-16

**3. Padded-slots:** Compute padded bagSlots array to show empty positions
- Classic RPG bag feel where empty squares are visually distinct
- Players immediately see "I have 12/20 slots filled" without reading text

---

## Technical Notes

**Grid Layout:**
- CSS Grid with `repeat(5, 1fr)` creates equal-width columns
- `aspectRatio: '1'` ensures square cells regardless of content
- `gap: '0.35rem'` provides consistent spacing

**Context Menu Integration:**
- Same pattern as LocationGrid: `data-context-menu` attribute, outside-click detection
- Actions dynamically built based on item properties (equipable/usable/eatable)
- Equip action respects `combatLocked` prop (disabled during combat)

**Empty Slot Handling:**
- `bagSlots` computed fills array with nulls after inventory items
- Template uses `v-if="slot"` to conditionally render item details
- Empty cells show only base `bagSlot` style (no `bagSlotFilled`)

**Text Wrapping:**
- `wordBreak: 'break-word'` and `overflowWrap: 'break-word'` added to both `bagSlotName` and `equipmentSlotName`
- Prevents long item names from overflowing grid cells
- Maintains readability in compact grid layout

---

## Self-Check

Verifying deliverables:

**Files exist:**
- ✅ `src/ui/styles.ts` — modified with 6 new bag styles
- ✅ `src/components/InventoryPanel.vue` — redesigned with grid bag

**Commits exist:**
- ✅ `f23932e` — add bag grid styles
- ✅ `50652d8` — redesign backpack with grid and context menus

**Functionality:**
- ✅ Grid-based bag with 5 columns
- ✅ 20 visible slots (filled + empty)
- ✅ Right-click context menu with item actions
- ✅ Tooltips on hover
- ✅ Text wrapping for long names
- ✅ Stack count badges
- ✅ Slot type labels

## Self-Check: PASSED

All deliverables verified. No missing files or commits.

---

## Metrics

**Duration:** ~3 minutes
**Tasks:** 2/2 completed
**Files Modified:** 2
**Commits:** 2
**Lines Changed:** ~95 added, ~47 removed

---

## Next Steps

None — this was a standalone quick task to improve inventory UX. The grid-based bag pattern could be extended to other inventory systems (bank, trade windows) in future work.
