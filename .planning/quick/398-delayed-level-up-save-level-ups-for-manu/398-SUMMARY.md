---
phase: quick-398
plan: 01
subsystem: combat-rewards, character, ui
tags: [level-up, xp, combat, hud, pending-levels]
key-files:
  modified:
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/helpers/combat_rewards.ts
    - spacetimedb/src/index.ts
    - spacetimedb/src/reducers/commands.ts
    - spacetimedb/src/reducers/combat.ts
    - src/composables/useSkillChoice.ts
    - src/components/NarrativeHud.vue
    - src/components/NarrativeConsole.vue
    - src/App.vue
    - src/module_bindings/character_table.ts
    - src/module_bindings/types.ts
    - src/module_bindings/types/reducers.ts
  created:
    - src/module_bindings/apply_level_up_reducer.ts
decisions:
  - "awardXp no longer auto-levels; it stores earned levels in pendingLevels on Character"
  - "apply_level_up reducer processes one level at a time and auto-triggers skill gen"
  - "computeRacialAtLevelFromRow exported from combat_rewards for reuse in apply_level_up"
  - "CharacterInfoPanel not used in App.vue (removed in quick-383); level-up UI lives entirely in HUD + addLocalEvent confirmation"
  - "Auto-trigger watch on character.level removed from useSkillChoice (skill gen now server-side via apply_level_up)"
metrics:
  duration: "~30 minutes"
  completed: "2026-03-10"
  tasks_completed: 3
  files_changed: 13
---

# Quick-398: Delayed Level-Up (Save Level-Ups for Manual Trigger)

**One-liner:** Deferred level-up system using pendingLevels counter — XP thresholds queue levels, players apply them manually via HUD indicator and confirmation flow, each triggering stat update + LLM skill gen.

## What Was Built

Characters no longer auto-level when XP thresholds are crossed. Instead:
1. `awardXp` calculates how many levels were earned and stores the count in `pendingLevels` on the Character row, updating only XP.
2. A new `apply_level_up` reducer processes one pending level at a time: updates stats/racial bonuses, decrements `pendingLevels`, triggers skill generation via LLM task.
3. The NarrativeHud top bar now shows name, level, race, and class.
4. A clickable amber "LEVEL UP" indicator appears in the HUD when `pendingLevels > 0`.
5. Clicking it shows a confirmation via `addLocalEvent` with a `[Confirm Level Up]` link.
6. Typing "level up" also shows the confirmation; typing/clicking "confirm level up" calls the reducer.
7. Multiple pending levels are processed one at a time.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Server-side delayed level-up | c655330 | tables.ts, combat_rewards.ts, index.ts, commands.ts, combat.ts |
| 2 | Client-side level-up UI | ae296aa | useSkillChoice.ts, NarrativeHud.vue, NarrativeConsole.vue, App.vue |
| 3 | Publish, generate bindings, verify | cefaa2a | src/module_bindings/* |

## Deviations from Plan

### Adaptation: CharacterInfoPanel Not Mounted

**Found during:** Task 2
**Issue:** The plan described adding a Level Up link to CharacterInfoPanel.vue, but that component was removed from App.vue in quick-383 (replaced by chat commands).
**Fix:** Level-up confirmation flow uses `addLocalEvent` in the narrative console instead. The HUD LEVEL UP click calls `onLevelUpClick()` which adds a local event with the [Confirm Level Up] link. Same UX goal achieved differently.
**Rule:** Rule 2 (auto-adapt missing functionality)

## Self-Check: PASSED

- c655330 (Task 1): FOUND
- ae296aa (Task 2): FOUND
- cefaa2a (Task 3): FOUND
- combat_rewards.ts: FOUND
- apply_level_up_reducer.ts: FOUND
