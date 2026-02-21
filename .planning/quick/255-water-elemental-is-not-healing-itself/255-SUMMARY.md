---
phase: quick-255
plan: "01"
subsystem: combat
tags: [pet-abilities, healing, water-elemental, bug-fix]
dependency_graph:
  requires: []
  provides: [pet-self-heal]
  affects: [executePetAbility]
tech_stack:
  added: []
  patterns: [integer-ratio-comparison, conditional-db-dispatch]
key_files:
  created: []
  modified:
    - spacetimedb/src/helpers/combat.ts
decisions:
  - "Insert pet-candidate check between participant loop and owner fallback so the owner fallback still covers the zero-candidates case"
  - "Use healTargetIsPet boolean rather than a union type to keep the dispatch readable"
metrics:
  duration: "~5 minutes"
  completed: "2026-02-21"
---

# Phase quick-255 Plan 01: Water Elemental Self-Heal Summary

**One-liner:** Pet heal now includes the pet's own currentHp/maxHp ratio as a candidate, dispatching to activePet.id.update when the pet wins.

## What Was Built

The `pet_heal` branch in `executePetAbility` (combat.ts) previously only iterated over combat participants (characters) to find the lowest-HP target. The pet itself was never a candidate, so a water elemental with 10% HP would watch a full-HP party and return `false` rather than healing itself.

The fix adds the pet as a parallel candidate using the same integer-ratio comparison:

1. `healTargetIsPet = false` flag initialized alongside the existing `lowestHpRatio` / `healTarget` variables.
2. After the participant loop, the pet's `currentHp / maxHp` ratio is compared against `lowestHpRatio`. If lower, the pet becomes the heal target and `healTargetIsPet` is set to `true`.
3. The existing owner-fallback block remains unchanged — it only fires when `healTarget` is still `null` (everyone at full HP including the pet).
4. The `newHp` calculation uses `targetCurrentHp` which reads `healTarget.currentHp` for pets and `healTarget.hp` for characters.
5. The final DB update dispatches to `ctx.db.activePet.id.update` or `ctx.db.character.id.update` based on the flag.

## Tasks

| # | Name | Commit | Status |
|---|------|--------|--------|
| 1 | Add pet as heal candidate in pet_heal branch | ac427f9 | Done |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

Module published to local without errors. Build finished successfully.

## Self-Check: PASSED

- File modified: `spacetimedb/src/helpers/combat.ts` - FOUND
- Commit ac427f9 - FOUND
