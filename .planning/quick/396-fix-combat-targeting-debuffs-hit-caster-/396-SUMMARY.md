---
phase: quick-396
plan: 01
subsystem: combat
tags: [bug-fix, combat, debuff, hot, targeting]
dependency_graph:
  requires: []
  provides: [correct-debuff-targeting, single-tick-hot]
  affects: [spacetimedb/src/helpers/combat.ts]
tech_stack:
  added: []
  patterns: [DEBUFF_EFFECT_TYPES guard, immediate-tick removal for regen]
key_files:
  modified:
    - spacetimedb/src/helpers/combat.ts
    - spacetimedb/src/helpers/combat.test.ts
decisions:
  - "DEBUFF_EFFECT_TYPES list includes armor_down, stun, dot, damage_down, slow, root, silence, mesmerize -- covers all LLM-generated debuff effectTypes"
  - "Removed regen immediate tick entirely from addCharacterEffect rather than adding a flag parameter -- simpler and matches the hot handler contract"
metrics:
  duration: "15m"
  completed: "2026-03-10"
  tasks_completed: 1
  files_changed: 2
---

# Quick-396: Fix Combat Targeting — Debuffs Hit Caster and HoT Double-Heal Summary

**One-liner:** Defensive DEBUFF_EFFECT_TYPES guard in buff handler redirects misclassified debuff abilities to enemies; removed duplicate regen immediate tick from addCharacterEffect to eliminate HoT double-heal.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Fix buff handler reclassification guard and remove HoT double-heal | 1c01d75 | combat.ts, combat.test.ts |

## Changes Made

### Fix 1: Buff handler debuff-type guard (combat.ts lines 623+)

Added `DEBUFF_EFFECT_TYPES` constant and guard in the `kind === 'buff'` handler. When an LLM generates an ability with `kind='buff'` but `effectType='armor_down'` (or any other debuff type), the guard intercepts and redirects to `addEnemyEffect` instead of `addCharacterEffect`. Without this fix, debuff effects landed on the caster.

### Fix 2: Remove regen immediate tick (combat.ts lines 236-252)

Changed `if (effectType === 'regen' || effectType === 'dot')` to `if (effectType === 'dot')`. The `hot` handler in `resolveAbility` already applies a direct heal for round 1. `addCharacterEffect` applying an additional regen tick caused double-healing on cast. DoT immediate tick is preserved.

## Tests Added

- `resolveAbility buff handler with debuff effectType` (4 tests):
  - buff + armor_down redirects to enemy via addEnemyEffect
  - buff + stun redirects to enemy via addEnemyEffect
  - buff + damage_up still applies to caster (no regression)
  - debuff kind still applies to enemy (regression guard)
- `resolveAbility hot handler single heal` (1 test):
  - HoT ability heals exactly once; regen effect registered without double-tick
- Updated 4 existing tests that expected immediate regen tick (now expect no HP change from addCharacterEffect for regen)

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check

- [x] spacetimedb/src/helpers/combat.ts modified
- [x] spacetimedb/src/helpers/combat.test.ts modified
- [x] Commit 1c01d75 exists
- [x] 54 tests pass (1 pre-existing unrelated failure: MANA_COST_MULTIPLIER test expects 150n but was changed to 200n in separate in-progress work)
