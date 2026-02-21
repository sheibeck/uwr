---
phase: quick-240
plan: 01
subsystem: combat
tags: [pets, regen, spacetimedb, typescript]

# Dependency graph
requires:
  - phase: existing
    provides: regen_health scheduled reducer, activePet table with currentHp/maxHp/combatId
provides:
  - Pet HP regeneration piggybacking on existing regen_health tick
affects: [combat, pets]

# Tech tracking
tech-stack:
  added: []
  patterns: [Piggybacking pet regen onto existing character regen tick]

key-files:
  created: []
  modified:
    - spacetimedb/src/reducers/combat.ts

key-decisions:
  - "Reused halfTick gate for in-combat pet regen (every other 8s tick = 16s) to mirror character behavior"
  - "Used 3 HP/tick out of combat, 2 HP/tick in combat matching character regen rates"
  - "Checked combatId !== undefined && combatId !== null since the field is optional on ActivePet"

patterns-established:
  - "Pet regen loop placed after character regen loop, before watchdog block in regen_health"

requirements-completed: [QUICK-240]

# Metrics
duration: 5min
completed: 2026-02-21
---

# Quick Task 240: Pets Health Regen Summary

**Pet HP regeneration added to regen_health reducer: 3 HP/tick out of combat (8s), 2 HP/tick in combat (16s), dead/full-HP pets skipped**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-21T00:00:00Z
- **Completed:** 2026-02-21T00:05:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Pets with damaged HP now recover 3 HP every 8-second regen tick when out of combat
- Pets in combat recover 2 HP every 16 seconds (every other tick via halfTick gate)
- Dead pets (currentHp === 0) are skipped entirely
- Full-HP pets are skipped to avoid unnecessary database writes
- HP is clamped to maxHp to prevent overflow

## Task Commits

1. **Task 1: Add pet HP regen loop inside regen_health reducer** - `e57b3eb` (feat)

## Files Created/Modified

- `spacetimedb/src/reducers/combat.ts` - Added pet HP regen loop (22 lines) after character regen loop, before watchdog block

## Decisions Made

- Piggybacked on existing `halfTick` variable (already computed at reducer top) for in-combat rate limiting — no new infrastructure needed.
- Rates (3 out / 2 in) mirror character HP regen to keep pets consistent with the game's existing regen feel.
- Used `pet.combatId !== undefined && pet.combatId !== null` check because `combatId` is declared as `t.u64().optional()` on the `ActivePet` table.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - build succeeded cleanly on first publish.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Pet HP recovery is now automatic via the scheduled regen tick
- No client changes needed; HP updates propagate via the public active_pet subscription

---
*Phase: quick-240*
*Completed: 2026-02-21*
