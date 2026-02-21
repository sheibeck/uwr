---
phase: quick-263
plan: 01
subsystem: inventory
tags: [corpse, inventory, ownership, itemInstance, spacetimedb]

# Dependency graph
requires: []
provides:
  - "ItemInstance.ownerCharacterId set to 0n sentinel when item enters a corpse"
  - "ItemInstance.ownerCharacterId restored to character.id when item is looted from corpse"
  - "Dead character's inventory correctly shows empty after death"
  - "Looted items correctly reappear in looter's inventory"
affects: [corpse, inventory, loot]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "0n sentinel for ownerCharacterId means item is on a corpse (no owner); non-zero means it has a live owner"
    - "Corpse loot restore pattern: find itemInstance, update ownerCharacterId, then delete CorpseItem"

key-files:
  created: []
  modified:
    - spacetimedb/src/helpers/corpse.ts
    - spacetimedb/src/reducers/corpse.ts

key-decisions:
  - "Use 0n as sentinel for ownerCharacterId to denote items on a corpse — no valid character ID starts at 0 in SpacetimeDB auto-inc"
  - "Do not modify decayCorpse — it already deletes ItemInstance rows permanently, which is correct"
  - "Do not modify spawn_corpse test reducer — its inconsistency (item stays owned by character) is acceptable for admin testing"

patterns-established:
  - "Corpse ownership transfer: set ownerCharacterId=0n on corpse creation, restore on loot, delete on decay"

requirements-completed: [QUICK-263]

# Metrics
duration: 10min
completed: 2026-02-21
---

# Quick-263: Corpse Drop on Death — Ownership Transfer Summary

**ItemInstance.ownerCharacterId set to 0n sentinel on corpse creation and restored to character.id on loot, making dead character inventory correctly empty and restoring items on retrieval.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-02-21T22:08:00Z
- **Completed:** 2026-02-21T22:19:06Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments
- Dead character's inventory is now empty after death (ownerCharacterId=0n items are filtered out by useInventory)
- Items retrieved via loot_corpse_item immediately reappear in the looting character's inventory
- Items retrieved via loot_all_corpse also correctly restore ownerCharacterId before CorpseItem deletion
- Decayed items remain permanently deleted (no orphan ItemInstance rows)
- Module published to local SpacetimeDB with no errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Transfer item ownership to 0n sentinel in createCorpse** - `4948aa7` (feat)
2. **Task 2: Restore item ownership on loot in corpse reducers** - `d403e22` (feat)
3. **Task 3: Publish to local and verify** - no file changes (operational)

## Files Created/Modified
- `spacetimedb/src/helpers/corpse.ts` - Added `ctx.db.itemInstance.id.update({ ...item, ownerCharacterId: 0n })` inside the inventoryItems loop in createCorpse
- `spacetimedb/src/reducers/corpse.ts` - Added ownership restore in loot_corpse_item (before CorpseItem delete) and in loot_all_corpse loop (fetch + restore + delete pattern)

## Decisions Made
- Used 0n as a sentinel value for ownerCharacterId to indicate the item is on a corpse. No valid character ID starts at 0 due to SpacetimeDB auto-increment behavior (starts at 1).
- Did not modify decayCorpse — it already deletes ItemInstance rows entirely (permanent loss), which is correct behavior.
- Did not modify spawn_corpse admin reducer — its inconsistency (item keeps ownerCharacterId=character.id while CorpseItem exists) is acceptable for admin/testing use.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Build and publish completed cleanly on first attempt.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Corpse item ownership transfer is live and functional. The useInventory client filter (which filters by character.id) will now correctly exclude items with ownerCharacterId=0n. No client changes or bindings regeneration required — the existing ItemInstance subscription already carries ownerCharacterId.

---
*Phase: quick-263*
*Completed: 2026-02-21*
