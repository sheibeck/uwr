---
phase: 43-latency-tuning-staged-generation-and-budget
part: A
reviewed: 2026-10-01T00:00:00Z
depth: standard
files_reviewed: 40
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
findings:
  critical: 0
  warning: 6
  info: 5
  total: 11
status: issues_found
---

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
