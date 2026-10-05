---
phase: 45-foundation-frame-and-auth
plan: 09
subsystem: session
tags: [session, spacetimedb, reducers, subscriptions, vue]
requires:
  - phase: 45-03
    provides: createConnectionController, defaultControllerDeps
  - phase: 45-04
    provides: bindTable, deriveScreen, shouldPromptReload, buildFrameView, sortCharacters
provides:
  - "createSession: dependency-injected session (screen, frame, characters, picker state, reconnecting, versionPrompt, signIn, selectCharacter, logout, reload, dispose)"
  - "createDefaultSession: real controller, bindTable and auth wiring"
  - "defaultQueries: my_player view plus where(ownerUserId) and where(characterId) subscriptions"
  - "SELECT_TIMEOUT_MS (8000) and LOGOUT_REDUCER_CAP_MS (2000)"
affects: [45-10, 45-11]
tech-stack:
  added: []
  patterns: ["Keyed bindings replaced by sync watchers on userId / activeCharacterId", "login_email once per connection tracked by connection identity", "Reducer wait capped with a timer race that is cleared on settle"]
key-files:
  created:
    - src/session/useSession.ts
    - src/session/useSession.test.ts
    - src/session/logout.test.ts
  modified: []
key-decisions:
  - "Logout disposes every binding (static too), so stale player and character rows never survive into the next sign-in and the keyed-binding watchers see a clean userId = null"
  - "Keyed bindings (characters by userId, pending skills by activeCharacterId) are recreated only when the key changes; a reconnect just re-attaches them via the controller.conn watcher, so the frame keeps its stale rows"
  - "login_email is gated on the connection identity (loginSentFor), not on status flips, so reactive churn on one connection never repeats it"
  - "No cast is needed to relate DbConnection to SessionConn: vue-tsc accepts createConnectionController(defaultControllerDeps()) directly (the plan allowed one cast; none was used)"
requirements-completed: [FND-06]
duration: 25min
completed: 2026-10-05
status: complete
---

# Phase 45 Plan 09: Session orchestration Summary

One `createSession` object wires the connection controller, the table bindings and the login_email / set_active_character / logout reducers into the derived screen, frame view, picker state and reconnect state that the App renders from.

## Tasks

| Task | Name | Commits |
|------|------|---------|
| 1 | createSession core: bindings lifecycle, login_email, derived screen and frame view | RED b2f90ab3, GREEN f3ddb361 |
| 2 | Session actions (sign in, select character, log out, reload) and default wiring | RED 63fa1dec, GREEN 0e927717 |

## What was built

- Static subscriptions (my_player, world_state, app_version, region, location) through camelCase handles; characters scoped by `where(ownerUserId)` and pending skills by `where(characterId)`, each also guarded by a row filter. No identity argument is ever sent; reducer calls use object syntax.
- login_email fires once per connection when the player row has no user; a missing email or a rejected reducer shows the "Sign-in failed" splash, clears the stored session and disconnects.
- Picker: `selectCharacter` calls `setActiveCharacter({ characterId })`, marks the row pending, and fails after 8 s of no change or on rejection; an arriving `activeCharacterId` clears it. Not connected fails without a call.
- Logout waits at most 2 s for the reducer, then clears storage, disconnects without retry, drops all cached rows and returns to the idle splash.
- Reconnect keeps the frame on stale rows; after an outage that cleared the server session the character binding is dropped, login_email is sent again and the picker returns (no auto-restore).

## Verification

- `pnpm vitest run src/session`: 7 files, 111 tests pass (useSession.test.ts 33, logout.test.ts 5).
- `pnpm exec vue-tsc -b` exits 0.
- `pnpm vitest run src --maxWorkers=1`: only the baseline `spacetimedb/src/helpers/measurement.results.test.ts` fails; legacyClientRemoval and the design guards stay green.

## Deviations from Plan

None - plan executed exactly as written. The optional single cast in `createDefaultSession` turned out unnecessary and was removed.

## Known Stubs

None. The session is not mounted yet; 45-10 and 45-11 consume it.

## Threat Flags

None. T-45-09, T-45-10, T-45-14, T-45-17 and T-45-02 mitigations are implemented and tested; T-45-11 (server login_email trusts client email) remains transferred per the plan.

## TDD Gate Compliance

RED (test) commit precedes GREEN (feat) commit for both tasks.

## Self-Check: PASSED

src/session/useSession.ts, src/session/useSession.test.ts and src/session/logout.test.ts exist; commits b2f90ab3, f3ddb361, 63fa1dec and 0e927717 are in git history.
