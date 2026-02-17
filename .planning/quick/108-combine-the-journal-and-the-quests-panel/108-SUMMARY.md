---
phase: quick-108
plan: 01
subsystem: ui
tags: [ui, panels, journal, quests, tabs]
dependency_graph:
  requires: []
  provides: [combined-journal-quests-panel]
  affects: [NpcDialogPanel, ActionBar, App]
tech_stack:
  added: []
  patterns: [tab-switching, prop-forwarding]
key_files:
  created: []
  modified:
    - src/components/NpcDialogPanel.vue
    - src/components/ActionBar.vue
    - src/App.vue
decisions:
  - Combined Journal and Quests into single tabbed panel to reduce action bar clutter
  - Quest content inlined in NpcDialogPanel rather than importing QuestPanel component
  - Tab bar uses inline styles matching existing dark theme palette
metrics:
  duration: ~5min
  completed: 2026-02-17
---

# Quick Task 108: Combine Journal and Quests Panel Summary

**One-liner:** Combined Journal/Quests panels into a single tabbed NpcDialogPanel with Journal/Quests tab switching, removing the separate Quests action bar button.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add tabs and quest content to NpcDialogPanel | f5f2047 | src/components/NpcDialogPanel.vue |
| 2 | Remove Quests button/panel, pass quest data to Journal | 193a3b5 | src/components/ActionBar.vue, src/App.vue |

## What Was Done

### Task 1: Add tabs and quest content to NpcDialogPanel

Modified `NpcDialogPanel.vue` to support two tabs:

- Added `activeTab` reactive ref defaulting to `'journal'`
- Added a tab bar at the top of the template with Journal and Quests buttons using inline styles matching the dark theme (transparent/active backgrounds, blue active underline)
- Wrapped existing panelSplit content in `v-if="activeTab === 'journal'"`
- Added `v-else-if="activeTab === 'quests'"` block replicating QuestPanel.vue logic inline
- Added `questInstances: QuestInstanceRow[]` and `questTemplates: QuestTemplateRow[]` props
- Imported `QuestInstanceRow` and `QuestTemplateRow` types from module_bindings
- Added `questRows` computed property (same logic as QuestPanel.vue)

### Task 2: Remove Quests button and panel, pass quest data to Journal

- `ActionBar.vue`: Removed the Quests button (lines 58-64), removed `'quests'` from the `PanelKey` type union
- `App.vue`: Added `:quest-instances="characterQuests"` and `:quest-templates="questTemplates"` to the NpcDialogPanel usage in the Journal Panel
- `App.vue`: Removed the entire Quests Panel block (the `div` with `data-panel-id="quests"` and its `QuestPanel` child)
- `App.vue`: Removed `import QuestPanel from './components/QuestPanel.vue'`
- `App.vue`: Removed `quests: { x: 600, y: 140 }` from the usePanelManager defaults object

`QuestPanel.vue` was intentionally left in place for reference.

## Verification

- TypeScript check confirms no new errors introduced (all pre-existing errors are unrelated readonly/unused-var issues)
- Action bar shows Journal button but no Quests button
- Journal panel has two tabs: Journal (NPC dialogs) and Quests (quest list with progress)
- Journal tab behavior unchanged
- Quest data (characterQuests, questTemplates) flows through to the Quests tab

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- src/components/NpcDialogPanel.vue: FOUND
- src/components/ActionBar.vue: FOUND
- src/App.vue: FOUND
- Commit f5f2047: FOUND
- Commit 193a3b5: FOUND
