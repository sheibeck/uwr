---
phase: 46-structured-keeper-replies
plan: 01
subsystem: llm-narrative-contract
tags: [segments, schema, event-tables, bindings, pure-module]
requires: []
provides:
  - "spacetimedb/src/helpers/segments.ts: pure segment contract (clamps, canonical speakers, Keeper wrapping, flatten, tolerant parse, fallback ladder)"
  - "KeeperSegment product type and optional segments column (last) on event_private, event_location, event_creation"
  - "appendPrivateEvent / appendLocationEvent / appendCreationEvent trailing optional segments parameter"
  - "Regenerated src/module_bindings with KeeperSegment"
affects: [46-02, 46-03, 46-04, 46-05, 46-09, "46.1"]
tech-stack:
  added: []
  patterns:
    - "Model speaker strings are only a lookup key; the stored speaker is The Keeper or a present speaker's canonical name"
    - "Optional column with no default only on event: true tables (refused on persisted tables)"
    - "New logic in an unmocked pure module; events.ts gets no new exports (eight suites mock ./events)"
key-files:
  created:
    - spacetimedb/src/helpers/segments.ts
    - spacetimedb/src/helpers/segments.test.ts
    - spacetimedb/src/schema/event_segments.test.ts
  modified:
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/helpers/events.ts
    - spacetimedb/src/helpers/events.test.ts
    - src/module_bindings/types.ts
    - src/module_bindings/event_private_table.ts
    - src/module_bindings/event_location_table.ts
    - src/module_bindings/event_creation_table.ts
decisions:
  - "Event helpers omit the segments key entirely (conditional spread) when none or an empty array is given, so untouched callers write byte-identical rows"
  - "Player-attribution check runs before the present-speaker match, so a present NPC that shares a player's name is still dropped"
  - "Truncation: at most 599 code points kept, cut at the last whitespace at index 480 or later of that slice, trimEnd, append U+2026; the quote wrap for unmatched speakers clamps the inner text to 598 so the whole stays within 600"
  - "Unmatched or missing dialogue speaker becomes Keeper narration with the cleaned text in straight double quotes and no invented attribution words (wording shown to the owner in 46-06)"
metrics:
  duration: "~20 min"
  completed: 2026-10-05
  tasks: 3
  files: 10
status: complete
---

# Phase 46 Plan 01: Segment contract and storage Summary

A pure, total `segments.ts` (6 segments x 600 code points, canonical speakers only, Keeper wrapping, flattening, never-throwing fallback ladder), an optional typed `segments` column as the last column of three event tables, trailing optional `segments` parameters on the three event helpers, a local `--break-clients` publish with no clear and the key intact, and regenerated client bindings.

## What was built

- **Task 1 (9e8098bf)** `segments.ts` exports exactly the interface block (20 exported names). Imports only `truncateCodePoints`; a static guard test reads the source and fails on any other import. 75 tests include the hostile matrix (spoofed speaker, player-named speaker, unknown kind, missing speaker, whitespace text, 7 and 20 segments, 5000-character text, control and bidi characters, lone surrogates, fenced JSON), the astral-safe truncation, and the 7- and 8-paragraph packing round trip.
- **Task 2 (0d71c3de)** `KeeperSegment = t.object('KeeperSegment', {kind, speaker, text, speakerNpcId?})` defined once above `EventLocation`; `segments: t.array(KeeperSegment).optional()` is the last column of `event_location`, `event_private`, `event_creation` only. `events.ts` gained `import type { Segment }` and a module-private `segmentColumn` helper; export count unchanged (14, same as base).
- **Task 3 (a30a0f58)** local publish and bindings regeneration.

## Publish evidence (Task 3)

Command, exactly: `spacetime publish uwr -p spacetimedb --server local --break-clients < /dev/null` (exit 0). Health before: `/v1/ping` 200.

```
Database Migration Plan
Changed schema of event table event_creation
Changed schema of event table event_location
Changed schema of event table event_private
Warning: All clients will be disconnected due to breaking schema changes
Skipping confirmation due to --yes
Publishing module...
Updated database with name: uwr, identity: c200f2029b92b15e2164adf6951b34cc614ea4063d36996c58cac1799244c14a
```

The plan named only the three event tables. No clear was requested or used, no maincloud, no push. Logs afterwards: `INFO: Database updated`, no panic or error lines.

Key check (`SELECT key_set, key_length FROM admin_llm_status`):

| | key_set | key_length |
|---|---|---|
| before | true | 108 |
| after | true | 108 |

`git diff --stat src/module_bindings` (after `pnpm spacetime:generate -y`):

```
 src/module_bindings/event_creation_table.ts |  7 +++++++
 src/module_bindings/event_location_table.ts |  7 +++++++
 src/module_bindings/event_private_table.ts  |  7 +++++++
 src/module_bindings/types.ts                | 17 +++++++++++++++++
 4 files changed, 38 insertions(+)
```

`index.ts` did not change. Every changed file is expected; each row type gains `segments: option(array(KeeperSegment))` and `types.ts` gains `KeeperSegment`.

## Verification

- `vitest run src/helpers/segments.test.ts src/schema/event_segments.test.ts src/helpers/events.test.ts`: 112 passed.
- Whole module suite (`--maxWorkers=1`): 59 of 60 files pass, 3232 tests pass; the only failure is the baseline `measurement.results.test.ts` (2 tests). `llm_apply.characterization.test.ts` passes with no snapshot change.
- Voice gate `git diff --quiet 6aa1f4f1 -- keeper_bible.ts llm_layers.ts llm_schemas.ts llm_routes.ts` exits 0 (checked after tasks 1 and 2).
- Greps: `segments: t.array(KeeperSegment).optional()` x3, `t.object('KeeperSegment'` x1, `events.ts` export functions 14 = base 14.
- Client: `pnpm exec vitest run --dir src` 35 files, 469 tests pass; `pnpm exec vue-tsc -b` exits 0.

## Deviations from Plan

### Auto-fixed Issues

None for the plan's behavior. One process note: the plan asked for tests first (RED). I wrote `segments.ts` and its tests in the same pass and ran them together (75 pass on first run), so there is no separate failing-test commit; Tasks 1 and 2 are single commits. No `tdd` gate section applies (plan type is `execute`).

The publish printed `tsc not found in node_modules` before "Build finished successfully" (pre-existing toolchain notice; the build succeeded).

## Deferred owner verification

None for this plan (no `checkpoint:human-verify` task). Note for the end-of-milestone pass: after the new schema, event rows written by narrative routes will begin carrying `segments` only once 46-02 and 46-03 land.

## Known Stubs

None.

## Threat Flags

None. The segments column holds exactly what `message` already holds on public event tables (T-46-01-06 accepted, unchanged).

## Self-Check: PASSED

- FOUND: spacetimedb/src/helpers/segments.ts, segments.test.ts, spacetimedb/src/schema/event_segments.test.ts
- FOUND commits: 9e8098bf, 0d71c3de, a30a0f58
