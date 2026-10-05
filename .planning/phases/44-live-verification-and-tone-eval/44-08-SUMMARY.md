---
phase: 44-live-verification-and-tone-eval
plan: 08
subsystem: testing
tags: [llm, golden-set, tone-eval, qual-01, vitest, owner-review]
requires:
  - phase: 44-07
    provides: the recorded golden run and the review page
provides:
  - "44-golden-verdicts.json: the owner's verdicts, recorded as needs_fixes (12 fail, 14 pass, skl-02 unrated, overall not approved)"
  - "44-TONE-FIXES.md: a proposal-only fix list (route-block level), with the range violations explained and the exact clamps"
  - "pinned golden verdicts tests in golden_run.test.mjs"
affects: [44-10]
tech-stack:
  added: []
  patterns:
    - "Verdict status is derived by code (validateVerdicts, mergeVerdicts, approvalAllowed), never hand-typed; tests tie approved to approvalAllowed"
key-files:
  created:
    - .planning/phases/44-live-verification-and-tone-eval/44-golden-verdicts.json
    - .planning/phases/44-live-verification-and-tone-eval/44-TONE-FIXES.md
  modified:
    - scripts/llm/golden_run.test.mjs
key-decisions:
  - "QUAL-01 is NOT approved: the owner did not press the overall approve and skl-02 has no verdict; no approvedBy user was written and QUAL-01 was not marked complete"
  - "Status needs_fixes (12 failing ids); the unrated skl-02 is kept as null and listed in reasons as missing_verdict:skl-02"
  - "Nothing was applied: no route block, rule, golden item or Keeper Bible edit, and no paid call"
  - "Reply shape (a speaker field, splitting narration from dialogue) is deferred to the UX overhaul (backlog 999.6, UWR Ledger Screens on the Nocturne design system); no schema change is proposed"
requirements-completed: []
duration: owner review, then about 30 min of validation, analysis, record and tests
completed: 2026-10-05
status: complete
---

# Phase 44 Plan 08: Owner Tone Review Record Summary

**The owner reviewed the 27 live outputs and did not approve the tone: 12 items failed, 14 passed, skl-02 was left unrated, so the sign-off is recorded as needs_fixes with a route-block-only fix proposal and nothing applied.**

## Accomplishments

- **Verdicts validated and recorded:** the owner's pasted JSON was treated as data. `validateVerdicts` kept 26 verdicts and rejected skl-02 (null is not pass or fail); `mergeVerdicts` and `approvalAllowed` over the run record gave `allowed: false` with reasons `missing_verdict:skl-02` and `overall_not_owner_approve`. The run key in the paste (27:260433:0) matched the run record. `44-golden-verdicts.json` lists all 27 ids in set order, with the owner's comments (cre-02, adv-1) and words verbatim, `overall.approved: false`, `approvedBy: null`, and 12 failedIds: npc-02, cre-02, cre-04, cre-05, skl-01, skl-03, ren-01, ren-02, cmb-01, adv-1, adv-2, adv-4.
- **Fix proposal (`44-TONE-FIXES.md`):** proposal only. Headline from the owner: make the text read like a story, with the Keeper in the first person ("I") and speech attributed in the prose (a route-block change, no schema). Range violations are explained in plain words with the exact clamped fields (below) and three options (state the server-derived budgets in the prompts, accept the clamp as the contract, or both). Also npc-02 (exclamation), cmb-01 (player_pronoun) and adv-4 (provider refusal), each with files and the `GOLDEN_LIVE_RUN=rerun GOLDEN_ONLY=<ids>` re-run after a fresh cost checkpoint.
- **Pinned tests:** a "pinned golden verdicts" block (5 tests) checks the status vocabulary and set order, pass or fail or null only, the mechanical failures match the run record, approved implies `approvalAllowed` true (and any non-approved status implies it is false and no owner approve), needs_fixes lists failing ids in set order, unrated items are never counted as fails or passes, passes over mechanical failures need a waiver comment, and hygiene plus bounded comments. `golden_run.test.mjs` and `golden_review.test.mjs` pass (97 tests).

## Findings worth the owner's attention

- **The two keeper_pronoun hits are proximity false alarms.** cre-02 matched "them" (meaning the locksmiths) and adv-1 matched "they" (meaning the rules), not a pronoun for the Keeper. A first-person Keeper would remove the word "Keeper" from those sentences, so the rule would not fire; the rule itself is not changed.
- **cmb-01's rule hit is "them" for the two hounds** (named in the previous sentence), but the real tone defect, calling the lone player character "a woman", is not caught by the rule at all.
- **Range violations: 8 items, not 9.** The brief said nine but listed eight (cre-04, cre-05, skl-01, skl-02, skl-03, ren-01, ren-02, adv-2); the run record has eight.
- **Third-person Keeper asides appear in 9 items**, three of which (cre-01, cre-03, cmb-02) the owner passed.

## Range violations (what the server clamps)

| Item | Field | Model wrote | Server stores |
|------|-------|-------------|---------------|
| cre-04 | firstAbility.castSeconds (dot) | 1.5 | 1 |
| cre-05 | abilities[0].effectMagnitude (debuff, L1) | 30 | 6 |
| skl-01 (L2) | skills[0].value1 (dot) | 6 | 9 |
| skl-01 | skills[1].value1 (shield) | 25 | 24 |
| skl-01 | skills[1].effectMagnitude (shield) | 25 | 12 |
| skl-01 | skills[2].value1 (buff) | 0 | 5 |
| skl-02 (L5) | skills[0].value1 (debuff) | 0 | 9 |
| skl-02 | skills[0].effectMagnitude (debuff) | 15 | 12 |
| skl-02 | skills[1].value1 (buff) | 0 | 9 |
| skl-03 (L8) | skills[0].value1 (dot) | 8 | 22 |
| skl-03 | skills[0].effectMagnitude (dot) | 6 | 11 |
| skl-03 | skills[2].value1 (taunt) | 0 | 50 |
| ren-01 (L5) | perks[1].castSeconds (buff) | 1.5 | 1 |
| ren-01 | perks[1].value1 (buff) | 0 | 9 |
| ren-01 | perks[2].value1 (buff) | 0 | 9 |
| ren-02 (L10) | perks[2].value1 (buff) | 0 | 15 |
| ren-02 | perks[2].effectMagnitude (buff) | 4 | 7 |
| adv-2 (L5) | skills[1].value1 (debuff) | 0 | 9 |
| adv-2 | skills[1].effectMagnitude (debuff) | 15 | 12 |
| adv-2 | skills[2].value1 (hot) | 0 | 16 |

13 of 20 are raised to the minimum (9 of them from a value1 of 0), 5 are lowered to the maximum, 2 are non-whole cast times. The prompts do not state these budgets, so the model guesses and the server silently clamps; nothing out of range reaches the game.

## Response shape waits on the UX overhaul

After the review the owner said: "I think we want to look at the ux to determine some things about response shape." So the schema shape (a `speaker` field, splitting narration from dialogue, what highlighting and journals need) is not proposed or decided here. It is recorded in `44-TONE-FIXES.md` as an open question for backlog Phase 999.6 (UWR Ledger Screens, Nocturne design system), with the routes, schemas and files a change would touch listed as input only. The prompt-level voice fixes (first-person Keeper, story-like prose with speech attributed in the text) need no schema and stay as proposals awaiting the owner's approval.

## Deviations from Plan

None. The plan ran as written: the verdict data was validated as untrusted data, the status was decided with `approvalAllowed`, and the owner's mid-task instruction (defer response shape to the UX overhaul) was applied to `44-TONE-FIXES.md` before the commit. One small note: the verdict file carries two extra per-item keys (`route`, `mechanicalFailures`) beyond the plan's list, so a reader can see the rule ids next to each verdict; the tests check them against the run record.

## Known Stubs

None.

## Threat Flags

None. No new network, auth or file-access surface; no paid call; the Keeper Bible file is unchanged (`git diff --exit-code` clean).

## Status for the phase

QUAL-01 is **not approved** and is not marked complete. The recorded status is `needs_fixes`. The path forward is the owner's decision on the fixes, a gap-closure plan applying approved route-block edits offline, a fresh cost checkpoint, a re-run of only the affected ids, and an owner review (including a first verdict for skl-02) ending in the owner's own overall approve.

## Self-Check: PASSED

- Files exist: 44-golden-verdicts.json, 44-TONE-FIXES.md, scripts/llm/golden_run.test.mjs (modified).
- Commit 2222bf46 exists (task 2).
- `CI=true pnpm exec vitest run --maxWorkers=1 scripts/llm/golden_run.test.mjs scripts/llm/golden_review.test.mjs`: 97 passed.
