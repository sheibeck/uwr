---
phase: quick-96
plan: 01
subsystem: npc-dialogue
tags: [npc, dialogue, logging, ui, targeting]
dependency_graph:
  requires: [Phase 19 Plan 02 - NPC interaction reducers]
  provides: [Clean NPC dialogue logging separation, NPC targeting system, /say dialogue interaction]
  affects: [Journal panel, Log panel, Location panel, Command system]
tech_stack:
  added: [NPC selection state, Dialogue option fuzzy matching]
  patterns: [Click-to-select targeting, Fallback command handling]
key_files:
  created: []
  modified:
    - spacetimedb/src/reducers/commands.ts
    - spacetimedb/src/reducers/npc_interaction.ts
    - src/components/LocationGrid.vue
    - src/composables/useCommands.ts
    - src/App.vue
    - src/components/CommandBar.vue
    - src/ui/styles.ts
decisions:
  - NPC conversation text (greetings, dialogue responses, quest text, gift reactions) goes to Journal panel only
  - System notifications ("You begin to talk with X", "You gave X to Y") go to Log panel only
  - NPC targeting uses click-to-select in location panel with visual highlight
  - /say with targeted NPC fuzzy-matches dialogue options (exact > starts with > contains)
  - Dialogue matching validates affinity/faction requirements client-side before triggering
  - NPC selection clears automatically on location change
  - Non-matching /say text falls through to normal say behavior
metrics:
  duration: 6min
  completed: 2026-02-14T15:32:54Z
  tasks: 2
  files: 7
  commits: 2
---

# Quick 96: Fix NPC Dialogue Logging Issues & Add Targeting

**One-liner:** Separated NPC conversation logging (Journal-only) from system messages (Log-only) and added click-to-select NPC targeting with /say dialogue interaction.

---

## Overview

Fixed dual-logging issue where NPC conversation text appeared in both Log and Journal panels, and implemented a new NPC targeting system that allows players to click NPCs to select them and use `/say` to trigger dialogue responses.

**Why this mattered:** Duplicate NPC conversation text cluttered the Log panel, making it hard to read system events. The new targeting system provides a more immersive, chat-like NPC interaction flow.

---

## Changes Made

### Task 1: Fix NPC Dialogue Logging - Journal-only for Conversations

**Backend changes:**
- `spacetimedb/src/reducers/commands.ts` - Removed `appendPrivateEvent` calls for greeting text, quest reminders, and quest offers (lines 89, 109, 132)
- `spacetimedb/src/reducers/npc_interaction.ts` - Removed `appendPrivateEvent` calls for dialogue options and gift reactions; added `appendSystemMessage` import and brief gift notification to Log

**Logging rules:**
- Journal panel: Full NPC conversation text (greetings, dialogue responses, quest text, gift reactions)
- Log panel: Brief system notifications only ("You begin to talk with X", "You gave X to Y")

**Commit:** `83a2a09`

### Task 2: Add NPC Targeting and /say Dialogue Interaction

**UI changes:**
- `src/ui/styles.ts` - Added `gridTileNpcSelected` style with brighter green background and border
- `src/components/LocationGrid.vue` - Added `selectedNpcId` prop, `select-npc` emit, `toggleSelectNpc` handler, click handler and conditional styling on NPC tiles
- `src/App.vue` - Added `selectedNpcTarget` ref, `selectNpcTarget` handler, watch to clear on location change, wired to LocationGrid and useCommands
- `src/composables/useCommands.ts` - Added NPC targeting parameters, `isDialogueOptionUnlocked` helper, `findMatchingDialogueOption` helper with fuzzy matching, updated `/say` and `say` handlers to match dialogue
- `src/components/CommandBar.vue` - Updated `/say` hint to "Talk nearby (targets NPC if selected)"

**Dialogue matching algorithm:**
1. Get root dialogue options for targeted NPC
2. Filter to unlocked options (affinity/faction/renown checks)
3. Try exact match first
4. Try starts-with match
5. Try contains match
6. Fall through to normal say if no match

**Commit:** `7be12ba`

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Testing Notes

**Not tested** - requires module publish and frontend build. Expected behavior:
1. Hailing an NPC shows "You begin to talk with X" in Log, greeting in Journal only
2. Choosing dialogue option shows response in Journal only
3. Giving gift shows "You gave X to Y" in Log, full conversation in Journal
4. Clicking NPC in location panel highlights it with green styling
5. Clicking again deselects
6. Changing location clears NPC selection
7. `/say` with targeted NPC + matching text triggers dialogue option
8. `/say` with non-matching text sends normal say message

---

## Architecture Notes

**Client-side dialogue validation:** The dialogue matching validates affinity/faction requirements on the client before calling the reducer. This prevents unnecessary server round-trips for locked options. Server still validates for security.

**Fuzzy matching hierarchy:** Exact match → starts-with → contains ensures intuitive matching. Players can type partial dialogue text.

**State management:** NPC selection is ephemeral (resets on location change) to prevent stale selections. Similar pattern to enemy targeting.

---

## Self-Check: PASSED

**Created files exist:**
- .planning/quick/96-fix-npc-dialogue-logging-issues-greeting/96-SUMMARY.md ✓

**Commits exist:**
- 83a2a09 (Task 1: Fix NPC dialogue logging) ✓
- 7be12ba (Task 2: Add NPC targeting) ✓

**Modified files verified:**
```bash
git show 83a2a09 --name-only
# spacetimedb/src/reducers/commands.ts
# spacetimedb/src/reducers/npc_interaction.ts

git show 7be12ba --name-only
# src/App.vue
# src/components/CommandBar.vue
# src/components/LocationGrid.vue
# src/composables/useCommands.ts
# src/ui/styles.ts (linter modified, expected)
```

All files confirmed modified as planned.
