---
phase: 18-world-events-system-expansion
plan: 03
subsystem: ui
tags: [vue, world-events, panel, banner, action-bar, subscription, spacetimedb]

# Dependency graph
requires:
  - phase: 18-02
    provides: "WorldEvent, EventContribution, EventObjective tables + fire/resolve reducers, client bindings for all 7 world event tables"
provides:
  - WorldEventPanel.vue with Active tab (event name, region, progress bar, contribution tier, rewards) and History tab (outcome, consequence, timestamp)
  - useGameData subscriptions for worldEvent, eventContribution, eventSpawnEnemy, eventSpawnItem, eventObjective with worldEventRows key
  - Banner overlay notification on new world events, auto-dismisses after 5 seconds
  - Events action bar button with yellow badge when active events exist
  - hasActiveEvents computed, activeBanner watcher in App.vue
  - styles.worldEventBanner style object
affects:
  - Any future plan adding admin controls or more event types to the client

# Tech tracking
tech-stack:
  added: []
  patterns:
    - worldEventRows naming — avoids collision with existing worldEvents (eventWorld log table)
    - banner overlay pattern with auto-dismiss timer using setTimeout + clearTimeout
    - panels.worldEvents.open pattern consistent with all other floating panels
    - hasActiveEvents computed to drive action bar badge without prop drilling state

key-files:
  created:
    - src/components/WorldEventPanel.vue
  modified:
    - src/composables/useGameData.ts
    - src/ui/styles.ts
    - src/App.vue
    - src/components/ActionBar.vue

key-decisions:
  - "worldEventRows used as key (not worldEvents) to avoid collision with existing worldEvents binding that points to eventWorld log table"
  - "Banner overlay auto-dismisses after 5 seconds via setTimeout, bannerTimer ref prevents stacking"
  - "hasActiveEvents computed on worldEventRows.value.some() — drives action bar badge without prop drilling"

patterns-established:
  - "worldEventRows naming: use worldEventRows for the WorldEvent game table, worldEvents remains the eventWorld log table"
  - "Banner pattern: watch(rows, (new, old) => detect new IDs, set banner, setTimeout 5s clear)"

# Metrics
duration: ~5min
completed: 2026-02-17
---

# Phase 18 Plan 03: World Events Client UI Summary

**WorldEventPanel Vue component with Active/History tabs, contribution tier display (Bronze/Silver/Gold), banner overlay on event start, and Events action bar button with active-event badge**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-17T19:11:46Z
- **Completed:** 2026-02-17T19:16:46Z (Tasks 1-2 complete; Task 3 is human-verify checkpoint)
- **Tasks:** 2 automated (Task 3 awaiting human verification)
- **Files modified:** 5

## Accomplishments
- Created `WorldEventPanel.vue` (300 lines) with Active tab showing event name, region lookup, kill_count objective progress bar, threshold_race counter display, time remaining, contribution tier (Bronze/Silver/Gold with color coding), and rewards preview; History tab showing outcome badge (green Success / red Failed), consequence text, resolved timestamp sorted by most recent
- Added useTable subscriptions in `useGameData.ts` for all 5 new world event tables using `worldEventRows` key to avoid naming collision with existing `worldEvents` (eventWorld log table)
- Wired `WorldEventPanel` into `App.vue`: import, destructure from useGameData, `worldEvents` in usePanelManager defaults, panel div with resize handles, `hasActiveEvents` computed, `activeBanner` ref + watcher auto-dismissing after 5 seconds, banner overlay div
- Updated `ActionBar.vue`: 'worldEvents' added to PanelKey union, `hasActiveEvents` prop, Events button with yellow (#facc15) badge dot indicator

## Task Commits

Each task was committed atomically:

1. **Task 1: Add subscriptions and create WorldEventPanel with Active + History tabs** - `0248bce` (feat)
2. **Task 2: Wire WorldEventPanel into App.vue with action bar badge and banner overlay** - `41e70df` (feat)
3. **Task 3: Human verification** — awaiting checkpoint

## Files Created/Modified
- `src/components/WorldEventPanel.vue` - New: WorldEventPanel with Active/History tabs, tier computation, progress bars, rewards preview
- `src/composables/useGameData.ts` - Added worldEventRows, eventContributions, eventSpawnEnemies, eventSpawnItems, eventObjectives subscriptions
- `src/ui/styles.ts` - Added worldEventBanner style for fixed-position banner overlay
- `src/App.vue` - WorldEventPanel import, useGameData destructure, usePanelManager worldEvents, hasActiveEvents computed, activeBanner watcher, panel div, banner overlay div, ActionBar hasActiveEvents prop
- `src/components/ActionBar.vue` - worldEvents added to PanelKey union, hasActiveEvents prop, Events button with badge

## Decisions Made
- `worldEventRows` used as subscription key to avoid collision with existing `worldEvents` variable pointing to `eventWorld` (the log table) — both the log table and the new WorldEvent game table are different things
- Banner auto-dismiss uses `bannerTimer` ref for clearing: if two events fire back-to-back within 5 seconds, only the latest banner timer runs (correct behavior)
- `hasActiveEvents` is a simple `some()` computed — reactive to worldEventRows changes, drives badge without extra state

## Deviations from Plan

None - plan executed exactly as written.

---

**Total deviations:** 0
**Impact on plan:** No deviations.

## Issues Encountered
- Pre-existing TypeScript errors across many composables (from module_bindings Row type imports) — present before this plan, no new errors introduced by our changes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- WorldEventPanel fully wired to all world event tables
- Banner fires on new active events
- Action bar badge indicates active events
- Ready for Task 3 human verification: open Events panel, fire test event, verify UI

## Self-Check: PASSED

- src/components/WorldEventPanel.vue — FOUND (300 lines)
- src/composables/useGameData.ts worldEventRows — FOUND
- src/ui/styles.ts worldEventBanner — FOUND
- src/App.vue WorldEventPanel import — FOUND
- src/App.vue panels.worldEvents.open — FOUND
- src/App.vue hasActiveEvents computed — FOUND
- src/App.vue activeBanner watcher — FOUND
- src/components/ActionBar.vue worldEvents PanelKey — FOUND
- src/components/ActionBar.vue hasActiveEvents prop — FOUND
- commit 0248bce (Task 1) — FOUND
- commit 41e70df (Task 2) — FOUND

---
*Phase: 18-world-events-system-expansion*
*Completed: 2026-02-17 (Task 3 pending human verification)*
