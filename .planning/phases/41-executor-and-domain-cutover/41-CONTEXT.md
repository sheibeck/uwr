# Phase 41: Executor and Domain Cutover - Context

**Gathered:** 2026-09-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 41 makes every LLM-driven action run server-side, end to end, against real Claude. The six actions are creation, world gen, skills, NPC chat, combat narration and renown. They run on the executor that Phase 39 chose (GO): a scheduled SpacetimeDB procedure that calls Claude directly through `ctx.http.fetch`.

It plugs that executor into the Phase 40 seam:
- `enqueueLlmJob`
- `buildClaudeRequest` / `classifyClaudeResponse`
- `applyLlmResult` / `applyLlmFailure`
- the reference driver in `llm_seam.test.ts`

It also delivers:
- bounded retry and fail-fast handling
- a sweeper
- a global in-flight cap
- cost-weighted per-player budgets
- an admin smoke test and key status
- a key runbook

Each domain moves over in the roadmap order, with the browser taken out of the LLM path. Local live proof comes first. The maincloud proof is a manual user step.

Requirements: PIPE-01, PIPE-02, PIPE-04, PIPE-05, PIPE-06, PIPE-07, PIPE-09, SEC-04, COST-01, COST-02, OPS-01.

Not in this phase:
- the global spend ceiling and admin kill switch (COST-03)
- latency tuning and staged generation (LAT-*)
- `/llm stats` (OPS-02)

These are Phase 43. Removing the `llm_task`/`llm_request` tables, `submit_llm_result`, `llm-proxy/` and `useLlmProxy` (SEC-02/03/05) is Phase 42.

</domain>

<decisions>
## Implementation Decisions

### Executor mechanics
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

### Failures, sweeper and player messaging
- **A scheduled sweeper reducer runs every 30 s:**
  - `in_flight` longer than the route timeout plus 30 s becomes `expired`.
  - `received` but not applied for 60 s re-runs apply from the stored text.
  - `pending` older than 10 minutes becomes `expired`.

  Every expiry refunds the reserved budget, releases generation locks and posts a Keeper message.
- **Players learn about failures through each domain's existing failure path.** `applyLlmFailure` already writes the in-voice message and releases locks. `my_llm_jobs.userMessage`, with the coarse `errorCode` bucket from Phase 40, carries it for the Phase 42 client. Messages never mention keys, providers or HTTP codes.
- **Renown jobs queued during Phase 40 are processed normally** on the executor's first run, because they are valid jobs. The 10-minute pending rule does not apply to them; they expire only after 24 hours.
- **Combat narration never blocks combat and has the lowest priority.**
  - It runs only when in-flight is below cap − 1, so gameplay calls always have a slot.
  - It gets one attempt and no retry.
  - The result is dropped if it arrives more than 20 s after enqueue or after the combat has ended.

### Budget and cost
- **Cost math reuses the Phase 39 micro-USD helpers** in `helpers/measurement.ts`. The Sonnet 5.5 list prices are $2/MTok input, $10 output, $2.50 cache-write and $0.20 cache-read.
  - At enqueue, reserve an estimate: prompt chars ÷ 3.25 at the cache-write price, plus the full `max_tokens` at the output price.
  - On result, settle with the real 4-field usage.
  - A call that fails before it is billed is refunded in full.
- **Per-player daily limits:** $1.00 per day cost-weighted, plus a 200 calls per day backstop. Both are constants in one module, keyed by UTC date. Phase 43 adds the global ceiling and kill switch.
- **Over budget:** the reducer answers with an in-voice Keeper refusal at enqueue (`fail(ctx, character, …)` where character context exists). No job is created and nothing is reserved. Combat narration is silently skipped instead of refused.
- **Budget state lives in a new private per-player-per-day table** holding reserved micro-USD, spent micro-USD, call count and UTC date. It replaces `LlmBudget`'s call count. `LlmBudget` and `checkBudget`/`incrementBudget` become dead code, and Phase 42 removes them. Every call's four usage counts are recorded per route in `llm_call_log` (COST-01).

### Cutover, client, key and live proof
- **Move straight to the new architecture** (user, 2026-09-30: "No one is using this stuff now … We can immediately go to our new architecture. We're fully green field"). There are no compatibility wrappers for the running client or old data.
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

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets (from Phase 40)
- `helpers/llm_queue.ts`: `enqueueLlmJob` (dedupe on `by_dedupe_key` for active jobs), `SOURCE_KEYS`, `buildDedupeKey`, `serializeRequest`, `resolveCharacterPlayerId`, `logLlmCall`, status constants and `isActiveJobStatus`.
- `helpers/claude_request.ts`: `buildClaudeRequest(route, {routeBlock, volatile})`, `buildClaudeHeaders(apiKey)` (the only place the key is used), `assertValidClaudeBody`, `classifyClaudeResponse`, `classifyClaudeError`, `RETRYABLE_CLASSES` and `extractUsage`.
- `data/llm_layers.ts`: `ROUTE_BLOCKS` and the per-route volatile builders (player text escaped and tagged). `data/keeper_bible.ts` is the user-approved Bible. `data/llm_routes.ts` holds `LLM_ROUTES`: effort `low`, `max_tokens`, timeouts and schema references. `data/llm_models.ts` holds `CLAUDE_MODEL`.
- `helpers/llm_apply.ts`: `applyLlmResult`, `applyLlmFailure` and `toApplyJob`, keyed on `job.playerId`. `submit_llm_result` in `index.ts` is a thin wrapper and is removed in Phase 42.
- `helpers/llm_status.ts`: `keeperMessageForJob` and `publicErrorBucket`. `views/llm.ts` defines `my_llm_jobs`.
- `helpers/test-utils.ts`: `createMockProcCtx` (scripted fetch, sync-only re-invokable `withTx`, clock) and opt-in strict `createMockDb`. `helpers/schema_recorder.ts` provides `rowColumnProblems`, `capturedReducer` and `snapshotDb`.
- `helpers/llm_seam.test.ts`: the reference driver `runJobOnce`, which Phase 41 promotes into the real `llm_run` procedure.
- `helpers/measurement.ts`: `CLAUDE_PRICE_MICRO_USD_PER_TOKEN`, `estimateCostMicroUsd`, `reserveCostMicroUsd`, `settleCostMicroUsd` and `redactSecrets`.

### Established Patterns
- Scheduled tables use `scheduled: () => scheduledReducers['…']` in `schema/tables.ts`, for example `combat_loop` and `regen_health`. Scheduled procedures use `onSchedule` (Phase 39 fact). `index.ts` needs the 4-argument named `procedure({name, …})` form for `_wrapMethod`.
- Procedures have no `ctx.db`; use `ctx.withTx(tx => …)`. `ctx.http.fetch` is synchronous, throws on timeout, and returns 4xx/5xx as responses.
- Admin gating goes through `requireAdmin(ctx)` from `data/admin.ts` (`ADMIN_IDENTITIES`).
- User preference: use `fail(ctx, character, msg)` where character context exists, and `SenderError` in low-level helpers.
- Run tests with `pnpm --dir spacetimedb exec vitest run --maxWorkers=1`. The machine is low on virtual memory, and multi-worker runs crash.

### Integration Points
- Client call sites to remove or change:
  - `src/composables/useCharacterCreation.ts:127` (`prepareCreationLlm`)
  - `src/composables/useSkillChoice.ts:54` (`prepareSkillGen`)
  - `src/composables/useWorldGeneration.ts:49` (`prepareWorldGenLlm`)
  - `src/composables/useNpcConversation.ts`, which goes through the `llm_task` path via `useLlmProxy`
  - `src/App.vue:738` (`useLlmProxy`, which stays mounted until Phase 42 but goes idle)
- Server `llm_task` insert sites to replace with `enqueueLlmJob`:
  - `index.ts` creation, world_gen and skill_gen (about lines 475, 604, 664 and 893 after the Phase 40 extraction)
  - `helpers/combat_narration.ts:172`
  - `reducers/npc_interaction.ts:99`
  - `reducers/llm.ts`

  The model-literal allowlist in `data/model_literals.test.ts` must shrink to exclude every migrated site.
- Phase 40 hand-offs to handle here:
  - The renown static fallback in `llm_apply.ts` still throws on bigint `JSON.stringify(perk.effect)`. Fix it with a shared serializer (`serializePerkEffect` in `helpers/renown.ts`) and update the pinned snapshot deliberately.
  - Creation race and class replies are not clamped; they are pinned as "Phase 41: validator gap". Add clamping and vocabulary validation.
  - Quest numeric fields use `BigInt(...)` on model values (review IN-01). Add a clamping `toBigIntSafe`.
  - The dedupe starvation on stuck jobs (IN-07) is solved by the sweeper.
  - IN-04: pass `needles: [apiKey]` to redaction.
  - `Character` has no archetype column, so skill_gen prompts always say "warrior" (RESEARCH 2.1). Fix it if cheap, otherwise defer.

</code_context>

<specifics>
## Specific Ideas

- The user wants "the fastest experience with the best narrative results". The executor should not add latency beyond the call itself: dispatch is immediate, and nothing polls on the happy path.
- Spend so far is about $3.28 of the $10 Anthropic Console workspace limit, from Phase 39. The local key in `llm_config` is a placeholder until the user sets it again.
- Phase 39's measured latencies were skill p50 about 5.3 s and region about 17.5 s. Route timeouts come from `LLM_ROUTES`.

</specifics>

<deferred>
## Deferred Ideas

- **Phase 42:**
  - Because the project is greenfield (user, 2026-09-30), the planned two-publish `llm_task`/`llm_request` removal (SEC-05) can be a plain removal, with a local `--clear-database` if the schema requires it.
  - Remove `submit_llm_result`, `llm-proxy/`, `useLlmProxy` and `LlmBudget`.
  - Wire `useLlmStatus` to `my_llm_jobs`.
- **Phase 43:** the global spend ceiling and kill switch (COST-03), in-flight cap tuning, effort sweeps, cache TTL, and staged generation.
- The NPC table privacy todo (`.planning/todos/pending/2026-09-29-make-npc-secret-and-memory-tables-private.md`) is not part of this phase.

</deferred>
