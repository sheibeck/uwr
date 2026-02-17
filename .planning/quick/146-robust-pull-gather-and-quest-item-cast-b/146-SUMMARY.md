---
phase: quick-146
plan: 01
subsystem: ui
tags: [vue, cast-bar, progress-bar, watchers, orphan-safety, gather, pull, quest]

# Dependency graph
requires:
  - phase: quick-144
    provides: activeCombat watcher pattern and orphan safety net approach for cast bars
provides:
  - Pull bar orphan safety net with missing-pullState guard and duration+2s grace clear
  - Gather bar interruption detection, combat-start clear, and orphan safety net
  - Quest item cast early-clear watcher on looted detection with 5s absolute orphan timeout
affects: [ui, cast-bars, gather-system, pull-system, quest-system]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Orphan safety net: cast bars cleared when server state disappears + grace period"
    - "let isPulling pattern: allow computed-internal reassignment for safety nets"
    - "Multi-condition watcher: clears local optimistic state when server state diverges"

key-files:
  created: []
  modified:
    - src/composables/useCombat.ts
    - src/App.vue
    - src/components/LocationGrid.vue

key-decisions:
  - "Pull bar: change const isPulling to let; gate on pull row existence; add duration+2s grace"
  - "Gather bar: 1s grace for interruption detection (subscription lag tolerance)"
  - "Quest item cast: watch questItems prop with deep:true; 5s absolute orphan (cast is 3s)"

patterns-established:
  - "Pattern: orphan safety net = expected duration + 2s grace before force-clear"
  - "Pattern: server-sync watcher = watch server table + local optimistic state together"
  - "Pattern: combat-start clears all non-combat optimistic local state"

# Metrics
duration: 8min
completed: 2026-02-17
---

# Quick Task 146: Robust Pull, Gather, and Quest Item Cast Bars Summary

**Orphan safety nets applied to pull, gather, and quest-item cast bars using duration+grace-period watchers matching the quick-144 pattern**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-02-17T17:20:00Z
- **Completed:** 2026-02-17T17:28:20Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Pull bar in useCombat.ts: `const isPulling` changed to `let` so safety net can reassign; guard added for missing pullState row; duration+2s grace check force-clears bar stuck at 100%
- Gather bar in App.vue: three new watchers added — interruption detector (1s grace when server has no active gather), combat-start clear, and orphan safety net (duration+2s grace) in existing nowMicros watcher
- Quest item cast in LocationGrid.vue: `watch` imported; watcher on `questItems` prop detects item looted/removed and clears cast bar; 5s absolute orphan safety inside setInterval callback

## Task Commits

Each task was committed atomically:

1. **Task 1: Pull bar orphan safety net in useCombat.ts** - `29bc08f` (feat)
2. **Task 2: Gather bar cleanup watchers in App.vue** - `8674e2d` (feat)
3. **Task 3: Quest item cast early-clear on looted detection in LocationGrid.vue** - `addbd36` (feat)

## Files Created/Modified

- `src/composables/useCombat.ts` - Pull bar: missing-row guard, duration+2s grace orphan clear
- `src/App.vue` - Gather bar: interruption detector watcher, combat-start clear watcher, orphan safety net in nowMicros watcher
- `src/components/LocationGrid.vue` - Quest cast: watch import added, questItems looted-detection watcher, 5s absolute orphan safety in setInterval

## Decisions Made

- Pull bar orphan uses `isPulling = false` mutation inside computed (safe since it's `let` local, not reactive ref)
- Gather interruption detector uses 1s grace (not 2s) because subscription lag for gather is shorter than pull
- Quest item watcher uses `deep: true` on the questItems array prop to catch mutations to the looted field
- 5s orphan for quest cast (3s cast) gives 2s of overhead buffer — same ratio as other safety nets

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - TypeScript pre-existing errors (readonly type mismatches, CharacterRow/NpcRow import warnings) are pre-existing and unrelated to this task.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All three cast bar types now have cleanup safety nets preventing stuck indicators
- Pattern is consistent with quick-144 (activeCombat watcher + grace periods)
- Ready for continued quick tasks or next planned phase

---
*Phase: quick-146*
*Completed: 2026-02-17*
