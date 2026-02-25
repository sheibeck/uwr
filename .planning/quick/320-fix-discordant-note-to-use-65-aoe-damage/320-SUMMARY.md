---
phase: quick-320
plan: 01
subsystem: combat
tags: [bard, damage-scaling, aoe, balance]
dependency-graph:
  requires: [combat_scaling.ts AOE_DAMAGE_MULTIPLIER, getAbilityStatScaling, getAbilityMultiplier]
  provides: [standardized Discordant Note damage across all 3 locations]
  affects: [bard combat damage output]
tech-stack:
  patterns: [standard ability scaling pipeline for AoE damage]
key-files:
  modified:
    - spacetimedb/src/helpers/combat.ts
    - spacetimedb/src/reducers/combat.ts
decisions:
  - Use identical standard pipeline formula in all 3 Discordant Note damage locations
metrics:
  duration: 165s
  completed: 2026-02-25T04:20:40Z
  tasks: 2/2
  files-modified: 2
---

# Quick Task 320: Fix Discordant Note to Use 65% AoE Damage Summary

Replaced 3 custom Discordant Note damage formulas with the standard ability scaling pipeline using AOE_DAMAGE_MULTIPLIER (65%), getAbilityStatScaling (hybrid), and getAbilityMultiplier.

## What Changed

### Task 1: Fix helpers/combat.ts (on-cast + Finale)
**Commit:** 75a13f9

Replaced two custom formulas:
- **On-cast:** `(8n + level*2n + cha) * 65n / 100n` -> standard pipeline `(power*5 + hybridStatScaling) * abilityMultiplier / 100 * AOE_DAMAGE_MULTIPLIER / 100`
- **Finale burst:** `5n + character.level` -> same standard pipeline

### Task 2: Fix reducers/combat.ts (song tick)
**Commit:** f803fca

- Added `AOE_DAMAGE_MULTIPLIER`, `getAbilityStatScaling`, `getAbilityMultiplier` imports from `combat_scaling`
- Replaced song tick formula `(8n + bard.level*2n + bard.cha) * 65n / 100n` with the same standard pipeline

## Deviations from Plan

None - plan executed exactly as written.

## Verification

1. TypeScript compilation: No new errors introduced (all errors pre-existing in unrelated files)
2. Old formula `8n +` pattern: Zero matches in both combat files
3. Old Finale formula `5n + character.level`: No Discordant Note matches remain
4. `AOE_DAMAGE_MULTIPLIER` confirmed present in all 3 Discordant Note damage blocks (on-cast line 1022, Finale line 1090, song tick line 1821)

## Self-Check: PASSED

- [x] spacetimedb/src/helpers/combat.ts modified with 2 formula replacements
- [x] spacetimedb/src/reducers/combat.ts modified with 1 formula replacement + imports
- [x] Commit 75a13f9 exists
- [x] Commit f803fca exists
