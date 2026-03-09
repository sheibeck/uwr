---
phase: 32-dead-code-removal
plan: 02
subsystem: backend
tags: [dead-code, refactoring, typescript, seeding-removal]

# Dependency graph
requires:
  - phase: 32-dead-code-removal
    plan: 01
    provides: domain rule files, rewired imports from legacy data files
provides:
  - 11 legacy files deleted (7 data + 4 seeding)
  - Old create_character reducer removed
  - ensureStarterItemTemplates relocated to helpers/items.ts
  - computeSellValue shared helper in helpers/economy.ts
  - 7 dead sync reducers removed from items.ts
affects: [32-03-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns: [shared-sell-price-helper, targeted-init-over-bulk-sync]

key-files:
  created: []
  modified:
    - spacetimedb/src/data/equipment_rules.ts
    - spacetimedb/src/helpers/items.ts
    - spacetimedb/src/helpers/economy.ts
    - spacetimedb/src/index.ts
    - spacetimedb/src/reducers/characters.ts
    - spacetimedb/src/reducers/commands.ts
    - spacetimedb/src/reducers/items.ts
    - spacetimedb/src/reducers/intent.ts

key-decisions:
  - "Relocated ensureStarterItemTemplates to helpers/items.ts -- still needed by grantStarterItems for character creation"
  - "Moved STARTER_ARMOR_DESCS, STARTER_ACCESSORY_DEFS, JUNK_DEFS to equipment_rules.ts"
  - "Replaced syncAllContent in init with targeted ensureRaces + ensureWorldState + ensureStarterItemTemplates"
  - "Extracted computeSellValue to helpers/economy.ts to deduplicate vendor sell price calculation"

patterns-established:
  - "Targeted init: init() calls only what is needed (races, world state, starter items, scheduled tables) instead of bulk sync"
  - "Shared economy helpers: vendor sell price logic in helpers/economy.ts"

requirements-completed: [CLEAN-01, CLEAN-03, CLEAN-05]

# Metrics
duration: 16min
completed: 2026-03-09
---

# Phase 32 Plan 02: Delete Legacy Backend Files & Deduplicate Logic Summary

**Deleted 11 legacy v1.0 files (seeding system + data definitions), removed old create_character reducer, extracted computeSellValue helper to deduplicate sell price logic**

## Performance

- **Duration:** 16 min
- **Started:** 2026-03-09T19:05:30Z
- **Completed:** 2026-03-09T19:21:40Z
- **Tasks:** 2
- **Files modified:** 19 (11 deleted, 8 modified)

## Accomplishments
- Deleted entire seeding/ directory (4 files) and 7 legacy data files (~9400 lines removed)
- Removed old form-based create_character reducer and its helper functions (computeRacialAtLevel, computeRacialContributions)
- Relocated ensureStarterItemTemplates to helpers/items.ts with data constants moved to equipment_rules.ts
- Replaced bulk syncAllContent in init with targeted initialization (ensureRaces, ensureWorldState, ensureStarterItemTemplates)
- Fixed missing ensure*Scheduled imports in clientConnected (pre-existing issue discovered during cleanup)
- Removed 7 dead sync reducers from items.ts (sync_equipment_tables, sync_loot_tables, sync_enemy_content, sync_world_layout, sync_ability_templates, sync_recipe_templates, sync_npc_quest_content)
- Extracted computeSellValue helper to deduplicate vendor sell price calculation across intent.ts and items.ts
- All 285 tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete legacy data files and seeding system** - `9ac5558` (feat)
2. **Task 2: Deduplicate backend logic and remove dead reducers** - `25a7a58` (refactor)

## Files Created/Modified
- `spacetimedb/src/data/equipment_rules.ts` - Added STARTER_ARMOR_DESCS, STARTER_ACCESSORY_DEFS, JUNK_DEFS
- `spacetimedb/src/helpers/items.ts` - Added ensureStarterItemTemplates (relocated from seeding)
- `spacetimedb/src/helpers/economy.ts` - Added computeSellValue shared helper
- `spacetimedb/src/index.ts` - Removed seeding imports, replaced syncAllContent with targeted init, fixed ensure*Scheduled imports
- `spacetimedb/src/reducers/characters.ts` - Removed old create_character reducer and unused deps
- `spacetimedb/src/reducers/commands.ts` - Removed seeding deps, updated /synccontent
- `spacetimedb/src/reducers/items.ts` - Removed 7 dead sync reducers, removed seeding deps, use computeSellValue
- `spacetimedb/src/reducers/intent.ts` - Use computeSellValue helper

### Deleted Files
- `spacetimedb/src/seeding/ensure_content.ts`
- `spacetimedb/src/seeding/ensure_enemies.ts`
- `spacetimedb/src/seeding/ensure_items.ts`
- `spacetimedb/src/seeding/ensure_world.ts`
- `spacetimedb/src/data/dialogue_data.ts`
- `spacetimedb/src/data/faction_data.ts`
- `spacetimedb/src/data/npc_data.ts`
- `spacetimedb/src/data/named_enemy_defs.ts`
- `spacetimedb/src/data/item_defs.ts`
- `spacetimedb/src/data/crafting_materials.ts`
- `spacetimedb/src/data/world_gen.ts`

## Decisions Made
- Relocated ensureStarterItemTemplates rather than deleting it -- still needed by grantStarterItems for v2.0 character creation
- Moved only the data constants needed by ensureStarterItemTemplates (STARTER_ARMOR_DESCS, STARTER_ACCESSORY_DEFS, JUNK_DEFS) to equipment_rules.ts; discarded world drop gear, jewelry, crafting base, boss drop definitions
- Replaced syncAllContent in init with just ensureRaces + ensureWorldState + ensureStarterItemTemplates -- all other seeding (world drops, recipes, enemies, NPCs) is now fully dynamic
- Kept create_item_template and grant_item reducers as potential admin utilities despite not being called from client

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Relocated ensureStarterItemTemplates instead of deleting**
- **Found during:** Task 1 (deletion phase)
- **Issue:** grantStarterItems (used by v2.0 creation.ts) depends on ensureStarterItemTemplates which was in seeding/ensure_items.ts
- **Fix:** Moved function to helpers/items.ts and data constants to equipment_rules.ts
- **Files modified:** spacetimedb/src/helpers/items.ts, spacetimedb/src/data/equipment_rules.ts
- **Committed in:** 9ac5558

**2. [Rule 1 - Bug] Fixed missing ensure*Scheduled imports in clientConnected**
- **Found during:** Task 1 (cleanup)
- **Issue:** ensureHealthRegenScheduled etc. were called in clientConnected but never imported -- Plan 01 extracted them to helpers/scheduling.ts but missed adding the import
- **Fix:** Added all 7 ensure*Scheduled function imports from helpers/scheduling.ts
- **Files modified:** spacetimedb/src/index.ts
- **Committed in:** 9ac5558

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All v1.0 legacy backend files are deleted
- Backend compiles and all 285 tests pass
- Plan 03 (client-side cleanup) can proceed -- client module_bindings will need regeneration after schema changes

## Self-Check: PASSED

All created/modified files verified present. All deleted files confirmed absent. Both task commits (9ac5558, 25a7a58) verified in git log.

---
*Phase: 32-dead-code-removal*
*Completed: 2026-03-09*
