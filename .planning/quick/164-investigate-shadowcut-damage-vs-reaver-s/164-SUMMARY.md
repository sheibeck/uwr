---
phase: quick-164
plan: 01
subsystem: combat
tags: [combat-scaling, rogue, ability-damage, stat-scaling, spacetimedb]

# Dependency graph
requires:
  - phase: 3.1-combat-balance
    provides: ABILITY_STAT_SCALING map, getAbilityStatScaling helper in combat_scaling.ts
  - phase: 04-config-table-architecture
    provides: AbilityTemplate DB table with statScaling field seeded from ABILITY_STAT_SCALING
provides:
  - Corrected DEX-based stat scaling for all rogue damage abilities (shadow_cut, bleed, shadow_strike)
affects: [combat, ability-damage, rogue-class, class-balance]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - spacetimedb/src/data/combat_scaling.ts

key-decisions:
  - "Rogue damage abilities (shadow_cut, bleed, shadow_strike) scale on DEX not STR — rogue primary is DEX (12 at L1) vs STR (8 at L1)"
  - "Hybrid class advantage (STR+INT sum) and Shadow Cut DoT power split are by-design, not bugs — only the stat mismatch was fixed"
  - "Module republished with --clear-database to reseed AbilityTemplate.statScaling from corrected ABILITY_STAT_SCALING"

patterns-established:
  - "Rogue finesse abilities use DEX block in ABILITY_STAT_SCALING, not STR block"

# Metrics
duration: 5min
completed: 2026-02-18
---

# Quick Task 164: Fix Rogue Shadow Cut Damage Scaling Summary

**Fixed rogue damage ability stat scaling from STR (dump stat, 8 at L1) to DEX (primary stat, 12 at L1), narrowing the damage gap from ~60% to ~15-20% vs hybrid classes**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-18T03:33:34Z
- **Completed:** 2026-02-18T03:38:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Changed `rogue_shadow_cut`, `rogue_bleed`, and `rogue_shadow_strike` from `'str'` to `'dex'` in `ABILITY_STAT_SCALING`
- Reorganized the map to place rogue abilities under a new "DEX abilities (rogue finesse)" comment block, separated from STR melee abilities
- Republished module with `--clear-database` to reseed `AbilityTemplate.statScaling` with corrected values
- Shadow Cut now deals ~19 direct + ~13 DoT = ~32 total damage value at L1 (up from ~16 direct), vs Reaver Blood Rend ~38 and Spellblade Arcane Slash ~32

## Task Commits

Each task was committed atomically:

1. **Task 1: Change rogue damage abilities from STR to DEX scaling** - `df5cb7d` (fix)
2. **Task 2: Republish module to apply scaling fix** - no new files changed; republish applied seeding via Task 1 commit

## Files Created/Modified

- `spacetimedb/src/data/combat_scaling.ts` - Changed three rogue abilities from `'str'` to `'dex'` in `ABILITY_STAT_SCALING`; added new "DEX abilities (rogue finesse)" comment block; removed rogue entries from STR block

## Decisions Made

- Only the stat mismatch (factor #1) was fixed. Hybrid class STR+INT sum advantage (factor #2) and Shadow Cut DoT power split (factor #3) are intentional by-design differences — not bugs.
- `--clear-database` used for republish because `statScaling` is written during seeding (`ensureAbilityTemplates` reads `ABILITY_STAT_SCALING`); clear ensures clean reseed without stale cached values.
- Monk and Beastmaster abilities remain as `'str'` — those classes have STR as primary or secondary stat, so the mapping was correct for them.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Self-Check

- [x] `spacetimedb/src/data/combat_scaling.ts` modified — confirmed via grep showing all three rogue abilities as `'dex'`
- [x] Commit `df5cb7d` exists — confirmed via `git log`
- [x] Module republished — `Database initialized` in logs, no errors

## Self-Check: PASSED

## Next Phase Readiness

- Rogue Shadow Cut damage scaling is corrected; rogue class is now competitive at level 1
- No further combat scaling work needed for this specific issue
- Future scaling concerns: at higher levels DEX grows at 3n/level (primary growth) vs STR at 1n/level for rogues — gap further narrows naturally as intended

---
*Phase: quick-164*
*Completed: 2026-02-18*
