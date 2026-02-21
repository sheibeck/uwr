---
phase: quick-248
plan: 01
subsystem: combat
tags: [pets, aggro, summoner, elemental]
dependency_graph:
  requires: []
  provides: [conditional-pet-initial-aggro]
  affects: [summonPet, aggroEntry]
tech_stack:
  added: []
  patterns: [conditional-aggro-by-ability-key]
key_files:
  modified:
    - spacetimedb/src/helpers/combat.ts
decisions:
  - "Use ability?.key === 'pet_taunt' as the sole discriminator for initial pet aggro on summon"
metrics:
  duration: "5 minutes"
  completed: "2026-02-21"
  tasks_completed: 1
  tasks_total: 1
  files_changed: 1
---

# Phase quick-248 Plan 01: Fire and Water Elementals Spawn With No Initial Aggro Summary

**One-liner:** Restrict summoner pet initial aggro to pet_taunt (earth elemental) only, so fire and water elementals survive longer after summon.

## What Was Built

Modified the `summonPet` helper in `spacetimedb/src/helpers/combat.ts` to only insert an `aggroEntry` when the summoned pet has the `pet_taunt` ability key.

**Before:** All summoner pets in active combat generated initial aggro via `SUMMONER_PET_INITIAL_AGGRO`.

**After:** Only pets with `ability?.key === 'pet_taunt'` (earth elemental) generate initial aggro. Fire elemental (no ability key) and water elemental (`pet_heal` key) do not.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Restrict initial aggro to pet_taunt ability only | 715659a | spacetimedb/src/helpers/combat.ts |

## Key Change

**File:** `spacetimedb/src/helpers/combat.ts` line 465

```typescript
// Before
if (inActiveCombat && character.className?.toLowerCase() === 'summoner') {

// After
if (inActiveCombat && character.className?.toLowerCase() === 'summoner' && ability?.key === 'pet_taunt') {
```

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- [x] spacetimedb/src/helpers/combat.ts modified with correct condition
- [x] Commit 715659a exists
- [x] Module compiled and published to local SpacetimeDB without errors
