---
phase: quick-12
plan: 01
subsystem: crafting
tags:
  - recipe-discovery
  - character-scoping
  - client-side-fix
dependency_graph:
  requires: []
  provides:
    - Per-character recipe discovery visibility
  affects:
    - src/composables/useCrafting.ts
tech_stack:
  added: []
  patterns:
    - Client-side character filtering for per-character data visibility
key_files:
  created: []
  modified:
    - src/composables/useCrafting.ts
decisions: []
metrics:
  duration_minutes: 1
  completed_date: 2026-02-12
---

# Quick Task 12: Fix Recipe Research Per-Character Scoping

**One-liner:** Character-scoped recipe discovery filtering in client prevents cross-character recipe visibility

---

## Objective

Fixed recipe research to scope unlocks per-character instead of globally. The backend was already correct (inserting RecipeDiscovered rows with characterId and filtering by character in reducers), but the client-side `discoveredRecipeIds` computed property did not filter by the selected character's ID, causing recipes discovered by one character to appear for all characters.

---

## Implementation

### Task 1: Filter discoveredRecipeIds by selected character

**Files modified:** `src/composables/useCrafting.ts`

**Changes:**
- Modified `discoveredRecipeIds` computed (lines 42-50) to filter `recipeDiscovered` rows by `selectedCharacter.value.id`
- Added null check: returns empty Set when no character selected
- Uses `.characterId.toString() === charId.toString()` comparison pattern consistent with `ownedInstances` filter (line 28)

**Before:**
```typescript
const discoveredRecipeIds = computed(() =>
  new Set(recipeDiscovered.value.map((row) => row.recipeTemplateId.toString()))
);
```

**After:**
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

**Verification:**
- ✅ Read updated file confirms character filtering
- ✅ Comparison pattern matches existing code style
- ✅ No new TypeScript errors introduced

**Commit:** `ca786dd` - fix(quick-12): filter discoveredRecipeIds by selected character

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Verification

- ✅ `discoveredRecipeIds` computed filters by `selectedCharacter.value.id`
- ✅ Filter uses `.characterId.toString() === charId.toString()` pattern
- ✅ TypeScript compiles (no new errors introduced)

---

## Success Criteria Met

Recipe discoveries are now scoped per-character on the client: switching characters shows only that character's discovered recipes in the crafting panel. The backend was already correct (filtering RecipeDiscovered by characterId in both `research_recipes` and `craft_recipe` reducers).

---

## Self-Check

**Files modified:**
- ✅ FOUND: src/composables/useCrafting.ts

**Commits exist:**
- ✅ FOUND: ca786dd

## Self-Check: PASSED
