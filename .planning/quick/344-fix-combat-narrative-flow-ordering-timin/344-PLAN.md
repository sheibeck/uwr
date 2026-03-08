---
quick: 344
title: "Fix combat narrative flow - ordering, timing, and LLM narration accuracy"
files_modified:
  - src/App.vue
  - spacetimedb/src/data/llm_prompts.ts
  - spacetimedb/src/helpers/combat_narration.ts
---

<objective>
Fix five combat narrative bugs: (1) duplicate status bars causing text concatenation on new round start, (2) LLM fabricating ability names instead of using actual ones, (3) COMBAT ENDED marker appearing before final narration, (4) late-arriving narration lacking round context, (5) action prompt not visually separated from status bars.

Purpose: Combat readability is broken — players see garbled text ("ByronChoose"), hallucinated ability names, and out-of-order events.
Output: Clean, properly ordered combat narrative flow.
</objective>

<context>
@src/App.vue (lines 1034-1105 — combat event injection watchers)
@src/composables/useCombat.ts (roundSummaryMessage, combatStatusMessage, actionPromptMessage)
@spacetimedb/src/data/llm_prompts.ts (buildCombatNarrationPrompt, buildCombatRoundUserPrompt)
@spacetimedb/src/helpers/combat_narration.ts (handleCombatNarrationResult)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix client-side combat event injection (bugs 1, 3, 5)</name>
  <files>src/App.vue</files>
  <action>
In `src/App.vue`, fix the combat event injection watchers (lines ~1034-1105):

**Bug 1 — Duplicate status bars on new round start:**
The `roundState` watcher for `resolved` injects `roundSummaryMessage` (which has full HP bars). Then immediately the next round's `action_select` watcher fires and injects `combatStatusMessage` (also full HP bars) — creating redundant bars that visually concatenate.

Fix: In the `action_select` watcher (line ~1039), do NOT inject `combatStatusMessage` if we have a `currentRound.roundNumber > 1` (i.e., not the first round). The resolved round's summary already showed updated HP. Only inject combatStatusMessage on Round 1 start (when there's been no prior summary). Concretely:
- Keep the round header injection for all rounds
- Only inject `combatStatusMessage` when `Number(round.roundNumber) === 1`
- Always inject `actionPromptMessage`

**Bug 3 — COMBAT ENDED appearing before final narration:**
The combat END watcher (line ~1099) fires immediately when `activeCombat` becomes null. But the LLM victory/defeat narration arrives seconds later.

Fix: Remove the "COMBAT ENDED" local event injection entirely. The server already sends a victory/defeat narration via `combat_narration` kind events, which serves as the natural combat ending. If narration was skipped (budget), the server sends "The System has lost interest in your skirmish." as a system event — that also serves as an ending marker.

Keep the cleanup of `lastInjectedRoundStart` and `lastInjectedSubmit` refs in the end watcher.

**Bug 5 — Action prompt not separated from status bars:**
In `useCombat.ts`, the `actionPromptMessage` computed starts with "Choose your action:" directly. But since we're now skipping status bars on subsequent rounds, the prompt follows the round header directly.

Fix: In the `action_select` watcher, add a blank separator line before the action prompt injection. Add a blank `addLocalEvent('combat_status', '', 'private')` between the round header and the action prompt. This is simpler than modifying the message builders.

Actually, better approach: In the action_select watcher, prepend a newline to the action prompt by adding a small visual separator. Change the round header to include status context: after `roundHeaderMessage`, add `combatStatusMessage` ONLY for round 1 (as above), then always add the action prompt.
  </action>
  <verify>
    Build passes: `cd C:\projects\uwr && npx vue-tsc --noEmit 2>&1 | head -20`
  </verify>
  <done>
    - Round 2+ no longer shows duplicate HP bars (only round summary from previous round, then round header, then action prompt)
    - Round 1 still shows initial HP bars + action prompt
    - No "COMBAT ENDED" marker (narration or system message serves as ending)
    - Action prompt is visually distinct from preceding content
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix LLM narration prompt and add round labels (bugs 2, 4)</name>
  <files>spacetimedb/src/data/llm_prompts.ts, spacetimedb/src/helpers/combat_narration.ts</files>
  <action>
**Bug 2 — LLM fabricating ability names:**
In `spacetimedb/src/data/llm_prompts.ts`, function `buildCombatRoundUserPrompt` (line ~459):

After the existing event lines, before the JSON response instruction, add an explicit constraint listing the actual ability names used. Collect all unique ability names from `events.playerActions` and `events.enemyActions`:

```typescript
// After the existing event lines, before the response JSON line:
const usedAbilities = new Set<string>();
for (const a of events.playerActions) {
  if (a.abilityName) usedAbilities.add(a.abilityName);
}
for (const a of events.enemyActions) {
  if (a.abilityName) usedAbilities.add(a.abilityName);
}
if (usedAbilities.size > 0) {
  lines.push('');
  lines.push(`IMPORTANT: Use ONLY these exact ability names in your narration: ${[...usedAbilities].join(', ')}. Do NOT invent or rename abilities.`);
}
```

Also in `buildCombatNarrationPrompt` system prompt (line ~50), add to the narration instructions:
After "Reference the specific abilities used by name" add: "— use the EXACT names provided in the user message, never invent new ability names"

**Bug 4 — Late narration lacks round context:**
In `spacetimedb/src/helpers/combat_narration.ts`, function `handleCombatNarrationResult` (line ~204):

When broadcasting the narrative text via `appendPrivateEvent`, prefix the narration with a round label so it's contextual even when it arrives late:

For `narrativeType === 'round'`: prefix with `[Round ${roundNumber}] `
For `narrativeType === 'intro'`: no prefix (intro is always first)
For `narrativeType === 'victory'` or `'defeat'`: no prefix (outcome is self-evident)

Change line ~257 from:
```typescript
appendPrivateEvent(ctx, charId, character.ownerUserId, 'combat_narration', narrative);
```
to:
```typescript
const prefix = narrativeType === 'round' ? `[Round ${roundNumber}] ` : '';
appendPrivateEvent(ctx, charId, character.ownerUserId, 'combat_narration', prefix + narrative);
```

Move the prefix computation before the broadcast loop so it's computed once.
  </action>
  <verify>
    Build passes: `cd C:\projects\uwr\spacetimedb && npx tsc --noEmit 2>&1 | head -20`
  </verify>
  <done>
    - LLM prompt explicitly lists actual ability names with "do NOT invent" instruction
    - System prompt reinforces exact name usage
    - Round narration events prefixed with "[Round N]" for temporal context
    - Intro and victory/defeat narrations have no prefix
  </done>
</task>

</tasks>

<verification>
1. `npx vue-tsc --noEmit` passes for client
2. `cd spacetimedb && npx tsc --noEmit` passes for server
3. Visual: Start combat, observe Round 1 shows header + HP bars + action prompt (no concatenation)
4. Visual: Round 2+ shows round summary from previous round, then round header + action prompt (no duplicate bars)
5. Visual: Combat end has no "COMBAT ENDED" marker — narration or system message is the ending
6. Visual: LLM narration references actual ability names (when narration fires)
</verification>

<success_criteria>
- No "ByronChoose" concatenation — status bars and prompts are visually separated
- No hallucinated ability names in LLM narration
- No premature "COMBAT ENDED" marker before final narration
- Late-arriving narration labeled with round number for context
</success_criteria>
