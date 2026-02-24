---
phase: quick-305
plan: 01
subsystem: combat
tags: [enemy-abilities, boss-abilities, seeding, data-integrity]

# Dependency graph
requires:
  - phase: quick-170
    provides: Night enemy ability definitions in ENEMY_ABILITIES and ENEMY_TEMPLATE_ABILITIES
provides:
  - 12 named bosses wired into ENEMY_TEMPLATE_ABILITIES with 2-3 abilities each
  - Cleaned up abilityProfile strings on 21 enemy types without real abilities
affects: [combat, boss-encounters, enemy-display]

# Tech tracking
tech-stack:
  added: []
  patterns: [boss-ability-mapping-via-ENEMY_TEMPLATE_ABILITIES]

key-files:
  created: []
  modified:
    - spacetimedb/src/data/abilities/enemy_abilities.ts
    - spacetimedb/src/seeding/ensure_enemies.ts

key-decisions:
  - "All boss ability mappings use existing ability keys from ENEMY_ABILITIES -- no new abilities created"
  - "L2 bosses get 2 abilities, L4+ bosses get 2-3 abilities based on level and complexity"
  - "abilityProfile text preserved on enemies WITH real abilities; cleared to empty string on enemies without"

patterns-established:
  - "Boss ability assignments follow level-based scaling: 2 abilities for low-level, 3 for high-level"

requirements-completed: [BOSS-ABILITIES, CLEANUP-ABILITY-PROFILES]

# Metrics
duration: 7min
completed: 2026-02-24
---

# Quick 305: Wire Up All Enemy Abilities Summary

**All 12 named bosses mapped to 2-3 combat abilities via ENEMY_TEMPLATE_ABILITIES; 21 non-ability enemy types cleaned of misleading abilityProfile text**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-24T03:20:40Z
- **Completed:** 2026-02-24T03:27:51Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- All 12 named bosses (Rotfang through Emberclaw Matriarch) now have real combat abilities via ENEMY_TEMPLATE_ABILITIES
- 21 enemy types that lacked real abilities had their misleading abilityProfile flavor text cleared to empty strings
- All 20 ability keys used in boss mappings are existing keys from ENEMY_ABILITIES -- zero new definitions needed
- Local publish succeeds with clean startup

## Task Commits

Each task was committed atomically:

1. **Task 1: Add all 12 named bosses to ENEMY_TEMPLATE_ABILITIES** - `67e10ea` (feat)
2. **Task 2: Clean up abilityProfile text on enemies without real abilities** - `6813673` (fix)

## Files Created/Modified
- `spacetimedb/src/data/abilities/enemy_abilities.ts` - Added 12 boss entries to ENEMY_TEMPLATE_ABILITIES mapping section
- `spacetimedb/src/seeding/ensure_enemies.ts` - Cleared abilityProfile to '' on addRoleTemplate calls for 21 enemy types (54 role template entries total)

## Decisions Made
- Used existing ability keys exclusively -- no new ability definitions created, keeping the ability catalog stable
- L2 bosses (Rotfang, Mirewalker Thane, Thornmother, Ashwright) assigned 2 abilities each
- L4-L5 bosses (Crag Tyrant, Hexweaver Nyx, Scorchfang, Warden of Ash, Smolderveil Banshee) assigned 2-3 abilities
- L7-L9 bosses (Pyrelord Kazrak, Sootveil Archon, Emberclaw Matriarch) assigned 3 abilities each
- Ability selections match boss theme: beast bosses get physical DoTs, caster bosses get magic DoTs/debuffs, tanks get debuffs/AoE

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Bosses are now threatening combatants with real abilities instead of auto-attack only
- Future work could add new ability types specific to bosses for even more variety
- named_enemy_defs.ts abilityProfile text was correctly left intact as it now accurately describes the wired-up boss abilities

## Self-Check: PASSED

- [x] enemy_abilities.ts exists
- [x] ensure_enemies.ts exists
- [x] 305-SUMMARY.md exists
- [x] Commit 67e10ea found
- [x] Commit 6813673 found

---
*Phase: quick-305*
*Completed: 2026-02-24*
