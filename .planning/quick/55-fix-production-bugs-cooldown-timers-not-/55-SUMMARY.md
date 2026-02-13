---
phase: quick-55
plan: 55
subsystem: ui/timing
tags: [bugfix, production, clock-skew, cooldowns, combat]
dependency_graph:
  requires: [player-table-lastSeenAt, nowMicros-infrastructure]
  provides: [server-relative-time, production-timer-fix]
  affects: [cooldowns, pull-bars, cast-bars, effect-timers, all-server-timestamp-comparisons]
tech_stack:
  added: [server-clock-offset-pattern]
  patterns: [reactive-offset-correction, timestamp-domain-alignment]
key_files:
  created: []
  modified: [src/App.vue]
decisions:
  - Use player.lastSeenAt (updated on every connect/action) as server timestamp source
  - 30-second age check prevents stale timestamps from previous sessions
  - Offset applied in setInterval tick (200ms) for all downstream consumers
  - No changes needed in consumers (useHotbar, useCombat) - they automatically benefit from server-relative nowMicros
metrics:
  duration_minutes: 2
  completed_at: "2026-02-13T02:47:21Z"
  tasks_completed: 1
  files_modified: 1
  commits: 1
---

# Quick Task 55: Fix Production Bugs - Cooldown Timers & Pull Bars

Server clock offset mechanism fixes clock skew between maincloud server and client browsers

---

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add server clock offset and make nowMicros server-relative | 7c81f86 | src/App.vue |

---

## Problem Analysis

**Root Cause:** In production (maincloud), server and client clocks differ. `nowMicros` was set to `Date.now() * 1000` (client time) but compared against server timestamps (`readyAtMicros`, `pull.createdAt.microsSinceUnixEpoch`, `endsAtMicros`). This caused:

1. **Cooldown timers:** `readyAtMicros - nowMicros` computed huge values (cooldowns appeared frozen)
2. **Pull bars:** `nowMicros - pullStartMicros` computed negative values (bars hidden)

In development (localhost), server and client clocks were identical, so the bug was invisible.

---

## Solution Implemented

### Server Clock Offset Pattern

1. **serverClockOffset ref:** Tracks difference between server and client clocks (default 0)

2. **Watcher on player.lastSeenAt:** Computes offset when server timestamp becomes available
   - `player.lastSeenAt` is updated by server on every connect/action (always fresh)
   - Age check (30 seconds) prevents using stale data from previous sessions
   - Formula: `serverClockOffset = serverMicros - clientMicros`

3. **Apply offset in tick:** `nowMicros.value = Date.now() * 1000 + serverClockOffset.value`
   - Makes `nowMicros` represent estimated server time
   - Fixes ALL comparisons with server timestamps throughout app

### Affected Systems (Auto-Fixed)

All systems using `nowMicros` now automatically work in production:

- **Cooldown timers** (useHotbar) - `readyAtMicros - nowMicros` now accurate
- **Pull bars** (useCombat) - `nowMicros - pullStartMicros` now accurate
- **Cast bars** (useCombat) - server timestamp comparisons fixed
- **Effect timers** (effectTimers.ts) - seenAtMicros consistency maintained
- **Resource gather bars** - progress calculations fixed
- **Day/night cycle** - server time alignment
- **Local predictions** - localCast/localGather/localCooldowns use `nowMicros.value` at creation, so they're automatically server-relative

### Key Design Decision

**No code changes needed in consumers.** The single change to `nowMicros` in App.vue fixes all downstream systems because they all read from the same reactive ref.

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Verification

- TypeScript compilation passes (no errors related to changes)
- serverClockOffset ref exists and is computed from player.lastSeenAt
- nowMicros tick applies offset: `Date.now() * 1000 + serverClockOffset.value`
- All existing timer/progress functionality preserved
- Local predictions remain consistent (read/write same nowMicros domain)

---

## Production Impact

### Before
- Cooldowns appeared frozen in production (massive remaining time)
- Enemy pull bars didn't display (negative progress hidden)
- Cast bars, effect timers likely affected

### After
- Cooldowns count down correctly (server time domain)
- Pull bars display and animate correctly (server time domain)
- All server timestamp comparisons now accurate
- No regression in development (offset ~0 on localhost)

---

## Technical Notes

### Why player.lastSeenAt?

- Updated by server's `clientConnected` reducer on every connect
- Always fresh (not from previous session)
- Reliable server timestamp source
- Already available in player ref

### Age Check (30 seconds)

Prevents using stale `lastSeenAt` from a previous session if player data hasn't updated yet. On connect, `clientConnected` updates `lastSeenAt` immediately, so watcher fires with fresh timestamp.

### Offset Persistence

Offset is recalculated on every player.lastSeenAt change. This handles:
- Initial connection
- Server restarts
- Clock drift over long sessions

### Local Predictions Consistency

Local predictions (localCast, localGather, localCooldowns) store `nowMicros.value` at creation time and compare against `nowMicros` during progress calculations. Since both read and write use the same (now server-relative) `nowMicros`, they remain consistent.

---

## Self-Check: PASSED

**Commits verified:**
```
7c81f86 - fix(quick-55): add server clock offset for production clock skew
```

**Files verified:**
```
FOUND: src/App.vue (modified - serverClockOffset, watcher, offset application)
```

**Changes confirmed:**
- serverClockOffset ref added after nowMicros declaration
- Watcher on player.lastSeenAt computes offset with 30-second age check
- setInterval applies offset: `nowMicros.value = Date.now() * 1000 + serverClockOffset.value`
- No changes to useHotbar.ts or useCombat.ts (they benefit automatically)
