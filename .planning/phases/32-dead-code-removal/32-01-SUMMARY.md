---
phase: 32-dead-code-removal
plan: 01
subsystem: backend
tags: [refactoring, dead-code, typescript, imports]

# Dependency graph
requires:
  - phase: 31-test-infrastructure
    provides: test coverage for helpers/items, helpers/combat, helpers/world_gen
provides:
  - 5 domain rule files (equipment_rules, crafting_rules, enemy_rules, faction_rules, npc_rules)
  - helpers/scheduling.ts with initScheduledTables
  - helpers/world_gen.ts with relocated generation functions
affects: [32-02-PLAN, 32-03-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns: [domain-rule-file extraction, scheduled-table-init consolidation]

key-files:
  created:
    - spacetimedb/src/data/equipment_rules.ts
    - spacetimedb/src/data/crafting_rules.ts
    - spacetimedb/src/data/enemy_rules.ts
    - spacetimedb/src/data/faction_rules.ts
    - spacetimedb/src/data/npc_rules.ts
    - spacetimedb/src/helpers/scheduling.ts
  modified:
    - spacetimedb/src/helpers/world_gen.ts
    - spacetimedb/src/helpers/location.ts
    - spacetimedb/src/helpers/items.ts
    - spacetimedb/src/helpers/npc_affinity.ts
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/reducers/items_gathering.ts
    - spacetimedb/src/reducers/items_crafting.ts
    - spacetimedb/src/reducers/items.ts
    - spacetimedb/src/reducers/commands.ts
    - spacetimedb/src/index.ts

key-decisions:
  - "Kept CONSUMABLE_RECIPES, GEAR_RECIPES, GEAR_RECIPE_NAMES in crafting_materials.ts since only seeding imports them"
  - "Removed sync_all_content reducer from items.ts -- redundant with admin /synccontent command"
  - "Kept syncAllContent in init for backward compat while adding initScheduledTables alongside it"

patterns-established:
  - "Domain rule files: extract mechanical rules from legacy data files before deletion"
  - "Scheduled table init: single initScheduledTables() consolidates all ensure*Scheduled calls"

requirements-completed: [CLEAN-02, CLEAN-06]

# Metrics
duration: 7min
completed: 2026-03-09
---

# Phase 32 Plan 01: Extract Rules & Rewire Imports Summary

**Extracted mechanical rules from 5 legacy data files into domain-specific rule files and rewired all 9 production importers to new locations**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-09T18:56:03Z
- **Completed:** 2026-03-09T19:03:14Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments
- Created 5 domain rule files extracting only mechanical rules (armor classes, crafting formulas, boss scaling, faction archetypes, affinity tiers)
- Relocated world_gen functions (pickRippleMessage, pickDiscoveryMessage, computeRegionDanger) from data/ to helpers/
- Created helpers/scheduling.ts consolidating all 7 scheduled table setup functions into initScheduledTables()
- Rewired all 9 production files to import from new rule files instead of legacy data files
- All 285 tests pass with new import paths

## Task Commits

Each task was committed atomically:

1. **Task 1: Create domain rule files and relocate active functions** - `d113458` (feat)
2. **Task 2: Rewire all importers to use new rule files and locations** - `1b8e246` (refactor)

## Files Created/Modified
- `spacetimedb/src/data/equipment_rules.ts` - Armor class restrictions, starter weapon defs
- `spacetimedb/src/data/crafting_rules.ts` - Material defs, modifier defs, crafting helpers and constants
- `spacetimedb/src/data/enemy_rules.ts` - Boss scaling constants, loot table structure
- `spacetimedb/src/data/faction_rules.ts` - Faction archetype vocabulary
- `spacetimedb/src/data/npc_rules.ts` - Affinity tiers, conversation cooldowns
- `spacetimedb/src/helpers/scheduling.ts` - initScheduledTables consolidation
- `spacetimedb/src/helpers/world_gen.ts` - Added relocated generation functions
- `spacetimedb/src/helpers/location.ts` - Rewired crafting_materials -> crafting_rules
- `spacetimedb/src/helpers/items.ts` - Rewired item_defs -> equipment_rules
- `spacetimedb/src/helpers/npc_affinity.ts` - Rewired npc_data -> npc_rules
- `spacetimedb/src/reducers/combat.ts` - Rewired crafting_materials -> crafting_rules
- `spacetimedb/src/reducers/items_gathering.ts` - Rewired crafting_materials -> crafting_rules
- `spacetimedb/src/reducers/items_crafting.ts` - Rewired crafting_materials -> crafting_rules
- `spacetimedb/src/reducers/items.ts` - Removed sync_all_content reducer
- `spacetimedb/src/reducers/commands.ts` - Added initScheduledTables to admin sync
- `spacetimedb/src/index.ts` - Rewired world_gen, removed ensureFactions, added initScheduledTables

## Decisions Made
- Kept CONSUMABLE_RECIPES/GEAR_RECIPES in crafting_materials.ts because only seeding code imports them (not production reducers)
- Removed the `sync_all_content` reducer from items.ts since admin /synccontent command in commands.ts serves the same purpose
- Kept `syncAllContent(ctx)` in init alongside new `initScheduledTables(ctx)` for backward compatibility with seeding

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All active imports from legacy data files now point to new domain rule files
- Legacy files (item_defs.ts, crafting_materials.ts, named_enemy_defs.ts, faction_data.ts, npc_data.ts, data/world_gen.ts) are ready for safe deletion in plan 02
- Seeding files (ensure_content.ts, ensure_items.ts, etc.) still import from legacy files but are isolated for removal in plan 02/03

## Self-Check: PASSED

All 7 created files verified present. Both task commits (d113458, 1b8e246) verified in git log.

---
*Phase: 32-dead-code-removal*
*Completed: 2026-03-09*
