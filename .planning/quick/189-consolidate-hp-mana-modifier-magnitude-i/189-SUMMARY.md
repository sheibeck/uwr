---
phase: quick-189
plan: 01
subsystem: client-crafting
tags: [refactor, crafting, consolidation]
dependency_graph:
  requires: []
  provides: [getModifierMagnitude helper in useCrafting.ts]
  affects: [CraftingModal.vue crafting preview magnitudes]
tech_stack:
  added: []
  patterns: [single source of truth, composable helper export]
key_files:
  created: []
  modified:
    - src/composables/useCrafting.ts
    - src/components/CraftingModal.vue
decisions:
  - getModifierMagnitude exported as standalone function outside useCrafting composable — needs no reactive state
  - ESSENCE_MAGNITUDES kept in place as module-level const (still used by essenceItems computed)
  - MODIFIER_MAGNITUDE_BY_ESSENCE holds HP/mana overrides; ESSENCE_MAGNITUDES remains fallback for primary stats
metrics:
  duration: ~5min
  completed: 2026-02-18
  tasks: 2
  files: 2
---

# Quick Task 189: Consolidate HP/Mana Modifier Magnitude into useCrafting Helper

Single client-side source of truth for crafting modifier magnitudes via exported `getModifierMagnitude(essenceName, statKey)` in `useCrafting.ts`, removing duplicated `HP_MANA_MAGNITUDE` inline constant from `CraftingModal.vue`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add getModifierMagnitude helper to useCrafting.ts | 151006f | src/composables/useCrafting.ts |
| 2 | Update CraftingModal.vue to use imported getModifierMagnitude | eb8e3b9 | src/components/CraftingModal.vue |

## What Was Done

### Task 1 — useCrafting.ts

Added two new module-level constants and one exported function after the existing `ESSENCE_MAGNITUDES` block:

- `MODIFIER_MAGNITUDE_BY_ESSENCE`: stat-specific overrides for HP/mana (5/8/15 per Lesser/Essence/Greater tier)
- `export function getModifierMagnitude(essenceName, statKey)`: checks stat-specific overrides first, falls back to `ESSENCE_MAGNITUDES` for primary stats (1/2/3)
- Added comment noting it mirrors server-side `getModifierMagnitude()` in `crafting_materials.ts`

`ESSENCE_MAGNITUDES` kept unchanged — still used by `essenceItems` computed for dropdown magnitude display.

### Task 2 — CraftingModal.vue

- Added `import { getModifierMagnitude } from '../composables/useCrafting'`
- Deleted inline `HP_MANA_MAGNITUDE` constant (7 lines removed)
- Simplified `getMagnitudeForStat` from local lookup to single delegation call: `return getModifierMagnitude(essenceItem.name, statKey)`
- Template reference `getMagnitudeForStat(affix.statKey)` unchanged — still works correctly

## Verification

1. `npx vue-tsc --noEmit` — no new errors introduced (pre-existing errors in other files unaffected)
2. `HP_MANA_MAGNITUDE` does not appear in CraftingModal.vue — PASS
3. `getModifierMagnitude` exported from useCrafting.ts — PASS
4. `getModifierMagnitude` imported and used in CraftingModal.vue — PASS
5. `ESSENCE_MAGNITUDES` still present in useCrafting.ts — PASS
6. No server-side files modified — PASS

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `src/composables/useCrafting.ts` — modified, exports `getModifierMagnitude`
- `src/components/CraftingModal.vue` — modified, imports `getModifierMagnitude`, no `HP_MANA_MAGNITUDE`
- Commit 151006f exists
- Commit eb8e3b9 exists
