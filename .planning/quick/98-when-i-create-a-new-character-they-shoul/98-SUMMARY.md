---
phase: quick-98
plan: 01
subsystem: character-creation
tags: [bug-fix, determinism, spawning]
dependency_graph:
  requires: []
  provides: [deterministic-character-spawn]
  affects: [character-creation, world-state]
tech_stack:
  added: []
  patterns: [direct-db-lookup]
key_files:
  created: []
  modified:
    - spacetimedb/src/reducers/characters.ts
decisions:
  - Use world.startingLocationId directly instead of bindStone iterator scan
  - Starting location remains Hollowmere (already set in ensure_world.ts)
metrics:
  duration_minutes: 1
  completed_date: 2026-02-16
---

# Quick Task 98: Fix Character Starting Location

**One-liner:** New characters now deterministically spawn at Hollowmere using world.startingLocationId instead of nondeterministic bindStone iterator scan.

## Summary

Fixed character creation to use the deterministic `world.startingLocationId` field instead of scanning for bindStone locations via iterator. This eliminates the bug where new characters would spawn at random bindStone locations (Slagstone Waystation, Gloomspire Landing, or Hollowmere) depending on SpacetimeDB's auto-increment ID gaps affecting iterator ordering.

**Problem:** The `create_character` reducer used `[...ctx.db.location.iter()].find(loc => loc.bindStone)` which returns whichever bindStone the iterator encounters first. Since SpacetimeDB auto-increment IDs are non-sequential with gaps, this ordering is nondeterministic.

**Solution:** Use `ctx.db.location.id.find(world.startingLocationId)` to directly lookup the canonical starting location (Hollowmere, set in ensure_world.ts line 652).

## Changes Made

### Task 1: Use startingLocationId for Character Placement

**Files Modified:**
- `spacetimedb/src/reducers/characters.ts` (lines 125-154)

**Changes:**
1. Replaced `bindLocation` variable with `startingLocation`
2. Removed iterator scan: `[...ctx.db.location.iter()].find((location) => location.bindStone)`
3. Used direct lookup: `ctx.db.location.id.find(world.startingLocationId)`
4. Updated error message: "Bind location not initialized" → "Starting location not initialized"
5. Updated two references (locationId and boundLocationId) to use `startingLocation.id`

**Verification:**
- ✅ No `bindLocation` references remain in file
- ✅ `startingLocation` used in 4 locations (definition + 3 usages)
- ✅ File compiles without errors

**Commit:** dfd8022

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

**Files Exist:**
- ✅ `C:/projects/uwr/spacetimedb/src/reducers/characters.ts` exists and contains changes
- ✅ `C:/projects/uwr/spacetimedb/src/seeding/ensure_world.ts` exists (context file, no changes needed)

**Commits Exist:**
- ✅ Commit dfd8022 exists in git log

**Changes Verified:**
- ✅ `grep "startingLocation"` returns 4 matches
- ✅ `grep "bindLocation"` returns 0 matches
- ✅ world.startingLocationId used for lookup
- ✅ locationId and boundLocationId both set to startingLocation.id

## Impact

**Before:** Characters spawned at whichever bindStone location the iterator returned first (random: Hollowmere, Slagstone Waystation, or Gloomspire Landing)

**After:** All new characters spawn deterministically at Hollowmere (the world's canonical starting location)

**Affected Systems:**
- Character creation flow
- New player experience (now consistent)

**No Breaking Changes:** Existing characters unaffected; only affects new character creation.

## Testing Recommendations

1. Create multiple new characters and verify all spawn at Hollowmere
2. Confirm locationId and boundLocationId both match world.startingLocationId
3. Verify no regression in character creation flow (name, race, class selection)
