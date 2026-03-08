---
phase: quick-374
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/intent.ts
autonomous: true
requirements: [QUEST-ABANDON-CONFIRM]

must_haves:
  truths:
    - "Clicking [Abandon X] shows a warning message instead of immediately abandoning"
    - "Warning mentions NPC relationship penalty and quest may not return"
    - "Player must click [Confirm Abandon X] to actually abandon"
    - "Player can click [Keep Quest] to cancel abandonment"
    - "Confirming abandon still applies -3 affinity penalty and deletes quest"
  artifacts:
    - path: "spacetimedb/src/reducers/intent.ts"
      provides: "Two-step abandon flow: abandon -> warning, confirm abandon -> execute"
      contains: "confirm abandon"
  key_links:
    - from: "[Abandon X] link"
      to: "warning message with [Confirm Abandon X] and [Keep Quest]"
      via: "intent handler abandon prefix"
      pattern: "lower.startsWith..abandon"
    - from: "[Confirm Abandon X] link"
      to: "actual quest deletion + affinity penalty"
      via: "intent handler confirm abandon prefix"
      pattern: "confirm abandon"
---

<objective>
Add a two-step quest abandonment flow through the narrative console. When a player clicks [Abandon], show a warning about NPC relationship consequences and require explicit confirmation before proceeding.

Purpose: Prevent accidental quest abandonment and make players aware of the affinity penalty and permanent loss.
Output: Modified intent handler with confirmation step.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/reducers/intent.ts (quest command handling, lines 600-723)
@spacetimedb/src/reducers/quests.ts (abandon_quest reducer for reference)

The intent handler at line 704-723 handles `abandon <quest name>` — it immediately deletes the quest and applies -3 affinity. The `quests` command at line 650 renders `[Abandon QuestName]` links.

Key patterns:
- `appendPrivateEvent(ctx, character.id, character.ownerUserId, kind, message)` for narrative output
- `{{color:#hex}}text{{/color}}` for colored text
- `[Link Text]` for clickable narrative links (text inside brackets becomes a command)
- `awardNpcAffinity(ctx, character, npcId, delta)` from `../helpers/npc_affinity`
- `fail(ctx, character, message)` for error messages
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add two-step abandon confirmation in intent handler</name>
  <files>spacetimedb/src/reducers/intent.ts</files>
  <action>
Modify the intent handler in `intent.ts` to support a two-step abandon flow:

1. **Change the existing `abandon ` handler (line 704-723)** to show a warning instead of immediately abandoning:
   - Still look up the quest by name (same matching logic)
   - Look up the quest template to get the NPC name via `qt.npcId` -> `ctx.db.npc.id.find(qt.npcId)`
   - Show a warning message via `appendPrivateEvent` with kind `'quest'` containing:
     - A warning header in red/orange: the quest name
     - "Your relationship with [NPC Name] will suffer." (if quest has an NPC)
     - "This quest may never be offered again."
     - Two clickable links: `{{color:#ef4444}}[Confirm Abandon QUESTNAME]{{/color}}` and `{{color:#22c55e}}[Keep Quest]{{/color}}`
   - Do NOT delete the quest or apply affinity penalty yet

2. **Add a new `confirm abandon ` handler** BEFORE the existing `abandon ` handler:
   - Matches `lower.startsWith('confirm abandon ')`
   - Extract quest name from `raw.substring(16).trim()`
   - Look up quest instance by character and name (same pattern as current abandon)
   - Delete quest instance, apply -3 affinity penalty if NPC exists (same logic currently in abandon)
   - Show abandonment confirmation message via appendPrivateEvent

3. **Add a `keep quest` handler** that simply shows a reassuring message:
   - Matches `lower === 'keep quest'`
   - `appendPrivateEvent` with kind `'quest'`: "You decide to continue your quest."
   - This is a no-op — quest was never deleted

Order in the intent handler should be: `confirm abandon ` check first, then `abandon ` check, then `keep quest` check. This prevents "confirm abandon X" from matching the `abandon ` prefix handler.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx tsc --noEmit -p spacetimedb/tsconfig.json 2>&1 | head -20</automated>
  </verify>
  <done>
- Clicking [Abandon QuestName] in quest list shows warning with NPC name and consequence info
- Warning contains [Confirm Abandon QuestName] and [Keep Quest] clickable links
- Clicking [Confirm Abandon QuestName] actually abandons with -3 affinity penalty
- Clicking [Keep Quest] shows reassuring message, quest unchanged
- TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit -p spacetimedb/tsconfig.json` passes
- Read the modified intent.ts and verify the three handlers exist in correct order
</verification>

<success_criteria>
Quest abandonment requires explicit confirmation through the narrative console. Warning message mentions NPC relationship and permanence. Both confirm and cancel paths work correctly.
</success_criteria>

<output>
After completion, create `.planning/quick/374-quest-abandonment-confirmation-with-npc-/374-SUMMARY.md`
</output>
