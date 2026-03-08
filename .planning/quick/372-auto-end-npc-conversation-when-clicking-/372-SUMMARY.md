---
phase: quick-372
plan: 01
subsystem: client-ui
tags: [npc-conversation, ux, narrative-console]
dependency_graph:
  requires: []
  provides: [auto-end-conversation-on-game-actions]
  affects: [npc-conversation-flow, narrative-command-routing]
tech_stack:
  added: []
  patterns: [game-action-regex-detection, conversation-auto-close]
key_files:
  modified:
    - src/App.vue
decisions:
  - Game action regex pattern covers go/look/attack/gather/craft/bind/inventory/backpack/quests/bank/vendor/shop/buy/sell/who
  - clickNpcKeyword unconditionally ends conversation before any game action processing
metrics:
  duration: 1min
  completed: "2026-03-08T20:23:00Z"
  tasks_completed: 1
  tasks_total: 1
---

# Quick Task 372: Auto-end NPC Conversation on Game Actions Summary

Auto-end NPC conversation when player clicks game links or context action buttons, with regex-based game action detection in onNarrativeSubmit.

## What Changed

### src/App.vue

**clickNpcKeyword handler:** Added conversation auto-end block before combat keyword routing. Any bracket keyword click ([Travel], [Gather], [Attack], [Equip], etc.) now calls `endConversation()` before processing the action.

**onNarrativeSubmit handler:** Replaced the unconditional NPC talk routing with game action detection. A regex pattern identifies commands like "go somewhere", "look", "attack X", "gather X", "inventory", etc. When detected during conversation, the conversation ends and the command falls through to normal processing. Free-form text still routes to `talkToNpcReducer`.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- [x] src/App.vue modified with both changes
- [x] Commit 5301c54 exists
- [x] No new TypeScript errors introduced
