---
status: testing
phase: 46-structured-keeper-replies
source: [46-VERIFICATION.md, 46-10-SUMMARY.md]
started: 2026-10-05T17:45:00Z
updated: 2026-10-05T17:45:00Z
deferred: owner deferred all hands-on verification to one end-of-milestone UAT pass (2026-10-05); items 1, 3, 4 and 6 need paid LLM calls and wait for the owner's go-ahead on the cost estimate
---

## Current Test

number: 1
name: SEG-05 paid golden run
expected: |
  The golden run passes its mechanical rules in the narrator voice, including segments_invalid and keeper_first_person. The eight Phase 44 range_violation items (cre-04, cre-05, skl-01, skl-02, skl-03, ren-01, ren-02, adv-2) no longer fail after the OQ3 (a) budget text. 46-golden-run.json and 46-golden-review.html are written.
awaiting: user response (deferred to end-of-milestone UAT; paid run needs the owner's cost approval first)

## Tests

The detailed list is in 46-VERIFICATION.md (human_verification) and in 46-10-SUMMARY.md under "## Deferred owner verification". Paid-run cost: worst-case reservation about $0.62 (dry run $0.6180), research estimate $0.25 to $0.60, cap $2.00. Nothing is spent without the owner's go-ahead.

### 1. SEG-05 paid golden run
expected: `GOLDEN_LIVE_RUN=run pnpm exec vitest run --config scripts/llm/vitest.live.config.ts golden` passes its mechanical rules in the narrator voice; the eight range_violation items no longer fail.
result: [pending]

### 2. SEG-05 owner tone sign-off
expected: On 46-golden-review.html, the "How the player reads it" lines read in the second-person scene-narrator voice. approvedBy is set only from the owner's own approval in chat.
result: [pending]

### 3. Live combat schema acceptance
expected: One combat run to victory or defeat. The live API accepts COMBAT_NARRATION_SCHEMA, the JSON reply fits the combat maxTokens, an enemy person's speech lands as a dialogue segment, and the combat event rows carry segments.
result: [pending]

### 4. NPC segments in a real session
expected: Talking to an NPC stores a "The Keeper" narration segment and a separate "<NPC> says" dialogue segment. A malformed live reply shows one Keeper line.
result: [pending]

### 5. Console read-through of the new Keeper lines
expected: The arrival, skill offer, renown offer and failure lines, and the shorter NPC and combat fallback lines, read in the second-person narrator voice. This needs the Phase 47 console, or reading the event rows.
result: [pending]

### 6. Live replies in range with the stated budgets (OQ3 a)
expected: Skill, renown and class replies come back with no range_violation. Note the roughly 400 added input tokens per call.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
