---
phase: quick-96
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/commands.ts
  - spacetimedb/src/reducers/npc_interaction.ts
  - src/components/LocationGrid.vue
  - src/components/CommandBar.vue
  - src/composables/useCommands.ts
  - src/App.vue
autonomous: true

must_haves:
  truths:
    - "NPC greeting text appears ONLY in Journal panel, NOT in the Log panel"
    - "The system message 'You begin to talk with X' appears in Log only"
    - "No duplicate greeting entries appear in Journal when hailing an NPC"
    - "Dialogue option responses (choose_dialogue_option) appear ONLY in Journal, not Log"
    - "Gift messages appear ONLY in Journal, not Log"
    - "NPCs in the location panel can be clicked to select/highlight them"
    - "Typing /say with a targeted NPC searches that NPC's dialogue options and triggers matching response"
    - "/say response from NPC appears in Log and conversation is appended to Journal"
  artifacts:
    - path: "spacetimedb/src/reducers/commands.ts"
      provides: "Fixed hailNpc: removes appendPrivateEvent for greeting/quest text, keeps appendSystemMessage for Log"
    - path: "spacetimedb/src/reducers/npc_interaction.ts"
      provides: "Fixed choose_dialogue_option and give_gift_to_npc: removes appendPrivateEvent calls, Journal-only logging"
    - path: "src/components/LocationGrid.vue"
      provides: "NPC click-to-select with highlight styling, emits selected NPC id"
    - path: "src/composables/useCommands.ts"
      provides: "/say handler that checks targeted NPC and matches dialogue options"
    - path: "src/App.vue"
      provides: "Wiring for selectedNpcTarget state and passing to useCommands and LocationGrid"
  key_links:
    - from: "src/composables/useCommands.ts"
      to: "choose_dialogue_option reducer"
      via: "/say command handler with NPC targeting"
      pattern: "chooseDialogueOption"
    - from: "src/App.vue"
      to: "src/components/LocationGrid.vue"
      via: "selectedNpcTarget prop and select-npc emit"
      pattern: "selectedNpcTarget|select-npc"
---

<objective>
Fix NPC dialogue logging issues and implement NPC targeting with /say dialogue interaction.

Purpose: NPC greetings currently appear in both the Log panel and Journal panel (should be Journal-only). Dialogue option responses and gift messages also duplicate across both panels. Additionally, implement a new NPC interaction flow where players can click-select NPCs in the location panel and use /say to trigger dialogue responses.

Output: Fixed logging separation (Journal-only for NPC conversations, Log-only for system messages), NPC targeting in location panel, /say command NPC dialogue matching.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/reducers/commands.ts
@spacetimedb/src/reducers/npc_interaction.ts
@spacetimedb/src/helpers/events.ts
@src/components/LocationGrid.vue
@src/components/NpcDialogPanel.vue
@src/components/CommandBar.vue
@src/composables/useCommands.ts
@src/App.vue
@src/module_bindings/npc_dialogue_option_type.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix NPC dialogue logging - Journal-only for conversations</name>
  <files>spacetimedb/src/reducers/commands.ts, spacetimedb/src/reducers/npc_interaction.ts</files>
  <action>
Fix the dual-logging issue where NPC conversation text goes to both Log (via appendPrivateEvent) and Journal (via appendNpcDialog). The rule is: NPC conversation text (greetings, dialogue responses, gift reactions) goes to Journal ONLY. System notifications ("You begin to talk with X") go to Log ONLY.

In `spacetimedb/src/reducers/commands.ts` - `hailNpc` function:
1. Line 85 (`appendSystemMessage`) - KEEP as-is. This puts "You begin to talk with X." in Log. Correct behavior.
2. Line 88 (`appendNpcDialog`) - KEEP as-is. This puts the greeting in Journal. Correct behavior.
3. Line 89 (`appendPrivateEvent` with greeting) - REMOVE this line. This is the bug causing greeting to appear in Log.
4. Lines 108-109 (quest reminder): KEEP `appendNpcDialog` on line 108, REMOVE `appendPrivateEvent` on line 109.
5. Lines 131-132 (quest offer): KEEP `appendNpcDialog` on line 131, REMOVE `appendPrivateEvent` on line 132.

In `spacetimedb/src/reducers/npc_interaction.ts` - `choose_dialogue_option` reducer:
1. Line 72 (`appendNpcDialog` for playerLine) - KEEP.
2. Line 73 (`appendPrivateEvent` for playerLine) - REMOVE. Player's dialogue choice should only be in Journal.
3. Line 77 (`appendNpcDialog` for npcLine) - KEEP.
4. Line 78 (`appendPrivateEvent` for npcLine) - REMOVE. NPC response should only be in Journal.

In `spacetimedb/src/reducers/npc_interaction.ts` - `give_gift_to_npc` reducer:
1. Line 147 (`appendNpcDialog` for giftMsg) - KEEP.
2. Line 148 (`appendPrivateEvent` for giftMsg) - REMOVE.
3. Line 162 (`appendNpcDialog` for reaction) - KEEP.
4. Line 163 (`appendPrivateEvent` for reaction) - REMOVE.
5. ADD a single `appendSystemMessage(ctx, character, \`You gave ${template.name} to ${npc.name}.\`)` before the Journal entries so the Log shows a brief notification (import appendSystemMessage from events.ts if not already imported).

This ensures clean separation: Log gets brief system notifications, Journal gets full conversation text.
  </action>
  <verify>
Read the modified files and confirm:
- No `appendPrivateEvent` calls remain for NPC conversation text (greeting, quest text, dialogue options, gift reactions)
- `appendSystemMessage` "You begin to talk with X" is preserved in hailNpc
- `appendNpcDialog` calls are all preserved
- New `appendSystemMessage` added for gift notification in Log
  </verify>
  <done>NPC conversation text (greetings, dialogue responses, quest text, gift reactions) only appears in Journal panel. Log panel shows only brief system messages like "You begin to talk with X" and "You gave X to Y".</done>
</task>

<task type="auto">
  <name>Task 2: Add NPC targeting in location panel and /say dialogue interaction</name>
  <files>src/components/LocationGrid.vue, src/composables/useCommands.ts, src/App.vue, src/components/CommandBar.vue</files>
  <action>
Implement click-to-select NPC targeting in the location panel and wire /say to trigger NPC dialogue when an NPC is targeted.

**LocationGrid.vue changes:**
1. Add a new prop `selectedNpcId` of type `bigint | null` to receive the currently targeted NPC.
2. Add a new emit `(e: 'select-npc', npcId: bigint | null): void`.
3. On the NPC tile div (currently using `:style="styles.gridTileNpc"`), add a `@click="toggleSelectNpc(npc.id)"` handler.
4. Apply conditional selected styling: `:style="{ ...styles.gridTileNpc, ...(selectedNpcId?.toString() === npc.id.toString() ? styles.gridTileNpcSelected : {}) }"`.
5. Add `toggleSelectNpc` method that emits `select-npc` with the npc.id if not already selected, or null to deselect.

**styles.ts addition:**
Add `gridTileNpcSelected` style adjacent to `gridTileNpc`:
```
gridTileNpcSelected: {
  background: 'rgba(130, 200, 130, 0.25)',
  border: '1px solid rgba(130, 200, 130, 0.7)',
  color: '#a0e8a0',
},
```

**App.vue changes:**
1. Add `const selectedNpcTarget = ref<bigint | null>(null)` near other selection state.
2. Add a handler: `const selectNpcTarget = (npcId: bigint | null) => { selectedNpcTarget.value = npcId; }`.
3. Pass `selectedNpcTarget` to the LocationGrid component as `:selected-npc-id="selectedNpcTarget"`.
4. Listen for `@select-npc="selectNpcTarget"` on LocationGrid.
5. Clear `selectedNpcTarget` when changing locations (watch `currentLocation` and reset to null).
6. Pass `selectedNpcTarget` and `npcDialogueOptions` and `npcsHere` and `npcAffinities` and `characterFactionStandings` to `useCommands`:
   - Add `selectedNpcTarget: selectedNpcTarget` to the useCommands args
   - Add `npcDialogueOptions` ref to useCommands args
   - Add `npcAffinities` ref to useCommands args
   - Add `factionStandings` ref to useCommands args (characterFactionStandings)
   - Add `selectedCharacterId` computed to useCommands args

**useCommands.ts changes:**
1. Add new args to `UseCommandsArgs`:
   - `selectedNpcTarget?: Ref<bigint | null>`
   - `npcDialogueOptions?: Ref<NpcDialogueOptionRow[]>`
   - `npcAffinities?: Ref<NpcAffinityRow[]>`
   - `factionStandings?: Ref<FactionStandingRow[]>`
   - `selectedCharacterId?: Ref<bigint | null>`
2. Import `NpcDialogueOptionRow`, `NpcAffinityRow`, `FactionStandingRow` from module_bindings.
3. Add `useReducer(reducers.chooseDialogueOption)` for calling the dialogue reducer.
4. Modify the `/say` handler (lines 117-121): Before calling the existing `sayReducer`, check if `selectedNpcTarget?.value` is set. If so:
   a. Get the targeted NPC from `npcsHere`.
   b. Search `npcDialogueOptions` for root options (no parentOptionId) belonging to the targeted NPC.
   c. Fuzzy-match the /say message text against each option's `playerText` (case-insensitive substring match: if the user's text is contained in playerText OR playerText is contained in the user's text, it's a match; prefer exact match, then startsWith, then includes).
   d. Check affinity/faction/renown requirements against the character's data (same logic as NpcDialogPanel.vue's `availableDialogueOptions`).
   e. If a matching unlocked option is found, call `chooseDialogueOptionReducer({ characterId, npcId, optionId })` instead of `sayReducer`.
   f. If no match found, fall through to normal `sayReducer` behavior.
5. Also handle the bare `say ` prefix (line 135-139) with the same NPC targeting logic.

**CommandBar.vue changes:**
1. Update the `/say` command hint from `'Talk to everyone nearby'` to `'Talk nearby (targets NPC if selected)'`.
  </action>
  <verify>
Read all modified files and confirm:
- LocationGrid has selectedNpcId prop, select-npc emit, click handler on NPC tiles, and selected styling
- styles.ts has gridTileNpcSelected style
- App.vue passes selectedNpcTarget to LocationGrid and useCommands, clears on location change
- useCommands has NPC dialogue matching logic in /say handler
- chooseDialogueOption reducer is called when a match is found
- CommandBar hint is updated
  </verify>
  <done>NPCs in location panel are click-selectable with green highlight. /say command with a targeted NPC fuzzy-matches against dialogue options and triggers the choose_dialogue_option reducer for matched options. Unmatched /say falls through to normal say behavior. NPC selection clears on location change.</done>
</task>

</tasks>

<verification>
1. After Task 1: Publish module (`spacetime publish`), hail an NPC. Verify greeting appears ONLY in Journal panel, "You begin to talk with X" appears in Log only. Choose a dialogue option and verify response appears only in Journal. Give a gift and verify reaction appears only in Journal with brief notification in Log.
2. After Task 2: Click an NPC in the location panel - verify green highlight. Click again to deselect. With NPC selected, type `/say` followed by text matching a dialogue option's playerText - verify the NPC responds via the dialogue system. Type `/say` with non-matching text - verify it falls through to normal say behavior.
</verification>

<success_criteria>
- NPC conversation text (greetings, dialogue responses, quest dialogue, gift reactions) appears ONLY in Journal panel
- System messages ("You begin to talk with X", "You gave X to Y") appear ONLY in Log panel
- No duplicate entries in Journal
- NPCs in location panel are click-selectable with visual highlight
- /say with targeted NPC + matching text triggers dialogue option via choose_dialogue_option reducer
- /say with no NPC target or non-matching text behaves as normal say
- NPC selection clears when character changes location
</success_criteria>

<output>
After completion, create `.planning/quick/96-fix-npc-dialogue-logging-issues-greeting/96-SUMMARY.md`
</output>
