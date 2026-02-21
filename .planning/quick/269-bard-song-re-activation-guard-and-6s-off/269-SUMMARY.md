---
phase: quick-269
plan: 01
subsystem: api
tags: [spacetimedb, bard, ability, cooldown, guard]

requires: []
provides:
  - "Bard song re-activation guard in use_ability reducer"
  - "6-second cooldown applied when stopping an active bard song"
affects: [bard, ability-system]

tech-stack:
  added: []
  patterns:
    - "Early-return guard before executeAbilityAction for idempotent song toggling"

key-files:
  created: []
  modified:
    - spacetimedb/src/reducers/items.ts

key-decisions:
  - "Use 6-second fixed cooldown on song stop to prevent instant re-cast exploit"
  - "Guard checks activeBardSong.by_bard index before executeAbilityAction — different-song clicks fall through unchanged"
  - "songDisplayNames map kept inline in guard block for locality"

patterns-established:
  - "Song toggle pattern: check activeSong.songKey === abilityKey before firing effect"

requirements-completed: [BARD-SONG-GUARD-01]

duration: 5min
completed: 2026-02-21
---

# Phase quick-269: Bard Song Re-activation Guard Summary

**Re-activation guard blocks exploit where clicking the same active bard song re-fires burst damage; stops the song and applies a 6s cooldown instead.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-21T00:00:00Z
- **Completed:** 2026-02-21T00:05:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Inserted `BARD_SONG_KEYS` guard block in `use_ability` reducer before `executeAbilityAction`
- Same-song click now deletes the `ActiveBardSong` row, logs "You stop singing X.", and applies a 6-second `AbilityCooldown` before returning
- Different-song clicks and all non-bard abilities fall through unchanged to existing logic
- No burst damage fires on song stop
- `npx tsc --noEmit` reports zero errors in `reducers/items.ts`

## Task Commits

1. **Task 1: Insert bard song turn-off guard in use_ability reducer** - `a92b882` (feat)

## Files Created/Modified
- `spacetimedb/src/reducers/items.ts` - Bard song re-activation guard inserted at line 775 (before `executeAbilityAction`)

## Decisions Made
- 6-second cooldown chosen for song stop (prevents instant re-cast exploit without being overly punishing)
- Guard uses `activeBardSong.by_bard.filter(character.id)` index lookup — same pattern used elsewhere in the codebase
- Existing `existingCooldown` variable reused to update-or-insert cooldown row cleanly

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Bard song exploit is closed; safe to publish module to local or maincloud
- Pre-existing TypeScript errors in other files (combat.ts, corpse.ts, location.ts, etc.) are out of scope and unrelated to this change

---
*Phase: quick-269*
*Completed: 2026-02-21*
