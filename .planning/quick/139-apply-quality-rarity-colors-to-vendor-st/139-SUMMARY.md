---
phase: quick-139
plan: 01
subsystem: client-ui
tags: [vendor, inventory, quality, colors, rarity]
dependency_graph:
  requires: []
  provides: [qualityTier-coloring-in-VendorPanel-backpack]
  affects: [src/components/VendorPanel.vue]
tech_stack:
  added: []
  patterns: [qualityTier-per-instance-coloring]
key_files:
  modified:
    - src/components/VendorPanel.vue
decisions:
  - Vendor for-sale items keep item.rarity (template-based, no per-instance quality)
  - Backpack items use item.qualityTier (per-instance rolled quality, matching InventoryPanel)
metrics:
  duration: 2min
  completed: 2026-02-17
---

# Phase quick-139 Plan 01: Apply Quality Rarity Colors to Vendor Backpack Summary

**One-liner:** VendorPanel backpack section now uses per-instance qualityTier for item name colors, matching InventoryPanel behavior.

## What Was Done

Fixed an inconsistency where backpack items shown in the vendor/store panel used `item.rarity` (the template's base rarity) for coloring instead of `item.qualityTier` (the per-instance rolled quality). This meant an uncommon-rolled sword from a common template showed white in the vendor backpack, but green in inventory.

## Changes Made

### Task 1: Use qualityTier for backpack item colors in VendorPanel

**File:** `src/components/VendorPanel.vue`

1. Added `qualityTier: string;` to the `inventoryItems` prop type (line 111)
2. Changed backpack section item name span from `rarityStyle(item.rarity)` to `rarityStyle(item.qualityTier)` (line 64)

The vendor for-sale section (line 18) was left unchanged — it correctly uses `item.rarity` since VendorInventory rows are template-based and have no per-instance quality.

**Commit:** b4509b5

## Verification

- Backpack section uses `rarityStyle(item.qualityTier)` — confirmed
- Vendor for-sale section still uses `rarityStyle(item.rarity)` — confirmed
- `qualityTier: string` added to inventoryItems prop type — confirmed
- No VendorPanel-specific TypeScript errors introduced (pre-existing App.vue errors unrelated)

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- `src/components/VendorPanel.vue` modified correctly
- Commit b4509b5 exists: `git log --oneline | grep b4509b5`
