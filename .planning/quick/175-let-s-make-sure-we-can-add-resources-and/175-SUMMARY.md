---
phase: quick-175
plan: "01"
subsystem: seeding
tags: [seeding, upsert, idempotency, ensure_items]
dependency_graph:
  requires: []
  provides: [idempotent-item-seeding]
  affects: [spacetimedb/src/seeding/ensure_items.ts]
tech_stack:
  added: []
  patterns: [find-or-insert + update upsert, local upsert helper function]
key_files:
  modified:
    - spacetimedb/src/seeding/ensure_items.ts
decisions:
  - "Used local upsertResourceByName helper in ensureResourceItemTemplates (mirrors ensureStarterItemTemplates pattern) to avoid repetition across 3 loops"
  - "Inline find+update+continue pattern in ensureGearMaterialItemTemplates, ensureCraftingModifierItemTemplates, ensureRecipeScrollItemTemplates for simplicity"
metrics:
  duration: "~3min"
  completed: "2026-02-18"
  tasks: 2
  files: 1
---

# Phase quick-175 Plan 01: Convert Insert-Only Seeding to Upsert Pattern Summary

Convert 4 insert-only seeding functions in ensure_items.ts to proper upsert (find-or-insert + update) so adding new resources, materials, modifier reagents, or recipe scrolls works cleanly on `spacetime publish` without `--clear-database`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Convert 4 insert-only seeding functions to upsert pattern | df869dd | spacetimedb/src/seeding/ensure_items.ts |
| 2 | Publish module and verify no duplicate seeding | (publish) | — |

## What Was Done

### Task 1

Converted all 4 previously insert-only seeding functions to proper upsert patterns:

1. **ensureResourceItemTemplates**: Extracted a local `upsertResourceByName` helper (mirrors `ensureStarterItemTemplates` pattern). Applied to all 3 loops: resources array (20 items), Bandage single-item, and craftItems array (9 items). Old pattern was `if (findItemTemplateByName...) continue; ctx.db.itemTemplate.insert(...)`.

2. **ensureGearMaterialItemTemplates**: Inline upsert — builds `fullRow`, calls `findItemTemplateByName`, if exists calls `ctx.db.itemTemplate.id.update({ ...existing, ...fullRow, id: existing.id })`, else inserts.

3. **ensureCraftingModifierItemTemplates**: Same inline upsert pattern for all CRAFTING_MODIFIER_DEFS entries.

4. **ensureRecipeScrollItemTemplates**: Same inline upsert pattern for all GEAR_RECIPE_NAMES scroll entries.

### Task 2

Published module with `spacetime publish uwr --project-path spacetimedb` (no `--clear-database`). Server logs confirmed clean "Database updated" with no duplicate key or insert errors.

## Verification

- No `if (findItemTemplateByName` guard pattern remains in ensure_items.ts (confirmed via grep)
- TypeScript errors in ensure_items.ts are all pre-existing in `ensureWorldDropGearTemplates` (unrelated to this task)
- Module published successfully without `--clear-database`
- Server logs show no seeding errors

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- File modified: `spacetimedb/src/seeding/ensure_items.ts` — EXISTS
- Commit df869dd — EXISTS (confirmed via git log)
- Module published successfully — CONFIRMED via spacetime publish exit 0 and clean server logs
