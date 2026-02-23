---
phase: quick-289
plan: 01
subsystem: backend
tags: [refactor, combat, spacetimedb, typescript]

requires:
  - phase: none
    provides: existing combat.ts monolith with all combat helpers

provides:
  - Four combat helper files with clear, non-overlapping responsibilities
  - combat_enemies.ts for enemy stat computation and armor mitigation
  - combat_perks.ts for perk proc system and active perk abilities
  - combat_rewards.ts expanded with awardXp and applyDeathXpPenalty
  - combat.ts reduced to core ability execution and effects

affects: [combat, helpers, reducers]

tech-stack:
  added: []
  patterns:
    - "Combat helpers split by domain: enemies, perks, rewards, core execution"

key-files:
  created:
    - spacetimedb/src/helpers/combat_enemies.ts
    - spacetimedb/src/helpers/combat_perks.ts
  modified:
    - spacetimedb/src/helpers/combat.ts
    - spacetimedb/src/helpers/combat_rewards.ts
    - spacetimedb/src/index.ts
    - spacetimedb/src/reducers/combat.ts

key-decisions:
  - "activeCombatIdForCharacter kept as private copy in both combat.ts and combat_perks.ts since both need it and events.ts already has the canonical export"
  - "Used any types for computeEnemyStats parameters in combat_enemies.ts to match existing pattern and avoid RowBuilder type resolution issues"

patterns-established:
  - "Combat domain split: combat_enemies.ts (stats/armor), combat_perks.ts (procs/active perks/flee), combat_rewards.ts (XP/events/rewards), combat.ts (ability execution/effects)"

requirements-completed: []

duration: 9min
completed: 2026-02-23
---

# Quick Task 289: Reorganize Combat Helper Files Summary

**Split 2912-line combat.ts monolith into 4 cohesive helper files with zero behavior changes and successful module publish**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-23T16:20:47Z
- **Completed:** 2026-02-23T16:29:29Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Reduced combat.ts from 2912 to 2442 lines by extracting 3 function groups
- Created combat_enemies.ts (86 lines): ENEMY_ROLE_CONFIG, getEnemyRole, scaleByPercent, applyArmorMitigation, computeEnemyStats
- Created combat_perks.ts (256 lines): applyPerkProcs, executePerkAbility, calculateFleeChance plus private helpers
- Expanded combat_rewards.ts to 405 lines with awardXp, applyDeathXpPenalty, computeRacialAtLevelFromRow
- All consumer imports updated (index.ts, reducers/combat.ts) and module publishes successfully

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract combat_enemies.ts and combat_perks.ts from combat.ts** - `bb3f7c2` (refactor)
2. **Task 2: Move XP functions into combat_rewards.ts and update all consumer imports** - `cb34af6` (refactor)

## Files Created/Modified
- `spacetimedb/src/helpers/combat_enemies.ts` - Enemy stat computation, role config, armor mitigation (86 lines)
- `spacetimedb/src/helpers/combat_perks.ts` - Perk proc system, active perk abilities, flee chance (256 lines)
- `spacetimedb/src/helpers/combat.ts` - Core ability execution, effects, attack outcomes (2442 lines, down from 2912)
- `spacetimedb/src/helpers/combat_rewards.ts` - Post-combat rewards, XP, death penalties, event contributions (405 lines, up from 246)
- `spacetimedb/src/index.ts` - Updated imports to source symbols from their new files
- `spacetimedb/src/reducers/combat.ts` - Updated applyPerkProcs import to combat_perks

## Decisions Made
- Kept activeCombatIdForCharacter as a private copy in combat_perks.ts rather than importing from events.ts, matching the existing private-copy pattern in combat.ts (used at lines 422, 1695)
- Used `any` types for computeEnemyStats parameters instead of `typeof EnemyTemplate.rowType` etc., because the RowBuilder type system does not resolve property access at type-check time

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] activeCombatIdForCharacter used in multiple locations**
- **Found during:** Task 1 (combat_perks.ts creation)
- **Issue:** Plan stated activeCombatIdForCharacter is "used ONLY by executePerkAbility" but it is also used at combat.ts lines 422 and 1695
- **Fix:** Kept private copy in combat.ts for those call sites, created separate private copy in combat_perks.ts for executePerkAbility
- **Files modified:** combat_perks.ts, combat.ts
- **Verification:** Both files compile, module publishes
- **Committed in:** bb3f7c2 (Task 1 commit)

**2. [Rule 1 - Bug] RowBuilder type resolution for computeEnemyStats**
- **Found during:** Task 1 (combat_enemies.ts creation)
- **Issue:** Using `typeof EnemyTemplate.rowType` causes TS2339 errors because RowBuilder does not expose .role/.level/.maxHp properties at type level
- **Fix:** Changed parameter types to `any` matching the existing runtime-typed pattern used throughout the codebase
- **Files modified:** combat_enemies.ts
- **Verification:** Zero type errors in combat_enemies.ts
- **Committed in:** bb3f7c2 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 bug fixes)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Combat helper files now have clear, navigable responsibilities
- No behavior changes -- safe to continue feature development on any combat-related work
- combat.ts still at 2442 lines; further splits possible if needed in future

## Self-Check: PASSED

- All 6 files exist on disk
- Commit bb3f7c2 found (Task 1)
- Commit cb34af6 found (Task 2)
- Module publishes successfully to local SpacetimeDB

---
*Phase: quick-289*
*Completed: 2026-02-23*
