---
phase: quick-292
plan: 01
subsystem: combat
tags: [bugfix, spell-casting, combat-transitions]
dependency_graph:
  requires: []
  provides: [friendly-cast-persistence]
  affects: [clearCombatArtifacts, tick_casts]
tech_stack:
  added: []
  patterns: [conditional-cast-cancellation]
key_files:
  modified:
    - spacetimedb/src/reducers/combat.ts
decisions:
  - Only cancel casts with combatState 'combat_only'; all other states persist
  - Missing ability template treated as combat-only (defensive safety)
metrics:
  duration: 64s
  completed: 2026-02-24
---

# Quick Task 292: Friendly Spell Casts Should Not Be Cancelled

Conditional cast cancellation in clearCombatArtifacts -- looks up ability combatState before deleting pending casts so heals/buffs/resurrects persist through combat transitions.

## Changes Made

### Task 1: Make clearCombatArtifacts skip friendly casts
**Commit:** `dd547cf`

Modified the cast cleanup loop in `clearCombatArtifacts` (combat.ts, lines 365-372) to look up each cast's ability template and check its `combatState` field before deciding whether to cancel:

- **combat_only** abilities: casts are cancelled (existing behavior preserved)
- **any / out_of_combat / out_of_combat_only** abilities: casts persist through combat exit
- **Missing ability template**: casts are cancelled as a safety measure

The `tick_casts` scheduled reducer already handles both in-combat and out-of-combat execution paths, so preserved friendly casts will complete naturally when their timers expire.

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- TypeScript compilation: all errors in combat.ts are pre-existing (implicit any types, bigint/number mismatches in unrelated functions); no new errors introduced
- SpacetimeDB build: "Build finished successfully" (local server not running, so publish step fails on upload -- build itself passes)
- Code inspection confirms only `combat_only` casts are deleted; all other combatState values are preserved

## Self-Check: PASSED
