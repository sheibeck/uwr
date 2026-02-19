---
phase: quick-193
plan: 01
subsystem: items/tooltips
tags: [items, tooltips, descriptions, refactor, composables]
dependency_graph:
  requires: []
  provides:
    - src/composables/useItemTooltip.ts
    - spacetimedb/src/seeding/ensure_items.ts (descriptions)
    - spacetimedb/src/data/crafting_materials.ts (descriptions)
  affects:
    - src/composables/useInventory.ts
    - src/composables/useCombat.ts
    - src/composables/useCrafting.ts
    - src/App.vue
tech_stack:
  added: []
  patterns:
    - Pure function buildItemTooltipData as single source of truth for tooltip construction
    - Infer<typeof RowType> pattern for SpacetimeDB row typing
key_files:
  created:
    - src/composables/useItemTooltip.ts
  modified:
    - spacetimedb/src/seeding/ensure_items.ts
    - spacetimedb/src/data/crafting_materials.ts
    - src/composables/useInventory.ts
    - src/composables/useCombat.ts
    - src/composables/useCrafting.ts
    - src/App.vue
decisions:
  - "Description comes exclusively from server ItemTemplate.description — no client-side fallbacks"
  - "buildItemTooltipData is a pure function (not a reactive composable) for predictable reuse"
  - "Used Infer<typeof RowType> pattern for SpacetimeDB row types in useItemTooltip.ts"
metrics:
  duration: ~90 minutes (continuation from previous session)
  completed: "2026-02-19"
  tasks_completed: 3
  files_modified: 8
---

# Phase quick-193 Plan 01: Add Descriptions to All Item Templates Summary

## One-Liner

Added unique description text to all 142 item template seeds on the server and unified all 5 client tooltip code paths into a single `buildItemTooltipData` pure function in `useItemTooltip.ts`, eliminating duplicate `WELL_FED_BUFF_LABELS` maps and client-side description fallback logic.

## What Was Built

### Task 1: Server-Side Item Descriptions

Added `description` strings to every item template seeded in `ensure_items.ts` (142 total) and added `description?` field to `MaterialDef` interface in `crafting_materials.ts`.

Coverage by seeding function:
- `ensureStarterItemTemplates`: 12 starter armor (by type), 8 weapons, 5 accessories, 4 junk items
- `ensureWorldDropGearTemplates`: 8 T1 weapons, 8 T2 weapons, 12 T1 armor, 12 T2 armor
- `ensureWorldDropJewelryTemplates`: 6 T1 jewelry, 4 T2 jewelry, 3 T1 cloaks, 2 T2 cloaks
- `ensureResourceItemTemplates`: 20 resources, 1 Bandage, 9 crafted consumables
- `ensureFoodItemTemplates`: 5 food items
- `ensureGearMaterialItemTemplates`: 13 materials (via `mat.description` from MATERIAL_DEFS)
- `ensureCraftingModifierItemTemplates`: 9 modifier items (via `mod.description` from CRAFTING_MODIFIER_DEFS)
- `ensureRecipeScrollItemTemplates`: generated description: "Teaches the {recipe} crafting recipe when used."
- `ensureCraftingBaseGearTemplates`: 18 base gear items (Iron Helm, Chain Coif, Plate Vambraces, etc.)

### Task 2: Shared useItemTooltip Composable

Created `src/composables/useItemTooltip.ts` with:
- `buildItemTooltipData()` — pure function accepting template + optional instance/affixes/affixDataJson
- `formatAffixStatKey()` — moved from useInventory.ts and useCombat.ts
- `ItemTooltipData` type — shared return type used by all 5 tooltip paths
- `TooltipStatLine` and `TooltipAffixLine` types — for stats and affix display

Migrated all 5 tooltip code paths:
1. `useInventory.ts` — `inventoryItems` computed uses `buildItemTooltipData` with full affix data
2. `useInventory.ts` — `equippedSlots` computed uses `buildItemTooltipData` with equipped affixes
3. `useCombat.ts` — `activeLoot` computed uses `buildItemTooltipData`
4. `useCombat.ts` — `pendingLoot` computed uses `buildItemTooltipData` with `affixDataJson`
5. `App.vue` — `vendorItems` computed uses `buildItemTooltipData` with price line
6. `useCrafting.ts` — `outputItem` uses `buildItemTooltipData`

Removed:
- `WELL_FED_BUFF_LABELS` from `useInventory.ts`
- `foodDescription` IIFE from `useInventory.ts`
- `WELL_FED_BUFF_LABELS_VENDOR` from `App.vue`
- `vendorFoodDesc` IIFE from `App.vue`
- `formatAffixStatKeyInv` from `useInventory.ts`
- `formatAffixStatKey` from `useCombat.ts`
- Inline description/stats building logic from all 5 code paths

### Task 3: Module Publish and Bindings

- Published module: `spacetime publish uwr --project-path spacetimedb` — no errors
- Regenerated bindings: `spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb`
- Server logs show clean "Database updated" with no seeding errors

## Commits

- `df5a5a3` — Task 1 server-side description additions (bundled with quick-195 tier-gate changes)
- `b958ff6` — Task 2: create useItemTooltip composable and migrate all 5 tooltip paths
- `57f1a9f` — Task 3: publish module, regenerate bindings, fix Infer type imports

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript import pattern for SpacetimeDB Row types**
- **Found during:** Task 3 build check
- **Issue:** `useItemTooltip.ts` used `import type { ItemTemplateRow }` but Row exports are values (class instances), not types. TypeScript TS2749 error.
- **Fix:** Changed to `import { ItemTemplateRow, ItemAffixRow } from '../module_bindings'` and used `Infer<typeof ItemTemplateRow>` for type annotations. Same pattern used in `useInventory.ts`.
- **Files modified:** `src/composables/useItemTooltip.ts`, `src/composables/useInventory.ts`
- **Commit:** `57f1a9f`

**2. Pre-existing TypeScript build errors (not introduced by this task)**
- The client build was already failing before this task with TS2749 errors in `useTrade.ts`, `useMovement.ts`, `useAuth.ts`, `useCommands.ts`, `useEvents.ts`, `useFriends.ts`, `useGroups.ts`, `useHotbar.ts`, `usePlayer.ts` — all using the same `type CharacterRow` pattern.
- These are out-of-scope pre-existing issues. None were introduced by this task.
- Deferred to future cleanup task.

## Verification Results

1. `description:` count in ensure_items.ts: **142** (target: 140+) — PASS
2. `description:` count in crafting_materials.ts: **13** MATERIAL_DEFS entries with descriptions — PASS
3. `WELL_FED_BUFF_LABELS` in useInventory.ts: **0** matches — PASS
4. `WELL_FED_BUFF_LABELS_VENDOR` in App.vue: **0** matches — PASS
5. `foodDescription` in useInventory.ts: **0** matches — PASS
6. `buildItemTooltipData` in useInventory.ts, useCombat.ts, useCrafting.ts: **present in all** — PASS
7. `buildItemTooltipData` in App.vue: **present** — PASS
8. Server logs: **"Database updated"** with no seeding errors — PASS

## Self-Check: PASSED

- `src/composables/useItemTooltip.ts` exists: FOUND
- `b958ff6` commit exists: FOUND
- `57f1a9f` commit exists: FOUND
- 142 descriptions in ensure_items.ts: CONFIRMED
