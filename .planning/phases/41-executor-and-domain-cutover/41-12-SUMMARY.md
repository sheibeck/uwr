---
phase: 41-executor-and-domain-cutover
plan: 12
subsystem: llm-cutover-skills-renown
tags: [spacetimedb, llm, skills, renown, enqueue, cutover, local-publish, bindings, tests]
status: complete
requires:
  - phase: 41-05 (enqueueLlmJob, SOURCE_KEYS.skillGen, llmRefusalMessage; renown enqueue finished)
  - phase: 41-07 (executor, resolveRouteInput legacy renown fallback)
  - phase: 41-10 (llm_cutover.test.ts harness, expectEnqueued)
provides:
  - "helpers/skill_offer.ts: canRequestSkillOffer, enqueueSkillOffer, requestSkillOffer"
  - "apply_level_up enqueues one skill_gen job per character and level (own transaction, archetype from creation state)"
  - "player reducer request_skill_offer({ characterId }) and the [skills] intent"
  - "prepare_skill_gen deleted from the module, the bindings and the client composable"
  - "Keeper failure and short-offer lines that name [skills] (PIPE-05 recovery)"
affects: [41-13, 41-14, 41-15, 41-16]
tech-stack:
  added: []
  patterns:
    - "One shared helper (requestSkillOffer) so level-up, the reducer and the intent apply identical eligibility rules"
    - "Eligibility = level >= 2, no pending skills, no generated ability at the current level; active-job rule = enqueue dedupe on character + level"
key-files:
  created:
    - spacetimedb/src/helpers/skill_offer.ts
    - spacetimedb/src/helpers/skill_offer.test.ts
    - src/module_bindings/request_skill_offer_reducer.ts
  modified:
    - spacetimedb/src/index.ts
    - spacetimedb/src/reducers/intent.ts
    - spacetimedb/src/helpers/llm_apply.ts
    - spacetimedb/src/helpers/__snapshots__/submit_llm_result.characterization.test.ts.snap
    - spacetimedb/src/reducers/llm_cutover.test.ts
    - spacetimedb/src/data/model_literals.test.ts
    - src/composables/useSkillChoice.ts
    - src/module_bindings/index.ts
    - src/module_bindings/types/reducers.ts
  deleted:
    - src/module_bindings/prepare_skill_gen_reducer.ts
key-decisions:
  - "Non-eligible and dedupe answers use kind 'system' (fail() in reducers); a created offer uses kind 'narrative'. In apply_level_up the outcome is appended as a private event of that kind (the old code returned silently on pending skills)"
  - "The [skills] help line was added to the help text so the command is discoverable"
  - "Allowlist shrink (index.ts 4 to 2) was committed with Task 2 rather than Task 3 so no commit leaves the suite red"
metrics:
  tasks: 3
  files: 13
  tests_added: 32
  suite: "1976 passed (spacetimedb, baseline 1944 + 17 skill_offer + 15 cutover)"
completed: 2026-09-30
---

# Phase 41 Plan 12: Skills and Renown Cutover Summary

Skill offers now run on the executor: level-up enqueues in its own transaction, the skill-gen prepare reducer and its client call are deleted, and a failed offer is recoverable by typing [skills] (new `request_skill_offer` reducer and intent). Renown (finished in 41-05) is proven end to end offline, including a Phase 40 job with no input snapshot.

## What was built

### Task 1: skill-offer rules and enqueue helper (commit 82789536)
- `canRequestSkillOffer`: level below 2 -> in-voice refusal; any `pending_skill` row -> "Your offering awaits your choice."; an `ability_template` row with `isGenerated` true and `levelRequired` equal to the character's level -> refusal; otherwise ok. Non-generated (class) abilities never block.
- `enqueueSkillOffer`: builds `SkillGenInput` (name, race/class with 'Unknown' fallback, `archetypeForPlayer`, level, existing abilities as name and kind) and enqueues `skill_gen` with `SOURCE_KEYS.skillGen(character.id, character.level)` and request `{ characterId, input: encodeRouteInput(input) }`.
- `requestSkillOffer`: created -> narrative "Something stirs within you..."; dedupe hit -> system "The Keeper is already preparing your offering. Be patient."; refused -> `llmRefusalMessage(reason) + ' Ask again with [skills] later.'`; ineligible -> the rule line. Nothing is written unless a job is created.
- `skill_offer.test.ts` (17 tests): each eligibility rule, snapshot decodes to bigint level and builds route layers, archetype 'mystic' from creation state, refusal writes nothing (no job, dispatch, sweep tick, reservation), dedupe, and failed, expired and completed-without-skills jobs not blocking a new request, and a different level getting its own job.

### Task 2: wiring (commit aa3623c7)
- `index.ts`: `apply_level_up` tail replaced by `requestSkillOffer(ctx, updated, ctx.sender)` and a private event of the outcome kind (legacy budget check, pending-task check, prompt building and `llm_task` insert removed); `prepare_skill_gen` deleted with its now-unused prompt imports; new `request_skill_offer` reducer (`requireCharacterOwnedBy`, then `fail` for system outcomes, `appendPrivateEvent` for narrative).
- `intent.ts`: `skills` branch (case-insensitive) calling `requestSkillOffer`; `[skills]` line in the help text.
- `llm_apply.ts`: skill_gen failure line now "The Keeper flickers. \"Your potential eludes crystallization. Type [skills] when you want me to try again.\""; short-offer line ends "Type [skills] to try again."
- `llm_cutover.test.ts` (+15 tests): level-up enqueues one job plus one dispatch and no legacy task; creation-state archetype; pending offer blocks; `prepare_skill_gen` not captured; request_skill_offer once and dedupe; ownership rejected with 'Not your character'; anti-farm cases (pending choices, generated ability at level, level 1); refusal at the daily cost limit; `skills` intent parity; failure line names [skills] and a follow-up `skills` creates a fresh job with the same dedupe key; short-offer line; help text; `grant_test_renown` rank-up (CLI admin identity) leaves one `renown_perk_gen` job and one dispatch; a Phase 40 renown job (legacy keys, no `input`, no reservation) run through `runLlmJob` with a scripted three-perk reply completes and inserts three `pending_renown_perk` rows for character 1 at rank 2.
- `model_literals.test.ts`: `spacetimedb/src/index.ts` pinned at 2 (moved here from Task 3 to keep the suite green per commit).

### Snapshot entries changed (deliberate)
Run first without `-u`: exactly four cases failed, all skill-gen message text; nothing else changed. Then updated:
1. `submit_llm_result failure path: creation and skill_gen > skill_gen failure writes an in-voice private narrative for the character owner` (now the `[skills]` failure line)
2. `submit_llm_result skill_gen success > QUIRK: fewer than three skills writes the grimace message with NO budget increment and NO pending rows`
3. `submit_llm_result skill_gen success > QUIRK: a skill missing name or kind is skipped, dropping the batch under three (grimace)`
4. `submit_llm_result skill_gen success > unparseable text writes the grimace message with no budget increment`
(3 to 4 now end "Type [skills] to try again.")

### Task 3: client, publish, bindings, build (commits 58980570, 45bb5b1b)
- `useSkillChoice.ts`: `requestSkillGen` and its return entry deleted; header note updated. App.vue used only `hasPendingSkills`, `pendingLevels`, `hasPendingLevels`, `chooseSkill`, `applyLevelUp`, so nothing else changed.
- Static test in `llm_cutover.test.ts`: no file under `src/` (outside `module_bindings`) mentions `prepareSkillGen`, `requestSkillGen` or `prepare_skill_gen`.
- Bindings regenerated (`pnpm spacetime:generate -y`, needed to delete the stale generated file): `request_skill_offer_reducer.ts` added, `prepare_skill_gen_reducer.ts` deleted, `index.ts` and `types/reducers.ts` updated. Committed separately.

## Local publish

Code and reducer changes only; the local server was already running (ping 200). `pnpm spacetime:publish < /dev/null` needed no clear and no `--break-clients`:

```
Checking for breaking changes...
Publishing module...
Updated database with name: uwr, identity: c200f2029b92b15e2164adf6951b34cc614ea4063d36996c58cac1799244c14a
```

`spacetime logs uwr --server local` ends with `Updated program to bb3fb566...` and `Database updated`, no errors. `spacetime build -p spacetimedb` prints "Build finished successfully" (the "tsc not found" line is the existing tool warning). `pnpm build` exits 0. Nothing targeted maincloud.

## Verification

- Full suite `CI=true pnpm --dir spacetimedb exec vitest run --maxWorkers=1`: 49 files, 1976 tests passed (baseline 1944, plus 17 in skill_offer.test.ts and 15 in llm_cutover.test.ts).
- Client: `pnpm exec vitest run` (root) 53 files, 2032 tests passed; `pnpm build` (vue-tsc and Vite) exits 0.
- Acceptance greps: `prepare_skill_gen` in index.ts 0; `spacetimedb.reducer('request_skill_offer'` 1; `requestSkillOffer(ctx` in intent.ts 1; `[skills]` in llm_apply.ts 2; `gpt-5-mini` in index.ts 0; `archetypeForPlayer(` 1; `SOURCE_KEYS.skillGen(` 1; `requestSkillGen` in useSkillChoice.ts 0; no `prepare_skill_gen` binding file, `request_skill_offer` binding present.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Allowlist edit moved from Task 3 to Task 2**
- **Found during:** Task 2 (removing the two `gpt-5-mini` literals from index.ts turned `model_literals.test.ts` red)
- **Fix:** Set `'spacetimedb/src/index.ts': 2` in the Task 2 commit so no commit leaves the suite failing.
- **Commit:** aa3623c7

**2. [Rule 3 - Blocking] `spacetime generate` asked to confirm deleting the stale binding**
- **Fix:** Re-ran `pnpm spacetime:generate -y` (deletes only the generated `prepare_skill_gen_reducer.ts`).
- **Commit:** 45bb5b1b

Otherwise the plan was executed as written. TDD note: helper and tests were committed together per task (as in 41-10 and 41-11), not as separate RED and GREEN commits.

## Notes for later plans

- A player-visible [skills] hint exists only in failure lines and the help text; Phase 42 may want a clickable affordance. In the narrative console `[skills]` renders as a clickable command like other bracketed words.
- Live skill offers and renown perks (real Claude replies) need the key from 41-16; here they are proven with scripted replies only.
- The legacy `llm_task` table and `submit_llm_result` still exist for creation and world-gen until 41-13 and 41-14.

## Known Stubs

None.

## Threat Flags

None. T-41-15 mitigated (three eligibility rules plus dedupe on character and level, each tested); T-41-03 mitigated (`requireCharacterOwnedBy` in the reducer, tested; the intent path resolves the caller's own character); T-41-04 mitigated (budget reservation, per-player cap and dedupe, refusal writes nothing, tested); T-41-14 respected (local publish only).

## Self-Check: PASSED
- FOUND: spacetimedb/src/helpers/skill_offer.ts, spacetimedb/src/helpers/skill_offer.test.ts, spacetimedb/src/index.ts, spacetimedb/src/reducers/intent.ts, spacetimedb/src/helpers/llm_apply.ts, spacetimedb/src/reducers/llm_cutover.test.ts, src/composables/useSkillChoice.ts, src/module_bindings/request_skill_offer_reducer.ts
- MISSING (intended): src/module_bindings/prepare_skill_gen_reducer.ts
- FOUND commits: 82789536, aa3623c7, 58980570, 45bb5b1b
