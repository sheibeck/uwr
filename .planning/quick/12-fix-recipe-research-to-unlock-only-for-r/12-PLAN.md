---
phase: 12-fix-recipe-research-unlock-scoping
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/useCrafting.ts
autonomous: true
must_haves:
  truths:
    - "Recipes discovered by Character A do not appear in Character B's crafting panel"
    - "Character who researched a recipe still sees it correctly in their crafting panel"
    - "Crafting a recipe still works for the character who discovered it"
  artifacts:
    - path: "src/composables/useCrafting.ts"
      provides: "Character-scoped recipe discovery filtering"
      contains: "characterId"
  key_links:
    - from: "src/composables/useCrafting.ts"
      to: "recipeDiscovered rows"
      via: "characterId filter in discoveredRecipeIds computed"
      pattern: "characterId.*selectedCharacter"
---

<objective>
Fix recipe research to scope unlocks per-character instead of globally.

Purpose: Currently `discoveredRecipeIds` in `useCrafting.ts` builds a Set from ALL `RecipeDiscovered` rows regardless of character, making recipes discovered by one character visible to all characters. The backend is already correct (inserts with `characterId` and filters by character), but the client-side computed property does not filter by the selected character's ID.

Output: Fixed `useCrafting.ts` where `discoveredRecipeIds` filters by `selectedCharacter.value.id`.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/composables/useCrafting.ts
@spacetimedb/src/reducers/items.ts (lines 677-760 for backend reference — already correct)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Filter discoveredRecipeIds by selected character</name>
  <files>src/composables/useCrafting.ts</files>
  <action>
In `src/composables/useCrafting.ts`, the `discoveredRecipeIds` computed (lines 42-44) currently reads:

```typescript
const discoveredRecipeIds = computed(() =>
  new Set(recipeDiscovered.value.map((row) => row.recipeTemplateId.toString()))
);
```

This does NOT filter by the selected character. Fix it to:

```typescript
const discoveredRecipeIds = computed(() => {
  const charId = selectedCharacter.value?.id;
  if (!charId) return new Set<string>();
  return new Set(
    recipeDiscovered.value
      .filter((row) => row.characterId.toString() === charId.toString())
      .map((row) => row.recipeTemplateId.toString())
  );
});
```

This ensures only recipes discovered by the currently selected character are shown in the crafting panel. The `.toString()` comparison pattern is consistent with how `ownedInstances` (line 28) and other BigInt comparisons work throughout this file.

No other files need changes — the backend `research_recipes` reducer already correctly inserts with `characterId` and the `craft_recipe` reducer already validates per-character ownership.
  </action>
  <verify>
1. Read `src/composables/useCrafting.ts` and confirm `discoveredRecipeIds` filters by `selectedCharacter.value.id`
2. Confirm the filter uses `.characterId.toString() === charId.toString()` pattern consistent with the rest of the file
3. Run `npx tsc --noEmit` (or the project's type check command) to verify no type errors
  </verify>
  <done>
The `discoveredRecipeIds` computed property filters `recipeDiscovered` rows by the selected character's ID, so recipes discovered by Character A no longer appear for Character B.
  </done>
</task>

</tasks>

<verification>
- TypeScript compiles without errors
- The `discoveredRecipeIds` computed filters by `selectedCharacter.value.id`
- No other recipe/crafting logic was changed (backend was already correct)
</verification>

<success_criteria>
Recipe discoveries are scoped per-character on the client: switching characters shows only that character's discovered recipes in the crafting panel.
</success_criteria>

<output>
After completion, create `.planning/quick/12-fix-recipe-research-to-unlock-only-for-r/12-SUMMARY.md`
</output>
