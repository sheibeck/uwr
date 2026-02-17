---
phase: quick-105
plan: 01
subsystem: ui
tags: [vue, z-index, overlay, help-system]

# Dependency graph
requires:
  - phase: quick-104
    provides: HelpOverlay component
  - phase: quick-79
    provides: Footer z-index stacking context
provides:
  - HelpOverlay rendering correctly above footer with proper height constraints
affects: [ui-overlays, modal-systems]

# Tech tracking
tech-stack:
  added: []
  patterns: [z-index layering for overlays, calc-based height constraints]

key-files:
  created: []
  modified:
    - src/components/HelpOverlay.vue
    - src/App.vue

key-decisions:
  - "HelpOverlay z-index set to 10001 (above footer's 10000)"
  - "Dialog maxHeight uses calc(100vh - 120px) to account for footer space"
  - "DOM order: HelpOverlay positioned after footer for correct stacking"

patterns-established:
  - "Overlays must have z-index > 10000 to render above footer"
  - "Full-screen overlays should use calc-based maxHeight to prevent footer overlap"

# Metrics
duration: 1min
completed: 2026-02-16
---

# Quick Task 105: Help Window Z-Index Fix

**HelpOverlay renders above footer at z-index 10001 with constrained height using calc(100vh - 120px)**

## Performance

- **Duration:** 1 minute
- **Started:** 2026-02-17T00:41:25Z
- **Completed:** 2026-02-17T00:43:21Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Fixed HelpOverlay rendering behind footer by increasing z-index from 9000 to 10001
- Constrained dialog height to leave room for footer using calc-based maxHeight
- Corrected DOM stacking order by moving HelpOverlay after footer element

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix HelpOverlay z-index and height constraints** - `a5f7288` (fix)

## Files Created/Modified
- `src/components/HelpOverlay.vue` - Updated backdropStyle z-index to 10001, changed dialogStyle maxHeight from '80vh' to 'calc(100vh - 120px)'
- `src/App.vue` - Moved HelpOverlay component from before footer to after footer tag

## Decisions Made

**Z-index layering:** Set overlay z-index to 10001 to render above footer's 10000 (established in quick-79). This follows the pattern that all full-screen overlays must exceed the footer's stacking context.

**Height calculation:** Changed from fixed '80vh' to 'calc(100vh - 120px)' to account for footer height (~100px with padding). The calc approach is more robust than percentage-based sizing.

**DOM positioning:** Moved HelpOverlay to after footer in DOM order. Combined with z-index increase, this ensures proper stacking even if z-index values change in the future.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - straightforward fix addressing z-index conflict between HelpOverlay (9000) and footer (10000).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Help system fully functional. HelpOverlay can be used as reference pattern for future full-screen overlays requiring proper z-index stacking above footer.

---

## Self-Check: PASSED

All files exist and commit verified:
- ✓ src/components/HelpOverlay.vue
- ✓ src/App.vue
- ✓ .planning/quick/105-the-help-window-is-too-tall-and-is-going/105-SUMMARY.md
- ✓ Commit a5f7288 exists

---
*Phase: quick-105*
*Completed: 2026-02-16*
