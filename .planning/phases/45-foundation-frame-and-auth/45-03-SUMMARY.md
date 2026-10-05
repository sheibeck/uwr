---
phase: 45-foundation-frame-and-auth
plan: 03
subsystem: auth
tags: [auth, oidc, pkce, spacetimedb, reconnect, backoff]
requires: ["45-01"]
provides:
  - "hasExpiredToken and URL/PKCE cleanup on every auth callback outcome"
  - "backoffDelayMs / BACKOFF_MS (1, 2, 5, 10, 20, then 30 s)"
  - "createConnectionController: client-owned DbConnection lifecycle with retry, rejected/unreachable classification, intentional disconnect and online/visible resume"
  - "buildDbConnection, defaultControllerDeps, toHttpBase, window.__db_conn and window.__my_identity"
affects: [45-04, 45-09]
tech-stack:
  added: []
  patterns: ["Injectable deps so the controller is unit-tested with fake timers and a fake builder", "Per-attempt record with handled/intentional flags guards duplicate and stale callbacks"]
key-files:
  created:
    - src/auth/spacetimeAuth.test.ts
    - src/net/backoff.ts
    - src/net/backoff.test.ts
    - src/net/connection.ts
    - src/net/connection.test.ts
  modified:
    - src/auth/spacetimeAuth.ts
    - src/connectionLogging.ts
key-decisions:
  - "connect() only starts from idle, rejected or expired; it is a no-op while an attempt or retry is underway, so a repeat call cannot reset the backoff"
  - "A synchronous throw from build is treated as a connection failure and enters the normal retry path"
  - "window.__db_conn / __my_identity are cleared in buildDbConnection's onDisconnect when they still point at that connection, which also covers intentional disconnect"
  - "connection.test.ts runs under happy-dom because importing the auth module reads window.location at import time when no redirect env is set"
requirements-completed: [FND-06]
duration: 20min
completed: 2026-10-05
status: complete
---

# Phase 45 Plan 03: Auth fixes and connection controller Summary

Client-owned SpacetimeDB connection controller with 1/2/5/10/20/30 s backoff, unreachable vs rejected-token classification (ping probe or 3 consecutive token failures), no retry on intentional disconnect, and online/visible-tab resume, plus `hasExpiredToken` and guaranteed URL cleanup in the PKCE callback.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | hasExpiredToken, URL cleanup on callback failure, auth tests | f13529f9 |
| 2 | Backoff schedule and connection controller core | 62e9ee79 |
| 3 | Real DbConnection builder, ping probe, online/visibility resume | 701f39e9 |

## Verification

- `pnpm vitest run src/auth src/net src/connectionLogging.test.ts src/legacyLlmRemoval.test.ts src/legacyClientRemoval.test.ts`: all pass (auth 10 tests, net 36 tests including 12+ controller behaviors).
- `pnpm exec vue-tsc -b`: exit 0.
- `pnpm vitest run --maxWorkers=1`: only the 4 baseline failures (3 scripts/llm test files, measurement.results.test.ts); no new failures, and the 45-02 design guards stay green.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ShallowRef typing under generic C**
- **Found during:** Task 3 (vue-tsc)
- **Issue:** `shallowRef<C | null>(null)` did not satisfy `Readonly<ShallowRef<C | null>>` for a generic constraint.
- **Fix:** Cast to `ShallowRef<C | null>`; fake connection in tests typed with `vi.fn<() => void>()`.
- **Files modified:** src/net/connection.ts, src/net/connection.test.ts

**2. [Process] TDD ordering**
- Tasks were marked `tdd="true"`, but implementation and tests were written together and committed per task as a single `feat` commit, so there are no separate RED commits. Tests cover every behavior bullet and were run green before each commit.

**3. [Rule 2 - Robustness] build() throwing synchronously**
- Handled as a connection failure (retry path) rather than escaping the timer callback. Not in the plan's behavior list.

## Known Stubs

None.

## Threat Flags

None. T-45-01 through T-45-04 mitigations are implemented and tested as planned; T-45-13 (window globals) accepted and cleared on disconnect.

## Self-Check: PASSED

All created files exist and commits f13529f9, 62e9ee79, 701f39e9 are in git history.
