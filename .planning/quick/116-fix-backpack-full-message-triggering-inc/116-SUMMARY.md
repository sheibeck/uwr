---
task: 116
title: Fix backpack full message triggering incorrectly at 15/20 slots
type: bug-fix
files_modified:
  - spacetimedb/src/reducers/items.ts
commit: e488dcd
---

# Quick Task 116: Fix Backpack Full Message Triggering Incorrectly

## Root Cause

In `spacetimedb/src/reducers/items.ts`, the `itemCount` variable in both the `buy_item` and `take_loot` reducers was computed as the total count of ALL item instances owned by the character — including items currently equipped (weapon, offhand, armor, helmet, etc.):

```typescript
// BEFORE (buggy)
const itemCount = [...ctx.db.itemInstance.by_owner.filter(character.id)].length;
```

With up to 5 equipment slots (mainHand, offHand, and armor pieces), a player with a full equipment loadout would see their effective bag count inflated. For example, 15 bag items + 5 equipped items = 20 total, triggering `itemCount >= 20` and showing "Backpack is full" even though 5 bag slots remained.

## Fix

Added `.filter((row) => !row.equippedSlot)` before `.length` in both locations (lines 141 and 225) to exclude equipped items from the bag slot count, consistent with the existing `getInventorySlotCount` helper in `helpers/items.ts` which already handled this correctly:

```typescript
// AFTER (fixed)
const itemCount = [...ctx.db.itemInstance.by_owner.filter(character.id)].filter((row) => !row.equippedSlot).length;
```

The `hasStack` check in both reducers already correctly used `!row.equippedSlot` — only the `itemCount` calculation was missing the filter.

## Files Changed

- `spacetimedb/src/reducers/items.ts` — Fixed `itemCount` in `buy_item` reducer (line 141) and `take_loot` reducer (line 225)
