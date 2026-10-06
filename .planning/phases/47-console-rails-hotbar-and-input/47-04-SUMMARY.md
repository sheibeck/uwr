---
phase: 47-console-rails-hotbar-and-input
plan: 04
subsystem: client-console-state
tags: [feed, llm-indicator, queue, pure-module, tdd]
requires: []
provides:
  - "selectLlmIndicator / indicatorLineFor / routeInConsoleScope / queueGateActive / QUEUE_EXEMPT_ROUTES"
  - "createNarrativeQueue / QUEUE_MAX (FIFO, max 3, one in flight)"
  - "formatRenown / formatFactions / formatFaction / formatEvents / formatGroup / standingLabel"
  - "createFeedStore / acceptRow / FEED_LINE_CAP and the FeedEntry, FeedSource, LocalKind, EventRowLike types"
affects: [47-06, 47-07, 47-09]
tech-stack:
  added: []
  patterns: ["pure modules over structural row subsets", "shallowRef for bigint rows", "injected scheduler for tests"]
key-files:
  created:
    - src/console/indicator.ts
    - src/console/indicator.test.ts
    - src/input/narrativeQueue.ts
    - src/input/narrativeQueue.test.ts
    - src/input/infoCommands.ts
    - src/input/infoCommands.test.ts
    - src/console/feedStore.ts
    - src/console/feedStore.test.ts
  modified: []
key-decisions:
  - "No client Error line for a failed job (research S1): a failed row leaves the active set and the progress line clears; the server's own in-voice line shows."
  - "The queue gate excludes the world_gen fill route (research S3) and cannot be narrowed to one character because my_llm_jobs is per identity."
  - "Info output uses plain titled text; the first line is the title so the feed renders it as a scene block (local kind 'look'). The glyph progress bar is dropped; the percentage carries it."
  - "Feed cap drops whole oldest entries but always keeps the newest entry, even if it alone exceeds the cap."
  - "Group rows from the active character are accepted only when kind is 'group' (research A3)."
requirements-completed: [CON-01, CON-06, INP-02]
status: complete
duration: 20min
completed: 2026-10-05
---

# Phase 47 Plan 04: Console state modules Summary

Four pure modules: the ported LLM progress-line selection with the narrative queue gate, a three-line FIFO send queue, five plain-text info formatters, and a capped, batched, deduped, per-character in-memory feed store.

## What was built
- `src/console/indicator.ts`: behavior ported from the old `useLlmStatus` (tag v2.2-client), rewritten. Every string, pool, priority and status list comes from `@game-data/llm_indicator_lines`. Active statuses only, silent routes never show, creation-only routes are out of the game console, highest priority then oldest then lowest id wins, rotation wraps (negative and huge values). `queueGateActive` is true for an active, non-silent, game-scope job that is not in `QUEUE_EXEMPT_ROUTES` (`['world_gen']`).
- `src/input/narrativeQueue.ts`: `shallowRef` items and `ref` inFlight; `enqueue` refuses the fourth line; `takeNext` releases the head only when the gate is clear and nothing is in flight; `beginDirect` and `settle` bracket a direct send; `drop` returns every queued line so the caller announces them.
- `src/input/infoCommands.ts`: `renown`, `factions`, `faction <name>`, `events`, `group` over subscribed data. Rank names from `@game-data/renown_data`, standing labels from `FACTION_STANDING_THRESHOLDS`. No color tokens, brackets or exclamation marks (asserted in tests). Group copy says `/leave`.
- `src/console/feedStore.ts`: `acceptRow` second-line filter (private presence or own rows; location exclusion; own group rows only for kind `group`), microtask-batched flush sorted by createdAt, source rank, id; dedupe by `(source, id)` across the batch and store; 300-line cap counting segments; `setCharacter` clears history and the pending batch on change; local entries append immediately with `local:<n>` keys and a queued flag. `FeedEntry` is assignable to `LineSource` (checked in a test).

## Verification
- `pnpm exec vitest run --dir src --maxWorkers=2`: 55 files, 979 tests pass (83 new tests).
- `pnpm exec vue-tsc -b`: clean.
- Plan tests: indicator, narrativeQueue, infoCommands, feedStore and gameDataAlias all green.

## Deviations from Plan
- Process (same as 47-01 to 47-03): implementation and tests were written together and committed once per task, not as separate RED/GREEN commits. The plan type is `execute`, so no TDD gate section applies.
- Test correction (not a code change): one draft expectation put standing -30 at "Unfriendly"; the server thresholds make -30 "Hostile" (Unfriendly starts at -25). The test uses -25.
- `enforceCap` never drops the newest entry, so a single entry larger than the cap still shows (the plan did not specify this edge).

## Commits
- f15a390d: feat(47-04): ported LLM indicator selection and narrative queue
- e95591d2: feat(47-04): local info command formatters
- 2b2eefca: feat(47-04): capped in-memory feed store

## Known Stubs
None.

## Threat Flags
None. T-47-04a: `acceptRow` is a second client-side ownership filter, tested for every source. T-47-09: 300-line cap with oldest-first drop; the known-key set is pruned with the entries. T-47-11: `drop()` returns the lines.

## Flagged assumptions
- CON-06 edge probe stays a manual-review flag for the verifier (several active jobs and a job finishing while a line is in flight are covered by the selection and queue tests).
- Research A3 (drop the active character's own non-chat `event_group` rows) is adopted; the owner's try-out checks no line goes missing.
- Research S1: no client Error line for a failed job; the UI-SPEC "Error: LLM job failed" row is superseded.
- A row dropped by the cap can be re-added if a resubscribe replays it, because the dedupe set tracks only current entries and the pending batch (by design, bounded memory).

## Self-Check: PASSED
All 8 files exist; commits f15a390d, e95591d2 and 2b2eefca verified in git log.
