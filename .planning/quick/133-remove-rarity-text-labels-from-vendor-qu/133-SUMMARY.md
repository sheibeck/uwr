---
phase: quick-133
plan: 01
subsystem: client-ui
tags: [ui, vendor, inventory, rarity, quality]
dependency_graph:
  requires: []
  provides: [clean-item-name-display-no-rarity-text]
  affects: [VendorPanel, InventoryPanel]
tech_stack:
  added: []
  patterns: []
key_files:
  created: []
  modified:
    - src/components/VendorPanel.vue
    - src/components/InventoryPanel.vue
decisions:
  - Item quality communicated by color only — text labels removed as redundant
  - Context menu subtitle uses slot type alone (e.g. "weapon" not "uncommon weapon")
metrics:
  duration: 44s
  completed: 2026-02-17T13:36:05Z
  tasks: 2
  files_modified: 2
---

# Phase quick-133 Plan 01: Remove Rarity Text Labels Summary

**One-liner:** Removed parenthetical rarity text from VendorPanel item lists and quality prefix from InventoryPanel context menu subtitle — quality is now communicated by name color only.

## What Was Done

Rarity/quality text labels were appearing redundantly next to item names in two locations:

1. **VendorPanel.vue** — Both the vendor inventory list and the backpack/sell list showed `(common)`, `(uncommon)` etc. as plain text after each colored item name span.
2. **InventoryPanel.vue** — The right-click context menu subtitle showed `"uncommon weapon"` instead of just `"weapon"`.

Quality information was already fully communicated through the name color (rarityStyle function). The text labels were clutter.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Remove rarity text from VendorPanel item lists | 2122e19 | src/components/VendorPanel.vue |
| 2 | Remove rarity prefix from InventoryPanel context menu subtitle | ab12b3e | src/components/InventoryPanel.vue |

## Changes Made

### Task 1 — VendorPanel.vue
- Removed `({{ item.rarity }})` text node from vendor inventory list item div (was line 19)
- Removed `({{ item.rarity }})` text node from backpack/sell list item div (was line 66)
- `rarityStyle` function and colored `<span>` elements left untouched

### Task 2 — InventoryPanel.vue
- Changed context menu `subtitle` from `` `${item.qualityTier} ${item.slot}` `` to `item.slot`
- `rarityStyle` and `qualityBorderStyle` functions retained for color/border styling

## Verification

- `grep "item.rarity }}" src/components/VendorPanel.vue` returns no output
- `grep "qualityTier.*slot" src/components/InventoryPanel.vue` matches only template color styling line (not subtitle)
- `rarityStyle` function present in VendorPanel (line 122) and InventoryPanel
- `qualityBorderStyle` function intact in InventoryPanel

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- src/components/VendorPanel.vue — modified, 2 deletions confirmed
- src/components/InventoryPanel.vue — modified, 1 substitution confirmed
- Commit 2122e19 exists
- Commit ab12b3e exists
