---
phase: quick-103
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/NpcDialogPanel.vue
autonomous: true

must_haves:
  truths:
    - "Dialogue Options section does not show empty-text root greeting nodes"
    - "Dialogue Options section still shows legitimate clickable options when affinity requirements are met"
    - "NPC hail greeting system continues to work unchanged via /hail command"
  artifacts:
    - path: "src/components/NpcDialogPanel.vue"
      provides: "Filtered dialogue options excluding defunct empty-playerText root nodes"
  key_links:
    - from: "src/components/NpcDialogPanel.vue"
      to: "availableDialogueOptions computed"
      via: "filter chain"
      pattern: "playerText.*trim.*length"
---

<objective>
Remove defunct dialog options from the Journal (NpcDialogPanel).

Purpose: The NpcDialogueOption table contains root greeting nodes with empty `playerText` (e.g., `marla_root`, `soren_root`, `jyn_root`). These are used by the `/hail` system on the server to display NPC greetings, but they also appear as empty clickable buttons in the "Dialogue Options" section of the NpcDialogPanel. Clicking them redundantly re-triggers the greeting. They should be filtered out from the displayed options.

Output: Clean dialogue options list showing only options with meaningful playerText.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/components/NpcDialogPanel.vue
@spacetimedb/src/data/dialogue_data.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Filter out empty-playerText dialogue options from NpcDialogPanel</name>
  <files>src/components/NpcDialogPanel.vue</files>
  <action>
In `src/components/NpcDialogPanel.vue`, modify the `availableDialogueOptions` computed property (around line 245-301).

After the initial filter on line 249-251 that gets root options (`!opt.parentOptionId`), add a secondary filter to exclude options where `playerText` is empty or whitespace-only:

```typescript
const options = props.npcDialogueOptions.filter(
  (opt) => opt.npcId.toString() === selectedNpcId.value && !opt.parentOptionId
).filter(opt => opt.playerText.trim().length > 0);
```

This removes the root greeting nodes (like `marla_root` with `playerText: ''`) from displaying as clickable dialogue options while preserving legitimate root options like `marla_past_unlocked` (playerText: 'past') and `marla_shortcuts` (playerText: 'shortcuts').

Do NOT modify any server-side code. The root greeting nodes are still needed by the `hailNpc` reducer for `/hail` command functionality.
  </action>
  <verify>
Run `npm run build` (or equivalent) from the client directory to confirm no TypeScript/build errors. Visually confirm by reading the modified computed property that:
1. Root options with empty playerText are excluded
2. Root options with non-empty playerText are still included
3. The rest of the computed logic (affinity/faction/renown checks, locked state) remains unchanged
  </verify>
  <done>
The "Dialogue Options" section in the NpcDialogPanel no longer displays empty-text root greeting nodes. Only dialogue options with meaningful playerText keywords are shown. The hail/greeting system is unaffected.
  </done>
</task>

</tasks>

<verification>
- NpcDialogPanel.vue builds without errors
- Root greeting nodes (empty playerText) no longer appear as clickable dialogue options
- Legitimate dialogue options with playerText (e.g., "past", "shortcuts") still display correctly
- Affinity-locked options still show with lock indicator when requirements not met
</verification>

<success_criteria>
- No empty dialogue option buttons visible in the Journal's NPC dialog panel
- NPC hail greetings continue to work via /hail command (server-side unchanged)
- Dialogue options with actual keywords still appear and function when clicked
</success_criteria>

<output>
After completion, create `.planning/quick/103-remove-defunct-dialog-options-from-journ/103-SUMMARY.md`
</output>
