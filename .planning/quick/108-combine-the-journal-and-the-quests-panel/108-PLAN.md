---
phase: quick-108
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/NpcDialogPanel.vue
  - src/components/ActionBar.vue
  - src/App.vue
autonomous: true
must_haves:
  truths:
    - "Journal panel has two tabs: Journal and Quests"
    - "Clicking Journal tab shows NPC dialog content (existing behavior)"
    - "Clicking Quests tab shows quest list (existing QuestPanel content)"
    - "Action bar shows only a Journal button, no separate Quests button"
    - "Journal panel opens via the Journal action bar button"
  artifacts:
    - path: "src/components/NpcDialogPanel.vue"
      provides: "Combined Journal/Quests panel with tab switching"
    - path: "src/components/ActionBar.vue"
      provides: "Action bar without Quests button"
    - path: "src/App.vue"
      provides: "Single Journal panel with quest data passed through"
  key_links:
    - from: "src/App.vue"
      to: "src/components/NpcDialogPanel.vue"
      via: "quest props passed to NpcDialogPanel"
      pattern: "quest-instances|quest-templates"
    - from: "src/components/ActionBar.vue"
      to: "src/App.vue"
      via: "Journal toggle event (no quests toggle)"
      pattern: "toggle.*journal"
---

<objective>
Combine the Journal and Quests panels into a single tabbed panel. The Journal action bar button opens the combined panel. Remove the separate Quests button from the action bar.

Purpose: Reduce action bar clutter and group related content (NPC conversations and quests) into one panel with tabs.
Output: Single Journal panel with Journal/Quests tabs, Quests button removed from action bar.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/NpcDialogPanel.vue
@src/components/QuestPanel.vue
@src/components/ActionBar.vue
@src/App.vue (lines 211-223 for Journal/Quests panels, line 214 for NpcDialogPanel props, lines 549-550 for imports, lines 996-1009 for computed quest/dialog data, lines 1821-1822 for panel defaults)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add tabs and quest content to NpcDialogPanel</name>
  <files>src/components/NpcDialogPanel.vue</files>
  <action>
Modify NpcDialogPanel.vue to support two tabs: "Journal" (default) and "Quests".

1. Add new props for quest data (same props QuestPanel.vue currently receives):
   - `questInstances: QuestInstanceRow[]`
   - `questTemplates: QuestTemplateRow[]`
   (npcs, locations, regions are already props)

2. Add a reactive `activeTab` ref with values 'journal' | 'quests', defaulting to 'journal'.

3. Add a tab bar at the top of the template (BEFORE the existing panelSplit div). The tab bar should be a simple flex row with two clickable tab buttons styled inline:
   - Background: transparent when inactive, `rgba(255,255,255,0.08)` when active
   - Border-bottom: `2px solid #60a5fa` when active, `2px solid transparent` when inactive
   - Padding: `8px 16px`, cursor pointer, color `#d1d5db` inactive / `#fff` active
   - Font size: `0.85rem`, font weight 600
   - Container: `display: flex`, `gap: 0`, `borderBottom: '1px solid rgba(255,255,255,0.1)'`, `marginBottom: '8px'`

4. Wrap the existing panelSplit div content in a `v-if="activeTab === 'journal'"` block.

5. Add a `v-else-if="activeTab === 'quests'"` block that contains the quest list content (replicate the QuestPanel.vue template logic inline since it's small):
   - Show "No active quests." when characterQuests is empty (using styles.subtle)
   - Otherwise show a list (styles.rosterList) of quest entries with name, giver/location, and progress
   - Compute questRows the same way QuestPanel does (using questInstances, questTemplates, npcs, locations, regions props)

6. Import QuestInstanceRow, QuestTemplateRow, LocationRow types from module_bindings (NpcRow, RegionRow already imported).

7. Add a `questRows` computed property (same logic as QuestPanel.vue's questRows computed).
  </action>
  <verify>TypeScript compilation passes. The component renders without errors.</verify>
  <done>NpcDialogPanel has two tabs. Journal tab shows NPC dialog content. Quests tab shows quest list with progress.</done>
</task>

<task type="auto">
  <name>Task 2: Remove Quests button and panel, pass quest data to Journal</name>
  <files>src/components/ActionBar.vue, src/App.vue</files>
  <action>
In ActionBar.vue:
1. Remove the Quests button entirely (lines 58-64: the button that emits toggle for 'quests').
2. Remove 'quests' from the PanelKey type union.

In App.vue:
1. Remove the entire Quests Panel block (lines 218-223: the div with data-panel-id="quests" and its QuestPanel child).
2. Update the NpcDialogPanel usage in the Journal Panel (line 214) to pass quest data props:
   - Add `:quest-instances="characterQuests"`
   - Add `:quest-templates="questTemplates"`
   (npcs, locations, regions are already passed)
3. Remove the QuestPanel import (line 550: `import QuestPanel from './components/QuestPanel.vue'`).
4. Remove the `quests` entry from the usePanelManager defaults object (line 1822: `quests: { x: 600, y: 140 }`).
5. Do NOT delete QuestPanel.vue file itself (may be useful for reference later).
  </action>
  <verify>Run `npx vue-tsc --noEmit` or equivalent TypeScript check. App renders with Journal button in action bar, no Quests button. Clicking Journal opens panel with tabs.</verify>
  <done>Action bar has Journal button but no Quests button. Journal panel receives quest data. No separate Quests panel exists in App.vue.</done>
</task>

</tasks>

<verification>
1. Action bar shows "Journal" button but no "Quests" button
2. Clicking Journal opens a panel with two tabs: "Journal" and "Quests"
3. Journal tab shows NPC dialog list and conversation history (existing behavior preserved)
4. Quests tab shows active quest list with progress (same content as old QuestPanel)
5. No TypeScript compilation errors
</verification>

<success_criteria>
- Single Journal panel with working tab navigation between Journal and Quests content
- Quests button removed from action bar
- All existing Journal and Quest functionality preserved within the combined panel
</success_criteria>

<output>
After completion, create `.planning/quick/108-combine-the-journal-and-the-quests-panel/108-SUMMARY.md`
</output>
