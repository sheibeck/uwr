---
phase: quick-286
plan: 01
subsystem: ui
tags: [vue, group-panel, location-awareness, targeting]

requires:
  - phase: 10
    provides: "Travel & location system with locationId on Character"
provides:
  - "Location-aware group member rendering with gray-out for remote members"
  - "Click-target prevention for remote group members"
  - "Context menu Target/Trade disabled for remote members"
affects: [group-panel, combat-targeting]

tech-stack:
  added: []
  patterns:
    - "isRemote(member) helper for location comparison in GroupPanel"

key-files:
  created: []
  modified:
    - src/components/GroupPanel.vue
    - src/App.vue

key-decisions:
  - "Used inline opacity/grayscale style rather than CSS class for consistency with existing style object pattern"
  - "Send Message remains enabled for remote members since whisper is location-independent"
  - "No server-side changes needed -- combat.ts already validates location match on ability use"

patterns-established:
  - "Location-aware UI: pass locations and myLocationId props for cross-location awareness"

requirements-completed: [QUICK-286]

duration: 4min
completed: 2026-02-23
---

# Quick 286: Gray Out Remote Group Members Summary

**Group members in different locations render at 45% opacity with grayscale, show their location name, and cannot be click-targeted or targeted/traded via context menu**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-23T13:38:22Z
- **Completed:** 2026-02-23T13:43:17Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Remote group members appear grayed out (opacity 0.45, grayscale 0.7) with default cursor
- Location name displayed below remote member names in subtle text
- Click on remote member does not emit target event
- Context menu Target and Trade actions disabled for remote members
- Send Message remains enabled for remote members (whisper is location-independent)

## Task Commits

Each task was committed atomically:

1. **Task 1: Pass locations to GroupPanel and implement location-aware rendering** - `f233ae6` (feat)

## Files Created/Modified
- `src/components/GroupPanel.vue` - Added locations/myLocationId props, isRemote/locationName helpers, gray-out styling, location label, click prevention, context menu disabling
- `src/App.vue` - Added :locations and :my-location-id props to GroupPanel component instance

## Decisions Made
- Used inline style objects (opacity, grayscale, cursor) matching the existing pattern rather than introducing CSS classes
- Send Message stays enabled for remote members since whisper/messaging is location-independent
- No server-side changes required -- combat.ts already rejects abilities when "Target is not at your location"

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Group panel now supports location-aware rendering
- Server-side location validation already exists in combat.ts

## Self-Check: PASSED

- FOUND: src/components/GroupPanel.vue
- FOUND: src/App.vue
- FOUND: .planning/quick/286-group-members-gray-out-when-in-different/286-SUMMARY.md
- FOUND: f233ae6 (Task 1 commit)

---
*Phase: quick-286*
*Completed: 2026-02-23*
