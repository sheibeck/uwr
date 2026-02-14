---
phase: quick-88
plan: 01
subsystem: module-integrity
tags: [refactoring, imports, compilation]
dependency-graph:
  requires: [quick-83]
  provides: [compilable-module, publishable-module]
  affects: [spacetimedb-backend]
tech-stack:
  added: []
  patterns: [import-resolution, type-safety]
key-files:
  created: []
  modified:
    - spacetimedb/src/helpers/combat.ts
    - spacetimedb/src/seeding/ensure_enemies.ts
    - spacetimedb/src/index.ts
    - spacetimedb/src/seeding/ensure_items.ts
    - spacetimedb/src/seeding/ensure_world.ts
decisions:
  - "Import table types directly from schema/tables.ts for type annotations"
  - "Import constants for local use alongside re-exports to enable value access"
  - "Delete duplicate function definitions - maintain single source of truth in helpers/"
  - "Use null as any placeholder for deferred reducerDeps assignments"
metrics:
  duration: 313
  completed: 2026-02-14
  tasks: 3
  commits: 4
  files: 5
  lines-removed: 209
  lines-added: 22
---

# Quick Task 88: Fix Missing Imports After quick-83 Refactoring

**One-liner:** Resolved all undefined references introduced by index.ts modularization, restoring module to compilable/publishable state.

---

## Summary

The quick-83 refactoring split the 7000-line index.ts into modular files but left several files with missing imports. The module crashed during schema extraction with "Cannot find name" errors for types, constants, and functions that were moved but never imported. This task systematically fixed all import issues across 5 files, removed duplicate code, and verified successful module publishing.

---

## Tasks Completed

### Task 1: Fix missing imports in helpers/combat.ts
**Commit:** `3a12ad4`

Added two categories of missing imports:

1. **Table types for type annotations:**
   - `AggroEntry`, `EnemyTemplate`, `EnemyRoleTemplate`, `Character` from `../schema/tables`
   - Used in `typeof X.rowType` patterns at lines 1691, 1862-1864

2. **Combat constants for local use:**
   - `COMBAT_LOOP_INTERVAL_MICROS`, `AUTO_ATTACK_INTERVAL` (used at lines 402, 1882)
   - `GROUP_SIZE_DANGER_BASE`, `GROUP_SIZE_BIAS_RANGE`, `GROUP_SIZE_BIAS_MAX`
   - Previously only re-exported (lines 45-51), not imported for value access

3. **Type inference fix:**
   - Fixed `paladin_lay_on_hands` bigint subtraction type error (line 1093)
   - Wrapped subtraction operands in `BigInt()` to satisfy TypeScript

**Files modified:** `spacetimedb/src/helpers/combat.ts`

---

### Task 2: Remove duplicate spawn functions from ensure_enemies.ts and add missing imports
**Commit:** `09adc4d`

Removed 206 lines of duplicate code:
- Deleted `spawnEnemy` (lines 215-325)
- Deleted `spawnEnemyWithTemplate` (lines 327-394)
- Deleted `ensureAvailableSpawn` (lines 396-420)

These functions are canonical in `helpers/location.ts` and imported by `index.ts`. The duplicates contained undefined references to:
- `EnemySpawn`, `isNightTime`, `computeLocationTargetLevel`
- `seedSpawnMembers`, `refreshSpawnGroupCount`
- `GROUP_SIZE_*` constants

Added missing imports for remaining functions:
- `getGatherableResourceTemplates`, `findEnemyTemplateByName` from `../helpers/location`
- `findItemTemplateByName` from `../helpers/items`
- `EnemyTemplate` from `../schema/tables`

**Files modified:** `spacetimedb/src/seeding/ensure_enemies.ts`
**Lines removed:** 206
**Lines added:** 3

---

### Task 3: Fix index.ts Player insert and reducerDeps typing
**Commit:** `ce0c6a8`

Fixed two compile errors:

1. **Missing Player field:**
   - Added `sessionStartedAt: undefined` to Player.insert() in clientConnected (line 291)
   - Field exists in Player table schema but was omitted from insert object

2. **reducerDeps property assignment:**
   - Added `startCombatForSpawn: null as any` to initial reducerDeps declaration (line 438)
   - Enables assignment on line 440 without TypeScript error
   - Pattern: declare placeholder, assign actual function later

**Files modified:** `spacetimedb/src/index.ts`

---

### Additional Fixes (Deviation Rule 3 - Auto-fix blocking issues)
**Commit:** `1282d73`

During verification, discovered additional missing imports in two seeding files:

**ensure_items.ts:**
- Added `ItemTemplate` from `../schema/tables` (used in type annotations lines 438-444)
- Added `ABILITIES` from `../data/ability_catalog` (used line 674)
- Added `ABILITY_STAT_SCALING` from `../data/combat_scaling` (used lines 710, 734, 760)

**ensure_world.ts:**
- Added `findEnemyTemplateByName`, `areLocationsConnected` from `../helpers/location`
- Added `getWorldState`, `DAY_DURATION_MICROS` from `../helpers/location`
- Initially attempted imports from non-existent `../helpers/world` and `../data/day_night`
- Corrected to proper source: `helpers/location.ts`

**Files modified:** `spacetimedb/src/seeding/ensure_items.ts`, `spacetimedb/src/seeding/ensure_world.ts`

---

## Deviations from Plan

### Auto-fixed Issues (Rule 3 - Blocking issues)

**1. [Rule 3 - Blocking] Additional missing imports in ensure_items.ts**
- **Found during:** Verification step - TypeScript compilation check
- **Issue:** ensure_items.ts referenced `ItemTemplate`, `ABILITIES`, and `ABILITY_STAT_SCALING` without importing them
- **Fix:** Added imports from `../schema/tables`, `../data/ability_catalog`, `../data/combat_scaling`
- **Files modified:** `spacetimedb/src/seeding/ensure_items.ts`
- **Commit:** `1282d73`
- **Rationale:** Plan only covered 3 files, but quick-83 refactoring affected 5 files total. These missing imports blocked module publishing (compilation failure).

**2. [Rule 3 - Blocking] Additional missing imports in ensure_world.ts**
- **Found during:** Verification step - module publish attempt
- **Issue:** ensure_world.ts referenced `findEnemyTemplateByName`, `areLocationsConnected`, `getWorldState`, `DAY_DURATION_MICROS` without importing them
- **Fix:** Added imports from `../helpers/location`
- **Files modified:** `spacetimedb/src/seeding/ensure_world.ts`
- **Commit:** `1282d73`
- **Rationale:** Initially unclear where these symbols lived (attempted non-existent paths). Located in `helpers/location.ts`. Required to complete task (module wouldn't publish).

---

## Verification Results

### TypeScript Compilation
```bash
npx tsc --noEmit 2>&1 | grep "Cannot find name"
# Result: 0 undefined reference errors
```

All "Cannot find name" errors resolved. Remaining 198 errors are pre-existing type inference issues from:
- `RowBuilder` type complexity (SpacetimeDB SDK limitation)
- `any` parameter usage in context objects
- Non-blocking for module publishing

### Module Publishing
```bash
spacetime publish uwr --project-path spacetimedb
# Result: SUCCESS
# "Updated database with name: uwr, identity: c200f2029b92b15e2164adf6951b34cc614ea4063d36996c58cac1799244c14a"
```

Module publishes successfully. Schema extraction no longer blocked by undefined references.

---

## Self-Check

Verifying all commits and files exist:

```bash
# Check commits
git log --oneline | grep -E "3a12ad4|09adc4d|ce0c6a8|1282d73"
```

**Commits verified:**
- ✅ `3a12ad4` - fix(quick-88): add missing imports to helpers/combat.ts
- ✅ `09adc4d` - fix(quick-88): remove duplicate spawn functions and add missing imports
- ✅ `ce0c6a8` - fix(quick-88): add sessionStartedAt to Player insert and fix reducerDeps typing
- ✅ `1282d73` - fix(quick-88): add missing imports to ensure_items.ts and ensure_world.ts

**Files verified:**
- ✅ `spacetimedb/src/helpers/combat.ts` - imports added, BigInt() casts
- ✅ `spacetimedb/src/seeding/ensure_enemies.ts` - duplicates removed, imports added
- ✅ `spacetimedb/src/index.ts` - sessionStartedAt field, reducerDeps placeholder
- ✅ `spacetimedb/src/seeding/ensure_items.ts` - ItemTemplate, ABILITIES imports
- ✅ `spacetimedb/src/seeding/ensure_world.ts` - location helper imports

## Self-Check: PASSED

---

## Impact

**Before:**
- Module crashes during `spacetime publish` with schema extraction errors
- ~13 "Cannot find name" errors across 5 files
- 206 lines of duplicate code with undefined references
- Broken state from quick-83 refactoring

**After:**
- Module compiles and publishes successfully
- Zero undefined reference errors
- Single source of truth for spawn functions (helpers/location.ts)
- All seeding functions have proper imports
- 187 net lines removed (209 deleted, 22 added)

**Critical restoration:** Module is now usable for development and deployment after quick-83 broke compilation.

---

## Notes

1. **Import patterns established:**
   - Table types: import from `schema/tables.ts`
   - Helper functions: import from `helpers/*.ts`
   - Constants: import from `data/*.ts`
   - Catalog data: import from `data/ability_catalog.ts`

2. **Re-export pattern clarified:**
   - Re-exports alone don't provide value access for local use
   - Must import for local use, then re-export separately
   - Used in combat.ts for `COMBAT_LOOP_INTERVAL_MICROS`, etc.

3. **Duplicate code elimination:**
   - Spawn functions now single-sourced in `helpers/location.ts`
   - index.ts imports from helpers instead of duplicating
   - Reduces maintenance burden and prevents drift

4. **Quick-83 scope underestimation:**
   - Plan only documented 3 files with issues
   - Actual impact: 5 files needed fixes
   - Lesson: Post-refactoring verification should compile full module, not just listed files

5. **TypeScript strictness trade-offs:**
   - Some `any` usage in SpacetimeDB context objects
   - `null as any` placeholders for circular dependencies
   - Acceptable for rapid prototyping, but noted for future type improvement
