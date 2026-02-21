---
phase: quick-261
plan: "01"
subsystem: combat
tags: [pet, heal, bug-fix, combat-tick]
dependency_graph:
  requires: []
  provides: [in-combat-pet-self-heal-fix]
  affects: [activePet, executePetAbility, pet tick loop]
tech_stack:
  added: []
  patterns: [re-fetch after mutation to prevent stale spread]
key_files:
  created: []
  modified:
    - spacetimedb/src/reducers/combat.ts
decisions:
  - "Re-fetch pet via ctx.db.activePet.id.find() after executePetAbility rather than tracking individual fields, keeping the fix minimal and general-purpose"
metrics:
  duration: "5 minutes"
  completed: "2026-02-21"
  tasks_completed: 1
  tasks_total: 1
  files_changed: 1
---

# Quick 261: Water Elemental In-Combat Self-Heal Not Updating HP Bar

Re-fetch pet row after ability use so stale-spread no longer clobbers currentHp set by pet_heal.

## What Was Done

Fixed a stale-data overwrite bug in the in-combat pet tick loop in `spacetimedb/src/reducers/combat.ts`.

### Root Cause

The pet tick loop (around line 2498) worked like this:

1. Captured `pet` row at start of loop iteration
2. Called `executeAbilityAction(...)` which internally calls `executePetAbility` -> writes `ctx.db.activePet.id.update({ ...healTarget, currentHp: newHp })` — DB row updated with healed HP
3. Continued to `ctx.db.activePet.id.update({ ...pet, nextAbilityAt, ... })` — spread the **stale** `pet` object still holding the old `currentHp`, overwriting the heal

The result: the pet_heal ability technically fired and updated the DB, but the very next write in the same tick overwrote it back to the pre-heal value. The HP bar never showed the change.

### Fix Applied

Two minimal changes:

1. Changed `for (const pet of pets)` to `for (let pet of pets)` — allows reassignment within the loop body
2. After the `if (used)` block, added:
   ```typescript
   pet = ctx.db.activePet.id.find(pet.id) ?? pet;
   ```
   This re-fetches the current DB row so both the early-exit path (line 2543) and the normal auto-attack path (line 2594) spread from the freshly-updated pet, preserving any HP changes made by the ability.

## Verification

- Local publish succeeded with no compile errors (`spacetime publish uwr`)
- Both update paths after ability use now spread from the re-fetched pet row

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Hash | Message |
|------|---------|
| 230f7a6 | fix(quick-261): re-fetch pet after executePetAbility to prevent stale-spread overwrite |
