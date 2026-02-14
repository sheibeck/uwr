---
phase: 10-travel-movement-costs
plan: 02
subsystem: ui
tags: [travel, spacetimedb, vue, cooldown, stamina]

# Dependency graph
requires:
  - phase: 10-01
    provides: TravelCooldown table and move_character reducer with stamina costs
provides:
  - Travel UI with stamina cost indicators and cooldown countdown display
  - Client bindings for TravelCooldown table
  - Real-time cooldown countdown timer synchronized with server clock
affects: [10-03, travel-system, ui-patterns]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Server clock offset pattern for countdown timers (window.__server_clock_offset)
    - Cross-region detection via regionId comparison
    - Real-time countdown updates with 1-second interval timer

key-files:
  created:
    - src/module_bindings/travel_cooldown_table.ts
    - src/module_bindings/travel_cooldown_type.ts
    - spacetimedb/src/data/combat_constants.ts
  modified:
    - src/components/TravelPanel.vue
    - src/App.vue
    - src/composables/useGameData.ts
    - spacetimedb/src/index.ts
    - spacetimedb/src/helpers/combat.ts
    - spacetimedb/src/helpers/location.ts

key-decisions:
  - "Travel cost display format: '5 sta' / '10 sta' for clarity"
  - "Cross-region visual distinction via amber color for region name"
  - "Cooldown countdown uses server clock offset from quick-55 for accuracy"
  - "Dim unaffordable options with opacity: 0.5 for visual feedback"
  - "No gold cost or distance display - stamina-only system"

patterns-established:
  - "Server clock offset integration for accurate server-time-based countdowns"
  - "Dual-criteria button disabling: affordability + cooldown state"
  - "Cross-region determination via currentRegionId comparison pattern"

# Metrics
duration: 8min
completed: 2026-02-14
---

# Phase 10 Plan 02: Travel UI Improvements Summary

**Travel panel with stamina cost indicators (5/10 sta), live cooldown countdown timer, and affordability-based button disabling**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-13T23:34:00Z (approx)
- **Completed:** 2026-02-14T04:39:37Z
- **Tasks:** 3 (2 auto + 1 checkpoint)
- **Files modified:** 10

## Accomplishments
- TravelCooldown table added to client bindings with regeneration
- Travel buttons show stamina costs (5 sta within-region, 10 sta cross-region)
- Live cooldown countdown timer displays time remaining until cross-region travel available
- Travel buttons disabled when character lacks stamina or cross-region cooldown active
- Cross-region destinations visually distinguished with amber-colored region name

## Task Commits

Each task was committed atomically:

1. **Task 1: Publish module and regenerate client bindings** - `67f51c4` (feat)
2. **Task 2: Update TravelPanel with cost indicators and cooldown display** - `876bc2a` (feat)
3. **Task 3: Human verification of travel cost system** - No commit (checkpoint - user verified)

**Deviation fix:** `3a449d3` (fix: circular dependency resolution)

## Files Created/Modified
- `src/module_bindings/travel_cooldown_table.ts` - TravelCooldown table bindings
- `src/module_bindings/travel_cooldown_type.ts` - TravelCooldownRow type definitions
- `src/module_bindings/index.ts` - Updated with TravelCooldown exports
- `src/components/TravelPanel.vue` - Added cost indicators, cooldown countdown, affordability checks
- `src/App.vue` - Added TravelCooldown table subscription and prop passing
- `src/composables/useGameData.ts` - Added travelCooldowns to game data
- `spacetimedb/src/index.ts` - Added TravelCooldown table definition
- `spacetimedb/src/data/combat_constants.ts` - Created to break circular dependency
- `spacetimedb/src/helpers/combat.ts` - Refactored to use combat_constants.ts
- `spacetimedb/src/helpers/location.ts` - Updated imports to use combat_constants.ts

## Decisions Made
- Display format "X sta" for stamina costs (concise and clear)
- Amber color (#d4a574) for cross-region region names to visually distinguish from within-region
- Used server clock offset pattern from quick-55 for accurate countdown synchronization
- Opacity reduction (0.5) for unaffordable travel options instead of completely hiding them
- No gold cost or distance display per simplified flat-rate stamina-only system

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Circular dependency between combat.ts and location.ts**
- **Found during:** Task 1 (Module publish)
- **Issue:** Module publish failed due to circular import: combat.ts imported location.ts (for STARTING_LOCATION_ID), location.ts imported combat.ts (for TRAVEL_CONFIG). TypeScript circular dependency prevented bundling.
- **Fix:** Created `combat_constants.ts` with shared constants (TRAVEL_CONFIG, STARTING_LOCATION_ID). Updated combat.ts to re-export from combat_constants.ts, location.ts to import from combat_constants.ts directly. Breaks circular dependency chain.
- **Files modified:**
  - Created `spacetimedb/src/data/combat_constants.ts`
  - Modified `spacetimedb/src/helpers/combat.ts`
  - Modified `spacetimedb/src/helpers/location.ts`
- **Verification:** Module published successfully without errors
- **Committed in:** `3a449d3` (fix commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Circular dependency fix was necessary for module to build. No scope creep - extracted shared constants to break import cycle.

## Issues Encountered
None - plan executed smoothly after circular dependency fix

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
Travel UI complete with cost indicators and cooldown display. System is ready for:
- Plan 10-03: Travel validation and restrictions (if applicable)
- Phase goal verification showing complete travel cost system
- Future enhancements like per-location variable costs or additional cooldown types

User-verified working end-to-end:
- Within-region travel (5 stamina)
- Cross-region travel (10 stamina + cooldown)
- Insufficient stamina blocking
- Cooldown countdown timer accuracy
- Group travel validation

## Self-Check: PASSED

All claimed files verified to exist:
- src/module_bindings/travel_cooldown_table.ts ✓
- src/module_bindings/travel_cooldown_type.ts ✓
- spacetimedb/src/data/combat_constants.ts ✓
- src/components/TravelPanel.vue ✓
- src/App.vue ✓

All claimed commits verified to exist:
- 67f51c4 (Task 1) ✓
- 876bc2a (Task 2) ✓
- 3a449d3 (Deviation fix) ✓

---
*Phase: 10-travel-movement-costs*
*Completed: 2026-02-14*
