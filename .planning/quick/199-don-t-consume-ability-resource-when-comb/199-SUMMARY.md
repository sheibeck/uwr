---
phase: quick-199
plan: 01
subsystem: combat-abilities
tags: [combat, abilities, resource-management, ux, stamina, mana]
dependency_graph:
  requires: [spacetimedb/src/helpers/combat.ts, spacetimedb/src/reducers/items.ts]
  provides: [ability-resource-integrity, immersive-failure-messages]
  affects: [executeAbility, use_ability, applyDamage, summonPet]
tech_stack:
  added: []
  patterns: [arrow-function-wrapper-for-try-return, deduct-after-success]
key_files:
  modified:
    - spacetimedb/src/helpers/combat.ts
    - spacetimedb/src/reducers/items.ts
decisions:
  - Arrow function wrapper for switch-case allows `return` to exit only the inner function, enabling post-switch resource deduction without changing all 50+ case bodies
  - staminaFree effect ID captured early (to compute resourceCost=0) but CharacterEffect row deleted only after ability fires successfully
metrics:
  duration: ~11min
  completed: 2026-02-19
  tasks: 2
  files: 2
---

# Quick Task 199: Don't Consume Ability Resource When Ability Fails Summary

**One-liner:** Resource deduction moved to after ability execution via arrow function wrapper, so failing abilities (no combat target, wrong state) no longer silently drain stamina or mana.

## What Was Done

Restructured `executeAbility` in `helpers/combat.ts` so that mana and stamina are only deducted AFTER the ability fires successfully. Previously, resources were deducted before the switch-case ran, meaning a `SenderError('No enemy in combat')` thrown inside `applyDamage` would still cost the player their stamina or mana.

Also updated all out-of-combat failure messages to be more immersive and thematic.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Move resource deduction + update messages | 0784442 | combat.ts, items.ts |
| 2 | Publish module | 0784442 | (deployed) |

## Changes Made

### `spacetimedb/src/helpers/combat.ts`

**Resource deduction restructuring:**
- Captured `staminaFreeEffectId` early (needed to compute `resourceCost = 0n`) but did NOT delete the CharacterEffect row at that point
- Removed the resource deduction block that ran before the switch-case
- Wrapped the entire `switch (abilityKey) { ... }` in an arrow function `const runAbility = () => { ... }`
- Called `runAbility()` — if it throws a `SenderError`, the error propagates and we skip deduction; if it returns normally, ability succeeded
- Added resource deduction block AFTER `runAbility()`: first deletes staminaFree effect (if applicable), then deducts mana or stamina

**Message updates in combat.ts:**
- `'Pets can only be summoned in combat'` → `'Your companion can only be called forth when enemies are near.'`
- `'No enemy in combat'` (summonPet) → `'You have no target to unleash this upon.'`
- `'No enemy in combat'` (applyDamage) → `'You have no target to unleash this upon.'`
- `'No enemy target'` (warrior_intimidating_presence) → `'You have no target to unleash this upon.'`

**Comment update:**
- Updated stale comment in `druid_natures_mark` case (previously said "after mana deduction" which was no longer true)

### `spacetimedb/src/reducers/items.ts`

**Message updates in use_ability reducer:**
- `'This ability can only be used in combat.'` → `'You must be engaged in battle to use this ability.'`
- `'This ability cannot be used in combat.'` → `'This ability can only be used when you are at peace.'`

## Key Technical Decision

The switch-case in `executeAbility` has 50+ cases, all using `return` (not `break`) to exit. This means code placed after the switch statement is unreachable when any case matches. The solution: wrap the switch in an arrow function. When a case body calls `return`, it exits only the arrow function (not `executeAbility`). When a case throws `SenderError`, the error propagates out of the arrow function call, bypassing the deduction block. Only when `runAbility()` completes normally does the deduction execute.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- TypeScript: no type errors (`npx tsc --noEmit` clean)
- Module published successfully to local SpacetimeDB: `Updated database with name: uwr`
- Resource deduction lines confirmed at lines 1549-1552 (after `runAbility()` at line 1543)
- All 4 combat.ts error messages updated
- Both items.ts messages updated

## Self-Check: PASSED

- `spacetimedb/src/helpers/combat.ts` modified — confirmed via git diff
- `spacetimedb/src/reducers/items.ts` modified — confirmed via git diff
- Commit 0784442 exists in git log
- Module deployed successfully (no publish errors)
