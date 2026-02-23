---
phase: quick-293
plan: 01
subsystem: ui
tags: [vue, setup, temporal-dead-zone, panel-manager]

requires:
  - phase: quick-291
    provides: usePanelManager composable refactoring
provides:
  - Fixed App.vue setup order so usePanelManager is declared before eager watch access
affects: [App.vue, panels]

tech-stack:
  added: []
  patterns: [declaration-before-eager-access]

key-files:
  created: []
  modified: [src/App.vue]

key-decisions:
  - "Inserted usePanelManager block after useTrade() and before the trade watches, rather than plan-suggested post-savePanelLayoutReducer position which was still after the eager access"

patterns-established:
  - "Panel manager init must precede any watch that eagerly evaluates panel state in its getter"

requirements-completed: [FIX-PANELS-TDZ]

duration: 4min
completed: 2026-02-23
---

# Quick 293: Fix Panels Before Initialization Reference Summary

**Relocated usePanelManager destructuring before eager `panels.trade?.open` watch getter to fix TDZ ReferenceError on app load**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-23T20:47:00Z
- **Completed:** 2026-02-23T20:51:54Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Fixed ReferenceError: Cannot access 'panels' before initialization in App.vue
- Moved usePanelManager + savePanelLayoutReducer + provide + togglePanel wrapper from ~line 1928 to ~line 1703 (after useTrade, before trade watches)
- Vite build passes successfully

## Task Commits

Each task was committed atomically:

1. **Task 1: Relocate usePanelManager initialization above first eager panels access** - `58ec436` (fix)

## Files Created/Modified
- `src/App.vue` - Reordered usePanelManager block to appear before the watch that eagerly evaluates `() => panels.trade?.open`

## Decisions Made
- The plan suggested inserting after `savePanelLayoutReducer` at ~line 1865, but that was still AFTER the eager watch at line 1716. Instead, moved both `savePanelLayoutReducer` and the usePanelManager block together to after `useTrade()` at line 1701, which is before all watches that reference panel state. This is a deviation from the exact insertion point but achieves the plan's stated goal.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Adjusted insertion point to actually fix the TDZ**
- **Found during:** Task 1
- **Issue:** The plan's suggested insertion point (after `savePanelLayoutReducer` at ~line 1865) was still AFTER the `panels.trade?.open` watch at ~line 1716. Inserting there would not fix the TDZ error.
- **Fix:** Moved both `savePanelLayoutReducer` and the entire usePanelManager block to after `useTrade()` (line ~1701), before any watches that access panel state.
- **Files modified:** src/App.vue
- **Verification:** `npx vite build` passes, no duplicate declarations
- **Committed in:** 58ec436

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Insertion point adjustment was necessary for correctness. No scope creep.

## Issues Encountered
- Pre-existing TypeScript strict readonly type errors in App.vue prevent `vue-tsc --noEmit` from passing. These are unrelated to this change (confirmed identical errors on the pre-change commit). Vite build (which transpiles without strict checking) passes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- App should now load without ReferenceError
- All panel interactions (open, close, toggle, trade auto-open/close) work identically to before

---
*Phase: quick-293*
*Completed: 2026-02-23*
