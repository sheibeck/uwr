---
phase: quick-314
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.vue
autonomous: true
requirements: [QUICK-314]
must_haves:
  truths:
    - "When a race tile is clicked on the character creation screen, the race description text appears in the info panel below the tiles"
    - "Race bonuses, penalties, and level bonus info also display correctly alongside the description"
  artifacts:
    - path: "src/App.vue"
      provides: "Correct prop name binding between composable return and CharacterPanel"
  key_links:
    - from: "src/composables/useCharacterCreation.ts"
      to: "src/App.vue"
      via: "destructured return value"
      pattern: "selectedRace"
    - from: "src/App.vue"
      to: "src/components/CharacterPanel.vue"
      via: "prop binding :selected-race"
      pattern: ":selected-race="
---

<objective>
Fix race description (and entire race info panel) not showing on the character creation screen.

Purpose: The race info panel (description, bonuses, penalties, level bonus) is invisible when selecting a race because of a prop name mismatch between the composable, App.vue, and CharacterPanel.vue.

Output: Race info panel displays correctly when a race tile is clicked.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/composables/useCharacterCreation.ts
@src/App.vue
@src/components/CharacterPanel.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix prop name mismatch between useCharacterCreation, App.vue, and CharacterPanel</name>
  <files>src/App.vue</files>
  <action>
The bug is a two-part naming mismatch:

1. `useCharacterCreation.ts` returns `selectedRace` (line 105)
2. `App.vue` destructures it as `selectedRaceRow` (line 889) — WRONG, should be `selectedRace`
3. `App.vue` passes `:selected-race-row="selectedRaceRow"` (line 45) — prop name `selectedRaceRow`
4. `CharacterPanel.vue` expects prop `selectedRace` (line 131) — never receives it because App passes `selectedRaceRow`

Result: `selectedRaceRow` in App.vue is always `undefined` (composable has no such key), and even if it weren't, the prop name doesn't match what CharacterPanel expects.

Fix in `src/App.vue` only (two changes):

A. Line 889: Change `selectedRaceRow,` to `selectedRace,` in the destructuring of `useCharacterCreation()` return value.

B. Line 45: Change `:selected-race-row="selectedRaceRow"` to `:selected-race="selectedRace"` in the CharacterPanel template binding.

Do NOT modify `useCharacterCreation.ts` or `CharacterPanel.vue` — they are already correct and consistent with each other. The bug is entirely in App.vue using the wrong names.
  </action>
  <verify>
1. Run `npx vue-tsc --noEmit` to confirm no type errors.
2. Visually confirm: the `selectedRace` destructure matches the composable's return key, and the `:selected-race` prop matches CharacterPanel's `selectedRace` prop definition.
  </verify>
  <done>
Selecting a race tile on the character creation screen shows the race info panel with description, bonuses, penalties, and level bonus text.
  </done>
</task>

</tasks>

<verification>
- The prop name chain is consistent: composable returns `selectedRace` -> App.vue destructures `selectedRace` -> App.vue passes `:selected-race` -> CharacterPanel receives `selectedRace` prop.
- The `v-if="selectedRace"` guard in CharacterPanel.vue (line 31) now receives a truthy value when a race is selected.
</verification>

<success_criteria>
Race info panel (description, stat bonuses, penalties, level bonus, available classes) is visible after clicking any race tile on the character creation screen.
</success_criteria>

<output>
After completion, create `.planning/quick/314-fix-race-description-not-showing-on-char/314-SUMMARY.md`
</output>
