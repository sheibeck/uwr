# Phase 41: Executor and Domain Cutover - Research

**Researched:** 2026-09-30
**Domain:** SpacetimeDB 2.10.1 TypeScript module. A scheduled procedure (`llm_run`) that calls Claude (`claude-sonnet-5-5`) through `ctx.http.fetch`, plus retry, sweeper, in-flight cap, cost-weighted budgets, admin key/smoke tooling, and the cutover of six LLM domains off the browser proxy.
**Confidence:** HIGH for repo-derived facts (every file named below was read; baselines were run). MEDIUM for runtime behaviour not yet measured on this executor (transaction retry under real concurrency, scheduled-function privacy, CLI-token identity). Those are listed in the Assumptions Log.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Executor mechanics**
- **Dispatch uses one schedule row per job.** The triggering reducer inserts the `llm_job` row and an `llm_dispatch` scheduled row (`ScheduleAt` now) in the same transaction. The scheduled procedure `llm_run` executes that one job. Phase 39 measured dispatch p95 at 3 ms. The job carries the requesting player's identity, because `ctx.sender` inside a scheduled procedure is the module identity.
- **The global in-flight cap is 4, set as one constant.** The local runtime caps at 4, and maincloud handled 8 with no tick impact. Phase 43 tunes it. When the cap is full, the dispatch reschedules itself about 500 ms later with jitter instead of running.
- **Each call uses the transaction shape claim, fetch, persist, apply:**
  - tx1 claims the job (pending to in_flight, attempt + 1) and reads the key from private `llm_config`.
  - The fetch runs outside any transaction.
  - tx2 persists the raw text, `stop_reason`, the four usage fields and the `llm_call_log` row, and settles the cost.
  - tx3 applies the result through `applyLlmResult(ctx, toApplyJob(job), text)`.

  If the apply fails, it re-runs once from the stored text, with no second billed call. After that it fails in-voice.
- **Retry policy:**
  - Transient classes (`rate_limit`, `overloaded`, `server`, `timeout`, `network`) get at most 3 attempts total. The backoff is 2 s, then 8 s, or `retry-after` when it is longer, capped at 60 s, plus jitter.
  - Non-retryable classes fail fast.
  - **Creation and world gen never auto-retry.** Any failure releases the lock, and the player gets an in-voice "try again" prompt.

**Failures, sweeper and player messaging**
- **A scheduled sweeper reducer runs every 30 s:**
  - `in_flight` longer than the route timeout plus 30 s becomes `expired`.
  - `received` but not applied for 60 s re-runs apply from the stored text.
  - `pending` older than 10 minutes becomes `expired`.

  Every expiry refunds the reserved budget, releases generation locks and posts a Keeper message.
- **Players learn about failures through each domain's existing failure path.** `applyLlmFailure` already writes the in-voice message and releases locks. `my_llm_jobs.userMessage`, with the coarse `errorCode` bucket from Phase 40, carries it for the Phase 42 client. Messages never mention keys, providers or HTTP codes.
- **Renown jobs queued during Phase 40 are processed normally** on the executor's first run, because they are valid jobs. The 10-minute pending rule does not apply to them; they expire only after 24 hours.
- **Combat narration never blocks combat and has the lowest priority.**
  - It runs only when in-flight is below cap - 1, so gameplay calls always have a slot.
  - It gets one attempt and no retry.
  - The result is dropped if it arrives more than 20 s after enqueue or after the combat has ended.

**Budget and cost**
- **Cost math reuses the Phase 39 micro-USD helpers** in `helpers/measurement.ts`. The Sonnet 5.5 list prices are $2/MTok input, $10 output, $2.50 cache-write and $0.20 cache-read.
  - At enqueue, reserve an estimate: prompt chars / 3.25 at the cache-write price, plus the full `max_tokens` at the output price.
  - On result, settle with the real 4-field usage.
  - A call that fails before it is billed is refunded in full.
- **Per-player daily limits:** $1.00 per day cost-weighted, plus a 200 calls per day backstop. Both are constants in one module, keyed by UTC date. Phase 43 adds the global ceiling and kill switch.
- **Over budget:** the reducer answers with an in-voice Keeper refusal at enqueue (`fail(ctx, character, ...)` where character context exists). No job is created and nothing is reserved. Combat narration is silently skipped instead of refused.
- **Budget state lives in a new private per-player-per-day table** holding reserved micro-USD, spent micro-USD, call count and UTC date. It replaces `LlmBudget`'s call count. `LlmBudget` and `checkBudget`/`incrementBudget` become dead code, and Phase 42 removes them. Every call's four usage counts are recorded per route in `llm_call_log` (COST-01).

**Cutover, client, key and live proof**
- **Move straight to the new architecture** (user, 2026-09-30: "No one is using this stuff now ... We can immediately go to our new architecture. We're fully green field"). There are no compatibility wrappers for the running client or old data.
  - Triggering reducers enqueue in-transaction.
  - The `prepare_creation_llm`, `prepare_world_gen_llm` and `prepare_skill_gen` reducers, and their client calls, are **deleted as each domain moves**. The client is updated in the same step.
  - Domain order is NPC chat, combat narration, skills plus renown, creation, world gen.
  - `useLlmProxy` goes idle as `llm_task` inserts stop. Existing `llm_task` rows are purged at the end.
- **Local `--clear-database` is allowed whenever a schema change requires it.** The project is greenfield with no data to protect. Re-set the key afterwards with the script. This never applies to maincloud. Code-only changes still publish without a clear.
- **Key setup and status:**
  - The existing admin `set_api_key` reducer stays.
  - `scripts/llm/set-key.mjs` is restored from the Phase 39 spike helper in git history. It reads `ANTHROPIC_API_KEY` from `spacetimedb/.env.local` and calls the reducer without ever echoing, logging or putting the key in argv or shell history. It has a `--dry-run` that reports only presence and length.
  - An admin-only key status reports whether the key is set, and whether it is valid, proven by the last smoke test.
  - Runbook `docs/runbooks/llm-key.md` covers setup, rotation, the Anthropic Console workspace spend limit, and recovery after `--clear-database` (SEC-04).
- **Smoke test (OPS-01):** an admin-only reducer enqueues one `smoke_test` text call plus one minimal call per JSON schema (5), which warms the grammar cache. That costs about $0.05 per run. Results appear in an admin-visible form.
- **Live proof:**
  - Local first. One `checkpoint:human-action` has the user set the key; `llm_config` holds the Phase 39 placeholder now. Then one real action per domain runs, with a hard **$2 spend cap for the phase** enforced in the module.
  - Maincloud last. One final `checkpoint:human-action`: the user publishes when ready and runs the smoke test plus one action per domain from a checklist Claude writes. Claude records the results and re-checks the Phase 39 gate thresholds against what the user observes. A failure there reopens the executor decision.
  - Claude never publishes to, or calls, maincloud.

### Claude's Discretion
- Exact table, column and index names:
  - the dispatch table (suggested `llm_dispatch`)
  - the budget table (suggested `llm_player_budget`)
  - the sweeper schedule table
  - any `llm_job` columns Phase 41 needs, for example `attempt`, `nextAttemptAt`, `reservedMicroUsd` and `rawText`
  - how the phase spend cap is stored
- How triggering reducers build each route's request context from the Phase 40 volatile builders. `requestJson` must carry the legacy `contextJson` keys `llm_apply` needs.
- Jitter amounts, the exact reschedule delay and the smoke-test output format.
- Whether the in-flight count is derived from `llm_job.by_status` or kept as a counter row. It must be correct under concurrent scheduled procedures.

### Deferred Ideas (OUT OF SCOPE)
- **Phase 42:**
  - Because the project is greenfield (user, 2026-09-30), the planned two-publish `llm_task`/`llm_request` removal (SEC-05) can be a plain removal, with a local `--clear-database` if the schema requires it.
  - Remove `submit_llm_result`, `llm-proxy/`, `useLlmProxy` and `LlmBudget`.
  - Wire `useLlmStatus` to `my_llm_jobs`.
- **Phase 43:** the global spend ceiling and kill switch (COST-03), in-flight cap tuning, effort sweeps, cache TTL, and staged generation.
- The NPC table privacy todo (`.planning/todos/pending/2026-09-29-make-npc-secret-and-memory-tables-private.md`) is not part of this phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PIPE-01 | Every LLM action queued in a private table inside the triggering reducer's transaction; client never calls LLM or proxy | Section 4 (per-domain trigger map), Section 2 (`enqueueLlmJob` extension inserts job + dispatch row in the caller's tx), client changes Section 10 |
| PIPE-02 | SpacetimeDB applies results; survives refresh/tab close | Executor tx3 apply on stored player identity (Section 3); sweeper re-apply (Section 6); no client in the path |
| PIPE-04 | Failures handled by class: transient retry (bounded), fail-fast, creation/world_gen never auto-retry | Section 3 retry table + `NO_AUTO_RETRY_ROUTES`; `RETRYABLE_CLASSES` already in `claude_request.ts` |
| PIPE-05 | Stuck jobs swept; locks release, budget refunds, in-voice Keeper message | Section 6 sweeper + `applyLlmFailure` lock-release map (Section 3.4) |
| PIPE-06 | Global in-flight cap keeps combat ticks/reducers responsive | Section 2 (count-derived cap inside claim tx, cap 4, narration cap-1, defer 500 ms + jitter) |
| PIPE-07 | Combat narration never blocks combat; dropped if late | Section 4.2 (outro trigger, silent skip, one attempt, 20 s age drop + claim-time expiry) |
| PIPE-09 | Executor is the chosen scheduled procedure | Section 1 (API facts, registration form, `onSchedule`), Code Examples |
| SEC-04 | Key only in private `llm_config`, never logged; runbook | Section 7 (key script, HTTP-API path avoiding argv, redaction needles IN-04, runbook outline), Security Domain |
| COST-01 | Four usage counts recorded per route | `llm_call_log` already has the four columns; tx2 writes them; add `costMicroUsd`, `dispatchLateMs` (Section 3.2) |
| COST-02 | Cost-weighted daily budget with call backstop, reserve at enqueue, settle on result | Section 5 (table, math, pricing verified, hard $2 phase ledger) |
| OPS-01 | Admin key status + smoke test that warms schemas | Section 7 (admin state singleton, admin-only view, 6 smoke jobs that skip apply) |
</phase_requirements>

## Project Constraints (from CLAUDE.md and auto-memory)

Treat these with the same authority as the locked decisions.

- SpacetimeDB TS rules (mandatory): `table(OPTIONS, COLUMNS)`; indexes in OPTIONS as `{accessor, algorithm:'btree', columns}`; `filter(value)` takes the value directly and returns an iterator; unique/primary-key columns use `.find()`; **views use index lookups only, never `.iter()`**; **procedures have no `ctx.db`, use `ctx.withTx(tx => tx.db...)`**; scheduled tables/functions as documented below; auto-inc insert needs a `0n` placeholder and `insert()` returns the ROW; export views/procedures by name (the `_wrapMethod` in `index.ts`); **never invent SpacetimeDB APIs**; do not edit generated bindings (regenerate with `pnpm spacetime:generate`).
- Reducers are deterministic (no `Date.now()`/`Math.random()`); use `ctx.timestamp`. The executor procedure is the only place a wall clock is acceptable, and only outside `withTx`.
- Edit rule: smallest change, do not touch unrelated files.
- Publishing: **never publish to maincloud**. Local is `pnpm spacetime:publish` (`--server local`). Local `--clear-database` is allowed only when a schema change requires it (user, 2026-09-30); it wipes the private `llm_config` key, so re-run the key script afterwards.
- Auto-memory: prefer `fail(ctx, character, msg)` where character context exists; `SenderError` only in low-level helpers. Server is source of truth (import constants from `spacetimedb/src/data/`, never duplicate on the client). **Every phase and quick task must add unit tests that enforce the rules it implements.** Tests run as `pnpm --dir spacetimedb exec vitest run --maxWorkers=1` (this host runs out of virtual memory with parallel workers). **Never read `spacetimedb/.env.local` and never print a key** (a real key will be placed there by the user; only the restored script reads it).
- Project skill `.claude/skills/run-local/SKILL.md` covers launching the local stack (server on 3000, `pnpm spacetime:publish`, Vite). Its LLM proxy step becomes unnecessary once Phase 41 lands (the proxy stays in the repo until Phase 42).

## Summary

The Phase 40 seam is complete and offline-tested: `enqueueLlmJob`, `buildClaudeRequest`/`classifyClaudeResponse`, `applyLlmResult`/`applyLlmFailure`, `createMockProcCtx`, and a reference driver `runJobOnce` in `llm_seam.test.ts`. Phase 41 promotes that driver into a real scheduled procedure and rewires the five remaining domains onto it. Nothing in the module can currently reach `fetch` (a repo guard test enforces it); Phase 41 adds exactly one exempt file (the executor) and tightens the guard to "only that file".

The three design facts that shape every plan: (1) a scheduled procedure's schedule row is **deleted before it runs**, so every retry, defer and re-dispatch inserts a **new** `llm_dispatch` row; (2) SpacetimeDB transactions are strongly serializable and `withTx` may re-run its callback, so **an in-flight count derived from `llm_job.by_status` inside the claim transaction is race-free, and a counter row would leak on a crashed call**; (3) all budget, reservation and lock-release state must be **idempotent**, because the sweeper and a slow procedure can both act on one job. Combat is real-time now (round-based combat was removed), so `triggerCombatNarration` (no callers) must be replaced by a victory/defeat outro hook in `handleVictory`/`handleDefeat`, built before `clearCombatArtifacts` deletes the participants.

Three findings need a user or planner decision (details in Open Questions): the CLI identity that owns the database is **not** in `ADMIN_IDENTITIES`, so `set_api_key` from the CLI currently fails with "Admin only"; deleting `prepare_skill_gen` leaves a failed skill offer unrecoverable; and a failed world_gen currently resets to `PENDING` expecting a client to re-call `prepare_world_gen_llm`, which no longer exists.

**Primary recommendation:** Build in this order: (1) one schema/constants/test-infrastructure plan that owns `schema/tables.ts`, `data/llm_limits.ts`, `test-utils.ts` and stub registration files; (2) pure modules in parallel (budget, executor, sweeper, apply hardening); (3) admin/key/smoke tooling; (4) five sequential domain cutovers (each deletes its `prepare_*` reducer and client call in the same plan, then regenerates bindings and runs `pnpm build`); (5) purge plus local live proof (`checkpoint:human-action`); (6) maincloud checklist (`checkpoint:human-action`).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Enqueue, dedupe, budget reserve, dispatch row | Reducer transaction (SpacetimeDB) | Pure helpers (`llm_queue`, `llm_budget`) | Reducers serialize; in-tx lookup + insert cannot race (PIPE-03 already relies on it) |
| HTTP call to Anthropic | Scheduled procedure `llm_run` | none | Only procedures have `ctx.http`; browser is out of the path (PIPE-01) |
| Claim / cap / retry decisions | Procedure tx1 and tx2 | Pure `retryDelayMs`, `classifyClaudeResponse` | Serializable tx makes count-derived cap race-free |
| Apply results to game state | Procedure tx3 via `applyLlmResult` on `job.playerId` | Sweeper re-apply | Scheduled-procedure sender is the module identity, so authority comes from the stored player |
| Stuck-job recovery, refunds, lock release | Scheduled reducer `llm_sweep` | `applyLlmFailure` | Schedules survive publish and tab close (PIPE-02/05) |
| Cost accounting and hard cap | Private tables `llm_player_budget`, `llm_spend` | `helpers/measurement.ts` math | Server-side only; admin reads through an admin-only view |
| Key storage | Private `llm_config` | Admin reducer, key script over the HTTP API | Never in a public table, log, view, or argv (SEC-04) |
| Player-visible failure text | `applyLlmFailure` (existing per-domain event) | `my_llm_jobs.userMessage` (Phase 42 client) | Reuses Phase 40 in-voice copy |
| Admin key status and smoke results | Private singleton `llm_admin_state` + admin-only view | `spacetime sql` (owner can read private tables) | Views cannot scan, so status is one row keyed `1n` |
| Client | Renders subscriptions only; no `prepare_*` calls | `useLlmProxy` idle until Phase 42 | Browser network tab shows no LLM call (success criterion 2) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `spacetimedb` | 2.10.1 installed (npm latest 2.10.2) | `table`, `schema`, `procedure`, `reducer`, `view`, `ScheduleAt`, `TimeDuration` | Project pin; do not bump in this phase [VERIFIED: `spacetimedb/node_modules/spacetimedb/package.json`] |
| `vitest` | 5.0.2 | Unit tests | Existing; baseline 34 files / 1454 tests green in about 21 s single worker [VERIFIED: ran it] |
| Node | 22.23.2, pnpm 11.23.0 | Test runner, key script, live-proof script | [VERIFIED: `node --version`, `pnpm --version`] |
| SpacetimeDB CLI | 2.10.1 (same as runtime) | publish, generate, sql, `login show --token` | [VERIFIED: spike record; `spacetime login show --help` lists `--token`] |

### Supporting (all in-repo, no new dependencies)
| Module | Purpose | Use |
|--------|---------|-----|
| `helpers/measurement.ts` | `reserveCostMicroUsd`, `settleCostMicroUsd`, `estimateCostMicroUsd`, `redactSecrets(text, needles)`, `findSecretLeaks` | Budget math and redaction (COST-01/02, SEC-04) |
| `helpers/claude_request.ts` | `buildClaudeRequest`, `buildClaudeHeaders`, `classifyClaudeResponse`, `classifyClaudeError`, `RETRYABLE_CLASSES` | The executor's request/response layer |
| `helpers/llm_queue.ts` | `enqueueLlmJob`, `SOURCE_KEYS`, `logLlmCall`, `resolveCharacterPlayerId` | Extended in place (Section 2) |
| `helpers/llm_apply.ts` | `applyLlmResult`, `applyLlmFailure`, `toApplyJob` | Called from tx3 and the sweeper |
| `helpers/test-utils.ts`, `helpers/schema_recorder.ts` | `createMockProcCtx`, strict `createMockDb`, `capturedProcedure`, `capturedReducer`, `snapshotDb`, `rowColumnProblems` | All new tests |
| `data/llm_layers.ts`, `data/llm_routes.ts`, `data/llm_models.ts` | Route blocks, volatile builders, route table, model constant | Prompt building |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Count-derived in-flight cap | Counter row in a state table | A counter leaks when a procedure dies mid-flight (publish, crash) and needs its own repair path; the derived count self-heals when the sweeper expires the stuck job |
| Table `scheduled:` option | `onSchedule` on the procedure/reducer | `scheduled:` is marked `@deprecated` in 2.10.1 typings; `onSchedule` is what Phase 39 proved for a procedure |
| `spacetime call` for the key | HTTP `POST /v1/database/uwr/call/set_api_key` with Bearer token | `spacetime call` has no stdin option, so the key would sit in the child process's argv; the HTTP body keeps it out of argv |
| Client-side Anthropic SDK | Raw HTTP through the pure builder | The SDK cannot run inside a module (`ctx.http.fetch` only) |

**Installation:** none. `# no new packages`

**Version verification:** `spacetimedb` 2.10.1 read from `package.json`; the claude-api skill (loaded this session) confirms `claude-sonnet-5-5` list price $2 input / $10 output per MTok and cache reads $0.20 per MTok; cache writes are billed at about 1.25 times the input price ($2.50), consistent with `CLAUDE_PRICE_MICRO_USD_PER_TOKEN` [VERIFIED: claude-api skill, cached model table 2026-09-25; CITED for the 1.25x write multiplier].

## Package Legitimacy Audit

Phase 41 installs **no external packages** (the key script and live-proof script use Node built-ins and the repo's generated bindings), so the gate is not triggered.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none added) | n/a | n/a | n/a | n/a | n/a | n/a |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 TRIGGER (reducers, in their own transaction)
 ---------------------------------------------------------------------------
 talk_to_npc | handleVictory/Defeat | apply_level_up | awardRenown
 submit_creation_input | startWorldGeneration (finalize/travel/explore)
        |  build route INPUT (snapshot: ids + player text + world facts)
        v
 enqueueLlmJob(ctx, {route, playerId, characterId, sourceKey, request:{legacy keys..., input}})
   1 validate + serialize (64k cap)            5 reserve budget  --refused--> {refused:'daily_cost'|'daily_calls'|'phase_cap'|'busy'}
   2 dedupe on by_dedupe_key (active blocks)      caller: fail()/event (narration: silent)
   3 per-player active-job cap                 6 insert llm_job(pending, reservedMicroUsd, budgetDay)
   4 ensure llm_sweep_tick exists              7 insert llm_dispatch(ScheduleAt.time(now), jobId)
        |
        v   (row is DELETED by the scheduler before the procedure runs)
 SCHEDULED PROCEDURE llm_run(arg={scheduledId, scheduledAt, jobId})
   guard: ctx.sender == ctx.databaseIdentity
   tx1  claim: job.status==='pending' && nextAttemptAt<=now ?
          - late narration (>20 s)      -> expire silently, refund
          - phase cap exhausted         -> fail(billing), applyLlmFailure, refund
          - in_flight count >= cap (narration: cap-1) -> insert NEW llm_dispatch at now+500ms+jitter; return deferred
          - else status='in_flight', attempt+1, startedAt; read llm_config key; resolve route input   -> plain snapshot out
   ----- NO transaction open -----
   build layers -> buildClaudeRequest -> ctx.http.fetch(POST, timeout=route.timeoutMs)   (throws on timeout; 4xx/5xx returned)
   classifyClaudeResponse | classifyClaudeError   (wrapped in try/catch, needles=[key])
   tx2  persist (only if job still in_flight with same attempt):
          ok        -> status='received', resultText, stopReason, usage, requestId, cost settle
          retryable & attempts left -> status='pending', errorCode, nextAttemptAt, INSERT new llm_dispatch(now+delay)
          else      -> status='failed', errorCode, refund/settle, (applyLlmFailure in tx4)
          always    -> llm_call_log row (4 usage counts, latency, dispatchLateMs, cost)
   tx3  apply (only if status==='received'): applyLlmResult(tx, toApplyJob(job), text); status='completed'
          throws -> retry tx3 once from stored text -> else tx4: applyLlmFailure + status='failed'(apply_error)
        v
 game tables  --subscription-->  client (unchanged)

 SWEEPER (llm_sweep_tick -> reducer llm_sweep, every 30 s, re-inserts its own tick FIRST, per-job try/catch)
   in_flight older than timeout+30s -> expired (+refund, applyLlmFailure)
   received older than 60 s         -> re-apply once from resultText, else failed
   pending older than 10 min (renown: 24 h) -> expired (+refund, applyLlmFailure)
   pending with no llm_dispatch row -> insert one (covers Phase 40 renown jobs)
   prune llm_player_budget rows older than 2 days

 ADMIN: set_api_key (writes llm_config + llm_admin_state) | llm_smoke_test (6 jobs, apply skipped)
        admin_llm_status view (admin-only projection) | spacetime sql as owner
```

### Recommended Project Structure
```
spacetimedb/src/
├── data/
│   ├── llm_limits.ts          # NEW: every Phase 41 constant (cap, retry, sweeper, budget, phase cap)
│   └── model_literals.test.ts # shrink allowlist per domain; fetch guard exempts ONLY helpers/llm_executor.ts
├── helpers/
│   ├── llm_executor.ts        # NEW: runLlmJob(ctx, arg, deps?) promoted from runJobOnce; the ONLY file that reaches ctx.http
│   ├── llm_inputs.ts          # NEW: resolveRouteInput(tx, job) + bigint revivers (pure)
│   ├── llm_budget.ts          # NEW: utcDay, reserve/settle/release, phase ledger (pure, duck-typed)
│   ├── llm_sweeper.ts         # NEW: sweepLlmJobs(ctx) (pure body of the reducer)
│   ├── llm_retry.ts           # NEW (or inside llm_executor): retryDelayMs, maxAttempts(route), jitter (pure)
│   ├── creation_validate.ts   # NEW: clamp/validate race and class replies against the vocabulary
│   ├── llm_queue.ts           # EXTEND: dispatch row, reserve, refusal result, active-job cap, ensure sweeper
│   ├── llm_apply.ts           # EXTEND: serializePerkEffect, creation clamp, toBigIntSafe, world_gen failure -> ERROR
│   ├── claude_request.ts      # EXTEND: optional needles for redaction (IN-04), guard res.text() (IN-03)
│   ├── scheduling.ts          # EXTEND: ensureLlmSweepScheduled (init + clientConnected + enqueue)
│   └── combat_narration.ts    # REPLACE trigger with buildCombatOutro + enqueue; keep handleCombatNarrationResult
├── reducers/
│   ├── llm.ts                 # set_api_key extended; validate_llm_request stays (dead, Phase 42)
│   ├── llm_executor.ts        # NEW registration: procedure llm_run (4-arg named form, onSchedule)
│   ├── llm_sweeper.ts         # NEW registration: reducer llm_sweep (onSchedule)
│   └── llm_admin.ts           # NEW registration: llm_smoke_test, admin status, grant_test_pending_level
├── schema/tables.ts           # HOTSPOT: LlmDispatch, LlmSweepTick, LlmPlayerBudget, LlmSpend, LlmAdminState; llm_job/llm_call_log columns
├── views/llm.ts               # EXTEND: admin_llm_status
scripts/llm/set-key.mjs        # NEW (restored/adapted)  ;  scripts/llm/prove-live.ts (NEW)  ;  docs/runbooks/llm-key.md (NEW)
```

### Pattern 1: Scheduled procedure registration (proven on 2.10.1 in Phase 39)
**What:** 4-argument named form so the `_wrapMethod('procedure', ...)` export collector (index.ts:272) finds the name; table bound through `onSchedule` (the non-deprecated form).
**When:** exactly once, in `reducers/llm_executor.ts` (runs after the monkey-patch because `registerReducers` is called last, index.ts:1121).
```typescript
// Source: git show e5f414d9^:spacetimedb/src/spike/llm_spike.ts (worked on local 2.10.1 and maincloud);
//         procedures.d.ts ProcedureOpts.onSchedule (only allowed when the return type is t.unit())
spacetimedb.procedure(
  { name: 'llm_run', onSchedule: LlmDispatch },
  { arg: LlmDispatch.rowType },
  t.unit(),
  (ctx: any, { arg }: any) => { runLlmJob(ctx, arg); return {}; },
);
```
`LlmDispatch` must also be listed in `schema({...})` in `schema/tables.ts`. Import the table directly from `../schema/tables` (as `reducers/combat.ts` does) instead of widening `reducerDeps` in `index.ts`.

### Pattern 2: Every retry inserts a fresh dispatch row
The scheduler deletes the row before the procedure executes ("Scheduled procedures delete the row before execution, so `schedule_table.find(scheduled_id)` returns `null` and `.update()` fails" [CITED: spacetimedb.com/docs/tables/schedule-tables]). A deferral (cap full), a retry, and a sweeper re-dispatch are all `tx.db.llm_dispatch.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.time(nowMicros + delay), jobId })`. The claim step tolerates duplicates: it only proceeds when `job.status === 'pending'`.

### Pattern 3: Idempotent reservation via the job row
`job.reservedMicroUsd` is the single source of truth for "how much is currently held". Release = `player.reserved -= job.reservedMicroUsd; ledger.reserved -= ...; job.reservedMicroUsd = 0n` in one tx. A late tx2 arriving after the sweeper released the job reads `0n` and cannot double-refund; it still adds the real cost to `spent`. Store the reservation's UTC day in `job.budgetDay` so a job that crosses midnight settles against the right row.

### Pattern 4: Snapshot the route input at enqueue
`requestJson = { <legacy contextJson keys as strings>, input: <RouteInputMap[route] serialized with the bigint replacer> }`. The executor's tx1 calls `resolveRouteInput(tx, job)`, which revives bigints per route (skill `level`, combat event fields) and, for the Phase 40 renown jobs that have no `input`, rebuilds it from `requestJson` plus the character name (exactly what `runJobOnce` does today). Golden test: `serialize -> revive -> buildRouteLayers` must equal `buildRouteLayers` on the original input (byte-identical `volatile`). This freezes state at the trigger moment (retries see what the player saw) and needs no DB reads for combat, whose event summary cannot be rebuilt later.

### Anti-Patterns to Avoid
- **A counter row for in-flight.** Leaks on crash and needs its own repair.
- **Holding a transaction across `fetch`.** Docs: "Procedures can't send requests at the same time as holding open a transaction" [CITED: procedures docs].
- **Letting an exception escape the sweeper or a scheduled reducer.** A throw rolls back the whole transaction, including the "reschedule myself" insert, and a one-shot schedule row is already gone: the sweeper would silently die (the existing `sweep_llm_errors` has this weakness). Insert the next tick first and wrap each job's work in try/catch.
- **Non-idempotent state captured across `withTx` re-runs.** The callback "may be invoked multiple times, possibly seeing a different version of the database state" [CITED: procedures docs]. Assign outer variables only from values read inside the callback, and reset flags at the top of the callback (the spike reset `capBlocked = false` first).
- **Using `ctx.sender` anywhere on the apply path.** In a scheduled procedure it is the module identity. Helpers such as `requireCharacterOwnedBy` cannot be used there; a static test already guards `llm_apply.ts`.
- **`.count()` on a table in code the strict mock must run.** IN-11: strict mock throws for table-level members; use `[...iter()].length` or `[...by_status.filter(x)].length`.

## 1. Executor API on 2.10.1 (verified against installed typings and docs)

| Topic | Fact | Source |
|-------|------|--------|
| Scheduling a procedure | `spacetimedb.procedure({ name, onSchedule: Table }, { arg: Table.rowType }, t.unit(), fn)`. `onSchedule` exists on `ProcedureOpts` and is only accepted when the return type is `t.unit()`. The row is passed as `arg`. The table option `scheduled: () => export` still works but is `@deprecated` in `TableOpts` | [VERIFIED: `dist/server/procedures.d.ts`, `dist/lib/table.d.ts`; CITED docs] |
| Row deletion | Row is deleted before the procedure runs; `.update()` on it fails | [CITED: schedule-tables docs] |
| Fire time | `ScheduleAt.time(micros: bigint)` for one-shot; `ScheduleAt.interval(micros)` for repeating. Phase 39 measured dispatch p95 3.0 ms maincloud, 15.9 ms local | [CITED docs; 39-SPIKE-RECORD] |
| Sender | Scheduled procedure: `ctx.sender` is the module identity, no connection id. Client-called: caller identity. `ctx.databaseIdentity` exists (spike compared against it) | [VERIFIED: procedures.d.ts; 39-SPIKE-RECORD] |
| Privacy of scheduled functions | 2.x: scheduled reducers/procedures are private by default; older versions required an `ctx.sender == module identity` check. Add the check anyway (cheap, testable with the mock, whose default sender is the module identity) | [CITED: web search summary of SpacetimeDB 2.x docs, MEDIUM; treat as ASSUMED, see A2] |
| Timestamps | `ctx.timestamp` (procedure start) and `tx.timestamp` (transaction). Phase 39 measured in-module call time as `tx2.timestamp - tx1.timestamp`, and separately with `Date.now()` around the fetch. Use `Date.now()` around fetch only (outside `withTx`) for latency; use `tx.timestamp` for everything stored | [VERIFIED: spike source] |
| Delayed retry | Insert `llm_dispatch` with `ScheduleAt.time(tx.timestamp.microsSinceUnixEpoch + BigInt(delayMs) * 1000n)` inside the persist tx | [VERIFIED: pattern in `index.ts` day/night tick] |
| `withTx` | Callback may be invoked multiple times; a throw rolls back; return values are for the procedure only; must be synchronous (no Promise). Throwing inside propagates | [CITED: procedures docs; mock enforces sync + rollback] |
| `ctx.http.fetch(url, init)` | `init`: `method`, `headers` (object/Headers/pairs), `body` (string/ArrayBuffer/view), `timeout: TimeDuration`. Returns `SyncResponse`: `status`, `statusText`, `ok`, `headers.get(name)`, `text()`, `json()`, `bytes()`. Default timeout 30 s, host clamps to 180 s. **Throws** on timeout ("operation timed out"); non-2xx returns normally | [VERIFIED: `http_internal.d.ts`, `http_shared.d.ts`; 39-SPIKE-RECORD; CITED docs] |
| `TimeDuration` | `import { TimeDuration } from 'spacetimedb'` (root, works in Node vitest): `TimeDuration.fromMillis(ms)` | [VERIFIED: seam test imports it] |
| Random | `ctx.random` exists (seeded on `ctx.timestamp`) but `TransactionCtx` in the mock has none. Use **deterministic jitter** derived from `jobId` and `attempt` (for example `Number((jobId * 7919n + attempt * 104729n) % 250n)`). No RNG, testable, no CLAUDE.md conflict | [VERIFIED: `rng.d.ts`; recommendation] |
| Where `procedure(` is registered today | Nowhere in production code. Only `index.ts:272` (`_wrapMethod`) and `schema_recorder.ts:135` (recorder). Phase 41 adds the first | [VERIFIED: grep] |
| Capturing `llm_run` in tests | `capturedProcedure('llm_run')` from `schema_recorder.ts` returns the handler as `(ctx, {arg})`. To keep tests fast, put the body in `helpers/llm_executor.ts` (pure, duck-typed) and unit-test `runLlmJob` directly with `createMockProcCtx`; add one small test that loads `index.ts` under the recorder and asserts `capturedProcedure('llm_run')` and `capturedReducer('llm_sweep')` are functions | [VERIFIED: `schema_recorder.ts`; `schema_recorder.test.ts:88`] |
| `_wrapMethod` naming | `procedure(args)` returns `args[0].name` only when `args.length >= 4 && typeof args[0].name === 'string'`. A 3-arg call gets a counter name and the export is not addressable by name | [VERIFIED: index.ts:272-278] |

## 2. In-flight cap under concurrent scheduled procedures

**Serialization evidence.** SpacetimeDB documents "strongly serializable ACID transactions" and re-execution of a reducer when a serializability anomaly is detected [CITED: spacetimedb.com blog and reducers docs via search]; `withTx`'s "may be invoked multiple times, possibly seeing a different version of the database state" is that mechanism surfacing in procedures [CITED: procedures docs]. Two procedures that both read `in_flight < cap` and both flip a job to `in_flight` cannot both commit on the same snapshot; one re-runs and sees the other's write. Phase 39 corroborates from the outside: server-side concurrency is capped by the runtime (4 local, 8 maincloud) independently, and 8 enqueued jobs never showed more than 4 in flight locally [CITED: 39-SPIKE-RECORD].

**Recommendation: count-derived, in the claim transaction.** `const inFlight = [...tx.db.llm_job.by_status.filter('in_flight')].length` (single-column index already exists on `llm_job`).
- Correctness: read and write are in the same serializable transaction.
- Self-healing: a stuck `in_flight` row holds a slot only until the sweeper expires it (route timeout + 30 s, at most 210 s), then the derived count is right again. A counter row would stay wrong until a repair job existed.
- Cost: the set is at most a handful of rows.
- Cap rules in the claim tx: gameplay routes defer when `inFlight >= LLM_MAX_IN_FLIGHT` (4); `combat_narration` defers when `inFlight >= LLM_MAX_IN_FLIGHT - 1`. "Defer" = insert a new `llm_dispatch` at `now + 500 ms + jitter(0..250 ms)` and return without touching the job. A deferred narration whose age already exceeds 20 s is expired silently in the same tx instead of deferring again.
- Waiting cost: each waiting job polls once per ~0.5 s (one 3 ms dispatch plus one small transaction). At cap 4 with a handful of waiters this is negligible. Do not add a wake-up mechanism in Phase 41.

Test with `createMockProcCtx`: seed 4 `in_flight` jobs, run `runLlmJob` for a 5th: no fetch, job still `pending`, exactly one new dispatch row in the future; narration with 3 in flight defers, gameplay job with 3 in flight runs; a `withTxReinvoke: 1` run yields the same end state.

## 3. Claim, fetch, persist, apply (per job)

### 3.1 `llm_job` columns to add (append at the END of the column list)
Phase 40's table already has `attempt`, `resultText` (the "raw text"), `stopReason`, `errorCode`, `requestId`, the four usage counters, `startedAt`, `finishedAt`, and `by_status`. Add only:

| Column | Type | Purpose |
|--------|------|---------|
| `nextAttemptAt` | `t.timestamp().optional()` | Earliest claim time after a retry; claim skips a pending job whose time is in the future |
| `reservedMicroUsd` | `t.u64()` | Currently held reservation (Pattern 3) |
| `costMicroUsd` | `t.u64()` | Settled actual cost for this job (COST-01/02) |
| `budgetDay` | `t.string()` | UTC `YYYY-MM-DD` of the reservation row; `''` for smoke jobs |
| `applyAttempts` | `t.u64()` | 0, 1, 2: tx3 runs at most twice from the stored text |

Adding columns to an existing table needs defaults on a non-clearing publish [CITED: automatic-migrations docs, per Phase 40 research]. Locally the user has allowed `--clear-database` for schema changes, and maincloud has never received `llm_job` (no maincloud publish since Phase 38), so there it is a brand-new table. Still prefer `.default(0n)` / `.default('')` on the new non-optional columns. Also add to `llm_call_log`: `costMicroUsd t.u64()` and `dispatchLateMs t.u64()` (tx1 timestamp minus `arg.scheduledAt`, needed for the maincloud gate re-check). Update `logLlmCall` and the recorder/strict tests together with the table (they validate row keys against the recorded columns).

### 3.2 Persist rules (tx2), by outcome
| Outcome | Job update | Budget | Dispatch |
|---------|-----------|--------|----------|
| `ok` | `received`, `resultText`, `stopReason`, `requestId`, four usage counters, `errorCode` cleared, `costMicroUsd = estimateCostMicroUsd(usage)` | settle: release reservation, add actual to player `spent` and ledger `spent` | none (tx3 follows immediately) |
| Billed failure (`refusal`, `truncated`, `invalid_json`, `schema_mismatch`, `empty_output`, `unexpected_stop`; usage present) | `failed`, `errorCode = class`, `finishedAt`, usage kept | settle with actual usage (paid) | none |
| HTTP error without usage, retryable (`rate_limit`, `overloaded`, `server`) and attempts left | `pending`, `errorCode`, `nextAttemptAt` | keep the reservation held for the next attempt | new dispatch at `now + delay` |
| HTTP error without usage, non-retryable (`auth`, `billing`, `bad_request`) or exhausted | `failed`, `errorCode` | release all (nothing billed) | none |
| Thrown `timeout`/`network` and attempts left | `pending`, `errorCode` | keep reservation | new dispatch |
| Thrown, exhausted | `failed` | player: release all (never charge a player for a platform fault); phase ledger: `settleCostMicroUsd` semantics (a thrown fetch keeps the reservation, so the hard cap never under-counts). See Open Question 4 | none |

Guard at the top of tx2: proceed only when `job.status === 'in_flight' && job.attempt === myAttempt`. If the sweeper already expired the job, write only the call-log row and add the real cost to `spent` (reservation already released). Every `llm_call_log` write goes through `logLlmCall`, with `needles: [apiKey]` added (IN-04).

### 3.3 Retry schedule (pure, unit-tested)
```typescript
// delay after attempt n failed (n = 1 or 2). Attempt 3 failing is terminal.
const BASE_MS = [2000, 8000];
retryDelayMs(attemptJustFailed, retryAfterSeconds, jobId) =
  min(60_000, max(BASE_MS[attemptJustFailed - 1], (retryAfterSeconds ?? 0) * 1000)) + jitterMs(jobId, attemptJustFailed)   // jitter 0..20% of the base, deterministic
maxAttempts(route) = NO_AUTO_RETRY_ROUTES.has(route) ? 1 : 3
NO_AUTO_RETRY_ROUTES = { creation_race, creation_class, world_gen, combat_narration, smoke_test }
```
Retry only when `result.retryable` (the classifier already restricts `retryAfterSeconds` to retryable classes and treats the spend-cap 429 as `billing`, not retryable). `RETRYABLE_CLASSES` is the single list. Note the worst-case pending age of a retrying job is under 4 minutes, inside the 10-minute sweeper rule.

### 3.4 What `applyLlmFailure` releases per domain (existing behaviour, Phase 40 extraction)
| Route | Lock released | Player-visible message |
|-------|---------------|------------------------|
| `creation_race` | `character_creation_state.step -> AWAITING_RACE` | creation_error "Something went wrong in the cosmic machinery. Try again." |
| `creation_class` | step `-> AWAITING_ARCHETYPE` | same |
| `world_gen` | `retryWorldGen` resets `world_gen_state.step -> PENDING` (**see Open Question 3: must become `ERROR` + a player retry path**) | private/creation event "The Keeper falters..." |
| `skill_gen` | none needed (no lock row); message only | "Your potential eludes crystallization" (**see Open Question 1**) |
| `npc_conversation` | none; message + dialogue line | "<npc> seems distracted. Try again." |
| `combat_narration` | none; silent | none |
| `renown_perk_gen` | none; **currently nothing at all** | Add a one-line Keeper message or leave silent (dedupe frees on terminal status, so the next rank-up or a re-trigger works) |
| `smoke_test` | not applicable | admin status only |

The dedupe "lock" for every route is simply the active status of the `llm_job` row, so making the job terminal (`failed`/`expired`) is what unlocks the action. Apply failures use `errorCode = 'apply_error'` (plain string; `publicErrorBucket` maps unknown codes to `failed`).

### 3.5 Re-running apply from stored text
tx3 checks `job.status === 'received'` first (skips if the sweeper or another dispatch already handled it), increments `applyAttempts`, applies, sets `completed` in the same transaction. If tx3 throws, the procedure catches, runs tx3 once more from the stored `resultText` (`applyAttempts` 2), and on a second failure runs a small tx4: `applyLlmFailure` plus `failed`/`apply_error`. No second Anthropic call is ever made. The sweeper's "received for 60 s" rule follows the same counter: `applyAttempts < 2` re-applies, else fails in-voice.

## 4. Per-domain cutover map

Common enqueue contract (all domains): call the extended `enqueueLlmJob` inside the triggering reducer; on `refused` answer in voice and create nothing; on `created:false` treat as "already in progress" (no duplicate, no extra message beyond the domain's existing "patience" line). All `request` objects carry `input` plus the legacy keys below (strings for ids).

### 4.1 NPC chat (first)
- **Trigger:** `talk_to_npc` in `reducers/npc_interaction.ts` (replace the `llm_task.insert` at line ~99, the `checkBudget` at ~52 and the `incrementBudget` at ~113; note the old code double-counted). Move the `appendNpcDialog`/`appendPrivateEvent` player-line logging to after a successful enqueue so a refused or deduped message is not echoed.
- **Builder:** `buildNpcConversationVolatile(input: NpcConversationInput)`. Inputs the reducer already computes: `npc {name, npcType}`, `region`, `location`, `personality` (`parseNpcPersonality`), `affinityTier`, `memory` (parsed `memoryJson`), `completedQuestNames`, `activeQuestFromThisNpc`, `playerMessage` (tagged by the builder), `activeQuestCount`, `maxQuests`, `nearbyLocationNames`, `nearbyEnemies`, `recentQuestNames`. Snapshot as `input`.
- **Legacy keys for apply:** `characterId`, `npcId`, `memoryId` (strings).
- **Dedupe:** `SOURCE_KEYS.npcConversation(characterId, npcId, memory.lastUpdated micros)`. Compute the marker **after** `getOrCreateNpcMemory` so two racing tabs see the same value; the marker changes after each applied reply (`updateNpcMemory`). The Phase 40 note (`SOURCE_KEYS` comment) already says this.
- **Client:** `useNpcConversation.ts` already calls `talkToNpc` directly; only the doc comments mention `useLlmProxy`. No `prepare_*` call to delete. `App.vue`'s `isLlmProxyProcessing` (from `llm_task`) simply stays false, so the "processing" indicator no longer covers NPC replies until Phase 42's `useLlmStatus`. Note this in the plan; it is a cosmetic regression, not a break.
- **Literal allowlist:** `reducers/npc_interaction.ts` entry (1) goes to 0 and must be removed from `LEGACY_MODEL_LITERALS`.
- **Output shape caveat:** the route is a text route that returns prompt-instructed JSON parsed by `extractJson` in apply; a malformed reply already degrades to "mutters something unintelligible".

### 4.2 Combat narration (second)
- **Fact:** combat is real-time (`combat_loop`, 1 s tick, `COMBAT_LOOP_INTERVAL_MICROS`). The round-based engine (`resolve_round_timer` no-op, `createFirstRound` unused, "Post-Combat Summary (removed - LLM narration too slow)") is gone, so `triggerCombatNarration` (no callers) has no round to hang on. [VERIFIED: reducers/combat.ts:2696-2714, helpers/combat_narration.ts]
- **Recommendation (Claude's discretion):** narrate only the **outro** (`victory` and `defeat`), one job per combat, from `handleVictory` and `handleDefeat` in `reducers/combat.ts`. The intro stays static (`combat.ts:246`), and mid-combat "notable event" narration is deferred (it would need a new event model; `MAX_COMBAT_NARRATIONS`/`NARRATION_BUDGET_THRESHOLD` stay unused). This bounds spend to one call per fight and never touches the tick loop's hot path.
- **Where:** immediately **before** `clearCombatArtifacts(ctx, combat.id)` in both handlers (line ~2146 victory, ~2247 defeat), because that function deletes the `combat_participant` rows the summary needs. Build `RoundEventSummary` with `narrativeType: 'victory'|'defeat'`, `roundNumber: 0n`, `locationName`, `enemyNames`, `playerNames`, `deaths`, `participantHpSummary`; the outro builder only reads those. Wrap the whole hook in try/catch so a narration bug can never break combat resolution.
- **Player/identity:** charge and run as the combat leader's owner (`combat.leaderCharacterId` else the first participant), resolved with `resolveCharacterPlayerId` (IN-06 caveat: prefers the player whose `activeCharacterId` matches). `participantCharacterIds` (all participants) goes in `requestJson` for the broadcast.
- **Legacy keys for apply:** `combatId`, `roundNumber`, `narrativeType`, `participantCharacterIds`.
- **Dedupe:** `SOURCE_KEYS.combatNarration(combatId, 0, narrativeType)`.
- **Budget and skipping:** reserve like any job but on refusal (`daily_cost`, `daily_calls`, `phase_cap`, `busy`) return silently (no `fail`, no message).
- **Late-drop rule.** Two checks, both pure and unit-tested:
  1. Claim time: if `now - createdAt > 20 s` expire silently (no call, refund) so stale narration is never paid for.
  2. Persist time: if the result arrives more than 20 s after enqueue, do not apply (settle the cost, mark `expired`, `errorCode = 'late'`). For `narrativeType` `round` (unused now) additionally require the encounter to still be `active`.
  For victory/defeat the encounter is by definition already `resolved` when the job is enqueued, so "combat has ended" cannot be the drop criterion for outros; the age rule is. Detecting "ended" for future round narration: `ctx.db.combat_encounter.id.find(combatId)?.state !== 'active'` (states include `active` and `resolved`, see `combat.ts` lines 1346, 2146, 2247).
- **Attempts:** 1, no retry (`NO_AUTO_RETRY_ROUTES`). Cap rule: runs only if `inFlight < cap - 1`.
- **Client:** none. Result reaches players as `combat_narration` private events (existing `handleCombatNarrationResult`), which already falls back to raw text because the route is plain prose.
- **Literal allowlist:** `helpers/combat_narration.ts` (1) to 0. Delete `triggerCombatNarration`, `shouldNarrateRound`'s caller-less budget code paths only if tests allow; keep `handleCombatNarrationResult` and `sendNarrationSkippedMessage` (check callers).

### 4.3 Skills plus renown (third)
- **Skills trigger:** `apply_level_up` in `index.ts` (~lines 855-921): replace the block from "Auto-trigger skill generation" (`checkBudget` at ~864, `llm_task` insert at ~924) with `enqueueLlmJob`. Delete `prepare_skill_gen` (index.ts ~650-708) and the unused legacy prompt imports. Keep the `pending_skill` "already preparing" guard.
- **Builder:** `buildSkillGenVolatile(input: SkillGenInput)`: `characterName`, `race`, `className`, `archetype`, `level` (bigint), `existingAbilities` (from `ability_template.by_character`).
- **Archetype (hand-off, cheap):** `Character` has no `archetype` column, so today every prompt says "warrior". Derive it without a schema change: `character_creation_state.by_player.filter(playerId)` row's `archetype ?? 'warrior'` (the row persists with `step: COMPLETE`; `prepare_world_gen_llm` already reads it this way). Put it in one helper `archetypeForPlayer(ctx, playerId)` shared with world gen.
- **Legacy keys:** `characterId`. **Dedupe:** `SOURCE_KEYS.skillGen(characterId, newLevel)`.
- **Client:** `useSkillChoice.ts:54`: delete `requestSkillGen` (unused in `App.vue`, which destructures only `hasPendingSkills, pendingLevels, hasPendingLevels, chooseSkill, applyLevelUp`) and its return entry.
- **Renown:** already enqueues through `enqueueLlmJob` (`helpers/renown.ts`); no reducer change. The executor's first run must process the Phase 40 pending jobs, which have **no dispatch row**: the sweeper's "pending with no dispatch row -> insert one" rule covers them (Section 6). Their `requestJson` lacks `input`; `resolveRouteInput` rebuilds it from the legacy keys plus the character name. Renown expiry is 24 h, not 10 min.
- **Renown apply fix (hand-off):** `applyRenownPerkResult`'s static fallback still calls `JSON.stringify(perk.effect)` on bigint effects and throws for ranks 2, 3, 5, 9, 11, 12, 13, 14. Export the existing `serializePerkEffect` (`helpers/renown.ts`, currently module-private) or move it to a small pure module, use it in `llm_apply.ts`, and update the pinned characterization test and snapshot **deliberately** (the test that pins the throw becomes a test that pins the serialized output).
- **Literal allowlist:** `index.ts` loses 2 (both `gpt-5-mini` for skill gen).

### 4.4 Creation (fourth)
- **Trigger:** `submit_creation_input` in `reducers/creation.ts`: at `case 'AWAITING_RACE'` (step -> `GENERATING_RACE`, line ~423) and `case 'AWAITING_ARCHETYPE'` (step -> `GENERATING_CLASS`, line ~447). Move the `race_definition` reuse short-circuit from `prepare_creation_llm` (index.ts ~421-450) into a small helper called from the race case, so an existing race never calls the model.
- **Refusal handling:** no character exists yet, so use `appendCreationEvent(ctx, ctx.sender, 'creation_error', <in-voice line>)` and revert the step to the awaiting step (do not leave `GENERATING_*` without a job). `fail(ctx, character, ...)` applies only where a character exists.
- **Builders:** `buildCreationRaceVolatile({ raceDescription })`; `buildCreationClassVolatile({ raceName, raceNarrative, archetype })`.
- **Legacy keys:** none (apply finds the state by `by_player`). **Dedupe:** `SOURCE_KEYS.creation(creationState.id, 'race'|'class')`; `characterId` stays `0n`.
- **Never auto-retry:** `creation_race`, `creation_class` in `NO_AUTO_RETRY_ROUTES`; any failure runs `applyLlmFailure`, which reverts the step and posts the in-voice "Try again", so the next `submit_creation_input` is the player action.
- **Validator gap (hand-off):** add `helpers/creation_validate.ts` and call it from `applyCreationResult` before writing the state:
  - Race: `bonuses.primary.stat` and `secondary.stat` must be in `STAT_TYPES` (default `str`/`dex`), values clamped to the prose ranges (primary about 1-3, secondary 1-2; prose says "typically 2 and 1"), `raceName` trimmed and length-capped.
  - Class: `stats.primaryStat`/`secondaryStat` in `STAT_TYPES`; `bonusHp` 0-20, `bonusMana` 0-30; `weaponProficiencies` filtered to `WEAPON_TYPES`, `armorProficiencies` to `ARMOR_TYPES` (cloth is added later by `finalizeCharacter`); each ability: `kind` in `ABILITY_KINDS`, `damageType` in `DAMAGE_TYPES`, `resourceType` in `RESOURCE_TYPES`, `targetRule` in `TARGET_RULES`, `cooldownSeconds` 4-12, `resourceCost` per type (mana 10-30, stamina 5-15, none 0), mana `castSeconds >= 1`, and `value1`/`effectMagnitude` through the existing `clampToBudget(kind, 1, ...)` in `skill_budget.ts` rather than a new table. Clamp and default; do not reject (the v2.0 skill validator's policy).
  - Update the two "Phase 41: validator gap" tests in `submit_llm_result.characterization.test.ts` deliberately (they currently assert 99, 'nonsense', 99999, 9999 survive) and refresh the snapshot.
- **Client:** `useCharacterCreation.ts:127` delete the `prepareCreationLlm` call and the `preparedForStep` bookkeeping, keep `isCreationLlmProcessing` (it derives from `step`, so it survives a refresh, which satisfies PIPE-02's UI half).
- **Literal allowlist:** `index.ts` loses 1 more (`gpt-5.4` creation).

### 4.5 World generation (fifth)
- **Trigger sites (three, all create `world_gen_state` PENDING):** `reducers/creation.ts` `finalizeCharacter` (first region, `sourceRegionId 0n`), `helpers/travel.ts:272`, `reducers/intent.ts:1409` (`explore` retry). Extract `prepare_world_gen_llm`'s body (index.ts ~478-647) into `startWorldGeneration(ctx, genState)` in `helpers/world_gen.ts` (the starter-region reuse short-circuit stays), call it from all three sites right after the insert, and delete the reducer. The helper sets `GENERATING`, snapshots the input, enqueues. Refusal: set `world_gen_state.step = 'ERROR'` with a message and append the existing in-voice line ("The Keeper strains but cannot shape this realm right now. Type [explore] to try again later.").
- **Builder:** `buildWorldGenVolatile({ worldContext: '', characterRace, characterClass, characterArchetype, sourceRegionName, neighborRegions })` where `neighborRegions = buildRegionContext(ctx, sourceRegionId)` (already returns `{name, biome, threats}[]`) and the archetype comes from `archetypeForPlayer`.
- **Legacy keys:** `genStateId` (string). **Dedupe:** `SOURCE_KEYS.worldGen(genState.id)`.
- **Never auto-retry** (`world_gen` in `NO_AUTO_RETRY_ROUTES`, one attempt, 150 s timeout). Failure path: **change `retryWorldGen` to set `ERROR`, not `PENDING`** (see Open Question 3). `PENDING` meant "the client will call prepare again", which is exactly the unbounded auto-retry the phase forbids. `travel.ts`/`intent.ts` already treat `ERROR` states as retryable (`.find(s => s.step !== 'ERROR')`). The first-region case (`locationId 0n`) has no `explore` target: decide the player action in Open Question 3.
- **Client:** `useWorldGeneration.ts:49` delete the `watch` that calls `prepareWorldGenLlm` and `preparedGenStateId`; keep `activeGeneration` and `isWorldGenProcessing`. `App.vue` keeps passing `connActive` (the parameter may stay unused).
- **Literal allowlist:** `index.ts` reaches 0; remove the entry. Also delete `buildRegionGenerationUserPrompt` and friends from the `index.ts` import list (they are then unused).

### 4.6 Not changed in Phase 41
`reducers/llm.ts` `validate_llm_request` (uses `gpt-*` literals, called only by the dead `src/composables/useLlm.ts`, which vue-tsc type-checks). Deleting the reducer would break `vue-tsc` unless the composable goes too. Leave both and their two allowlist entries for Phase 42. `LlmBudget`, `checkBudget`, `incrementBudget`: leave the calls inside `llm_apply.ts` (they only write the dead `llm_budget` table) to avoid re-pinning about 29 characterization expectations; Phase 42 removes them with the table.

## 5. Budget and cost

**Pricing (verified this session):** Sonnet 5.5 is $2.00 / $10.00 per MTok input/output and $0.20 per MTok cache reads; cache writes are 1.25 times input, $2.50 [VERIFIED: claude-api skill; CITED write multiplier]. `CLAUDE_PRICE_MICRO_USD_PER_TOKEN` in `measurement.ts` matches (`input 2, output 10, cacheWrite 2.5, cacheRead 0.2`). $ per MTok equals micro-USD per token.

**Discrepancy to resolve:** CONTEXT says "prompt chars / 3.25". The existing tested helper `reserveCostMicroUsd(maxTokens, requestChars)` uses `Math.ceil(requestChars / 3)` (more conservative). **Use the helper unchanged.** Typical reservations: NPC about $0.02, creation about $0.05, world_gen about $0.10 (max_tokens dominates), so $1/day allows several concurrent worst-case reservations, and reservations release on settle.

**Tables (new, private):**
```typescript
LlmPlayerBudget  { name:'llm_player_budget', indexes:[by_player(playerId)] }
  id u64 pk autoInc, playerId identity, dayUtc string, reservedMicroUsd u64, spentMicroUsd u64, calls u64
LlmSpend (singleton id 1n) { spentMicroUsd u64, reservedMicroUsd u64, calls u64, updatedAt timestamp }   // hard phase-cap ledger
```
One row per player per UTC day, found with `by_player.filter(playerId)` plus a `dayUtc` match in code (no multi-column index; the mock does not support them). The sweeper deletes rows older than 2 days. Reuse `utcDateString` from `helpers/llm.ts`.

**Flow (module `helpers/llm_budget.ts`, duck-typed, inside the caller's tx):**
1. `reserve(ctx, {playerId, route, requestChars, mode: 'player' | 'phase_only'})`: `res = reserveCostMicroUsd(LLM_ROUTES[route].maxTokens, requestChars)`. Refuse when player `spent + reserved + res > 1_000_000n`, or player `calls >= 200n`, or ledger `spent + reserved + res > PHASE_SPEND_CAP_MICRO_USD (2_000_000n)`. On success add to both, `calls += 1`, and return `{ reservedMicroUsd, budgetDay }` for the job row. `mode: 'phase_only'` is for admin smoke jobs (they count against the hard cap, not a player's day).
2. Settle in tx2 (Section 3.2); release is Pattern 3.
3. Full refund of a never-billed job also decrements `calls` (an outage must not burn a player's 200 calls). Recommendation; small deviation, note it in the plan.

**Where the check lives:** enqueue (refusal to the player) **and** the claim tx (fails a job with `billing` if the ledger is exhausted meanwhile). The cap is a code constant in `data/llm_limits.ts` (no reducer can change it, as in the spike); Phase 43 replaces it with the configurable ceiling. A local `--clear-database` resets the ledger, so the runbook tells the user to keep a running total from the admin status view when they clear.

**Replaces `LlmBudget`/`checkBudget`:** the six legacy `checkBudget` call sites (index.ts x4 including the ones deleted with `prepare_*`, `npc_interaction.ts`, `combat_narration.ts`) disappear as each domain moves; `reducers/llm.ts` keeps its dead one until Phase 42.

## 6. Sweeper

- **Schedule:** `LlmSweepTick { scheduledId, scheduledAt }` (private) and `spacetimedb.reducer({ name: 'llm_sweep', onSchedule: LlmSweepTick }, { arg: LlmSweepTick.rowType }, fn)`. Existing repeating schedules in this repo (`sweep_inactivity`, `sweep_llm_errors`, `regen_health`) all re-insert their own row with `ScheduleAt.time(now + interval)` from inside the reducer; `ScheduleAt.interval` also exists in the API but is not used here, so follow the repo pattern. Interval `30_000_000n` micros.
- **Getting it started on an existing DB:** `initScheduledTables` only runs on `init` and admin resync, and `init` does not re-run on a non-clearing publish. Add `ensureLlmSweepScheduled(ctx)` (same idempotent "insert if the table has no rows" shape as `ensureLlmCleanupScheduled`) to `initScheduledTables`, to `clientConnected` (index.ts:969), **and** to `enqueueLlmJob` (CLI-called admin reducers do not fire `clientConnected`).
- **Body (`sweepLlmJobs(ctx)`):** insert the next tick first, then per job in try/catch:
  - `in_flight` where `now - startedAt > route.timeoutMs + 30 s`: release reservation, `expired`, `errorCode 'timeout'`, run `applyLlmFailure`.
  - `received` where `now - startedAt(or finishedAt) > 60 s`: if `applyAttempts < 2` re-run apply from `resultText` in the same tx (set `completed`), else `failed`/`apply_error` + `applyLlmFailure`.
  - `pending` where `now - createdAt > 10 min` (`renown_perk_gen`: 24 h): release, `expired`, `applyLlmFailure`.
  - `pending` with no `llm_dispatch` row (`by_job` index): insert one at `max(now, nextAttemptAt)`. This is how the Phase 40 renown jobs get their first run and how a lost dispatch self-heals.
  - prune `llm_player_budget` rows older than 2 days. Optionally prune terminal jobs older than a retention window (Open Question 6).
- Each expiry posts through `applyLlmFailure` (Keeper message, lock release) and refunds via the idempotent release. The dedupe starvation of IN-07 is solved because a stuck active job becomes terminal.

## 7. Key, status, smoke test, runbook

**Admin identity finding (blocking for the key script).** `spacetime login show` reports the CLI identity `c200252497b98fff5aab75f8fbc675956b5a12a5b85042ab355d3a05c6ab7d6e` (also the DB owner and the identity seen on maincloud in Phase 39). `data/admin.ts` `ADMIN_IDENTITIES` contains only `c20006ce5893...` (the browser identity). So `spacetime call uwr set_api_key ...` currently throws "Admin only". Phase 39 avoided this with a separate CLI-identity check and left `admin.ts` untouched. **Recommendation:** add the CLI identity to `ADMIN_IDENTITIES` (it is public identity data, not a secret, and it already owns the database). This also lets the live-proof script act as admin **and** own a character (the existing admin test reducers `grant_test_renown` and `level_character` call `requireCharacterOwnedBy`). Add a test pinning the set. [VERIFIED: `spacetime login show`, `data/admin.ts`, 39-SPIKE-RECORD]

**`scripts/llm/set-key.mjs` (restore and adapt from `git show e5f414d9^:scripts/spike/set-key.mjs` + `cli.mjs`).**
- Keep from the spike: read the key with `util.parseEnv` from `spacetimedb/.env.local` **inside the script** (never `process.env`, never by an agent), format check by prefix and length only, `--dry-run` prints presence and length only, exit codes 0/1/2.
- Change: the spike passed the key as an argument of `spacetime call` (`spawnSync`, `shell:false`), so it was invisible to shell history and output but present in the child's argv. `spacetime call` has no stdin option [VERIFIED: `spacetime call --help`]. To satisfy "not in argv", call the documented HTTP API instead: `POST <server>/v1/database/uwr/call/set_api_key`, `Authorization: Bearer <token>`, body `JSON.stringify([key])` [CITED: spacetimedb.com/docs/http/database]. Obtain the token in-process with `spawnSync('spacetime', ['login','show','--token'])` and never print it. Report only HTTP status, then confirm through `llm_admin_state` (`keySet`, `keyLength`) via the `/sql` endpoint (the owner can read private tables [CITED]). Refuse any `--server` except local unless the user passes an explicit maincloud flag; Claude never runs it against maincloud.
- The identity behind the CLI token equals the CLI identity: [ASSUMED, verify with a `whoami`-style log line or `SELECT` of the sender in the first run].
- Server side: `set_api_key` (reducers/llm.ts) also updates `llm_admin_state` (`keySet`, `keyLength`, `keyUpdatedAt`, clears `keyVerifiedAt`) and logs only `len`. The key never appears in a return value or row outside `llm_config`.

**Key status.** Singleton private table `llm_admin_state` (id `1n`): `keySet bool`, `keyLength u64`, `keyUpdatedAt`, `keyVerifiedAt optional`, `keyLastCheckOk bool`, `lastSmokeAt optional`, `lastSmokeJson string` (a redacted, size-capped summary, at most 4 KB). "Valid" = `keyLastCheckOk && keyVerifiedAt >= keyUpdatedAt`; the executor sets `keyLastCheckOk = false` on any `auth`/`billing` failure and the smoke `smoke_test` success sets it true. Expose it through view `admin_llm_status` (`t.row('AdminLlmStatus', {...})`, `ctx.db.llm_admin_state.id.find(1n)`, returns `[]` unless `ADMIN_IDENTITIES.has(ctx.sender.toHexString())`; primary-key lookup, no scan). The view never reads `llm_config`. Views declared `public: true` are visible to any subscriber, so the emptiness for non-admins is the control; add a view test with a non-admin sender. `spacetime sql uwr "SELECT * FROM llm_admin_state"` also works for the owner.

**Smoke test (`llm_smoke_test`, admin reducer in `reducers/llm_admin.ts`).** `requireAdmin`, then enqueue 6 jobs as the caller: `smoke_test` plus one minimal call for each of `creation_race`, `creation_class`, `world_gen`, `skill_gen`, `renown_perk_gen`, with source keys `smoke:<route>` (extend `SOURCE_KEYS.smokeTest(label?)`), `mode: 'phase_only'` budget, and `requestJson.smoke = true`. The executor **skips apply** for smoke jobs (they must not write game state) but still classifies against the route's schema check, so a passing JSON route proves the grammar compiled (this warms Anthropic's 24 h grammar cache for each schema; the Phase 39 region schema compiled on 2.10.1). On completion it appends one line per route to `lastSmokeJson` (route, ok/class, latency, four token counts, cost) and, for `smoke_test`, sets `keyVerifiedAt`. Cost note: reservations are at `max_tokens` (world_gen about $0.10), actual about $0.05-0.08 per run. Minimal inputs per route need small fixed `input` objects (add a `smokeInputFor(route)` table in `llm_inputs.ts`; the volatile builders already accept minimal data).
- One log line per call in the module log (route, class, status, ms, tokens, no text), redacted with the key as a needle. The runbook uses `spacetime logs uwr`.

**`docs/runbooks/llm-key.md` outline:** prerequisites (CLI login identity is admin; use a dedicated Anthropic Console workspace); set the workspace spend limit in the Anthropic Console (the interim cost guard until COST-03); first-time setup (`node scripts/llm/set-key.mjs --dry-run`, then real, then `spacetime sql` status, then `llm_smoke_test` and read `lastSmokeJson`); rotation (edit `.env.local`, re-run the script, re-run smoke, revoke the old key in the Console); **recovery after `--clear-database`** (wipes `llm_config` and the spend ledger; re-run the script, re-run smoke, record the previous ledger total); what never to do (no key in argv, chat, commits, `spacetime logs` shares; no maincloud from an agent); symptoms table (auth -> key invalid; billing -> workspace limit; `overloaded` -> wait); where results live (`admin_llm_status`, `llm_call_log` via sql); maincloud is a user-only manual step.

## 8. Live proof, local and maincloud

**Local (Claude-run after the user sets the key, `checkpoint:human-action` first).** A Node script `scripts/llm/prove-live.ts` using the repo's generated bindings (`src/module_bindings`, Node 22 has global `WebSocket`; the Phase 39 harness proved the same SDK against a local database) connects with the CLI token (`withToken`), calls the real player reducers, and reads results from public tables and `my_llm_jobs`:
1. `login_email` -> `start_creation` -> `submit_creation_input` (race text; then `Warrior`; then an ability name; then a name; then `confirm`). Two real creation calls plus (after finalize) the world_gen call in one path, because `finalizeCharacter` triggers the starter region.
2. NPC: `talk_to_npc` at the starting location (the first safe location has vendor and banker NPCs by the world-gen rules).
3. Combat narration: `start_pull` (or `start_combat`) against a spawn at the location, let auto-attack resolve, wait for the encounter to become `resolved`, then a narration event appears.
4. Renown: `grant_test_renown` (existing admin reducer) with enough points to cross rank 2.
5. Skills: requires `pendingLevels >= 1`; no existing admin reducer sets it (`level_character` sets `level`/`xp` but not `pendingLevels`). Add a tiny admin `grant_test_pending_level` alongside `grant_test_renown`, then `apply_level_up`.
6. After each step read `llm_call_log` (via `/sql`) to assert usage recorded, and print only the admin status: spend ledger, ok/fail, latencies. Hard stop when the ledger reaches the phase cap. Never print the token, key, prompts or completions beyond a short reply excerpt.
Budget estimate for the whole local proof plus one smoke run: about $0.2, far below the $2 cap.

**Manual maincloud checklist (Claude writes, user runs).** Claude never publishes or calls maincloud.
1. Confirm `spacetime server list` default and that `spacetimedb/.env.local` has the key (user's eyes only).
2. User publishes (`pnpm spacetime:publishprod`); the first maincloud publish after the 2.10 upgrade re-creates 14 views and needs `--break-clients` (STATE.md); Phase 40 and 41 tables are all new there.
3. Set the key with the script against maincloud (user-run), then `llm_smoke_test`; read `admin_llm_status`/`lastSmokeJson`: all six ok, region schema compiled.
4. One action per domain in the browser (create, explore, NPC chat, one fight, one level-up, one renown grant) with the browser network tab open: no request to Anthropic or any proxy (success criterion 2).
5. Re-check the Phase 39 gate thresholds against what is observable: **dispatch p95 < 250 ms** (from `llm_call_log.dispatchLateMs`), **zero reliability failures** across the run, **region schema compiles** (world_gen ok). Ping and tick p95 at most 2x baseline (baseline maincloud ping p95 34.3 ms, tick p95 2.72 ms) need the Phase 39 measurement harness (in git at `e5f414d9^`) or a qualitative check (combat feels normal while a world_gen call is in flight). Ask the user which level of proof they want (Open Question 7). A failure reopens the executor decision.
6. Record results in a redacted `41-MAINCLOUD-PROOF.md`.

## 9. Phase 40 hand-offs (all folded in)

| Item | Where | Action |
|------|-------|--------|
| Bigint-safe renown fallback | `llm_apply.ts` `applyRenownPerkResult` static branch | Use shared `serializePerkEffect`; flip the pinned "throws" characterization test to pin the serialized output; refresh `submit_llm_result.characterization.test.ts.snap` deliberately |
| Creation clamp/validate | `llm_apply.ts` + new `helpers/creation_validate.ts` | Section 4.4; flip two "Phase 41: validator gap" tests |
| `toBigIntSafe` (IN-01) | `llm_apply.ts` quest fields `requiredCount`, `rewardXp`, `rewardGold`, `targetCount` use `BigInt(effect.x \|\| ...)` on model values (a fractional or non-finite value throws and rolls back the whole apply) | Add a pure `toBigIntSafe(value, {min, max, fallback})` (finite, integer via floor, clamp) and use it there and in the renown insert (`BigInt(Number(perk.x) \|\| 0)` is safe for NaN but not for Infinity or fractions) |
| Redaction needles (IN-04) | `claude_request.ts` `safeMessage` uses `redactSecrets(raw)` with no needle | Add optional `{ needles }` to `classifyClaudeResponse`/`classifyClaudeError`, pass `[apiKey]` from the executor; also pass needles to `logLlmCall`. Test: a failure body that echoes a non-`sk-ant-` key string is redacted |
| Dedupe starvation (IN-07) | | Sweeper (Section 6) |
| Missing archetype | | `archetypeForPlayer` helper (no schema change) |
| IN-03 | `classifyClaudeResponse` calls `res.text()` unguarded | Executor wraps classify in try/catch and falls back to `classifyClaudeError` |
| IN-02, IN-05 | | Executor always builds layers from its own resolvers; `logLlmCall` already redacts `errorMessage`; other fields are fixed enums or numbers |
| IN-06 | `resolveCharacterPlayerId` | Prefer the acting/leader character's active player for narration (already prefers `activeCharacterId`) |
| IN-08, IN-09, IN-10, IN-11, IN-12 | test hygiene | Optional; do IN-11 (strict mock: `filter` only on btree accessors, `count` allowed) only if it blocks new tests |

## 10. Client build after the bindings regenerate

- **Baseline:** on the current tree `pnpm exec vue-tsc -b` prints no errors (about 33 s) and `pnpm build` (`vue-tsc -b && vite build`) succeeds (about 35 s) [VERIFIED: ran both today]. So there are **zero pre-existing client type errors** to excuse. The module's own `npx tsc --noEmit` has 236 pre-existing errors (Phase 40), so it is not a gate.
- **Bindings:** `spacetime generate` removes `prepare_creation_llm_reducer.ts`, `prepare_skill_gen_reducer.ts`, `prepare_world_gen_llm_reducer.ts` from `src/module_bindings/` (currently present, tracked) and adds `admin_llm_status_table.ts`; regenerate with `pnpm spacetime:generate` and commit; never hand-edit.
- **Files that must change in the same plan as each reducer deletion:** `src/composables/useCharacterCreation.ts` (line 127), `src/composables/useSkillChoice.ts` (line 54, `requestSkillGen`), `src/composables/useWorldGeneration.ts` (line 49). `useNpcConversation.ts` and `App.vue` need no code change (`useLlmProxy` stays mounted and idle; `llm_task` rows are purged at the end). `src/composables/useLlm.ts` calls `validateLlmRequest`, which stays.
- **Gate per domain plan:** `pnpm spacetime:generate` then `pnpm build`. Because the bindings directory is generated, do the regeneration in each domain plan's final task, sequentially.

## 11. Plan decomposition (Phase 40 took 10 plans; suggest 13-14 in 6 waves)

Shared hotspots that **must not be edited by parallel plans**: `spacetimedb/src/schema/tables.ts`, `spacetimedb/src/index.ts`, `spacetimedb/src/reducers/index.ts`, `spacetimedb/src/helpers/test-utils.ts`, `spacetimedb/src/data/model_literals.test.ts`, `helpers/llm_apply.ts` with its characterization test and snapshot, `helpers/llm_queue.ts`, `helpers/scheduling.ts`, and the generated `src/module_bindings/`.

| Wave | Plan | Scope | Files owned |
|------|------|-------|-------------|
| 1 | 41-01 Foundation | `data/llm_limits.ts`; all new tables, `llm_job`/`llm_call_log` columns, indexes, schema list; stub `register*` files wired into `reducers/index.ts`; `test-utils` extensions (see below); privacy test update (`llm_privacy.test.ts` public set stays `['llm_task']`, new tables private); `ADMIN_IDENTITIES` gets the CLI identity | `schema/tables.ts`, `reducers/index.ts`, `test-utils.ts`, `llm_privacy.test.ts`, `data/admin.ts`, new stubs |
| 2 (parallel) | 41-02 Budget module + tests | `helpers/llm_budget.ts` | new files only |
| 2 | 41-03 Apply and request hardening | `serializePerkEffect`, `toBigIntSafe`, `creation_validate.ts`, needles (IN-04), `res.text()` guard, flipped characterization tests and snapshot | `llm_apply.ts`, `claude_request.ts`, characterization test/snap |
| 2 | 41-04 Retry, inputs, sweeper pure helpers | `llm_retry`, `llm_inputs.ts` (+ golden equality test), `llm_sweeper.ts` bodies | new files only |
| 3 | 41-05 `enqueueLlmJob` extension + executor + registration | dispatch row, reserve, refusal result, per-player active cap (3, non-narration), ensure sweeper; `helpers/llm_executor.ts`; `reducers/llm_executor.ts`; fetch-guard test now exempts only the executor | `llm_queue.ts`, `scheduling.ts`, new executor files, `model_literals.test.ts` (fetch guard part only) |
| 4 | 41-06 Sweeper reducer + admin tooling | `reducers/llm_sweeper.ts`, `reducers/llm_admin.ts` (smoke, status, `grant_test_pending_level`), `set_api_key` extension, `admin_llm_status` view, `scripts/llm/set-key.mjs`, runbook | runs after 41-05 (uses the executor's smoke handling); `reducers/llm_sweeper.ts`, `reducers/llm_admin.ts`, `reducers/llm.ts`, `views/llm.ts`, scripts, runbook |
| 5 (sequential) | 41-07 NPC | Section 4.1 | `npc_interaction.ts`, allowlist, tests |
| 5 | 41-08 Combat narration | Section 4.2 | `combat_narration.ts`, `reducers/combat.ts`, allowlist |
| 5 | 41-09 Skills + renown | Section 4.3 | `index.ts`, `useSkillChoice.ts`, allowlist, regenerate bindings, `pnpm build` |
| 5 | 41-10 Creation | Section 4.4 | `reducers/creation.ts`, `index.ts`, `useCharacterCreation.ts`, allowlist, bindings, build |
| 5 | 41-11 World gen | Section 4.5 (touches creation.ts, travel.ts, intent.ts, world_gen.ts, index.ts) | as listed, allowlist to empty for `index.ts`, bindings, build |
| 6 | 41-12 Purge + live-proof harness | admin `purge_llm_tasks` reducer (code-only), `scripts/llm/prove-live.ts`, doc updates | `reducers/llm_admin.ts`, script |
| 6 | 41-13 `checkpoint:human-action` local | user sets key; Claude runs smoke + one action per domain within the $2 cap | none (records results) |
| 6 | 41-14 Maincloud checklist + `checkpoint:human-action` | `41-MAINCLOUD-CHECKLIST.md`; user runs; Claude records results and re-checks gate | docs only |

The domain plans are sequential because each edits `model_literals.test.ts` (an allowlist that fails if a site loses a literal without its entry being removed) and three of them edit `index.ts` and regenerate bindings. `test-utils` extensions to make in 41-01: (a) `MockReply.advanceMicros` so a scripted fetch can move the clock (needed for the 20 s narration drop and timeout latency), (b) `databaseIdentity` already exists, (c) allow `count` or leave it banned, (d) `INDEX_TO_COLUMN` already maps `by_job`, `by_status`, `by_dedupe_key`, `by_player`; add none unless a new accessor name appears.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cost estimate/settle | New pricing tables or maths | `reserveCostMicroUsd`, `settleCostMicroUsd`, `estimateCostMicroUsd` (`measurement.ts`) | Tested in Phase 39/40 with all four usage fields |
| Secret redaction | Custom regex | `redactSecrets(text, needles)`, `findSecretLeaks` | Merges overlapping matches so a cut can never leave half a key |
| Request body and headers | String templates | `buildClaudeRequest`, `buildClaudeHeaders` | Guards forbidden keys and the cache layout; the key appears only in the header |
| Response classification | Status-code `if` chains | `classifyClaudeResponse`, `classifyClaudeError`, `RETRYABLE_CLASSES` | 14 classes, allowlisted stop reasons, spend-cap 429 handled |
| Dedupe | Per-reducer pending checks | `enqueueLlmJob` (`by_dedupe_key`, active statuses) | Two-tab dedupe already proven |
| Apply logic | New per-domain writers | `applyLlmResult` / `applyLlmFailure` | Extracted verbatim with 120 characterization cases |
| Timers/scheduling | A polling loop | `ScheduleAt.time` rows | Procedures cannot sleep |
| Random jitter | `Math.random` | Deterministic hash of `jobId` and `attempt` | Deterministic rule (CLAUDE.md), testable |
| Key transport | Argv | HTTP API with Bearer token | Keeps the key out of process listings |
| Anthropic client | `@anthropic-ai/sdk` | Raw HTTP via the pure builder | The SDK cannot run inside a module |
| Skill/creation numeric clamping | New budget tables | `clampToBudget`, `processGeneratedSkill` (`skill_budget.ts`) | Existing v2.0 validator policy |

**Key insight:** the value of this phase is composing tested seams; every place that tempts a bespoke piece (counter rows, retry loops, cost maths, redaction) already has a tested primitive or is deliberately a derived value.

## Runtime State Inventory

Phase 41 is not a rename, but it deletes reducers and purges a table, so the categories are answered explicitly.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Existing `llm_task` rows (public, contain prompts); `llm_budget` rows; local `llm_job` rows (possibly Phase 40 renown jobs); `llm_config` row 1 with the Phase 39 placeholder key | Code edit: admin `purge_llm_tasks` reducer at the end (code-only publish). Data: local `--clear-database` is allowed for the schema change and wipes the key, so re-set it. Pre-existing pending renown jobs are handled by the sweeper (no dispatch row) |
| Live service config | `llm-proxy/` Cloudflare Worker and browser `localStorage.llm_proxy_secret` | None this phase; both go idle and are removed in Phase 42 |
| OS-registered state | None (no tasks embed LLM names) | None |
| Secrets/env vars | `spacetimedb/.env.local` `ANTHROPIC_API_KEY` (user-supplied, never read by agents); `llm_config` row; `llm-proxy/.dev.vars` (OpenAI, obsolete) | User sets the key; script reads it in-process |
| Build artifacts | `src/module_bindings/` tracked: three `prepare_*_reducer.ts` files disappear, `admin_llm_status_table.ts` appears; `spacetimedb/dist` ignored | Regenerate and commit per domain plan |

## Common Pitfalls

### Pitfall 1: Losing the schedule by throwing
**What goes wrong:** the sweeper or `llm_run` throws after its schedule row was consumed; the transaction rolls back including the self-reschedule; the sweeper never runs again.
**How to avoid:** insert the next tick first, catch per job, log redacted; for `llm_run`, a failure between claim and persist leaves `in_flight`, which the sweeper expires.
**Warning signs:** `llm_sweep_tick` empty while jobs are stuck; the ensure-on-enqueue hook repairs it.

### Pitfall 2: Double release or double settle
**What goes wrong:** sweeper refunds a job whose procedure later finishes, double-crediting a player.
**How to avoid:** Pattern 3 (job row is the reservation source of truth, release sets it to `0n`); tx2 guards on `status === 'in_flight'` and the same `attempt`; test both orders.

### Pitfall 3: Old `llm_budget` bookkeeping kept in apply
**What goes wrong:** developers delete `incrementBudget` from `llm_apply.ts` and break ~29 pinned expectations and the snapshot for no functional gain.
**How to avoid:** leave those calls; Phase 42 removes the table and them together. Do not treat `llm_budget` as the budget of record.

### Pitfall 4: A pending job with no dispatch row waits forever
**What goes wrong:** the Phase 40 renown jobs (and any lost dispatch) never run because nothing schedules them.
**How to avoid:** sweeper rule "pending without dispatch -> insert dispatch"; test with a seeded pending job.

### Pitfall 5: Retrying creation or world_gen
**What goes wrong:** a failed world_gen returns to `PENDING`, and nothing calls prepare any more (or, worse, a future client does, looping).
**How to avoid:** `NO_AUTO_RETRY_ROUTES`; failure -> `ERROR` plus an explicit player action; test that a timeout on world_gen does not create a second dispatch.

### Pitfall 6: Building the narration summary after combat cleanup
**What goes wrong:** `clearCombatArtifacts` deletes `combat_participant` rows, so the outro has no names or HP.
**How to avoid:** build the summary and enqueue before that call; wrap in try/catch.

### Pitfall 7: `withTx` re-runs and outer variables
**What goes wrong:** the callback runs twice and the second run's early return leaves a stale flag from the first.
**How to avoid:** reset locals at the top of each callback; return a plain object; test with `withTxReinvoke: 1` (end state and fetch count identical).

### Pitfall 8: The fetch guard test blocks the executor
`model_literals.test.ts` currently bans any `fetch`/`ctx.http` reach under `spacetimedb/src` except `test-utils.ts`. Update it to exempt exactly `helpers/llm_executor.ts` and to assert no other production file reaches fetch.

### Pitfall 9: Schema changes on the local DB
New columns on an existing table without defaults fail a non-clearing publish; the user allows a local clear. Use `.default()` where cheap; run `spacetime build -p spacetimedb` and a `spacetime generate --out-dir <tmp>` privacy check (`llm_*` tables absent from bindings except `llm_task`, `my_llm_jobs`, the admin view) before publishing.

### Pitfall 10: Mock db silently hides column typos
The strict mock (`strict: true`, load `../schema/tables` first) and `rowColumnProblems` catch unknown columns; opt every new test in, as the Phase 40 tests do.

### Pitfall 11: Memory pressure
Run vitest with `--maxWorkers=1`; per-file runs if the host is starved. Loading `index.ts` under the recorder needs a 60 s timeout.

## Code Examples

### Claim transaction (tx1)
```typescript
// Source: promoted from helpers/llm_seam.test.ts runJobOnce + the cap rules above
const claim = ctx.withTx((tx: any) => {
  const job = tx.db.llm_job.id.find(arg.jobId);
  if (!job || job.status !== 'pending') return { kind: 'skip' as const };
  const now = tx.timestamp.microsSinceUnixEpoch;
  if (job.nextAttemptAt && job.nextAttemptAt.microsSinceUnixEpoch > now) {
    return { kind: 'redispatch' as const };                          // early dispatch: insert a new row at nextAttemptAt
  }
  const cfg = LLM_ROUTES[job.route];
  if (job.route === 'combat_narration' && now - job.createdAt.microsSinceUnixEpoch > NARRATION_MAX_AGE_MICROS) {
    expireSilently(tx, job); return { kind: 'expired' as const };
  }
  const inFlight = [...tx.db.llm_job.by_status.filter('in_flight')].length;
  const limit = job.route === 'combat_narration' ? LLM_MAX_IN_FLIGHT - 1 : LLM_MAX_IN_FLIGHT;
  if (inFlight >= limit) { insertDispatch(tx, job.id, now + deferMicros(job)); return { kind: 'deferred' as const }; }
  const key = tx.db.llm_config.id.find(1n)?.apiKey ?? '';
  if (!key) { failJob(tx, job, 'auth'); return { kind: 'failed' as const }; }
  const attempt = job.attempt + 1n;
  tx.db.llm_job.id.update({ ...job, status: 'in_flight', attempt, startedAt: tx.timestamp, nextAttemptAt: undefined });
  return { kind: 'run' as const, job: { ...job, attempt }, apiKey: key, input: resolveRouteInput(tx, job) };
});
```

### Fetch, classify (no transaction open)
```typescript
// Source: 39 spike + claude_request.ts. Date.now() is acceptable here (procedure, outside withTx).
const layers = buildRouteLayers(route, claim.input);
const request = buildClaudeRequest(route, layers);
const t0 = Date.now();
let result: ClaudeResult; let httpStatus = 0;
try {
  const res = ctx.http.fetch(ANTHROPIC_MESSAGES_URL, {
    method: 'POST', headers: buildClaudeHeaders(claim.apiKey), body: request.bodyText,
    timeout: TimeDuration.fromMillis(request.timeoutMs),
  });
  httpStatus = res.status;
  result = classifyClaudeResponse(route, res, { needles: [claim.apiKey] });   // needles: new optional arg (IN-04)
} catch (err) {
  result = classifyClaudeError(err, { needles: [claim.apiKey] });               // also covers a throw from res.text()
}
const latencyMs = Date.now() - t0;
```

### Repeating sweeper
```typescript
// Source: index.ts sweep_llm_errors pattern, hardened
spacetimedb.reducer({ name: 'llm_sweep', onSchedule: LlmSweepTick }, { arg: LlmSweepTick.rowType }, (ctx: any) => {
  ctx.db.llm_sweep_tick.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + SWEEP_INTERVAL_MICROS) });
  try { sweepLlmJobs(ctx); } catch (e) { console.error('llm_sweep failed: ' + redactSecrets(String(e))); }
});
```
(A whole-reducer try/catch is a fallback; `sweepLlmJobs` also catches per job so one bad row cannot block the rest.)

### Key script HTTP call (no argv, no echo)
```javascript
// scripts/llm/set-key.mjs sketch. The key and token stay in memory; only status is printed.
const res = await fetch(`${base}/v1/database/uwr/call/set_api_key`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify([key]),
});
console.log(`set_api_key: HTTP ${res.status}`);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Browser calls OpenAI via Cloudflare Worker, client submits result | Scheduled procedure calls Claude, applies server-side | Phase 39 decision, Phase 41 build | Results survive tab close; no credential in the browser |
| Table option `scheduled: () => reducer` | `onSchedule` on the reducer/procedure | 2.10 typings mark `scheduled` deprecated | Use `onSchedule` for the two new schedules; leave existing ones alone |
| Call-count budget (`llm_budget`, 50/day) | Cost-weighted reservation with a call backstop | Phase 41 | Long calls (world_gen) cost what they weigh |
| One pending `llm_task` per player | Per-key dedupe plus a per-player active-job cap | Phase 40/41 | Two tabs safe, floods bounded |

**Deprecated/outdated:** `llm_task`, `llm_request`, `submit_llm_result`, `validate_llm_request`, `useLlmProxy`, `useLlm`, `LlmBudget` (all Phase 42); `triggerCombatNarration` and its round-based assumptions (replaced here).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `spacetime login show --token` prints a token that, used as a Bearer token, authenticates as the CLI identity (`c2002524...`) against the HTTP API and the Node SDK `withToken` | 7, 8 | Key script or live-proof harness connects as a different identity and `requireAdmin`/ownership fail. Mitigation: first-run identity check; fall back to `spacetime call` (key briefly in child argv) |
| A2 | Scheduled reducers/procedures are private by default on 2.x (source: search summary of docs, not read from the docs page) | 1 | A client could call `llm_run`/`llm_sweep` with a forged arg. Mitigation: the `ctx.sender == ctx.databaseIdentity` guard (kept regardless) plus a test |
| A3 | Adding a column with `.default(...)` to an existing table is auto-migratable | 3.1 | Local publish refuses; user allows `--clear-database` locally, and maincloud has no `llm_job` yet |
| A4 | Anthropic bills a call that the client timed out on as if completed (unknown) | 3.2 | Recommendation keeps the hard-cap ledger conservative and never charges the player, so either answer is safe |
| A5 | `Date.now()` is usable inside a procedure outside `withTx` | 1 | Latency fields wrong. Phase 39's spike recorded `dateNowCallMs`, so this is low risk [VERIFIED: spike source] |
| A6 | Encounters expose states `active` and `resolved` only (seen in code paths read) | 4.2 | Late-drop check for future round narration uses the wrong state name; irrelevant for outro-only |
| A7 | Deterministic jitter from `jobId`/`attempt` gives enough spread for retry storms at this scale | 1, 3.3 | Slight herding; switch to `ctx.random` |

## Open Questions

1. **Failed skill offer is unrecoverable once `prepare_skill_gen` is deleted.**
   - Known: `apply_level_up` consumes a pending level before enqueuing; a terminal skill_gen failure (refusal, invalid JSON, sweeper expiry) leaves no `pending_skill` rows and no way to ask again. `requestSkillGen` on the client is dead code today, so the old path was equally stranded, but it existed.
   - Unclear: whether the user accepts that, given the locked "delete `prepare_skill_gen`" decision.
   - Recommendation: keep the deletion but add a small idempotent player reducer (for example `request_skill_offer`, in-tx enqueue with the same dedupe key and budget) or re-credit `pendingLevels` on terminal skill_gen failure. Surface to the user in plan check.
2. **CLI identity as admin.** Recommended: add `c2002524...` to `ADMIN_IDENTITIES`. Confirm with the user (it also grants gameplay admin from the CLI identity).
3. **World-gen failure state and the first-region retry action.** `retryWorldGen` resets to `PENDING`, which meant "client should call prepare again" (an unbounded auto-retry). Recommend `ERROR` plus: `explore` already retries at an uncharted location; for the first region (character `locationId 0n`) extend the `explore` intent (or add a small `retry_world_gen` reducer) to restart generation from the player's own `ERROR` starter state. Needs a decision; it changes pinned `retryWorldGen` tests.
4. **Charging on a thrown timeout.** `settleCostMicroUsd` keeps the reservation when a fetch throws (unknown billing). Recommended split: ledger conservative, player refunded. Confirm.
5. **Per-player active-job cap value.** Recommended 3 (non-narration), refusing with the "already considering something" line. Confirm or drop.
6. **Terminal `llm_job` retention.** `resultText` stays on completed jobs indefinitely (private, model output only). Recommend leaving retention to Phase 43; optionally have the sweeper delete terminal jobs older than 7 days.
7. **How much maincloud re-verification of the Phase 39 gate?** Dispatch p95, reliability and region-schema checks fall out of `llm_call_log`; ping/tick p95 need the deleted Phase 39 harness or a qualitative check.
8. **Mid-combat narration.** Recommended outro-only. If the user wants mid-fight narration, it needs a new event model and is a separate phase.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | Tests, scripts | yes | 22.23.2 | none needed |
| pnpm | Tests, build | yes | 11.23.0 | none needed |
| SpacetimeDB CLI | build/generate/publish/sql | yes | 2.10.1 (`login show` = c2002524...) | none needed |
| Local SpacetimeDB server (`127.0.0.1:3000`) | live proof, publish | not running now (`/v1/ping` gave no response) | 2.10.1 | start per `run-local` skill (server only; the proxy step is no longer needed) |
| Anthropic API key | live proof | placeholder only in `llm_config`; real key is the user's | n/a | `checkpoint:human-action`; without it only offline work proceeds |
| Anthropic Console workspace limit | interim cost guard | user-owned (about $3.28 of $10 used in Phase 39) | n/a | runbook step; do not run live proof without it |
| Maincloud | final proof | user-only | n/a | manual checklist |

**Missing with no fallback:** the real key (user action). **Missing with fallback:** local server (start it).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 5.0.2 (`spacetimedb/`) |
| Config file | default (`spacetimedb/package.json` scripts; no separate config) |
| Quick run command | `pnpm --dir spacetimedb exec vitest run --maxWorkers=1 <file>` |
| Full suite command | `pnpm --dir spacetimedb exec vitest run --maxWorkers=1` (baseline 34 files, 1454 tests, about 21 s) |
| Other gates | `spacetime build -p spacetimedb` (about 3 s, offline); `spacetime generate --lang typescript --out-dir <tmp> --module-path spacetimedb` (privacy check); client `pnpm build` (about 35 s, baseline green) |

### Phase Requirements to Test Map (all through `createMockProcCtx` unless noted)
| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|--------------|
| PIPE-01 | Each domain's triggering reducer inserts one `llm_job` + one `llm_dispatch` in the caller's tx; no `llm_task` row; no client `prepare_*` (static grep of `src/`) | unit (recorder + `capturedReducer`) | `vitest run src/reducers/llm_cutover.test.ts` | Wave 0 gap |
| PIPE-01 | `enqueueLlmJob` extension: dispatch row, reservation, refusal reasons, per-player cap, dedupe still holds | unit | `vitest run src/helpers/llm_queue.test.ts` | exists, extend |
| PIPE-02 | Result applied from stored text after a simulated crash between tx2 and tx3 (sweeper re-apply); apply acts for `job.playerId`, not the module sender | unit | `vitest run src/helpers/llm_executor.test.ts src/helpers/llm_sweeper.test.ts` | Wave 0 gap |
| PIPE-04 | Table test: each class (429+retry-after, 529, 500, timeout, network) retries with delays 2 s/8 s or retry-after capped 60 s plus jitter, max 3 attempts; auth/billing/bad_request/refusal/truncated fail fast; creation/world_gen/narration never retry | unit | `vitest run src/helpers/llm_retry.test.ts src/helpers/llm_executor.test.ts` | Wave 0 gap |
| PIPE-05 | Sweeper expires stuck `in_flight` (timeout+30 s), `received` re-apply, `pending` older than 10 min (renown 24 h), dispatches orphan pending jobs; each refunds once, releases the domain lock, posts the Keeper message | unit | `vitest run src/helpers/llm_sweeper.test.ts` | Wave 0 gap |
| PIPE-06 | Cap 4: 5th job defers (new dispatch +500 ms..750 ms), narration defers at 3; `withTxReinvoke:1` identical end state | unit | `vitest run src/helpers/llm_executor.test.ts` | Wave 0 gap |
| PIPE-07 | Narration: skipped silently on refusal, one attempt, expired at claim when older than 20 s, dropped at persist when late, applied when on time | unit | `vitest run src/helpers/llm_executor.test.ts src/helpers/combat_narration.test.ts` | Wave 0 gap |
| PIPE-09 | `capturedProcedure('llm_run')` and `capturedReducer('llm_sweep')` exist after loading `index.ts`; procedure guards a non-module sender; only the executor reaches `ctx.http` (fetch guard) | unit | `vitest run src/helpers/schema_recorder.test.ts src/data/model_literals.test.ts` | exists, extend |
| SEC-04 | Redaction across every failure class with the key as needle: no leak in any row outside `llm_config`, in call log messages, or in captured `console` output; key only in header; admin gating of `set_api_key`, smoke, status view (non-admin gets `[]`); CLI identity in the admin set | unit | `vitest run src/helpers/llm_executor.test.ts src/views/llm.test.ts src/data/admin.test.ts` | Wave 0 gap |
| COST-01 | tx2 writes the four usage counts and cost per route to `llm_call_log`; all four counts survive a `received` job | unit | `vitest run src/helpers/llm_executor.test.ts` | Wave 0 gap |
| COST-02 | Reserve/settle math from all four usage fields against `estimateCostMicroUsd`; $1.00/day and 200 calls refuse in voice with nothing reserved; phase $2 cap refuses; refund idempotent in both orders; UTC day rollover | unit | `vitest run src/helpers/llm_budget.test.ts` | Wave 0 gap |
| OPS-01 | `llm_smoke_test` (admin) enqueues 6 jobs, apply skipped, `lastSmokeJson` and `keyVerifiedAt` updated, key status derived correctly after `set_api_key` | unit | `vitest run src/reducers/llm_admin.test.ts` | Wave 0 gap |
| Hand-offs | Renown bigint fallback serialized (ranks 2,3,5,9,11); creation clamps (stat enums, ranges, kinds); `toBigIntSafe`; golden input round trip; archetype helper; `retryWorldGen` sets `ERROR` | unit | `vitest run src/helpers/submit_llm_result.characterization.test.ts src/helpers/llm_inputs.test.ts src/helpers/creation_validate.test.ts` | some exist; update deliberately |
| Client | Green build after each domain removes its `prepare_*` call | build gate | `pnpm build` | exists |
| Live | Real call per domain locally under the $2 cap; smoke test all six ok; user maincloud checklist | manual/live | `pnpm exec tsx scripts/llm/prove-live.ts` (or node) then read `admin_llm_status` | Wave 0 gap; human-action |

### Sampling Rate
- **Per task commit:** the touched test file(s) via the quick command.
- **Per wave merge:** full suite (single worker) plus `spacetime build -p spacetimedb`.
- **Per domain plan:** `pnpm spacetime:generate` then `pnpm build`.
- **Phase gate:** full suite green, build green, privacy generate check, then the human live proofs before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `helpers/llm_executor.test.ts`, `llm_budget.test.ts`, `llm_sweeper.test.ts`, `llm_retry.test.ts`, `llm_inputs.test.ts`, `creation_validate.test.ts`, `reducers/llm_admin.test.ts`, `reducers/llm_cutover.test.ts`, `data/admin.test.ts`
- [ ] `test-utils.ts`: `MockReply.advanceMicros` (fetch moves the clock)
- [ ] Extend the fetch guard and `llm_privacy.test.ts` (new tables private, admin view), model-literal allowlist per domain
- [ ] Framework install: none

## Security Domain

`security_enforcement` is not disabled in `.planning/config.json`, so this section applies (ASVS Level 1).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Admin actions gated by identity allowlist (`requireAdmin` + `ADMIN_IDENTITIES`); the Anthropic key authenticates the module to the provider and lives only in private `llm_config` |
| V3 Session Management | no (SpacetimeDB identities) | n/a |
| V4 Access Control | yes | Private tables (no `public: true`), per-sender projection view, admin-only view, scheduled functions guarded by module-identity check, apply authorized by stored `job.playerId`, never `ctx.sender` |
| V5 Input Validation | yes | Player text neutralized and tagged (`wrapPlayerInput`); model output is untrusted: strict JSON schema, then `creation_validate`, `parseSkillGenResult`/`clampToBudget`, quest `toBigIntSafe`, affinity clamp, `QUEST_TYPES` allowlist |
| V6 Cryptography | yes (storage) | No hand-rolled crypto. Key stored plaintext in a private table (accepted: private table, owner-only read); TLS to Anthropic is the platform's |
| V7 Error handling and logging | yes | `redactSecrets` with `needles=[apiKey]` on every stored/logged string; log lines carry route, class, status, ms, token counts only |
| V8 Data protection | yes | Prompts, outputs and job context never leave private tables; `my_llm_jobs` exposes six fields with a coarse error bucket |
| V11 Business logic | yes | Per-player daily cost and call caps, per-player active-job cap, dedupe keys, hard phase spend cap, workspace spend limit, idempotent refunds |
| V13 API / web service | yes | Key script uses the documented HTTP API with a Bearer token, local server only unless the user opts in |
| V14 Configuration | yes | Runbook; key never in `.env` committed files, argv, history, or chat |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Key leak through logs, error text, call-log rows, view output, or failed-response echo | Information disclosure | `redactSecrets` with the key as needle everywhere; leak-scan test across every table except `llm_config` and captured `console` output; key only in the request header |
| Client forges or replays a job result | Tampering, Spoofing | `submit_llm_result` is the legacy path (removed Phase 42); new path has no client-writable input: private tables, private scheduled functions, module-identity guard, tx3 guard on `status === 'received'` |
| Cost exhaustion (spam enqueue, long prompts, retries) | Denial of service | Reservation at `max_tokens`, $1/day and 200 calls per player, per-player active cap, one attempt for expensive routes, hard $2 phase ledger, Console workspace limit |
| Prompt injection via player text or NPC message | Tampering | Tags plus escaping (Phase 40), strict schemas, server validators that clamp, no tool use, no prefill; outputs never executed |
| Admin escalation via the CLI identity allowlist | Elevation of privilege | Identity is public data; power comes from the token. Pin the set in a test; document in the runbook |
| Double apply or double refund under sweeper/procedure race | Tampering | Status guards, idempotent release, `applyAttempts` cap |
| Admin view leaking status to non-admins | Information disclosure | Sender check in the view; test with a non-admin sender returns `[]`; view reads only `llm_admin_state`, never `llm_config` |
| Stale key or spend-cap error surfaced to players | Information disclosure | `publicErrorBucket` maps `auth`/`billing` to `unavailable`; Keeper copy names no provider or code |

## Sources

### Primary (HIGH confidence)
- Repo files read this session: `41-CONTEXT.md`, `ROADMAP.md` Phase 41, `STATE.md`, `REQUIREMENTS.md`, `39-SPIKE-RECORD.md`, `40-RESEARCH.md`, `40-REVIEW.md`, `40-05` to `40-10` summaries, `schema/tables.ts`, `index.ts`, `helpers/{llm_queue,llm_apply,claude_request,measurement,combat_narration,renown,scheduling,schema_recorder,test-utils,llm_seam.test,llm_status}.ts`, `reducers/{creation,npc_interaction,llm,commands,renown,auth}.ts`, `data/{admin,llm_routes,llm_layers,llm_models,model_literals.test}.ts`, client composables, `run-local` skill
- `git show e5f414d9^:` spike files (`llm_spike.ts`, `spike_tables.ts`, `scripts/spike/cli.mjs`, `set-key.mjs`, `harness.ts`)
- Installed typings: `spacetimedb/node_modules/spacetimedb/dist/server/{procedures,http_internal,http_shared,reducers,rng}.d.ts`, `dist/lib/{table,table_schema}.d.ts`
- claude-api skill (loaded this session): Sonnet 5.5 pricing and cache rates
- Ran: `pnpm --dir spacetimedb exec vitest run --maxWorkers=1` (34 files, 1454 tests), `pnpm exec vue-tsc -b` (clean), `pnpm build` (green), `spacetime login show`, `spacetime call --help`, `spacetime login show --help`

### Secondary (MEDIUM confidence)
- https://spacetimedb.com/docs/functions/procedures (withTx multiple invocation, no overlap of fetch and tx, 30 s default / 180 s max timeout)
- https://spacetimedb.com/docs/tables/schedule-tables (`onSchedule` on procedures, row deleted before execution)
- https://spacetimedb.com/docs/http/database (HTTP reducer call with Bearer token, owner may query private tables)

### Tertiary (LOW confidence, flagged in Assumptions)
- Search summaries: strong serializability and reducer re-execution; scheduled functions private by default in 2.x

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, no new packages; all pieces exist in the repo.
- Architecture: HIGH for the executor shape (promoted from a tested reference driver and a spike proven on local and maincloud); MEDIUM for concurrency semantics (documented serializability, not measured on this executor).
- Domain cutover map: HIGH (every trigger site and client call read directly); MEDIUM for the combat outro placement (real-time combat handlers read, not yet edited).
- Pitfalls: HIGH.

**Research date:** 2026-09-30
**Valid until:** 2026-10-14 (SpacetimeDB 2.10.x moves quickly; re-check `onSchedule` typings if the SDK is bumped)
