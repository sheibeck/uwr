---
phase: quick-370
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/combat.ts
  - spacetimedb/src/helpers/combat_narration.ts
  - spacetimedb/src/data/llm_prompts.ts
autonomous: true
requirements: [QUICK-370]
must_haves:
  truths:
    - "Combat start shows a static sardonic message, no LLM call"
    - "Combat end triggers a single LLM call for the summary"
    - "Combat end summary does not always start with the location name"
    - "Only 1 LLM credit is spent per combat total (the outro only)"
  artifacts:
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Static intro message pool + deterministic selection, immediate combat tick"
    - path: "spacetimedb/src/helpers/combat_narration.ts"
      provides: "Updated budget logic -- no charge on intro (intro removed), charge on outro"
    - path: "spacetimedb/src/data/llm_prompts.ts"
      provides: "Updated outro prompt that forbids leading with location name"
  key_links:
    - from: "spacetimedb/src/reducers/combat.ts"
      to: "combat_narration.ts"
      via: "triggerCombatNarration no longer called for intro"
      pattern: "appendPrivateEvent.*combat_narration"
---

<objective>
Replace the LLM combat intro narration with a static sardonic message from a pool, and fix the combat end summary prompt so it does not always lead with the location name. Result: 1 LLM call per combat (outro only) instead of 2.

Purpose: Halve LLM cost per combat encounter while keeping the sardonic Keeper voice.
Output: Modified server files -- combat starts immediately with static message, ends with improved LLM summary.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/reducers/combat.ts
@spacetimedb/src/helpers/combat_narration.ts
@spacetimedb/src/data/llm_prompts.ts
@spacetimedb/src/data/combat_constants.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace LLM intro with static message pool and fix outro prompt</name>
  <files>spacetimedb/src/reducers/combat.ts, spacetimedb/src/helpers/combat_narration.ts, spacetimedb/src/data/llm_prompts.ts</files>
  <action>
**In `spacetimedb/src/reducers/combat.ts` (initiate_combat, around lines 234-274):**

1. Remove the entire LLM intro narration block (lines 234-264 that build `introEvents` and call `triggerCombatNarration`).

2. Replace with a static message pool and deterministic selection using combat ID + timestamp:

```typescript
// Static combat intro messages -- sardonic Keeper of Knowledge voice
const COMBAT_INTRO_MESSAGES = [
  'The world holds its breath. Or perhaps it simply does not care. Either way, steel is about to meet flesh.',
  'Another battle. The Keeper yawns, but watches nonetheless -- one must have hobbies.',
  'The air thickens with the promise of violence. How delightfully predictable.',
  'And so it begins again. The eternal dance of the ambitious and the soon-to-be-deceased.',
  'The world pauses to witness what will almost certainly be a disappointing spectacle.',
];
```

3. Select message deterministically using `Number(combat.id % BigInt(COMBAT_INTRO_MESSAGES.length))`.

4. Broadcast the selected message to all participants using `appendPrivateEvent(ctx, charId, character.ownerUserId, 'combat_narration', message)`. Loop over the `participants` array (already in scope) to get characterId and ownerUserId.

5. Also broadcast the "world grows still" follow-up message (currently in `handleCombatNarrationResult` for intro): `appendPrivateEvent(ctx, charId, character.ownerUserId, 'system', 'The world grows still around you.')`.

6. Remove the fallback timeout scheduling (lines 266-273 that insert `combat_loop_tick` with `COMBAT_INTRO_TIMEOUT_MICROS`). Instead, schedule an immediate combat tick: call `scheduleCombatTick(ctx, combat.id)` directly. Import `scheduleCombatTick` from `../helpers/combat` if not already imported (it already is at line 15).

7. Remove the `COMBAT_INTRO_TIMEOUT_MICROS` import since it is no longer needed.

**In `spacetimedb/src/helpers/combat_narration.ts`:**

1. In `triggerCombatNarration` (line 144-147): Change budget charging from intro to outro. Currently intro charges, outro does not. Flip this: charge on `victory` or `defeat`, not on `intro`. Replace:
   ```
   if (events.narrativeType === 'intro') {
     incrementBudget(ctx, chargedPlayerIdentity);
   }
   ```
   With:
   ```
   if (events.narrativeType === 'victory' || events.narrativeType === 'defeat') {
     incrementBudget(ctx, chargedPlayerIdentity);
   }
   ```

2. In `shouldNarrateRound`: The intro type will no longer be called, but for safety keep the existing logic. No change needed here.

3. In `handleCombatNarrationResult` (lines 276-288): Remove the intro-specific block that broadcasts the "world grows still" message and calls `scheduleCombatTick` -- that logic has moved to the reducer. The `if (narrativeType === 'intro')` block should be fully removed. The fallback for intro failure (lines 224-232) should also be removed since intro narration no longer uses LLM.

4. Remove `buildCombatIntroUserPrompt` from the imports at the top (line 13) since it is no longer called from this file.

**In `spacetimedb/src/data/llm_prompts.ts`:**

1. In `buildCombatOutroUserPrompt` (line 560-590): Add an explicit instruction to not lead with the location name. After the victory/defeat instruction line, add:
   ```
   lines.push('Do NOT start the narrative with the location name. The location is context for your narration, not the opening word. Vary your openings.');
   ```

2. Also add the location name to the outro user prompt for context (currently it is only in the system prompt context string). After the `Combat ends in ${outcome}.` line, add:
   ```
   if (events.locationName) lines.push(`Setting: ${events.locationName}`);
   ```
   And add enemy names for context:
   ```
   if (events.enemyNames?.length) lines.push(`Enemies faced: ${events.enemyNames.join(', ')}`);
   if (events.playerNames?.length) lines.push(`Combatants: ${events.playerNames.join(', ')}`);
   ```

3. The `buildCombatIntroUserPrompt` function can remain exported (no harm, avoids breaking any possible callers) but add a deprecation comment: `/** @deprecated No longer used -- combat intro uses static messages */`.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx tsc --noEmit -p spacetimedb/tsconfig.json 2>&1 | head -30</automated>
  </verify>
  <done>
    - Combat start in initiate_combat uses a static message from a pool of 5, deterministically selected
    - No LLM task is created for combat intro
    - Combat loop starts immediately (no 12s fallback timeout)
    - Budget is charged on outro (victory/defeat) instead of intro
    - Outro prompt explicitly instructs LLM not to lead with location name
    - Only 1 LLM call per combat (the end summary)
  </done>
</task>

<task type="auto">
  <name>Task 2: Verify and publish</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
1. Run `spacetime publish uwr -p spacetimedb` to publish to local SpacetimeDB.
2. If publish fails due to compilation errors, fix them.
3. Regenerate client bindings: `spacetime generate --lang typescript --out-dir client/src/module_bindings -p spacetimedb`
4. Verify no client-side references to the intro LLM flow that need updating by searching for `combat_intro` or `COMBAT_INTRO_TIMEOUT` in client code -- if found, they likely do not need changes since the client only watches for `combat_narration` events generically, but confirm.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && spacetime publish uwr -p spacetimedb 2>&1 | tail -5</automated>
  </verify>
  <done>
    - Module publishes cleanly to local SpacetimeDB
    - Client bindings regenerated
    - No broken client references
  </done>
</task>

</tasks>

<verification>
- TypeScript compiles without errors
- Module publishes to local SpacetimeDB
- No remaining references to LLM intro narration in the combat startup path
- Budget charging happens on outro, not intro
</verification>

<success_criteria>
- Combat start shows one of 5 static sardonic messages, no LLM call
- Combat end LLM summary no longer always leads with location name
- Only 1 LLM credit spent per combat (outro only)
- Module publishes and runs
</success_criteria>

<output>
After completion, create `.planning/quick/370-replace-llm-combat-intro-with-static-mes/370-SUMMARY.md`
</output>
