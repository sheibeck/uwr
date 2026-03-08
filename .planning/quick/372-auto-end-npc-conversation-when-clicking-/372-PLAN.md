---
phase: quick-372
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.vue
autonomous: true
requirements: [QUICK-372]
must_haves:
  truths:
    - "Clicking a game link (Travel, Gather, Attack, etc.) while in NPC conversation ends the conversation and executes the action"
    - "Clicking a context action button while in NPC conversation ends the conversation and executes the action"
    - "Typing farewell keywords (bye, farewell, etc.) still ends conversation normally"
    - "Typing free text while in conversation still routes to NPC talk"
    - "Starting a new NPC conversation (hail/talk) while in one switches to the new NPC"
  artifacts:
    - path: "src/App.vue"
      provides: "Auto-end conversation on non-conversation actions"
  key_links:
    - from: "clickNpcKeyword"
      to: "endConversation"
      via: "called before game action dispatch"
    - from: "onNarrativeSubmit"
      to: "endConversation"
      via: "called when context action or game command detected during conversation"
---

<objective>
Auto-end NPC conversation when the player clicks game links or context action buttons.

Purpose: Currently, clicking [Travel], [Gather], [Attack] links or context action buttons while in NPC conversation either routes the text to the NPC (for buttons via onNarrativeSubmit) or leaves the conversation visually open (for clickNpcKeyword links). The conversation should automatically close when any non-conversation game action is taken.

Output: Modified App.vue with auto-end behavior in both clickNpcKeyword and onNarrativeSubmit.
</objective>

<context>
@src/App.vue (lines 1297-1423: conversation state, onNarrativeSubmit)
@src/App.vue (lines 1432-1702: clickNpcKeyword handler)
@src/composables/useNpcConversation.ts
@src/composables/useContextActions.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Auto-end conversation on game actions in App.vue</name>
  <files>src/App.vue</files>
  <action>
Two changes in App.vue:

**1. In `clickNpcKeyword` (around line 1444, after skill/creation checks at lines 1435-1442):**
Add a block that ends the active NPC conversation before processing any game action keyword. Insert right before the "Combat keyword routing" comment (line 1444):

```typescript
// Auto-end NPC conversation when clicking any game action link
if (conversationNpcId.value) {
  endConversation();
}
```

This ensures that clicking any bracket keyword link ([Gather X], [Travel], [Attack Y], [Flee], [Take All Loot], [Equip X], etc.) while in conversation will close the conversation first, then execute the action normally.

**2. In `onNarrativeSubmit` (around line 1400, the conversation routing block):**
Currently lines 1401-1413 check if `conversationNpcId.value` is set and route ALL text to the NPC. Modify this block so that text matching known game action patterns (from context action buttons or typed commands) ends the conversation and falls through to normal processing instead.

Replace the conversation routing block (lines 1400-1413) with:

```typescript
// If in conversation with an NPC, route to talk_to_npc UNLESS it's a game action
if (conversationNpcId.value) {
  // End conversation on farewell keywords
  if (/^(?:bye|farewell|leave|goodbye|end|quit|exit|back)$/i.test(lower)) {
    endConversation();
    return;
  }
  // Detect game action commands that should break out of conversation
  // These come from context action buttons or typed commands
  const isGameAction = /^(?:go |look$|attack |gather |craft |bind$|inventory$|backpack$|quests?$|bank$|vendor$|shop$|buy |sell |who$)/i.test(lower);
  if (isGameAction) {
    endConversation();
    // Fall through to normal command processing below
  } else {
    // Free-form text stays in conversation
    talkToNpcReducer({
      characterId: selectedCharacter.value.id,
      npcId: conversationNpcId.value,
      message: text.trim(),
    });
    return;
  }
}
```

This way:
- Context action button clicks (which emit commands like "go cityname", "look") end conversation and execute
- Typed game commands during conversation end conversation and execute
- Free-form typed text during conversation still routes to NPC talk
- Farewell keywords still end conversation cleanly
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vue-tsc --noEmit --project tsconfig.app.json 2>&1 | head -20</automated>
  </verify>
  <done>
    - Clicking game link brackets while in NPC conversation ends conversation and executes the action
    - Clicking context action buttons (Go, Look, etc.) while in conversation ends it and executes
    - Typing "bye" still ends conversation normally
    - Typing free text while in conversation still talks to NPC
    - No TypeScript errors
  </done>
</task>

</tasks>

<verification>
1. TypeScript compiles without errors
2. Manual test: Start NPC conversation (hail NPC), then click a [Travel] or [Gather] link — conversation should end and action should execute
3. Manual test: Start NPC conversation, then click a context action button (Go, Look) — conversation should end and action should execute
4. Manual test: Start NPC conversation, type free text — should still talk to NPC
5. Manual test: Start NPC conversation, type "bye" — should end conversation normally
</verification>

<success_criteria>
NPC conversation automatically closes when player interacts with any game element (links, buttons, typed game commands), while preserving normal conversation flow for free-form text and farewell keywords.
</success_criteria>

<output>
After completion, create `.planning/quick/372-auto-end-npc-conversation-when-clicking-/372-SUMMARY.md`
</output>
