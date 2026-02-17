---
phase: quick-141
plan: "01"
subsystem: backend-items
tags: [sell-item, vendor-inventory, investigation, publish]
dependency_graph:
  requires: []
  provides: [sell_item_vendor_listing_verified]
  affects: [spacetimedb/src/reducers/items.ts]
tech_stack:
  added: []
  patterns: [investigation-and-verify]
key_files:
  created: []
  modified: []
decisions:
  - "No code change needed: sell_item reducer already has no rarity filter on VendorInventory insert path"
  - "alreadyListed check correctly prevents duplicates when template is already seeded on vendor (correct behavior per spec)"
  - "Module republished to clear any stale state; clean initialization confirmed via logs"
metrics:
  duration: "5min"
  completed: "2026-02-17"
---

# Phase quick-141 Plan 01: Fix sell_item VendorInventory listing for non-common items Summary

Investigated and verified the sell_item reducer's VendorInventory insert path. Confirmed no rarity filter exists that would block non-common quality items from being listed. Module republished to flush any stale state.

## What Was Done

### Investigation

Read the `sell_item` reducer at `spacetimedb/src/reducers/items.ts` lines 165-216 in full.

The VendorInventory insert path (lines 191-206):
1. Finds NPC by `args.npcId` and verifies `npcType === 'vendor'`
2. Checks `alreadyListed` — queries `vendorInventory.by_vendor` for any row where `itemTemplateId === soldTemplateId`
3. If NOT already listed, inserts at `soldVendorValue * 2n` (min 10n)
4. **No rarity filter exists anywhere in this path**

The `ensureVendorInventory` seeding function at `spacetimedb/src/seeding/ensure_enemies.ts` correctly filters `rarity === 'common'` for seeding only. This is correct per requirements and was not changed.

The client-side `sellItem` function in `App.vue` correctly passes `npcId: activeVendorId.value` to the reducer.

### Why items may appear to not get listed

For templates that ARE already seeded on the vendor (seeded as common items), selling a non-common quality version of that item will NOT create a duplicate entry. This is **correct behavior** — the item is already listed, and the seller still receives gold and has their item removed. The VendorInventory already has an entry for that template.

For templates that are NOT on the vendor, any quality drop of that template will create a new entry at `vendorValue * 2`. This works correctly.

### Module Publish

Published module with `spacetime publish uwr --project-path spacetimedb` to ensure any stale state from previous publishes is cleared. Module initialized cleanly with no errors.

## Deviations from Plan

None — plan correctly predicted no code change was needed. Investigation confirmed correctness. Module republished as recommended.

## Self-Check

- `spacetimedb/src/reducers/items.ts` — no change needed, code verified correct
- Module published successfully: `spacetime publish uwr` completed without errors
- Server logs show clean database initialization

## Self-Check: PASSED
