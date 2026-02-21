---
phase: quick-265
plan: "01"
subsystem: combat
tags: [bug-fix, adds, aggro, combat-tick]
dependency_graph:
  requires: []
  provides: [correct-aggro-entries-for-adds, immediate-aggro-target-for-adds]
  affects: [spacetimedb/src/reducers/combat.ts]
tech_stack:
  added: []
  patterns: [characterId-disambiguation, eager-aggro-target]
key_files:
  modified:
    - spacetimedb/src/reducers/combat.ts
decisions:
  - "Used (p as any).characterId ?? p.id to handle both Character rows and CombatParticipant rows without changing function signatures"
  - "Set aggroTargetCharacterId eagerly to activeParticipants[0].characterId rather than waiting for the attack loop to run topAggro"
metrics:
  duration: "~10 minutes"
  completed: "2026-02-21"
  tasks_completed: 2
  files_modified: 1
---

# Phase quick-265 Plan 01: Fix Adds Never Showing Aggro Target Summary

Fix add enemies never attacking or showing aggro targets — corrected `addEnemyToCombat` characterId resolution and added immediate aggro target assignment on add arrival.

## What Was Built

Two focused changes to `spacetimedb/src/reducers/combat.ts`:

1. **Task 1 — CharacterId disambiguation in `addEnemyToCombat`**: The function is called from two call sites with different row shapes. The `startCombatForSpawn` call site passes Character rows (where `p.id` is the character ID). The pending-add call site passes CombatParticipant rows (where `p.id` is the participant row ID and `p.characterId` is the character ID). Previously both used `p.id` for AggroEntry `characterId`, causing the attack loop's `activeIds` check to never match for adds. Now `charId = (p as any).characterId ?? p.id` resolves the correct value for both shapes.

2. **Task 2 — Immediate aggro target on add arrival**: The pending-add processing loop discarded `addEnemyToCombat`'s return value, leaving `aggroTargetCharacterId` as `undefined` until the next attack tick. Now the return value is captured and `aggroTargetCharacterId` is set to `activeParticipants[0].characterId` immediately after the add joins combat.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 021a1cb | fix(quick-265): resolve correct characterId in addEnemyToCombat for both row shapes |
| 2 | c04a5e9 | feat(quick-265): set immediate aggroTargetCharacterId for adds on arrival |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- TypeScript compilation: no errors in `reducers/combat.ts`
- Local publish: succeeded (`uwr` updated on local SpacetimeDB)
- Pre-existing TypeScript errors in `helpers/combat.ts`, `helpers/corpse.ts`, `helpers/location.ts`, `reducers/items.ts`, `reducers/movement.ts`, `reducers/social.ts`, and `seeding/ensure_enemies.ts` are unrelated to this change and were present before execution

## Self-Check: PASSED

- `spacetimedb/src/reducers/combat.ts` modified and committed
- Commit 021a1cb exists: fix(quick-265) characterId resolution
- Commit c04a5e9 exists: feat(quick-265) immediate aggroTargetCharacterId
- Local publish succeeded
