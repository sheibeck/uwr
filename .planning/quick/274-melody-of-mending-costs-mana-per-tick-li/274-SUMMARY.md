---
phase: quick-274
plan: 01
subsystem: combat
tags: [bard, mana, songs, spacetimedb]

# Dependency graph
requires: []
provides:
  - "Melody of Mending deducts 3 mana from the bard on each 6-second tick, clamping at 0"
affects: [bard-songs, combat]

# Tech tracking
tech-stack:
  added: []
  patterns: [mana-drain-per-tick in bard song switch cases]

key-files:
  created: []
  modified:
    - spacetimedb/src/reducers/combat.ts

key-decisions:
  - "Mana clamps at 0 — song does not stop when bard runs out of mana, matching Discordant Note behavior"
  - "Used freshBardMoM variable name to avoid shadowing with freshBardDN and freshBardBH in the same switch"

patterns-established:
  - "Bard song mana drain pattern: re-fetch bard row, check mana > 0, subtract 3n clamped at 0, update"

requirements-completed: [QUICK-274]

# Metrics
duration: 5min
completed: 2026-02-21
---

# Quick Task 274: Melody of Mending Costs Mana Per Tick Summary

**Melody of Mending now drains 3 mana from the bard on each 6-second tick, matching the Discordant Note and Battle Hymn mana upkeep pattern exactly**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-21T00:00:00Z
- **Completed:** 2026-02-21T00:05:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added mana drain block to `bard_melody_of_mending` case in `tick_bard_songs`
- Bard loses 3 mana every 6-second tick while Melody of Mending is active
- Mana clamps at 0 — song continues even when bard is out of mana
- Published to local successfully with no TypeScript errors

## Task Commits

1. **Task 1: Add mana drain to Melody of Mending tick** - `d969da1` (feat)

## Files Created/Modified
- `spacetimedb/src/reducers/combat.ts` - Added 6-line mana drain block in bard_melody_of_mending case between the healing loop and logPrivateAndGroup call

## Decisions Made
- Mana clamps at 0 rather than stopping the song — matches Discordant Note behavior and prevents abrupt song termination for a sustain-focused ability

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All bard songs (Discordant Note, Melody of Mending, Battle Hymn) now have consistent 3-mana-per-tick upkeep
- Chorus of Vigor and March of Wayfarers are the only songs without mana drain — deliberate design choice (utility songs)

---
*Phase: quick-274*
*Completed: 2026-02-21*
