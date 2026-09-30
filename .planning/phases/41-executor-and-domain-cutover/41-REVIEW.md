---
phase: 41-executor-and-domain-cutover
reviewed: 2026-09-30T18:46:58Z
depth: standard
files_reviewed: 49
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
  - spacetimedb/src/helpers/test-utils.ts
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
  - scripts/llm/vitest.live.config.ts
  - docs/runbooks/llm-key.md
  - spacetimedb/src/index.ts
  - spacetimedb/src/reducers/npc_interaction.ts
  - spacetimedb/src/reducers/combat.ts
  - spacetimedb/src/reducers/creation.ts
  - spacetimedb/src/reducers/intent.ts
  - spacetimedb/src/reducers/groups.ts
  - spacetimedb/src/reducers/index.ts
  - spacetimedb/src/helpers/renown.ts
  - spacetimedb/src/helpers/skill_offer.ts
  - spacetimedb/src/helpers/creation_generation.ts
  - spacetimedb/src/helpers/world_gen.ts
  - spacetimedb/src/helpers/combat_narration.ts
  - spacetimedb/src/helpers/combat.ts
  - spacetimedb/src/helpers/travel.ts
  - spacetimedb/src/data/npc_gender.ts
  - spacetimedb/src/data/keeper_bible.ts
  - spacetimedb/src/data/llm_layers.ts
  - spacetimedb/src/data/llm_schemas.ts
  - spacetimedb/src/data/llm_prompts.ts
  - src/App.vue
  - src/composables/useCharacterCreation.ts
  - src/composables/useSkillChoice.ts
  - src/composables/useWorldGeneration.ts
findings:
  critical: 2
  warning: 9
  info: 14
  total: 25
status: issues_found
---

# Phase 41 Code Review (merged from two parallel standard-depth reviews)

Part A covers the executor pipeline core, money, scheduling, admin controls and the key script. Part B covers the per-domain cutover, NPC gender and pronoun work, and the client call sites. Finding IDs keep their part prefix (CR-A/WR-A/IN-A, CR-B/WR-B/IN-B).

# Part A

# Phase 41 (Part A): Code Review Report

**Reviewed:** 2026-09-30T18:43:14Z
**Depth:** standard
**Files Reviewed:** 26 (schema/tables.ts: only the llm_* tables and the Phase 41 diff since 43e7753c)
**Status:** issues_found

## Summary

Part A covers the executor core: claim, fetch, persist and apply. It also covers the micro-USD budget and ledger, the dispatch and sweep scheduling, the admin state, view and reducers, and the key script, live-proof harness and runbook.

These parts are sound and need no change:

- **Transaction bodies.** Every `withTx` body is re-invocable. Each one reads, writes inside itself and returns a plain value.
- **In-flight cap.** The cap is derived from `llm_job.by_status` inside the claim transaction, so two racing claims cannot both take the last slot.
- **Rescheduling.** Every retry, deferral and re-dispatch inserts a new `llm_dispatch` row.
- **Normal money path.** `reservedMicroUsd` zeroing makes release and settle idempotent, and `subFloor` stops any u64 underflow.
- **Views.** They use only primary-key and `by_player`/`by_status` index lookups.
- **Access guards.** Admin gating is consistent, and `llm_run` and `llm_sweep` refuse any caller that is not the module identity.
- **Key handling.** The key never reaches `llm_call_log`, `llm_job`, the admin state, the views or the script output. It is used only in `buildClaudeHeaders`, and it is passed as a redaction needle on every classify, log and smoke path.

No finding is a blocker. The main risks are on rare failure paths:

1. A failure message can be lost, which leaves a creation or world-gen player permanently soft-locked.
2. A reply that arrives after the sweeper expired its job is charged to the ledger twice.
3. A key rotation that happens while a call is in flight can mark the wrong key as valid or invalid.
4. The runbook's fallback tells the user to put the key in argv and shell history.
5. A billed 200 response whose body is not JSON is not charged to the hard ledger.

## Warnings

### WR-A01: A lost failure message strands creation and world-gen locks permanently, and no sweep rule recovers it

**File:** `spacetimedb/src/helpers/llm_executor.ts:255-263` (called at 171-177, 420-423, 445-449, 516-525, 561, 589, 634)
**Issue:** Every executor failure path has two steps:

1. It commits the terminal status (`failed` or `expired`) in one transaction.
2. It posts the in-voice failure through `runFailureApply` in a second transaction.

If `applyFailure` throws, the error is caught, logged and dropped (lines 259-262). The procedure can also stop between the two transactions, for example when the module is published or the host restarts. Either way the job is terminal but the domain lock was never released. The sweeper only scans `in_flight`, `received` and `pending` jobs (`llm_sweeper.ts:140,157,180`), so nothing retries the failure message.

For the gated domains, the player has no way out:

- `GENERATING_RACE` and `GENERATING_CLASS` only answer "Patience" (`reducers/creation.ts:442-474`, `start_creation` at 298). "Go back" is blocked in those steps (`creation.ts:399`).
- For world gen, `explore` answers "The world is already taking shape around you. Patience." while the state is `GENERATING` (`reducers/intent.ts:1409`, 1440).

The result is a permanent soft-lock of the player's creation or starter region. It breaks the locked CONTEXT rule that a failure "releases generation locks".
**Fix:** Try the status write and the failure message together, and fall back to a status-only write only when that throws. The status still can never be undone by a bug in the message. Also give the sweeper a way to find terminal jobs whose message was never delivered.
```ts
function commitFailure(ctx, jobId, buildFailedRow, deps, needles) {
  try {
    return ctx.withTx((tx) => {
      const failed = buildFailedRow(tx);            // status + money patch
      if (failed) deps.applyFailure(tx, toApplyJob(failed));
      return failed;
    });
  } catch (err) {
    deps.log(redactSecrets(`llm failure message failed for job ${jobId}: ${String(err)}`, needles));
    return ctx.withTx((tx) => buildFailedRow(tx));  // status + money only
  }
}
```
There are two ways to cover the crash window:

- Add a `failureNotifiedAt` (or `notified: bool`) column. Set it in the same transaction as the message, and add a sweep rule: terminal `failed`/`expired` jobs without it get `applyFailure` run once.
- Alternatively, add a sweep rule that resets `GENERATING_*` creation states and `GENERATING` world-gen states when they have no active job.

### WR-A02: A reply that arrives after the sweeper expired its job is charged to the phase ledger twice

**File:** `spacetimedb/src/helpers/llm_executor.ts:339-343` together with `spacetimedb/src/helpers/llm_sweeper.ts:146`
**Issue:** When the sweeper expires an `in_flight` job, it first calls `chargeLedgerUnknownBilling`, which adds the full reservation to `llm_spend.spentMicroUsd`. If the real reply then arrives, `persistAttempt` takes the stale branch and calls `addLedgerSpend(tx, realCost)` again. The ledger ends up with reservation + real cost for one call.

By then the billing is no longer unknown, so the conservative stand-in should be replaced, not added to. With a $2 hard cap and reservations of up to about $0.09 (world_gen), each late arrival wastes phase budget. That can trip `isPhaseLedgerExhausted` early and fail valid jobs with `billing`.

The pinned test hides this. `llm_executor.test.ts:1284-1313` simulates the sweeper with `releaseLlmReservation` only, without the `chargeLedgerUnknownBilling` call the real sweeper makes, and then asserts `spentMicroUsd === FIXTURE_COST`.
**Fix:** Record the conservative charge on the job, for example `ledgerChargedMicroUsd` (or put the charged amount in `costMicroUsd` with an `errorCode` of `timeout`). In the stale branch, swap that charge for the real cost:
```ts
if (!job || job.status !== 'in_flight' || job.attempt !== c.attempt) {
  const charged: bigint = job?.ledgerChargedMicroUsd ?? 0n;
  subtractLedgerSpend(tx, charged);          // subFloor
  addLedgerSpend(tx, realCost);
  if (job) tx.db.llm_job.id.update({ ...job, ledgerChargedMicroUsd: 0n });
  logCall(realCost);
  return { kind: 'stale' };
}
```
Then fix the test so its sweeper stand-in calls `sweepLlmJobs` (or also calls `chargeLedgerUnknownBilling`).

### WR-A03: A key rotation during an in-flight call marks the wrong key valid or invalid

**File:** `spacetimedb/src/helpers/llm_executor.ts:190-195, 408, 447`; `spacetimedb/src/reducers/llm.ts:39-45`; `spacetimedb/src/helpers/llm_admin_state.ts:47-51, 124-128`
**Issue:** tx1 reads the key when it claims the job. `set_api_key` can run while the call is in flight. It resets `keyVerifiedAt` and `keyLastCheckOk` and sets `keyUpdatedAt = now`. When the old-key call persists afterwards, two things can go wrong:

- **False valid.** A `smoke_test` job that was claimed with the old key succeeds and calls `markKeyCheck(tx, true)`. That sets `keyVerifiedAt` (the persist time) at or after `keyUpdatedAt`, so `isKeyValid` reports the **new** key valid although it has never been sent to Anthropic.
- **False invalid.** Runbook step "Rotation 4" tells the user to revoke the old key right after rotating. An in-flight call on the old key then comes back `auth` and calls `markKeyCheck(tx, false)`, which marks the new, working key invalid.

`keyValid` is the admin's only key-status signal (OPS-01, SEC-04), so either case misleads the admin.
**Fix:** Tie each check to the key version that was actually used. Carry `llm_config.updatedAt` in the claim, and only record a key check when that version is still current:
```ts
// claim
return { kind: 'run', ..., keyVersionMicros: cfg.updatedAt.microsSinceUnixEpoch };
// persist
const cfg = tx.db.llm_config.id.find(1n);
const sameKey = cfg && cfg.updatedAt.microsSinceUnixEpoch === c.keyVersionMicros;
if (sameKey && c.route === 'smoke_test') markKeyCheck(tx, true);
if (sameKey && (result.class === 'auth' || result.class === 'billing')) markKeyCheck(tx, false);
```

### WR-A04: The runbook's fallback puts the key in argv and shell history, which the key policy forbids

**File:** `docs/runbooks/llm-key.md:39` (contradicts line 70)
**Issue:** When the HTTP call fails, the fallback tells the user to run `spacetime call uwr set_api_key --server local` "interactively yourself, knowing the key is then briefly in that process's argument list". `spacetime call` takes reducer arguments on the command line, so the key would be:

- visible to other processes while the command runs;
- written to shell history. PowerShell's PSReadLine saves it to disk at `(Get-PSReadLineOption).HistorySavePath`, and this is a Windows machine.

The locked CONTEXT decision says the key must never be put "in argv or shell history". The same runbook's "Never do this" section (line 70) forbids putting the key "in `spacetime call` arguments".
**Fix:** Remove the fallback. Replace it with a diagnosis path that never handles the key:

1. Run `spacetime login show` to confirm the identity hex, and compare it with `ADMIN_IDENTITIES` in `data/admin.ts`.
2. Re-login.
3. Re-run `set-key.mjs`.

If a manual fallback is kept, it must not put the key in a command line. For example, a one-off `node -e` that reads `.env.local` and posts over HTTP is just the script again. At minimum, tell the user to clear the PSReadLine history file and the current session history afterwards.

### WR-A05: A billed 200 response whose body is not JSON is never charged to the hard ledger

**File:** `spacetimedb/src/helpers/llm_executor.ts:614-619` (with `claude_request.ts:434-440`)
**Issue:** A 2xx reply whose body is not a JSON object is classified as `server`, which is retryable and has no usage. `unknownBilling` is `threw || class === 'network'`, so this case counts as not billed. The ledger gets nothing, on the retry and on the final failure alike.

A 2xx means Anthropic ran the request, and a body that is truncated or corrupt in transit was almost certainly billed. The Phase 39 helper encodes exactly this rule. `measurement.settleCostMicroUsd` says: "A 200 (or no status at all) whose usage did not parse was still billed, so it also keeps the reservation."

The hard $2 cap therefore under-counts, which the ledger design says it must never do.
**Fix:**
```ts
const billedButUnparsed = !result.ok && httpStatus >= 200 && httpStatus < 300 && !result.usage;
const attemptOutcome: AttemptOutcome = {
  result, httpStatus, latencyMs,
  unknownBilling: threw || (!result.ok && result.class === 'network') || billedButUnparsed,
};
```

## Info

### IN-A01: Cost is computed from the raw usage, not the clamped counts, and outside the transaction

**File:** `spacetimedb/src/helpers/llm_executor.ts:305-314`; `spacetimedb/src/helpers/llm_queue.ts:263-266`
**Issue:** `realCost = BigInt(estimateCostMicroUsd(usage))` uses the unclamped `usage`, while the job and log columns use the clamped `u64()` values. A huge usage value from the API gives an `Infinity` cost. `BigInt(Infinity)` then throws before `persistAttempt` opens its transaction, so the job stays `in_flight` until the sweeper expires it, and the paid reply is lost. There is also a smaller mismatch: `u64` floors but `toU64` in `logLlmCall` rounds, so fractional counts differ by 1 between `llm_job` and `llm_call_log`.
**Fix:** Compute the cost from the clamped counts (`estimateCostMicroUsd({ input: Number(counts.input), ... })`). Use one rounding rule (floor) in both helpers.

### IN-A02: `confirmKeySet` can "confirm" from an earlier key set

**File:** `scripts/llm/cli.mjs:133-142, 166`
**Issue:** Confirmation only looks for any `llm key set, len=<n>` line in the last 200 log lines. Anthropic keys have a fixed length (the local proof logged `len 108`), so after a rotation the line from the previous set matches too. "key stored: yes" therefore proves no more than the HTTP 200 already did.
**Fix:** Confirm through something unique to this call. For example, read `admin_llm_status.keyUpdatedAt` and check it is at least the script's start time, or log `ctx.timestamp` alongside the length and compare it.

### IN-A03: `phaseCalls` counts jobs, not HTTP calls, and drops on refund even when a call went out

**File:** `spacetimedb/src/helpers/llm_budget.ts:143-149, 180-185`; `spacetimedb/src/helpers/llm_executor.ts:439-444`
**Issue:** The ledger's `calls` goes up once per reservation, not once per attempt. It goes down on every `refundCall: true` release, which includes attempts that timed out and may have been billed. `admin_llm_status.phaseCalls` therefore under-reports real calls, and the maincloud gate re-check may read it.
**Fix:** Rename it to `phaseJobs`, or count HTTP attempts separately. `llm_call_log` is the authoritative count.

### IN-A04: An Anthropic `billing` failure marks a valid key invalid

**File:** `spacetimedb/src/helpers/llm_executor.ts:447`
**Issue:** A Console spend-limit failure (`billing`) clears `keyLastCheckOk`, so `keyValid` reads false and the runbook points to rotation. The key itself is fine.
**Fix:** Clear `keyLastCheckOk` only on `auth`. Record billing state separately, for example `lastBillingFailureAt`.

### IN-A05: The sweeper's money-then-status order is not idempotent if the job update throws

**File:** `spacetimedb/src/helpers/llm_sweeper.ts:146-149, 163-165, 186-194`
**Issue:** In a reducer, a caught exception does not roll back earlier writes. The ledger and player-day writes happen before `llm_job.id.update`. If that update throws, the job still holds `reservedMicroUsd`, and the next sweep releases and charges it again. The header comment claims "a released reservation is zero", but that is only true once the job row is written.
**Fix:** Keep the order but check the job write first (for example, re-find the row and validate its shape). Or write the job row first, with the patch computed from the original job, so a later failure leaks at most one reservation instead of double-counting it. Document which choice was made.

### IN-A06: A job with an unknown route is never swept

**File:** `spacetimedb/src/helpers/llm_sweeper.ts:80-82`
**Issue:** `LLM_ROUTES[route].timeoutMs` throws a TypeError for an unknown route string, such as a legacy or corrupt row. The job is counted in `errors` and logged on every 30-second sweep indefinitely. It never expires and never releases its reservation.
**Fix:** `const cfg = LLM_ROUTES[route as LlmRoute]; return BigInt(cfg?.timeoutMs ?? 150_000) * 1000n;`, or expire unknown-route jobs directly.

### IN-A07: `isSmokeRequest` is duplicated in three modules

**File:** `spacetimedb/src/helpers/llm_executor.ts:120-126`, `spacetimedb/src/helpers/llm_sweeper.ts:72-78`, `spacetimedb/src/reducers/llm.ts:13-20`
**Issue:** The same JSON-parse smoke check appears three times. If one copy drifts, for example a new smoke marker, smoke jobs would change admin or game state through the failure path.
**Fix:** Export one `isSmokeRequest` from `llm_queue.ts` or `llm_admin_state.ts` and import it in all three places.

---

_Reviewed: 2026-09-30T18:43:14Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

# Part B

# Phase 41 (Part B): Code Review Report

**Reviewed:** 2026-09-30
**Depth:** standard (plus targeted cross-file tracing into the client render path, `skill_gen.ts`, `renown_perk.ts`, `useCharacters.ts`)
**Files Reviewed:** 25
**Status:** issues_found

## Summary

Part B covers moving each domain onto the executor (NPC chat, the combat outro, skills and renown, creation, world gen), the NPC gender and pronoun work, and removing client call sites.

Most of the cutover holds up:
- Every trigger enqueues inside its own reducer transaction.
- Refusals are answered in the Keeper's voice (`fail(...)` where a character exists, `creation_error` before one exists).
- Combat narration is wrapped so it cannot abort a combat tick.
- None of the `prepare_*` reducers or client calls remain.
- NPC gender is clamped on every insert and on every read.
- Player free text reaches the model only through `wrapPlayerInput` / `wrapPlayerName`.

Two defects block shipping:

1. **The first-region retry cannot be reached from the client.** A character whose starter world gen fails is left at `locationId 0`, and the client shows the creation console for such a character. Every keystroke and click there goes to `submit_creation_input`, which answers the `COMPLETE` step with "already created". The `[explore]` retry lives only in `submit_intent`, so the player is stranded. The server tests pass only because they call `submit_intent` directly.
2. **Skill offers for consecutive levels collide.** The dedupe key is per level, and the apply step uses the character's *current* level and overwrites pending rows. Applying two pending levels quickly bills two calls and permanently loses one earned offer. The old code prevented this by allowing only one `skill_gen` at a time.

The warnings cover:
- player text that is not capped at the reducer
- renown perks that skip the `skill_budget` clamps
- creation apply/failure that is not tied to the job's state row or step
- the archetype lookup being tied to one identity

## Critical Issues

### CR-B01: The first-region `[explore]` retry cannot be reached from the UI, so a player whose starter world gen fails is stranded

**Files:**
- `src/composables/useCharacters.ts:62-63`: `if (char && char.locationId === 0n) return null;`
- `src/App.vue:33-44`: the creation console is rendered whenever `!selectedCharacter`.
- `src/App.vue:1235-1238`: `onCreationSubmit` calls `submitCreationInput`.
- `src/App.vue:1254-1257`: a keyword click with `!selectedCharacter` calls `submitCreationInput`.
- `spacetimedb/src/reducers/creation.ts:596-599`: the `COMPLETE` case answers "Your character has already been created..."
- `spacetimedb/src/reducers/intent.ts:1405-1431`: the starter retry exists only here.
- `spacetimedb/src/helpers/world_gen.ts:187-192`: the refusal posts "...Type [explore] to try again later." as `creation_error`.
- `spacetimedb/src/helpers/llm_apply.ts:85-90`: `failWorldGen` does the same.

**Issue:** How the player gets stranded:
1. `finalizeCharacter` creates the character at `locationId 0n`, sets the creation state to `COMPLETE`, and calls `startWorldGeneration`.
2. If that enqueue is refused, or the job later fails or expires, the state goes to `ERROR`. The player sees a `creation_error` line telling them to type `[explore]`.
3. The client never selects a character at location 0, so the player is still in the creation console.
4. Typing `explore`, or clicking the rendered `[explore]` keyword, sends `submit_creation_input('explore')`.
5. That reducer only says "Your character has already been created. Go forth and do something interesting." and starts nothing.

The `character.locationId === 0n` branch added to the `explore` intent can never be reached from the shipped client. Nothing else retries the job, because world gen never auto-retries by design. The player is stuck at a blank location for good. This breaks the locked decision that "the first region gets a small retry path from the player's own ERROR starter state".

A second, smaller problem: the starter lookup filters `world_gen_state.by_player.filter(ctx.sender)`. After a login from another device (a different identity, same `userId`), no starter states are found and the answer is "nothing uncharted to explore".

**Fix:**
- Move the starter retry into a shared helper and call it from the `COMPLETE` branch of `submit_creation_input`.
- Look the starter states up by character, not by sender.

```ts
// helpers/world_gen.ts
export function retryStarterWorldGen(ctx: any, character: any): 'started' | 'busy' | 'none' {
  const starters = [...ctx.db.world_gen_state.iter()]            // or add a by_character index
    .filter((s: any) => s.characterId === character.id && s.sourceRegionId === 0n);
  if (starters.some((s: any) => s.step === 'PENDING' || s.step === 'GENERATING')) return 'busy';
  if (starters.length === 0 || starters.some((s: any) => s.step !== 'ERROR')) return 'none';
  const fresh = ctx.db.world_gen_state.insert({ id: 0n, playerId: ctx.sender, characterId: character.id,
    sourceLocationId: 0n, sourceRegionId: 0n, step: 'PENDING', createdAt: ctx.timestamp, updatedAt: ctx.timestamp });
  startWorldGeneration(ctx, fresh);
  return 'started';
}

// reducers/creation.ts, case 'COMPLETE':
const char = player.activeCharacterId != null ? ctx.db.character.id.find(player.activeCharacterId) : null;
if (char && char.locationId === 0n && /^\[?explore\]?$/i.test(trimmed)) {
  const r = retryStarterWorldGen(ctx, char);
  appendCreationEvent(ctx, ctx.sender, 'creation', r === 'busy'
    ? 'The world is already taking shape around you. Patience.'
    : r === 'started' ? 'The edges of reality ripple around you...' : 'There is nothing uncharted to explore here.');
  break;
}
```

Also add a test that drives the retry through `submit_creation_input`, which is the reducer the client actually calls.

### CR-B02: Offers for two consecutive levels collide; one earned offer is lost and both calls are billed

**Files:**
- `spacetimedb/src/helpers/skill_offer.ts:45-59, 79`
- `spacetimedb/src/index.ts:577-579`
- `spacetimedb/src/helpers/llm_apply.ts:379-395`
- `spacetimedb/src/helpers/skill_gen.ts:143-147`

**Issue:**
- `canRequestSkillOffer` only blocks on pending rows, or on an ability already taken at the *current* level.
- The dedupe key is `skillGen(characterId, level)`, so an active job for level N does not block a job for level N+1. The test at `skill_offer.test.ts:233` pins this behaviour.
- `applySkillGenResult` parses and inserts with `character.level` at apply time, not the level the job was queued for.
- `insertPendingSkills` deletes every existing `pending_skill` row first.

How the offer is lost:
1. A character at level 1 has `pendingLevels 2`. The player clicks "confirm level up" twice. The UI invites this ("You have 1 more level(s) to claim.").
2. Job A (level 2) and job B (level 3) are both enqueued and both billed.
3. A applies while the character is already level 3. Its three options are labelled "Level 3" and get `levelRequired 3`.
4. B applies, silently deletes A's rows (which the player may be looking at and clicking), and inserts its own.
5. The player picks one, and `choose_skill` deletes the rest.
6. From then on, rule 3 (an ability already taken at level 3) refuses `[skills]`.

The level 2 offer can never be recovered. The removed code refused a second `skill_gen` while one was pending, so this is a regression.

**Fix:**
- Refuse a new offer while *any* active `skill_gen` job exists for the character.
- Apply with the level stored in the job, not the character's current level.

```ts
// skill_offer.ts, canRequestSkillOffer
for (const j of ctx.db.llm_job.by_player.filter(playerId)) {
  if (j.route === 'skill_gen' && j.characterId === character.id && isActiveJobStatus(j.status)) {
    return { ok: false, message: SKILL_OFFER_MESSAGES.duplicate };
  }
}
// enqueueSkillOffer: request: { characterId, level: character.level.toString(), input }
// llm_apply.ts applySkillGenResult:
const offerLevel = context.level ? BigInt(context.level) : character.level;
if ([...ctx.db.pending_skill.by_character.filter(charId)].length > 0) { /* keep existing offer, do not overwrite */ return; }
const { skills } = parseSkillGenResult(resultText, charId, offerLevel);
insertPendingSkills(ctx, charId, skills, offerLevel);
```

`canRequestSkillOffer` needs the `playerId`, or it can scan by character. Then `apply_level_up` shows "already preparing". Once the level N offer is chosen, `[skills]` at level N+1 recovers the next offer.

## Warnings

### WR-B01: Player free text is not capped at the reducer; very large inputs throw a raw Error and inflate the reservation

**Files:**
- `spacetimedb/src/reducers/npc_interaction.ts:30, 88, 108-110, 121-123`
- `spacetimedb/src/reducers/creation.ts:427-431`
- `spacetimedb/src/helpers/creation_generation.ts:57-64`

**Issue:**
- `talk_to_npc` and `submit_creation_input` (the `AWAITING_RACE` step) store the whole trimmed player text in the job snapshot (`input.playerMessage` / `input.raceDescription`).
- `wrapPlayerInput` sends the model only the first 1000 code points (`PLAYER_INPUT_MAX_CHARS`).
- The budget reservation, however, is computed from the whole `requestJson` (chars ÷ 3), so the player is charged against text the model never sees.
- Above about 64K chars, `enqueueLlmJob` throws a plain `Error('LLM request context too large')`. The reducer rolls back with no in-voice reply, which breaks the rule that every refusal is answered through `fail`/`creation_error`.
- The unbounded text is also echoed into `npc_dialog` / `event_private` and stored on the public `character_creation_state.raceDescription`.

**Fix:** Truncate at the reducer, before the snapshot and the echo:

```ts
import { PLAYER_INPUT_MAX_CHARS, truncateCodePoints } from '../data/llm_layers';
const message = truncateCodePoints(typeof args.message === 'string' ? args.message.trim() : '', PLAYER_INPUT_MAX_CHARS);
// creation.ts AWAITING_RACE:
raceDescription: truncateCodePoints(trimmed, PLAYER_INPUT_MAX_CHARS),
```

### WR-B02: Renown perk model output skips the `skill_budget` clamps and becomes a combat ability

**Files:**
- `spacetimedb/src/helpers/llm_apply.ts:734-762`
- `spacetimedb/src/reducers/renown_perk.ts:41-66`

**Issue:** `applyRenownPerkResult` clamps model numbers only to the range [0, 1,000,000] (`perkInt`), and nothing else:
- `effectType` is a free string in the schema (`nullable(S)`), and it is stored unvalidated.
- Mana perks can have `castSeconds 0`.
- Cost and cooldown can be 0.

`chooseRenownPerkLogic` copies the row straight into `ability_template` (`isGenerated: true`, `levelRequired: 1n`). A reply such as `value1: 5000, cooldownSeconds: 0, resourceCost: 0` becomes a usable one-shot ability.

Skills generated through `skill_gen` run through `skill_budget.ts` validation (`skill_gen.ts:84-114`). Renown perks go live on real Claude this phase, yet skip that step, even though the route block claims "the server validates and clamps everything".

**Fix:**
- Run active perks (non-empty `kind`) through the same `skill_budget` validator that `parseSkillGenResult` uses, keyed by rank-equivalent level.
- Check `effectType` against `EFFECT_TYPES`.
- Force `castSeconds >= 1` for mana.
- Drop a perk that fails validation, so the static fallback covers the rank.

### WR-B03: Creation apply and failure are not tied to the job's creation state or its GENERATING step

**Files:**
- `spacetimedb/src/helpers/llm_apply.ts:94-104, 155-158, 169-176, 213-221, 253-254`
- `spacetimedb/src/helpers/creation_generation.ts:74-80`

**Issue:**
- The creation request carries only `{ input }`. It has no `creationStateId` and no generation type beyond the route.
- `applyCreationResult` and the `creation_*` branches of `applyLlmFailure` take `[...character_creation_state.by_player.filter(job.playerId)][0]`.
- They then overwrite `step` without checking that it is still `GENERATING_RACE` / `GENERATING_CLASS`.
- World gen does guard (`if (currentGenState.step !== 'GENERATING') return;`). Creation does not.

What can go wrong: a stale terminal event, such as a sweeper expiry racing a late persist/apply or a re-run apply, can:
- move a `COMPLETE` state back to `AWAITING_ARCHETYPE`, which reopens creation for a user who already has a character, or
- overwrite race data after the player has moved on to the class or name step.

The locked requirement is that creation failure reverts state *cleanly*. That should not depend on executor timing.

**Fix:**

```ts
// creation_generation.ts
request: { creationStateId: state.id.toString(), generationType, input: encodeRouteInput(input) },
// llm_apply.ts (both apply and failure)
const ctxJson = job.contextJson ? JSON.parse(job.contextJson) : {};
const s = ctxJson.creationStateId ? ctx.db.character_creation_state.id.find(BigInt(ctxJson.creationStateId)) : null;
const expected = job.domain === 'creation_race' ? 'GENERATING_RACE' : 'GENERATING_CLASS';
if (!s || s.step !== expected) return;   // stale: never touch a state that has moved on
```

### WR-B04: The archetype is looked up by the connecting identity, so a mystic can be prompted as a warrior

**Files:**
- `spacetimedb/src/helpers/llm_inputs.ts:170-175`
- `spacetimedb/src/helpers/skill_offer.ts:71`
- `spacetimedb/src/helpers/world_gen.ts:166`

**Issue:** `archetypeForPlayer(ctx, playerId)` reads `character_creation_state.by_player(playerId)`, where `playerId` is `ctx.sender`. Characters belong to a `userId`, and a second device or a new token has a different identity with no creation-state row. That silently falls back to `'warrior'`. The effects:
- `skill_gen` offers for a mystic come out stamina- and melee-flavoured.
- World-gen prompts misstate the character.

This is the RESEARCH 2.1 gap, only half closed.

**Fix:**
- Resolve the archetype from the character: find the creation state whose `playerId` owns the character's `ownerUserId`, or record the archetype at `finalizeCharacter`.
- Cheapest option: derive it from the class resource. `usesMana` is stored in `classStats`, and `state.archetype` is known at finalize, so persist it there.

## Info

### IN-B01: `data/llm_prompts.ts` is dead code but was still edited this phase

**File:** `spacetimedb/src/data/llm_prompts.ts:148, 200` (and the whole module)

**Issue:** No runtime module imports `llm_prompts.ts` any more; the grep finds only tests. It still holds legacy prompt text that breaks the new pronoun rule, for example "Be sardonic about their triumph" at `:784` and "remind them they have unfinished business" at `:574`. It also holds a copy of the prompts that can drift from `llm_layers.ts`.

**Fix:** Delete it, together with its tests, in Phase 42, or now. Related dead code:
- `sendNarrationSkippedMessage` (`combat_narration.ts:227-238`) is unused.
- The comment at `llm_apply.ts:699` ("Budget already incremented in triggerCombatNarration") refers to a function that no longer exists.

### IN-B02: Every successful apply still writes the dead `LlmBudget` table

**File:** `spacetimedb/src/helpers/llm_apply.ts:19, 160, 375, 395, 693, 730, 764`

**Issue:** CONTEXT declares `LlmBudget` / `incrementBudget` dead, but every apply still writes to it. The header comment (lines 9-11) still describes the Phase 40 budget quirks as live behaviour.

**Fix:** Remove the calls and the header text when Phase 42 deletes `LlmBudget`.

### IN-B03: Swallowing narration errors can commit a partial enqueue

**File:** `spacetimedb/src/helpers/combat_narration.ts:128-153`

**Issue:** `enqueueLlmJob` writes in this order: the budget reservation, then `llm_job`, then `llm_dispatch`. A throw after the first write is caught here, and the combat transaction commits. That leaves a reservation (or a job with no dispatch row) until the sweeper expires it 10 minutes later. Combat is still unaffected, which meets the requirement.

**Fix:** Acceptable as is. Optionally, validate or serialize the summary before calling `enqueueLlmJob`, so that the only remaining throw sources come before any write.

### IN-B04: The `request_skill_offer` reducer has no client caller, and a comment is misleading

**Files:** `spacetimedb/src/index.ts:385-394, 576`

**Issue:**
- Players reach the offer only through the `[skills]` intent. The reducer is regenerated in the bindings, but nothing in `src/` calls it.
- The comment "Queue the skill offer for the new level (own transaction…)" is wrong: the enqueue runs in the `apply_level_up` transaction.

**Fix:** Either wire the reducer or drop it. Change the comment to "same transaction".

### IN-B05: The race name derived from player text reaches later prompts untagged

**File:** `spacetimedb/src/data/llm_layers.ts:456-460, 474, 488, 506`

**Issue:** The race route tells the model to keep the player's race name exactly. So `raceName` is effectively player text, capped at 40 code points by `validateRaceReply`. It is then placed into the class, world-gen, skill and renown prompts as world data (`w()`), escaped but not inside `<player_input>`.

The risk is low: 40 characters, and escaped. It is still a second-order path around the rule that player text reaches the model only inside the tags.

**Fix:** Render the race with `wrapPlayerName` in those volatiles, or restrict `cleanName` to letters, spaces and hyphens.

### IN-B06: The model's text output is not scrubbed of echoed tags or entities

**Files:**
- `spacetimedb/src/helpers/combat_narration.ts:179-217`
- `spacetimedb/src/helpers/llm_apply.ts:435-443`

**Issue:** Narration and NPC dialogue are stored and broadcast verbatim. If the model repeats `<player_input>…</player_input>`, or copies `&lt;` / `&gt;` from escaped world data, the literal markup is shown to players. Today only the prompt forbids this; nothing checks it.

**Fix:** Before storing, remove the `PLAYER_INPUT_TAG_PATTERN` tags and decode `&lt;` / `&gt;` in text-route outputs.

### IN-B07: Loose ends from the client cleanup

**Files:**
- `src/composables/useWorldGeneration.ts:4-14`
- `spacetimedb/src/index.ts:582-603`

**Issue:**
- The `connActive` argument of `useWorldGeneration` is now unused (it was renamed to `_connActive`) but is still part of the API.
- `submit_llm_result` is still a client-trusted apply path. Removing it in Phase 42 is a deliberate decision, so it is not a defect here. Until then it is safe only once `purge_llm_tasks` has run on each database, because any remaining `pending` `llm_task` row can be completed with text the client wrote.

**Fix:**
- Drop the unused argument.
- Put "run purge_llm_tasks" on the checklist for local and maincloud before Phase 42.

---

_Reviewed: 2026-09-30_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
