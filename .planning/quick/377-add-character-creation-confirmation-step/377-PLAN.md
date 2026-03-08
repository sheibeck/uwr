---
phase: quick-377
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/creation.ts
autonomous: true
requirements: [QUICK-377]
must_haves:
  truths:
    - "After choosing a name, player sees a summary of race, class, ability, and name before finalizing"
    - "Player can confirm to create the character"
    - "Player can start over to reset all choices back to AWAITING_RACE"
    - "Resuming creation in CONFIRMING step shows the summary again"
  artifacts:
    - path: "spacetimedb/src/reducers/creation.ts"
      provides: "CONFIRMING step in creation state machine"
      contains: "case 'CONFIRMING'"
  key_links:
    - from: "spacetimedb/src/reducers/creation.ts"
      to: "character_creation_state table"
      via: "step field set to CONFIRMING"
      pattern: "step: 'CONFIRMING'"
---

<objective>
Add a confirmation step to character creation that shows a summary of all choices (race, class, ability, name) and lets the player [Confirm] or [Start Over] before the character is actually created.

Purpose: Prevent accidental character creation with wrong choices. Give the player a final review moment.
Output: Updated creation.ts with CONFIRMING step between AWAITING_NAME and COMPLETE.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/reducers/creation.ts
@spacetimedb/src/schema/tables.ts (CharacterCreationState table definition — step is a string, characterName already exists)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add CONFIRMING step to creation state machine</name>
  <files>spacetimedb/src/reducers/creation.ts</files>
  <action>
Modify the creation state machine in `spacetimedb/src/reducers/creation.ts`:

1. **AWAITING_NAME case** — After all name validation passes (length, single word, letters only, duplicate check), instead of immediately creating the character:
   - Store the validated name on state: `characterName: candidateName`
   - Advance step to `'CONFIRMING'`
   - Build a summary message showing all choices. Parse abilities JSON to get the chosen ability name. Format:
     ```
     The Keeper reviews the chronicle of your becoming:\n\n
     Race: {state.raceName}\n
     Class: {state.className}\n
     Ability: {chosenAbilityName}\n
     Name: {candidateName}\n\n
     Is this the soul you wish to carry into the world? Type [Confirm] to seal your fate, or [Start Over] to begin anew.
     ```
   - Use kind `'creation'` for the event.

2. **Add new `case 'CONFIRMING'`** in the switch statement (before the `case 'COMPLETE'`):
   - If input matches "confirm" (case-insensitive, trimmed): execute the entire character finalization block that currently lives in the AWAITING_NAME case (everything from `const userId = requirePlayerUserId(ctx)` through the world_gen_state insert and final events). Use `state.characterName` instead of `candidateName` since the name was stored in the previous step.
   - If input matches "start over" or any of the GO_BACK_PATTERNS: reset state to AWAITING_RACE by calling `clearDataFromStep(state, 'AWAITING_RACE')` and updating step to `'AWAITING_RACE'`. Also clear `characterName`. Emit creation event: `"Very well. The slate is wiped clean. Let us begin again. Describe your race -- what manner of creature are you?"`
   - Otherwise: emit creation_error: `"I asked a simple question. [Confirm] to proceed, or [Start Over] to begin anew. This is not the time for creativity."`

3. **Extract character finalization** into a helper function `finalizeCharacter(ctx, state, player, deps)` to avoid duplicating the large block. This function should contain everything from `requirePlayerUserId` through the world_gen_state insert and final creation events. Both the old code path (removed from AWAITING_NAME) and the new CONFIRMING case call this helper.

4. **Update `determineGoBackTarget`** — add `case 'CONFIRMING': return 'AWAITING_NAME';` so the go-back system works from CONFIRMING.

5. **Update go-back detection** — the current code excludes AWAITING_NAME from go-back detection (`state.step !== 'AWAITING_NAME'`). Leave that as-is. For the CONFIRMING step, go-back IS allowed (not excluded), so the existing go-back patterns will work naturally. But since we also handle "start over" directly in the CONFIRMING case, and it's a simpler flow (no confirmation needed to go back from confirmation), handle it directly in the CONFIRMING switch case rather than through the CONFIRMING_GO_BACK mechanism.

6. **Update `clearDataFromStep`** — add handling for `AWAITING_NAME` target: clear `characterName` only (keep everything else).

7. **Update `start_creation` resume handling** — add an `else if (step === 'CONFIRMING')` block that re-displays the summary (same format as above, reading from state fields) so reconnecting players see their choices again.

8. **Update the step comment** on the schema table definition line (line ~1901) to include CONFIRMING in the list of steps.

No schema changes needed — `step` is a string and `characterName` field already exists.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx tsc --noEmit -p spacetimedb/tsconfig.json 2>&1 | head -20</automated>
  </verify>
  <done>
    - AWAITING_NAME validates name then advances to CONFIRMING with summary displayed
    - CONFIRMING step accepts "confirm" (creates character) or "start over" (resets to AWAITING_RACE)
    - Character finalization logic extracted into reusable helper function
    - Resume messages work for CONFIRMING step
    - No schema changes required
  </done>
</task>

</tasks>

<verification>
- TypeScript compiles without errors
- The CONFIRMING step exists in the switch statement
- Character finalization only happens when player confirms
- "Start Over" resets all state back to AWAITING_RACE
</verification>

<success_criteria>
After choosing a name, player sees a summary and must confirm before character is created. Start Over resets the entire flow.
</success_criteria>

<output>
After completion, create `.planning/quick/377-add-character-creation-confirmation-step/377-SUMMARY.md`
</output>
