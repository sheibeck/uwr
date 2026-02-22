---
phase: quick-275
plan: 01
subsystem: combat
tags: [bard, songs, damage, spacetimedb, typescript]

requires: []
provides:
  - "Discordant Note initial damage tick on cast (formula: 8 + level*2 + cha, 3 mana drain)"
affects: [bard, combat, songs]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - spacetimedb/src/helpers/combat.ts

key-decisions:
  - "Discordant Note cast now fires an immediate first tick using the identical formula and mana cost as the scheduled 6s tick, restoring the 'snap' feel removed in quick-271"
  - "Battle Hymn burst and totalDamage tracking refactored into the shared branch for both damage songs without changing Battle Hymn behaviour"

requirements-completed:
  - QUICK-275

duration: 5min
completed: 2026-02-21
---

# Quick Task 275: Discordant Note Missing Initial Damage Summary

**Discordant Note on-cast initial tick restored: deals 8+level*2+cha damage to all living enemies and drains 3 mana at cast time, matching each subsequent 6s tick**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-21T00:00:00Z
- **Completed:** 2026-02-21T00:05:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Restored the first-tick damage for Discordant Note that was removed in quick-271
- On cast, Discordant Note now immediately deals one full tick of damage (formula: `8 + level*2 + cha`) to all living combat enemies
- On cast, 3 mana is drained immediately, matching the cost of each regular 6s tick
- Event log shows `Discordant Note deals X damage to all enemies.` at cast time via `logPrivateAndGroup`
- The 6s tick loop schedule is untouched and continues to fire normally
- Battle Hymn burst behaviour is completely unchanged

## Task Commits

1. **Task 1: Add initial damage tick to Discordant Note cast** - `412f002` (feat)

**Plan metadata:** (see final commit)

## Files Created/Modified
- `spacetimedb/src/helpers/combat.ts` - Extended the `bard_battle_hymn` burst branch to also cover `bard_discordant_note`, adding mana drain and damage log for the Discordant Note case

## Decisions Made
- Chose to share the existing `activeEnemies` loop with Battle Hymn rather than create a separate block, reducing code duplication while keeping Battle Hymn behaviour unchanged
- Used `logPrivateAndGroup` (same as the `tick_bard_songs` reducer) so the cast message appears in both the private feed and the group feed, consistent with tick messages

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Discordant Note is fully functional: immediate snap on cast + regular 6s ticks
- No blockers

## Self-Check: PASSED
- `spacetimedb/src/helpers/combat.ts` - confirmed modified (git show 412f002 shows 16 insertions)
- `275-SUMMARY.md` - file created at `.planning/quick/275-discordant-note-missing-initial-damage-t/275-SUMMARY.md`
- Commit `412f002` - confirmed exists in git log
- `spacetime publish uwr` - succeeded with "Build finished successfully"
