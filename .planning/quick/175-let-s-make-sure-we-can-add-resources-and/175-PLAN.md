---
phase: quick-175
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/seeding/ensure_items.ts
autonomous: true
must_haves:
  truths:
    - "Adding new resource/material/modifier/scroll item templates and re-publishing without --clear-database creates the new rows without duplicating existing ones"
    - "Changing vendorValue or other fields on existing seeded items propagates on re-publish without --clear-database"
    - "All seeding functions in ensure_items.ts use upsert (find-or-insert + update) pattern consistently"
  artifacts:
    - path: "spacetimedb/src/seeding/ensure_items.ts"
      provides: "Upsert pattern for all 4 insert-only seeding functions"
  key_links:
    - from: "spacetimedb/src/seeding/ensure_items.ts"
      to: "spacetimedb/src/seeding/ensure_content.ts syncAllContent"
      via: "function export/import"
      pattern: "ensure(Resource|GearMaterial|CraftingModifier|RecipeScroll)"
---

<objective>
Convert 4 insert-only seeding functions in ensure_items.ts to proper upsert patterns so that adding new resources, materials, modifier reagents, or recipe scrolls works cleanly on `spacetime publish` without `--clear-database`.

Purpose: All other seeding functions already use upsert. These 4 use a "skip if exists" pattern that prevents duplicates but won't update existing rows if seed data changes. Converting them to full upsert makes the entire seeding pipeline consistent and future-proof.

Output: Updated ensure_items.ts with all 4 functions using find-or-insert + update pattern.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/seeding/ensure_items.ts
@spacetimedb/src/seeding/ensure_enemies.ts (reference for correct upsert patterns)
@spacetimedb/src/seeding/ensure_content.ts (syncAllContent call order)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Convert 4 insert-only seeding functions to upsert pattern</name>
  <files>spacetimedb/src/seeding/ensure_items.ts</files>
  <action>
Convert these 4 functions from "skip if exists" to proper upsert (find-or-insert + update):

1. **ensureResourceItemTemplates** (line ~1260-1386):
   - Currently: `if (findItemTemplateByName(ctx, resource.name)) continue;` then raw `ctx.db.itemTemplate.insert(...)`.
   - Change to: Find existing row, if exists update with spread `{ ...existing, ...fullRow, id: existing.id }`, else insert.
   - Apply to ALL 3 loops in this function: the `resources` array, the `Bandage` single item, and the `craftItems` array.
   - Follow the same pattern used in `ensureStarterItemTemplates` (lines 76-98): define a local `upsertItemTemplateByName` helper or inline the pattern.

2. **ensureGearMaterialItemTemplates** (line ~1660-1692):
   - Currently: `if (findItemTemplateByName(ctx, mat.name)) continue;` then raw insert.
   - Change to: Find existing, if exists update (spread pattern), else insert.
   - This ensures that if a material's `vendorValue` or `tier` changes in MATERIAL_DEFS, the DB row gets updated on re-publish.

3. **ensureCraftingModifierItemTemplates** (line ~1800-1832):
   - Currently: `if (findItemTemplateByName(ctx, mod.name)) continue;` then raw insert.
   - Change to: Find existing, if exists update, else insert.

4. **ensureRecipeScrollItemTemplates** (line ~1840-1873):
   - Currently: `if (findItemTemplateByName(ctx, scrollName)) continue;` then raw insert.
   - Change to: Find existing, if exists update, else insert.

For all 4 functions, the upsert pattern is:
```typescript
const existing = findItemTemplateByName(ctx, name);
if (existing) {
  ctx.db.itemTemplate.id.update({ ...existing, ...fullRow, id: existing.id });
  return; // or continue
}
ctx.db.itemTemplate.insert({ id: 0n, ...fullRow });
```

Make sure to include ALL default field values (wellFedDurationMicros, wellFedBuffType, wellFedBuffMagnitude, weaponType, magicResistanceBonus) in the update spread so they don't get clobbered. The existing `ensureWorldDropGearTemplates` upsertByName helper (line 285-300) is the cleanest reference pattern.

Do NOT change any function signatures, exports, or the call order in syncAllContent.
  </action>
  <verify>
    1. Run `cd /c/projects/uwr/spacetimedb && npx tsc --noEmit` to confirm TypeScript compiles.
    2. Grep for raw `.insert({` calls in all 4 functions to confirm no insert-only paths remain (each should have a matching upsert guard).
    3. Confirm no `continue` guard pattern (the old `if (find...) continue;`) remains in these 4 functions.
  </verify>
  <done>
    All 4 seeding functions (ensureResourceItemTemplates, ensureGearMaterialItemTemplates, ensureCraftingModifierItemTemplates, ensureRecipeScrollItemTemplates) use find-or-insert + update upsert pattern. Adding new items or changing existing seed data on re-publish works without --clear-database.
  </done>
</task>

<task type="auto">
  <name>Task 2: Publish module and verify no duplicate seeding</name>
  <files></files>
  <action>
    Publish the module WITHOUT --clear-database to verify idempotent seeding works correctly:

    ```bash
    spacetime publish uwr --project-path spacetimedb
    ```

    If the publish succeeds without errors, the upsert changes are working. If there are compile errors, fix them first with `npx tsc --noEmit` in the spacetimedb directory.

    After publishing, check server logs for any errors:
    ```bash
    spacetime logs uwr --num-lines 50
    ```

    Look for any "duplicate key" or insert errors in the syncAllContent execution. There should be none.
  </action>
  <verify>
    1. `spacetime publish uwr --project-path spacetimedb` exits 0.
    2. `spacetime logs uwr --num-lines 50` shows no insert/duplicate errors.
  </verify>
  <done>
    Module publishes cleanly without --clear-database. Server logs show syncAllContent completes without errors. All seeding functions are confirmed idempotent.
  </done>
</task>

</tasks>

<verification>
- All 4 previously insert-only functions now use upsert pattern
- TypeScript compiles without errors
- Module publishes without --clear-database
- No duplicate rows or insert errors in server logs
</verification>

<success_criteria>
Every seeding function in ensure_items.ts uses a find-or-insert + update pattern. The module can be republished any number of times with `spacetime publish` (no --clear-database) and all seed data stays consistent with no duplicates.
</success_criteria>

<output>
After completion, create `.planning/quick/175-let-s-make-sure-we-can-add-resources-and/175-SUMMARY.md`
</output>
