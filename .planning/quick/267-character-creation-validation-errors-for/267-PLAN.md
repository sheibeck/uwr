---
phase: quick-267
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/useCharacterCreation.ts
  - src/components/CharacterPanel.vue
  - spacetimedb/src/reducers/characters.ts
autonomous: true
requirements: [CHAR-VALIDATION-267]

must_haves:
  truths:
    - "Clicking Create with no name shows: 'Character name must be at least 4 characters.'"
    - "Clicking Create with name < 4 chars shows: 'Character name must be at least 4 characters.'"
    - "Clicking Create with name ok but no race shows: 'You must select a race.'"
    - "Clicking Create with name+race but no class shows: 'You must select a class.'"
    - "All applicable validation errors are shown at once, not just the first one"
    - "Valid form with name >= 4 chars, race, and class proceeds to reducer call as before"
    - "Server rejects names shorter than 4 characters (trimmed)"
  artifacts:
    - path: "src/composables/useCharacterCreation.ts"
      provides: "Client-side validation logic producing error strings"
    - path: "src/components/CharacterPanel.vue"
      provides: "Create button always enabled when connActive; error list rendered near button"
    - path: "spacetimedb/src/reducers/characters.ts"
      provides: "Server enforces trimmed.length < 4"
  key_links:
    - from: "CharacterPanel.vue Create button"
      to: "useCharacterCreation.createCharacter()"
      via: "@create emit -> createCharacter()"
      pattern: "@create.*createCharacter"
    - from: "useCharacterCreation.ts"
      to: "createError ref"
      via: "validation populates createError before early return"
      pattern: "createError\\.value ="
---

<objective>
Add inline validation errors to character creation so users know exactly what is missing when they click Create.

Purpose: Currently the Create button is disabled when any field is invalid, giving no feedback about what's wrong. The server also allows names as short as 2 characters when the requirement is 4.
Output: Inline error messages below the name input; Create button always clickable when connection is active; server enforces 4-char minimum.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/composables/useCharacterCreation.ts
@src/components/CharacterPanel.vue
@spacetimedb/src/reducers/characters.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add client-side validation errors in useCharacterCreation.ts</name>
  <files>src/composables/useCharacterCreation.ts</files>
  <action>
In `createCharacter()`, replace the early-return guard `if (!connActive.value || userId.value == null || !isCharacterFormValid.value) return;` with explicit validation that collects all errors before returning.

Specific changes:
1. Remove `isCharacterFormValid` from the early-return guard — keep only the `!connActive.value || userId.value == null` check.
2. After that guard, build a `const errors: string[] = []` array:
   - If `newCharacter.value.name.trim().length < 4`: push `'Character name must be at least 4 characters.'`
   - If `!newCharacter.value.raceId`: push `'You must select a race.'`
   - If `!newCharacter.value.className.trim()`: push `'You must select a class.'`
3. If `errors.length > 0`: set `createError.value = errors.join(' ')` and return early.
4. Also update `isCharacterFormValid` computed: change the name check from `newCharacter.value.name.trim()` (truthy) to `newCharacter.value.name.trim().length >= 4` so the disabled state on the button (which will be removed in the next task) stays logically consistent and can be re-used for other purposes.

The existing duplicate-name check and reducer call remain unchanged below the new validation block.
  </action>
  <verify>
No TypeScript errors: `npx tsc --noEmit` passes (or open the file and confirm no red underlines). Manually trace: if name is empty, raceId is '', className is '' — createError.value should become 'Character name must be at least 4 characters. You must select a race. You must select a class.'
  </verify>
  <done>
createCharacter() populates createError with all applicable messages when form fields are invalid, and does not call the reducer.
  </done>
</task>

<task type="auto">
  <name>Task 2: Make Create button always enabled and show validation errors near it in CharacterPanel.vue</name>
  <files>src/components/CharacterPanel.vue</files>
  <action>
Two changes to the template:

1. The Create button currently has `:disabled="!connActive || !isCharacterFormValid"`. Remove `|| !isCharacterFormValid` so it becomes `:disabled="!connActive"`. The button must be clickable whenever the connection is active so validation feedback fires on click.

2. The `<div v-if="createError">` is currently placed below the name input (line 15), which is at the top of the form far from the Create button. Move it to just above the `<button type="submit">` tag so the error appears close to the action the user took. The existing `styles.errorText` style object should be kept as-is.

No other changes to the component.
  </action>
  <verify>
Inspect the template: `disabled` on the button references only `!connActive`. The `createError` div appears immediately before the submit button, not after the name input.
  </verify>
  <done>
Create button is clickable when conn is active regardless of form state. Validation errors appear just above the Create button when present.
  </done>
</task>

<task type="auto">
  <name>Task 3: Raise server-side name minimum from 2 to 4 characters</name>
  <files>spacetimedb/src/reducers/characters.ts</files>
  <action>
In the `create_character` reducer (line 229), change:

  if (trimmed.length < 2) throw new SenderError('Name too short');

to:

  if (trimmed.length < 4) throw new SenderError('Character name must be at least 4 characters');

This ensures the server enforces the same rule as the client even if someone bypasses client-side validation.
  </action>
  <verify>
The string `length < 2` no longer appears in characters.ts. The string `length < 4` appears in its place.
  </verify>
  <done>
Server rejects names shorter than 4 characters (after trim) with a descriptive error message.
  </done>
</task>

</tasks>

<verification>
After making all three changes:
1. Open the character creation screen with a fresh connection.
2. Click Create without filling anything in — error should read: "Character name must be at least 4 characters. You must select a race. You must select a class."
3. Type "Ab" (2 chars) and click Create — error should read: "Character name must be at least 4 characters. You must select a race. You must select a class."
4. Type "Abcd" (4 chars), select a race, leave class empty, click Create — error: "You must select a class."
5. Fill all fields correctly — Create proceeds normally.
6. Error div appears just above the Create button, not at the top of the form.
</verification>

<success_criteria>
- All three applicable error messages appear simultaneously when all fields are invalid.
- Error messages match the exact strings specified: "Character name must be at least 4 characters.", "You must select a race.", "You must select a class."
- Create button clickable whenever connActive is true.
- Server-side minimum is 4 characters.
- No regression: valid character creation still works.
</success_criteria>

<output>
No SUMMARY.md needed for quick tasks.
</output>
