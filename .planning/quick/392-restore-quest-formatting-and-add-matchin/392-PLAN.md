---
phase: quick-392
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/useCommands.ts
autonomous: true
requirements: [QUEST-FMT, RENOWN-FMT, FACTIONS-FMT, EVENTS-FMT]
must_haves:
  truths:
    - "Quests command uses server-side handler with rich color tags and clickable links"
    - "Renown command displays with look-style border, colored rank name, and progress info"
    - "Factions command displays with look-style border and reputation-colored standings"
    - "Events command displays with look-style border, colored event names, and progress fractions"
  artifacts:
    - path: "src/composables/useCommands.ts"
      provides: "Formatted renown, factions, events commands; quests passthrough to server"
  key_links:
    - from: "src/composables/useCommands.ts"
      to: "spacetimedb/src/reducers/intent.ts"
      via: "quests command falls through to submitCommandReducer"
      pattern: "submitCommandReducer"
---

<objective>
Restore the quests command to use the server-side handler (which has rich formatting with color tags, clickable links, quest giver info, and 'look' event kind styling), and add matching rich formatting to the renown, factions, and events client-side commands.

Purpose: The client-side quests handler is a regression that lost all formatting. The other info commands (renown, factions, events) use plain 'command' kind with no colors, making them hard to read.
Output: All four info commands display with bordered 'look' styling and color-coded content.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/composables/useCommands.ts
@spacetimedb/src/reducers/intent.ts (lines 656-701 — server-side quests handler with rich formatting)
@src/components/NarrativeMessage.vue (event kind styling — 'look' gets border-left + padding)

<interfaces>
<!-- Color tag system used in NarrativeMessage.vue -->
<!-- {{color:#HEX}}text{{/color}} renders as colored span -->
<!-- {{color:#HEX}}[text]{{/color}} renders as clickable colored link -->
<!-- [text] renders as clickable blue link -->

<!-- Event kinds with border styling (from NarrativeMessage.vue line 12): -->
<!-- 'look': 2px solid #c8ccd044 border-left, 10px paddingLeft, 4px paddingTop/Bottom, gradient bg -->
<!-- 'command': gray color only, NO border, NO padding -->

<!-- addLocalEvent signature (from useEvents.ts): -->
addLocalEvent(kind: string, message: string, scope?: string): void
<!-- To get bordered styling, use 'look' as the kind instead of 'command' -->

<!-- Data sources already available in useCommands.ts: -->
<!-- renownRows, renownPerks, factionStandings, factions, worldEventRows, eventObjectives, regions -->
<!-- questInstances, questTemplates -->
<!-- RENOWN_RANKS from spacetimedb/src/data/renown_data -->
<!-- FACTION_STANDING_THRESHOLDS from spacetimedb/src/data/mechanical_vocabulary -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove client-side quests handler to restore server-side formatting</name>
  <files>src/composables/useCommands.ts</files>
  <action>
Delete the entire `else if (lower === 'quests' || lower === '/quests')` block (lines 374-395). This removes the client-side quests handler so the command falls through to `submitCommandReducer` on line 397, which sends it to the server. The server-side handler in intent.ts (line 657) already has rich formatting with:
- 'look' event kind (gets bordered styling)
- Gold colored quest names: `{{color:#fbbf24}}`
- Purple colored NPC names with clickable links: `{{color:#da77f2}}[NpcName]{{/color}}`
- Green complete status with clickable turn-in: `{{color:#22c55e}}[Turn In QuestName]{{/color}}`
- Gray abandon links: `{{color:#6b7280}}[Abandon QuestName]{{/color}}`
- Progress fractions, quest giver name, and location

No other changes needed for quests — the server handler is already correct.
  </action>
  <verify>
    <automated>grep -n "ACTIVE QUESTS" src/composables/useCommands.ts; echo "Exit: $?"</automated>
  </verify>
  <done>The string "ACTIVE QUESTS" no longer appears in useCommands.ts, confirming the client-side quests handler is removed. The quests command now falls through to the server-side handler.</done>
</task>

<task type="auto">
  <name>Task 2: Add rich formatting to renown, factions, and events commands</name>
  <files>src/composables/useCommands.ts</files>
  <action>
Rewrite the three client-side command handlers to use 'look' event kind (for bordered styling) and color tags. All three currently use `addLocalEvent?.('command', msg)` — change to `addLocalEvent?.('look', msg)` and add color formatting.

**Renown handler** (lines 285-308) — replace the msg construction:
- Header: `{{color:#fbbf24}}Renown Status{{/color}}`
- Rank line: `Rank ${rankNum}: {{color:#fbbf24}}${rankInfo.name}{{/color}} (${points} points)`
- Next rank line with progress bar: compute percentage, show `[========--] 80%` style bar using block chars
- Use `{{color:#22c55e}}` (green) for "Max rank achieved!"
- Active Perks section: use `{{color:#da77f2}}` (purple) for perk names

**Factions handler** (lines 309-334) — replace the msg construction:
- Header: `{{color:#fbbf24}}Faction Standings{{/color}}`
- Color-code standing labels by reputation level:
  - Exalted/Revered: `{{color:#22c55e}}` (green)
  - Honored/Friendly: `{{color:#66d9ef}}` (light blue)
  - Neutral: `{{color:#c8ccd0}}` (gray-white)
  - Unfriendly/Hostile: `{{color:#ff8c42}}` (orange)
  - Hated: `{{color:#ff6b6b}}` (red)
- Faction name: `{{color:#fbbf24}}` (gold)
- Standing value in parentheses after label

**Events handler** (lines 335-373) — replace the msg construction:
- Header: `{{color:#fbbf24}}World Events{{/color}}`
- Active section header: `--- Active ---`
- Event name: `{{color:#fbbf24}}` (gold)
- Region name: `{{color:#da77f2}}` (purple) in parentheses
- Objective progress: `{{color:#66d9ef}}${obj.currentCount}/${obj.targetCount}{{/color}}`
- Recent History section header: `--- Recent History ---`
- SUCCESS outcome: `{{color:#22c55e}}SUCCESS{{/color}}`
- FAILURE outcome: `{{color:#ff6b6b}}FAILURE{{/color}}`
- Consequence text in gray: `{{color:#6b7280}}`

Keep all the existing data-fetching logic (renownRows, factionStandings, worldEventRows, etc.) — only change how the message string is built and the event kind from 'command' to 'look'.
  </action>
  <verify>
    <automated>grep -c "addLocalEvent.*'look'" src/composables/useCommands.ts | grep -q "[3-9]" && echo "PASS: 3+ look events found" || echo "FAIL: expected 3+ addLocalEvent with look kind"</automated>
  </verify>
  <done>All three commands (renown, factions, events) use 'look' event kind and contain color tags for styled display matching the server-side quests formatting pattern.</done>
</task>

</tasks>

<verification>
1. Type `quests` in game — should show bordered display with gold quest names, purple NPC links, progress fractions, abandon links
2. Type `renown` — should show bordered display with gold rank name, progress bar, purple perk names
3. Type `factions` — should show bordered display with gold faction names, color-coded standing labels
4. Type `events` — should show bordered display with gold event names, purple regions, colored outcomes
5. All four commands should have the left-border styling (2px gray) from 'look' event kind
</verification>

<success_criteria>
- Quests command shows server-side rich formatting (color tags, clickable links, quest giver info)
- Renown, factions, and events commands display with 'look' kind border styling and color tags
- No plain 'command' kind used for any of the four info commands
- All existing data (quest progress, faction standings, renown points, event objectives) still displays correctly
</success_criteria>

<output>
After completion, create `.planning/quick/392-restore-quest-formatting-and-add-matchin/392-SUMMARY.md`
</output>
