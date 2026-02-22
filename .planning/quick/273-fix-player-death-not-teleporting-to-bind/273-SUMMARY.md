---
phase: quick-273
plan: "01"
subsystem: combat
tags: [combat, death, respawn, teleport]
dependency_graph:
  requires: []
  provides: [auto-respawn-on-death]
  affects: [combat-resolution, death-modal]
tech_stack:
  added: []
  patterns: [helper-function, deps-injection]
key_files:
  created: []
  modified:
    - spacetimedb/src/helpers/character.ts
    - spacetimedb/src/index.ts
    - spacetimedb/src/reducers/combat.ts
decisions:
  - "Re-fetch character row after awardXp in victory path to avoid stale XP spread"
  - "Two-loop approach in defeat path: XP penalty first, then respawn, preserving latest row data"
metrics:
  duration: "~10 minutes"
  completed: "2026-02-21"
  tasks_completed: 2
  files_modified: 3
---

# Phase quick-273 Plan 01: Fix Player Death Not Teleporting to Bind Summary

## One-liner

Auto-respawn dead characters to their bind point with hp=1n at combat resolution, eliminating the manual respawn button requirement.

## What Was Built

Added `autoRespawnDeadCharacter` helper that clears effects/cooldowns, teleports the character to their bound location (or current location if no bind point), sets hp/mana/stamina to 1n, and appends private event messages. Called from both combat death paths in the defeat and victory-with-deaths branches of `registerCombatReducers`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add autoRespawnDeadCharacter helper to helpers/character.ts | 0f4b855 | spacetimedb/src/helpers/character.ts |
| 2 | Wire autoRespawnDeadCharacter into deps and call it from both combat death paths | 81be09c | spacetimedb/src/index.ts, spacetimedb/src/reducers/combat.ts |

## Deviations from Plan

None - plan executed exactly as written.

## Key Decisions

1. **Re-fetch after awardXp (victory path):** `awardXp` mutates the character row (XP, level fields). The re-fetch `ctx.db.character.id.find(p.characterId)` before calling `autoRespawnDeadCharacter` ensures the `...character` spread in the update does not overwrite the freshly-awarded XP with stale values.

2. **Two-loop approach in defeat path:** The XP penalty loop runs first so `applyDeathXpPenalty` writes its changes. The second loop then fetches the post-penalty character row and calls `autoRespawnDeadCharacter`, again avoiding stale spread issues.

## Verification

- Module publishes to local SpacetimeDB without TypeScript errors (both tasks)
- `autoRespawnDeadCharacter` exported from `helpers/character.ts`
- `autoRespawnDeadCharacter` imported, present in `reducerDeps` in `index.ts`
- Destructured from `deps` and called in both death paths in `reducers/combat.ts`
- Characters will have hp=1n when subscription arrives; `showDeathModal` condition (`hp === 0n`) never satisfied

## Self-Check: PASSED

Files verified:
- FOUND: spacetimedb/src/helpers/character.ts (autoRespawnDeadCharacter exported at line 184)
- FOUND: spacetimedb/src/index.ts (autoRespawnDeadCharacter in import and reducerDeps)
- FOUND: spacetimedb/src/reducers/combat.ts (autoRespawnDeadCharacter in deps destructure, victory path line ~3011, defeat path line ~3425)
- FOUND commit: 0f4b855
- FOUND commit: 81be09c
