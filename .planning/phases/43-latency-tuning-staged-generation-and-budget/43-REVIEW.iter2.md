---
phase: 43-latency-tuning-staged-generation-and-budget
reviewed: 2026-10-01T00:00:00Z
depth: standard
files_reviewed: 66
files_reviewed_list:
  - scripts/llm/proof_rules.mjs
  - scripts/llm/proof_rules.test.mjs
  - scripts/llm/prove-live.live.ts
  - scripts/llm/sweep.live.ts
  - scripts/llm/sweep_fixtures.mjs
  - scripts/llm/sweep_rules.mjs
  - scripts/llm/sweep_rules.test.mjs
  - spacetimedb/src/data/llm_limits.ts
  - spacetimedb/src/data/llm_limits.test.ts
  - spacetimedb/src/data/llm_routes.ts
  - spacetimedb/src/data/llm_routes.test.ts
  - spacetimedb/src/data/llm_tuning.ts
  - spacetimedb/src/data/llm_tuning.test.ts
  - spacetimedb/src/helpers/claude_request.test.ts
  - spacetimedb/src/helpers/llm_admin_commands.ts
  - spacetimedb/src/helpers/llm_admin_commands.test.ts
  - spacetimedb/src/helpers/llm_admin_state.ts
  - spacetimedb/src/helpers/llm_admin_state.test.ts
  - spacetimedb/src/helpers/llm_budget.ts
  - spacetimedb/src/helpers/llm_budget.test.ts
  - spacetimedb/src/helpers/llm_executor.ts
  - spacetimedb/src/helpers/llm_executor.test.ts
  - spacetimedb/src/helpers/llm_queue.ts
  - spacetimedb/src/helpers/llm_queue.test.ts
  - spacetimedb/src/helpers/llm_retry.test.ts
  - spacetimedb/src/helpers/llm_stats.ts
  - spacetimedb/src/helpers/llm_stats.test.ts
  - spacetimedb/src/helpers/llm_status.ts
  - spacetimedb/src/helpers/test-utils.ts
  - spacetimedb/src/helpers/test-utils.test.ts
  - spacetimedb/src/index.ts
  - spacetimedb/src/reducers/commands.ts
  - spacetimedb/src/reducers/llm.ts
  - spacetimedb/src/reducers/llm_admin.test.ts
  - spacetimedb/src/reducers/llm_commands.test.ts
  - spacetimedb/src/schema/tables.ts
  - spacetimedb/src/schema/llm_privacy.test.ts
  - spacetimedb/src/views/llm.ts
  - spacetimedb/src/views/llm.test.ts
  - src/llmAdminBindings.test.ts
  - spacetimedb/src/data/llm_indicator_lines.ts
  - spacetimedb/src/data/llm_indicator_lines.test.ts
  - spacetimedb/src/data/llm_layers.ts
  - spacetimedb/src/data/llm_layers.test.ts
  - spacetimedb/src/data/llm_schemas.ts
  - spacetimedb/src/data/llm_schemas.test.ts
  - spacetimedb/src/helpers/llm_inputs.ts
  - spacetimedb/src/helpers/llm_inputs.test.ts
  - spacetimedb/src/helpers/creation_generation.ts
  - spacetimedb/src/helpers/creation_generation.test.ts
  - spacetimedb/src/helpers/llm_apply.ts
  - spacetimedb/src/helpers/llm_apply.test.ts
  - spacetimedb/src/helpers/llm_apply.characterization.test.ts
  - spacetimedb/src/helpers/llm_sweeper.ts
  - spacetimedb/src/helpers/llm_sweeper.test.ts
  - spacetimedb/src/helpers/world_gen.ts
  - spacetimedb/src/helpers/world_gen.test.ts
  - spacetimedb/src/helpers/renown_llm.test.ts
  - spacetimedb/src/reducers/creation.ts
  - spacetimedb/src/reducers/intent.ts
  - spacetimedb/src/reducers/llm_cutover.test.ts
  - src/composables/generationLocks.test.ts
  - src/composables/useCharacterCreation.ts
  - src/composables/useLlmStatus.ts
  - src/composables/useLlmStatus.test.ts
  - src/composables/useWorldGeneration.ts
findings:
  critical: 0
  warning: 9
  info: 11
  total: 20
status: issues_found
---
# Phase 43: Code Review Report (merged from two parallel partial reviews)

The 66 files were split by area. Part A covers budget, kill switch, ceiling, admin commands, stats, the view, tuning and the harness. Part B covers staged world and class generation, progress lines and client locks. Each part's findings keep their prefixed IDs (CR-A/WR-A/IN-A and CR-B/WR-B/IN-B).

## Part A

# Phase 43 (Part A): Code Review Report

**Reviewed:** 2026-10-01
**Depth:** standard
**Files Reviewed:** 40
**Status:** issues_found

## Summary

Part A covers the global daily ceiling and kill switch (enqueue, reserve and claim), the `/llm` admin console
commands and stats, the admin view refresh, the measured tuning module, and the sweep/proof harnesses. I read
the diff `a991aa30..HEAD` for each file and the call chains it touches: executor claim/persist, the sweeper's
expiry charge, the apply failure path, `NarrativeMessage.vue` rendering, and the `useCommands`/`App.vue` routing
of `/llm`. The phase-related server tests (16 files, 850 tests) and the harness rule tests (3 files, 128 tests)
pass with `--maxWorkers=1`.

Checks that held up:
- **Admin authorization.** `/llm` decides admin from `ctx.sender`, using the same `ADMIN_IDENTITIES` set as
  `requireAdmin`. Both new reducers call `requireAdmin`. The view still returns `[]` to everyone else.
- **Fail-closed gate.** A missing admin-state row reads as halted with a 0 ceiling. A fresh database gets the row
  from `init`. Migrated rows pick up the column defaults.
- **Claim refunds.** `failAtClaim` releases a job's reservation exactly once, including when the failure message
  throws and the body re-runs. Jobs in `received` skip the gate, so results already paid for are still applied.
- **Console output.** Stats output has no `[`, `<` or `{`. Route names pass through `plainName`.
- **Harness secrets.** No key, prompt or reply reaches the record or stdout. Every line goes through `say()` and
  `scrub()`.

No blockers were found. The warnings are about money accuracy and safety margins:
- one cross-midnight under-count in the day counter;
- a relaxed spend guard in the paid proof harness;
- sweep accounting and record-overwrite gaps;
- a tuning derivation that drops truncated samples;
- tight `max_tokens` on two no-retry world-gen routes, derived from very small samples.

## Warnings

### WR-A01: Late-reply swap subtracts yesterday's conservative charge from today's day counter

**File:** `spacetimedb/src/helpers/llm_budget.ts:274-286` (called from `spacetimedb/src/helpers/llm_executor.ts:396-400`)
**Issue:** On the stale path, `subtractLedgerSpend` takes back the sweeper's conservative charge (`ledgerChargedMicroUsd`)
using `rolledDay(ledger, today)`. The doc comment says a swap after UTC midnight "floors the new day's figure at 0
... which can only over-count today". That is only true while the ledger has not yet rolled to today. If any other
write after midnight (a reserve or a settle) has already rolled `dayUtc` to today, `day.daySpentMicroUsd` holds
today's real spend. The subtraction then removes a charge that was booked yesterday from today's figure, so today
is under-counted and the ceiling is enforced against a figure that is too low. That is the unsafe direction, and
the comment says the opposite. The window is narrow (sweeper expiry near midnight plus a late reply), but this is
money logic and the stated invariant is false.
**Fix:** Record the UTC day of the sweeper's charge on the job, and only take the charge back from the day counter
when that day is today:
```ts
// sweeper: ledgerChargedDayUtc: utcDay(ctx.timestamp)   (new llm_job column, default '')
export function subtractLedgerSpend(ctx: any, micro: bigint, chargedDayUtc: string): void {
  if (micro <= 0n) return;
  const ledger = getPhaseLedger(ctx);
  if (!ledger) return;
  const today = utcDay(ctx.timestamp);
  const day = rolledDay(ledger, today);
  ctx.db.llm_spend.id.update({
    ...ledger,
    spentMicroUsd: subFloor(ledger.spentMicroUsd, micro),
    dayUtc: day.dayUtc,
    daySpentMicroUsd: chargedDayUtc === today ? subFloor(day.daySpentMicroUsd, micro) : day.daySpentMicroUsd,
    updatedAt: ctx.timestamp,
  });
}
```
Also add a test where the ledger has already rolled to day D+1 with spend X before the swap arrives, and assert
that today's figure is not below X plus the real cost.

### WR-A02: Paid live-proof spend guard went from $1.80 all-time to $9.80 per day

**File:** `scripts/llm/prove-live.live.ts:192-200`, `scripts/llm/proof_rules.mjs:16-31`
**Issue:** `paidStep` used to stop at (all-time spent + reserved) >= ($2 phase cap - $0.20). It now stops at
(today's held spend) >= (daily ceiling - $0.20). The ceiling defaults to $10 and an admin can raise it to $1,000.
The harness is paid by default (no env var), so one run can now spend up to about $9.80, five times the old
bound. The bound also resets every UTC day and follows whatever ceiling an admin last set for players. The
harness's own budget is now tied to a live production knob instead of a fixed constant.
**Fix:** Give the harness its own fixed cap that applies alongside the ceiling, and track spend from the start of
the run:
```ts
export const PROOF_RUN_CAP_MICRO_USD = 2_000_000n;
// at start: const startHeld = heldTodayMicroUsd(status(), todayUtcString(Date.now()));
const held = heldTodayMicroUsd(s, todayUtcString(Date.now()));
if (shouldStopForSpend(held, 0n, s.dailyCeilingMicroUsd, PROOF_SPEND_MARGIN_MICRO_USD) ||
    held - startHeld >= PROOF_RUN_CAP_MICRO_USD) { ... }
```

### WR-A03: Tuning derivation silently drops Run A truncations, so p99 and max_tokens come out too low

**File:** `spacetimedb/src/data/llm_tuning.ts:191, 226-246`
**Issue:** `successfulOutputs` keeps only `ok === true` samples. A reply that stops at `max_tokens` is classified
`truncated`, which is not ok. So in Run A, the very samples that should drive the p99 (the longest outputs) are
removed from it. `deriveRecordFields` treats a truncation as insufficient data only when it happens in Run B
(`truncatedInRunB`). A Run A truncation at `SWEEP_MAX_TOKENS` therefore yields a confident `tuned` value below the
real tail. The committed record has no truncations, so today's values are not affected, but the next re-sweep
would be.
**Fix:** Treat any Run A sample that stopped at `max_tokens`, in either cell, as insufficient data:
```ts
const truncated = (cells: SweepCell[]) => cells.some((c) => c.samples.some((s) => s.stopReason === 'max_tokens'));
if (chosenOutputs.length < LLM_TUNING_MIN_SAMPLES || truncatedInRunB ||
    truncated([rec.efforts.low, rec.efforts.medium])) { /* insufficient */ }
```
Add a `llm_tuning.test.ts` case for it.

### WR-A04: Tuned max_tokens for the no-retry world-gen routes rest on sample maxima with 25-29% headroom

**File:** `spacetimedb/src/data/llm_tuning.ts:325-333` (`world_gen_start` 1024 from p99 818; `world_gen` 2560 from p99 1988; `combat_narration` 256 from 5 samples)
**Issue:** With 5-10 samples, nearest-rank p99 is just the sample maximum. `x1.25` rounded to 256 leaves only
206 tokens of headroom on `world_gen_start` and 572 on `world_gen`. Both routes are in
`LLM_NO_AUTO_RETRY_ROUTES`, and `truncated` is a billed failure (`BILLED_FAILURE_CLASSES`): a truncated reply is
paid for, never retried, and fails the region stage. The fixtures are five static inputs. Real world-gen requests
carry varying neighbour lists and contexts, and the fill schema allows up to 4 locations and 3 enemies, which the
fixtures may not reach. One Run B `combat_narration` call (182) already exceeded its Run A cell maximum (168).
**Fix:** Add an absolute headroom floor to `tunedMaxTokens`, for example `max(256, ceil(max(p99 * 1.25, p99 + 512) / 256) * 256)`,
or keep the baseline for routes in `LLM_NO_AUTO_RETRY_ROUTES` until more samples exist. Watch the `truncated`
column in `/llm stats` after rollout.

### WR-A05: Sweep spend tracking under-counts billed-but-unparsed replies and does not gate the retry

**File:** `scripts/llm/sweep.live.ts:210-213, 231-244`
**Issue:**
- `callClaude` charges the reservation only for `timeout` and `network`. A 2xx whose body could not be used and
  carries no usage costs 0 here. The executor treats that same case as unknown billing (`billedButUnparsed`,
  `llm_executor.ts:677`) and charges the reservation. The paid harness therefore under-counts against its $4.50
  stop line in exactly the case the server is conservative about.
- `callWithRetry` makes a second paid call without calling `shouldStopSweep`, so the stop line can be passed by
  one reservation. The $0.50 margin currently absorbs this, but the guard is not doing what its comment says.

**Fix:**
```ts
else if (!result.ok && (result.class === 'timeout' || result.class === 'network' ||
         (status >= 200 && status < 300))) cost = reservation;
// callWithRetry: take `spent` and skip the retry when shouldStopSweep(spent + first.costMicroUsd, reservation)
```

### WR-A06: Run A overwrites the committed 'applied' record unconditionally, even on a zero-call crash

**File:** `scripts/llm/sweep.live.ts:297-337`
**Issue:** `runA` writes the record in `finally` with `status: 'measured'`, whatever the existing record's status.
If `SWEEP_LIVE_RUN=A` is set again, or the first `buildSweepRequest` throws before any call, the paid, applied
`llm_measurements.json` is replaced by an empty `measured` record. `LLM_TUNING` then no longer traces to it, and
`llm_tuning.test.ts` fails. Run B guards on `status === 'measured'`, but Run A has no guard. The file is in git,
so this is recoverable, but it is still silent loss of a paid artefact.
**Fix:** Before the loop, refuse to run when the existing record is `applied` (or `measured` with calls > 0)
unless an explicit override env var is set. In `finally`, write only when `calls > 0`.

## Info

### IN-A01: `/llm on|off|ceiling` leaves no module-log audit line

**File:** `spacetimedb/src/helpers/llm_admin_commands.ts:103-124`
**Issue:** The `llm_set_enabled` and `llm_set_daily_ceiling` reducers `console.log` the change. The slash-command
path writes only a private event to the admin's console. A kill-switch flip or ceiling change made through
`/llm` cannot be found in `spacetime logs`.
**Fix:** Add `console.log(enabled ? 'llm calls on' : 'llm calls off')` and `console.log('llm daily ceiling set, micro_usd=' + micro)` to match the reducers.

### IN-A02: Runbook still documents the retired phase cap

**File:** `docs/runbooks/llm-key.md:88`
**Issue:** The runbook still says the player sees "The Keeper has fallen silent for now" and tells the admin to
compare against `phaseCapMicroUsd`. Neither exists after Phase 43: the line is now the resting line, and the
field is now `dailyCeilingMicroUsd` / `llmEnabled`.
**Fix:** Rewrite that row to cover the resting line, `/llm stats`, `/llm on` and `/llm ceiling`.

### IN-A03: Ceiling default duplicated as a literal in the schema

**File:** `spacetimedb/src/schema/tables.ts:2207`
**Issue:** `dailyCeilingMicroUsd: t.u64().default(10_000_000n)` repeats `LLM_DAILY_CEILING_DEFAULT_MICRO_USD` as a
literal. Changing the constant would leave migrated rows on the old default, while `llmGate`'s `??` fallback uses
the new one.
**Fix:** Import the constant into `tables.ts`, or pin the two together with a test.

### IN-A04: `/llm stats` "Today ... reserved" is all reservations, not today's

**File:** `spacetimedb/src/helpers/llm_stats.ts:152-156`
**Issue:** The ledger line says "Today $X spent and $Y reserved", but `Y` is `ledger.reservedMicroUsd`, which covers
reservations from any day. That is the correct figure for the ceiling, but the wording can mislead.
**Fix:** Change the wording to "... spent today and $Y currently reserved".

### IN-A05: Claim-time halted/ceiling refunds the player's call even after earlier billed attempts

**File:** `spacetimedb/src/helpers/llm_executor.ts:229-245`
**Issue:** `failAtClaim('halted' | 'ceiling')` uses `refundCall: true`. For a retry job whose earlier attempt was
unknown-billing (already charged to the ledger), the player gets the daily call back even though a billed attempt
happened. This matches the existing `auth` and `bad_request` behaviour, so it is a policy point rather than a
regression.
**Fix:** Optionally pass `refundCall: job.attempt === 0n` for the two new stop codes.

---

_Reviewed: 2026-10-01_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

## Part B

# Phase 43 (Part B): Code Review Report

**Reviewed:** 2026-10-01T09:23:52Z
**Depth:** standard
**Files Reviewed:** 26
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

Part B covers staged world generation (`world_gen_start` then the `world_gen` fill), the staged class reveal (`creation_class_reveal` then the `creation_class` fill), the step machines and the sweeper holder sets, the rotating Keeper progress lines, and the client input locks. The review used `git diff a991aa30..HEAD`. It also ran `tsc --noEmit` on the module and the 13 reviewed test files (`vitest --maxWorkers=1`). All 1021 tests pass.

What holds up under adversarial tracing:
- **Step guards.** Every apply and failure path is gated on the state's own step: GENERATING or FILLING for world gen, and GENERATING_CLASS or CLASS_FILLING for the class. A late, stale or duplicate stage result cannot overwrite a newer state.
- **Go-back.** Go-back is blocked during GENERATING_CLASS and CLASS_FILLING. From CLASS_FILL_ERROR it can only run when no fill job is active.
- **Retries.** A fill retry re-reads its input from stored rows. The stage-1 and stage-2 routes use separate dedupe keys because the route is part of the key.
- **Sweeper.** Holder sets are split by stage: `world_gen_start` holds PENDING/GENERATING, `world_gen` holds FILLING, and `creation_class` holds CLASS_FILLING. Each stage degrades to its own error step.
- **Prompt input.** The new volatile builders pass every stored string through `sanitizeWorldData` (`w`/`wm`).
- **Pronouns.** New copy and prompts follow the rule: the Keeper is he, NPCs are male or female, the player is "you".
- **`intent.ts`.** It has no other undefined identifiers. `tsc` reports no "Cannot find name" there. Every name destructured from `deps` and every `deps.X` exists in `reducerDeps` in `index.ts`. The only `tsc` errors in the file are bigint/number typing noise at lines 989-991. They predate this phase and are safe at runtime because `vendorSellBonus` values are whole numbers.

The defects found are about the player getting stuck or being told the wrong thing. None corrupts data:
- The stage-1 job counts against its own successor's per-player cap.
- A starter region whose fill failed is a one-room dead end that new same-race characters are also placed into.
- A refused class fill tells the player "Patience" when only their input can retry it.

## Warnings

### WR-B01: The stage-1 job counts against its own stage-2 enqueue, so the fill is refused 'busy'

**File:** `spacetimedb/src/helpers/world_gen.ts:560-575`, `spacetimedb/src/helpers/creation_generation.ts:173-181` (called from `spacetimedb/src/helpers/llm_apply.ts:378` and `:546`)
**Issue:** The executor runs `deps.apply` while the stage-1 job is still `status: 'received'`. It marks the job `completed` only after apply returns (`llm_executor.ts:558-559`).
- `enqueueLlmJob` for the fill calls `countActiveCappedJobs`. That count includes every active job, including the `received` stage-1 job that is being applied.
- `LLM_PLAYER_MAX_ACTIVE_JOBS` is 3, and neither `world_gen` nor `creation_class` is in `LLM_CAP_EXEMPT_ROUTES`.

So a player with two other capped jobs running (for example an NPC conversation plus a skill offer, or a held renown offer) gets their stage 2 refused with `busy` by their own stage 1:
- World gen goes straight to FILL_ERROR with `WORLD_FILL_REFUSED_MESSAGE`, after the stage-1 call succeeded and was billed.
- The class goes to CLASS_FILL_ERROR (see WR-B03 for what the player is then told).

Stage 2 continues a request that was already admitted, so the cap should not count against it twice.
**Fix:** Pick one:
- Exempt the continuation routes:
  ```ts
  export const LLM_CAP_EXEMPT_ROUTES = Object.freeze([
    'combat_narration', 'renown_perk_gen', 'world_gen', 'creation_class',
  ] as LlmRoute[]);
  ```
- Or let the stage-2 enqueue exclude the job being applied: pass `excludeJobId` through `EnqueueArgs` and skip it in `countActiveCappedJobs`.

Either way, add a test in which the player holds two other active capped jobs when stage 1 applies, and assert FILLING / CLASS_FILLING.

### WR-B02: A starter region whose fill failed is a one-room dead end, and same-race characters are placed into it

**File:** `spacetimedb/src/helpers/world_gen.ts:423-425`, `:592-616`, `:271-327`
**Issue:**
- For a starter state (`sourceLocationId === 0n`), `writeRegionStart` connects the start location to nothing. Only `writeRegionFill` writes the uncharted boundary.
- When the fill fails or is refused (budget, kill switch, ceiling, malformed reply), the region becomes FILL_ERROR. It has exactly one safe location with no exits, no enemies and no edge.
- `reuseStarterRegion` matches any region with `starterForRace` set, which stage 1 already writes (`llm_apply.ts:484-487`). It does not check whether that region's fill finished. Every later character of that race is therefore placed in the same one-room region, with the arrival text "Try [look] ... or [travel] to move." (`world_gen.ts:324`). `[travel]` then answers "There is nowhere to go from here."

`[explore]` recovers this only when the explorer's own budget allows. If the cause was the daily cost limit, the ceiling or the kill switch, these players are walled in until it lifts. The "stage-1 region stays playable" decision holds for non-starter regions, which keep the passage back, but not for starter regions.
**Fix:** Either:
- Have `failWorldFill` give an incomplete starter region a way out: write the uncharted boundary (connected to the start location) when the region has none, so `travel` can trigger generation; or
- Skip reuse of a starter region whose generating state is not COMPLETE: look up the state by `generatedRegionId` in `reuseStarterRegion` and fall through to a fresh `world_gen_start` when it is FILLING or FILL_ERROR.

Also stop promising `[travel]` in the reuse arrival text when the home location has no connections.

### WR-B03: A refused class fill tells the player to wait, but nothing will retry without input

**File:** `spacetimedb/src/helpers/creation_generation.ts:159-164`, `:181`; `spacetimedb/src/helpers/llm_apply.ts:370-378`
**Issue:** When `startClassFill` is refused, `toError(llmRefusalMessage(result.refused))` posts the bare refusal line and parks the state at CLASS_FILL_ERROR.
- For `busy` that line is "The Keeper is already considering something for you. Patience." For `halted`/`ceiling` it is "The Keeper is resting. Return later."
- It comes right after the reveal's milestone line, "...so do not touch anything." (`CLASS_REVEAL_MILESTONE_LINE`).
- CLASS_FILL_ERROR only retries on the player's next input. A player who follows the "Patience" instruction waits forever: no job exists and the sweeper never touches CLASS_FILL_ERROR.

The world-gen counterpart (`failWorldFill`) appends "Type [explore] to try again."; this path appends nothing. Only the `start_creation` resume line (`creation.ts:350`) explains that any input retries, and the player sees it only after a reload.
**Fix:** Append the retry instruction on every refusal into CLASS_FILL_ERROR:
```ts
if (result.refused) {
  return toError(`${llmRefusalMessage(result.refused)} Say anything when you want him to try the rest again.`);
}
```
The same suffix belongs on the `applyLlmFailure` resting branch for `creation_class` (`llm_apply.ts:180`). There, `LLM_RESTING_LINE` is posted without it.

## Info

### IN-B01: An oversized stage-2 request throws inside the stage-1 apply and discards a good stage 1

**File:** `spacetimedb/src/helpers/world_gen.ts:551-566`, `spacetimedb/src/helpers/creation_generation.ts:166-180`
**Issue:**
- `startWorldFill` and `startClassFill` wrap the input builder in `try`, but not `enqueueLlmJob`.
- `enqueueLlmJob` throws on `requestJson.length > LLM_REQUEST_JSON_MAX_CHARS`, which is deterministic for a given input.
- In the stage-1 apply, that throw rolls back the whole apply twice (`LLM_APPLY_MAX_ATTEMPTS`). The job ends as `apply_error`, and the state drops to ERROR / AWAITING_ARCHETYPE, even though the billed stage-1 reply was valid.
- `WorldFillInput` carries model text with no length limit (start description, neighbor `threats` JSON for every neighbor region).

The limit is 64k characters, so this is unlikely but not impossible.
**Fix:** Catch the throw around `enqueueLlmJob` in both helpers and route it to `failWorldFill` / `toError(CLASS_FILL_FAILED_LINE)`. Or truncate the free-text fields of the stage-2 input, which is better.

### IN-B02: The rotation starts mid-pool, contrary to the documented "fresh indicator looks as it did before"

**File:** `src/composables/useLlmStatus.ts:159-170`, `spacetimedb/src/data/llm_indicator_lines.ts:94-96`
**Issue:** `tick` is one counter that starts when App mounts and increases forever. A job that becomes active at tick 7 opens on `pool[7 % 3]`, not `pool[0]`. The doc comment says "pool[0] is always the Phase 42 line for the route, so a fresh indicator looks as it did before". That is only true at tick 0.
**Fix:** Either reset the rotation when the winning row's id changes (keep a per-row start tick, `rotation - startTick`), or correct the comment.

### IN-B03: NPC placement uses exact-case names while location dedupe is case-insensitive

**File:** `spacetimedb/src/helpers/world_gen.ts:827`
**Issue:** Locations are deduped and `connectsTo` is resolved with `byLowerName`, but an NPC's `locationName` is looked up in `byExactName` only. An NPC whose `locationName` differs only in case, or that names a location skipped as a duplicate, silently lands at the start location.
**Fix:** `const npcLocation = byExactName.get(npc.locationName) ?? byLowerName.get(lower(npc.locationName)) ?? startLocation;`

### IN-B04: A class can reach CLASS_REVEALED with two abilities while the copy says three

**File:** `spacetimedb/src/helpers/llm_apply.ts:412`, `spacetimedb/src/reducers/creation.ts:597`
**Issue:** `applyClassFillResult` accepts a fill that adds only one ability (`cls.abilities.length < 2` is the only reject). The ability prompt then still says "I presented three abilities". It is also unclear whether a two-ability kit is acceptable given the "exactly 2 more abilities" contract.
**Fix:** Either require `cls.abilities.length >= 3` (fail the fill into CLASS_FILL_ERROR so the player can retry), or build the error line from `abilities.length`.

### IN-B05: In-flight pre-split jobs are released by the sweeper while still running

**File:** `spacetimedb/src/helpers/llm_sweeper.ts:291-301`
**Issue:** A `world_gen` or `creation_class` job queued before this deploy holds a GENERATING / GENERATING_CLASS state. The holder sets now credit those routes only to FILLING / CLASS_FILLING, so after 60 s the sweeper fails the state while the old job is still in flight. The old result is then dropped by the step guard (the call is wasted), or, for the class, picked up later as the 'duplicate' of a new fill.

This is a one-time transition effect. Per the project's greenfield rule it may be acceptable, but nothing documents it.
**Fix:** Note it in the deploy checklist, or clear active `llm_job` rows when publishing this phase.

### IN-B06: Stale or unreachable leftovers in the touched code

**File:** `spacetimedb/src/helpers/world_gen.ts:224`, `spacetimedb/src/reducers/creation.ts:30`
**Issue:**
- The `StarterRetryOutcome` doc still says "its world_gen job enqueued". It is now a `world_gen_start` job.
- `determineGoBackTarget` still maps `GENERATING_CLASS`, but go-back is gated off at GENERATING_CLASS (line 467), so that branch is dead. The new CLASS_FILL_ERROR special case sits outside the `switch` instead of being a `case` alongside it.
**Fix:** Update the comment, drop the dead `GENERATING_CLASS` case, and move the CLASS_FILL_ERROR mapping into the `switch`.

---

_Reviewed: 2026-10-01T09:23:52Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
