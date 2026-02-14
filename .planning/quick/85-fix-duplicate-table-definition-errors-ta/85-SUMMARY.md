---
phase: quick-85
plan: 01
subsystem: spacetimedb/schema
tags: [bugfix, architecture, deduplication]
dependency_graph:
  requires: []
  provides: [single-source-of-truth-tables]
  affects: [module-compilation, schema-architecture]
tech_stack:
  added: []
  patterns: [centralized-schema-definitions]
key_files:
  created: []
  modified:
    - spacetimedb/src/index.ts
decisions:
  - schema/tables.ts is the single source of truth for all table definitions
  - index.ts imports tables instead of defining them locally
  - Reduced index.ts by 73% (1770 to 464 lines)
metrics:
  duration: 3min
  completed: 2026-02-14
---

# Quick Task 85: Fix Duplicate Table Definition Errors

**Fixed SpacetimeDB module compilation by eliminating duplicate table definitions.**

## One-liner
Removed 73 duplicate table definitions from index.ts and established schema/tables.ts as single source of truth, fixing "name is used for multiple types" compilation errors.

## What Was Done

### Task 1: Remove duplicate table definitions from index.ts ✓
**Commit:** ef7e2da

**Problem:**
After quick-83 eliminated duplicate seeding code, the module failed to compile because both `index.ts` and `schema/tables.ts` defined all ~73 tables with identical `name:` strings. SpacetimeDB saw each table name registered twice, causing compilation failure.

**Solution:**
1. Removed `schema` and `table` imports from spacetimedb/server (kept `t` and `SenderError`)
2. Added import from `./schema/tables` for:
   - `spacetimedb` (the schema instance)
   - All tables used in the file: Player, Character, FriendRequest, Friend, GroupMember, GroupInvite, EventGroup, CharacterEffect, CombatResult, CombatLoot, EventLocation, EventPrivate, NpcDialog, QuestInstance, Faction, FactionStanding, UiPanelLayout, CombatParticipant, CombatLoopTick, PullState, PullTick, HealthRegenTick, EffectTick, HotTick, CastTick, DayNightTick, DisconnectLogoutTick, CharacterLogoutTick, ResourceGatherTick, ResourceRespawnTick, EnemyRespawnTick, TradeSession, TradeItem, EnemyAbility, CombatEnemyCooldown, CombatEnemyCast, CombatPendingAdd, AggroEntry
3. Removed all 73 local `const XxxTable = table(...)` definitions (lines 199-1444)
4. Removed the local `export const spacetimedb = schema(...)` call (lines 1446-1520)
5. Kept all other code intact: tick_day_night reducer, registerViews, spacetimedb.init, clientConnected, clientDisconnected, reducerDeps, registerReducers

**Impact:**
- File size: 1770 lines → 464 lines (73% reduction)
- Module compiles without "name is used for multiple types" errors
- All table definitions now exist in exactly one place: schema/tables.ts

## Deviations from Plan

None - plan executed exactly as written.

## Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Import all used tables explicitly | Ensures type safety and makes dependencies clear |
| Keep `t` and `SenderError` imports | Still used in reducerDeps and reducer definitions |
| Remove duplicate reducer declaration | Editing created temporary duplicate, removed in final cleanup |

## Files Changed

| File | Changes | Lines Changed |
|------|---------|---------------|
| spacetimedb/src/index.ts | Removed duplicate table definitions, imported from schema/tables.ts | -1305 |

## Verification

✓ Module compiles without "name is used for multiple types" errors
✓ `grep -c "= table(" spacetimedb/src/index.ts` returns 0
✓ `grep -c "= table(" spacetimedb/src/schema/tables.ts` returns 73
✓ All existing functionality preserved (reducers, views, init, lifecycle hooks)

## Commits

- **ef7e2da** - fix(quick-85): remove duplicate table definitions from index.ts

## Self-Check: PASSED

**Created files exist:**
- ✓ No new files created

**Modified files exist:**
- ✓ spacetimedb/src/index.ts modified

**Commits exist:**
- ✓ ef7e2da exists and contains expected changes

**Functionality verified:**
- ✓ No "name is used for multiple types" errors in build output
- ✓ All table definitions now in schema/tables.ts only
- ✓ index.ts successfully imports from schema/tables.ts
