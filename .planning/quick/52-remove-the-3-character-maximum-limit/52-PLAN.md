---
phase: quick-52
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/useCharacterCreation.ts
autonomous: true
must_haves:
  truths:
    - "Users can create more than 3 characters without being blocked"
  artifacts:
    - path: "src/composables/useCharacterCreation.ts"
      provides: "Character creation without slot cap"
      contains: "no MAX_CHARACTER_SLOTS constant or ownedCount check"
  key_links: []
---

<objective>
Remove the 3-character maximum limit so users can create unlimited characters.

Purpose: The client-side MAX_CHARACTER_SLOTS = 3 cap in useCharacterCreation.ts blocks users from creating more than 3 characters. There is no corresponding server-side limit, so this is purely a client guard to remove.
Output: Updated useCharacterCreation.ts with no character count restriction.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/composables/useCharacterCreation.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove character slot limit from useCharacterCreation</name>
  <files>src/composables/useCharacterCreation.ts</files>
  <action>
    In src/composables/useCharacterCreation.ts:
    1. Delete the `MAX_CHARACTER_SLOTS = 3` constant (line 23).
    2. Delete the entire ownedCount check block (lines 58-62): the `const ownedCount = ...` line and the `if (ownedCount >= MAX_CHARACTER_SLOTS) { ... }` block that sets createError.
    3. Do NOT touch any other logic (name validation, duplicate check, reducer call, etc.).
  </action>
  <verify>
    Grep the file for "MAX_CHARACTER" — should return zero matches.
    Grep the file for "ownedCount" — should return zero matches.
    Run `npx vue-tsc --noEmit` to confirm no type errors.
  </verify>
  <done>useCharacterCreation.ts has no character count cap. Users can create any number of characters.</done>
</task>

</tasks>

<verification>
- No references to MAX_CHARACTER_SLOTS or ownedCount remain in the file.
- TypeScript compilation succeeds.
</verification>

<success_criteria>
Character creation form submits without a slot-count error regardless of how many characters the user already owns.
</success_criteria>

<output>
After completion, create `.planning/quick/52-remove-the-3-character-maximum-limit/52-SUMMARY.md`
</output>
