---
status: testing
phase: 44-live-verification-and-tone-eval
source: [44-VERIFICATION.md]
started: 2026-10-05T12:00:08Z
updated: 2026-10-05T12:00:08Z
---

## Current Test

number: 1
name: Decide on 44-TONE-FIXES.md, apply approved route-block edits, approved golden re-run, rate skl-02, overall tone approve (QUAL-01)
expected: |
  Owner approves the tone on the review page (verdicts/overall approved by the owner); QUAL-01 can then be marked complete.
awaiting: user response

## Tests

### 1. Tone fixes, golden re-run and owner tone approval (QUAL-01)
expected: Owner decides on 44-TONE-FIXES.md (response shape waits on backlog 999.6), approved edits applied offline with tests, a fresh cost checkpoint, GOLDEN_LIVE_RUN=rerun GOLDEN_ONLY=<ids>, skl-02 rated, overall approve.
result: [pending]

### 2. Paid end-to-end run on uwr-verify (QUAL-02)
expected: After a fresh cost checkpoint (worst case $0.7828 over 39 calls), every domain passes live, per-route p50/p95/p99 recorded, pronoun/tone checks on real replies, streaming rule re-applied in PROJECT.md. uwr-verify was deleted; re-publish it first.
result: [pending]

### 3. Anthropic Console token reconciliation (QUAL-02)
expected: Console totals for the golden window 2026-10-05T08:29:21Z to 08:32:10Z (log: input 5,667, cache write 41,325, cache read 83,717, output 12,903) and the e2e window once it exists agree within 2%.
result: [pending]

### 4. Maincloud run (QUAL-02)
expected: User runs 44-MAINCLOUD-CHECKLIST.md at milestone end and pastes back the results.
result: [pending]

### 5. User checklist sections A and B
expected: 44-USER-CHECKLIST.md A (line rotation, network tab, staged-entry feel, /llm admin) and B (Phase 43 UAT 5 and 6) accepted.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
