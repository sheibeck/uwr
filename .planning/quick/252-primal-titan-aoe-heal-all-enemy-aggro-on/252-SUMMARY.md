---
phase: quick-252
plan: "01"
subsystem: combat
tags: [pets, summoner, primal-titan, aggro, heal, ui]
dependency_graph:
  requires: []
  provides: [pet_aoe_heal-in-combat, pet_aoe_heal-out-of-combat, primal-titan-aoe-aggro, pet-countdown-ui]
  affects: [executePetAbility, summonPet, combat-tick-loop, GroupPanel]
tech_stack:
  added: []
  patterns: [aoe-heal-all-participants, aoe-aggro-on-summon, bigint-timestamp-countdown]
key_files:
  created: []
  modified:
    - spacetimedb/src/helpers/combat.ts
    - spacetimedb/src/reducers/combat.ts
    - src/App.vue
    - src/components/GroupPanel.vue
decisions:
  - "Heal owner separately then iterate combatParticipant.by_combat to avoid double-healing"
  - "AoE aggro inserts AggroEntry for every living enemy AND sets aggroTargetPetId/aggroTargetCharacterId immediately"
  - "petCountdown uses props.nowMicros (updated every 100ms) so no extra reactive wiring is needed"
metrics:
  duration_minutes: 15
  completed_date: "2026-02-21"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 4
---

# Phase quick-252 Plan 01: Primal Titan AoE Heal, AoE Aggro, and Pet Countdown Summary

**One-liner:** Primal Titan heals all party members per tick (in-combat and out-of-combat), pulls aggro from all enemies on summon, and GroupPanel shows a live seconds countdown for timed pets.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add pet_aoe_heal to executePetAbility and AoE aggro in summonPet | 9241e39 | spacetimedb/src/helpers/combat.ts |
| 2 | Add out-of-combat pet_aoe_heal tick loop and re-arm on combat exit | 05cbcfc | spacetimedb/src/reducers/combat.ts |
| 3 | Add expiresAtMicros to pet data and countdown display in GroupPanel | 9ad922a | src/App.vue, src/components/GroupPanel.vue |

## What Was Built

### Task 1 — pet_aoe_heal in executePetAbility + AoE aggro in summonPet

**`spacetimedb/src/helpers/combat.ts`:**

- Added `pet_aoe_heal` case in `executePetAbility` immediately after the `pet_heal` block, before the enemy-target guard. Heals the owner first, then iterates `combatParticipant.by_combat` to heal every active participant who is injured. Returns false if nothing was healed.
- Added `else if (inActiveCombat && ability?.key === 'pet_aoe_heal')` block in `summonPet` after the `pet_taunt` aggro block. Iterates `combatEnemy.by_combat`, skips dead enemies, inserts an `AggroEntry` with `SUMMONER_PET_INITIAL_AGGRO` for each living enemy, and immediately sets `aggroTargetPetId`/`aggroTargetCharacterId` on all of them.

### Task 2 — Out-of-combat tick loop for pet_aoe_heal

**`spacetimedb/src/reducers/combat.ts`:**

- Added out-of-combat `pet_aoe_heal` tick loop after the existing `pet_heal` loop. Logic: heals owner if injured, then heals all group members at same location. Disarms (clears `nextAbilityAt`) if no one is injured. Re-arms cooldown the same way as `pet_heal`.
- Updated both combat-exit re-arm spots (line ~334 and ~1958) to include `pet_aoe_heal` alongside `pet_heal`:
  `nextAbilityAt: (pet.abilityKey === 'pet_heal' || pet.abilityKey === 'pet_aoe_heal') ? ctx.timestamp.microsSinceUnixEpoch : undefined`

### Task 3 — expiresAtMicros forwarded + pet countdown in GroupPanel

**`src/App.vue`:**

- Both branches of `combatPetsForGroup` computed (in-combat and out-of-combat `.map()` calls) now include `expiresAtMicros: pet.expiresAtMicros ?? null`.

**`src/components/GroupPanel.vue`:**

- `combatPets` prop type extended with `expiresAtMicros?: bigint | null`.
- `petCountdown(pet)` helper added: computes remaining seconds using `props.nowMicros` (falls back to `Date.now() * 1000`). Returns `'Expiring...'` at zero, `null` when no expiry set.
- Both pet card `<div>` blocks (group member at line ~49, solo at line ~130) updated to show `(Xs)` countdown inline with the name when `petCountdown(pet)` is non-null.

## Verification

- SpacetimeDB module published to local with no errors: `Build finished successfully.`
- Pre-existing TypeScript errors in App.vue (unrelated readonly type issues) confirmed to predate these changes.

## Deviations from Plan

None - plan executed exactly as written.
