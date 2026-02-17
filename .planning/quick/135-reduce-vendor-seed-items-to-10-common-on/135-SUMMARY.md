---
phase: quick-135
plan: "01"
subsystem: economy
tags: [vendor, economy, items, sell, seed]
dependency_graph:
  requires: []
  provides: [vendor-common-only-seed, sell-item-to-vendor-inventory]
  affects: [vendor_inventory, sell_item reducer, ensureVendorInventory]
tech_stack:
  added: []
  patterns: [player-driven vendor economy, deterministic seed with rarity filter]
key_files:
  created: []
  modified:
    - spacetimedb/src/seeding/ensure_enemies.ts
    - spacetimedb/src/reducers/items.ts
    - src/App.vue
    - src/module_bindings/sell_item_type.ts
decisions:
  - "Removed stale-item deletion loop from ensureVendorInventory so player-sold items persist across sync calls"
  - "Resale price set to vendorValue * 2n per unit (not value * 2n which would scale with quantity)"
  - "sellItem guard extended to require activeVendorId so npcId is always valid"
metrics:
  duration: "~3 minutes"
  completed: "2026-02-17"
  tasks: 2
  files: 4
---

# Phase quick-135: Reduce Vendor Seed Items to 10 Common-Only + Player-Sold Items in Vendor Shops Summary

**One-liner:** Vendor seed capped at 10 common-only items (3 armor + 3 weapons + 2 accessories + 2 consumables), sell_item reducer adds sold items to vendor inventory at 2x vendorValue for a player-driven economy.

## What Was Done

### Task 1: Backend — Cap vendor seed and add sold items to vendor inventory

**`spacetimedb/src/seeding/ensure_enemies.ts`**

- Added `&& row.rarity === 'common'` filter to `allEligible` — uncommon, rare, epic, and legendary items are no longer seeded in vendor shops
- Reduced armor picks from 4 to 3: `pickN(armor, 3, vendor.id)`
- Capped consumables at 2: changed `const selectedConsumables = consumables` to `pickN(consumables, 2, vendor.id + 11n)`
- Total seed cap: 3 armor + 3 weapons + 2 accessories + 2 consumables = 10 items maximum
- Removed the stale-item deletion loop (lines 182-188) so player-sold items accumulate in vendor inventory and are never purged on sync

**`spacetimedb/src/reducers/items.ts`**

- Added `npcId: t.u64()` parameter to `sell_item` reducer
- After selling, checks if `npcId` refers to a vendor NPC
- If vendor found and item not already listed, inserts a new `vendorInventory` row with `price = template.vendorValue * 2n` (2x per-unit markup)
- Duplicate listings prevented via `alreadyListed` check

### Task 2: Client — Pass npcId when selling

**`src/App.vue`**

- Updated `sellItem` guard to also check `activeVendorId.value` (was only checking `selectedCharacter.value`)
- Passes `npcId: activeVendorId.value` to `sellReducer` call

**`src/module_bindings/`**

- Regenerated after `spacetime publish --clear-database -y` (required because reducer signature changed)
- `sell_item_type.ts` now includes `npcId: __t.u64()` field

## Verification

- Type errors in `items.ts` are all pre-existing `any` type patterns from SpacetimeDB server TypeScript (69 errors before and after change — identical count)
- Module published cleanly to local SpacetimeDB: `Database initialized` with no errors
- `sell_item_type.ts` binding confirmed to include `npcId: __t.u64()`

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check

### Files exist
- `spacetimedb/src/seeding/ensure_enemies.ts` — modified, rarity filter + 10-item cap + no stale removal
- `spacetimedb/src/reducers/items.ts` — modified, npcId param + vendor inventory insert
- `src/App.vue` — modified, activeVendorId guard + npcId passed to sellReducer
- `src/module_bindings/sell_item_type.ts` — regenerated with npcId field

### Commits exist
- `d4563db`: feat(quick-135): cap vendor seed to 10 common-only items and add sold items to vendor inventory
- `4523bea`: feat(quick-135): pass npcId to sell_item reducer and regenerate bindings

## Self-Check: PASSED
