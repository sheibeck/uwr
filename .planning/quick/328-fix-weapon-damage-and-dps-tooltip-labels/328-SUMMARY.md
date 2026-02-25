---
phase: quick-328
plan: 01
subsystem: client-ui
tags: [tooltip, combat, weapons, damage]
dependency-graph:
  requires: [combat.ts formula, combat_constants.ts weapon speeds]
  provides: [combat-accurate weapon tooltip display]
  affects: [useItemTooltip.ts, useInventory.ts, App.vue, useCrafting.ts, useCombat.ts]
tech-stack:
  patterns: [server-formula-mirroring, optional-param-with-default]
key-files:
  created: []
  modified:
    - src/composables/useItemTooltip.ts
    - src/composables/useInventory.ts
    - src/App.vue
    - src/composables/useCrafting.ts
    - src/composables/useCombat.ts
decisions:
  - Mirrored WEAPON_SPEED_MICROS as client-side constant (server data dir not importable by client)
  - Used optional characterLevel param defaulting to 1n for vendor/crafting contexts
metrics:
  duration: 142s
  completed: 2026-02-25
  tasks: 2/2
  files-modified: 5
---

# Quick Task 328: Fix Weapon Damage and DPS Tooltip Labels

Combat-accurate weapon tooltip showing real per-hit damage (5 + level + baseDamage + dps/2) and actual DPS (damage / weapon speed).

## What Changed

### Task 1: Add combat damage calculation to buildItemTooltipData
**Commit:** `24a9c2e`

- Added `WEAPON_SPEED_MICROS` constant map mirroring server `combat_constants.ts` values
- Added optional `characterLevel` field to `BuildTooltipArgs` (defaults to `1n`)
- Replaced raw `'Weapon Damage'`/`'Weapon DPS'` stat lines with computed `'Damage'`/`'DPS'` values
- Formula: `rawWeaponDamage = 5n + level + effectiveDmg + (effectiveDps / 2n)` -- exact match to combat.ts line 2337
- Actual DPS: `rawWeaponDamage / weaponSpeedSeconds` displayed with one decimal place
- Non-weapon items unaffected (no damage lines when effectiveDmg and effectiveDps are both 0)

### Task 2: Pass character level to all buildItemTooltipData call sites
**Commit:** `a8ad431`

- `useInventory.ts`: bag items (line 98) and equipped slots (line 190) pass `selectedCharacter.value?.level ?? 1n`
- `App.vue`: vendor items (line 821) pass `selectedCharacter.value?.level ?? 1n`
- `useCrafting.ts`: recipe output (line 210) pass `selectedCharacter.value?.level ?? 1n`
- `useCombat.ts`: combat result loot (line 201) and pending loot (line 235) pass `selectedCharacter.value?.level ?? 1n`

## Verification

- TypeScript compiles with no new errors (`npx tsc --noEmit`)
- Training Bow (baseDamage=7, dps=8, bow speed=5.0s) at level 1: Damage = 5+1+7+4 = 17, DPS = 17/5.0 = 3.4
- Training Dagger (baseDamage=2, dps=3, dagger speed=3.0s) at level 1: Damage = 5+1+2+1 = 9, DPS = 9/3.0 = 3.0
- Armor items show only "Armor Class: +X" with no weapon damage lines

## Deviations from Plan

None -- plan executed exactly as written.

## Self-Check: PASSED

- All 5 modified files verified on disk
- Commits `24a9c2e` and `a8ad431` verified in git log
