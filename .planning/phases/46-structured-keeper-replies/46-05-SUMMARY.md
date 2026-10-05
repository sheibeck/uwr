---
phase: 46-structured-keeper-replies
plan: 05
subsystem: golden-harness-review
tags: [golden-harness, review-page, replay-guard, dry-run, seg-05]
requires: ["46-04"]
provides:
  - "golden_review.mjs: reviewLines(item, text) and a 'How the player reads it' block of labelled lines (page data field lines)"
  - "golden.live.ts: record and review paths in the Phase 46 folder (46-golden-run.json, 46-golden-review.html)"
  - "golden_run.test.mjs: Phase 44 record tests read the archived record and run again, with the replay guard"
affects: [46-06, 46-08]
tech-stack:
  added: []
  patterns:
    - "The review page imports the server's pure segments.ts normalizer, so the owner sees exactly the lines the player would"
    - "Replay guard limited to GOLDEN_SHAPE_CHANGED_ROUTES and GOLDEN_RULES_ADDED_IN_46, with a non-vacuous count asserted"
key-files:
  created: []
  modified:
    - scripts/llm/golden_review.mjs
    - scripts/llm/golden_review.test.mjs
    - scripts/llm/golden.live.ts
    - scripts/llm/golden_run.test.mjs
decisions:
  - "reviewLines takes the golden item (route, expectations.allowedSpeakers, input.playerNames) and returns [] for stage routes, unparseable text and replies with no valid segment"
  - "A dialogue speaker outside the allowed speakers is shown as 'The Keeper' with the speech in quotes, because that is what the server normalizer stores"
  - "The raw reply stays below the lines under a 'The raw reply' label"
  - "The harness-source test normalises CRLF before looking for a closing brace at column 0, because a Windows checkout of golden.live.ts holds CRLF"
metrics:
  duration: "~25 min"
  completed: 2026-10-05
  tasks: 2
  files: 4
status: complete
---

# Phase 46 Plan 05: Review page lines, Phase 46 record paths, repaired replay tests Summary

The golden review page now shows each npc and combat reply as the labelled lines a player reads (The Keeper, or "<NPC> says"), built from the server normalizer and rendered as text nodes only. The live harness writes a Phase 46 record, and the Phase 44 record tests run again with a replay guard. Nothing was spent.

## What was built

- **Task 1 (e2308219)** `golden_review.mjs`, `golden_review.test.mjs`:
  - `reviewLines(item, text)`: for npc_conversation and combat_narration, extracts the JSON object with `extractJsonObject`, runs `normalizeSegments` with the item's `allowedSpeakers` and `input.playerNames`, and maps each segment to `{label, text}`. Never throws.
  - `pageData` adds `lines` to every item. The static code block adds a "How the player reads it" label and one row per line (label in its own span) built with `el(...)` and `textContent`, before a "The raw reply" label and the existing raw `pre`. The code block stays a constant string with no run data.
  - 8 new tests: labels, combat wrapped in prose, empty results, unmatched speaker, page data, hostile segment text (script tag, onerror image, closing script sequence appears only in the escaped data block, code block identical across records), code block contents, and a fake-DOM render test showing hostile markup is plain text and no element is made from it. All 32 earlier tests still pass (40 total).
- **Task 2 (866937c3)** `golden.live.ts`, `golden_run.test.mjs`:
  - `PHASE_DIR` is `.planning/phases/46-structured-keeper-replies`, `RECORD_PATH` `46-golden-run.json`, `REVIEW_PATH` `46-golden-review.html`. Modes, spend guard and cost lines untouched.
  - The three Phase 44 record paths (replay, pinned record, pinned verdicts) point at `.planning/milestones/v2.2-phases/44-live-verification-and-tone-eval/`. The file now collects and runs (66 tests pass; it failed at collection before).
  - Shared helpers `shapeChanged(id)` and `replayFailures(stored)`: both replay loops skip items on `GOLDEN_SHAPE_CHANGED_ROUTES` and remove `GOLDEN_RULES_ADDED_IN_46` ids from the replay result. The non-vacuous replay expects the replayed count to equal the ran items on other routes (the record has 27 ran items, so well above zero).
  - New harness-source guard: `golden.live.ts` contains `46-structured-keeper-replies`, `46-golden-run.json` and `46-golden-review.html`, and contains no Phase 44 record, review or folder name.

## Free dry run (cost estimate for the owner)

Command: `env -u GOLDEN_LIVE_RUN -u GOLDEN_ONLY pnpm exec vitest run --config scripts/llm/vitest.live.config.ts golden`. Passed. Output lines:

- `dry: 27 requests built, validated and byte-stable, none sent`
- `dry: worst-case reservation total 574433 micro-USD ($0.5744); there is no automatic retry, so this is the hard upper bound on spend`
- `dry: research estimate for the real spend about $0.25 to $0.60; cap $2.0000, stop line $1.8000`

This is a written estimate only. It does not authorize any spend; `approvedBy` was never set and GOLDEN_LIVE_RUN was never set.

## Verification

- `pnpm exec vitest run scripts/llm`: 9 files, 484 tests pass; the only failing files are the two untouched baseline files `call_log_report.test.mjs` and `proof_rules.test.mjs` (collection failures). golden_run.test.mjs passes.
- `grep -c "export function reviewLines"` 1; `grep -c "46-golden-run.json" golden.live.ts` 1; `grep -c "v2.2-phases" golden_run.test.mjs` 3.
- `git status --porcelain .planning/milestones` prints nothing (Phase 44 files untouched).
- Voice files (`keeper_bible.ts`, `llm_layers.ts`, `llm_schemas.ts`, `llm_routes.ts`) not touched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] CRLF in the harness-source tests**
- **Found during:** Task 2
- **Issue:** On this Windows checkout `golden.live.ts` is CRLF in the working tree, so the test helper `bodyOf`, which looks for `\n}\n`, found no function end and three harness-source tests failed once the file could collect.
- **Fix:** The test reads the harness with carriage returns removed. No change to the harness source line endings.
- **Files modified:** scripts/llm/golden_run.test.mjs
- **Commit:** 866937c3

**2. [Process] Tests-first order**
Task 1 tests were written before the implementation and failed (8 failing) before it was added. Task 2 is not a TDD task; tests and edits were done together.

## Known Stubs

None.

## Threat Flags

None. No new network surface; the page still renders model text only through text nodes, and no paid mode ran.

## SEG-05 status

SEG-05 stays Pending. The harness, rules, items, review page and record paths now fit the segment shape; what remains is the owner-approved paid golden run and the owner's tone sign-off, deferred to the end-of-milestone testing pass.

## Deferred owner verification

None for this plan (no `checkpoint:human-verify` task). Later, with the paid run: open `46-golden-review.html`, judge the "How the player reads it" lines for the narrator voice, and give verdicts.

## Self-Check: PASSED

- FOUND: scripts/llm/golden_review.mjs, golden_review.test.mjs, golden.live.ts, golden_run.test.mjs
- FOUND commits: e2308219, 866937c3
