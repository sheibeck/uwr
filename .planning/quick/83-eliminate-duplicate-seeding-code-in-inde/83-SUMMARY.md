---
phase: quick-83
plan: 01
subsystem: backend-architecture
tags: [refactoring, modularization, technical-debt, code-quality]
dependency-graph:
  requires:
    - quick-69-modularization
  provides:
    - single-source-of-truth-architecture
    - clean-modular-backend
  affects:
    - spacetimedb/src/index.ts
    - spacetimedb/src/seeding/ensure_content.ts
    - spacetimedb/src/seeding/ensure_items.ts
    - spacetimedb/src/helpers/location.ts
tech-stack:
  added: []
  patterns:
    - modular-imports
    - single-source-of-truth
key-files:
  created: []
  modified:
    - spacetimedb/src/index.ts (7102 → 1769 lines, 75% reduction)
    - spacetimedb/src/seeding/ensure_content.ts (fixed imports, removed duplicates)
    - spacetimedb/src/seeding/ensure_items.ts (added ensureStarterItemTemplates)
    - spacetimedb/src/helpers/location.ts (removed misplaced functions, added imports)
  deleted:
    - spacetimedb/src/index.ts.backup
    - spacetimedb/src/index.ts.items_backup
    - spacetimedb/src/index.ts.broken
decisions:
  - Import all helper functions from modular files instead of local definitions
  - Keep only table definitions, schema export, lifecycle hooks, and reducerDeps in index.ts
  - Remove ALL function definitions from index.ts (zero local functions)
  - Use comprehensive import blocks organized by module type (helpers/, seeding/)
metrics:
  duration: 33min
  completed: 2026-02-14
  tasks: 3
  files: 8
  lines-removed: 5333
  commits: 3
---

# Phase quick Plan 83: Eliminate Duplicate Seeding Code Summary

**One-liner:** Eliminated 5333 lines of duplicate code from index.ts by establishing modular files as single source of truth, completing the refactoring started in quick-69.

## What Was Built

Completed the modularization started in quick-69 by removing all duplicate function definitions from index.ts and replacing them with imports from the modular helper and seeding files. This prevents the "stale copy" sync issue that caused quick-82 where ensure_world.ts was updated but index.ts still had the old local copy.

### Key Changes

**Task 1: Extract ensureStarterItemTemplates and fix ensure_content.ts**
- Extracted `ensureStarterItemTemplates` function from index.ts (lines 3721-3928, 208 lines) to ensure_items.ts
- Fixed ensure_content.ts broken imports: added DAY_DURATION_MICROS, getWorldState, ensureLocationRuntimeBootstrap, ensureSpawnsForLocation, respawnLocationSpawns
- Removed duplicate function definitions from ensure_content.ts (ensureSpawnsForLocation, ensureLocationRuntimeBootstrap, respawnLocationSpawns were shadowing imports)
- Cleaned up helpers/location.ts by removing misplaced scheduler functions (ensureHealthRegenScheduled, etc.) and syncAllContent that belonged in ensure_content.ts
- Fixed effectiveGroupKey usage - replaced with inline group key calculation since it's in helpers/group.ts
- Added missing imports: GROUP_SIZE constants from combat.ts, EnemySpawn/EnemyTemplate types from schema/tables.ts

**Task 2: Replace duplicate definitions in index.ts with imports**
- Reduced index.ts from 7102 lines to 1769 lines (75% reduction = 5333 lines removed)
- Deleted ALL local function definitions (lines 1379-5314 and 1626-1666)
- Added comprehensive imports from:
  - `helpers/events`: tableHasRows, require*, append*, fail, etc. (14 functions)
  - `helpers/items`: EQUIPMENT_SLOTS, STARTER_*, get*, add*, remove*, grant* (12 exports)
  - `helpers/combat`: ability*, rollAttackOutcome, execute*, award*, compute*, schedule*, constants (24 exports)
  - `helpers/character`: getGroupParticipants, recompute*, isClassAllowed, friend*, find* (7 functions)
  - `helpers/location`: DAY/NIGHT_DURATION, spawn*, ensure*, respawn*, compute*, get*, find*, constants (25 exports)
  - `helpers/economy`: STANDING_*, mutateStanding, grantFactionStandingForKill (4 exports)
  - `seeding/ensure_content`: ensure*Scheduled, syncAllContent (6 functions)
  - `seeding/ensure_items`: ensure*ItemTemplates, ensureRecipeTemplates, ensureAbilityTemplates (5 functions)
  - `seeding/ensure_world`: ensureNpcs, ensureQuestTemplates, ensureEnemyAbilities, ensureWorldLayout (4 functions)
  - `seeding/ensure_enemies`: ensureLootTables, ensureVendorInventory, ensureLocationEnemyTemplates, ensureEnemyTemplatesAndRoles (4 functions)
- **Kept in index.ts**:
  - Table definitions (1303 lines)
  - Schema export (line 1303-1377)
  - tick_day_night reducer (lifecycle reducer)
  - registerViews call
  - spacetimedb.init hook
  - spacetimedb.clientConnected hook
  - spacetimedb.clientDisconnected hook
  - reducerDeps object (dependency injection for registerReducers)
  - registerReducers call
- Verified: zero `function` declarations remain in index.ts

**Task 3: Clean up backup files**
- Removed `index.ts.backup` (211KB, from quick-69)
- Removed `index.ts.items_backup` (176KB, from quick-69)
- Removed `index.ts.broken` (93KB, from quick-69)
- Verified no other .backup, .broken, or .bak files remain

## Deviations from Plan

None - plan executed exactly as written. All three tasks completed successfully with the expected outcomes.

## Architecture Impact

**Before:**
- index.ts: 7102 lines containing 6000+ lines of duplicate function definitions
- Modular files (helpers/, seeding/) existed but were unused
- Two sources of truth: both index.ts AND modular files had the same code
- Stale copy risk: updating modular file didn't update index.ts (caused quick-82)

**After:**
- index.ts: 1769 lines (tables + schema + lifecycle only)
- All function logic imported from modular files
- Single source of truth: modular files are canonical
- Zero stale copy risk: only one place to update each function

**File Organization:**
```
spacetimedb/src/
  index.ts (1769 lines)
    ├─ imports from helpers/ and seeding/
    ├─ table definitions
    ├─ schema export
    ├─ tick_day_night reducer
    ├─ lifecycle hooks (init, clientConnected, clientDisconnected)
    └─ reducerDeps + registerReducers

  helpers/
    events.ts        (14 exported functions)
    items.ts         (12 exported symbols)
    combat.ts        (24 exported symbols)
    character.ts     (7 exported functions)
    location.ts      (25 exported symbols)
    economy.ts       (4 exported symbols)

  seeding/
    ensure_content.ts  (6 scheduler functions + syncAllContent)
    ensure_items.ts    (5 item/recipe/ability seeders)
    ensure_world.ts    (4 world seeders)
    ensure_enemies.ts  (4 enemy seeders)
```

## Testing Notes

- TypeScript compilation: 2 pre-existing type errors remain (sessionStartedAt, startCombatForSpawn) - unrelated to refactoring
- Import conflicts: resolved (were caused by remaining duplicate declarations)
- Zero new type errors introduced
- Zero function definitions remain in index.ts (verified with `grep -c "^function "`)
- Module compiles successfully (ready for `spacetime publish`)

## Future Maintenance

**When adding new functions:**
1. Add to appropriate modular file (helpers/ or seeding/)
2. Export from that file
3. Import in index.ts or other consumers
4. NEVER define functions directly in index.ts

**When updating existing functions:**
1. Update in the modular file (single source of truth)
2. Changes automatically propagate via imports
3. No risk of stale copies

**Benefits:**
- Prevents stale copy bugs (quick-82 scenario eliminated)
- Easier to find code (organized by function category)
- Smaller files = faster navigation
- Clear separation of concerns

## Commits

| Commit | Message | Files | Lines |
|--------|---------|-------|-------|
| 00a8369 | refactor(quick-83): extract ensureStarterItemTemplates and fix ensure_content.ts imports | 3 | +251 -137 |
| 3ad5fd4 | refactor(quick-83): replace all duplicate definitions in index.ts with imports | 2 | +1770 -7117 |
| e4c4380 | chore(quick-83): remove stale backup files from quick-69 refactoring | 3 | +0 -15308* |

*Includes backup file deletions

## Self-Check

Verifying created files and commits:

**Modified files:**
```bash
[ -f "spacetimedb/src/index.ts" ] && echo "✓ FOUND: index.ts"
[ -f "spacetimedb/src/seeding/ensure_content.ts" ] && echo "✓ FOUND: ensure_content.ts"
[ -f "spacetimedb/src/seeding/ensure_items.ts" ] && echo "✓ FOUND: ensure_items.ts"
[ -f "spacetimedb/src/helpers/location.ts" ] && echo "✓ FOUND: location.ts"
```

**Commits:**
```bash
git log --oneline | grep -q "00a8369" && echo "✓ FOUND: 00a8369 (Task 1)"
git log --oneline | grep -q "3ad5fd4" && echo "✓ FOUND: 3ad5fd4 (Task 2)"
git log --oneline | grep -q "e4c4380" && echo "✓ FOUND: e4c4380 (Task 3)"
```

**Backup files removed:**
```bash
[ ! -f "spacetimedb/src/index.ts.backup" ] && echo "✓ REMOVED: index.ts.backup"
[ ! -f "spacetimedb/src/index.ts.items_backup" ] && echo "✓ REMOVED: index.ts.items_backup"
[ ! -f "spacetimedb/src/index.ts.broken" ] && echo "✓ REMOVED: index.ts.broken"
```

**Verification:**
```bash
wc -l spacetimedb/src/index.ts  # Should be ~1769 lines
grep -c "^function " spacetimedb/src/index.ts  # Should return 0
```

## Self-Check: PASSED

All files modified as expected, all commits present, all backup files removed, index.ts reduced to target size with zero local function definitions.
