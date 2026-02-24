---
phase: quick-299
plan: 01
subsystem: combat
tags: [death, respawn, modal, combat-resolution]

# Dependency graph
requires:
  - phase: quick-273
    provides: autoRespawnDeadCharacter helper added to combat paths (now removed)
provides:
  - Death modal (tombstone + Respawn button) appears after character death in combat
  - respawn_character reducer is the sole respawn mechanism
affects: [combat, death-system, respawn]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - spacetimedb/src/reducers/combat.ts

key-decisions:
  - "Kept autoRespawnDeadCharacter function in helpers/character.ts for potential future admin/scheduled use, only removed calls from combat.ts"

patterns-established: []

requirements-completed: [FIX-DEATH-POPUP]

# Metrics
duration: 1min
completed: 2026-02-24
---

# Quick 299: Fix Death Popup Not Appearing After Combat Death

**Removed autoRespawnDeadCharacter calls from combat victory/defeat paths so dead characters stay at hp=0n, allowing the client-side death modal to display**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-24T00:05:24Z
- **Completed:** 2026-02-24T00:06:19Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Removed autoRespawnDeadCharacter from combat victory path (dead participants in group wins)
- Removed autoRespawnDeadCharacter from combat defeat path (all dead characters after loss)
- Removed unused autoRespawnDeadCharacter import from deps destructure
- Verified module publishes successfully to local SpacetimeDB

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove autoRespawnDeadCharacter calls from combat victory and defeat paths** - `22b1a63` (fix)

## Files Created/Modified
- `spacetimedb/src/reducers/combat.ts` - Removed 3 references to autoRespawnDeadCharacter (2 call sites + 1 import)

## Decisions Made
- Kept autoRespawnDeadCharacter function definition in helpers/character.ts per plan instructions -- may be useful for future admin/scheduled cleanup scenarios

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Death modal should now appear after combat death (hp=0n persists until manual respawn)
- The existing respawn_character reducer and client-side death modal UI are already wired up
- Test by dying in combat and verifying the tombstone overlay with Respawn button appears

## Self-Check: PASSED

- [x] `spacetimedb/src/reducers/combat.ts` exists
- [x] Commit `22b1a63` exists in git log

---
*Phase: quick-299*
*Completed: 2026-02-24*
