---
phase: 44-live-verification-and-tone-eval
plan: 01
subsystem: testing
tags: [golden-set, mechanical-rules, llm-eval, vitest, injection, pronouns]
requires:
  - phase: 43
    provides: sweep_fixtures.mjs, sweep_rules.mjs, creation_validate, skill_gen, Keeper Bible
provides:
  - "scripts/llm/golden_set.mjs: 27 frozen golden items, chained stage-2 inputs, review table"
  - "scripts/llm/golden_rules.mjs: evaluateGoldenItem and GOLDEN_RULES (pure mechanical assertions)"
  - "spacetimedb/src/helpers/renown_perk_validate.ts: pure validateRenownActivePerk"
affects: [44-04, 44-05, 44-07, 44-08]
tech-stack:
  added: []
  patterns:
    - "Ranges are read by running the server's own clamp over the raw reply and comparing, never by copying limits"
    - "Pure server helpers are split out of runtime-importing modules so offline harnesses can reuse them"
key-files:
  created:
    - scripts/llm/golden_set.mjs
    - scripts/llm/golden_rules.mjs
    - scripts/llm/golden_rules.test.mjs
    - spacetimedb/src/helpers/renown_perk_validate.ts
  modified:
    - spacetimedb/src/helpers/llm_apply.ts
key-decisions:
  - "validateRenownActivePerk moved to a pure helper that llm_apply.ts re-exports, instead of mocking spacetimedb/server in each consumer"
  - "NPC affinity and reward limits that llm_apply.ts keeps inline are mirrored in golden_rules.mjs and pinned by a drift test that reads the server source"
requirements-completed: [QUAL-01]
duration: resumed session
completed: 2026-10-04
status: complete
---

# Phase 44 Plan 01: Golden Set and Mechanical Rules Summary

27 frozen golden items (22 weighted plus 5 canary-carrying adversarial) and a pure `evaluateGoldenItem` rule engine with inclusive range boundaries, never-skipped empty replies, pronoun, injection, prompt-leak and out-of-voice-refusal checks, all proven able to fail by mutation tests.

## Accomplishments

- Golden set: 27 unique stable ids in a fixed run order, deeply frozen, fixtures reused by reference from `sweep_fixtures.mjs`, stage-2 items chained through `classFillInputFrom` and `worldFillInputFrom`, markdown review table.
- Rules: `GOLDEN_RULES` (14 golden-specific ids first, then tone-lint ids in `TONE_RULES` order) and `evaluateGoldenItem(item, outcome)` returning `{ pass, failures, notes }`.
- Tests: 92 tests in `golden_rules.test.mjs` cover set integrity, byte-stable production requests, tag isolation, boundaries at and past every limit, empty replies, one firing and one silent case per rule, fixed ordering, pronouns, adversarial compliance, prompt leak, and the pronoun-pattern drift guard.

## Task Commits

1. Task 1 RED: d9e80bc0 test(44-01): add failing golden set integrity tests
2. Task 1 GREEN: 49f9f6c7 feat(44-01): add the 27-item golden set with chained stage-2 inputs and 5 adversarial payloads
3. Task 2 RED: 48f94718 test(44-01): add failing golden rules tests
4. Task 2 implementation (recovered): 885e54b2 wip: backup all local work. A session interrupted by a disk-failure backup commit; it holds the in-progress `golden_rules.mjs` plus unrelated user files (logo, settings, STATE.md), which were left untouched.
5. Server helper extraction: c6a160ec refactor(44-01): move validateRenownActivePerk into a pure helper
6. Task 2 GREEN: b047d6bb feat(44-01): complete golden mechanical rules (evaluateGoldenItem)

## Files Created/Modified

- `scripts/llm/golden_set.mjs`, `scripts/llm/golden_rules.mjs`, `scripts/llm/golden_rules.test.mjs`: the plan's deliverables.
- `spacetimedb/src/helpers/renown_perk_validate.ts` (new): pure `validateRenownActivePerk` plus its `sanitizeEffectType` helper, moved verbatim.
- `spacetimedb/src/helpers/llm_apply.ts`: imports and re-exports the validator; removed three now-unused imports (`skill_budget`, `EFFECT_TYPES`).

## Decisions Made

- Extract rather than mock: `golden_rules.mjs` is also imported by the later live harness (Plan 44-04), which has no `spacetimedb/server` mock, so a pure helper keeps one source of truth with no duplicated logic.
- The three NPC limits (affinity 5, reward 1,000,000, target count 1 to 1,000) are not exported by the server; they are mirrored in `golden_rules.mjs` with a drift test against `llm_apply.ts`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] golden_rules.mjs could not load under vitest**
- **Found during:** resuming Task 2 GREEN
- **Issue:** it imported `validateRenownActivePerk` from `llm_apply.ts`, whose import chain loads the real `spacetimedb/server` package (`SyntaxError: Unexpected identifier 'iter'`, 0 tests run).
- **Fix:** moved the validator to `renown_perk_validate.ts` and re-exported it from `llm_apply.ts`; pointed `golden_rules.mjs` at the pure module.
- **Verification:** `llm_apply.test.ts` (123), `llm_apply.characterization.test.ts` (158) and `renown_llm.test.ts` (34) pass, run one file at a time, snapshots unchanged; `tsc --noEmit` shows no errors in the touched files.
- **Commit:** c6a160ec, b047d6bb

**2. [Rule 1 - Bug in RED tests] Two test flaws against the plan's spec**
- The "good reply passes for every item" case and the injection_compliance mutation used the generic race fixture ("Tidewright") as the good reply for adv-1. The plan says adv-1 expects `raceName` equal to the plausible name ("Marsh Gnome"), so the rule was right and the fixture wrong. The good outcome for adv-1 now carries "Marsh Gnome".
- The "39-character slice is not a leak" case framed the slice with a preceding space, which extended it back to 40 verbatim characters ("space + 39"), so the rule correctly fired. The frame now puts a colon before the slice and a full stop after it. The 40-character positive cases are unchanged.
- No rule, golden item or test was weakened, deleted or skipped.

**Total deviations:** 2 auto-fixed. **Impact:** none on scope; the plan's prohibitions hold.

## Issues Encountered

None beyond the above. `golden_rules.mjs` from the interrupted session was complete against Tests 1 to 7; only the import and the two test flaws needed fixing.

## Verification

`CI=true pnpm exec vitest run --maxWorkers=1 scripts/llm/golden_rules.test.mjs scripts/llm/sweep_rules.test.mjs`: 2 files, 196 tests passed. `sweep_rules.test.mjs` and the sweep modules are unchanged. No network, no key, no spend, no publish.

## Known Stubs

None.

## Threat Flags

None. The plan's threats are mitigated as designed (tag isolation test, inert synthetic fixtures, mutation tests for every rule, boundary tests against the server clamps).

## Next Phase Readiness

Plans 44-04, 44-05 and 44-07 can import `GOLDEN_SET`, `goldenInputFor`, `renderGoldenTable` and `evaluateGoldenItem` under the live vitest config without a server mock.

## Self-Check: PASSED

Files and commits verified present: golden_set.mjs, golden_rules.mjs, golden_rules.test.mjs, renown_perk_validate.ts; commits d9e80bc0, 49f9f6c7, 48f94718, 885e54b2, c6a160ec, b047d6bb.
