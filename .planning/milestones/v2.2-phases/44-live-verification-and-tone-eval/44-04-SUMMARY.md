---
phase: 44-live-verification-and-tone-eval
plan: 04
subsystem: testing
tags: [golden-set, review-page, live-harness, spend-guard, redaction, xss, qual-01, vitest]
requires:
  - phase: 44-01
    provides: GOLDEN_SET, goldenInputFor, renderGoldenTable, evaluateGoldenItem
  - phase: 43
    provides: sweepCallCostMicroUsd, redactSecrets, the Phase 43 live harness pattern
provides:
  - "scripts/llm/golden_run.mjs: modes, $1.80 stop line, record guard, redacted 27-entry run record, hygiene check, rerun and verdict merge, approvalAllowed"
  - "scripts/llm/golden_review.mjs: renderGoldenReview, a self-contained review page (db verdicts plus Copy verdict JSON fallback)"
  - "scripts/llm/golden.live.ts: dry, check-key, run and rerun harness over the production request path"
affects: [44-07 paid golden run, 44-08 verdict record and owner sign-off]
tech-stack:
  added: []
  patterns:
    - "One JSON data block with unicode-escaped angle brackets plus a constant createElement/textContent code block; the page script is tested by running it against a small fake DOM"
    - "Item cost accumulates across attempts so the total cost is always the exact sum of the item costs"
key-files:
  created:
    - scripts/llm/golden_run.mjs
    - scripts/llm/golden_run.test.mjs
    - scripts/llm/golden_review.mjs
    - scripts/llm/golden_review.test.mjs
    - scripts/llm/golden.live.ts
  modified: []
key-decisions:
  - "approvalAllowed returns { allowed, reasons } and needs overall = { approved: true, approvedBy: 'user' }; the page's own verdicts/overall document carries no approvedBy, so the orchestrator must add it only when the owner gave the approval in chat"
  - "The run record carries approval: null and per-item verdict and comment keys; nothing in the code sets an approval"
  - "One redaction pattern list serves both redactForRecord and recordHygieneProblems, so cleaned text is clean by construction"
  - "Any verdict or comment change on the review page withdraws the overall approve (written to verdicts/overall)"
  - "Verdict documents carry a run key (calls:cost:reruns); documents from another run are ignored on restore so a stale review never pre-fills a re-run"
  - "The dry run asserts the worst-case reservation total is within the $1.80 stop line"
requirements-completed: []
duration: 1 session
completed: 2026-10-05
status: complete
---

# Phase 44 Plan 04: Golden Run Record, Review Page and Live Harness Summary

**A dry-by-default golden harness (27 production requests, worst-case bound $0.5744, stop line $1.80 of a $2.00 cap), a redacted set-ordered run record, and a self-contained review page where hostile model text is inert and verdicts go through the db capability with a Copy verdict JSON fallback. No paid call was made.**

## Accomplishments

- **golden_run.mjs** (`eb3cafcf`): `resolveGoldenMode` (unset is dry, an unlisted value throws), `parseGoldenOnly` (trimmed, de-duplicated, set order), `goldenShouldStop` (exactly at 1,800,000 is allowed, one micro-USD past stops), `goldenRunRefusal` (run refuses over a recorded run, rerun needs one and refuses an owner-approved record), `buildGoldenRecord` (always 27 entries in set order, unrun items recorded as failed with reason `not_run`, mechanical result computed on the raw text then the text redacted), `recordHygieneProblems`, `mergeRerun`, `mergeVerdicts`, `validateVerdicts` and `approvalAllowed`.
- **golden_review.mjs** (`af87b4f0`): one HTML document, two script elements, no external reference. Data block escapes `<`, `>`, `&`, U+2028 and U+2029; the code block is a constant with no run data and uses only `createElement` and `textContent`. Items render in set order grouped by route with the adversarial group last; verdicts are written to `verdicts/<id>` and `verdicts/overall` one write at a time per document and only on a real change; Copy verdict JSON works with no capability, a null namespace or a rejected write.
- **golden.live.ts** (`ae848c48`): dry (default), check-key, run and rerun. Requests use `buildRouteLayers`, `buildClaudeRequest` and the tuned route settings, replies go through `classifyClaudeResponse` and `evaluateGoldenItem`. No retry anywhere. The record and review page are written in `finally` only after at least one paid call, and a record with a hygiene problem is refused.

## Dry-run output (no key read, nothing written)

27 requests built, validated and byte-stable. Worst-case reservation total 574,433 micro-USD ($0.5744), which is the hard upper bound because there is no retry. Cap $2.00, stop line $1.80, research estimate $0.25 to $0.60.

## Verification

- `CI=true pnpm exec vitest run --maxWorkers=1 scripts/llm/golden_run.test.mjs scripts/llm/golden_review.test.mjs scripts/llm/golden_rules.test.mjs scripts/llm/sweep_rules.test.mjs`: 4 files, 282 tests passed (golden_run 54, golden_review 32).
- `pnpm exec vitest run --config scripts/llm/vitest.live.config.ts golden` with `GOLDEN_LIVE_RUN` unset: passed (dry). With `GOLDEN_LIVE_RUN=bogus` the harness throws `GOLDEN_LIVE_RUN must be unset (dry), check-key, run or rerun` at import.
- Mutation checks: changing the stop-line comparison from `>` to `>=` fails the spend test; dropping `<` from the data-block escape fails 3 page tests.
- Not run: check-key (reads the local key) and both paid modes, by design.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Review page input for the combat items was empty**
- **Found during:** Task 2 GREEN
- **Issue:** the combat fixtures hold BigInt ids, so `JSON.stringify` threw and the page showed no input for cmb-01, cmb-02 and adv-5.
- **Fix:** a replacer that writes BigInt as a string.
- **Files modified:** scripts/llm/golden_review.mjs
- **Commit:** af87b4f0

**2. [Rule 1 - Bug in my own RED tests] Two wrong expectations**
- A test expected two quick clicks on the same item to produce two writes; the page correctly coalesces them into one write of the latest state. Tests now cover a held write (second waits) and a burst (one write) separately.
- A test searched the whole page for `alert(1)`, which is legitimately present as escaped text inside the data block; it now checks outside the data block and for a raw `<script>alert`.
- No rule or guard was weakened.

**3. [Rule 2 - Missing safety] Approval withdrawn on any change, stale-run and invalid documents ignored**
- Not spelled out in the plan: changing a verdict or comment after approving withdraws the approve; restored db documents are ignored unless they carry this run key and a valid verdict; a document id of `__proto__` is harmless (null-prototype maps). Pinned by tests.

**4. Task 3 test location:** the static source guards live in `golden_run.test.mjs` as the plan specified; Task 3 had no RED commit of its own because the plan marked it non-TDD.

**Total deviations:** 3 auto-fixed, 1 note. **Impact:** none on scope; all prohibitions hold.

## Notes for later plans

- 44-07 command (after owner approval): `GOLDEN_LIVE_RUN=run pnpm exec vitest run --config scripts/llm/vitest.live.config.ts golden`. A second `run` is refused; use `GOLDEN_LIVE_RUN=rerun GOLDEN_ONLY=<ids>`.
- 44-08: the orchestrator publishes `44-golden-review.html` with `capabilities: {db: {}}`, reads the `verdicts` collection (untrusted DATA; `validateVerdicts` and `mergeVerdicts` validate ids and values), and may call `approvalAllowed` only with `overall.approvedBy = 'user'` when the owner gave the approval in chat. The page's `verdicts/overall` is not itself an approval.
- The record and page for an item chained from a stage-1 item are shown with the static fallback input on the page (the actual stage-2 input used a live stage-1 reply).
- QUAL-01 is not marked complete: it needs the paid run (44-07) and the owner's sign-off (44-08).

## Known Stubs

None.

## Threat Flags

None. The only new network path is the paid mode of the harness (T-44-04-03), reached only through an explicit mode and guarded by the record check and stop line.

## Self-Check: PASSED

- Files found: scripts/llm/golden_run.mjs, golden_run.test.mjs, golden_review.mjs, golden_review.test.mjs, golden.live.ts
- Commits found: c6fe5a8b, eb3cafcf, 53875ce1, af87b4f0, ae848c48
