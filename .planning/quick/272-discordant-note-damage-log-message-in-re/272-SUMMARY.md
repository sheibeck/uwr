---
phase: quick-272
plan: 01
subsystem: combat
tags: [bard, songs, combat, logging, events]

# Dependency graph
requires: []
provides:
  - Red damage log message on Discordant Note song tick showing total AoE damage
affects: [bard-songs, combat-log, group-events]

# Tech tracking
tech-stack:
  added: []
  patterns: [totalDamage accumulation with HP clamping before logPrivateAndGroup]

key-files:
  created: []
  modified:
    - spacetimedb/src/reducers/combat.ts

key-decisions:
  - "Use 'damage' kind (not 'ability') for logPrivateAndGroup so message renders red in client log"
  - "Clamp actualDmg to en.currentHp to avoid inflating total for near-dead enemies"

patterns-established:
  - "AoE damage log pattern: accumulate clamped actualDmg per enemy, then logPrivateAndGroup with 'damage' kind"

requirements-completed: [QUICK-272]

# Metrics
duration: 5min
completed: 2026-02-21
---

# Quick Task 272: Discordant Note Damage Log Message Summary

**Bard's Discordant Note AoE tick now emits a red damage log entry showing exact total damage dealt to all enemies each pulse**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-21T00:00:00Z
- **Completed:** 2026-02-21T00:05:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added `totalDamage` accumulation loop using clamped `actualDmg` (prevents inflation when enemies near death)
- Replaced `appendPrivateEvent(ctx, bard.id, bard.ownerUserId, 'ability', 'Discordant Note deals sonic damage to all enemies.')` with `logPrivateAndGroup(ctx, bard, 'damage', \`Discordant Note deals ${totalDamage} damage to all enemies.\`)`
- Message now visible to bard via private log AND all group members via group event feed

## Task Commits

Each task was committed atomically:

1. **Task 1: Accumulate total damage and log red message for Discordant Note tick** - `f9582de` (feat)

**Plan metadata:** (see final commit)

## Files Created/Modified
- `spacetimedb/src/reducers/combat.ts` - Updated `bard_discordant_note` case with totalDamage accumulation and logPrivateAndGroup call

## Decisions Made
- Used kind `'damage'` (not `'ability'`) so the message renders in the client's red damage color, matching what users expect for damage output feedback
- Clamped damage to `en.currentHp` for near-dead enemies to keep the reported total accurate (same HP arithmetic as other song effects)
- Used `logPrivateAndGroup` (identical to `melody_of_mending` and `chorus_of_vigor` patterns) rather than `appendPrivateEvent` so the message propagates to the full group feed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Pre-existing TypeScript errors in other files (helpers/combat.ts, helpers/corpse.ts, reducers/items.ts, etc.) were present before this change and are out of scope. No errors introduced by this change.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Feature is complete and ready for module publish/test
- Pattern established: when adding log messages for other damage-dealing AoE songs, follow the totalDamage+logPrivateAndGroup('damage') pattern

---
*Phase: quick-272*
*Completed: 2026-02-21*
