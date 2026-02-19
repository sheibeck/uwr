---
phase: quick-217
verified: 2026-02-19T00:00:00Z
status: passed
score: 4/4 must-haves verified
re_verification: false
---

# Quick-217: Auto-camp on 15-min Inactivity — Verification Report

**Task Goal:** If a player is completely inactive for 15 minutes, auto camp.
**Verified:** 2026-02-19
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A player who takes no action for 15 minutes is automatically camped (activeCharacterId cleared) | VERIFIED | `sweep_inactivity` at index.ts:261 uses `INACTIVITY_TIMEOUT_MICROS = 900_000_000n` (15 min), clears `activeCharacterId: undefined` at line 327 |
| 2 | Players actively playing are never auto-camped | VERIFIED | Activity touch on `lastActivityAt = ctx.timestamp` in `move_character`, `start_combat`, `start_tracked_combat`, `start_pull`, `use_ability`, `submit_command`, `say` — all verified present |
| 3 | Players in combat are not auto-camped even at 15-min mark | VERIFIED | `activeCombatIdForCharacter(ctx, character.id)` check at index.ts:278 — if truthy, `continue` skips the player |
| 4 | Auto-camp fires a location event: `<Name> heads to camp.` so nearby players see it | VERIFIED | `appendLocationEvent(ctx, character.locationId, 'system', \`${character.name} heads to camp.\`, character.id)` at index.ts:282 |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `spacetimedb/src/schema/tables.ts` | `lastActivityAt` optional timestamp on Player; `InactivityTick` scheduled table | VERIFIED | `lastActivityAt: t.timestamp().optional()` at line 13; `InactivityTick` at line 1667; exported in schema() at line 1781 |
| `spacetimedb/src/schema/scheduled_tables.ts` | Exports `InactivityTick` | VERIFIED | `InactivityTick` exported at line 15 |
| `spacetimedb/src/seeding/ensure_content.ts` | `ensureInactivityTickScheduled` exported | VERIFIED | Function defined at line 85, exported, uses 300_000_000n (5-min interval) |
| `spacetimedb/src/index.ts` | `sweep_inactivity` reducer; scheduling wired in `init` and `clientConnected` | VERIFIED | Reducer at line 261; `ensureInactivityTickScheduled(ctx)` called in both `init` (line 378) and `clientConnected` (line 401) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `movement/combat/commands/items` reducers | `player.lastActivityAt` | `ctx.db.player.id.update({ ..._player, lastActivityAt: ctx.timestamp })` | WIRED | Present in `move_character` (movement.ts:30), `start_combat` (combat.ts:693), `start_tracked_combat` (combat.ts:731), `start_pull` (combat.ts:763), `use_ability` (items.ts:634), `submit_command` (commands.ts:188), `say` (commands.ts:243) |
| `sweep_inactivity` | `activeCharacterId` cleared | `ctx.db.player.id.update({ ...player, activeCharacterId: undefined })` | WIRED | index.ts:325-329 — clears both `activeCharacterId` and `lastActivityAt` |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| QUICK-217 | Auto-camp players inactive for 15 minutes | SATISFIED | Full sweep_inactivity reducer implemented; activity tracking on all meaningful player action reducers |

### Anti-Patterns Found

None detected. No TODO/FIXME/placeholder comments or stub implementations found in any modified files.

### Human Verification Required

#### 1. End-to-end inactivity timeout

**Test:** Log in with an active character, take no action for 15+ minutes, then check character state.
**Expected:** Character `activeCharacterId` is cleared; location chat shows `<Name> heads to camp.`; player receives private notification `You have been automatically camped due to inactivity.`
**Why human:** Requires waiting 15+ minutes; can't simulate timing in static analysis.

#### 2. Combat protection

**Test:** Log in, pull enemies into combat, then go AFK for 15+ minutes while still in combat.
**Expected:** Character is NOT auto-camped while combat is active.
**Why human:** Requires a live combat session timed against the sweep interval.

#### 3. Activity touch keeps timer alive

**Test:** Log in with active character, move or chat every 14 minutes for 30+ minutes total.
**Expected:** Character never auto-camps despite total elapsed time > 15 minutes.
**Why human:** Requires multiple timed actions across real sweep cycles.

## Summary

All 4 observable truths verified against the actual codebase. The implementation is complete and substantive:

- `lastActivityAt` field is present on the Player table as an optional timestamp.
- `InactivityTick` scheduled table is defined, exported from `scheduled_tables.ts`, and registered in the schema.
- `ensureInactivityTickScheduled` is implemented and called in both `init` and `clientConnected`.
- `sweep_inactivity` reducer is fully implemented with the correct 15-minute timeout (`INACTIVITY_TIMEOUT_MICROS = 900_000_000n`), combat skip guard, location event, group cleanup (matching `clear_active_character` logic), private notification, and `activeCharacterId` clearance.
- Activity touch (`lastActivityAt = ctx.timestamp`) is wired in 7 reducers covering all meaningful player actions: movement, combat initiation (3 reducers), ability use, command, and chat.
- The reducer reschedules itself every 5 minutes for continuous operation.

No stubs, placeholders, or disconnected code found. The goal is achieved.

---

_Verified: 2026-02-19_
_Verifier: Claude (gsd-verifier)_
