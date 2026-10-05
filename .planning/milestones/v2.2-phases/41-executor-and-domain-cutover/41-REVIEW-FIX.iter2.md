---
phase: 41-executor-and-domain-cutover
fixed_at: 2026-09-30T20:10:00Z
review_path: .planning/phases/41-executor-and-domain-cutover/41-REVIEW.md
iteration: 1
findings_in_scope: 11
fixed: 11
skipped: 0
status: all_fixed
---

# Phase 41: Code Review Fix Report

**Fixed at:** 2026-09-30T20:10:00Z
**Source review:** .planning/phases/41-executor-and-domain-cutover/41-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 11 (critical CR-B01, CR-B02; warnings WR-A01 to WR-A05, WR-B01 to WR-B04)
- Fixed: 11
- Skipped: 0

**Verification:**
- Full server suite: `CI=true pnpm --dir spacetimedb exec vitest run --maxWorkers=1` gave 52 files and 2144 tests, all passing (baseline 2077).
- Root suite: `CI=true pnpm exec vitest run --maxWorkers=1` gave 57 files and 2228 tests, all passing (baseline 2158).
- `pnpm build` passed.
- Local publish: WR-A02 added one private column with a default. The publish needed only `--break-clients`; no `--clear-database`, and the key data was kept. The final code-only publish did not prompt. Bindings were regenerated; only `src/module_bindings/types.ts` changed (the `LlmJob` type), and that change is in the WR-A02 commit.
- For every fix, the new tests were checked to fail without the fix before it was committed. For WR-A01 and WR-A03 this was confirmed by running the new tests against the pre-fix executor.
- Every fix is a logic or state-handling change. Tests pin each one, but a human should still confirm the chosen semantics (see "Needs human verification" under each finding).

## Fixed Issues

### CR-B01: The first-region `[explore]` retry cannot be reached from the UI

**Files modified:** `spacetimedb/src/helpers/world_gen.ts`, `spacetimedb/src/reducers/creation.ts`, `spacetimedb/src/reducers/intent.ts`, `spacetimedb/src/reducers/llm_cutover.test.ts`
**Commit:** d6ec2757
**Status:** fixed: requires human verification
**Applied fix:**
- New shared helper `retryStarterWorldGen(ctx, character, playerId)`. It finds starter states by character (`world_gen_state.iter()` filtered on characterId, with sourceRegionId 0) instead of by sender. It returns `busy`, `none`, `started`, `reused` or `refused`, and shares the in-voice `STARTER_RETRY_MESSAGES`.
- `submit_creation_input`, the reducer the client actually calls, now runs the retry when the text is `explore` or `[explore]` and one of these holds:
  - the creation state is `COMPLETE`;
  - there is no creation state at all (another device of the same user).
- The character is found with `findStrandedCharacter`: the active character first, then any character of the user still at location 0.
- At `COMPLETE`, any other line now points the player to `[explore]`.
- The `explore` intent uses the same helper.

**Tests** (all go through `submit_creation_input`):
- `explore`, `[explore]` and `Explore`
- the busy/patience case
- a refused retry
- a second identity with no creation state
- the hint line
- a placed character
- an end-to-end run: confirm, the starter job fails with a 529, then `explore` from the creation console starts the next job

### CR-B02: Offers for two consecutive levels collide

**Files modified:** `spacetimedb/src/helpers/llm_queue.ts`, `spacetimedb/src/helpers/skill_offer.ts`, `spacetimedb/src/helpers/llm_apply.ts`, `spacetimedb/src/index.ts` (comment only), `spacetimedb/src/helpers/skill_offer.test.ts`, `spacetimedb/src/reducers/llm_cutover.test.ts`, `spacetimedb/src/helpers/submit_llm_result.characterization.test.ts` and its snapshot
**Commit:** a9866406
**Status:** fixed: requires human verification
**Applied fix:**
- New helpers `activeLlmJobs` and `hasActiveJobForCharacter`. They read the `by_status` index, so they do not depend on which identity asked.
- `canRequestSkillOffer` refuses with the "already preparing" line while any `skill_gen` job for the character is active, at any level.
- The job request now carries `level`.
- `applySkillGenResult` labels the offer with that level and gates it on it (not the character's current level). It never overwrites an existing pending offer.

**Deliberate test changes:**
- The pinned "a different level gets its own job" test now expects a refusal.
- The characterization test "replaces previously pending skills (retry safety)" now expects the pending offer to be kept.
- Three other snapshots only gained an empty `pending_skill` table.

### WR-A01: A lost failure message strands creation and world-gen locks

**Files modified:** `spacetimedb/src/helpers/llm_executor.ts`, `spacetimedb/src/helpers/llm_sweeper.ts`, `spacetimedb/src/data/llm_limits.ts`, `spacetimedb/src/helpers/llm_executor.test.ts`, `spacetimedb/src/helpers/llm_sweeper.test.ts`
**Commit:** 3839c51f
**Status:** fixed: requires human verification
**Applied fix:**
- Executor: new `withFailureTx`. The four failure paths (claim, persist, build and the final apply failure) now post the in-voice failure message in the same transaction as the terminal status and the money. If the message itself throws, the transaction is re-run with status and money only. `runFailureApply` and the separate second transaction are gone.
- Sweeper: new stranded-lock rule (`LLM_SWEEP_STRANDED_LOCK_GRACE_MICROS`, 60 s). A lock with no active job for 60 s is released directly, not through `applyFailure`:
  - a `GENERATING_RACE` or `GENERATING_CLASS` creation step goes back to its awaiting step with the "Try again" line;
  - a world-gen state in `PENDING` or `GENERATING` goes to ERROR through `failWorldGen`, with the `[explore]` line.
- `SweepReport` gains `releasedLocks`.

**Needs human verification:**
- In the sweeper, which is a reducer, a `notifyFailure` that throws partway can still leave its partial writes, because a caught exception does not roll back. The new rule releases the lock afterwards, but the partial message rows stay.
- A creation lock counts as held by an active creation job of the same identity and route. It does not use `creationStateId`.

### WR-A02: A late reply after sweeper expiry was charged to the ledger twice

**Files modified:** `spacetimedb/src/schema/tables.ts`, `spacetimedb/src/helpers/llm_budget.ts`, `spacetimedb/src/helpers/llm_sweeper.ts`, `spacetimedb/src/helpers/llm_executor.ts`, `spacetimedb/src/helpers/llm_queue.ts`, `src/module_bindings/types.ts`, and the tests `llm_budget.test.ts`, `llm_executor.test.ts`, `llm_sweeper.test.ts`, `schema_recorder.test.ts` and `schema/llm_privacy.test.ts`
**Commits:** 002dbe76, plus 23ed89b2 (adds the new column to the llm_privacy shape test, which only the full-suite run caught)
**Status:** fixed: requires human verification
**Applied fix:**
- New private column `llm_job.ledgerChargedMicroUsd`, a `u64` with default `0n`, appended at the end of the table.
- When the sweeper expires an `in_flight` job, it records its conservative charge in that column.
- In the stale persist branch, when the job was expired at the same attempt and the reply has usage, the stand-in is swapped for the real cost: `subtractLedgerSpend` (new, floored at zero), then `addLedgerSpend`. The job's `costMicroUsd` is updated.
- A late reply with no usage keeps the stand-in and adds nothing.
- The pinned stale test now drives the real `sweepLlmJobs`, not a stand-in that only released the reservation.

**Deployment:** the local publish used `--break-clients` (no clear). The next manual maincloud publish will also need `--break-clients`.

### WR-A03: A key rotation during an in-flight call marks the wrong key valid or invalid

**Files modified:** `spacetimedb/src/helpers/llm_executor.ts`, `spacetimedb/src/helpers/llm_admin_state.ts` (comment), `spacetimedb/src/helpers/llm_executor.test.ts`
**Commit:** 9783d9c2
**Status:** fixed: requires human verification
**Applied fix:**
- The claim now carries `keyVersionMicros`, taken from `llm_config.updatedAt`.
- At persist time, a smoke success (`markKeyCheck(true)`) and an auth or billing failure (`markKeyCheck(false)`) are recorded only if the stored key version is still the claimed one.

**Tests:**
- An old-key smoke success does not validate the new key.
- An old-key 401 does not invalidate a new key that a smoke test has already proven.
- With the same key, both checks are still recorded.

### WR-A04: The runbook fallback puts the key in argv and shell history

**Files modified:** `docs/runbooks/llm-key.md`, `scripts/llm/cli.test.mjs`
**Commit:** e82572df
**Status:** fixed
**Applied fix:**
- Removed the `spacetime call uwr set_api_key` fallback.
- Replaced it with an identity diagnosis that never touches the key:
  1. `spacetime login show`, never with `--token`
  2. compare against `ADMIN_IDENTITIES`
  3. log in again
  4. re-run `set-key.mjs`
  5. check the logs, then stop
- Added a leaked-key note: rotate the key, and clear both the PSReadLine history file and the session history.
- The Rotation section now notes that an in-flight call on the old key cannot change the key status (see WR-A03).
- A new static test pins three things: the runbook never shows a `set_api_key` call or an argument-list fallback outside "Never do this"; it never shows `login show --token`; and "Never do this" still forbids putting the key in `spacetime call` arguments.

**Needs human verification:** the runbook tells the user to run `spacetime logout`. Confirm that command exists in the installed CLI.

### WR-A05: A billed 200 whose body is not JSON was never charged to the hard ledger

**Files modified:** `spacetimedb/src/helpers/llm_executor.ts`, `spacetimedb/src/helpers/llm_executor.test.ts`
**Commit:** 41765023
**Status:** fixed: requires human verification
**Applied fix:**
- New condition `billedButUnparsed`: a non-ok result with a 2xx status and no usage. Such a result now counts as unknown billing.
- The ledger is charged the reservation, both on a retry and on the final failure. The player is never charged.

**Tests:** `non_json_200` on npc_conversation (retry) and on creation_race (terminal) both charge the ledger. A 500 still charges nothing.

### WR-B01: Player free text is not capped at the reducer

**Files modified:** `spacetimedb/src/reducers/npc_interaction.ts`, `spacetimedb/src/reducers/creation.ts`, `spacetimedb/src/reducers/llm_cutover.test.ts`
**Commit:** 50cf6a2d
**Status:** fixed
**Applied fix:**
- `talk_to_npc` and `submit_creation_input` (the AWAITING_RACE step) now apply `truncateCodePoints(…, PLAYER_INPUT_MAX_CHARS)` before anything is stored, echoed or reserved.

**Tests:**
- A message of more than 70K characters, including astral characters, no longer throws. The snapshot, the reservation and the echo all carry exactly the 1000 code points the model sees.
- A very long race description is capped in both the public state row and the job snapshot.

### WR-B02: Renown perk model output skipped the skill_budget clamps

**Files modified:** `spacetimedb/src/helpers/llm_apply.ts`, `spacetimedb/src/helpers/llm_apply.test.ts`
**Commit:** 2e975417
**Status:** fixed: requires human verification
**Applied fix:**
- New `validateRenownActivePerk(perk, level)`. Active perks (non-empty kind) go through `validateSkillFields` and `processGeneratedSkill` at the character's level:
  - every enum is checked against the vocabulary: kind, targetRule, resourceType, scaling, damageType and effectType;
  - value1 and effectMagnitude are clamped to the budget;
  - mana perks get a cast time of at least 1 s;
  - the duration floor applies.
- A perk with an invalid enum is dropped. With fewer than three perks left, the static options cover the rank.
- Passive perks are unchanged.

**Deliberate test change:** the pinned "model numbers never throw" test now expects the budget-clamped values (value1 15n, effectMagnitude 7n).

**Needs human verification:**
- The budget level is the character's level. The review suggested a level equivalent to the rank.
- Cost and cooldown still have no minimum, the same as for `skill_gen` skills.

### WR-B03: Creation apply and failure were not tied to the job's state or GENERATING step

**Files modified:** `spacetimedb/src/helpers/creation_generation.ts`, `spacetimedb/src/helpers/llm_apply.ts`, `spacetimedb/src/helpers/creation_generation.test.ts`, `spacetimedb/src/helpers/llm_apply.test.ts`, `spacetimedb/src/helpers/submit_llm_result.characterization.test.ts` and its snapshot
**Commit:** 2aba449d
**Status:** fixed: requires human verification
**Applied fix:**
- The creation request now carries `creationStateId` and `generationType`.
- New `creationStateForJob`. It returns the named state only while that state is still at the job's `GENERATING_RACE` or `GENERATING_CLASS` step.
- `applyCreationResult` and the creation branches of `applyLlmFailure` do nothing otherwise: no revert and no message.
- A legacy `llm_task` row, which has no `creationStateId`, falls back to the player's state, still behind the step check. That path is `submit_llm_result`, which is removed in Phase 42.

**Deliberate test change:** the characterization test "failure without a creation state still appends the creation_error event" now expects nothing to be posted.

### WR-B04: The archetype was looked up by the connecting identity

**Files modified:** `spacetimedb/src/helpers/llm_inputs.ts`, `spacetimedb/src/helpers/skill_offer.ts`, `spacetimedb/src/helpers/world_gen.ts`, `spacetimedb/src/helpers/llm_inputs.test.ts`, `spacetimedb/src/reducers/llm_cutover.test.ts`
**Commit:** 32efd1c8
**Status:** fixed: requires human verification
**Applied fix:**
- New `archetypeForCharacter(ctx, character, preferPlayerId?)`. It searches the creation states of every identity of the character's user, in this order:
  1. the state that finalized this character (its characterName matches);
  2. any state with an archetype, the asking identity's own first;
  3. the class resource (a character with mana is a mystic);
  4. warrior.
- This needs no schema change.
- Skill offers use it. World gen uses it whenever the character exists.

**Needs human verification:** the mana fallback is a heuristic. It applies only when no creation state can be found.

## Process notes

- **No worktree.** The fixes were made and committed directly on `master` in the main working tree, not in an isolated worktree. The caller asked for direct `git commit` with explicit paths only, and the tests and local publish need the installed `node_modules`. No recovery sentinel or temporary branch was created. The unrelated `.claude/settings.local.json`, `public/assets/logo.png` and `public/assets/logo_old.png` were never staged.
- **Line endings.** Several working-copy files had CRLF line endings. Each file was normalized to LF before it was edited, and the committed blobs are LF, as `.gitattributes` requires.

---

_Fixed: 2026-09-30T20:10:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
