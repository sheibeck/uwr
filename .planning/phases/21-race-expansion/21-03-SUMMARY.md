---
phase: 21-race-expansion
plan: 03
subsystem: ui
tags: [vue, typescript, race, character-creation, spacetimedb]

# Dependency graph
requires:
  - phase: 21-race-expansion plan 01
    provides: Race table with bonus1Type/bonus1Value/bonus2Type/bonus2Value fields and regenerated client bindings
provides:
  - CharacterPanel.vue race info panel using bonus1Type/bonus2Type dual-bonus display with human-readable labels
  - formatRaceBonus() helper mapping 14 bonus type keys to readable strings (e.g. 'spell_damage' -> 'Spell Damage +2')
  - unlockedRaces filter (pre-existing, confirmed correct) keeping locked races absent from character creation
affects:
  - 21-04 (unlockrace admin command — UI side of locked races fully handled)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "formatRaceBonus switch: maps bonus type string key to human-readable label with value, covering all 14 bonus types"

key-files:
  created: []
  modified:
    - src/components/CharacterPanel.vue

key-decisions:
  - "formatRaceBonus placed as plain function in script setup — no composable needed for single-use formatting logic"
  - "unlockedRaces computed was already correct and in place (pre-existing from Phase 01); no changes required"
  - "selectedRaceRow is typed as 'any' in props — avoids needing to import Race type, consistent with existing component style"

patterns-established:
  - "Bonus type key formatting: switch on bonusType string with default fallback ensures forward-compatible display"

requirements-completed:
  - RACE-EXP-04
  - RACE-EXP-05

# Metrics
duration: 5min
completed: 2026-02-20
---

# Phase 21 Plan 03: CharacterPanel Race Bonus Display Summary

**Race info panel updated to show dual-bonus system using formatRaceBonus() converting type keys like 'spell_damage' to 'Spell Damage +2' — old strBonus/dexBonus fields fully removed**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-20T04:46:54Z
- **Completed:** 2026-02-20T04:52:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Replaced 5 conditional old-field spans (strBonus/dexBonus/chaBonus/wisBonus/intBonus) with 2-span dual-bonus display using bonus1Type/bonus1Value and bonus2Type/bonus2Value
- Added formatRaceBonus() with all 14 bonus type cases: stat_str, stat_dex, stat_int, stat_wis, stat_cha, spell_damage, phys_damage, max_hp, max_mana, mana_regen, stamina_regen, crit_chance, armor, dodge
- Confirmed unlockedRaces computed (pre-existing) correctly filters r.unlocked — locked races (Dark-Elf, Half-Giant, Cyclops, Satyr) remain absent from character creation

## Task Commits

Each task was committed atomically:

1. **Task 1: Update CharacterPanel.vue race info panel to display new dual-bonus fields** - `3d1fece` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified

- `src/components/CharacterPanel.vue` - Replaced old strBonus/dexBonus conditional spans with bonus1Type/bonus2Type display; added formatRaceBonus() function with 14 type cases; unlockedRaces filter unchanged (was already correct)

## Decisions Made

- Used plain function (not computed/method) for formatRaceBonus — straightforward string mapping, no reactive state needed
- Left selectedRaceRow typed as `any` — consistent with existing component style, avoids importing Race type
- Did not touch unlockedRaces or v-for logic — both were already correct from Phase 01 implementation

## Deviations from Plan

None - plan executed exactly as written.

The unlockedRaces computed and v-for="race in unlockedRaces" were already present and correct — this was anticipated by the plan ("Verify that a computed property like unlockedRaces exists").

## Issues Encountered

Pre-existing TypeScript errors in src/App.vue (readonly type mismatches from SpacetimeDB SDK readonly arrays vs mutable type expectations) are unrelated to this plan and were present before. Logged as out-of-scope. CharacterPanel.vue itself produces no TypeScript errors.

## User Setup Required

None.

## Next Phase Readiness

- UI race display is complete; Plan 21-04 (unlockrace admin command) can proceed
- formatRaceBonus covers all 14 bonus types from the type key convention established in Plan 01
- Locked race hiding is fully functional — 4 locked races absent from character creation until admin fires /unlockrace

---
*Phase: 21-race-expansion*
*Completed: 2026-02-20*
