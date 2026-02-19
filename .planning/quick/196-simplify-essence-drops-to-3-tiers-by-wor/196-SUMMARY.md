---
phase: quick-196
plan: 01
subsystem: combat
tags: [essence, reagent, drop-rates, crafting-parity, combat]

# Dependency graph
requires:
  - phase: quick-173
    provides: modifier reagent combat drop block (modifierSeed)
  - phase: quick-161
    provides: essence combat drop block (essenceSeed)
provides:
  - Essence drop rate tuned to 6% (was 12%)
  - Reagent drop rate tuned to 10% (was 15%)
affects: [crafting-system, loot-balance, player-progression]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - spacetimedb/src/reducers/combat.ts

key-decisions:
  - "Essence drop rate reduced from 12% to 6% — expected kills 8.3 → 16.7, matching T1 natural affixed gear parity (~20 kills)"
  - "Reagent drop rate reduced from 15% to 10% — essence remains the bottleneck as intended"
  - "Essence IV confirmed absent from codebase — 3-tier system (lesser/essence/greater) already in place"

patterns-established: []

requirements-completed: [196-essence-3tier-parity]

# Metrics
duration: 3min
completed: 2026-02-18
---

# Quick Task 196: Simplify Essence Drops to 3 Tiers Summary

**Essence drop rate halved to 6% and reagent drop lowered to 10%, aligning expected crafting effort (~16-18 kills) with natural affixed gear drops (~20 kills at T1 L1)**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-18T00:00:00Z
- **Completed:** 2026-02-18T00:03:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Essence drop chance reduced from 12% to 6% per kill per participant
- Modifier reagent drop chance reduced from 15% to 10% per kill per participant
- Confirmed Essence IV is absent from codebase (3-tier system already correct)
- Module published successfully with updated drop rates live

## Task Commits

Each task was committed atomically:

1. **Task 1: Lower essence and reagent drop chances for T1 crafting parity** - `73a573d` (feat)
2. **Task 2: Publish module** - (spacetime publish, no code commit)

## Files Created/Modified
- `spacetimedb/src/reducers/combat.ts` - Changed essenceSeed < 12n → < 6n and modifierSeed < 15n → < 10n with updated comments

## Decisions Made
- Essence is the bottleneck by design: 6% means ~16.7 expected kills for essence vs 10 kills for reagent. Players gather essence last, keeping crafting slightly but not dramatically faster than natural drops.
- Reagent at 10% is comfortably under the essence bottleneck — once you have the essence, reagent is easy to collect.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Drop rates are live. Crafting material acquisition now requires ~16-18 kills, vs ~20 kills for a naturally-dropped affixed gear piece at T1 L1.
- No further action needed; tuning can be revisited if playtesting shows crafting still feels too fast or too slow.

---
*Phase: quick-196*
*Completed: 2026-02-18*

## Self-Check: PASSED

- combat.ts modified: confirmed (git show 73a573d shows 1 file changed, 4 insertions, 4 deletions in spacetimedb/src/reducers/combat.ts)
- Commit 73a573d: confirmed present in git log
- 196-SUMMARY.md: created at .planning/quick/196-simplify-essence-drops-to-3-tiers-by-wor/196-SUMMARY.md
- essenceSeed < 6n: confirmed in combat.ts
- modifierSeed < 10n: confirmed in combat.ts
- Essence IV absent: confirmed (grep found no matches)
- Module published: spacetime publish exited 0 with "Updated database with name: uwr"
