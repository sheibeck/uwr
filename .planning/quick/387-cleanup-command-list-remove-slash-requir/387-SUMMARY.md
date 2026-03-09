---
phase: quick-387
plan: 01
subsystem: ui, gameplay
tags: [commands, autocomplete, camp, logout, scheduled-table]

provides:
  - "Cleaned command autocomplete with player-only commands"
  - "Camp command that schedules character logout after 10 seconds"
affects: [intent-reducers, narrative-input]

key-files:
  modified:
    - src/components/NarrativeInput.vue
    - src/components/HelpOverlay.vue
    - spacetimedb/src/reducers/intent.ts

key-decisions:
  - "Admin slash commands hidden from autocomplete but still functional when typed"
  - "Camp uses existing CharacterLogoutTick scheduled table with 10s delay"

requirements-completed: [QUICK-387]

duration: 2min
completed: 2026-03-09
---

# Quick 387: Cleanup Command List and Camp Logout

**Player-only command autocomplete with 32 commands, camp triggers 10-second scheduled logout via CharacterLogoutTick**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-09T01:39:33Z
- **Completed:** 2026-03-09T01:41:31Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Replaced admin-heavy command list with 32 player-only commands in autocomplete popup
- Updated help overlay to remove slash prefix references
- Camp command now schedules character logout after 10 seconds using existing CharacterLogoutTick scheduled table

## Task Commits

1. **Task 1: Clean command popup and help overlay** - `c0f1798` (feat)
2. **Task 2: Camp command schedules logout after 10 seconds** - `833024a` (feat)

## Files Created/Modified
- `src/components/NarrativeInput.vue` - Renamed adminCommands to playerCommands, expanded to 32 player commands, removed admin slash commands
- `src/components/HelpOverlay.vue` - Removed slash prefix references from tips and communicating sections
- `spacetimedb/src/reducers/intent.ts` - Added ScheduleAt to deps, camp command inserts character_logout_tick with 10s delay, updated help text

## Decisions Made
- Admin slash commands kept functional but hidden from autocomplete (still work when typed directly)
- Reused existing CharacterLogoutTick scheduled table pattern from character switching

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

---
*Quick: 387*
*Completed: 2026-03-09*
