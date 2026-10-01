---
phase: 43-latency-tuning-staged-generation-and-budget
verified: 2026-10-01T10:45:00Z
status: human_needed
score: 5/5 roadmap success criteria verified (code, tests and committed measurement record); 0 gaps; live-play and live-admin checks outstanding
behavior_unverified: 0
overrides_applied: 0
re_verification: false
gaps: []
deferred: []
behavior_unverified_items: []
unverified_prohibitions:
  - statement: "(43-01) MUST NOT add a column without a default, drop a column or change a column type on llm_spend or llm_admin_state"
    tier: judgment
    llm_judge_verdict: "NON-AUTHORITATIVE: upheld. git diff of schema/tables.ts since 43-01 shows only added columns (all with .default) and comment edits; no removals or type changes. Local publish round trip kept key_set true / key_length 108."
    flag: "unverified-prohibition: human review recommended"
  - statement: "(43-12) MUST NOT make any paid call before explicit user approval; MUST NOT pass $5 total"
    tier: judgment
    llm_judge_verdict: "NON-AUTHORITATIVE: upheld on the evidence available. 43-12-SUMMARY records an approve answer before the run; record shows 108 calls, 922,050 micro-USD ($0.9221). The approval itself cannot be re-observed from the code."
    flag: "unverified-prohibition: human review recommended"
  - statement: "(43-12) MUST NOT print, log or commit key, prompts or completions"
    tier: judgment
    llm_judge_verdict: "NON-AUTHORITATIVE: upheld. llm_measurements.json holds only ok, stopReason, latencyMs, token counts, schemaOk, toneFailures; no sk-ant string; guarded by a hygiene unit test. I did not open any secret file."
    flag: "unverified-prohibition: human review recommended"
  - statement: "(43-12, 43-15) MUST NOT call or query maincloud or push to any git remote"
    tier: judgment
    llm_judge_verdict: "NON-AUTHORITATIVE: upheld on the evidence available. Checklist and summaries state local-only. Only a history search was possible, not a network audit."
    flag: "unverified-prohibition: human review recommended"
  - statement: "(43-15) MUST NOT wipe or risk local data or key (no --clear-database, -y, --delete-data)"
    tier: judgment
    llm_judge_verdict: "NON-AUTHORITATIVE: upheld. I re-read the local admin_llm_status: key_set true, key_length 108 (matches the length recorded before and after the publish), llm_enabled true, ceiling 10000000."
    flag: "unverified-prohibition: human review recommended"
  - statement: "(43-15) MUST NOT read, print, log or commit the Anthropic key, llm_config, CLI token, .env.local or .dev.vars"
    tier: judgment
    llm_judge_verdict: "NON-AUTHORITATIVE: upheld on the evidence available (no key material in the committed record, bindings or checklist). Cannot be proven from the repo alone."
    flag: "unverified-prohibition: human review recommended"
human_verification:
  - test: "Staged region entry in a live browser session"
    expected: "Trigger a new region (new character, or travel to an uncharted edge). The start location and first NPC are enterable and talk-able while the fill job is still pending; the milestone line 'The Keeper clears his throat...' appears; the rest of the region fills in later and a 'settles into place' line appears. While FILLING, travel/look/talk work."
    why_human: "Needs a running client, a real Anthropic call and a human watching timing; unit tests drive the server transitions but not the browser."
  - test: "Staged class reveal in a live browser session"
    expected: "Choosing an archetype shows class name, description and the first ability early with the milestone line; typing during CLASS_FILLING gets the patience line; the ability choice appears only after stage 2 lands."
    why_human: "Same reason; confirmation gating is covered by tests, felt latency is not."
  - test: "Rotating Keeper lines render and change about every 5 s"
    expected: "The existing Keeper indicator under the console changes line roughly every 5 s while a job is active, starting on the Phase 42 line."
    why_human: "Visual. The ticker and selection logic are unit tested with fake timers; the on-screen render is not."
  - test: "Admin /llm stats, /llm off, /llm on, /llm ceiling in the real client console"
    expected: "Each answers with one plain system message (multi-line stats block, no links). With calls off, any LLM action gives exactly one 'The Keeper is resting. Return later.' and no Anthropic call. A non-admin gets 'The Keeper does not discuss his accounts with you.' Leave calls on and ceiling at $10.00."
    why_human: "Needs an admin identity in a running client; the reducer path is covered by captured-reducer tests."
  - test: "Money-logic review of WR-A01 (late-reply swap across UTC midnight)"
    expected: "A reviewer confirms the day-counter take-back rule (subtract only when the stand-in was booked today; unknown day keeps the safe over-count)."
    why_human: "Flagged by the review-fix pass as requiring human verification (money logic). Unit and end-to-end tests pass."
  - test: "Review the new no-retry max_tokens values (WR-A04) and the cap exemption for the two fill routes (WR-B01)"
    expected: "Accept or adjust: world_gen keeps only 572 tokens of headroom over its p99; world_gen and creation_class are exempt from the per-player active-job cap (also covers the player's own retries, review IN-C01)."
    why_human: "Policy and judgment calls recorded in 43-REVIEW-FIX.md."
  - test: "Maincloud publish and verification (user only, deferred to milestone end)"
    expected: "Per 43-USER-CHECKLIST.md section 4: no clear; key_set true with unchanged key_length; llm_enabled true; ceiling 10000000."
    why_human: "Maincloud is never touched by Claude."
---

# Phase 43: Latency Tuning, Staged Generation and Budget Verification Report

**Phase Goal:** Generation feels fast and stays affordable: every route is tuned from measured data, caching is proven, the player enters new regions and sees new classes before full generation finishes, and total spend has a hard ceiling with a kill switch.
**Verified:** 2026-10-01
**Status:** human_needed
**Re-verification:** No, initial verification

## Verdict

The goal is achieved in the codebase. All five roadmap success criteria hold against code I read, a committed measurement record I recomputed independently, the full root test suite I re-ran, and read-only checks of the local module. No gap and no blocker was found. The status is `human_needed` only because the phase contains items that by design cannot be checked without a live browser, an admin session or the user's maincloud account (listed above), plus six judgment-tier prohibitions that the rules require me to flag rather than pass silently.

## Goal Achievement

### Observable Truths (roadmap contract)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Admin can run `/llm stats` and see calls, cost, p50/p95 latency, errors by route | VERIFIED | `helpers/llm_admin_commands.ts` `handleLlmAdminCommand` is called from `submit_command` (`reducers/commands.ts:296`) before the generic command insert. The client sends any input starting with `/` to `submitCommand` (`App.vue:1187`), which falls through to the `submitCommand` reducer (`useCommands.ts:422`). `buildLlmStatsText` scans `llm_call_log` once and `aggregateLlmStats`/`summarizeRoute` give calls, cost, p50/p95 (nearest-rank `percentile`, ok calls only), errors, truncated, for 24 h and all time. Admin gate is `ADMIN_IDENTITIES` on `ctx.sender`; non-admin gets the in-voice refusal through `fail()`. Output strips `[ ] < >`. Tests: `llm_stats.test.ts`, `llm_admin_commands.test.ts`, `llm_commands.test.ts` (all in the 3148 passing). |
| 2 | Each route's effort and `max_tokens` come from an effort sweep and measured p99 (traceable), and caching is verified on every route's stable prefix (`cache_read_input_tokens > 0` on a repeat call) | VERIFIED | `data/llm_measurements.json` status `applied`, 108 calls, 922,050 micro-USD, 9 routes x 2 efforts x 5 samples plus 2 Run B calls each. I recomputed p99 (nearest rank, pooled where means are within 15%) and max_tokens (x1.25 to 256, plus the 512-token no-retry floor for `LLM_NO_AUTO_RETRY_ROUTES`) from the raw samples and got exactly the `LLM_TUNING` literals (1024/1024/1024/1536/2560/1024/512/768/1024). `llm_routes.ts` reads every route's effort/maxTokens/timeout from `LLM_TUNING[name]`. `llm_tuning.test.ts` pins `LLM_TUNING == deriveRouteTuning(record)`. Caching: call 2 `cacheReadTokens` > 0 on all 9 routes (3631 to 6038), `pass: true`, none "not cacheable". Effort `low` on all 9 (8 ties resolved to the lower effort as documented, renown_perk_gen a decisive win). |
| 3 | A new region is enterable, with start location and first NPC, before the rest finishes; in-voice Keeper progress lines show meanwhile | VERIFIED (code and tests); live feel is a human item | Every trigger enqueues `world_gen_start` (`world_gen.ts:188`). `applyWorldStartResult` writes region, safe start location (bindStone, crafting) and first NPC (gender through `resolveNpcGender`) in one transaction, connects the source edge, places a starter character, posts `WORLD_START_MILESTONE_LINE`, then calls `startWorldFill` which enqueues `world_gen` and sets FILLING in the same transaction. Stage 2 (`applyWorldFillResult`/`writeRegionFill`) never renames stage-1 content, sets COMPLETE; failure goes to FILL_ERROR with vendor/banker kept; only the player's `[explore]` re-enqueues (`intent.ts:1429`, `retryWorldFill`); sweeper releases a stranded FILLING lock after 60 s. Input never locks in FILLING/FILL_ERROR (`LLM_INPUT_LOCKING_WORLD_GEN_STEPS` = PENDING, GENERATING, consumed by `useWorldGeneration.ts`). Progress lines: `LLM_INDICATOR_POOLS` + `LLM_PROGRESS_ROTATE_MS = 5000` in server data; `useLlmStatus` rotates with a 5 s interval, wired in `App.vue:743`; no component or CSS file changed (git diff shows only composables and tests). Named tests run and pass: "stage 1 then stage 2 on one context: stage 1 is playable before stage 2". |
| 4 | Class identity and first ability appear before the full class finishes, with progress lines; parallel archetypes only if the measured reveal is still over about 10 s | VERIFIED | `startCreationGeneration` enqueues `creation_class_reveal`; `applyClassRevealResult` stores name, description and exactly one ability, posts the milestone line, enqueues `creation_class` and moves to CLASS_FILLING in one transaction. `applyClassFillResult` moves to CLASS_REVEALED only after the merge (confirmation waits for stage 2; `creation.ts:546` answers input in CLASS_FILLING with the patience line, go-back blocked). Failure becomes CLASS_FILL_ERROR keeping the reveal; any input retries the fill only (`retryClassFill`). Sweeper covers both locks. LAT-06: record `classReveal` p50 4665 ms, p95 7113 ms (dispatch allowance included), threshold 10000, verdict `leave_out`, `parallelBuilt: false`; I confirmed the p50 from the 7 recorded latencies; no parallel code exists (grep of routes/apply finds none), and a test pins `parallelBuilt` false unless the verdict is `build`. |
| 5 | Admin kill switch halts all LLM calls with an in-voice message; a global daily ceiling halts calls automatically | VERIFIED | Gate is `llmGate()` (missing row fails closed). Enqueue: `enqueueLlmJob` checks halted before the busy cap; `reserveLlmBudget` order is halted, daily_calls, daily_cost, ceiling; boundary tests at ceiling-1, ceiling, ceiling+1 exist and pass. Claim: `claimLlmJob` re-checks the kill switch and `globalCeilingClaimHeld > ceiling` before the in-flight cap, ending the job `failed` with `halted`/`ceiling` through `failAtClaim` (single refund of reservation and call, lock released, resting line once via `applyLlmFailure`). In-flight jobs finish (test "in-flight finishes" passes). Day counter rolls lazily at UTC midnight (`rolledDay`). Controls: `llm_set_enabled`, `llm_set_daily_ceiling` (admin-only, $0.01 to $1,000.00) and `/llm on|off|ceiling`. `LLM_RESTING_LINE` = "The Keeper is resting. Return later." (no digit, no amount, both refusals share it). $2 phase cap fully retired (only negative tests mention it). |

**Score:** 5/5 roadmap truths verified. Plan-level truths (15 plans) were each spot-checked against code; none failed.

### Plan truths and edge probe coverage

| Item | Status | Evidence |
|------|--------|----------|
| 6 resolved edges (LAT-01 tie, empty, ordering; COST-03 adjacency, empty, ordering) | VERIFIED | `chooseEffort` ties pick `low` and flag `tie`; `deriveRouteTuning` keeps baseline with `insufficient_data` under 5 samples, any Run A/B truncation; `percentile` nearest rank on sorted copy; `LLM_SWEEP_ROUTES`/`LLM_SWEEP_EFFORTS` fixed order; ceiling boundary tests (budget and executor); no spend today counts 0 (`ledgerDaySpent`); missing admin row fails closed (test at `llm_budget.test.ts:336`); claim-order admission and refund-once ("refund once" executor test, run and passing). |
| 6 flagged assumptions (LAT-02, LAT-03, LAT-04, LAT-05, LAT-06, OPS-02) | VERIFIED, each backed by code | LAT-02: `cacheVerdict` records `notCacheable` separately (all 9 passed). LAT-03: FILL_ERROR keeps stage 1, lock released, no dead end (WR-B02 fix adds `regionFillHint` / `nowhereToGoLine`). LAT-04: CLASS_FILL_ERROR keeps reveal, retry by input, go-back to archetype stays. LAT-05: pools in `spacetimedb/src/data/llm_indicator_lines.ts`, voice tests guard them. LAT-06: decision recorded once with its number. OPS-02: admin-only, reads `llm_call_log` only, zeros for empty route, same `percentile` helper. |

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `helpers/llm_admin_state.ts` (`llmGate`, `setLlmEnabled`, `setDailyCeiling`, `dailyCeilingProblem`) | VERIFIED | Substantive, imported by queue, budget, executor, reducers, commands. |
| `helpers/llm_budget.ts` (`globalDayHeld`, `globalCeilingClaimHeld`, lazy day roll, `subtractLedgerSpend` with charged-day) | VERIFIED | Read in full. |
| `helpers/llm_queue.ts` (`LLM_RESTING_LINE`, pre-busy halted gate) | VERIFIED | |
| `helpers/llm_stats.ts`, `helpers/llm_admin_commands.ts` | VERIFIED | Wired into `commands.ts`. |
| `helpers/world_gen.ts`, `helpers/creation_generation.ts`, `helpers/llm_apply.ts` staged paths | VERIFIED | Wired through the apply router (`llm_apply.ts:1077-1084`). |
| `helpers/llm_sweeper.ts` stage locks | VERIFIED | `GENERATING_CLASS`, `CLASS_FILLING`, `FILLING`, `world_gen_start` holders present. |
| `data/llm_tuning.ts`, `data/llm_measurements.json`, `data/llm_routes.ts` | VERIFIED | Route table reads `LLM_TUNING`. |
| `data/llm_indicator_lines.ts`, `src/composables/useLlmStatus.ts`, `useWorldGeneration.ts`, `useCharacterCreation.ts` | VERIFIED | Server data is the source for copy and lock-step lists. |
| `schema/tables.ts` additive columns | VERIFIED | Four plan columns plus `llm_job.ledgerChargedDayUtc`, all `.default(...)`; no removals or type changes. |
| `views/llm.ts` `admin_llm_status` new fields | VERIFIED | Admin-gated, `[]` for non-admins, no `llm_config` read; live local view returns `llm_enabled true, daily_ceiling_micro_usd 10000000`. |
| Regenerated client bindings and `src/llmAdminBindings.test.ts` | VERIFIED | Test passes in the suite; local `describe` shows `llm_set_enabled`, `llm_set_daily_ceiling` and the new columns published. |
| `43-USER-CHECKLIST.md` | VERIFIED | Present, covers live checks and maincloud steps. |

### Key Link Verification

| From | To | Status |
|------|----|--------|
| `llm_queue.enqueueLlmJob` -> `llmGate` | WIRED (`llm_queue.ts:235`) | |
| `llm_budget.reserveLlmBudget` -> `llmGate` | WIRED (`llm_budget.ts:171`) | |
| `index.ts` init -> `ensureLlmAdminState` | WIRED (`index.ts:578`) | |
| `claimLlmJob` -> `globalCeilingClaimHeld` / `llmGate` | WIRED (`llm_executor.ts:243-245`) | |
| `applyLlmFailure` -> `isRestingErrorCode` | WIRED | |
| `commands.ts` -> `handleLlmAdminCommand` | WIRED (`commands.ts:296`) | |
| `applyWorldStartResult` -> `startWorldFill`; `applyClassRevealResult` -> `startClassFill` | WIRED, same transaction | |
| `intent.ts` explore -> `retryWorldFill`; `creation.ts` CLASS_FILL_ERROR -> `retryClassFill` | WIRED | |
| `llm_routes.ts` -> `LLM_TUNING[...]` | WIRED | |
| `useLlmStatus` -> `LLM_INDICATOR_POOLS`/`LLM_PROGRESS_ROTATE_MS`; `App.vue` -> `useLlmStatus` | WIRED (`App.vue:743`) | |
| Client `/llm` input -> `submit_command` reducer | WIRED (`App.vue:1187` -> `useCommands.ts:422`) | |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| `/llm stats` text | route rows | `ctx.db.llm_call_log.iter()` written by `logLlmCall` for every attempt | Yes | FLOWING |
| Region stage 2 input | stage-1 facts | Read back from stored region/location/npc rows (`buildWorldFillInput`) | Yes | FLOWING |
| Class stage 2 input | stage-1 reveal | Read back from `character_creation_state.abilities` | Yes | FLOWING |
| Indicator lines | pools | Server data, selected per active `my_llm_jobs` row | Yes | FLOWING |
| Ceiling | `daySpentMicroUsd` + reserved | `addLedgerSpend` / `reserveLlmBudget` | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full root suite | `CI=true pnpm exec vitest run --maxWorkers=1` | 69 files, 3148 tests passed (101 s) | PASS |
| Claim-time refund once and in-flight finishes | `vitest run llm_executor.test.ts -t "refund once\|in-flight finishes"` | 3 passed | PASS |
| Stage 1 playable before stage 2 | `vitest run llm_apply.test.ts -t "stage 1 then stage 2 on one context"` | 1 passed | PASS |
| Tuned values trace to the record | Independent node recomputation of p99 and max_tokens for all 9 routes from raw samples | Matches `LLM_TUNING` for every route | PASS |
| Record hygiene | Search of `llm_measurements.json` for `sk-ant`; list of per-sample keys | None; only counts, timings, stop reasons, flags | PASS |
| Local module state (read-only) | `spacetime sql --server local uwr "SELECT key_set, key_length, llm_enabled, daily_ceiling_micro_usd, ... FROM admin_llm_status"` | true, 108, true, 10000000 | PASS |
| Local module carries Phase 43 | `spacetime describe --server local uwr --json` contains `llm_set_enabled`, `llm_set_daily_ceiling`, `ledger_charged_day_utc`, `daily_ceiling_micro_usd` | all present | PASS |

Behavior-dependent truths (claim-time halted/ceiling refund once, in-flight finishes, midnight roll, stale late-reply swap, stage-1-before-stage-2, CLASS_FILLING gating, sweeper stranded locks) each have a named passing test exercising the transition, so none is left PRESENT_BEHAVIOR_UNVERIFIED.

### Probe Execution

No phase-declared `probe-*.sh` scripts exist (the phase uses vitest and the dry sweep harness). The paid harness was not run (constraint). SKIPPED.

### Requirements Coverage

All eight phase IDs appear in plan frontmatter and in REQUIREMENTS.md; no orphans (the `Pending` markers in REQUIREMENTS.md are untouched on purpose: `mark-complete` was not run).

| Requirement | Source plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| LAT-01 | 43-10, 43-12, 43-14 | Effort and `max_tokens` tuned from measured data | SATISFIED | Truth 2: record `applied`, values re-derived independently. |
| LAT-02 | 43-10, 43-12, 43-14 | Caching verified per route | SATISFIED | Truth 2: all 9 routes `pass: true`, call 2 read 3631 to 6038 cached tokens. |
| LAT-03 | 43-04, 43-05, 43-08, 43-09, 43-11, 43-15 | Staged world generation | SATISFIED (live feel: human) | Truth 3. |
| LAT-04 | 43-04, 43-05, 43-09, 43-13, 43-15 | Staged class reveal | SATISFIED (live feel: human) | Truth 4. |
| LAT-05 | 43-08, 43-09, 43-13, 43-15 | In-voice Keeper progress lines | SATISFIED (visual: human) | Pools in server data, 5 s rotation, milestone lines. |
| LAT-06 | 43-10, 43-12, 43-14 | Parallel archetypes only if reveal over about 10 s | SATISFIED (decision recorded: leave_out at p50 4665 ms) | Record and `lat06Decision`; no parallel code built. |
| COST-03 | 43-01, 43-03, 43-06, 43-07, 43-15 | Global daily ceiling and kill switch | SATISFIED | Truth 5. |
| OPS-02 | 43-02, 43-07, 43-15 | `/llm stats` | SATISFIED | Truth 1. |

### Anti-Patterns Found

I scanned the added lines of every non-test source file changed since 43-01 (`git diff 4be58b2f^..HEAD`) for TBD/FIXME/XXX/TODO/HACK and placeholder wording. Result: none; the single "placeholder" hit is a normal comment about the `'Unknown'` race placeholder. No stubs, empty handlers or hardcoded-empty props were found in the staged paths.

| Severity | Item |
|----------|------|
| Info | 14 remaining code-review Info items (IN-A01 to IN-A05, IN-B01 to IN-B06, IN-C01 to IN-C03) are still open and I agree none blocks the goal. Worth a quick-task pass: IN-A02 (runbook `docs/runbooks/llm-key.md:88` still documents the retired phase cap), IN-A01 (no module-log audit line for `/llm on\|off\|ceiling`), IN-B01 (an oversized stage-2 request throws inside the stage-1 apply), IN-C02 (two-sentence refusal at CLASS_FILL_ERROR for daily limits). |
| Info | `deferred-items.md` item 1 (`time` command panic, missing `getWorldState` import) is already fixed by commit `d094d5c0` (the import is on `intent.ts:16`); the deferred-items file is stale on this. |
| Info | Retryable routes (`skill_gen`, `renown_perk_gen`, `npc_conversation`) keep plain x1.25 headroom (1024/1024/512) because the WR-A04 floor covers only no-retry routes. `npc_conversation` at 512 against p99 379 from 10 samples is the tightest; watch the `truncated` column in `/llm stats` after rollout. |
| Info | LAT-06 measures the stage-1 reveal call plus the 300 ms dispatch allowance. Stage-1 plus stage-2 p50 sums to roughly 9 to 10 s, close to the threshold, but the spec's rule is about the reveal after staging, so `leave_out` is the correct reading. |
| Info | The sweep used 5 samples per cell (10 pooled; 5 for combat_narration), so every p99 is a sample maximum. The phase documents this and compensates with headroom; it is an accepted limitation of the measurement design, not a defect. |

### Human Verification Required

See the `human_verification` list in the frontmatter (7 items). Each uses the existing checklist at `.planning/phases/43-latency-tuning-staged-generation-and-budget/43-USER-CHECKLIST.md`. Items 1 to 4 are live-play and admin checks the orchestrator said are not done in a browser; items 5 and 6 are the review-fix pass's own "requires human verification" flags; item 7 is the user-run maincloud publish.

### Gaps Summary

None. Every must-have truth, key link and requirement resolved to VERIFIED. The phase is complete pending the human checks above.

---

_Verified: 2026-10-01_
_Verifier: Claude (gsd-verifier)_
