---
phase: 151-centralize-admin-system
plan: 01
subsystem: backend-auth
tags: [admin, security, reducers, spacetimedb]
dependency_graph:
  requires: []
  provides: [admin-module, requireAdmin-helper]
  affects: [world_events, commands, corpse, combat, renown]
tech_stack:
  added: []
  patterns: [requireAdmin-helper, dependency-injection-auth]
key_files:
  created:
    - spacetimedb/src/data/admin.ts
  modified:
    - spacetimedb/src/data/world_event_data.ts
    - spacetimedb/src/reducers/world_events.ts
    - spacetimedb/src/index.ts
    - spacetimedb/src/reducers/commands.ts
    - spacetimedb/src/reducers/corpse.ts
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/reducers/renown.ts
decisions:
  - requireAdmin passed through reducerDeps DI object rather than imported directly in each reducer file — consistent with existing dependency injection pattern
  - /synccontent guard placed inside the if-branch only, not at reducer level — submit_command is a general player command; only the synccontent sub-command is admin-only
  - end_combat guarded as admin-only on top of existing group-leader check — this reducer is for testing/emergency cleanup, not normal gameplay
metrics:
  duration: ~3min
  completed: 2026-02-18
  tasks_completed: 2
  files_changed: 8
---

# Phase 151 Plan 01: Centralize Admin System Summary

**One-liner:** Single `admin.ts` module with `ADMIN_IDENTITIES` set and `requireAdmin` helper, guarding 8 admin/test reducers that were previously open to all players.

## What Was Built

- `spacetimedb/src/data/admin.ts` — new file housing `ADMIN_IDENTITIES` (hex identity set) and `requireAdmin(ctx)` helper that throws `SenderError('Admin only')` for non-admins
- Removed `ADMIN_IDENTITIES` export from `world_event_data.ts` (content data file is no longer responsible for auth)
- `requireAdmin` wired through `reducerDeps` in `index.ts` and destructured in each affected reducer file

## Admin Commands Now Protected

| Reducer | File | Guard Position |
|---------|------|----------------|
| `fire_world_event` | world_events.ts | First line (was inline) |
| `resolve_world_event` | world_events.ts | First line (was inline) |
| `/synccontent` (submit_command branch) | commands.ts | Inside `/synccontent` branch |
| `create_test_item` | commands.ts | First line before requireCharacterOwnedBy |
| `create_recipe_scroll` | commands.ts | First line before requireCharacterOwnedBy |
| `level_character` | commands.ts | First line before requireCharacterOwnedBy |
| `spawn_corpse` | corpse.ts | First line before requireCharacterOwnedBy |
| `end_combat` | combat.ts | First line before requireCharacterOwnedBy |
| `grant_test_renown` | renown.ts | First line before requireCharacterOwnedBy |
| `grant_test_achievement` | renown.ts | First line before requireCharacterOwnedBy |

## Unaffected Player Commands

- `submit_command` (general), `say`, `hail_npc`, `group_message`, `whisper` — normal player commands, no admin guard
- `choose_perk` — normal player action
- `loot_corpse_item`, `resurrect_character`, `corpse_summon` — player corpse interactions
- All combat abilities and movement reducers

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `spacetimedb/src/data/admin.ts` exists and exports `ADMIN_IDENTITIES` and `requireAdmin`
- [x] `ADMIN_IDENTITIES` only referenced in `data/admin.ts`
- [x] `requireAdmin` used in: admin.ts (def), world_events.ts (x2), commands.ts (x4), corpse.ts (x1), combat.ts (x1), renown.ts (x2), index.ts (DI)
- [x] Commits: 946216a (task 1), 6cd910b (task 2)

## Self-Check: PASSED
