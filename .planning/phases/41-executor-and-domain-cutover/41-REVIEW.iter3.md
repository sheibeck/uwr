---
phase: 41-executor-and-domain-cutover
iteration: 2
reviewed: 2026-09-30T19:48:02Z
depth: standard
files_reviewed: 45
files_reviewed_list:
  - spacetimedb/src/helpers/llm_executor.ts
  - spacetimedb/src/helpers/llm_sweeper.ts
  - spacetimedb/src/helpers/llm_budget.ts
  - spacetimedb/src/helpers/llm_queue.ts
  - spacetimedb/src/helpers/llm_schedule.ts
  - spacetimedb/src/helpers/llm_retry.ts
  - spacetimedb/src/helpers/llm_inputs.ts
  - spacetimedb/src/helpers/llm_admin_state.ts
  - spacetimedb/src/helpers/llm_apply.ts
  - spacetimedb/src/helpers/claude_request.ts
  - spacetimedb/src/helpers/safe_numbers.ts
  - spacetimedb/src/helpers/creation_validate.ts
  - spacetimedb/src/helpers/scheduling.ts
  - spacetimedb/src/reducers/llm.ts
  - spacetimedb/src/reducers/llm_executor.ts
  - spacetimedb/src/views/llm.ts
  - spacetimedb/src/schema/tables.ts
  - spacetimedb/src/data/llm_limits.ts
  - spacetimedb/src/data/admin.ts
  - scripts/llm/cli.mjs
  - scripts/llm/set-key.mjs
  - scripts/llm/proof_rules.mjs
  - scripts/llm/prove-live.live.ts
  - docs/runbooks/llm-key.md
  - spacetimedb/src/index.ts
  - spacetimedb/src/reducers/npc_interaction.ts
  - spacetimedb/src/reducers/combat.ts
  - spacetimedb/src/reducers/creation.ts
  - spacetimedb/src/reducers/intent.ts
  - spacetimedb/src/reducers/groups.ts
  - spacetimedb/src/helpers/renown.ts
  - spacetimedb/src/helpers/skill_offer.ts
  - spacetimedb/src/helpers/skill_gen.ts
  - spacetimedb/src/helpers/creation_generation.ts
  - spacetimedb/src/helpers/world_gen.ts
  - spacetimedb/src/helpers/combat_narration.ts
  - spacetimedb/src/helpers/travel.ts
  - spacetimedb/src/data/npc_gender.ts
  - spacetimedb/src/data/keeper_bible.ts
  - spacetimedb/src/data/llm_layers.ts
  - spacetimedb/src/data/llm_schemas.ts
  - src/App.vue
  - src/composables/useCharacterCreation.ts
  - src/composables/useSkillChoice.ts
  - src/composables/useWorldGeneration.ts
findings:
  critical: 1
  warning: 3
  info: 21
  total: 25
status: issues_found
---

# Phase 41 Code Review — iteration 2 (merged from two parallel re-reviews)

Previous iteration: 41-REVIEW.iter2.md. Fix report: 41-REVIEW-FIX.md.

# Part A

# Phase 41 (Part A, iteration 2): Code Review Report

**Reviewed:** 2026-09-30T19:50:00Z
**Depth:** standard
**Files Reviewed:** 24. Files unchanged since the first review (commit 5af2536b) were re-checked only where the fixes touch them: `claude_request.ts`, `safe_numbers.ts`, `creation_validate.ts`, `scheduling.ts`, `llm_retry.ts`, `llm_schedule.ts`, `views/llm.ts`, `data/admin.ts` and the scripts except the runbook test. For `schema/tables.ts`, only the new `llm_job` column was reviewed.
**Status:** issues_found (Info only)

## Summary

This is the re-review of Part A after fix commits 3839c51f, 002dbe76, 23ed89b2, 9783d9c2, e82572df and 41765023. All five prior warnings are fixed at the root, not papered over. The fixes add no new blocker or warning. The targeted tests pass: `llm_executor`, `llm_sweeper` and `llm_budget` ran 179 of 179 at `--maxWorkers=1`.

### Prior findings: resolution

| Prior | Status | Evidence |
|---|---|---|
| WR-A01 (a lost failure message strands locks) | **Resolved** | `withFailureTx` (`llm_executor.ts:161-182`) posts the message in the same transaction as the terminal status and the money, in all four failure paths (claim, persist, build and apply-exhausted). Only a `FailureMessageError` triggers the status-only re-run. Any other throw propagates, so the job stays `in_flight` or `pending` and the sweeper recovers it. See the re-invocation check below. The sweeper also has a new stranded-lock rule (`llm_sweeper.ts:272-312`) that covers a throwing message and a crash. |
| WR-A02 (a late reply is charged to the ledger twice) | **Resolved** | The sweeper records its stand-in in `ledgerChargedMicroUsd` (`llm_sweeper.ts:157-167`). The stale branch swaps the stand-in for the real cost (`llm_executor.ts:382-396`). `subtractLedgerSpend` floors at zero. The column is private, defaults to 0, and is appended last (`tables.ts:2171`). The pinned test now drives the real `sweepLlmJobs`. |
| WR-A03 (a key rotated mid-call gets the wrong check) | **Resolved** | The claim carries `keyVersionMicros` from `llm_config.updatedAt`, read in the same transaction as the key (`llm_executor.ts:245-281`). Persist records `markKeyCheck` only when the version is unchanged (`:400-401, 464, 503`). `set_api_key` is the only writer of `llm_config.updatedAt` (`reducers/llm.ts:34,36`), so no other write can move the version. |
| WR-A04 (the runbook puts the key in argv) | **Resolved** | The fallback is gone (`docs/runbooks/llm-key.md:39-46`). The diagnosis never touches the key, a leaked-key cleanup note is added (`:77`), and a static test pins the behaviour. |
| WR-A05 (a billed 2xx with an unusable body is not charged) | **Resolved** | `billedButUnparsed` (`llm_executor.ts:667-673`) makes a 2xx with no usage count as unknown billing, so the ledger is charged on retry and on the final failure. A 2xx JSON body always yields a usage object (`extractUsage`), so only the non-JSON `server` case matches. That is the intended scope. |
| IN-A01 to IN-A07 | Still present | Carried forward below as IN-A01 to IN-A07. |

### What was checked in the new code

- **Re-invocation safety of `withTx`.** `runWithTx` in the installed `spacetimedb` 2.10 (`dist/server/index.mjs`) aborts and rethrows the original error object, so `instanceof FailureMessageError` holds. It re-runs the body once when a commit fails. Every `withFailureTx` body reads and writes only through `tx`. The values it reuses from outside (`realCost`, `counts`, `needles`) are computed once and never changed, and the fallback body is the same pure function with a no-op `notify`. If a commit retry throws, that error is not a `FailureMessageError` and propagates unchanged. The target is ESNext, so subclassing `Error` keeps `instanceof` working.
- **Money in the stale branch.** The stand-in is only swapped when `job.attempt === c.attempt`, and each attempt persists once, so a swap can never run twice. When the stand-in is 0 (for example a Phase 40 job with no reservation), only the real cost is added. No double charge and no refund path were found.
- **Stranded-lock rule.** Every `GENERATING_*` creation step and every `PENDING`/`GENERATING` world-gen state is written in the same transaction as its job's enqueue (`creation.ts:474-481, 498-508`; `travel.ts:273-283`; `creation.ts:311-321`; `intent.ts:1433-1443`; `world_gen.ts:235-245`). A lock older than 60 s with no active job is therefore stranded, and a healthy job always holds its lock until its apply or failure moves the step. `genStateId` is a string in every world_gen request (`world_gen.ts:178`), which matches `genStateIdOf`. There is one creation state per identity (`creation.ts:361, 396`), so a creation lock keyed by (route, playerId) cannot be held by the wrong state.

---

## Info

### IN-A01: The cost is computed from the raw usage, not the clamped counts (carried from prior IN-A01)

**File:** `spacetimedb/src/helpers/llm_executor.ts:357` (see also `:302-305`, `llm_queue.ts:282-285`)
**Issue:** `realCost = BigInt(estimateCostMicroUsd(usage))` uses the unclamped `usage`. A non-finite count, such as `1e400` parsed to `Infinity`, makes `BigInt` throw before `persistAttempt` opens its transaction. The paid reply is then lost, and the job waits for the sweeper. The value now also feeds the WR-A02 swap. Rounding also differs between the helpers: `u64` floors and `toU64` rounds.
**Fix:** Compute the cost from the clamped counts, `estimateCostMicroUsd({ input: Number(counts.input), output: Number(counts.output), cacheWrite: Number(counts.cacheWrite), cacheRead: Number(counts.cacheRead) })`, and use floor in both helpers.

### IN-A02: `confirmKeySet` can match a log line from an earlier key set (carried from prior IN-A02)

**File:** `scripts/llm/cli.mjs:133-142, 166`
**Issue:** Anthropic keys have a fixed length, so the `llm key set, len=<n>` line left by a previous set also matches.
**Fix:** Confirm with something unique to this call, for example `admin_llm_status.keyUpdatedAt` at or after the script's start time.

### IN-A03: `phaseCalls` counts jobs and drops on refund even when a call went out (carried from prior IN-A03)

**File:** `spacetimedb/src/helpers/llm_budget.ts:147, 175, 183`; `spacetimedb/src/helpers/llm_executor.ts:500`; `spacetimedb/src/helpers/llm_sweeper.ts:159`
**Issue:** The count goes up once per reservation. It goes down on every `refundCall: true`, which now includes the WR-A05 billed-but-unparsed 2xx and the sweeper's timeout expiry. Both were almost certainly billed calls. `admin_llm_status.phaseCalls` therefore under-reports.
**Fix:** Rename the field to `phaseJobs`, or count HTTP attempts separately. `llm_call_log` is the authoritative count.

### IN-A04: An Anthropic `billing` failure still marks the current key invalid (carried from prior IN-A04)

**File:** `spacetimedb/src/helpers/llm_executor.ts:503`
**Issue:** The check is now limited to the current key (WR-A03), but a Console spend-limit failure still clears `keyLastCheckOk` on a working key.
**Fix:** Clear the check only on `auth`, and record billing state separately.

### IN-A05: The sweeper writes money before the job status, so a failed job write charges twice on the next sweep (carried from prior IN-A05, now also affects the WR-A02 stand-in)

**File:** `spacetimedb/src/helpers/llm_sweeper.ts:157-168`
**Issue:** In a reducer, a caught throw does not roll back earlier writes. The sweep runs `chargeLedgerUnknownBilling` and the reservation release, then writes `llm_job`. If `llm_job.id.update` throws, the next sweep charges and releases again. That second pass records only one `ledgerChargedMicroUsd`, so a late reply swaps out one stand-in and one extra charge stays in the ledger.
**Fix:** Write the job row first, with the patch computed from the original row, then the money. Or validate the row before any money write. Document which order was chosen.

### IN-A06: A job with an unknown route is never swept (carried from prior IN-A06)

**File:** `spacetimedb/src/helpers/llm_sweeper.ts:89-91`
**Issue:** `LLM_ROUTES[route].timeoutMs` throws for an unknown route. The job is logged as an error every 30 s and never releases its reservation.
**Fix:** `const cfg = LLM_ROUTES[route as LlmRoute]; return BigInt(cfg?.timeoutMs ?? 150_000) * 1000n;`

### IN-A07: `isSmokeRequest` is still duplicated in three modules (carried from prior IN-A07)

**File:** `spacetimedb/src/helpers/llm_executor.ts:123-129`, `spacetimedb/src/helpers/llm_sweeper.ts:81-87`, `spacetimedb/src/reducers/llm.ts:13-20`
**Fix:** Export one helper, for example from `llm_admin_state.ts`, and import it in all three places.

### IN-A08: A late non-2xx reply keeps the stand-in although it proves the call was not billed; the call log and the ledger then disagree (new, relates to WR-A02)

**File:** `spacetimedb/src/helpers/llm_executor.ts:386-394`
**Issue:** In the stale branch, `usageMissing` keeps the sweeper's stand-in. That is correct for a thrown call or a 2xx without usage, where billing is unknown. A late 429, 5xx or 529 reply, however, proves the call was not billed, and the stand-in still stays. `logCall(realCost)` also writes `costMicroUsd 0` to `llm_call_log` while the ledger keeps the reservation, so the per-call costs no longer add up to `llm_spend.spentMicroUsd`. This errs on the safe side for the hard cap, so it is Info only.
**Fix:** When `a.httpStatus >= 300 && !a.unknownBilling`, subtract the stand-in and add nothing. When the stand-in is kept, log it as the attempt's cost: `logCall(charged > 0n && usageMissing ? charged : realCost)`.

### IN-A09: The smoke results from a pre-rotation key still read "ok", and the runbook calls six ok results proof of a valid key (new, relates to WR-A03)

**File:** `spacetimedb/src/helpers/llm_executor.ts:458-464`; `docs/runbooks/llm-key.md:36, 52, 89`
**Issue:** WR-A03 limits `markKeyCheck` to the current key, but `recordSmokeResult` still writes `ok: true` for an old-key smoke job that finishes after a rotation. `llm_smoke_test` also refuses a second run while one is active, and only through a console log (`reducers/llm.ts:54-58`). So an admin who rotates during a smoke run and reruns the smoke test can see six `ok` entries from the old key. The runbook says "All six routes `ok` means the key is valid" (step 6) and "wait for six `ok` results" (Rotation step 3), which contradicts `keyValid`, which stays false.
**Fix:** Store the key version, or a `staleKey: true` flag, in each smoke entry when `!sameKey`. Change the runbook to use `keyValid` in `admin_llm_status`, not the count of `ok` entries, as the pass criterion.

### IN-A10: When a failure message throws, only creation and world-gen get a recovery path (new, residual of WR-A01)

**File:** `spacetimedb/src/helpers/llm_executor.ts:177-181`; `spacetimedb/src/helpers/llm_sweeper.ts:272-312`; `spacetimedb/src/helpers/llm_apply.ts:163-178`
**Issue:** The stranded-lock rule covers the two gated domains. For `renown_perk_gen`, the failure handler is what keeps an earned offer ("An earned perk offer is never lost": the static fallback). If `insertStaticRenownPerkOptions` or `toApplyJob` throws, `withFailureTx` commits the status only, and no sweep rule or reducer brings the offer back. This is not a regression, because the old `runFailureApply` also logged and dropped the error. It does still break that comment's guarantee. The fixer's note also applies: in the sweeper reducer, a `notifyFailure` that throws partway keeps its partial writes. If one of those is a `creation_error` line, the stranded-lock rule can post the same line a second time in the same sweep.
**Fix:** Either add the `failureNotifiedAt` column from the prior review's option 1, with a sweep rule that runs `applyFailure` once for terminal jobs that lack it, or add a renown rule: an expired or failed `renown_perk_gen` job with no `renown_perk_option` rows for its rank inserts the static options.

### IN-A11: The creation lock holder is matched by (route, playerId), not by the job's `creationStateId` (new, relates to WR-A01 and WR-B03)

**File:** `spacetimedb/src/helpers/llm_sweeper.ts:276-290`
**Issue:** WR-B03 ties each creation job to its `creationStateId`, but the stranded-lock rule still treats any active creation job of the same identity and route as the holder. This is correct today because there is one creation state per identity. It does let an admin's active smoke `creation_race` or `creation_class` job, which is enqueued under the admin's identity, delay the release of the admin's own stranded creation lock until the smoke job ends. The rule also silently depends on the one-state-per-identity invariant.
**Fix:** Build `creationHeld` from the job's `creationStateId`, parsed from `requestJson` the same way `genStateIdOf` does it, and skip smoke jobs.

---

_Reviewed: 2026-09-30T19:50:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

# Part B

# Phase 41 (Part B, iteration 2): Code Review Report

**Reviewed:** 2026-09-30
**Depth:** standard, plus targeted tracing into `reducers/renown_perk.ts`, `helpers/skill_budget.ts`, `helpers/llm_inputs.ts`, `helpers/character.ts`, `src/composables/useCharacters.ts` and `src/composables/data/useCoreData.ts`
**Files Reviewed:** 22
**Status:** issues_found

## Summary

This pass re-checks the six Part B fixes (d6ec2757, a9866406, 50cf6a2d, 2e975417, 2aba449d, 32efd1c8) along the paths players actually use, and looks for defects the fixes introduced.

### How the prior findings stand

| Prior ID | Verdict | Notes |
|---|---|---|
| CR-B01 | **Resolved on the main path** | Stranded character on the same device: typing `explore` or clicking `[explore]` in the creation console goes to `submit_creation_input`. The state is `COMPLETE`, `isExploreText` matches, and `findStrandedCharacter` then `retryStarterWorldGen` start a new starter job. The `COMPLETE` hint line points the player to `[explore]`. Refusal, busy and none each post one in-voice line. The second-device path the fix claims is only partly reachable: see WR-B01. |
| CR-B02 | **Resolved** (double billing and overwrite) | `hasActiveJobForCharacter` blocks a second `skill_gen` at any level. The job carries `level`, and apply labels the offer with it and never overwrites a pending offer. With rapid level-ups, only one call is billed and the level N offer survives. The player is never told how to get the N+1 offer: see WR-B02. |
| WR-B01 | **Resolved** | `talk_to_npc` and `AWAITING_RACE` truncate to `PLAYER_INPUT_MAX_CHARS` before the snapshot, the echo, the public row and the reservation. No other enqueue site takes free player text. |
| WR-B02 | **Resolved, with a new defect** | Active perks now go through `validateSkillFields` / `processGeneratedSkill`. The renown prompt never lists the valid `effectType` values, so the new validator drops perks the prompt asked for: see WR-B03. |
| WR-B03 | **Resolved** | `creationStateForJob` pins the job to its state row and its `GENERATING_*` step. A stale result or failure writes nothing. The executor already returns `stale` for an expired attempt, so a late reply cannot apply to a re-entered `GENERATING_RACE`. |
| WR-B04 | **Resolved** | `archetypeForCharacter` searches every identity of the owning user. The mana fallback is a weak heuristic (IN-B10), but it applies only when no creation state exists at all. |

### Pronoun rule

No new player-facing string in the fixes uses "it" or a singular "they" for a person:
- `STARTER_RETRY_MESSAGES`
- the `COMPLETE` hint line
- the skill-offer lines
- the renown lines

"The Keeper shakes his head" follows the rule. Every "they"/"them" found in the scoped files is plural.

### New findings

- **Critical:** renown perk offers for two ranks collide. Both calls are billed, and picking a perk for one rank deletes the other rank's options permanently. This is the renown version of the old CR-B02. It survives because the fix only touched `skill_gen`.
- **Warnings:**
  - the second-device retry is hijacked by the creation auto-start;
  - nothing leads the player to the level N+1 skill offer;
  - the renown validator is stricter than the renown prompt.

## Critical Issues

### CR-B01: Renown offers for two ranks coexist, and choosing one rank's perk deletes the other rank's options (both calls billed, one earned reward lost)

*(new; the renown counterpart of prior CR-B02, which the fix addressed for `skill_gen` only)*

**Files:**
- `spacetimedb/src/helpers/renown.ts:47-61`: one award loops `oldRank+1..newRank` and calls `triggerRenownPerkGeneration` once per rank.
- `spacetimedb/src/helpers/renown.ts:101-114`: the dedupe key is `renownPerk(characterId, rank)`, so jobs for rank 2 and rank 3 are both created. Renown is exempt from the busy cap.
- `spacetimedb/src/helpers/llm_apply.ts:829-853`: `applyRenownPerkResult` inserts three `pending_renown_perk` rows for its rank without checking for pending rows of another rank.
- `spacetimedb/src/helpers/renown.ts:148-155`: the static fallback is idempotent per rank only, so it also stacks options for several ranks.
- `spacetimedb/src/reducers/renown_perk.ts:83-87`: `chooseRenownPerkLogic` deletes **all** pending rows for the character, whatever their rank.

**Issue:** Rank thresholds are close together early on (100, then 250), and a single server-first award can cross both. The same thing happens when the player reaches rank 3 before choosing the rank 2 perk. In either case:
1. Two `renown_perk_gen` jobs are enqueued and billed.
2. Each posts its own "Rank N. Choose your due" list.
3. The player clicks one perk. `chooseRenownPerkLogic` inserts it and wipes the other rank's three options.

The lost rank's perk cannot be recovered: there is no `[renown]` re-request, and `triggerRenownPerkGeneration` only runs on a rank-up. This breaks the module's own rule that "an earned perk offer is never silently dropped" (`renown.ts:72`, `:142`).

**Fix:** Two changes:
- Delete only the chosen rank's rows when a perk is chosen.
- Serialize the offers so the player only ever sees one rank at a time.

```ts
// reducers/renown_perk.ts: clear only the chosen rank
for (const row of ctx.db.pending_renown_perk.by_character.filter(characterId)) {
  if (row.rank === perk.rank) ctx.db.pending_renown_perk.id.delete(row.id);
}

// helpers/llm_apply.ts applyRenownPerkResult (and insertStaticRenownPerkOptions): keep ranks independent,
// and never double-insert the same rank on a re-run
for (const existing of ctx.db.pending_renown_perk.by_character.filter(charId)) {
  if (existing.rank === BigInt(rank)) return;
}
```

Add a test that awards enough renown to cross two ranks at once, applies both jobs, chooses the rank 2 perk, and checks that the rank 3 options are still pending.

## Warnings

### WR-B01: The second-device first-region retry works only if the player's very first line is `explore`; any other line starts a new creation that then swallows `explore` as a race description (billed)

*(relates to prior CR-B01, second paragraph)*

**Files:**
- `spacetimedb/src/reducers/creation.ts:386-405`
- `spacetimedb/src/reducers/creation.ts:471-486`
- `src/composables/useCharacterCreation.ts:79-98`
- `src/App.vue:760-769`
- `src/composables/useCharacters.ts:62-63`

**Issue:** On a second device (another identity of the same user), a character stranded at `locationId 0`:
- is not selectable, so the creation console is shown;
- has no creation state for this identity;
- has no creation events for this identity, so the console is empty.

`autoStartCreation` never fires, because `characters.value.length > 0`. Nothing in the console tells the player to type `explore`.

1. If the first thing the player types is not exactly `explore`, the `!state` branch inserts a fresh `AWAITING_RACE` state and posts the greeting.
2. From then on `state.step === 'AWAITING_RACE'`, so the retry guard at `:386` is skipped.
3. A later `explore` or `[explore]` is taken as the race description. It enqueues a billed `creation_race` call for the race "explore".
4. The player can go on to finalize a second character. `finalizeCharacter` does not check for existing characters.

The stranded character stays at location 0, and the fix's claim that the retry is reachable "with no creation state (another device of the same user)" only holds for a lucky first input.

**Fix:** In `submit_creation_input`, route a stranded character to the retry before any auto-start or `AWAITING_RACE` handling, and tell the player about it:

```ts
const stranded = findStrandedCharacter(ctx, player);
if (stranded && (!state || state.step === 'COMPLETE' || state.step === 'AWAITING_RACE')) {
  if (isExploreText(text)) { retryStarterFromCreation(ctx, stranded, appendCreationEvent); return; }
  if (!state) {
    appendCreationEvent(ctx, ctx.sender, 'creation',
      'Your character already exists, but the world has not taken shape around you. Type [explore].');
    return;   // do not auto-start a second creation
  }
}
```

Alternatively, have `start_creation` (or the client, when it has a character at location 0 and no events) post that hint. Add a test that sends `hello` and then `explore` from a second identity.

### WR-B02: After a quick double level-up, nothing leads the player to the level N+1 skill offer, and "already preparing" implies it will come by itself

*(relates to prior CR-B02)*

**Files:**
- `spacetimedb/src/index.ts:577-579` (`apply_level_up`)
- `spacetimedb/src/helpers/skill_offer.ts:40-46, 54-60`
- `spacetimedb/src/index.ts:477-487` (`choose_skill`)
- `spacetimedb/src/helpers/llm_apply.ts:426-431`

**Issue:** Take a character with `pendingLevels 2` who claims both levels quickly:
1. The first claim queues the level 2 offer.
2. The second claim is refused with `duplicate`: "The Keeper is already preparing your offering. Be patient." If the level 2 rows have already landed, it is refused with `pending`: "Your offering awaits your choice."
3. The player picks a level 2 skill. `choose_skill` deletes the pending rows and says nothing about another offer.

The level 3 offer is now only reachable through `[skills]`, which the player is never told about in this flow. The "Be patient" wording actively suggests the offer is still coming. For a normal player the level 3 offer is lost. That is the outcome CR-B02 was about, minus the double billing.

The same thing happens when the level N job fails, or returns fewer than three skills, while the character is already at N+1:
- `[skills]` queues an offer at N+1;
- rule 4 then blocks any further request at N+1;
- the level N offer can never be recovered.

**Fix:** Chain the next offer when a choice is made, and change the refusal wording:

```ts
// index.ts choose_skill, after deleting the pending rows:
const fresh = ctx.db.character.id.find(pending.characterId);
if (fresh && fresh.level > pending.levelRequired) {
  const next = requestSkillOffer(ctx, fresh, ctx.sender);
  if (next.kind === 'narrative') appendPrivateEvent(ctx, fresh.id, fresh.ownerUserId, 'narrative', next.text);
}
// skill_offer.ts: duplicate: 'The Keeper is already preparing an offering. Once you choose, type [skills] for the next.'
```

If an offer per level is intended, rule 4 should count owed levels (the generated abilities taken versus `level - 1`), not just check the current level.

### WR-B03: The new renown validator drops perks whose `effectType` the renown prompt never constrains, so billed offers regularly fall back to static options

*(introduced by the WR-B02 fix, 2e975417)*

**Files:**
- `spacetimedb/src/helpers/llm_apply.ts:749-767, 810-823`
- `spacetimedb/src/data/llm_layers.ts:309-332`
- `spacetimedb/src/data/llm_schemas.ts:255`

**Issue:** `validateRenownActivePerk` returns `null`, which drops the perk, whenever `validateSkillFields` reports an invalid enum. Every enum the renown schema sends is constrained except one:
- `kind`, `targetRule`, `resourceType`, `scaling` and `damageType` are `enumOf(...)` in the schema;
- `effectType` is a free `nullable(S)` ("For buff/debuff/dot/hot").

The renown route's "Valid values" list (`llm_layers.ts:325-330`) leaves out `effectType`, while the skill route lists `EFFECT_LIST` (`:305`). The renown prompt explicitly asks for "a small self-buff, a defensive cooldown". For such a buff the model has to invent an effect type (`defense_up`, `evasion`, `none`, ...). Anything outside `EFFECT_TYPES` drops the perk.

With fewer than three perks left, the whole reply is discarded, including valid passives, and the static pool is used. The call is still billed and counted. `skill_gen` does not have this problem: it defaults an invalid enum instead of dropping the skill.

**Fix:** Either change is enough:
- Add `- effectType (for buff, debuff, dot, hot): ${EFFECT_LIST}` to `RENOWN_PERK_BLOCK`'s valid values. Better still, make the schema field `nullable(enumOf(EFFECT_TYPES))`.
- Sanitize instead of dropping: use `processGeneratedSkill`'s sanitized output, which defaults an invalid `effectType` to `damage_up`, as `skill_gen` does.

Add a test where a buff perk with an unknown `effectType` is kept, clamped, rather than causing the static fallback.

## Info

### IN-B01: `data/llm_prompts.ts` is still dead code; `sendNarrationSkippedMessage` and a stale comment remain

*(carried forward from prior IN-B01)*

**Files:**
- `spacetimedb/src/data/llm_prompts.ts`: imported only by tests.
- `spacetimedb/src/helpers/combat_narration.ts:227`: `sendNarrationSkippedMessage` is exported and unused, and a test pins that it exists.
- `spacetimedb/src/helpers/llm_apply.ts:738`: the comment "Budget already incremented in triggerCombatNarration" refers to a function that no longer exists.

**Fix:** Delete these in Phase 42.

### IN-B02: Every successful apply still writes the dead `LlmBudget` table

*(carried forward from prior IN-B02)*

**File:** `spacetimedb/src/helpers/llm_apply.ts:19, 190, 405, 434, 732, 821, 855`, plus the header at `:9-11`

**Issue:** The header comment still describes the Phase 40 quirks as live behaviour.

**Fix:** Remove the calls and the header text with `LlmBudget` in Phase 42.

### IN-B03: Swallowing narration errors can commit a partial enqueue

*(carried forward from prior IN-B03)*

**File:** `spacetimedb/src/helpers/combat_narration.ts:128-153`

**Issue:** The behaviour is unchanged and acceptable. The sweeper cleans up afterwards.

### IN-B04: `request_skill_offer` still has no client caller

*(carried forward from prior IN-B04; the comment is fixed)*

**File:** `spacetimedb/src/index.ts:386-394`

**Issue:** Nothing in `src/` calls `request_skill_offer`, so `[skills]` is the only way to reach it. The misleading "own transaction" comment is now correct at `:577`.

### IN-B05: The race name derived from player text reaches later prompts untagged

*(carried forward from prior IN-B05)*

**File:** `spacetimedb/src/data/llm_layers.ts:454-460, 474, 488, 506`

**Issue:** `raceName` is rendered with `w()`, not `wrapPlayerName`, in the class, world-gen, skill and renown volatiles.

### IN-B06: The model's text output is still not scrubbed of echoed tags or entities

*(carried forward from prior IN-B06)*

**Files:**
- `spacetimedb/src/helpers/combat_narration.ts:179-217`
- `spacetimedb/src/helpers/llm_apply.ts:474-482`

**Issue:** Nothing strips `PLAYER_INPUT_TAG_PATTERN` tags or decodes `&lt;` / `&gt;` in the output before it is stored and broadcast.

### IN-B07: Loose ends from the client cleanup

*(carried forward from prior IN-B07)*

**Files:**
- `src/composables/useWorldGeneration.ts:12-13`
- `src/App.vue:732-735`
- `spacetimedb/src/index.ts:583-604`

**Issue:**
- `connActive` is still passed in and ignored (`_connActive`).
- `submit_llm_result` remains a client-trusted apply path until Phase 42. Run `purge_llm_tasks` on local and maincloud first.

### IN-B08: A billed skill_gen result is dropped silently when an offer is already pending

*(new, from a9866406)*

**File:** `spacetimedb/src/helpers/llm_apply.ts:418-422`

**Issue:** The drop branch only logs `console.error`. The player gets no line, and the call stays charged. With the new "one active job" rule this should be unreachable through the executor. Only the legacy `submit_llm_result` path can still hit it.

**Fix:** Post a short Keeper line, or assert that the branch is unreachable in a test.

### IN-B09: The creation auto-start is gated on the global character list, not the user's own characters

*(pre-existing; not introduced this phase)*

**Files:**
- `src/App.vue:764`
- `src/composables/useCharacterCreation.ts:82`

**Issue:** `characters` holds every character on the server (`useCoreData.ts:44`). On a populated server, a brand-new user never gets `start_creation`, so the console stays empty until they type. That first line is then consumed by the auto-start in `submit_creation_input`. It also causes the empty second-device console in WR-B01.

**Fix:** Use `myCharacters` in both checks.

### IN-B10: The mana fallback in `archetypeForCharacter` misreads warriors who hold any mana ability

*(new, from 32efd1c8)*

**Files:**
- `spacetimedb/src/helpers/llm_inputs.ts` (`archetypeForCharacter`, final fallback)
- `spacetimedb/src/helpers/character.ts:90-94`

**Issue:** `maxMana > 0n` is true for any character with a mana-cost ability. `skill_gen` defaults an invalid or missing `resourceType` to `'mana'` (`skill_gen.ts:88`, `skill_budget.ts:107-110`), so warriors can end up with mana abilities. The fallback only runs when no creation state exists for any of the user's identities, which is rare.

**Fix:** Persist the archetype at `finalizeCharacter`, for example in `classStats` or on the character, and drop the heuristic.

---

_Reviewed: 2026-09-30T21:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
