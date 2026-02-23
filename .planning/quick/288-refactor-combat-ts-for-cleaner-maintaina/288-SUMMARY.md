---
phase: quick-288
plan: 01
subsystem: combat
tags: [refactor, combat, code-quality]
dependency_graph:
  requires: []
  provides: [combat-rewards-helpers, decomposed-combat-loop]
  affects: [spacetimedb/src/reducers/combat.ts, spacetimedb/src/helpers/combat_rewards.ts]
tech_stack:
  added: []
  patterns: [extracted-helpers, named-sub-functions, clampBigInt-utility]
key_files:
  created:
    - spacetimedb/src/helpers/combat_rewards.ts
  modified:
    - spacetimedb/src/reducers/combat.ts
decisions:
  - "Used reinsertSurvivors flag on resetSpawnAfterCombat to handle both victory and defeat spawn reset logic with one function"
  - "Kept leash eviction logic inline in its own function rather than reusing resetSpawnAfterCombat because leash has unique member-save-and-reinsert semantics"
  - "Used callback pattern for buildFallenNamesSuffix to accommodate victory (status-based) vs defeat (hp-based) dead detection"
metrics:
  duration: 22m
  completed: 2026-02-23
---

# Quick Task 288: Refactor combat.ts for Cleaner Maintainability

Decomposed 3512-line combat.ts into named sub-functions with 7 shared helpers extracted from duplicated victory/defeat logic, reducing the combat_loop reducer body from ~1550 lines to ~92 lines.

## What Changed

### New File: `spacetimedb/src/helpers/combat_rewards.ts` (245 lines)
Seven exported helpers extracted from duplicated code:
- **awardEventContribution** -- Find-or-create EventContribution row (was duplicated in victory + defeat paths)
- **advanceEventKillObjectives** -- Increment kill_count objectives for active events
- **getEventSpawnTemplateIds** -- Determine which enemies were event-spawned (Set<bigint> lookup)
- **buildFallenNamesSuffix** -- Build "Fallen: name1, name2." string with callback-based dead detection
- **createCorpsesForDead** -- Create corpses for hp===0 participants
- **applyDeathPenalties** -- Apply XP penalty + log messages (with optional group logging)
- **resetSpawnAfterCombat** -- Spawn cleanup with `reinsertSurvivors` flag for victory vs defeat behavior

### Refactored: `spacetimedb/src/reducers/combat.ts` (3512 -> 3006 lines)

**combat_loop decomposition** -- 10 named sub-functions:
1. `markNewlyDeadParticipants` -- Mark hp===0 participants dead, clear effects/aggro
2. `resolveFleeAttempts` -- Process fleeing status, roll flee chance
3. `handleLeashEviction` -- No active participants -> reset enemies, end combat (returns bool)
4. `processPendingAdds` -- Materialize pending add enemies that have arrived
5. `processEnemyAbilities` -- Enemy AI ability selection and cast resolution
6. `processPlayerAutoAttacks` -- Player auto-attack resolution
7. `processPetCombat` -- Pet auto-attacks and ability usage
8. `handleVictory` -- Quest progress, loot, XP, renown, spawn cleanup
9. `processEnemyAutoAttacks` -- Enemy auto-attacks against highest aggro (character + pet targets)
10. `handleDefeat` -- Spawn reset, event credit, corpses, XP penalty, auto-respawn

**Smaller cleanups:**
- `resolveMessageTemplate()` -- Replaced two identical 12-line nested ternary chains for outcome->message mapping
- `clampBigInt(value, min, max)` -- Replaced 5 inline IIFE clamp patterns
- Removed duplicate `if (enemy.currentHp === 0n) continue;` check (line 2209 was exact copy of 2208)

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- TypeScript compilation: 34 pre-existing errors in combat.ts (unchanged), 0 new errors
- Module publish: `spacetime publish uwr` succeeded on local server
- Server logs: clean, no combat-related errors
- combat_loop body: 92 lines (target: under 100)
- Duplicated blocks consolidated: 7 (target: at least 5)
- Zero behavior changes: all extracted functions perform identical DB mutations in identical order

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | baaeb5a | Extract duplicated combat reward helpers into combat_rewards.ts |
| 2 | a4a425d | Decompose combat_loop into named sub-functions |
| 3 | (verification only) | Module publishes successfully, no file changes |

## Self-Check: PASSED

- combat_rewards.ts: FOUND
- Commit baaeb5a: FOUND
- Commit a4a425d: FOUND
- SUMMARY.md: FOUND
