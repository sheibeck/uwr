---
phase: quick-342
plan: 01
subsystem: combat-ui
tags: [combat, narrative, inline-ui]
dependency_graph:
  requires: [useCombat, useEvents, NarrativeMessage]
  provides: [inline-combat-status-bars, inline-action-prompts]
  affects: [NarrativeConsole, App.vue]
tech_stack:
  patterns: [watch-based-event-injection, computed-message-builders]
key_files:
  created: []
  modified:
    - src/composables/useCombat.ts
    - src/App.vue
    - src/components/NarrativeConsole.vue
  deleted:
    - src/components/CombatHud.vue
decisions:
  - Watch roundState for 'resolved' to inject round summaries (not watch on roundSummaryMessage directly to avoid duplicate triggers)
  - Inject actionPromptMessage once per round using round key dedup (avoids re-injection on timer ticks)
  - combatStatusMessage separate computed for initial combat start display (roundSummaryMessage requires resolved round)
  - 500ms delay on combat start injection to allow data population
metrics:
  duration: 4min
  completed: 2026-03-08T03:51:00Z
---

# Quick Task 342: Inline Combat Status Bars in Narrative Panel

Replaced floating CombatHud panel with inline narrative messages for combat HP bars and action prompts using addLocalEvent injection.

## What Changed

### useCombat.ts
- **roundSummaryMessage**: Enemy names now wrapped in `[brackets]` for clickable targeting. HP bar chars removed from bracket wrapping (only name is clickable). Added mana bars (blue #4dabf7) for players with mana > 1.
- **combatStatusMessage**: New computed that shows current HP/mana bars regardless of round state -- used for initial combat start display before any round resolves.
- Player names: own name shown plain, other party members in brackets for targeting.

### App.vue
- Removed `combatHudProps` computed and its prop binding to NarrativeConsole.
- Added three watchers for inline combat event injection:
  1. `roundState` watcher: injects `combat_status` event when round resolves
  2. `actionPromptMessage` watcher: injects `combat_prompt` event once per round (deduped by round key)
  3. `activeCombat.id` watcher: injects initial HP bars + prompt on combat start (500ms delay)
- Added targeting feedback: clicking enemy name in combat injects "Targeting [name]" system event.

### NarrativeConsole.vue
- Removed CombatHud template block, import, and `combatHudProps` prop.

### CombatHud.vue
- Deleted entirely. All combat UI now flows through the narrative stream.

## Deviations from Plan

None -- plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 5e15c30 | feat(342): inject combat status bars and action prompts as narrative events |
| 2 | (included in task 1 + working tree cleanup) | CombatHud removed from NarrativeConsole, file deleted |

## Self-Check: PASSED

- [x] src/composables/useCombat.ts modified with enhanced messages
- [x] src/App.vue modified with watchers and combatHudProps removal
- [x] src/components/NarrativeConsole.vue cleaned of CombatHud references
- [x] src/components/CombatHud.vue deleted
- [x] No remaining CombatHud or combatHudProps references in codebase
- [x] vue-tsc passes (only pre-existing LogWindow.vue error)
