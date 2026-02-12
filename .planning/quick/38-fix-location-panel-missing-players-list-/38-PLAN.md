---
phase: quick-38
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/LocationGrid.vue
  - src/composables/useCharacters.ts
autonomous: true

must_haves:
  truths:
    - "Location panel always shows a PLAYERS section with count, even when no other players are present"
    - "Other active players at the same location appear as clickable tiles in the PLAYERS section"
    - "The user's own non-selected characters at the same location also appear in the list"
  artifacts:
    - path: "src/components/LocationGrid.vue"
      provides: "Always-visible PLAYERS section in location grid"
    - path: "src/composables/useCharacters.ts"
      provides: "charactersHere computed that includes user's own non-selected characters"
  key_links:
    - from: "src/composables/useCharacters.ts"
      to: "src/components/LocationGrid.vue"
      via: "charactersHere prop"
      pattern: "charactersHere"
---

<objective>
Fix the location panel to always display a PLAYERS section showing characters at the current location.

Purpose: The CHARACTERS section in LocationGrid.vue is hidden when `charactersHere` is empty (v-if guard). In practice, `charactersHere` is often empty because: (1) it excludes the user's own selected character, (2) it excludes the user's own non-selected characters, and (3) it requires other players to be online with active characters at the same location. The section should always be visible (like ENEMIES and RESOURCES sections when they have items) and should include the user's own non-selected characters who are at the same location.

Output: A location panel that always shows a PLAYERS section listing all characters at the current location (excluding only the selected character).
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/components/LocationGrid.vue
@src/composables/useCharacters.ts
@src/App.vue (lines 326-340 for LocationGrid usage, lines 570-590 for useCharacters destructuring)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix charactersHere to include user's own non-selected characters</name>
  <files>src/composables/useCharacters.ts</files>
  <action>
The current `charactersHere` computed (line 101-110) filters characters to only show OTHER players' active characters at the same location, which means:
- The user's own non-selected characters at the same location are excluded
- Solo players see no characters at all

Fix the `charactersHere` computed to include ALL characters at the same location EXCEPT the currently selected character. Specifically:

1. In the `charactersHere` computed (around line 101), change the filter to:
   - Keep: `row.locationId === selectedCharacter.value?.locationId` (same location)
   - Keep: `row.id !== selectedCharacter.value?.id` (not the selected character)
   - REMOVE the third condition that requires `activeCharacterIds.value.has(row.id.toString()) || pendingIds.has(row.id.toString())`. This condition was excluding offline characters and the user's own non-active characters.

2. Instead, update `charactersHereWithStatus` (around line 112) to mark the `disconnected` property more accurately:
   - A character is "disconnected" if it does NOT have an entry in `activeCharacterIds` AND is NOT in `pendingLogoutIds`
   - This keeps the visual indicator for disconnected characters while still showing them

The result: all characters at the location (except the selected one) will appear. Active players' characters show normally, disconnected/idle characters show with the disconnected dot indicator.
  </action>
  <verify>
Run `npx vue-tsc --noEmit` from the project root to confirm no TypeScript errors. Verify the `charactersHere` computed no longer filters out the user's own non-selected characters.
  </verify>
  <done>
The `charactersHere` computed returns all characters at the same location as the selected character (excluding only the selected character itself). Characters without an active player session are marked as disconnected.
  </done>
</task>

<task type="auto">
  <name>Task 2: Make CHARACTERS section always visible in LocationGrid</name>
  <files>src/components/LocationGrid.vue</files>
  <action>
Currently the CHARACTERS section (line 94) has `v-if="charactersHere.length > 0"` which hides the entire section when empty. Change this to always show the section (matching the user's expectation that the players list is a permanent feature of the location panel).

1. Remove the `v-if="charactersHere.length > 0"` condition on the CHARACTERS wrapper div (line 94). The section should always render.

2. Rename the section label from "CHARACTERS" to "PLAYERS" for clarity (line 95): `PLAYERS ({{ charactersHere.length }})`

3. Add an empty state message inside the section when `charactersHere.length === 0`:
   ```html
   <div v-if="charactersHere.length === 0" :style="{ fontSize: '0.75rem', opacity: 0.4, padding: '0.2rem 0' }">
     No other adventurers here.
   </div>
   ```

4. Update the empty state condition at the top of the template (lines 5-13) to remove `charactersHere.length === 0` from the conjunction, since the PLAYERS section now always shows. The empty state should only trigger when enemies, resources, characters, AND NPCs are all empty (but since PLAYERS always shows, this empty state effectively only fires when enemies + resources + NPCs are all empty AND the players section shows "No other adventurers").

   Actually, since the PLAYERS section now always renders, remove `charactersHere.length === 0` from the top-level empty state check entirely. The top-level "Nothing of interest here" should only show if there are no enemies, no resources, no NPCs, AND no other characters. If there ARE other characters, the PLAYERS section handles them. If there are NO other characters, the PLAYERS section shows "No other adventurers here" which is sufficient.
  </action>
  <verify>
Run `npx vue-tsc --noEmit` to confirm no TypeScript errors. Read the modified LocationGrid.vue to confirm the PLAYERS section renders unconditionally with an empty state message.
  </verify>
  <done>
The location panel always displays a PLAYERS section. When other characters are present, they appear as clickable tiles. When no other characters are at the location, it shows "No other adventurers here."
  </done>
</task>

</tasks>

<verification>
1. `npx vue-tsc --noEmit` passes with no errors
2. LocationGrid.vue has a PLAYERS section that renders without a v-if guard
3. useCharacters.ts `charactersHere` computed includes all characters at the location except the selected one
4. The empty state message renders when no other characters are present
</verification>

<success_criteria>
- The location panel always shows a "PLAYERS (N)" section
- Other players' active characters at the same location appear as tiles
- The user's own non-selected characters at the same location appear as tiles (with disconnected indicator if not active)
- When alone, the section shows "No other adventurers here" instead of disappearing
</success_criteria>

<output>
After completion, create `.planning/quick/38-fix-location-panel-missing-players-list-/38-SUMMARY.md`
</output>
