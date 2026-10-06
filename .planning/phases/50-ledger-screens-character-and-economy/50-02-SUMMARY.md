---
phase: 50-ledger-screens-character-and-economy
plan: 02
subsystem: spacetimedb
tags: [spacetimedb, crafting, game-data, validate-before-mutate]

requires:
  - phase: 50-01
    provides: "shared import-free data module pattern with source pins"
provides:
  - "spacetimedb/src/data/crafting_rules.ts: itemKeyFromName, craftQualityForMaterialName, craftQualityUpgrade, isGearRecipe, planCraft"
  - "craft_recipe refuses before it mutates; a refused craft costs nothing"
affects: [50-09 publish, 50-21 crafting screen]

tech-stack:
  added: []
  patterns:
    - "One pure plan function decides every refusal; the reducer calls it before any mutation and the client reuses it to pre-gate the button"

key-files:
  created:
    - spacetimedb/src/data/crafting_rules.test.ts
    - spacetimedb/src/reducers/craft_quality.test.ts
  modified:
    - spacetimedb/src/data/crafting_rules.ts
    - spacetimedb/src/reducers/items_crafting.ts

key-decisions:
  - "craft_recipe validate-before-mutate fixed in Phase 50 (owner decision after research, 2026-10-06); code only, no schema change"
  - "planCraft keeps the reducer's order: materials, essence tier, catalyst on hand, reagents (sliced to the quality's slots, then unknown names skipped), at least one valid reagent"
  - "Single deterministic craft quality; no odds bar, no randomness"

requirements-completed: [LDG-10, LDG-11]

status: complete
duration: 15min
completed: 2026-10-06
---

# Phase 50 Plan 02: planCraft and craft_recipe validate-before-mutate Summary

`craft_recipe` now plans the whole craft with the pure `planCraft` before it removes or adds anything, so a too-weak essence, a missing essence, a missing reagent or an essence with no valid reagent no longer eats the player's inputs; successful crafts consume and produce exactly what they did before.

## planCraft contract (Plan 21 maps the reason codes to UI copy)

```ts
interface CraftPlanInput {
  recipe: { req1TemplateId: bigint; req1Count: bigint; req2TemplateId: bigint; req2Count: bigint;
            req3TemplateId?: bigint | null; req3Count?: bigint | null; recipeType?: string | null };
  primaryMaterialName: string | null;          // first requirement's template name
  catalyst: { templateId: bigint; name: string } | null;   // missing template: name ''
  modifiers: ReadonlyArray<{ templateId: bigint; name: string | null }>;  // slot order, null slots dropped
  countOf: (templateId: bigint) => bigint;     // non-equipped count on hand
}
type CraftPlan =
  | { ok: true; gear: boolean; quality: string | null;
      consumes: { templateId: bigint; count: bigint }[];      // merged per templateId
      usesCatalyst: boolean;
      reagents: { templateId: bigint; statKey: string; magnitude: bigint }[] }
  | { ok: false; reason: 'materials' | 'essence_tier' | 'catalyst_missing' | 'modifier_missing' | 'no_reagent';
      message: string; templateId?: bigint; have?: bigint; need?: bigint };
planCraft(input: CraftPlanInput): CraftPlan
```

Reason codes and the exact server messages:

| reason | message |
|--------|---------|
| materials | `Missing materials to craft this recipe.` (also names templateId, have, need) |
| essence_tier | `Essence tier too low for this craft quality` |
| catalyst_missing | `Missing catalyst (Essence)` |
| modifier_missing | `Missing modifier: {name}` |
| no_reagent | `Must provide at least one reagent when using an Essence` |

Other exports: `itemKeyFromName(name)`, `craftQualityForMaterialName(name)` (T1 standard, T2 reinforced, T3 exquisite, unknown standard), `craftQualityUpgrade(quality)` (`{ materialTier, quality }` or `null` at exquisite or off the ladder), `isGearRecipe(recipe)`.

## Task Commits

1. Task 1: quality helpers and pure planCraft: `9ff38a15`
2. Task 2: craft_recipe validates before it mutates (real-handler tests): `3386e9f6`

Tests are in the same commit as the code per task. The refusal tests were run against the old reducer first and five failed (inputs consumed), then passed after the reorder.

## Test counts

- `data/crafting_rules.test.ts`: 21 tests (every behavior line plus the import-specifier pin and a prototype-key catalyst name).
- `reducers/craft_quality.test.ts`: 20 tests (8 quality-parity cases across T1, T2, T3 and an unknown material for a weapon and an armor output; essence success parity; 6 refusals that leave inventory, affixes and gold unchanged; consumable and no-essence cases; station, recipe-not-found and not-discovered).
- Both files pass together with `--maxWorkers=1` (41 tests).

## Deviations from Plan

None to the plan's scope.

Behavior differences found while reordering (successful crafts: none):

- A gear recipe with an essence chosen whose output instance cannot be found afterwards (not reachable for non-stackable gear) used to skip the essence step silently; it now follows the plan's refusals first. A gear recipe whose output template is missing already threw in `addItemToInventory` (a clean rollback), so nothing changed there.
- `planCraft` ignores an unknown or prototype-named essence safely (guarded own-property lookup, so `constructor` no longer reads a function); the reducer's old code would have thrown on that name.

`research_recipes`, `learn_recipe_scroll` and `salvage_item` are untouched; `research_recipes` keeps its inline gear-recipe test.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

- FOUND: spacetimedb/src/data/crafting_rules.test.ts, spacetimedb/src/reducers/craft_quality.test.ts
- FOUND commits: 9ff38a15, 3386e9f6
- `git diff --stat spacetimedb/src/schema` empty
