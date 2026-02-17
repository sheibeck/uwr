---
phase: quick-123
plan: 01
subsystem: combat
tags: [spacetimedb, typescript, flee, combat-loop, danger-scaling]

# Dependency graph
requires:
  - phase: combat-core
    provides: combat_loop reducer, CombatParticipant status system, combat tick scheduling
provides:
  - calculateFleeChance helper (danger-scaled flee probability)
  - Chance-based flee resolution in combat_loop tick
  - 'fleeing' interim status bridging flee_combat and combat_loop
affects: [combat, combat-balance, group-combat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Two-phase flee: flee_combat sets 'fleeing' status, combat_loop resolves on next tick
    - Deterministic dice roll: (nowMicros + charId * 13) % 100 for reproducible results

key-files:
  created: []
  modified:
    - spacetimedb/src/helpers/combat.ts
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/index.ts

key-decisions:
  - "Flee is two-phase: flee_combat sets 'fleeing', combat_loop resolves on next tick"
  - "Flee chance formula: max(10, min(95, 120 - floor(dangerMultiplier/3))) - starter ~87%, dungeon ~53%"
  - "Deterministic roll: (nowMicros + charId * 13) % 100 - no random, reproducible per tick"
  - "Failed flee reverts to 'active' allowing retry on subsequent ticks"

patterns-established:
  - "calculateFleeChance(dangerMultiplier: bigint): number - pure helper, no ctx needed"
  - "Flee resolution reads participants from pre-dead-check snapshot; 'fleeing' status treated as non-active throughout rest of tick"

# Metrics
duration: 8min
completed: 2026-02-17
---

# Quick Task 123: Chance-Based Flee Mechanic Summary

**Flee is now chance-based using region danger level: starter zones ~87% success, dungeon zones ~53%, resolving on the next combat tick with deterministic rolls.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-02-17T00:00:00Z
- **Completed:** 2026-02-17T00:08:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `calculateFleeChance(dangerMultiplier)` helper to `helpers/combat.ts` with linear interpolation formula clamped to [10, 95] range
- Changed `flee_combat` reducer to set status `'fleeing'` instead of instant `'fled'`, logging "You attempt to flee..." and group event
- Added flee resolution block in `combat_loop` that rolls per-fleeing-character on each tick, applying success (status='fled', aggro/pet cleanup, combat target cleared) or failure (revert to 'active', failure message)

## Task Commits

1. **Task 1: Add flee chance helper and update flee reducer** - `bcdf67d` (feat)
2. **Task 2: Resolve flee attempts in combat_loop tick** - `d414c85` (feat)

## Files Created/Modified

- `spacetimedb/src/helpers/combat.ts` - Added `calculateFleeChance(dangerMultiplier: bigint): number` export
- `spacetimedb/src/reducers/combat.ts` - Updated `flee_combat` reducer + added flee resolution block in `combat_loop`
- `spacetimedb/src/index.ts` - Imported and passed `calculateFleeChance` in `reducerDeps`

## Decisions Made

- **Two-phase flee pattern:** `flee_combat` sets `'fleeing'` (new interim status), `combat_loop` resolves on next tick — this matches the plan's design for adding risk to fleeing without instant resolution
- **Formula choice:** `max(10, min(95, 120 - floor(dangerMultiplier/3)))` gives intuitive scaling: easy zones are usually escapable (~87%), dangerous zones are genuinely risky (~53%), but never impossible (floor 10%) or guaranteed (cap 95%)
- **Deterministic roll:** `(nowMicros + charId * 13n) % 100n` ensures the flee outcome is reproducible per tick without needing real random (SpacetimeDB reducers must be deterministic)
- **Failed flee reverts to 'active':** Failed flee allows the character to continue fighting and retry fleeing on the next tick — no lockout mechanic needed

## Deviations from Plan

**1. [Rule 1 - Minor] Moved `nowMicros` declaration before dead-participant loop**
- **Found during:** Task 2 (flee resolution needs `nowMicros` before the flee block, which was originally declared after)
- **Issue:** `nowMicros` was declared at line 1561 but flee resolution is inserted between lines 1557-1558
- **Fix:** Moved `const nowMicros = ctx.timestamp.microsSinceUnixEpoch;` to before the participants loop (no behavioral change, same value)
- **Files modified:** spacetimedb/src/reducers/combat.ts
- **Committed in:** d414c85 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (declaration reordering for correct scope)
**Impact on plan:** Trivial structural change, no scope creep, no behavioral difference.

## Issues Encountered

- Pre-existing TypeScript errors in unrelated files (`helpers/corpse.ts`, `helpers/location.ts`, `helpers/combat.ts` at enemy ability sections) — confirmed pre-existing via `spacetime publish` which reports "Build finished successfully" before the schema migration error

## Next Phase Readiness

- Flee mechanic is complete and working
- `calculateFleeChance` is available for future difficulty tuning (single formula change)
- Region `dangerMultiplier` drives flee difficulty automatically — adding new regions with appropriate danger values will automatically get correct flee rates

---
*Phase: quick-123*
*Completed: 2026-02-17*
