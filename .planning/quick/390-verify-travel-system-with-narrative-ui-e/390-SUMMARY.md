---
phase: quick-390
plan: 01
subsystem: travel
tags: [travel, refactor, cleanup]
dependency_graph:
  requires: []
  provides: [shared-travel-helper]
  affects: [movement-reducer, intent-reducer, travel-ui]
tech_stack:
  patterns: [shared-helper-extraction, deps-injection]
key_files:
  created:
    - spacetimedb/src/helpers/travel.ts
  modified:
    - spacetimedb/src/reducers/movement.ts
    - spacetimedb/src/reducers/intent.ts
    - src/App.vue
    - src/composables/usePanelManager.ts
    - src/components/ActionBar.vue
  deleted:
    - src/components/TravelPanel.vue
decisions:
  - Shared performTravel helper takes deps object for all required functions
  - TravelPanel.vue deleted entirely rather than kept as dead code
  - Travel button in ActionBar now toggles 'travel' panel (LocationGrid) instead of removed 'travelPanel'
metrics:
  duration: 17min
  completed: "2026-03-09T03:42:00Z"
---

# Quick Task 390: Verify Travel System with Narrative UI

Shared performTravel helper extracts full movement logic (stamina, cooldowns, group travel, spawns, world-gen) into reusable function called by both move_character reducer and narrative intent handler.

## Task 1: Extract shared performTravel helper and wire into both reducers

| Commit | Files | Description |
|--------|-------|-------------|
| 22f9d46 | spacetimedb/src/helpers/travel.ts, spacetimedb/src/reducers/movement.ts, spacetimedb/src/reducers/intent.ts | Created performTravel helper, replaced inline travel code in both reducers |

Created `spacetimedb/src/helpers/travel.ts` containing the full movement logic previously duplicated between `move_character` reducer and two inline travel blocks in the intent handler. The helper handles:
- Location validation, combat/gathering checks, connection validation
- Cross-region detection and stamina cost calculation
- Group travel (leader pulls followers)
- ALL-OR-NOTHING stamina validation with racial modifiers and ability discounts
- Cross-region cooldown checks with narrative messages for blocked travel
- Stamina deduction and cooldown application (with perk-based reduction)
- Movement execution: location update, events, spawn triggers, passive search, auto-look
- World event auto-registration at destination
- Auto-join group combat at destination
- Uncharted location world generation triggers

Both the `move_character` reducer and the intent handler's `go`/`travel`/implicit-travel paths now call `performTravel`.

## Task 2: Remove legacy cross-region popup from TravelPanel and clean up

| Commit | Files | Description |
|--------|-------|-------------|
| a55fe47 | src/components/TravelPanel.vue (deleted), src/App.vue, src/composables/usePanelManager.ts, src/components/ActionBar.vue | Removed TravelPanel and all references |

- Deleted `TravelPanel.vue` entirely (was a legacy duplicate of LocationGrid travel UI with cross-region confirmation popup)
- Removed `travelPanel` FloatingPanel block from App.vue
- Removed `travelPanel` from usePanelManager panel IDs
- Updated ActionBar Travel button to toggle `travel` panel (LocationGrid) instead of removed `travelPanel`
- Remapped T keyboard shortcut to `travel` panel

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript type errors in travel.ts**
- **Found during:** Task 1
- **Issue:** TS couldn't infer bigint types through ternary expressions and subtraction operations involving `any`-typed values
- **Fix:** Added explicit `BigInt()` wrapping and type annotations where needed
- **Files modified:** spacetimedb/src/helpers/travel.ts
- **Commit:** 22f9d46

## Verification

1. Server compiles without errors (travel.ts, movement.ts, intent.ts all clean)
2. Client compiles without new errors (all pre-existing TS6133 unused-var warnings only)
3. No inline `ctx.db.character.id.update({ ...character, locationId:` remains in intent.ts travel blocks
4. No `pendingCrossRegionMove` or `overlayStyle` in any Vue file
5. No `travelPanel` references remain in src/

## Self-Check: PASSED
