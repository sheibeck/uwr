---
phase: quick-405
plan: "01"
subsystem: level-up-notifications
tags: [level-up, ux, messages, combat, quests]
dependency_graph:
  requires: []
  provides: [target-level-in-levelup-messages]
  affects: [combat.ts, commands.ts, App.vue]
tech_stack:
  added: []
  patterns: [bigint-arithmetic-for-target-level]
key_files:
  created: []
  modified:
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/reducers/commands.ts
    - src/App.vue
decisions:
  - "character.level is still pre-award after awardXp (awardXp only updates xp/pendingLevels, not level) — so character.level + 1n is the correct target level everywhere"
  - "NarrativeHud.vue compact indicators ([level up], [level up x2]) left unchanged — too compact for full target level text"
metrics:
  duration: "~5 minutes"
  completed: "2026-03-11T01:10:55Z"
  tasks_completed: 2
  files_modified: 3
---

# Quick Task 405: Fix Level-Up Pending Text Showing Wrong Information

**One-liner:** All level-up notification messages now show the specific target level number (e.g., "advance to level 2") instead of the ambiguous pending count.

## What Was Done

### Task 1: Server-side level-up messages (combat.ts, commands.ts)

Updated four message blocks across two files:

**combat.ts** — two reward blocks (dead participants, alive participants):
- Group event: "X is ready to advance to level N!" / "X has N levels pending (next: level N)!"
- Private event: "You can advance to level N! Click [Level Up] when ready." / "You have N levels pending (next: level N)! Click [Level Up] when ready."

**commands.ts** — two quest reward blocks (kill quest turn-in, delivery quest):
- "You can advance to level N! Click the [Level Up] indicator when ready." / "You have N levels pending (next: level N)! Click the [Level Up] indicator when ready."

### Task 2: Client-side messages (App.vue)

Updated `onLevelUpClick` and `watch(pendingLevels)`:
- Single pending: `"advance to level N"` using `selectedCharacter.value?.level + 1`
- Multiple pending: `"N levels pending, next: level N"`
- Re-prompt after level applied uses same pattern with fresh level read

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 16d2381 | fix(quick-405): show target level number in server-side level-up messages |
| 2 | 65054d0 | fix(quick-405): show target level in client level-up confirmation and re-prompt |

## Self-Check: PASSED

- spacetimedb/src/reducers/combat.ts: modified (two blocks updated)
- spacetimedb/src/reducers/commands.ts: modified (two blocks updated)
- src/App.vue: modified (onLevelUpClick + watch updated)
- Commits 16d2381 and 65054d0 confirmed in git log
