---
phase: quick-217
plan: "01"
subsystem: player-lifecycle
tags: [inactivity, auto-camp, scheduled-reducer, player-activity]
dependency_graph:
  requires: []
  provides: [sweep_inactivity, lastActivityAt-tracking]
  affects: [Player, characters, groups]
tech_stack:
  added: []
  patterns: [scheduled-sweep, activity-touch-pattern]
key_files:
  created: []
  modified:
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/schema/scheduled_tables.ts
    - spacetimedb/src/seeding/ensure_content.ts
    - spacetimedb/src/reducers/movement.ts
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/reducers/items.ts
    - spacetimedb/src/reducers/commands.ts
    - spacetimedb/src/index.ts
decisions:
  - "Use lastSeenAt as fallback when lastActivityAt is null so existing players are not immediately camped on first deploy"
  - "Touch lastActivityAt in move_character, start_combat, start_tracked_combat, start_pull, use_ability, submit_command, say"
  - "Skip auto-camp if character is actively in combat (activeCombatIdForCharacter check)"
  - "Clear lastActivityAt when player is auto-camped so it does not linger"
metrics:
  duration: "~15 minutes"
  completed_date: "2026-02-19"
  tasks_completed: 2
  files_modified: 8
---

# Phase quick-217 Plan 01: Auto-camp on 15-min inactivity Summary

**One-liner:** Periodic 5-minute sweep auto-camps players whose lastActivityAt (or lastSeenAt fallback) exceeds 15-minute inactivity threshold, skipping combat-active characters.

## What Was Built

Auto-camp system that prevents AFK characters from occupying the world indefinitely:

1. **`lastActivityAt` field on Player** — Optional timestamp updated on every meaningful player action (movement, combat initiation, ability use, chat/commands).

2. **`InactivityTick` scheduled table** — Fires `sweep_inactivity` reducer every 5 minutes. Bootstrapped in both `init` and `clientConnected` hooks.

3. **`sweep_inactivity` reducer** — Iterates all active players every 5 minutes:
   - Skips players without an active character
   - Skips players whose last activity was within 15 minutes
   - Skips players currently in combat
   - For inactive players: fires location event, handles group cleanup (matching `clear_active_character` logic), sends private notification, clears `activeCharacterId` and `lastActivityAt`

4. **Activity touch on 7 reducers** — `move_character`, `start_combat`, `start_tracked_combat`, `start_pull`, `use_ability`, `submit_command`, `say` all update `player.lastActivityAt = ctx.timestamp` after `requireCharacterOwnedBy`.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Add lastActivityAt to Player + InactivityTick table | 4d4d062 | tables.ts, scheduled_tables.ts, ensure_content.ts |
| 2 | Activity tracking + sweep_inactivity reducer | 7c8081b | movement.ts, combat.ts, items.ts, commands.ts, index.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] use_ability is in items.ts, not combat.ts**
- **Found during:** Task 2 (per plan checker note)
- **Issue:** Plan referenced `use_ability` in combat.ts but it is actually defined in `reducers/items.ts`
- **Fix:** Applied activity touch to `use_ability` in `items.ts` instead
- **Files modified:** spacetimedb/src/reducers/items.ts
- **Commit:** 7c8081b

**2. [Rule 1 - Bug] Task 1 files bundled into prior commit**
- **Found during:** Task 1 commit
- **Issue:** The schema changes (tables.ts, scheduled_tables.ts, ensure_content.ts) were committed as part of a pre-existing commit (4d4d062) rather than a fresh commit
- **Impact:** Functionally correct — changes are committed and build successfully

## Verification Results

- `spacetime publish uwr --project-path spacetimedb` compiled and published successfully (with `--clear-database` due to schema migration on local dev instance)
- `spacetime sql uwr "SELECT * FROM inactivity_tick"` returned 1 scheduled row with next fire ~5 minutes from publish
- Module published cleanly to local server

## Self-Check: PASSED

Files modified exist and changes verified:
- `spacetimedb/src/schema/tables.ts` — contains `lastActivityAt: t.timestamp().optional()` on Player
- `spacetimedb/src/schema/tables.ts` — contains `InactivityTick` table definition
- `spacetimedb/src/schema/scheduled_tables.ts` — exports `InactivityTick`
- `spacetimedb/src/seeding/ensure_content.ts` — exports `ensureInactivityTickScheduled`
- `spacetimedb/src/index.ts` — contains `sweep_inactivity` reducer and scheduling wires
- Activity touches present in movement.ts, combat.ts, items.ts, commands.ts

Commits verified:
- `4d4d062` — schema changes (lastActivityAt, InactivityTick, ensureInactivityTickScheduled)
- `7c8081b` — activity tracking + sweep_inactivity reducer
