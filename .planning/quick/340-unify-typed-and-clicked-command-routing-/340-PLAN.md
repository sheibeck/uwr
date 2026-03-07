---
phase: quick-340
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [src/App.vue]
autonomous: true
requirements: [QUICK-340]

must_haves:
  truths:
    - "Clicking a bracketed keyword routes through the same logic as typing that text"
    - "Clicking an NPC name while in conversation sends talk_to_npc (not submit_intent)"
    - "Clicking 'bye' while in conversation ends the conversation"
    - "Skill choice and creation input still work when clicking keywords"
  artifacts:
    - path: "src/App.vue"
      provides: "Unified command routing"
      contains: "onNarrativeSubmit"
  key_links:
    - from: "clickNpcKeyword"
      to: "onNarrativeSubmit"
      via: "delegation after click-only guards"
      pattern: "onNarrativeSubmit\\(keyword\\)"
---

<objective>
Unify the two command entry points in App.vue so clicked bracket-keywords route through the same handler as typed input.

Purpose: Currently `clickNpcKeyword` (lines 1393-1415) and `onNarrativeSubmit` (lines 1332-1384) have duplicated routing logic that can diverge. For example, `clickNpcKeyword` does not handle NPC conversation mode (farewell detection, talk_to_npc routing), so clicking an NPC keyword while in conversation incorrectly calls submitIntentReducer instead of talkToNpcReducer.

Output: A single unified routing path where `clickNpcKeyword` handles only click-specific concerns (skill choice, creation input), then delegates to `onNarrativeSubmit` for all game-world routing.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/App.vue (lines 1332-1415 — the two handlers)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Unify clickNpcKeyword to delegate to onNarrativeSubmit</name>
  <files>src/App.vue</files>
  <action>
Refactor `clickNpcKeyword` (window global, ~line 1393) to handle ONLY click-specific routing, then delegate everything else to `onNarrativeSubmit`:

```typescript
(window as any).clickNpcKeyword = (keyword: string) => {
  console.log('[clickNpcKeyword]', keyword, 'isInCreation:', isInCreation.value, 'hasPendingSkills:', hasPendingSkills.value);
  // 1. Skill choice — click-only (typed skill choice uses different input mode)
  if (hasPendingSkills.value && chooseSkillByName(keyword)) {
    return;
  }
  // 2. Creation input — click-only (typed creation uses onCreationSubmit)
  if (isInCreation.value || !selectedCharacter.value) {
    submitCreationInput(keyword);
    return;
  }
  // 3. Everything else — delegate to the same handler typed input uses
  onNarrativeSubmit(keyword);
};
```

This removes the duplicated craft check, NPC matching, and submitIntentReducer call from clickNpcKeyword. All that logic already exists in onNarrativeSubmit and will now be shared.

Key behaviors that become consistent:
- Clicking "craft" still opens crafting panel (via onNarrativeSubmit line 1344)
- Clicking an NPC name while in conversation now correctly routes to talk_to_npc (via onNarrativeSubmit line 1362)
- Clicking "bye" while in conversation now correctly ends conversation (via onNarrativeSubmit line 1364)
- Clicking any other keyword routes through submitIntentReducer (via onNarrativeSubmit line 1383)

Do NOT modify onNarrativeSubmit — it already handles all the needed routing correctly.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vue-tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>clickNpcKeyword delegates to onNarrativeSubmit for all game-world routing. No duplicated craft/NPC/intent logic remains in clickNpcKeyword. TypeScript compiles cleanly.</done>
</task>

</tasks>

<verification>
- Type "craft" in narrative input -> crafting panel opens
- Click [Craft] keyword -> crafting panel opens (same behavior)
- Click an NPC name while in conversation -> routes to talk_to_npc (not submit_intent)
- Click "bye" while in conversation -> ends conversation
- Click any other keyword -> routes to submitIntentReducer
- Skill choice clicks still work during level-up
- Creation keyword clicks still work during character creation
</verification>

<success_criteria>
Single unified routing path. clickNpcKeyword body reduced to ~10 lines (skill choice guard, creation guard, delegate to onNarrativeSubmit). No duplicated logic between the two functions.
</success_criteria>

<output>
After completion, create `.planning/quick/340-unify-typed-and-clicked-command-routing-/340-SUMMARY.md`
</output>
