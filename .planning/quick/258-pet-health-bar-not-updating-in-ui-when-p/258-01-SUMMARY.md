---
phase: 258-pet-health-bar-not-updating-in-ui-when-p
plan: "01"
subsystem: combat
tags: [pet, heal, out-of-combat, bug-fix]
dependency_graph:
  requires: []
  provides: [out-of-combat pet self-heal via activePet.id.update]
  affects: [activePet.currentHp, GroupPanel pet HP bar]
tech_stack:
  added: []
  patterns: [combined-update-to-avoid-clobber]
key_files:
  created: []
  modified:
    - spacetimedb/src/reducers/combat.ts
decisions:
  - "Used healTargetIsPet boolean flag instead of injecting isPet onto CharacterRow to avoid type mismatch"
  - "Combined currentHp and nextAbilityAt into a single activePet.id.update call to prevent the cooldown update clobbering the HP change"
  - "For pet_aoe_heal, tracked petHealedHp variable so the single final update carries both the new HP and the new cooldown"
metrics:
  duration: "~10 minutes"
  completed: "2026-02-21"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 1
---

# Phase 258 Plan 01: Pet Health Bar Not Updating in UI - Summary

**One-liner:** Added pet as self-heal candidate in out-of-combat `pet_heal` and `pet_aoe_heal` ticks, writing `activePet.currentHp` via `ctx.db.activePet.id.update` so the client subscription reflects the change.

## What Was Built

The server-side out-of-combat heal tick loops (`pet_heal` and `pet_aoe_heal`) only healed characters — they never wrote to `activePet.currentHp`. Because the client's `combatPetsForGroup` computed reactive is driven by the `activePet` subscription, a stale `currentHp` meant the GroupPanel pet HP bar never moved.

### pet_heal fix (lines 1424-1458)

Added the pet as a lowest-HP candidate after the group member loop:

```typescript
let healTargetIsPet = false;
if (pet.currentHp > 0n && pet.currentHp < pet.maxHp) {
  const petRatio = (pet.currentHp * 100n) / pet.maxHp;
  if (petRatio < lowestHpRatio) {
    lowestHpRatio = petRatio;
    healTarget = pet;
    healTargetIsPet = true;
  }
}
```

When `healTargetIsPet` is true, `currentHp` and `nextAbilityAt` are written in a single `activePet.id.update` call to avoid the separate cooldown update clobbering the HP change.

### pet_aoe_heal fix (lines 1496-1515)

Added pet self-heal after group members, tracking the new HP in `petHealedHp` and writing both `currentHp` and `nextAbilityAt` in the single final update:

```typescript
let petHealedHp = pet.currentHp;
if (pet.currentHp > 0n && pet.currentHp < pet.maxHp) {
  petHealedHp = pet.currentHp + healAmount > pet.maxHp ? pet.maxHp : pet.currentHp + healAmount;
  healedCount++;
}
// ...
ctx.db.activePet.id.update({ ...pet, currentHp: petHealedHp, nextAbilityAt: ... });
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Avoided double-update clobber of currentHp**
- **Found during:** Implementation review after Task 1
- **Issue:** The plan's suggested code called `activePet.id.update({ ...pet, currentHp: newHp })` and then separately `activePet.id.update({ ...pet, nextAbilityAt: ... })` — the second spread from the original `pet` object would revert the HP change.
- **Fix:** Combined both fields into a single `activePet.id.update` call in both loops. For `pet_heal`, the branch structure was restructured to fold the cooldown into the heal branch. For `pet_aoe_heal`, a `petHealedHp` variable carries the result to the final combined update.
- **Files modified:** `spacetimedb/src/reducers/combat.ts`
- **Commit:** 0f5b880

## Commits

| Hash | Message |
|------|---------|
| 0f5b880 | fix(258-01): include pet as heal target in out-of-combat pet_heal and pet_aoe_heal ticks |

## Self-Check: PASSED

- `spacetimedb/src/reducers/combat.ts` modified and staged
- Commit 0f5b880 exists
- Module published successfully: "Build finished successfully"
- `ctx.db.activePet.id.update` called with `currentHp` in both loops
