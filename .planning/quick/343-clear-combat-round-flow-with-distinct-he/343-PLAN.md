---
phase: quick-343
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/useCombat.ts
  - src/App.vue
  - src/components/NarrativeConsole.vue
  - src/components/NarrativeMessage.vue
autonomous: true
requirements: [QUICK-343]
must_haves:
  truths:
    - "Each combat round has a distinct start header visible in the narrative stream"
    - "A live countdown timer updates every second during action_select phase"
    - "Submitting an action shows immediate confirmation feedback"
    - "Round resolution shows a pulsing indicator before narration arrives"
    - "Each round has a distinct end marker after the summary HP bars"
  artifacts:
    - path: "src/composables/useCombat.ts"
      provides: "Round header/footer message builders, cleaned actionPromptMessage without static timer"
    - path: "src/App.vue"
      provides: "Rewritten combat event injection watchers with phase-aware markers"
    - path: "src/components/NarrativeConsole.vue"
      provides: "Inline reactive countdown timer element during action_select"
    - path: "src/components/NarrativeMessage.vue"
      provides: "combat_round_header kind with distinctive styling"
  key_links:
    - from: "src/App.vue"
      to: "src/composables/useCombat.ts"
      via: "roundState, hasSubmittedAction, currentRound watchers"
      pattern: "watch\\(roundState|watch\\(hasSubmittedAction"
    - from: "src/components/NarrativeConsole.vue"
      to: "useCombat roundTimeRemaining"
      via: "prop passed from App.vue"
      pattern: "roundTimeRemaining"
---

<objective>
Add clear round-by-round flow markers to the combat narrative stream: distinct round headers, live countdown timer, action submission feedback, resolving indicator, and round end markers.

Purpose: Combat is currently hard to follow because rounds blend together with no clear beginning/end, the timer is a static snapshot, and there's no feedback between action submission and narration arrival.

Output: Rewritten combat event injection in App.vue, new round header/footer event kinds in NarrativeMessage.vue, live countdown timer in NarrativeConsole.vue, cleaned up useCombat.ts message builders.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/composables/useCombat.ts
@src/App.vue (lines 1028-1065 — combat event injection watchers)
@src/components/NarrativeConsole.vue
@src/components/NarrativeMessage.vue
@src/composables/useEvents.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add round header/footer kinds and live timer prop plumbing</name>
  <files>src/composables/useCombat.ts, src/components/NarrativeMessage.vue, src/components/NarrativeConsole.vue</files>
  <action>
**useCombat.ts changes:**

1. Remove the static timer text from `actionPromptMessage`. Change the first line from:
   `lines.push(\`Choose your action (${timer}s remaining):\`);`
   to:
   `lines.push('Choose your action:');`
   The timer will now be a live element in NarrativeConsole instead of baked into the message text.

2. Add a new computed `roundHeaderMessage` that returns a string like:
   `\u2550\u2550\u2550 ROUND {N} \u2550\u2550\u2550` (using unicode double-line box chars)
   Only returns a value when `currentRound.value` exists. Include enemy encounter name from the first enemy template name.
   Format: `\u2550\u2550\u2550 ROUND {roundNumber} \u2550\u2550\u2550`

3. Add a new computed `roundEndMessage` that returns:
   `\u2500\u2500\u2500 Round {N} complete \u2500\u2500\u2500`
   Only returns a value when `roundState.value === 'resolved'`.

4. Export both new computeds: `roundHeaderMessage`, `roundEndMessage`.

**NarrativeMessage.vue changes:**

1. Add two new event kinds to `KIND_COLORS`:
   - `combat_round_header`: `'#ffa94d'` (orange/amber, stands out)
   - `combat_resolving`: `'#ffd43b'` (gold, matches narration)

2. Add a computed `isCombatHeader` for `combat_round_header` kind.

3. Style `combat_round_header` messages: bold, centered-look (add `textAlign: 'center'`), slightly larger font (`fontSize: '1rem'`), with top/bottom margin (`marginTop: '12px'`, `marginBottom: '6px'`), and `letterSpacing: '2px'`.

4. Style `combat_resolving` messages with the same pulsing animation class as the LLM processing indicator (`animation: 'narrativePulse 1.5s ease-in-out infinite'`), italic.

**NarrativeConsole.vue changes:**

1. Add new props: `roundTimeRemaining` (number, default 0), `roundState` (string | null, default null), `hasSubmittedAction` (boolean, default false).

2. Add a reactive countdown display element positioned AFTER the last message but BEFORE the LLM processing indicator. Show it only when `roundState === 'action_select'` AND `!hasSubmittedAction`:
   ```html
   <div v-if="roundState === 'action_select' && !hasSubmittedAction && roundTimeRemaining > 0" :style="timerStyle">
     {{ roundTimeRemaining }}s
   </div>
   ```
   Style `timerStyle`: `{ color: roundTimeRemaining <= 3 ? '#ff6b6b' : '#ffd43b', fontSize: '1.1rem', fontWeight: 'bold', padding: '4px 0', fontFamily: "'Courier New', monospace', animation: roundTimeRemaining <= 3 ? 'narrativePulse 0.5s ease-in-out infinite' : 'none' }`.
   This gives a live-updating countdown that pulses red in the last 3 seconds.

3. When `hasSubmittedAction` is true AND `roundState === 'action_select'`, show instead:
   ```html
   <div v-else-if="hasSubmittedAction && roundState === 'action_select'" :style="submittedStyle">
     Action locked in. Awaiting resolution...
   </div>
   ```
   Style: `{ color: '#69db7c', fontStyle: 'italic', padding: '4px 0' }`.

4. When `roundState === 'resolving'`, show:
   ```html
   <div v-else-if="roundState === 'resolving'" :style="resolvingStyle">
     Round resolving...
   </div>
   ```
   Style: `{ color: '#ffd43b', fontStyle: 'italic', padding: '4px 0', animation: 'narrativePulse 1.5s ease-in-out infinite' }`.

   Place all three conditional divs in the scroll area, after the `<template v-else>` block of messages and before the LLM processing indicator div.
  </action>
  <verify>
    <automated>cd /c/projects/uwr && npx vue-tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>NarrativeMessage renders combat_round_header with distinct orange bold centered styling. NarrativeConsole shows live countdown during action_select that turns red and pulses at 3s. Shows "Action locked in" after submission. Shows pulsing "Round resolving..." during resolution phase. useCombat exports roundHeaderMessage and roundEndMessage computeds without static timer in actionPromptMessage.</done>
</task>

<task type="auto">
  <name>Task 2: Rewrite combat event injection watchers in App.vue</name>
  <files>src/App.vue</files>
  <action>
**Replace the combat event injection block (lines 1028-1065) with a comprehensive phase-aware injection system.**

1. Pass new props to NarrativeConsole (the game-world instance at ~line 59):
   - `:round-time-remaining="roundTimeRemaining"`
   - `:round-state="roundState"`
   - `:has-submitted-action="hasSubmittedAction"`

2. Replace the existing three watchers (lines 1028-1065) with these watchers:

**a) Round start header watcher** — When a new round's `action_select` begins, inject the round header + status bars + action prompt:
```typescript
const lastInjectedRoundStart = ref<string | null>(null);

watch([roundState, currentRound], ([state, round]) => {
  if (state !== 'action_select' || !round) return;
  const roundKey = `${round.roundNumber}-${activeCombat.value?.id}`;
  if (lastInjectedRoundStart.value === roundKey) return;
  lastInjectedRoundStart.value = roundKey;

  // Round header
  if (roundHeaderMessage.value) {
    addLocalEvent('combat_round_header', roundHeaderMessage.value, 'private');
  }
  // Status bars
  if (combatStatusMessage.value) {
    addLocalEvent('combat_status', combatStatusMessage.value, 'private');
  }
  // Action prompt
  if (actionPromptMessage.value) {
    addLocalEvent('combat_prompt', actionPromptMessage.value, 'private');
  }
});
```

**b) Action submitted feedback watcher** — When `hasSubmittedAction` becomes true, inject confirmation:
```typescript
const lastInjectedSubmit = ref<string | null>(null);

watch(hasSubmittedAction, (submitted) => {
  if (!submitted || !currentRound.value) return;
  const roundKey = `${currentRound.value.roundNumber}-${activeCombat.value?.id}`;
  if (lastInjectedSubmit.value === roundKey) return;
  lastInjectedSubmit.value = roundKey;
  const actionDesc = myAction.value?.actionType === 'flee' ? 'Flee' :
    myAction.value?.actionType === 'auto_attack' ? 'Auto-attack' :
    myAction.value?.actionType === 'ability' ? 'Ability' : 'Action';
  addLocalEvent('combat_status', `${actionDesc} submitted.`, 'private');
});
```

**c) Round resolved watcher** — When round resolves, inject summary bars + round end marker:
```typescript
watch(roundState, (state) => {
  if (state === 'resolved' && roundSummaryMessage.value) {
    addLocalEvent('combat_status', roundSummaryMessage.value, 'private');
  }
  if (state === 'resolved' && roundEndMessage.value) {
    addLocalEvent('combat_round_header', roundEndMessage.value, 'private');
  }
});
```

**d) Combat start watcher** — When combat first begins, inject initial header + bars + prompt:
```typescript
watch(() => activeCombat.value?.id?.toString(), (newId, oldId) => {
  if (newId && newId !== oldId) {
    lastInjectedRoundStart.value = null;
    lastInjectedSubmit.value = null;
    setTimeout(() => {
      // The round start watcher should fire naturally, but inject combat start header if no round yet
      if (!currentRound.value && combatStatusMessage.value) {
        addLocalEvent('combat_round_header', '\u2550\u2550\u2550 COMBAT BEGINS \u2550\u2550\u2550', 'private');
        addLocalEvent('combat_status', combatStatusMessage.value, 'private');
      }
    }, 500);
  }
  lastInjectedRoundStart.value = null;
  lastInjectedSubmit.value = null;
});
```

3. Make sure `roundHeaderMessage` and `roundEndMessage` are destructured from the `useCombat()` return value alongside the existing destructured values.
  </action>
  <verify>
    <automated>cd /c/projects/uwr && npx vue-tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>Combat flow in narrative stream shows: (1) "=== ROUND N ===" header in orange when each round starts, (2) status bars and action prompt below it, (3) live countdown timer updating every second in the scroll area, (4) "Action submitted" confirmation when player acts, (5) "Round resolving..." pulsing indicator during resolution, (6) LLM narration arrives from server, (7) post-round HP summary bars, (8) "--- Round N complete ---" end marker. Each phase is visually distinct and the flow is easy to follow.</done>
</task>

</tasks>

<verification>
1. Type-check passes: `npx vue-tsc --noEmit`
2. Manual combat test: Enter combat, observe round 1 header appears, countdown ticks down live, submit action shows confirmation, resolving phase pulses, narration arrives, summary bars show, round end marker appears, round 2 header starts the cycle again.
</verification>

<success_criteria>
- Round headers and footers are visually distinct from other combat messages (orange, bold, centered)
- Timer counts down live (not a static snapshot) and turns red/pulses at 3 seconds
- Player sees immediate feedback after submitting an action
- Resolution phase has a visible "resolving..." indicator
- Round end is clearly marked after summary bars
- No TypeScript compilation errors
</success_criteria>

<output>
After completion, create `.planning/quick/343-clear-combat-round-flow-with-distinct-he/343-SUMMARY.md`
</output>
