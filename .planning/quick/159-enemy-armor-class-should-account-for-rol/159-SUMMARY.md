---
phase: 159-enemy-ac-role-level
plan: 01
subsystem: combat
tags: [spacetimedb, typescript, enemy-ai, combat-balance, armor-class]

# Dependency graph
requires:
  - phase: 3.1.2-combat-balance-for-enemies
    provides: ENEMY_ROLE_CONFIG pattern with role-based stat scaling
provides:
  - Role-differentiated enemy AC via baseArmor + armorPerLevel per role in ENEMY_ROLE_CONFIG
  - computeEnemyStats computing AC from role config instead of flat template value
  - All 29 enemy templates with armorClass: 0n (role config is sole AC source)
affects: [combat-balance, enemy-design, phase-17-world-bosses]

# Tech tracking
tech-stack:
  added: []
  patterns: [role-based AC scaling mirrors existing HP/damage role-config pattern]

key-files:
  created: []
  modified:
    - spacetimedb/src/helpers/combat.ts
    - spacetimedb/src/seeding/ensure_enemies.ts

key-decisions:
  - "baseArmor + armorPerLevel * level formula: tank=14+4L, damage=6+3L, support=5+2L, healer=3+2L"
  - "template.armorClass set to 0n (not removed) — field preserved for potential per-enemy AC bonus later"
  - "AC gap between tank and healer grows with level: 13 at L1 (18 vs 5), 21 at L5 (34 vs 13)"

patterns-established:
  - "Role-config pattern: all enemy combat stats (HP, damage, AC) driven by ENEMY_ROLE_CONFIG rather than per-template values"

# Metrics
duration: 2min
completed: 2026-02-18
---

# Quick Task 159: Enemy Armor Class Role/Level Scaling Summary

**Enemy AC now fully role-driven via ENEMY_ROLE_CONFIG baseArmor/armorPerLevel: tanks are armored walls (L1=18, L5=34), healers are squishy (L1=5, L5=13), level widens the gap**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-18T03:01:20Z
- **Completed:** 2026-02-18T03:03:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `baseArmor` and `armorPerLevel` fields to all 4 role entries in `ENEMY_ROLE_CONFIG` type and values
- Updated `computeEnemyStats` to compute AC as `role.baseArmor + role.armorPerLevel * effectiveLevel` instead of `template.armorClass + effectiveLevel`
- Set all 29 enemy template `armorClass` values to `0n` — role config is now the sole source of enemy AC

## Task Commits

1. **Task 1: Add role-based AC to ENEMY_ROLE_CONFIG and update computeEnemyStats** - `668f545` (feat)
2. **Task 2: Normalize all enemy template armorClass values to 0n** - `fb58e4e` (feat)

## Files Created/Modified
- `spacetimedb/src/helpers/combat.ts` - ENEMY_ROLE_CONFIG type extended with baseArmor/armorPerLevel; computeEnemyStats AC formula updated
- `spacetimedb/src/seeding/ensure_enemies.ts` - All 29 enemy template armorClass values set to 0n

## Decisions Made
- AC formula `role.baseArmor + role.armorPerLevel * effectiveLevel` matches existing HP/damage pattern for consistency
- `template.armorClass` preserved in schema (not removed) so it can serve as per-enemy AC bonus in future without schema migration
- Tank/healer AC spread grows with level by design: 13 AC difference at L1, 21 at L5 — tanks become increasingly distinguishable

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. Pre-existing TypeScript errors in the codebase (unrelated files) were present before and after changes; no new errors introduced by this task.

## User Setup Required
None - no external service configuration required. Module will need republish to apply changes.

## Next Phase Readiness
- Role-based AC is now consistent with role-based HP and damage scaling
- Tank enemies at L5 have 34 AC (~25% damage reduction) vs healer's 13 AC (~11%) — meaningful combat differentiation
- `template.armorClass` field available as future per-enemy AC bonus if desired

---
*Phase: 159-enemy-ac-role-level*
*Completed: 2026-02-18*
