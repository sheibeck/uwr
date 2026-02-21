---
phase: quick-262
plan: "01"
subsystem: combat/pets
tags: [pets, summoner, heal, out-of-combat, bug-fix]
dependency_graph:
  requires: []
  provides: [out-of-combat-heal-pet-arming]
  affects: [activePet, regen_health]
tech_stack:
  added: []
  patterns: [conditional-nextAbilityAt-on-insert]
key_files:
  modified:
    - spacetimedb/src/helpers/combat.ts
decisions:
  - "Arm heal pets (pet_heal, pet_aoe_heal) at summon time with nowMicros so the regen_health tick can pass its gate check"
metrics:
  duration: "~5 minutes"
  completed: "2026-02-21"
  tasks_completed: 1
  tasks_total: 1
  files_changed: 1
---

# Quick 262: Water Elemental Summoned Out of Combat - Summary

**One-liner:** Set `nextAbilityAt = nowMicros` for heal-ability pets on out-of-combat summon so the `regen_health` loop can fire their heal.

## What Was Done

Fixed `summonPet` in `spacetimedb/src/helpers/combat.ts` so that Water Elemental (`pet_heal`) and Primal Titan (`pet_aoe_heal`) pets have their `nextAbilityAt` field set to `nowMicros` when summoned while out of combat.

Previously, `nextAbilityAt` was set to `undefined` for all out-of-combat summons. The `regen_health` out-of-combat loop has a guard `if (!pet.nextAbilityAt) continue` — so undefined caused those pets to be skipped unconditionally, and no heals ever fired.

## Root Cause

```typescript
// Before — undefined for ALL out-of-combat summons
nextAbilityAt: inActiveCombat && ability ? nowMicros : undefined,
```

The `regen_health` loop checks `if (!pet.nextAbilityAt) continue`, so heal pets were skipped every tick.

## Fix Applied

```typescript
// After — heal pets armed immediately on summon, even out of combat
nextAbilityAt: inActiveCombat && ability
  ? nowMicros
  : (!inActiveCombat && (ability?.key === 'pet_heal' || ability?.key === 'pet_aoe_heal'))
    ? nowMicros
    : undefined,
```

This mirrors the existing combat-exit re-arm logic in `endCombat` (reducers/combat.ts ~line 334):
```typescript
(pet.abilityKey === 'pet_heal' || pet.abilityKey === 'pet_aoe_heal') ? ctx.timestamp.microsSinceUnixEpoch : undefined
```

## Behavior After Fix

| Pet | Summoned out of combat | Summoned in combat |
|-----|------------------------|-------------------|
| Water Elemental (pet_heal) | `nextAbilityAt = nowMicros` — heals within 8s | unchanged |
| Primal Titan (pet_aoe_heal) | `nextAbilityAt = nowMicros` — heals within 8s | unchanged |
| Earth Elemental (pet_taunt) | `nextAbilityAt = undefined` — no out-of-combat events | unchanged |

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | ec03779 | fix(quick-262): arm heal pets on out-of-combat summon |

## Self-Check: PASSED

- `spacetimedb/src/helpers/combat.ts` modified and verified present
- commit `ec03779` exists
- Module compiled and published successfully to local SpacetimeDB
