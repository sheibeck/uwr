---
phase: quick-322
plan: 01
subsystem: combat-balance
tags: [weapons, damage, dps, 2h-vs-1h, balance]

# Dependency graph
requires: []
provides:
  - "Balanced weapon damage values across all 3 data sources (starter, world drop, boss drop)"
  - "2H weapons deal significantly more per-hit damage than 1H weapons"
  - "DPS roughly normalized across speed tiers with slight 2H premium"
affects: [combat, items, loot]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inline DPS math comments on all weapon data entries"

key-files:
  created: []
  modified:
    - spacetimedb/src/seeding/ensure_items.ts
    - spacetimedb/src/data/item_defs.ts
    - spacetimedb/src/data/named_enemy_defs.ts

key-decisions:
  - "2H weapons get ~5-10% DPS premium over 1H to compensate for losing offhand slot"
  - "Greatsword is highest per-hit damage across all speed tiers as pure damage 2H choice"
  - "Staff and bow share identical stats within each tier (both 2H caster/ranged)"

patterns-established:
  - "Weapon balance formula: rawWeaponDamage = 5 + level + baseDamage + (dps / 2)"
  - "Per-hit damage hierarchy: fast 1H < normal 1H < medium 1H < slow 2H"
  - "Tier progression: starter ~85-90% of world drop, boss ~120-130% of world drop"

requirements-completed: [BALANCE-WEAPONS]

# Metrics
duration: 4min
completed: 2026-02-25
---

# Quick 322: Balance Weapon Damage for 2H vs 1H Speed

**Rebalanced all weapon baseDamage/dps values so 2H weapons (staff/bow/greatsword) deal ~2x per-hit damage vs 1H weapons with normalized DPS across speed tiers**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-25T23:52:25Z
- **Completed:** 2026-02-25T23:56:40Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- 2H starter weapons buffed from baseDamage 4-5 to 7-8 (raw damage 17-18 vs 1H 9-12 at L1)
- 2H world drop weapons buffed to baseDamage 8-12 across T1/T2 tiers
- 2H boss drop weapons buffed to baseDamage 9-15 across all boss tiers
- DPS normalized to ~3.0-3.6 at L1, with 2H getting slight premium for losing offhand
- Added inline DPS math comments to every weapon entry for ongoing balance verification

## Task Commits

Each task was committed atomically:

1. **Task 1: Rebalance all weapon baseDamage and dps values** - `bae8322` (feat)

## Files Created/Modified
- `spacetimedb/src/seeding/ensure_items.ts` - STARTER_WEAPON_STATS: buffed 2H from 4-5/5-6 to 7-8/8-9 baseDamage/dps
- `spacetimedb/src/data/item_defs.ts` - WORLD_DROP_GEAR_DEFS: rebalanced all weapon entries across T1 and T2
- `spacetimedb/src/data/named_enemy_defs.ts` - BOSS_DROP_DEFS: buffed 2H boss weapons (6 entries updated)

## Decisions Made
- Followed plan exactly for starter and world drop values
- For boss drops, only updated the 2H weapons (staff/bow/greatsword) that were undervalued; left 1H boss weapons unchanged since they already exceeded world drop equivalents
- Used integer truncation for dps/2 in raw damage formula (bigint division floors)

## Deviations from Plan

None - plan executed exactly as written.

## Balance Summary

### Starter Weapons (Level 1)
| Type | Speed | baseDmg | dps | Raw | Eff DPS |
|------|-------|---------|-----|-----|---------|
| dagger | 3.0s | 2 | 3 | 9 | 3.0 |
| rapier | 3.0s | 2 | 3 | 9 | 3.0 |
| sword | 3.5s | 3 | 4 | 11 | 3.14 |
| blade | 3.5s | 3 | 4 | 11 | 3.14 |
| mace | 3.5s | 3 | 4 | 11 | 3.14 |
| axe | 4.0s | 4 | 5 | 12 | 3.0 |
| staff (2H) | 5.0s | 7 | 8 | 17 | 3.4 |
| bow (2H) | 5.0s | 7 | 8 | 17 | 3.4 |
| greatsword (2H) | 5.0s | 8 | 9 | 18 | 3.6 |

### T1 World Drop Weapons (Level 1)
| Type | Speed | baseDmg | dps | Raw | Eff DPS |
|------|-------|---------|-----|-----|---------|
| dagger | 3.0s | 3 | 4 | 11 | 3.67 |
| rapier | 3.0s | 3 | 4 | 11 | 3.67 |
| sword | 3.5s | 4 | 5 | 12 | 3.43 |
| blade | 3.5s | 4 | 5 | 12 | 3.43 |
| mace | 3.5s | 4 | 5 | 12 | 3.43 |
| axe | 4.0s | 5 | 7 | 14 | 3.5 |
| staff (2H) | 5.0s | 8 | 10 | 19 | 3.8 |
| bow (2H) | 5.0s | 8 | 10 | 19 | 3.8 |
| greatsword (2H) | 5.0s | 9 | 11 | 20 | 4.0 |

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Weapon balance is complete; re-publish to apply changes to live database
- No schema changes required, only data value updates

## Self-Check: PASSED

- FOUND: spacetimedb/src/seeding/ensure_items.ts
- FOUND: spacetimedb/src/data/item_defs.ts
- FOUND: spacetimedb/src/data/named_enemy_defs.ts
- FOUND: .planning/quick/322-balance-weapon-damage-for-2h-vs-1h-speed/322-SUMMARY.md
- FOUND: commit bae8322

---
*Phase: quick-322*
*Completed: 2026-02-25*
