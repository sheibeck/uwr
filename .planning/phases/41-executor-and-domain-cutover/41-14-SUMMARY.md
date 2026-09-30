---
phase: 41-executor-and-domain-cutover
plan: 14
subsystem: llm-cutover-world-gen
tags: [spacetimedb, llm, world-generation, enqueue, cutover, local-publish, bindings, tests]
status: complete
requires:
  - phase: 41-05 (enqueueLlmJob, SOURCE_KEYS.worldGen, llmRefusalMessage)
  - phase: 41-07 (executor, world_gen in NO_AUTO_RETRY routes)
  - phase: 41-10 (llm_cutover.test.ts harness, expectEnqueued)
  - phase: 41-13 (startCreationGeneration pattern, allowlist at 1)
provides:
  - "helpers/world_gen.ts: startWorldGeneration(ctx, genState) returning 'reused' | 'enqueued' | 'duplicate' | 'refused'"
  - "helpers/llm_apply.ts: failWorldGen (renamed from retryWorldGen): ERROR plus the [explore] line, never PENDING"
  - "finalizeCharacter, travel to an uncharted location and explore all start generation in their own transaction"
  - "explore retries the first region for a character at location 0 whose starter state is ERROR"
  - "prepare_world_gen_llm deleted from the module, the bindings and the client composable; index.ts holds no model literal and no legacy budget import"
affects: [41-15, 41-16, 41-18]
tech-stack:
  added: []
  patterns:
    - "Starter-region reuse is a private helper (reuseStarterRegion) in world_gen.ts, so a later plan can extend the apply path or the input without touching the trigger sites"
    - "A refusal never reaches the public world_gen_state as anything but a fixed in-voice errorMessage"
key-files:
  created: []
  modified:
    - spacetimedb/src/helpers/world_gen.ts
    - spacetimedb/src/helpers/world_gen.test.ts
    - spacetimedb/src/helpers/llm_apply.ts
    - spacetimedb/src/helpers/llm_apply.test.ts
    - spacetimedb/src/helpers/submit_llm_result.characterization.test.ts
    - spacetimedb/src/helpers/__snapshots__/submit_llm_result.characterization.test.ts.snap
    - spacetimedb/src/reducers/creation.ts
    - spacetimedb/src/helpers/travel.ts
    - spacetimedb/src/reducers/intent.ts
    - spacetimedb/src/index.ts
    - spacetimedb/src/reducers/llm_cutover.test.ts
    - spacetimedb/src/data/model_literals.test.ts
    - src/composables/useWorldGeneration.ts
    - src/App.vue
    - src/module_bindings/index.ts
    - src/module_bindings/types/reducers.ts
  deleted:
    - src/module_bindings/prepare_world_gen_llm_reducer.ts
key-decisions:
  - "World-gen failure (call failure, parse failure, incomplete region, sweeper expiry) sets ERROR and never PENDING; only the player's [explore] starts a new job (user decision, includes the first region)"
  - "startWorldGeneration enqueues first and then writes GENERATING (or ERROR on refusal), so a refused start writes nothing but the ERROR state and the [explore] line"
  - "The ripple line posts only when a job was enqueued or is already active; a refusal posts only the refusal line"
  - "The first-region retry posts the same ripple line when it enqueues; a reused starter region posts only the arrival text"
  - "The two failure lines that mentioned the Keeper were reworded to drop the old trailing 'Try again.' (failWorldGen now appends 'Type [explore] to try again.') and 'shakes its head' became 'shakes his head' per the pronoun rule"
metrics:
  tasks: 3
  files: 17
  tests_added: 29
  suite: "2021 passed (spacetimedb, baseline 1994); root client suite 2077 passed (baseline 2050); pnpm build exits 0"
completed: 2026-09-30
---

# Phase 41 Plan 14: World Generation Cutover Summary

World generation is the last domain on the executor: every trigger starts it in its own transaction through `startWorldGeneration`, every failure parks the state in ERROR for the player's `explore` (including the very first region), and the prepare reducer and its client watch are deleted.

## What was built

### Task 1: startWorldGeneration and failWorldGen (commit da792fd9)
- `startWorldGeneration(ctx, genState)` in `helpers/world_gen.ts`:
  - starter states (`sourceRegionId` 0n) first try `reuseStarterRegion` (the old reuse branch moved verbatim: same-race starter region, home location, `ensureSpawnsForLocation`, COMPLETE with `generatedRegionId`, arrival narrative) and return `'reused'` with no job;
  - otherwise builds the `WorldGenInput` (`worldContext ''`, race and class from the character, `characterArchetype` from `archetypeForPlayer`, `sourceRegionName` or `'the known world'`, `neighborRegions` from `buildRegionContext`) and enqueues `world_gen` with `SOURCE_KEYS.worldGen(state.id)` and `request { genStateId: <string>, input }`;
  - created or duplicate: state becomes GENERATING, returns `'enqueued'` or `'duplicate'`;
  - refused: state becomes ERROR with `errorMessage 'The Keeper strains but cannot shape this realm right now.'`, and `... Type [explore] to try again later.` is posted as a private system event (placed character) or a `creation_error` event (character at location 0). `llmRefusalMessage` is deliberately not used: `world_gen_state` is public, so no budget or provider wording may reach it.
- `retryWorldGen` renamed `failWorldGen` in `helpers/llm_apply.ts`: sets `step: 'ERROR'` and `errorMessage` to the in-voice message, posts `message + ' Type [explore] to try again.'` through the same private or creation event choice. Its three callers (call failure, parse failure, incomplete region) were updated; sweeper expiry reaches it through `applyLlmFailure`.
- Tests: `world_gen.test.ts` (+7: reuse, other-race no reuse, enqueue shape and decoded input, source region and neighbours, duplicate, refusal placed, refusal unplaced) and `llm_apply.test.ts` (+6: failWorldGen both event routes, applyLlmFailure, parse failure and incomplete region, in-voice text guard, static no-`retryWorldGen` and no-`step: 'PENDING'` guard).

### Task 2: triggers, first-region retry, prepare deletion (commit 045d0bde)
- `creation.ts` finalizeCharacter: keeps the insert, then `startWorldGeneration(ctx, starterGenState)`.
- `travel.ts`: after the uncharted insert, `startWorldGeneration`; the ripple line posts only on `'enqueued'` or `'duplicate'`.
- `intent.ts` explore: a character at location 0 looks at its own starter states (`sourceRegionId` 0n): any PENDING or GENERATING gives the patience line; at least one state and all ERROR creates a fresh PENDING starter state and starts it (ripple line on enqueue); otherwise `There is nothing uncharted to explore here.` The existing uncharted-location retry calls `startWorldGeneration` after its insert with the same ripple rule.
- `index.ts`: `prepare_world_gen_llm` deleted with its header comment and the imports only it used (`checkBudget`, the four `llm_prompts` builders, `computeRegionDanger`, `buildRegionContext`). `grep -cE "gpt-|claude-" index.ts` is 0; `checkBudget` 0.
- `model_literals.test.ts`: the `spacetimedb/src/index.ts` allowlist entry removed.
- `llm_cutover.test.ts` (+15): confirm at CONFIRMING enqueues one GENERATING world_gen job (request shape, decoded input, zero legacy rows) and a refused confirm leaves the character with the state in ERROR; travel to an uncharted location (job plus ripple line; refusal has no ripple line); explore at an uncharted location with ERROR (new state, job; second explore answers the patience line); explore at location 0 (ERROR starter restarted, matching starter region reused free, PENDING and GENERATING give patience, no state says nothing uncharted, refused retry); end to end no auto-retry (scripted 529 through `runLlmJob`: job failed after one attempt, one HTTP call, no retry dispatch, state ERROR with the [explore] line and no digits or budget words, the next explore starts a second job); `capturedReducer('prepare_world_gen_llm')` undefined.

### Task 3: client cleanup, allowlist, publish, bindings, build (commits c691d735, a462ac18)
- `useWorldGeneration.ts`: the PENDING watch, the bookkeeping ref and its reset watch are gone; `activeGeneration` and `isWorldGenProcessing` remain; `connActive` kept as `connActive: _connActive` (App.vue still passes it). `App.vue` comment updated (its call site is otherwise untouched).
- `llm_cutover.test.ts` static client check now also rejects `prepareWorldGenLlm`, `prepare_world_gen_llm` and `preparedGenStateId` under `src/`.
- Bindings regenerated; `prepare_world_gen_llm_reducer.ts` deleted; `ls src/module_bindings | grep -c prepare_` is 0.

## Changed characterization snapshot entries (deliberate)

Run without `-u` first: exactly the nine world-gen failure cases failed and nothing else. The tests were renamed or updated from PENDING to ERROR and the snapshot updated (2 updated, 7 renamed and replaced). Each entry changed the same way: `step` PENDING becomes ERROR, `errorMessage` now holds the in-voice line, the posted message gains ` Type [explore] to try again.` and loses `Try again.`; the "incomplete" lines also read `his head` (was `its head`).

- `world_gen failure path > sets the state to ERROR and tells a placed character through a private system event` (was "resets the state to PENDING ...")
- `world_gen failure path > routes the message to the creation events when the character has no location yet`
- `world_gen failure path > routes to the creation events when the character row is gone`
- `world_gen success > invalid JSON fails the generation: state ERROR, creation_error for a character without a location, no budget` (was "invalid JSON retries: state PENDING ...")
- `world_gen success > invalid JSON fails through a private system event for a placed character` (was "... retries through ...")
- `world_gen success > a missing regionName | an empty regionName | an empty locations array | no locations key ends in ERROR with the "incomplete" message` (four entries, were "takes the retry path ...")

All other snapshot entries are untouched.

## Local publish

Code and reducer changes only (one reducer removed); the local server answered ping 200. `pnpm spacetime:publish < /dev/null` needed no clear and no `--break-clients`:

```
Checking for breaking changes...
Publishing module...
Updated database with name: uwr, identity: c200f2029b92b15e2164adf6951b34cc614ea4063d36996c58cac1799244c14a
```

`spacetime logs uwr --server local` ends with `Updated program to 7f7c3fe1...` and `Database updated`, no errors. `pnpm spacetime:generate -y` deleted only the stale `prepare_world_gen_llm_reducer.ts`. `spacetime build -p spacetimedb` prints "Build finished successfully" (the "tsc not found" line is the existing tool warning). Nothing targeted maincloud.

## Verification

- Server suite `CI=true pnpm --dir spacetimedb exec vitest run --maxWorkers=1`: 50 files, 2021 tests passed (baseline 1994).
- Root client suite `CI=true pnpm exec vitest run --maxWorkers=1`: 54 files, 2077 tests passed (baseline 2050; the root config also runs the server test files).
- `pnpm build` exits 0 (vue-tsc and Vite).
- Acceptance greps: `retryWorldGen` in llm_apply.ts 0; `export function failWorldGen` 1; `step: 'PENDING'` in llm_apply.ts 0; `export function startWorldGeneration` 1; `prepare_world_gen_llm` in index.ts 0; `startWorldGeneration(ctx` creation.ts 1, travel.ts 1, intent.ts 2; `checkBudget` in index.ts 0; `gpt-|claude-` in index.ts 0; `prepareWorldGenLlm` in the composable 0; `isWorldGenProcessing` 2; `spacetimedb/src/index.ts` in model_literals.test.ts 0; prepare bindings 0.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] world_gen.test.ts could not load the new imports**
- **Found during:** Task 1 (`SyntaxError: Unexpected identifier 'iter'` when the module began importing `./events`, which pulls in the real `spacetimedb/server`)
- **Fix:** the test header now also mocks `spacetimedb/server` with the recording server mock (as the other helper tests do) and the `./location` mock gained `ensureSpawnsForLocation`. The existing tests and their mocks are otherwise unchanged.
- **Files modified:** spacetimedb/src/helpers/world_gen.test.ts
- **Commit:** da792fd9

**2. [Rule 1 - Bug, wording] Stale "Try again." plus the new [explore] suffix, and "its head"**
- **Found during:** Task 1 (the three failure lines ended in `Try again.` and failWorldGen appends ` Type [explore] to try again.`, which would read twice; one line said "shakes its head" about the Keeper, against the user's 2026-09-30 pronoun rule)
- **Fix:** dropped the trailing `Try again.` from the three failure lines and changed "its head" to "his head". No other Keeper string was touched; the full pronoun sweep stays with 41-18.
- **Files modified:** spacetimedb/src/helpers/llm_apply.ts (snapshot entries listed above)
- **Commit:** da792fd9

**3. [Planned-task shuffle] allowlist edit and client static check**
- The `model_literals.test.ts` allowlist edit moved from Task 3 to the Task 2 commit (index.ts lost its last literal there, so the guard would otherwise be red), and the extension of the static deleted-prepare check moved to the Task 3 commit (it can only pass once the client watch is gone). Both are in the plan's file lists; only the commit they land in differs.

Otherwise executed as written. TDD note: helpers and tests were committed together per task (as in 41-10 to 41-13), not as separate RED and GREEN commits.

## Notes for later plans

- 41-18 (pronoun sweep and NPC gender column) extends the apply path: `writeGeneratedRegion` step 8 in `helpers/world_gen.ts` inserts NPCs, and `startWorldGeneration` only builds `WorldGenInput` from `data/llm_layers.ts`; new fields go in those two places, the trigger sites need no change. The "Reluctant Merchant" and "Ledger Keeper" fallback NPCs in step 8b and the ripple and discovery templates still carry older wording for that sweep.
- The legacy `llm_task` table and `submit_llm_result` remain (Phase 42); `applyLlmResult` and `applyLlmFailure` are still reachable through it, so `failWorldGen` covers that path as well.
- A live region generation with real Claude output needs the key from 41-16; here world gen is proven with scripted replies and a scripted 529 only.
- `client/src/module_bindings/` (the old sibling client directory) still lists `prepare_world_gen_llm`; it is not part of the build or the plan and was left alone.

## Known Stubs

None.

## Threat Flags

None. T-41-09 mitigated (fixed in-voice `errorMessage`, tests check for digits, budget, limit and daily words, and the 529 end-to-end test checks the stored message); T-41-05 mitigated (ERROR instead of PENDING, one attempt, only explore retries, end-to-end test, dedupe on the state id); T-41-04 mitigated (active-state check in explore, dedupe, budget and per-player cap refusal tested); T-41-14 respected (local publish only).

## Self-Check: PASSED
- FOUND: spacetimedb/src/helpers/world_gen.ts (startWorldGeneration), spacetimedb/src/helpers/llm_apply.ts (failWorldGen), spacetimedb/src/reducers/llm_cutover.test.ts, src/composables/useWorldGeneration.ts
- MISSING (intended): src/module_bindings/prepare_world_gen_llm_reducer.ts
- FOUND commits: da792fd9, 045d0bde, c691d735, a462ac18
