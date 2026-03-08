---
phase: quick-379
plan: 01
subsystem: client-ui
tags: [inventory, backpack, gear-actions, proficiency]
dependency_graph:
  requires: []
  provides: [gear-action-menu, salvage-keyword, sell-keyword, proficiency-hint]
  affects: [narrative-backpack-flow]
tech_stack:
  added: []
  patterns: [gear-slot-detection, proficiency-hint-display]
key_files:
  modified:
    - src/App.vue
decisions:
  - "Weapon proficiency mismatch uses generic hint (weaponType not in tooltipData)"
  - "Sell keyword handler sets activeVendorId before calling sellItem (required by reducer)"
metrics:
  duration: 3min
  completed: "2026-03-08T21:33:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 1
---

# Quick 379: Fix Enemy Loot Items Not Equippable / No Actions

Backpack gear items now always show actionable options (Salvage, Sell, Equip) with proficiency mismatch hints for non-equippable items.

## What Changed

### Task 1: Expand backpack click handler with gear actions
- Added Salvage option for gear items (non-junk) in backpack click menu
- Added Sell option when vendor NPC is present at current location
- Added `salvage` keyword handler to process [Salvage ItemName] bracket clicks
- Added `sell` keyword handler to process [Sell ItemName] bracket clicks (sets activeVendorId for reducer)
- Gear items now always show at least one action instead of "no actions available"
- **Commit:** 03077ad

### Task 2: Add proficiency hint when item is not equippable
- Non-equippable gear items now show proficiency requirement hint before action options
- Armor items show specific type (e.g., "Requires leather proficiency")
- Weapon items show "Weapon proficiency mismatch" hint
- Hints display before action buttons so players understand why Equip is unavailable
- **Commit:** dc606c7

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Sell keyword handler needed activeVendorId**
- **Found during:** Task 1
- **Issue:** `sellItem()` requires `activeVendorId.value` to be set, which the plan's simple handler didn't account for
- **Fix:** Added vendor NPC lookup and `activeVendorId.value = vendorNpc.id` before calling sellItem
- **Files modified:** src/App.vue
- **Commit:** 03077ad

**2. [Rule 1 - Bug] weaponType not available on inventory items**
- **Found during:** Task 2
- **Issue:** `tooltipData` (spread into inventory items) includes `armorType` but not `weaponType`
- **Fix:** Used generic "Weapon proficiency mismatch" hint for weapon slots instead of specific type
- **Files modified:** src/App.vue
- **Commit:** dc606c7

## Verification

- Build passes (no new errors introduced; pre-existing TS errors unchanged)
- Gear items in backpack click menu show Salvage, Sell (if vendor), Equip (if proficiency matches)
- Non-equippable gear shows proficiency hint explaining why Equip is unavailable

## Self-Check: PASSED
