---
phase: quick-184
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/CraftingPanel.vue
  - src/App.vue
autonomous: true
must_haves:
  truths:
    - "CraftingPanel displays a Discover Recipes button when a character is selected"
    - "Clicking Discover Recipes calls the research_recipes reducer and discovers any recipes the player has materials for"
    - "Button is disabled during combat and when not at a crafting station"
  artifacts:
    - path: "src/components/CraftingPanel.vue"
      provides: "Discover Recipes button and research emit"
      contains: "Discover Recipes"
    - path: "src/App.vue"
      provides: "Wiring of @research emit to onResearchRecipes handler"
      contains: "@research"
  key_links:
    - from: "src/components/CraftingPanel.vue"
      to: "src/App.vue"
      via: "research emit"
      pattern: "\\$emit\\('research'\\)"
    - from: "src/App.vue"
      to: "src/composables/useCrafting.ts"
      via: "onResearchRecipes -> researchRecipes()"
      pattern: "researchRecipes\\(\\)"
---

<objective>
Restore the "Discover Recipes" button to CraftingPanel that was lost during the Phase 13 Plan 03 UI refactor.

Purpose: Players cannot discover consumable, bandage, food, and other non-gear recipes without this button. The backend reducer (research_recipes), the composable function (useCrafting.research), and the App.vue handler (onResearchRecipes) all still exist -- only the UI button and its event wiring were dropped.

Output: CraftingPanel shows a "Discover Recipes" button that calls the existing research_recipes reducer.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/CraftingPanel.vue
@src/composables/useCrafting.ts
@src/App.vue (lines 182-187 for CraftingPanel usage, lines 1675-1701 for crafting setup)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Restore Discover Recipes button and wire emit</name>
  <files>src/components/CraftingPanel.vue, src/App.vue</files>
  <action>
In CraftingPanel.vue:
1. Add a `(e: 'research'): void` entry to the existing defineEmits type.
2. Add a "Discover Recipes" button in the template, placed ABOVE the filter chips div (after the combatLocked/craftingAvailable messages, before the filter chips). Use the same button styling pattern as the original: `styles.ghostButton` style (matching the pre-refactor pattern). The button should:
   - `@click="$emit('research')"`
   - Be disabled when `!craftingAvailable || combatLocked`
   - Apply `styles.disabledButton` spread when disabled (same pattern as the Craft button)
   - Text: "Discover Recipes"

In App.vue:
1. Find the CraftingPanel usage around line 185. Add `@research="onResearchRecipes"` to the CraftingPanel component binding. The `onResearchRecipes` handler already exists at line 1698 and is fully functional -- no changes needed to the script section.

Note: Do NOT modify useCrafting.ts or any backend files -- the entire chain from composable through reducer is already intact. Only the button and emit wiring were lost.

Check if `styles.ghostButton` still exists in the styles object. If not, use inline styling consistent with the existing button patterns in the panel: `{ padding: '4px 12px', fontSize: '12px', border: '1px solid #555', borderRadius: '3px', background: '#2a2a2a', color: '#ccc', cursor: 'pointer', marginBottom: '8px' }`.
  </action>
  <verify>
1. `npx vue-tsc --noEmit` passes (or at minimum, no NEW errors in CraftingPanel.vue or App.vue)
2. Grep confirms: `grep -n "Discover Recipes" src/components/CraftingPanel.vue` returns the button line
3. Grep confirms: `grep -n "@research" src/App.vue` returns the event binding line
  </verify>
  <done>CraftingPanel renders a "Discover Recipes" button that emits the research event, App.vue routes it to onResearchRecipes which calls the existing research_recipes reducer. Button is disabled during combat and when not at a crafting station.</done>
</task>

</tasks>

<verification>
- CraftingPanel.vue contains "Discover Recipes" button with @click="$emit('research')"
- CraftingPanel.vue defineEmits includes 'research' event
- App.vue CraftingPanel binding includes @research="onResearchRecipes"
- No TypeScript compilation errors introduced
</verification>

<success_criteria>
The Discover Recipes button is visible in the crafting panel and clicking it triggers recipe discovery for any recipes the player has materials for (consumables, bandages, food, etc.).
</success_criteria>

<output>
After completion, create `.planning/quick/184-restore-discover-recipes-button-in-craft/184-SUMMARY.md`
</output>
