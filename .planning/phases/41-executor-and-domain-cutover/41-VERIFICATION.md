---
phase: 41-executor-and-domain-cutover
verified: 2026-09-30T21:00:00Z
status: human_needed
score: 6/7 roadmap success criteria verified at code level; criterion 6 (maincloud proof) deferred by the user; live halves of criteria 1, 2, 3 and 5 deferred by the user
behavior_unverified: 0
overrides_applied: 0
gaps: []
deferred: []
human_verification:
  - test: "Local smoke test with the real key (SC1, OPS-01): spacetime call uwr llm_smoke_test --server local, wait about a minute, then SELECT * FROM llm_admin_state (never llm_config)"
    expected: "Six ok entries in lastSmokeJson (smoke_test, creation_race, creation_class, world_gen, skill_gen, renown_perk_gen); smoke_test carries a real Claude reply; keyValid true and keyVerifiedAt set; llm_spend stays under 2,000,000 micro-USD"
    why_human: "Needs a live Claude call. The user set the key locally (keySet true, length 108, keyValid false/unverified) and then chose to skip the live proof ('we can skip the live proof for now'). Code path and offline tests exist (llm_executor, llm_admin, llm_admin_state)."
  - test: "One real action per domain locally (SC2, SC3, PIPE-01, PIPE-02): creation race, creation class, world gen (close the tab mid-generation and return), NPC chat, a fight to victory or defeat (narration), a level-up (skill offer) and a renown perk; or run pnpm exec vitest run --config scripts/llm/vitest.live.config.ts with PROVE_LIVE_DRY unset"
    expected: "Each result is applied on return with no duplicate; llm_call_log rows show four usage counts per route; Keeper replies use he for the Keeper, he/she for NPCs, you for the player (Plan 41-18 pronoun check on real replies)"
    why_human: "Real Claude replies, tab-close survival and reply-quality/pronoun behavior can only be observed live. Deferred by the user (41-LOCAL-PROOF.md)."
  - test: "Browser network tab while playing, creating a character, exploring, chatting with an NPC, fighting and levelling up (SC2)"
    expected: "No request to api.anthropic.com or to any llm-proxy URL (localhost:8787); after pnpm build, grep -rc api.anthropic.com dist/ prints nothing"
    why_human: "Network-tab observation is a browser check. Code-level evidence: the only client fetch to a proxy is useLlmProxy.ts, which fires only for pending llm_task rows, and no server code inserts llm_task rows any more."
  - test: "Combat tick and reducer responsiveness with calls in flight (SC5, PIPE-06)"
    expected: "Combat ticks and reducers stay responsive while up to 4 calls run; a narration that arrives more than 20 s after enqueue is dropped; two racing llm_run invocations never exceed the cap"
    why_human: "Real scheduler concurrency and latency cannot be exercised by the mock procedure context. The cap is read and the claim written inside one transaction (llm_executor.ts claimLlmJob), and Phase 39 measured 4 in flight locally and 8 on maincloud with no tick impact."
  - test: "Maincloud proof (SC6): run 41-MAINCLOUD-CHECKLIST.md yourself (publish, set key with --target maincloud --confirm-maincloud, smoke test, one action per domain), then paste results back for the Phase 39 gate re-check"
    expected: "Smoke test ok on maincloud; one real action per domain succeeds; dispatch p95, reliability (0 failures) and region schema meet the Phase 39 gate; a failure reopens the executor decision"
    why_human: "Claude never publishes to or calls maincloud. The user chose 'Write checklist, defer run' (41-MAINCLOUD-PROOF.md). The checklist is written; no maincloud data exists, so there is no gate verdict yet."
---

# Phase 41: Executor and Domain Cutover Verification Report

**Phase Goal:** Every LLM-driven action (creation, world gen, skills, NPC chat, combat narration, renown) runs server-side end to end against real Claude on the executor Phase 39 chose, results are applied by SpacetimeDB and survive tab close, and failures degrade gracefully, with the browser out of the LLM path.
**Verified:** 2026-09-30
**Status:** human_needed
**Re-verification:** No, initial verification

## Summary

The code is in place, wired and covered by offline tests for every roadmap criterion. No code gap was found. What remains is live proof that the user explicitly deferred: the local live run with real Claude, the browser network-tab check, and the maincloud proof with the Phase 39 gate re-check. Those are listed as human verification, not as failures. Two warnings and one deferred-by-design item are noted below.

Evidence that was run by the verifier (single worker, no live calls, no maincloud, llm_config never read):

- `vitest run` on llm_executor, llm_sweeper, llm_budget, llm_retry, llm_schedule, llm_admin_state, llm_admin, llm_cutover: 8 files, 338 of 338 pass.
- `vitest run` on npc_gender, pronoun_rules, llm_privacy, llm_queue, combat_narration, skill_offer, renown_llm, world_gen, model_literals: 9 files, 244 of 244 pass.
- `pnpm exec vitest run scripts/llm/cli.test.mjs scripts/llm/proof_rules.test.mjs`: 50 of 50 pass.
- `node scripts/llm/set-key.mjs --dry-run` prints only `ANTHROPIC_API_KEY: present (format ok, len 108)`.
- The caller reports the full regression gate: server 2161 of 2161 (52 files), client 2245 of 2245 (57 files), `pnpm build` green.
- The local SpacetimeDB server was not running at 127.0.0.1:3000, so no live SQL or `spacetime describe` was possible. Local tables were therefore checked from source and `src/module_bindings`, not from the running database.

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Admin can set the key, fire a live smoke test, see key status (set/valid) plus a real Claude reply; smoke warms schemas | VERIFIED in code; live reply DEFERRED (human) | `set_api_key` (reducers/llm.ts:26) stores the trimmed key in private `llm_config` and patches `llm_admin_state` with status only. `llm_smoke_test` (llm.ts:48) enqueues one `smoke_test` text job plus one minimal job per JSON schema (`LLM_SMOKE_ROUTES`, 6 routes) as phase-only jobs; the executor skips apply, records each route in `lastSmokeJson` and marks the key valid only when `smoke_test` succeeds on the still-current key (llm_executor.ts:446-466). `admin_llm_status` view (views/llm.ts) is admin-gated and never reads `llm_config`. `scripts/llm/set-key.mjs` and `docs/runbooks/llm-key.md` exist. Live reply: local key is set (length 108, keyValid false/unverified), smoke test not run (41-LOCAL-PROOF.md). |
| 2 | Each of the six actions is queued by its own reducer in the same transaction and executed by the chosen executor; browser shows no call to Anthropic or a proxy | VERIFIED in code; network tab DEFERRED (human) | `enqueueLlmJob` (helpers/llm_queue.ts:180) inserts the `llm_job`, reserves budget and inserts the `llm_dispatch` row in the caller's transaction. Call sites: creation (`creation_generation.ts:74`, from `submit_creation_input`), world gen (`world_gen.ts:173`), skills (`skill_offer.ts:105`, from `apply_level_up`/`choose_skill`/`request_skill_offer`), NPC chat (`reducers/npc_interaction.ts:100`), combat narration (`combat_narration.ts:138`, from `reducers/combat.ts:2147,2249`), renown (`renown.ts:173`). Executor: `llm_run` scheduled procedure (reducers/llm_executor.ts:22) bound with `onSchedule: LlmDispatch`, body `runLlmJob` calls `ctx.http.fetch(ANTHROPIC_MESSAGES_URL)` (llm_executor.ts:651). `prepare_creation_llm`, `prepare_world_gen_llm`, `prepare_skill_gen` are gone from the server, the client and the regenerated bindings (grep clean; absence asserted in llm_cutover.test.ts). No server code inserts `llm_task` rows (grep); the only client proxy `fetch` is in `useLlmProxy.ts:59`, which reacts to pending `llm_task` rows only, so it is idle. Observing the network tab is live-only. |
| 3 | A player who refreshes or closes the tab mid-generation finds the result applied on return, never duplicates | VERIFIED in code; live tab-close DEFERRED (human) | The apply runs server-side in the scheduled procedure (tx3, `applyStored`), keyed to the job's stored `playerId`, not to any client session. Duplicates: `enqueueLlmJob` merges on an active `by_dedupe_key` job; apply is guarded by `job.status === 'received'` and completes the job in the same transaction; an apply failure re-runs from stored text with no second billed call (`LLM_APPLY_MAX_ATTEMPTS` 2). Covered by llm_executor and llm_cutover tests. |
| 4 | Transient failures retry a bounded number of times; non-retryable fail fast; creation and world gen never auto-retry; failed/stuck jobs are swept, lock released, budget refunded, in-voice message | VERIFIED | `llm_retry.ts` (`shouldRetry`, `retryDelayMs`: 3 attempts, 2 s then 8 s or retry-after, cap 60 s, jitter); `LLM_NO_AUTO_RETRY_ROUTES` = creation_race, creation_class, world_gen, combat_narration, smoke_test. `persistAttempt` (llm_executor.ts:345) retries only retryable classes with attempts left, otherwise fails, refunds the reservation and call, and posts the failure message in the same transaction (`withFailureTx`). `llm_sweep` scheduled reducer (reducers/llm_executor.ts:33, every 30 s, reschedules itself first) runs `sweepLlmJobs`: in_flight past timeout+30 s expires, received past 60 s re-dispatches apply, pending past 10 min (24 h renown) expires, stranded creation/world-gen locks are released, each with refund and Keeper message. The sweep tick is seeded in `init`, in scheduling and in `enqueueLlmJob`. 338-test run above covers these. |
| 5 | With calls in flight, combat ticks and reducers stay responsive under the global cap; narration never blocks combat and is dropped if late | VERIFIED in code; live responsiveness DEFERRED (human) | `LLM_MAX_IN_FLIGHT = 4`; claim counts `in_flight` via the `by_status` index inside the claim transaction and defers with a jittered ~500 ms reschedule when full (llm_executor.ts:238-243). Narration runs only while in-flight is below 3, gets one attempt, and is dropped as `late` if more than 20 s old at claim or at persist (lines 210, 440). `enqueueCombatOutroNarration` swallows every error and skips silently on a refused budget, so combat is never changed. |
| 6 | Maincloud proof: live smoke plus one real action per domain; Phase 39 gate re-checked | DEFERRED (human, user decision) | `41-MAINCLOUD-CHECKLIST.md` written (99 lines, user-run commands only); `41-MAINCLOUD-PROOF.md` records status deferred and no gate verdict. Claude never publishes to or calls maincloud. The Phase 39 GO verdict stands until a measured failure reopens it. |
| 7 | Four usage counts per route; per-player daily budget cost-weighted with call backstop, reserved at enqueue and settled on result; key only in private llm_config, never in logs (redaction test); runbook written | VERIFIED | `llm_call_log` rows carry the four token counts, route, cost and `dispatchLateMs` (`logLlmCall`, every attempt logs once). `llm_budget.ts`: reserve at enqueue (daily_calls, daily_cost $1.00 and 200 calls, then phase cap), `settleLlmCost` on result, idempotent `releaseLlmReservation` on failure, all keyed to UTC day in `llm_player_budget`. `llm_config` is a non-public table and does not appear in `src/module_bindings`; the key reaches only `buildClaudeHeaders` and is a redaction needle on every classify, log and console path. Test `the key never leaves llm_config (SEC-04, T-41-01)` (llm_executor.test.ts:1693). Runbook `docs/runbooks/llm-key.md` covers setup, Console spend limit, rotation and `--clear-database` recovery. |

**Score:** 6/7 criteria verified at code level, criterion 6 deferred. Criteria 1, 2, 3 and 5 each also carry a live-only half that is listed under Human Verification Required.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `spacetimedb/src/helpers/llm_executor.ts` | claim / fetch / persist / apply executor | VERIFIED | 693 lines, substantive; wired by `reducers/llm_executor.ts` `llm_run` |
| `spacetimedb/src/reducers/llm_executor.ts` | `llm_run` procedure and `llm_sweep` reducer | VERIFIED | Both refuse non-module callers; bound with `onSchedule` |
| `spacetimedb/src/helpers/llm_sweeper.ts` | stuck-job sweeper | VERIFIED | Per-job try/catch, idempotent, money before message |
| `spacetimedb/src/helpers/llm_budget.ts` | reserve, settle, release, ledger, prune | VERIFIED | Wired into `enqueueLlmJob` and the executor |
| `spacetimedb/src/helpers/llm_retry.ts`, `llm_schedule.ts`, `llm_admin_state.ts`, `llm_inputs.ts` | retry math, dispatch rows, admin state, route input | VERIFIED | Imported by the executor and reducers |
| `spacetimedb/src/data/llm_limits.ts` | all limits as named constants | VERIFIED | Cap 4, narration cap 3, retry, sweeper, budget, smoke |
| Five private tables `llm_dispatch`, `llm_sweep_tick`, `llm_player_budget`, `llm_spend`, `llm_admin_state` | executor state | VERIFIED | Registered in `schema/tables.ts`; absent from client bindings |
| `spacetimedb/src/reducers/llm.ts` | `set_api_key`, `llm_smoke_test`, `grant_test_pending_level`, `purge_llm_tasks` | VERIFIED | All admin gated |
| `spacetimedb/src/views/llm.ts` | `my_llm_jobs`, `admin_llm_status` | VERIFIED | Index lookups only; admin view returns [] for non-admins |
| `scripts/llm/set-key.mjs` (+ `cli.mjs`, `proof_rules.mjs`, `prove-live.live.ts`) | key script and live harness | VERIFIED | 50 script tests pass; dry-run prints presence and length only |
| `docs/runbooks/llm-key.md` | SEC-04 runbook | VERIFIED | Setup, rotation, recovery, symptoms, maincloud (user only) |
| `spacetimedb/src/data/npc_gender.ts` and pronoun rule in `keeper_bible.ts:58` | Plan 41-18 | VERIFIED | See below |
| `41-MAINCLOUD-CHECKLIST.md` | user-run maincloud proof | VERIFIED (exists) | Run itself is deferred |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| Triggering reducers (6 domains) | `enqueueLlmJob` | same-transaction call | WIRED | Call sites listed under criterion 2 |
| `enqueueLlmJob` | `llm_dispatch` row | `insertLlmDispatch(ctx, job.id, now)` | WIRED | llm_queue.ts:239 |
| `llm_dispatch` | `llm_run` procedure | `onSchedule: LlmDispatch` | WIRED | reducers/llm_executor.ts:23 |
| `llm_run` | Anthropic | `ctx.http.fetch(ANTHROPIC_MESSAGES_URL)` outside any tx | WIRED | llm_executor.ts:651 |
| executor tx2 | budget, `llm_call_log` | `settleLlmCost`, `logLlmCall` | WIRED | persistAttempt |
| executor tx3 | domain apply | `applyLlmResult(tx, toApplyJob(job), text)` | WIRED | `applyStored` |
| `llm_sweep_tick` | `llm_sweep` reducer | `onSchedule: LlmSweepTick`, self-reschedule | WIRED | Seeded in init, scheduling, enqueue |
| `combat.ts` victory/defeat | narration job | `enqueueCombatOutroNarration` | WIRED | combat.ts:2147, 2249 |
| `apply_level_up` / `choose_skill` | skill offer job | `requestSkillOffer` / `offerNextOwedSkill` | WIRED | index.ts (reviewed in 41-REVIEW) |
| Client | LLM | none | NOT PRESENT (intended) | No prepare_* calls; `useLlmProxy` idle |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Produces Real Data | Status |
|----------|------|--------|--------------------|--------|
| `admin_llm_status` | key status, ledger, in-flight | `llm_admin_state`, `llm_spend` singletons, `llm_job.by_status` | Yes (written by `set_api_key`, executor, budget) | FLOWING |
| `my_llm_jobs` | per-player job rows | `llm_job.by_player` | Yes | FLOWING |
| Executor request | `resolveRouteInput(tx, job)` | stored `requestJson` and live table reads | Yes (llm_inputs tests) | FLOWING |
| Claude response | `ctx.http.fetch` | real Anthropic call | Not exercised live | DEFERRED (human) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Executor, sweeper, budget, retry, schedule, admin, cutover | `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 <8 files>` | 338/338 | PASS |
| Privacy, queue, narration, skill offer, renown, world gen, gender, pronouns, model literals | same, 9 files | 244/244 | PASS |
| Key script and proof rules | `pnpm exec vitest run scripts/llm/cli.test.mjs scripts/llm/proof_rules.test.mjs` | 50/50 | PASS |
| Key script dry-run | `node scripts/llm/set-key.mjs --dry-run` | `present (format ok, len 108)`, no key echoed | PASS |
| Live call, live SQL on local tables | needs a running server and Claude | server not running, no live calls allowed | SKIPPED (human) |

### Probe Execution

No probes declared by the Phase 41 plans and no `scripts/*/tests/probe-*.sh` for this phase. SKIPPED.

### Requirements Coverage

All 11 IDs assigned to Phase 41 in REQUIREMENTS.md are claimed by at least one plan (none orphaned). Plan 41-18 declares `requirements: []` (user-directed addition).

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| PIPE-01 | 41-05, 10, 11, 12, 13, 14, 15 | Every LLM action queued in a private table in the triggering transaction; client never calls LLM | SATISFIED (code); network-tab half human | Six enqueue sites; prepare_* removed |
| PIPE-02 | 41-03, 06, 07, 10, 16 | Results applied by SpacetimeDB, survive tab close | SATISFIED (code); live tab-close human | Server-side tx3 apply |
| PIPE-04 | 41-04, 06, 13, 14 | Bounded transient retry, fail fast, no auto-retry for creation/world gen | SATISFIED | llm_retry, `LLM_NO_AUTO_RETRY_ROUTES`, persistAttempt |
| PIPE-05 | 41-03, 07, 12, 14 | Sweeper, lock release, refund, in-voice message | SATISFIED | llm_sweeper, withFailureTx |
| PIPE-06 | 41-01, 04, 06 | Global in-flight cap | SATISFIED (code); live responsiveness human | `LLM_MAX_IN_FLIGHT` 4, claim-time check |
| PIPE-07 | 41-06, 11 | Narration never blocks combat, dropped if late | SATISFIED | Silent swallow, 20 s rule at claim and persist |
| PIPE-09 | 41-01, 06, 07, 16, 17 | Executor is the Phase 39 choice (scheduled procedure) | SATISFIED (code); maincloud gate re-check human | `llm_run` via `ctx.http.fetch` |
| SEC-04 | 41-04, 06, 08, 09, 16 | Key server-side only, never logged; runbook | SATISFIED | Private `llm_config`, redaction test, runbook |
| COST-01 | 41-01, 06, 16 | Four usage counts per route | SATISFIED (code); real counts human | `llm_call_log` columns, `logLlmCall` |
| COST-02 | 41-01, 02, 05 | Cost-weighted daily budget, reserve then settle | SATISFIED | llm_budget.ts |
| OPS-01 | 41-08, 15, 16, 17 | Admin smoke test and key status, warms schemas | SATISFIED (code); live run human | `llm_smoke_test`, `admin_llm_status` |

REQUIREMENTS.md still shows these 11 as Pending. They should be ticked when the human verification above closes, or earlier by the orchestrator if it treats code-level satisfaction as sufficient.

### Plan 41-18 (NPC gender and pronoun rule)

VERIFIED. `npc.gender` column (`tables.ts:141`, `.default('')` so a non-clearing publish works); `data/npc_gender.ts` (`resolveNpcGender`: valid value, then pronouns in text, then a stable FNV-1a name hash; `npcGender(row)` is the single reader); world-gen schema enum `gender: enumOf(NPC_GENDERS)` and world-gen prompt line requiring he/she (`llm_layers.ts:272`); NPC chat prompt carries `Gender:` and the pronoun set (`llm_layers.ts:571-576`); `KEEPER_BIBLE` line 58 states Keeper he, every person man or woman, beasts may be it, player always you; `llm_apply.ts` and `reducers/npc_interaction.ts` use `npcGender`. Tests `npc_gender.test.ts` and `pronoun_rules.test.ts` pass. Reply quality on real Claude output is part of the deferred live proof.

### Code Review

Three iterations (41-REVIEW.md, 41-REVIEW-FIX.md plus iteration copies). Iteration 3 final: 0 critical, 1 warning, 24 info. All prior critical and warning findings (CR-B01, WR-B01 to WR-B03 and the Part A fixes) are recorded as fixed with tests. The one open warning, that passive renown perks have no mechanical effect, predates Phase 41 (Phase 36) and is deferred to `.planning/todos/pending/2026-09-30-renown-passive-perks-have-no-effect.md`. It does not break any Phase 41 criterion: the renown job is enqueued, sent, applied and offered; only the reward's in-game effect is inert.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `spacetimedb/src/helpers/combat.ts` | 1166 | `TODO` (pre-existing, not added by Phase 41) | Info | None; no TBD/FIXME/XXX added in Phase 41 files |
| `src/composables/useLlmProxy.ts`, `submit_llm_result` (index.ts:588), `validate_llm_request`, `llm_task`, `llm_request`, `LlmBudget` | n/a | Legacy browser LLM path still present | Info | Intentional: removal is Phase 42 (SEC-02, SEC-03, SEC-05). Idle, since nothing inserts `llm_task` rows; `purge_llm_tasks` clears leftovers |

No stub, hollow or disconnected artifact was found in the Phase 41 executor path.

### Warnings (not gaps)

1. **The $2 phase ledger is a code constant that stays live after the phase.** `LLM_PHASE_SPEND_CAP_MICRO_USD = 2_000_000n` refuses every enqueue with "The Keeper has fallen silent for now" once cumulative spend plus reservations reach $2, and no reducer can reset or raise it (runbook: decide with the phase owner; do not clear the database to reset it). That is the intended live-proof guard, but it will also govern any maincloud play until Phase 43 adds the global ceiling and kill switch. Raise or remove it by code change before real players use a maincloud publish.
2. **The in-flight cap race and the scheduler are proven only by mocks.** The claim transaction reads the `in_flight` count and writes the claim atomically, which relies on SpacetimeDB's serializable transactions. That is the design and Phase 39 measured it, but real concurrent `llm_run` invocations have not been exercised in this phase (covered by the deferred live checks).

### Human Verification Required

See the `human_verification` list in the frontmatter:

1. Local smoke test with the real key: six ok entries, a real Claude reply, `keyValid` true.
2. One real action per domain locally, including the tab-close check and the Plan 41-18 pronoun check on real replies.
3. Browser network tab and `dist/` grep show no Anthropic or proxy traffic.
4. Responsiveness with calls in flight, the 20 s narration drop and the cap race, on a live server.
5. Maincloud proof from `41-MAINCLOUD-CHECKLIST.md` with the Phase 39 gate re-check.

Resume steps are in `41-LOCAL-PROOF.md` ("How to resume later"). Never read `spacetimedb/.env.local`, print the key or token, or query `llm_config`.

### Gaps Summary

No code gaps. Every roadmap criterion has an implementation that exists, is substantive and wired, and is covered by offline tests that pass. The phase cannot be marked `passed` only because criterion 6 and the live halves of criteria 1, 2, 3 and 5 were deferred by the user's own decision on 2026-09-30, so they sit in human verification until the user runs the live proof.

---

_Verified: 2026-09-30_
_Verifier: Claude (gsd-verifier)_
