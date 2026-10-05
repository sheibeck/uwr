---
phase: 46-structured-keeper-replies
plan: 10
subsystem: keeper-voice
tags: [fix2, range-budgets, phase-gate, local-publish, deferred-verification]
requires: ["46-09"]
provides:
  - "OQ3 (a) applied: the per-call text of skill_gen, renown_perk_gen, creation_class_reveal and creation_class states the level's power budgets, read from the server clamp"
  - "Phase gate green: every approved block in source (59 of 59), only baseline failures, client tests and typecheck pass, free golden dry run builds 27 requests"
  - "Local uwr database runs the final module code (code-only publish, no clear, key intact); bindings regeneration produces no diff"
  - "Deferred owner verification list for the end-of-milestone pass, with the refreshed cost estimate"
affects: [47, 46.1]
tech-stack:
  added: []
  patterns:
    - "Budget numbers are probed from clampToBudget itself (one value far below, one far above), so the prompt can never drift from the clamp"
    - "A level-dependent prompt section goes in the volatile user message only, never in the cached route block"
key-files:
  created: []
  modified:
    - spacetimedb/src/data/llm_layers.ts
    - spacetimedb/src/data/llm_layers.test.ts
    - spacetimedb/src/helpers/claude_request.test.ts
    - spacetimedb/src/helpers/__snapshots__/claude_request.test.ts.snap
    - spacetimedb/src/helpers/renown.ts
    - spacetimedb/src/helpers/renown_llm.test.ts
    - scripts/llm/golden_set.mjs
    - scripts/llm/golden_rules.test.mjs
key-decisions:
  - "OQ3 = (a): state the budgets in the per-call text. range_violation stays a failure; golden_rules.mjs and every Phase 44 verdict are untouched"
  - "The budget lists every ability kind in the server table (27), at the call's level; class routes use level 1 because creation_validate clamps creation abilities at level 1"
  - "Renown offers needed a level in their input (RenownPerkInput had none): optional characterLevel, set at enqueue from the character, mirroring the level the apply step clamps at"
metrics:
  duration: "about 55 minutes"
  completed: 2026-10-05
  tasks: 2
  files: 8
status: complete
---

# Phase 46 Plan 10: OQ3 range budgets, phase gate and local publish Summary

The owner's OQ3 answer (a) is applied: the volatile message of the four ability routes now carries a computed power budget for the call's level, the cached prompt layers are unchanged, `range_violation` still fails, and the phase gate is green offline and on the local server. The paid golden run and the tone sign-off (SEG-05) are written down for the end-of-milestone pass.

## Owner decision applied

46-VOICE-CHANGES.md section H, recorded 2026-10-05 after the owner replied "approved" in chat: "OQ3 | 44 Fix 2 range budgets (a, b or c) | (a) | (a) state the budgets in the per-call text". The approval record adds: "OQ3 (b) (treating range_violation as a note, a rule change) was not chosen."

So only the (a) branch ran. `scripts/llm/golden_rules.mjs` is unchanged (`range_violation` is still a failure and the `GOLDEN_RULES` id list is unchanged); the Phase 44 verdicts stay as recorded; `golden_run.test.mjs` needed no change.

## Task 1: the per-call power budget (commit 95702309)

- `llm_layers.ts` imports `clampToBudget` from `../helpers/skill_budget` (a pure module, allowed by the pure-module rule). `abilityBudgetBounds(kind, level)` reads each kind's inclusive bounds by running the clamp on a value far below and a value far above every range, so no formula or table value is copied. `buildPowerBudgetText(level)` writes the approved fix2-a wording and lists every kind in `ABILITY_KINDS` (all 27, the same set as `BASE_BUDGET`).
- Where it lands: a trailing paragraph of the volatile message of `skill_gen` (level of its input), `renown_perk_gen` (the new `characterLevel` of its input), `creation_class_reveal` and `creation_class` (level 1). `ROUTE_BLOCKS` and the Keeper Bible are unchanged, and every other route's volatile text is unchanged (a test pins this for all ten routes).
- The text for a level-5 call is about 1,300 characters, roughly 400 input tokens per call (the package sample estimated 258 for fifteen kinds; the real line lists all 27).
- Tests (`llm_layers.test.ts`, 8 new): the kind set equals the budget table; for every kind at levels 1 to 12 the stated range equals the formula recomputed independently from `BASE_BUDGET` and equals the clamp's own behavior (the edges are fixed points, one step outside moves to the edge); the level-5 sample and the Phase 44 cross-check (`dot` at level 2 is 9 to 20); per-route levels (2, 5, 8 for skills, the renown character level, 1 for class routes); route blocks and the other six routes carry no budget; no player text in the section. A golden test checks the request of every golden item states the right level (skills 2, 5, 8; renown 5, 10; class reveal and fill 1) and that only the four ability routes carry a budget.
- Snapshots: `claude_request.test.ts.snap` re-recorded with `-u`; the diff shows exactly four routes changed (`creation_class_reveal`, `creation_class`, `skill_gen`, `renown_perk_gen`), each only by the appended budget paragraph.

## Task 2: phase gate, local publish, deferred list

| Check | Result |
|-------|--------|
| Conformance, prefixes `bible- route- combat- string- fallback-` | `after-blocks 59 missing none, old text still present none`, exit 0 (the plan's one-liner also exits 0; the stronger check normalizes CRLF on both sides and requires the before text gone, per the 46-09 finding) |
| Module suite | 3392 passed, 2 failed, both in `measurement.results.test.ts` (baseline) |
| Scripts suite (`scripts/llm`) | 486 passed; failing files only `call_log_report.test.mjs` and `proof_rules.test.mjs` (baseline); `golden_rules.test.mjs` and `golden_run.test.mjs` pass |
| Client tests (`vitest run --dir src`) | 35 files, 469 tests pass |
| `pnpm exec vue-tsc -b` | exit 0 |
| Free golden dry run (`env -u GOLDEN_LIVE_RUN -u GOLDEN_ONLY`) | "dry: 27 requests built, validated and byte-stable, none sent"; worst-case reservation total 616878 micro-USD ($0.6169) |
| Local publish | ping 200; `spacetime publish uwr -p spacetimedb --server local --break-clients < /dev/null` printed "Updated database with name: uwr"; empty migration plan, no clear request, exit 0; log shows "Updated program" and "Database updated", no panic |
| Stored key | before: `key_set` true, `key_length` 108; after: true, 108 |
| `pnpm spacetime:generate -y` then `git diff --stat src/module_bindings` | empty, and `git status` clean |

The publish printed the pre-existing notice `tsc not found in node_modules` before "Build finished successfully" (already noted in 46-01).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Renown input had no character level**
- **Found during:** Task 1
- **Issue:** The plan says `renown_perk_gen` uses "the character level of its input", but `RenownPerkInput` carries only a rank. The server clamps a chosen perk at `character.level` (applyRenownPerkResult), so the prompt could not state a budget without a level.
- **Fix:** Added an optional `characterLevel` to `RenownPerkInput`; `triggerRenownPerkGeneration` sets it (same default as the apply step: the level, or 1). A job stored before Phase 46 has none and its prompt states no budget. In the golden harness, `goldenInputFor` adds the level from the item's `expectations.characterLevel` (5 and 10), so the fixture and its identity pin are untouched.
- **Files modified:** spacetimedb/src/data/llm_layers.ts, spacetimedb/src/helpers/renown.ts, scripts/llm/golden_set.mjs, with pins in renown_llm.test.ts (character level 6; two exact-input assertions plus one new test) and claude_request.test.ts (renown fixture level 6)
- **Commit:** 95702309

**2. [Rule 3 - Blocking] One pin asserted the class fill text ends with its request line**
- **Found during:** Task 1
- **Issue:** `llm_layers.test.ts` "buildCreationClassFillVolatile ..." required the volatile text to end with "Generate the stats and two more starting abilities for this class."
- **Fix:** The pin now checks that line ends the text before the budget paragraph. Nothing loosened.
- **Commit:** 95702309

No other deviation. No schema, reducer, binding or route-kind change; `skill_budget.ts` untouched.

## Deferred owner verification

All hands-on testing waits for the end-of-milestone pass (owner constraint). Nothing below was run, and nothing paid was run in Phase 46.

1. **Paid golden run (SEG-05).** Command: `GOLDEN_LIVE_RUN=run pnpm exec vitest run --config scripts/llm/vitest.live.config.ts golden`. Run it only after the owner approves the cost estimate: the free dry run's worst-case reservation is **$0.6169** (616878 micro-USD, the hard upper bound because there is no automatic retry; 46-05 had $0.5744, 46-07 had $0.6046, and the OQ3 budget text added the rest), the harness research estimate is about $0.25 to $0.60, the cap is $2.00 and the stop line $1.80. It writes `.planning/phases/46-structured-keeper-replies/46-golden-run.json` and `46-golden-review.html`. If it passes, the eight Phase 44 `range_violation` items (cre-04, cre-05, skl-01, skl-02, skl-03, ren-01, ren-02, adv-2) should no longer fail; if some still do, a rerun of those ids only (`GOLDEN_LIVE_RUN=rerun GOLDEN_ONLY=...`) is the cheaper follow-up, and (b) remains the owner's option.
2. **Owner tone sign-off (SEG-05).** On the review page, judge the "How the player reads it" lines for the narrator voice and give verdicts. `approvedBy` is set only from the owner's own approval in chat. SEG-05 is not marked complete until the run and the sign-off are done.
3. **OQ4, NPC re-sweep decision.** If the run shows `budget_exceeded` or `truncated` on `npc_conversation` (tuned to 512 output tokens, measured p99 379, the narration segment adds roughly 70 to 100 tokens), the owner decides on a paid re-sweep of that route's tuning. Nothing is pre-approved.
4. **Live checks of NPC and combat segments (46-02, 46-03, 46-08).**
   - Talking to an NPC stores a "The Keeper" narration segment and a separate "<NPC> says" dialogue segment in `event_private`.
   - A combat outro stores segments: the live API accepts `COMBAT_NARRATION_SCHEMA` (assumption A1, T-46-08-01), the longer JSON reply stays inside the unchanged combat `maxTokens`, and dialogue from an enemy who is a person lands as a dialogue segment.
   - A malformed reply shows one Keeper line (the apply-layer fallback; after the combat route flip, malformed combat JSON is mostly caught as a billed provider failure instead).
   - Also confirm the live skill, renown and class replies now come back in range with the stated budgets (the point of OQ3 a), and note the added input tokens per call (about 400).
5. **Console read-through (46-09).** Read the arrival, skill offer, renown offer and failure lines in the console once to confirm the unquoted narration reads as intended, and that the shorter NPC and combat fallback lines read in voice.
6. **Phase 47 contract notes.** Render segment text as text nodes only, never markup (A6); `speakerNpcId` is optional; rows without segments render from `message`; the server still writes the player's own "say" echo row (OQ5), which Phase 47's feed design decides how to show. For Phase 46.1: `handleCombatNarrationResult` treats intro, round, victory and defeat identically and the combat fallback line is the exported constant `COMBAT_NARRATION_FALLBACK_LINE`; the `[Round N]` prefix is gone.
7. **Known follow-ups carried from earlier plans.** `failWorldFill` writes a Keeper-voice `creation_error` line without segments when the character row is gone (46-02; wrap it with `keeperFallback` when a plan next touches `world_gen.ts`). The golden rule G3 (the noun "mine" trips `keeper_first_person`) and G4 (a dialogue-only combat reply fails `narration_sentences`) were kept strict as the owner decided; revisit only if the paid run shows them firing. 46-VOICE-CHANGES.md section F10 still quotes the older $0.5744 bound; the figure above supersedes it.

## Known Stubs

None.

## Threat Flags

None. T-46-10-01 mitigated (numbers read from the clamp at call time; tests compare with the formula and the clamp for levels 1 to 12), T-46-10-02 (`range_violation` untouched; the owner chose (a)), T-46-10-03 (`--break-clients` only, stdin closed, empty migration plan, key 108 before and after, bindings diff empty), T-46-10-04 (dry run only with `GOLDEN_LIVE_RUN` and `GOLDEN_ONLY` unset, no paid call, no sweep, no `approvedBy`). No maincloud publish, no clear, no push.

## Self-Check: PASSED

- FOUND: spacetimedb/src/data/llm_layers.ts (`grep -c skill_budget` is 1), llm_layers.test.ts, claude_request.test.ts and its snapshot, renown.ts, renown_llm.test.ts, scripts/llm/golden_set.mjs, golden_rules.test.mjs
- FOUND commit: 95702309
