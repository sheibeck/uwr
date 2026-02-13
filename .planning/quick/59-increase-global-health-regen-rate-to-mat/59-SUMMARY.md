---
phase: quick-59
plan: 01
subsystem: combat
tags: [combat-balance, regen, health, mana, stamina]

# Dependency graph
requires:
  - phase: quick-56
    provides: Increased HP pools (~80-90%) via BASE_HP and HP_STR_MULTIPLIER adjustments
provides:
  - Scaled regen constants (HP, mana, stamina) to restore pre-quick-56 recovery-time-to-max-HP ratio
affects: [combat-balance, player-experience, downtime]

# Tech tracking
tech-stack:
  added: []
  patterns: [centralized-regen-constants, tick-based-passive-regen]

key-files:
  created: []
  modified: [spacetimedb/src/reducers/combat.ts]

key-decisions:
  - "HP regen doubled (3n -> 6n out, 1n -> 2n in) to match ~2x HP pool increase"
  - "Mana/stamina regen increased ~67% (3n -> 5n out, 1n -> 2n in) for consistency"
  - "REGEN_TICK_MICROS unchanged at 8s to avoid affecting scheduled reducer timing"

patterns-established:
  - "Regen constants tuned proportionally to HP pool changes"

# Metrics
duration: 1min
completed: 2026-02-13
---

# Quick Task 59: Increase Global Health Regen Rate Summary

**HP/mana/stamina regen constants doubled (out-of-combat) and doubled (in-combat) to restore pre-quick-56 recovery times after ~80-90% HP pool increase**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-13T05:40:18Z
- **Completed:** 2026-02-13T05:41:16Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Updated 6 regen constants in combat.ts (HP/mana/stamina, in/out of combat)
- Restored recovery-time-to-max-HP ratio to pre-quick-56 levels
- Eliminated tedious downtime between fights caused by unscaled regen

## Task Commits

Each task was committed atomically:

1. **Task 1: Scale regen constants to match increased HP pools** - `40db382` (chore)

## Files Created/Modified
- `spacetimedb/src/reducers/combat.ts` - Updated HP_REGEN_OUT/IN, MANA_REGEN_OUT/IN, STAMINA_REGEN_OUT/IN constants

## Decisions Made

**1. HP regen doubled to match ~2x HP pools**
- HP_REGEN_OUT: 3n -> 6n (doubled)
- HP_REGEN_IN: 1n -> 2n (doubled)
- Rationale: HP pools increased ~80-90% (BASE_HP 20->50, HP_STR_MULTIPLIER 5->8 in quick-56), so regen needed ~2x scaling

**2. Mana/stamina regen increased ~67% for consistency**
- MANA_REGEN_OUT/STAMINA_REGEN_OUT: 3n -> 5n
- MANA_REGEN_IN/STAMINA_REGEN_IN: 1n -> 2n
- Rationale: While mana pools unchanged, proportional scaling maintains consistent gameplay feel across all resources

**3. REGEN_TICK_MICROS unchanged**
- Kept at 8_000_000n (8 seconds)
- Rationale: Changing tick rate would affect effect processing (DoT/HoT/buff/debuff) and other systems. Adjusting per-tick amount is safer.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - straightforward constant updates, build succeeded on first try.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Recovery times now proportional to HP pools again. Out-of-combat downtime reduced to acceptable levels (Level 1 Warrior recovers in ~195s vs ~213s old, Wizard ~152s vs ~160s old).

## Self-Check

**Verification results:**

Checking constants in combat.ts:
```bash
$ grep -n "REGEN_OUT\|REGEN_IN" spacetimedb/src/reducers/combat.ts
1081:  const HP_REGEN_OUT = 6n;
1082:  const MANA_REGEN_OUT = 5n;
1083:  const STAMINA_REGEN_OUT = 5n;
1084:  const HP_REGEN_IN = 2n;
1085:  const MANA_REGEN_IN = 2n;
1086:  const STAMINA_REGEN_IN = 2n;
```

Checking commit exists:
```bash
$ git log --oneline --all | grep 40db382
40db382 chore(quick-59): scale regen constants to match increased HP pools
```

Checking build:
```bash
$ npm run build
Build finished successfully.
```

## Self-Check: PASSED

All constants updated correctly, commit exists, build succeeds.

---
*Phase: quick-59*
*Completed: 2026-02-13*
