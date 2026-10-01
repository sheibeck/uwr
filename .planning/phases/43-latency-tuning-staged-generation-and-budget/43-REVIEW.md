---
phase: 43-latency-tuning-staged-generation-and-budget
reviewed: 2026-10-01T10:26:43Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - scripts/llm/proof_rules.mjs
  - scripts/llm/proof_rules.test.mjs
  - scripts/llm/prove-live.live.ts
  - scripts/llm/sweep.live.ts
  - scripts/llm/sweep_rules.mjs
  - scripts/llm/sweep_rules.test.mjs
  - spacetimedb/src/data/llm_tuning.ts
  - spacetimedb/src/data/llm_tuning.test.ts
  - spacetimedb/src/helpers/creation_generation.ts
  - spacetimedb/src/helpers/creation_generation.test.ts
  - spacetimedb/src/helpers/llm_apply.ts
  - spacetimedb/src/helpers/llm_apply.test.ts
  - spacetimedb/src/helpers/llm_budget.ts
  - spacetimedb/src/helpers/llm_budget.test.ts
  - spacetimedb/src/helpers/llm_executor.ts
  - spacetimedb/src/helpers/llm_executor.test.ts
  - spacetimedb/src/helpers/llm_queue.ts
  - spacetimedb/src/helpers/llm_queue.test.ts
  - spacetimedb/src/helpers/llm_sweeper.ts
  - spacetimedb/src/helpers/llm_sweeper.test.ts
  - spacetimedb/src/helpers/schema_recorder.test.ts
  - spacetimedb/src/helpers/world_gen.ts
  - spacetimedb/src/helpers/world_gen.test.ts
  - spacetimedb/src/reducers/intent.ts
  - spacetimedb/src/reducers/llm_cutover.test.ts
  - spacetimedb/src/schema/llm_privacy.test.ts
  - spacetimedb/src/schema/tables.ts
findings:
  critical: 0
  warning: 0
  info: 14
  total: 14
status: issues_found
---

# Phase 43: Code Review Report (re-review after fix iteration 1)

**Reviewed:** 2026-10-01T10:26:43Z
**Depth:** standard
**Files Reviewed:** 27
**Status:** issues_found (Info only)

## Narrative Findings (AI reviewer)

## Summary

This pass re-reviews the nine fix commits from iteration 1 (`git diff b1b0caba..HEAD`). They are 3b19464d WR-A01, 28381b89 WR-A02, 0adb2fe8 WR-A03, f4f031b6 WR-A04, 2bccf28f WR-A05, fc382f66 WR-A06, 03852c55 WR-B01, 2d266065 WR-B02 and 9dc3752c WR-B03. I also traced the code each fix reaches:
- the sweeper's in-flight expiry, the executor's stale path and claim gates (kill switch, ceiling, in-flight cap), and `reserveLlmBudget`, `releaseLlmReservation`, `settleLlmCost` and `rolledDay`;
- the `explore` and `travel` intent handlers, `retryWorldFill` and `startWorldFill`;
- `writeRegionFill` (boundary and connections) and `connectLocations`, which writes both directions;
- the `CLASS_FILL_ERROR` reducer branch and the client input-lock steps;
- the `my_llm_jobs` projection, to confirm the new job column stays private.

The 13 phase test files (server plus harness rules) pass with `--maxWorkers=1`: 900 tests. The working tree was unchanged afterwards.

All nine fixes are correct and complete for the defects they target. I found no blocker or warning-level regression. The money paths hold up:
- **Across midnight (WR-A01).** The day-counter take-back happens only when the stand-in was booked today. Unknown days (`''`, including rows from before the column) keep the safe over-count. All-time spend is always exact.
- **Double or under refunds.** None was found. The sweeper charge is recorded on exactly the paths that call `chargeLedgerUnknownBilling` (same `reservedMicroUsd > 0n` condition, same transaction, same UTC day). The stale path clears both fields after the swap. A swap with no usage still keeps the stand-in.
- **Cap exemption (WR-B01).** It skips only the per-player `busy` check. `halted` is still checked first in `enqueueLlmJob`. `reserveLlmBudget` still enforces `daily_calls`, `daily_cost` and the ceiling, and the claim still re-checks the kill switch, the ceiling and `LLM_MAX_IN_FLIGHT` (a fill above the global cap is deferred, not refused).

What is left: the 11 Info items from the previous review, all still valid because no fix touched them, and 3 new Info items about the fixes' scope and wording.

## Fix Verification (iteration 1)

| Finding | Commit | Verdict | Notes |
|---|---|---|---|
| WR-A01 | 3b19464d | Resolved | `subtractLedgerSpend(ctx, micro, chargedDayUtc)` lowers today's figure only when `chargedDayUtc === today`. The sweeper sets the day only when it actually charged (`charged > 0n`), and the stale path clears both fields. Across midnight, the real cost lands on the new day while the stand-in stays on the old one. That over-counts, which is the documented safe direction. The additive column `t.string().default('')` is private, and `my_llm_jobs` projects only six fields. |
| WR-A02 | 28381b89 | Resolved | `shouldStopForRunCap` measures from `runStartHeld` using all-time spent plus reserved, so it neither resets at midnight nor follows the ceiling. It is checked alongside the ceiling guard before every paid step. A multi-call step can still go past the line by the size of that step's own calls, as before. |
| WR-A03 | 0adb2fe8 | Resolved | `truncatedInRunA` covers both cells. The committed record has no truncations, so `LLM_TUNING` is unchanged by this commit. |
| WR-A04 | f4f031b6 | Resolved | `noRetryMaxTokens` is applied only to `LLM_NO_AUTO_RETRY_ROUTES`. It is capped at the baseline and never lowers the x1.25 figure. Every tuned no-retry entry now has at least 512 tokens above its p99: world_gen 2560 vs p99 1988, so +572. There is no runtime import cycle: `llm_limits` imports `llm_routes` as a type only. The larger reservations (combat_narration about +5k micro-USD) are negligible against the $1 per-player day budget. |
| WR-A05 | 2bccf28f | Resolved | `sweepCallCostMicroUsd` matches the executor and `settleCostMicroUsd`. The retry is gated by `sweepRetryAllowed(spent, first.cost, reservation)` before the second call. |
| WR-A06 | fc382f66 | Resolved | `sweepRunRefusal` runs before `loadAnthropicKey`. `writeRecord` re-reads the file on disk and writes only when `callsThisRun > 0` and the record is not `applied`. Run B passes only its own new calls. |
| WR-B01 | 03852c55 | Resolved (see IN-C01 on scope) | The stage-2 enqueue inside the stage-1 apply is no longer refused `busy` by the stage-1 job it continues. Every other gate still applies. |
| WR-B02 | 2d266065 | Resolved | A reused starter region with no exits no longer promises `[travel]`. Both `travel` paths with no exits now name the next step. FILLING takes priority over FILL_ERROR. `retryWorldFill` hands a FILL_ERROR state to whichever character is in the region, and the failure line follows the handed `characterId`. `writeRegionFill` always writes and connects a boundary, so a completed region is never exitless. |
| WR-B03 | 9dc3752c | Resolved (see IN-C02 on wording) | Every refusal into CLASS_FILL_ERROR, and the resting branch of `applyLlmFailure` for `creation_class`, now ends with the retry hint. `CLASS_FILL_FAILED_LINE` already had one. CLASS_FILL_ERROR is not an input-locking step, so the player can act on the hint. |

## Info

### IN-C01: The cap exemption also covers the fills the player starts directly, which the stated rationale does not

**File:** `spacetimedb/src/helpers/llm_queue.ts:147-163`; callers `spacetimedb/src/helpers/world_gen.ts:670-705` (`retryWorldFill`, from `[explore]` at `spacetimedb/src/reducers/intent.ts:1429`) and `spacetimedb/src/helpers/creation_generation.ts:204-208` (`retryClassFill`, from any input at `spacetimedb/src/reducers/creation.ts:553-560`)
**Issue:** The doc comment says the two fills "continue a request the cap already admitted at stage 1". That is true for the enqueue inside the stage-1 apply. But the exemption is per route, so it also covers the player's own retries: `[explore]` on a FILL_ERROR region, and any input at CLASS_FILL_ERROR. The cap never admitted those as requests.

The impact is limited:
- per-state dedupe allows one fill per state;
- the daily budget, the ceiling and the kill switch still apply;
- the stage-1 path already lets a player hold 3 capped jobs plus a fill.

A player who walks between several FILL_ERROR regions can still hold one uncapped world fill per region at once, and with `LLM_MAX_IN_FLIGHT = 4` that can fill the global in-flight slots.
**Fix:** Either fix the comment so it says that retries are exempt too, or narrow the exemption to the continuation. For example, add `capExempt?: boolean` to `EnqueueArgs`, set it only from the stage-1 apply (`llm_apply.ts` world_gen_start and creation_class_reveal success paths), and leave both fill routes out of `LLM_CAP_EXEMPT_ROUTES`. That was the review's second option (exclude the job being applied).

### IN-C02: A budget refusal at CLASS_FILL_ERROR now gives two conflicting instructions and repeats on every input

**File:** `spacetimedb/src/helpers/creation_generation.ts:191-192`, `spacetimedb/src/helpers/llm_queue.ts:175-181` (`LLM_REFUSAL_MESSAGES.daily_cost` / `daily_calls`)
**Issue:** For `daily_cost` or `daily_calls`, the line becomes "The Keeper grows weary of your demands. Return tomorrow. Say anything when you want him to try the rest again." The first sentence says to wait for tomorrow and the second says to type anything now. Each input re-runs `retryClassFill`, gets refused again, and posts the same two-sentence line again.

Separately, `busy` can no longer reach this path because `creation_class` is now cap-exempt, so that refusal case is dead here.
**Fix:** Use the hint only for refusals that can clear soon (`halted`, `ceiling`). For the daily refusals, use a variant such as "...Return tomorrow, and say anything then for him to try the rest again."

### IN-C03: Doc comments still list the per-player cap as a reason a fill can be refused

**File:** `spacetimedb/src/helpers/world_gen.ts:590-592` ("A refused enqueue (kill switch, ceiling, budget, cap)"), `spacetimedb/src/helpers/creation_generation.ts:163-164` ("A refused enqueue (budget, cap, kill switch, ceiling)")
**Issue:** Since WR-B01, neither `world_gen` nor `creation_class` is ever refused by the cap. The comments are now wrong for both fill starters.
**Fix:** Remove "cap" from both lists, or say "(kill switch, ceiling, daily budget; never the per-player cap)".

### IN-A01: `/llm on|off|ceiling` leaves no module-log audit line (carried forward)

**File:** `spacetimedb/src/helpers/llm_admin_commands.ts:103-124`
**Issue:** The `llm_set_enabled` and `llm_set_daily_ceiling` reducers `console.log` the change. The slash-command path writes only a private event to the admin's console, so a kill-switch flip or ceiling change made through `/llm` cannot be found in `spacetime logs`. The file still has no `console.log`.
**Fix:** Add `console.log(enabled ? 'llm calls on' : 'llm calls off')` and `console.log('llm daily ceiling set, micro_usd=' + micro)`.

### IN-A02: Runbook still documents the retired phase cap (carried forward)

**File:** `docs/runbooks/llm-key.md:88`
**Issue:** This row still says "The Keeper has fallen silent for now" and tells the admin to check `phaseCapMicroUsd`. Neither exists after Phase 43.
**Fix:** Rewrite the row to cover the resting line, `/llm stats`, `/llm on` and `/llm ceiling`.

### IN-A03: Ceiling default duplicated as a literal in the schema (carried forward)

**File:** `spacetimedb/src/schema/tables.ts:2210`
**Issue:** `dailyCeilingMicroUsd: t.u64().default(10_000_000n)` repeats `LLM_DAILY_CEILING_DEFAULT_MICRO_USD` as a literal. Changing the constant would leave migrated rows on the old default, while `llmGate`'s `??` fallback would use the new one.
**Fix:** Import the constant into `tables.ts`, or pin the two together with a test.

### IN-A04: `/llm stats` "Today ... reserved" is all reservations, not today's (carried forward)

**File:** `spacetimedb/src/helpers/llm_stats.ts:154`
**Issue:** The line reads as if both figures are for today, but `Y` is `ledger.reservedMicroUsd`, which covers reservations from any day.
**Fix:** Reword to "... spent today and $Y currently reserved".

### IN-A05: Claim-time halted/ceiling refunds the player's call even after earlier billed attempts (carried forward)

**File:** `spacetimedb/src/helpers/llm_executor.ts:229-245`
**Issue:** `failAtClaim('halted' | 'ceiling')` uses `refundCall: true`. A retry job whose earlier attempt had unknown billing therefore gives the player the daily call back. This matches `auth` and `bad_request`, so it is a policy point.
**Fix:** Optionally pass `refundCall: job.attempt === 0n` for the two Phase 43 stop codes.

### IN-B01: An oversized stage-2 request throws inside the stage-1 apply and discards a good stage 1 (carried forward, wider reach)

**File:** `spacetimedb/src/helpers/world_gen.ts:595-612`, `spacetimedb/src/helpers/creation_generation.ts:176-192`
**Issue:** `startWorldFill` and `startClassFill` wrap the input builder in `try`, but not `enqueueLlmJob`. `enqueueLlmJob` throws whenever the request exceeds `LLM_REQUEST_JSON_MAX_CHARS`, and for a given input that always happens. Inside the stage-1 apply, the throw rolls back the apply until it ends as `apply_error`.

Since WR-B02, the same throw has a second effect. `[explore]` from a reused starter region calls `retryWorldFill` from the intent reducer, so the whole reducer throws every time. The player who was told to "Type [explore]" then gets a reducer error instead of an in-voice line. It is unlikely, because starter fill inputs are small, but the failure would be permanent for that region.
**Fix:** Catch the throw around `enqueueLlmJob` in both helpers and route it to `failWorldFill` / `toError(CLASS_FILL_FAILED_LINE)`. Better, truncate the free-text fields of the stage-2 input.

### IN-B02: The rotation starts mid-pool, contrary to the documented "fresh indicator looks as it did before" (carried forward)

**File:** `src/composables/useLlmStatus.ts:158-170`, `spacetimedb/src/data/llm_indicator_lines.ts:95`
**Issue:** `tick` is a single counter that never resets. A job that becomes active at tick 7 opens on `pool[7 % 3]`, not on `pool[0]`.
**Fix:** Reset the rotation when the winning row's id changes (per-row start tick), or correct the comment.

### IN-B03: NPC placement uses exact-case names while location dedupe is case-insensitive (carried forward)

**File:** `spacetimedb/src/helpers/world_gen.ts:871`
**Issue:** An NPC whose `locationName` differs only in case, or that names a location skipped as a duplicate, silently lands at the start location.
**Fix:** `const npcLocation = byExactName.get(npc.locationName) ?? byLowerName.get(lower(npc.locationName)) ?? startLocation;`

### IN-B04: A class can reach CLASS_REVEALED with two abilities while the copy says three (carried forward)

**File:** `spacetimedb/src/helpers/llm_apply.ts:413`, `spacetimedb/src/reducers/creation.ts:597`
**Issue:** `applyClassFillResult` rejects only `cls.abilities.length < 2`, but the ability prompt still says "I presented three abilities".
**Fix:** Either require `>= 3` (fail into CLASS_FILL_ERROR, which is retryable), or build the line from `abilities.length`.

### IN-B05: In-flight pre-split jobs are released by the sweeper while still running (carried forward)

**File:** `spacetimedb/src/helpers/llm_sweeper.ts:280-305`
**Issue:** A `world_gen` or `creation_class` job queued before the split holds GENERATING / GENERATING_CLASS. The holder sets now credit those routes only to FILLING / CLASS_FILLING. This is a one-time transition effect and is not documented.
**Fix:** Note it in the deploy checklist, or clear active `llm_job` rows when publishing this phase.

### IN-B06: Stale or unreachable leftovers in the touched code (carried forward)

**File:** `spacetimedb/src/helpers/world_gen.ts:224`, `spacetimedb/src/reducers/creation.ts:27-30`
**Issue:**
- The `StarterRetryOutcome` doc still says "its world_gen job enqueued". It is now a `world_gen_start` job.
- `determineGoBackTarget` still maps `GENERATING_CLASS`, which go-back gates off at line 467, so the branch is dead.
- The CLASS_FILL_ERROR mapping (line 27) sits outside the `switch`.

**Fix:** Update the comment, drop the dead case, and move the CLASS_FILL_ERROR mapping into the `switch`.

---

_Reviewed: 2026-10-01T10:26:43Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
