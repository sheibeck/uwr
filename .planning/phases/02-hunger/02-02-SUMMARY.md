---
phase: 02-hunger
plan: 02
subsystem: ui
tags: [vue, spacetimedb, hunger, inventory, composable]

# Dependency graph
requires:
  - phase: 02-hunger-01
    provides: Hunger table backend, eat_food reducer, food item templates with slot=food
provides:
  - HungerBar.vue component with progress bar, color coding, Well Fed badge
  - myHunger useTable subscription in useGameData
  - eatable property on inventory items (slot === 'food')
  - Eat button in InventoryPanel for food-slot items
  - Full eat_food reducer wiring in App.vue
affects: [combat, inventory, stats]

# Tech tracking
tech-stack:
  added: []
  patterns: [HungerBar uses inline styles from styles.ts, consistent with all other panel components]

key-files:
  created:
    - src/components/HungerBar.vue
  modified:
    - src/composables/useGameData.ts
    - src/composables/useInventory.ts
    - src/components/InventoryPanel.vue
    - src/App.vue
    - src/ui/styles.ts

key-decisions:
  - "HungerBar rendered inside wrapper div below StatsPanel when activePanel === 'stats'"
  - "eatable computed as slot.toLowerCase() === 'food' to distinguish from usable (consumable)"
  - "Eat button in InventoryPanel uses eat-food emit, wired to eatFoodReducer in App.vue"
  - "activeHunger computed finds hunger row by characterId string comparison"

patterns-established:
  - "New composable table subscriptions: add to useGameData.ts then destructure in App.vue"
  - "New inventory item properties: add to InventoryItem type in useInventory.ts, pass through to InventoryPanel prop type"

# Metrics
duration: ~15min
completed: 2026-02-12
---

# Phase 2 Plan 2: Hunger Frontend Summary

**HungerBar component with progress bar and Well Fed badge, Eat button on food-slot items, full eat_food reducer wiring from InventoryPanel through App.vue to SpacetimeDB**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-02-12T03:46:59Z
- **Completed:** 2026-02-12T03:55:00Z (paused at checkpoint)
- **Tasks:** 2 of 3 complete (Task 3 is human verification checkpoint)
- **Files modified:** 5

## Accomplishments
- HungerBar.vue displays hunger level as a colored progress bar (green/yellow/red), with Well Fed badge showing buff label and time remaining
- useGameData.ts subscribes to myHunger table so all hunger data flows to client
- InventoryPanel.vue shows an Eat button on items with slot=food only (not consumables)
- App.vue wires eat-food event to eatFoodReducer (eat_food reducer on backend)

## Task Commits

Each task was committed atomically:

1. **Task 1: HungerBar component and data subscription** - `fe20402` (feat)
2. **Task 2: App.vue wiring — HungerBar rendering and Eat button** - `ec1d3da` (feat)

**Plan metadata:** (pending — awaiting human verification)

## Files Created/Modified
- `src/components/HungerBar.vue` - Hunger bar UI with progress bar and Well Fed badge
- `src/composables/useGameData.ts` - Added myHunger useTable subscription
- `src/composables/useInventory.ts` - Added eatable property to InventoryItem type and computed
- `src/components/InventoryPanel.vue` - Added Eat button, eatable prop, eat-food emit
- `src/App.vue` - Import HungerBar, add activeHunger computed, eatFoodReducer, eatFood handler, render HungerBar in stats panel, wire @eat-food
- `src/ui/styles.ts` - Added hungerBar, hungerFill, wellFedBadge styles

## Decisions Made
- HungerBar rendered inside wrapper div in stats panel (not a separate panel toggle) — simpler UX
- eatable = slot === 'food' (lowercase compare) — distinguishes Well Fed foods from consumables
- No optimistic UI — let SpacetimeDB subscription drive state after eat_food reducer call
- Hunger color: green >50, yellow 20-50, red <=20 (consistent with typical game conventions)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Task 3 (human-verify checkpoint) remains — user needs to verify end-to-end hunger flow in browser
- After verification: Phase 2 complete, Phase 3 (Renown Foundation) can begin

---
*Phase: 02-hunger*
*Completed: 2026-02-12*
