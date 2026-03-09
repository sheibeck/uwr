---
phase: quick-383
plan: 01
subsystem: narrative-ui
tags: [chat-commands, ui-cleanup, character-info]
dependency_graph:
  requires: [quick-356]
  provides: [stats-command, abilities-command, character-command]
  affects: [intent-reducer, app-vue, action-bar, narrative-hud]
tech_stack:
  patterns: [server-side-chat-commands, formatPercent-helper, race-iter-lookup]
key_files:
  modified:
    - spacetimedb/src/reducers/intent.ts
    - src/App.vue
    - src/components/ActionBar.vue
    - src/composables/usePanelManager.ts
    - src/components/NarrativeHud.vue
decisions:
  - "Ported fmtLabel/fmtVal/fmtPenalty from RacialProfilePanel.vue as local helpers in reducer"
  - "Race lookup uses iter() since race table has no name index"
  - "CharacterInfoPanel files preserved (not deleted) for future cleanup"
metrics:
  duration: 4min
  completed: "2026-03-09T00:54:00Z"
---

# Quick Task 383: Replace CharacterInfoPanel with Chat Commands Summary

Three new chat commands (stats, abilities, character) replace the CharacterInfoPanel UI, continuing the narrative console consolidation.

## Completed Tasks

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add stats, abilities, and character commands to submit_intent | 006003b | spacetimedb/src/reducers/intent.ts |
| 2 | Remove CharacterInfoPanel from UI | 98cbb1d | src/App.vue, src/components/ActionBar.vue, src/composables/usePanelManager.ts, src/components/NarrativeHud.vue |

## What Was Built

### Enhanced stats command
- Full character header with name, level, race, class
- Resources section: HP, Mana, Stamina, XP, Gold
- Base stats: STR, DEX, INT, WIS, CHA
- Combat values: Hit, Dodge, Parry, Crit (Melee/Ranged/Divine/Arcane), Armor Class, Perception, CC Power, Vendor mods

### New abilities command (aliases: ab)
- Lists all unlocked abilities sorted by level requirement
- Shows name, level, description, kind, resource type/cost, cast time, cooldown
- Graceful empty state: "You have no abilities yet."

### New character command (aliases: char)
- Shows class name with weapon/armor proficiencies
- Full race profile: name, description, racial bonuses, penalties
- Level bonus calculation (per even level + accumulated total)
- Graceful fallback when race data unavailable

### UI cleanup
- CharacterInfoPanel FloatingPanel block removed from App.vue
- Character (C) button removed from ActionBar
- Inv button removed from NarrativeHud
- characterInfo removed from panel manager ID list

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED
