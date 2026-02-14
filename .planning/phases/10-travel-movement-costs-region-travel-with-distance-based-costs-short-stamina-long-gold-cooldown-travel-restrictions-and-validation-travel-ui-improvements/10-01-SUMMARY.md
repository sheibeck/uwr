---
phase: 10-travel-movement-costs
plan: 01
subsystem: gameplay-mechanics
tags: [spacetimedb, travel, stamina, cooldown, movement]

# Dependency graph
requires:
  - phase: 01-races
    provides: Character table structure
  - phase: 02-hunger
    provides: Stamina system foundation
provides:
  - TravelCooldown table for per-character cross-region cooldown tracking
  - TRAVEL_CONFIG constants for flat stamina costs (5 within-region, 10 cross-region)
  - Travel cost validation in move_character reducer with all-or-nothing group stamina check
  - 5-minute per-character cooldown for cross-region travel
affects: [11-death-corpse, travel-ui, bind-stone-travel]

# Tech tracking
tech-stack:
  added: []
  patterns: [all-or-nothing group validation, per-character cooldown tracking, opportunistic expired cooldown cleanup]

key-files:
  created:
    - spacetimedb/src/data/travel_config.ts
  modified:
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/reducers/movement.ts

key-decisions:
  - "Flat stamina costs per character (5 within-region, 10 cross-region) - no BFS, no gold, no distance scaling"
  - "All-or-nothing group validation - entire group move fails if any member lacks stamina"
  - "Per-character cooldown for cross-region travel (not group-wide)"
  - "Within-region travel has no cooldown"
  - "Opportunistic expired cooldown cleanup during cooldown check"

patterns-established:
  - "Travel cost constants centralized in data/travel_config.ts following existing data/ pattern"
  - "Cooldown table pattern consistent with ItemCooldown/AbilityCooldown (by_character index, public table)"
  - "Region crossing detection via fromLocation.regionId !== toLocation.regionId"

# Metrics
duration: 2min
completed: 2026-02-14
---

# Phase 10 Plan 01: Travel Cost System Backend Summary

**Flat stamina-based travel costs (5 within-region, 10 cross-region) with per-character 5-minute cross-region cooldown and all-or-nothing group validation**

## Performance

- **Duration:** 2 min 24 sec
- **Started:** 2026-02-14T07:54:37Z
- **Completed:** 2026-02-14T07:57:01Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- TravelCooldown table created with by_character index for per-character cooldown tracking
- TRAVEL_CONFIG constants establish flat stamina costs (5 within-region, 10 cross-region, 5-minute cooldown)
- move_character reducer validates and deducts stamina from all group members
- Cross-region travel applies 5-minute per-character cooldown with opportunistic cleanup
- All-or-nothing group validation ensures entire group move fails if any member lacks stamina

## Task Commits

Each task was committed atomically:

1. **Task 1: Add TravelCooldown table and TRAVEL_CONFIG constants** - `20fdd65` (feat)
   - Created travel_config.ts with flat stamina costs
   - Added TravelCooldown table to schema with by_character index
   - Registered TravelCooldown in schema export

2. **Task 2: Update move_character reducer with stamina costs, cooldown validation, and group-wide stamina check** - `6e28d61` (feat)
   - Region crossing detection comparing regionId values
   - Collect all traveling characters (solo or group leader + following members)
   - Validate all-or-nothing stamina check
   - Check cross-region cooldown only for cross-region travel
   - Deduct stamina from all group members
   - Apply 5-minute per-character cooldown for cross-region travel
   - Clean up expired cooldowns opportunistically

## Files Created/Modified
- `spacetimedb/src/data/travel_config.ts` - Travel cost constants (5n within-region, 10n cross-region stamina, 5-minute cooldown)
- `spacetimedb/src/schema/tables.ts` - TravelCooldown table definition with by_character index
- `spacetimedb/src/reducers/movement.ts` - Updated move_character reducer with cost validation, region crossing detection, and cooldown management

## Decisions Made
- Flat stamina costs per character - no BFS distance calculation, no gold costs, no per-step scaling (per user decision)
- All-or-nothing group validation - if ANY group member lacks stamina, entire move fails with "[CharacterName] does not have enough stamina to travel" error
- Per-character cooldown (not group-wide) - each character tracks their own 5-minute cross-region cooldown
- Opportunistic expired cooldown cleanup - during cooldown check, delete expired cooldowns to avoid accumulation
- Within-region travel has NO cooldown - only cross-region travel triggers cooldown

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - implementation followed plan specifications without complications.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Backend travel cost system complete. Ready for:
- Phase 10-02: Travel UI improvements showing stamina costs and cooldown countdown
- Phase 10-03: Travel validation and restrictions (level requirements, faction restrictions, etc.)
- Future bind stone/hearthstone travel mechanics

Database schema extended with TravelCooldown table. Client bindings will need regeneration after module publish.

## Self-Check: PASSED

All claims verified:
- ✅ FOUND: spacetimedb/src/data/travel_config.ts
- ✅ FOUND: 20fdd65 (Task 1 commit)
- ✅ FOUND: 6e28d61 (Task 2 commit)
- ✅ FOUND: TravelCooldown in schema
- ✅ FOUND: TRAVEL_CONFIG used in reducer

---
*Phase: 10-travel-movement-costs*
*Completed: 2026-02-14*
