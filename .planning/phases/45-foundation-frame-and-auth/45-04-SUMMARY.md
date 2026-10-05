---
phase: 45-foundation-frame-and-auth
plan: 04
subsystem: session
tags: [subscriptions, state-derivation, pure-functions, vue, spacetimedb]
requires: ["45-01"]
provides:
  - "bindTable: stale-while-reconnecting table mirror (shallowRef rows, applied/failed refs, attach/dispose)"
  - "deriveScreen: pure choice of splash (7 states), picker, noCharacters or frame"
  - "shouldPromptReload: pure version-bar rule"
  - "frameView: describePlace, timeOfDay, classLine, accountLine, avatarInitial, sortCharacters, buildFrameView"
affects: [45-08, 45-09, 45-10]
tech-stack:
  added: []
  patterns: ["Structural table/connection interfaces instead of generated SDK context types", "Type-only import of ConnectionStatus keeps deriveScreen free of runtime dependencies"]
key-files:
  created:
    - src/net/bindTable.ts
    - src/net/bindTable.test.ts
    - src/session/deriveScreen.ts
    - src/session/deriveScreen.test.ts
    - src/session/versionCheck.ts
    - src/session/versionCheck.test.ts
    - src/session/frameView.ts
    - src/session/frameView.test.ts
  modified: []
key-decisions:
  - "LinkStatus is an alias of ConnectionStatus (type-only import from src/net/connection.ts), so the two cannot drift"
  - "bindTable ignores onApplied/onError from a replaced connection (identity check on the current conn)"
  - "bindTable only unsubscribes an old handle when isActive(), swallowing errors, per the plan"
  - "No automatic reload on version mismatch; shouldPromptReload is a plain comparison suppressed in dev"
requirements-completed: [FND-06, FND-03]
duration: 12min
completed: 2026-10-05
status: complete
---

# Phase 45 Plan 04: Session pure core Summary

Reconnect-safe table binding, screen derivation (seven splash states, picker, no-characters, frame), the version-prompt rule and the header/rail/picker projections, all pure and tested (46 new tests).

## Tasks

| Task | Name | Commits |
|------|------|---------|
| 1 | bindTable | RED 406349c4, GREEN b53f1ceb |
| 2 | deriveScreen and shouldPromptReload | RED 400a287d, GREEN 8dea0d17 |
| 3 | frameView projections | RED bb7e89f7, GREEN 6623a8a9 |

## Verification

- `pnpm vitest run src/net/bindTable.test.ts src/session`: 46 tests pass (bindTable 11, deriveScreen 22 plus versionCheck 6, frameView 7).
- `pnpm exec vue-tsc -b` exits 0.
- `pnpm vitest run src --maxWorkers=1`: only the baseline `spacetimedb/src/helpers/measurement.results.test.ts` fails; no new failures. The existing design-contract and colour guards scan the new files and pass.

## Deviations from Plan

None - plan executed exactly as written. `LinkStatus` is declared as `export type LinkStatus = ConnectionStatus` (type-only import) rather than a repeated literal union, per the orchestrator note; the member set is identical to the plan.

## Known Stubs

None. These are pure modules; wiring into the session happens in 45-09 and 45-10.

## Threat Flags

None. T-45-09 (row filter on bindTable) and T-45-19 (rows kept through disconnect, frame kept while reconnecting) are implemented and tested.

## TDD Gate Compliance

RED (test) commit precedes GREEN (feat) commit for all three tasks.

## Self-Check: PASSED

All eight files exist; commits 406349c4, b53f1ceb, 400a287d, 8dea0d17, bb7e89f7, 6623a8a9 verified.
