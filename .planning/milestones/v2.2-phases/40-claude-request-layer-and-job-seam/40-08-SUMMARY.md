---
phase: 40-claude-request-layer-and-job-seam
plan: 08
subsystem: llm
tags: [spacetimedb, refactor, extraction, llm_apply, submit_llm_result, characterization, sender-independence]
requires:
  - phase: 40-01
    provides: schema_recorder and test-utils used by the new tests
  - phase: 40-05
    provides: characterization tests and snapshots for submit_llm_result (run unchanged here)
  - phase: 40-07
    provides: documented bigint hand-off for the renown static fallback
provides:
  - helpers/llm_apply.ts with applyLlmResult, applyLlmFailure, one apply function per domain, extractJson, retryWorldGen, toApplyJob, all keyed on the stored job.playerId
  - submit_llm_result reduced to a 22-line thin wrapper
  - Sender-independence, toApplyJob, unknown-domain and static-guard tests
affects: [41, 42]
tech-stack:
  added: []
  patterns:
    - "Executor-agnostic apply: functions take (ctx, job, resultText) and act for job.playerId; a static test forbids any sender read on ctx or tx in llm_apply.ts"
    - "toApplyJob normalizes a legacy llm_task row and an llm_job row to one ApplyJob shape"
key-files:
  created:
    - spacetimedb/src/helpers/llm_apply.ts
    - spacetimedb/src/helpers/llm_apply.test.ts
  modified:
    - spacetimedb/src/index.ts
key-decisions:
  - "Behavior-preserving verbatim extraction: only the four documented substitutions; the renown JSON.stringify(perk.effect) bigint throw is preserved and documented as a Phase 41 hand-off"
  - "The trailing return; of the old failure block stays in the wrapper (if (!success) { applyLlmFailure; return; }), not in applyLlmFailure"
patterns-established:
  - "Phase 41's scheduled procedure calls applyLlmResult/applyLlmFailure with toApplyJob(llmJobRow) and any sender"
requirements-completed: []
duration: 30min
completed: 2026-09-29
status: complete
---

# Phase 40 Plan 08: submit_llm_result Extraction Summary

The roughly 700 lines of per-domain result handling in `submit_llm_result` now live in `helpers/llm_apply.ts`, keyed on the stored player, and the reducer is a 22-line wrapper. Behavior is unchanged: the untouched Plan 40-05 characterization suite (120 cases, 116 snapshots) passes with `CI=true`.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create helpers/llm_apply.ts by verbatim line-range copy, with sender-independence tests | 7146927b | helpers/llm_apply.ts, helpers/llm_apply.test.ts |
| 2 | Reduce submit_llm_result to a thin wrapper | 7e2d98da | index.ts, helpers/llm_apply.test.ts |

## What was built

- `llm_apply.ts` exports: `ApplyJob`, `toApplyJob`, `extractJson`, `retryWorldGen`, `applyLlmFailure`, `applyCreationResult` (creation_race and creation_class), `applyWorldGenResult`, `applySkillGenResult`, `applyNpcConversationResult`, `applyCombatNarrationResult`, `applyRenownPerkResult`, `applyLlmResult` (dispatcher, same condition order as the original; unknown domains such as smoke_test do nothing).
- The bodies were produced by `sed -n 'A,Bp'` over `git show HEAD:spacetimedb/src/index.ts` line ranges (failure 959-998, creation 1004-1104, world_gen 1107-1222, skill_gen 1225-1254, npc 1257-1530, combat 1533-1534, renown 1537-1634), dedented by two spaces, then the four substitutions applied by `sed`: sender to `job.playerId`, `task.domain` to `job.domain`, `task.contextJson` to `job.contextJson`, `task` argument of `handleCombatNarrationResult` to `job`. Nothing retyped or reformatted.
- `submit_llm_result` keeps the registration, the three `SenderError` guards and the status update, then `const job = toApplyJob(task)`, `applyLlmFailure` plus `return`, or `applyLlmResult`.

## Equivalence evidence (T-40-10)

One-off, not committed. The new function bodies (from `applyLlmFailure` to just before the dispatcher, 689 lines) had the reverse substitutions applied, and were compared with `git show HEAD:spacetimedb/src/index.ts | sed -n '957,1635p'` (679 lines) using `diff -w -B`:

- Diff output: 49 lines, 13 hunks (7 changes, 5 pure additions, 1 pure deletion).
- Every hunk is one of: a function signature plus doc comment replacing the old `if (task.domain === ...) {` / `} else if (...) {` header (creation, world_gen, skill_gen, npc, combat, renown, and the `if (!success) {` head replaced by the `applyLlmFailure` signature); a closing `}` added at the end of a domain function (5 hunks); the removed trailing `return;` of the failure block (kept in the wrapper); the old "Process successful result" comment folded into the creation signature hunk.
- No hunk touches a statement of domain logic.

Sender-use count after extraction: `grep -cE "\b(ctx|tx)\s*\.\s*sender\b" llm_apply.ts` = 0; `grep -c "job.playerId"` = 14 (13 replaced sender reads plus the `toApplyJob` and header mentions). RESEARCH said 12; the actual count in lines 957-1635 was 13 (960, 962, 965, 967, 1005, 1008, 1027, 1090, 1100, 1240, 1530, 1586, 1618).

## Imports removed from index.ts

`incrementBudget` (kept `checkBudget`), `RENOWN_PERK_POOLS`, `pickRippleMessage`, `pickDiscoveryMessage`, `writeGeneratedRegion`, `parseSkillGenResult`, `insertPendingSkills`, `updateNpcMemory`, `getActiveQuestCount`, `getActiveQuestCountForNpc`, `MAX_ACTIVE_QUESTS`, `MAX_QUESTS_PER_NPC`, `awardNpcAffinity`, `handleCombatNarrationResult`, `QUEST_TYPES`. Kept because they still have uses: `checkBudget`, `buildRegionContext`, `appendCreationEvent`, `appendNpcDialog`, `appendWorldEvent`, `appendPrivateEvent`, `ensureSpawnsForLocation`. `computeRegionDanger` was already an unused import at HEAD and was left alone (change nothing else). Added: `import { applyLlmResult, applyLlmFailure, toApplyJob } from './helpers/llm_apply';`. `extractJson` and `retryWorldGen` (and their comments) were deleted from index.ts after grep confirmed the moved block was their only caller.

## Verification

- `CI=true pnpm --dir spacetimedb exec vitest run src/helpers/submit_llm_result.characterization.test.ts src/helpers/llm_apply.test.ts`: 2 files, 135 passed, no snapshot written or obsolete.
- `git diff --quiet HEAD -- <characterization test> <its .snap>`: unchanged; `git log` for the test file lists only the three Plan 40-05 commits.
- `pnpm --dir spacetimedb test`: 32 files, 1388 passed (1373 before this plan).
- `spacetime build -p spacetimedb`: "Build finished successfully" (same harmless "tsc not found" notice as earlier plans).
- `npx tsc --noEmit -p spacetimedb`: 11 errors in `src/index.ts` (baseline 11, all pre-existing ReducerOpts and one Player typing); 0 diagnostics for `helpers/llm_apply`.
- Acceptance greps: `function extractJson` and `function retryWorldGen` in index.ts = 0; `from './helpers/llm_apply'` = 1.
- Nothing published. No packages installed.

## Tests added (llm_apply.test.ts, 15 cases)

- Sender independence with `ctx.sender` set to a module identity: creation_race success (alice state, event and budget only), a state that exists only for the module identity is ignored, creation_class failure reverts alice's state, skill_gen with three skills and renown with three perks charge alice only, the dispatcher routes for the stored player.
- `toApplyJob` for the llm_task row, the llm_job row, and equality of both shapes.
- `applyLlmResult` with `smoke_test`: `snapshotDb` before equals after.
- `extractJson`: fenced block, JSON inside prose, invalid text throws.
- Static: no sender read on `ctx` or `tx` in `llm_apply.ts`; `submit_llm_result` in index.ts is at most 30 lines, calls both apply functions, contains neither `domain ===` nor `extractJson(`.

## Deviations from Plan

None on scope. Notes:

- The final `return;` of the old failure block was left in the wrapper rather than copied into `applyLlmFailure` (a trailing return in a void function adds nothing; control flow is identical).
- The test file reads sources through `node:fs` / `node:url` with `// @ts-ignore` on the imports, because the module tsconfig has no node types and the acceptance criterion requires zero tsc diagnostics for `helpers/llm_apply*`.

## Hand-offs

- **Phase 41 (bigint defect, still live):** `applyRenownPerkResult` still contains `JSON.stringify(perk.effect)` in the static fallback and throws `TypeError: Do not know how to serialize a BigInt` for ranks whose first three perks carry a bigint effect (2, 3, 5, 9, 11, 12, 13, 14). Pinned by the 40-05 characterization tests, moved verbatim as instructed. Fix it when the renown executor is wired, reusing the bigint-safe `serializePerkEffect` (currently module-private in `helpers/renown.ts`); the characterization snapshot for the throw will then need a deliberate update.
- **Phase 41 (executor):** call `applyLlmResult(ctx, toApplyJob(jobRow), text)` and `applyLlmFailure(ctx, toApplyJob(jobRow))` from the scheduled procedure inside `withTx`. Note that world_gen success and failure read `context.genStateId` and the apply functions expect the legacy `contextJson` keys; an llm_job's `requestJson` is a superset of those keys for renown (40-07), and the other routes still need checking when their enqueue sites move.
- **Phase 41 (creation validators):** creation race and class replies are still unclamped (recorded in 40-05).
- **Phase 42:** `submit_llm_result` and the public `llm_task` remain (T-40-06 transfer); they close in Phase 42.

## Known Stubs

None.

## Threat Flags

None. T-40-04 mitigated (static regex test plus module-identity-sender tests). T-40-10 mitigated (verbatim copy, normalized diff, unmodified characterization suite under `CI=true`).

## Self-Check: PASSED

- FOUND: spacetimedb/src/helpers/llm_apply.ts, spacetimedb/src/helpers/llm_apply.test.ts, spacetimedb/src/index.ts (modified)
- FOUND commits: 7146927b, 7e2d98da
