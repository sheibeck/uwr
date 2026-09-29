# Architecture Patterns — v2.2 LLM Claude Engine

**Domain:** Server-authoritative multiplayer narrative RPG (SpacetimeDB 2.10.1 TS module + Vue 3 client), migrating LLM generation from OpenAI-via-browser-proxy to Claude with minimum time-to-response
**Researched:** 2026-09-29
**Scope:** Only what the NEW capabilities need (Claude integration path, caching, effort, fallback). Overwrites the v2.0 file.
**Overall confidence:** MEDIUM-HIGH. API surface and Anthropic facts are HIGH (installed `spacetimedb@2.10.1` typings, official docs, claude-api skill). Latency numbers are LOW (estimates until the spike measures them). One MEDIUM-confidence platform risk (V8 instance pool under blocking `fetch`) is the main thing the spike must retire.

---

## 0. Verdict in one screen

1. **Latency reality check.** Removing the client/Worker hops saves roughly one to three client round trips (about 0.1 to 0.5 s, LOW confidence estimate) out of a 2 to 30 s wait. The dominant latency levers are, in order: **model + effort choice, output token count, prompt-cache hit (TTFT), staged/speculative generation, and streaming for long outputs.** The procedure move is primarily a **security, reliability and simplicity** win (no forgeable client submissions, no client-dependence, no browser secret), and only secondarily a latency win.
2. **Procedure path is viable and better than assumed.** `spacetimedb@2.10.1` types confirm `spacetimedb.procedure({ onSchedule: <table> }, ...)`: a reducer can enqueue a **scheduled procedure** in the same transaction. Reducers cannot call procedures directly, but this makes "server event -> Claude call" fully server-side and atomic with the triggering reducer. No client involvement is needed for combat narration, renown perks, skill gen, world gen, creation or NPC talk.
3. **The one platform risk that matters:** a blocking `ctx.http.fetch` holds a V8 instance/OS thread for the whole call. Per SpacetimeDB issue #4697 the pool grows with concurrent in-flight procedures, never shrinks, and each new instance recompiles the module (this module is large). Whether reducers stall is unresolved for 2.10.1. **Spike must measure cold start, concurrency and reducer latency under load**, not just "does fetch work".
4. **Design the seam, not the executor.** Build a private `llm_job` queue + executor-agnostic request builder + server-side result applier. The executor (scheduled procedure vs. backend service) is then a swappable ~150-line module. The spike gates only that module; the rest of the milestone is invariant.
5. **Fallback should be "DB as the queue", not "browser calls a backend".** A backend service subscribes (as an allowlisted service identity) to a service-only view, calls Claude (WIF on a host with native workload identity), streams progress rows, and completes via service-only reducers. Browser never talks to the backend, so no browser-to-backend auth, no CORS, no credential in the browser, and it works against local SpacetimeDB without a tunnel.
6. **Security finding in the current design (fix regardless of path):** `submit_llm_result` (`spacetimedb/src/index.ts:943`) accepts arbitrary `resultText` from any player for their own task, and `llm_task` is `public: true` with full prompts (including NPC secrets and memory). A client can forge "LLM output" (quests, affinity, abilities, regions). Moving to server-produced results removes this class of bug.

---

## 1. Ground truth: what the repo does today

| Piece | Location | Finding |
|-------|----------|---------|
| Task table | `spacetimedb/src/schema/tables.ts:2106` `LlmTask` (`public: true`, `by_player` index) | Stores full `systemPrompt`/`userPrompt` in a public table; visible to all subscribers. |
| Enqueue sites | `index.ts` `prepare_creation_llm` (439), `prepare_world_gen_llm` (521), `prepare_skill_gen` (650), `apply_level_up` (899-940); `reducers/npc_interaction.ts:95`; `helpers/combat_narration.ts:168`; `helpers/renown.ts:84` | Six domains. Creation, world-gen and skill-gen are **client-driven enqueue**: the client watches a state row, then calls a `prepare_*` reducer (`useWorldGeneration.ts:49`, `useCharacterCreation.ts:127`, `useSkillChoice.ts:54`). Extra hop and extra failure mode. |
| Executor | `src/composables/useLlmProxy.ts` | Only the task owner's tab runs it, one task at a time (`isProcessing`), `watch(..., { deep: true })` over the whole table. Combat narration is charged to a rotating participant, so if that player's tab is closed the narration is silently dropped. |
| Proxy | `llm-proxy/src/index.ts` (82 lines, Hono, OpenAI `chat.completions`, static bearer `PROXY_SECRET` from `localStorage.llm_proxy_secret`, `origin: '*'`) | Non-streaming; secret in browser storage. |
| Apply | `index.ts:943` `submit_llm_result` (~700 lines of per-domain apply logic inside one reducer) | Trusts client text. Contains all domain apply logic; must be extracted to be reusable. |
| Budget | `helpers/llm.ts` `checkBudget`/`incrementBudget`, `DAILY_LLM_BUDGET = 50` calls | Check at enqueue, increment at result (NPC increments at enqueue). Not cost-aware; no reservation, so parallel tasks can overshoot. |
| Locks | `world_gen_state.step` PENDING/GENERATING/COMPLETE/ERROR + `by_source_location` index (`helpers/travel.ts:266`, `reducers/intent.ts:1398`); "one pending `llm_task` per player" checks | Per-player and per-state only. Two different players exploring the same uncharted edge are guarded only by the `existingGen` lookup at insert time. |
| Legacy dead code | `reducers/llm.ts` (`validate_llm_request`, model allowlist `gpt-5.4`), `LlmRequest` table, `sweep_llm_errors`, `src/composables/useLlm.ts` (comment: "future iteration will trigger the procedure server-side") | Remnant of the v2.0 procedure attempt. `LlmConfig` (private, `apiKey`) and `set_api_key` (admin) **already exist** and are reusable. |
| Latent bug | `helpers/renown.ts:84` inserts `completedAt`, `resultText`, `errorMessage` which are not `LlmTask` columns | The `try/catch` swallows it and falls back to the static perk pool, so LLM renown perks likely never fire. Fix during migration. |
| Procedure scaffolding | `index.ts:277` `_wrapMethod('procedure', ...)` | Exports procedures only when called as `procedure(opts, params, ret, fn)` with `opts.name` a string. Any new procedure must pass `name`. |

---

## 2. Path A — Current: reducer -> LlmTask -> client watch -> Worker -> OpenAI -> submit reducer

```
Client(tab)            SpacetimeDB (maincloud)              CF Worker           LLM
   | 1 reducer talk_to_npc ->|                                 |                 |
   |                         | insert llm_task (public)        |                 |
   |<- 2 sub push llm_task --|                                 |                 |
   | 3 fetch /api/llm (Bearer localStorage secret) ----------->|                 |
   |                                                            | 4 POST -------->|
   |                                                            |<-5 full body ---|
   |<-6 JSON -------------------------------------------------|                 |
   | 7 reducer submit_llm_result(resultText) ->|               |                 |
   |                         | parse + apply + budget          |                 |
   |<- 8 sub push (events) --|                                 |                 |
```

- **Hops that touch the client:** NPC/combat/renown: 4 client-STDB half trips (1, 2, 7, 8) + 1 client-Worker round trip (3, 6) = about **2 x RTT(client,STDB) + RTT(client,Worker)** on top of model time, plus 2 x Worker-to-vendor legs.
- **World gen / creation / skill gen add another reducer round trip** (`prepare_*`): about **3 x RTT(client,STDB) + RTT(client,Worker)**.
- **Reliability:** depends on the owner's tab being open and focused; only one task at a time per tab; no retry policy; forgeable result.
- **Example:** at 80 ms RTT everywhere, overhead is about 250-450 ms before model time. (LOW confidence: derived, not measured. Instrument in the spike to get a real baseline.)

---

## 3. Path B — Procedure path (recommended to spike, then adopt if it clears the gate)

### 3.1 Verified platform facts (installed `spacetimedb@2.10.1` types + docs)

| Fact | Evidence | Confidence |
|------|----------|------------|
| `ProcedureCtx` has `sender`, `timestamp`, `http.fetch(url, { method, headers, body, timeout?: TimeDuration })`, `random`, `withTx(body)`, `newUuidV4/V7`. **No `ctx.db`** and no sleep. | `dist/server/procedures.d.ts`, `http_internal.d.ts` | HIGH |
| `ProcedureOpts.onSchedule?: ScheduleTableForParams<Params>` (procedure must return `t.unit()`): a procedure can be the target of a schedule table. | `procedures.d.ts` | HIGH |
| Scheduled procedures **delete the schedule row before execution** (`find`/`update` on it will miss). Scheduled reducers delete after. | Schedule Tables doc | HIGH |
| Reducers cannot call procedures; scheduling is the server-side trigger. | Docs / search summary | HIGH |
| `ctx.http.fetch` default timeout 30 s, max 180 s; cannot hold a transaction open across a fetch; loopback/private addresses blocked. | Procedures doc, platform-upgrade note (#4546, #4630) | HIGH |
| `fetch` returns `SyncResponse` (`.text()`, `.json()`, `.status`, `.headers`): **fully buffered, no streaming body.** | `http_shared.d.ts` | HIGH |
| `withTx` callback "may execute multiple times"; must be repeatable on the same state. | Procedures doc | HIGH |
| `TransactionCtx extends ReducerCtx`, so existing helpers written as `(ctx, ...)` (e.g. `fail`, `appendPrivateEvent`, `checkBudget`) work inside `withTx`. | `procedures.d.ts` | HIGH |
| Scheduled functions run **concurrently** since 2.10.1 (no strict `scheduled_at` ordering). | platform-upgrade note | MEDIUM |
| Blocking procedure syscalls park a V8 thread for the full duration; concurrent ops create new V8 instances (OS thread + isolate + module recompile); pool never shrinks. Reducers were moved to a separate FIFO lane in PR #4663 (merge/ship status in 2.10.1 unverified); async procedures are only a proposal (#4697). | GitHub issue #4697 | MEDIUM |
| `ctx.sender` in scheduled procedures and `ScheduleAt.time(now)` fire latency are **undocumented**. | Docs silent | UNKNOWN: spike |
| HTTP handlers (`spacetimedb.httpHandler`, `httpRouter`) exist (beta): incoming HTTP to `$URI/v1/database/$DB/route/PATH`, synchronous `SyncResponse`. | `http_handlers.d.ts`, docs | HIGH (exists) / LOW (auth/limits undocumented) |

**SDK note:** the `@anthropic-ai/sdk` cannot run inside the module (no global `fetch`, only `ctx.http.fetch`). Raw HTTP to `POST https://api.anthropic.com/v1/messages` is therefore the correct, justified exception to "use the SDK" inside procedures. The request/response shape is pinned by a pure builder (`claude_request.ts`) and unit tests. The fallback backend uses the official SDK.

### 3.2 Who triggers the procedure (decision)

| Option | Mechanism | Verdict |
|--------|-----------|---------|
| **B1 (default, universal)** | Reducer (or scheduled tick) calls `enqueueLlmJob(ctx, ...)` which inserts a private `llm_job` row **and** an `llm_dispatch` schedule row (`ScheduleAt.time(ctx.timestamp)`), in the reducer's own transaction. The `llm_run` scheduled procedure fires after commit. | **Use for every domain.** Atomic with the game state change (if the reducer throws, no job and no dispatch). Works for server-originated events (combat tick, renown rank-up, travel into uncharted edge) with no client. |
| B2 (optimization, only if spike shows scheduler overhead) | Convert the 2-3 latency-critical player-initiated entry points (`talk_to_npc`, creation steps) into **client-callable procedures** (`conn.procedures.talkToNpc`): tx1 validate + log player line + claim, fetch, tx2 apply. Saves the scheduler hop. | Only if S3 (dispatch latency) p95 is large. Adds a second entry point and needs generated client bindings; keep behind the same `runLlmJob` core. |
| B3 (reject) | Client calls a procedure with a `taskId` after a reducer creates it. | Rejects: reintroduces the client dependency and an extra round trip with no benefit over B1. |

### 3.3 Transaction model (three transactions, persist-then-apply)

```
Reducer tx (game logic)          llm_run procedure (scheduled)                              Clients
  enqueueLlmJob:                 tx1 withTx (short, repeatable):
   - checkBudget + RESERVE         - job = llm_job.id.find(jobId); require status 'queued'
   - per-player/global cap         - set 'running', startedAt
   - insert llm_job 'queued'       - read FRESH game state, build request layers  ---+
   - insert llm_dispatch(now)      - read api key from llm_config                    | pure
                                 fetch (NO tx open): POST /v1/messages, timeout=route.timeoutMs
                                 tx2 withTx (cannot fail on domain logic):
                                   - store resultText, usage, request-id, stop_reason; status 'received'
                                   - settle budget (reserved -> actual)
                                 tx3 withTx: applyLlmResult(tx, job, text)  (domain apply, may throw -> caught,
                                   status 'error' + applyLlmFailure(...) narrates "The Keeper falters")   --> subscription push
```

Why three transactions: (a) tx1 must not span the fetch; (b) if domain apply has a bug or validation failure, the paid-for Claude response is already persisted in tx2 and a sweeper can re-run tx3 from stored text **without a second API call**; (c) tx2 is trivial so it essentially cannot fail after spending money.

Build the prompt in **tx1, not at enqueue time**: queued jobs then use fresh state (NPC memory, region facts), and the queue row stays small (ids + player input only, `inputJson`). The `llm_job` row **must not** store built prompts (keeps the public view sanitized and rows small).

### 3.4 Concurrency and locking

| Concern | Mechanism |
|---------|-----------|
| Per player | Existing rule kept: at most one non-terminal job per (player, domain group). Check `by_player` in the enqueue reducer. |
| Same-target dedupe (world gen) | In `enqueueLlmJob` for `world_gen`, look up `world_gen_state.by_source_location`; if another state is already `GENERATING` for that edge, mark this state `WAITING` and link it; apply the single result to both in tx3. Prevents duplicate regions and double spend. |
| Global in-flight cap | `LLM_MAX_INFLIGHT` (start 4-6) counted from `llm_job.by_status('running')`. Enqueue inserts the dispatch row only when below the cap; `llm_run` tx3 completion schedules the next queued job. Protects V8 instances/threads and Anthropic rate limits. |
| Claim safety | tx1 claims by status transition inside one transaction; duplicate dispatches for the same job see `status != 'queued'` and exit. Idempotent, so safe if `withTx` re-executes. |
| Crash recovery | Repurpose `sweep_llm_errors` (`index.ts:356`, 5-min tick): `running` older than `timeout + 60 s` -> error + refund; `received` (persisted but not applied) -> retry tx3 from stored text. A module republish mid-flight is the expected cause. |
| Retry/backoff | Procedures cannot sleep. On 429/529/5xx/timeout: retry once inline only for connection errors; otherwise re-insert an `llm_dispatch` row with `ScheduleAt.time(now + backoff)` (honor `retry-after`), `attempt+1`, max 2. |

### 3.5 Budget enforcement

- Replace call-count budget with **reserve then settle**: enqueue reserves (est. cost from `LLM_ROUTES`), tx2 settles to actual from `usage` (input, output, cache read, cache write), failure refunds. All inside transactions, so parallel jobs cannot overshoot.
- Track daily per-player **spend (micro-USD)** plus a call cap. Add a **global daily ceiling** (single row) as a runaway guard. Use a **new** table (`llm_spend`) rather than adding columns to `llm_budget`, to avoid `--clear-database` (per project rule: clear only when schema requires).
- Keep the friendly `fail(ctx, character, ...)` messages (project preference) on budget denial.

### 3.6 Where the API key lives

- Reuse private `llm_config` (`tables.ts:1890`) + admin `set_api_key` (`reducers/llm.ts`). tx1 reads it; it is placed only in the request headers held in a local variable, **never logged, never stored on `llm_job`, never returned**.
- WIF is effectively not available to a WASM module (it has no platform identity to mint an OIDC JWT; a module-held signing key is just another static secret). Accept a static key here and contain it: dedicated Anthropic **workspace**, service-account key, spend limit and expiry, rotate via `set_api_key`. Add a unit test asserting `llm_config` and `llm_job` are not `public: true`.
- Prompt caching is per workspace on the Claude API; use one workspace for the game so cache entries are shared across players.

### 3.7 Local vs maincloud

- Local server: outbound to `api.anthropic.com` should work (only loopback/private is blocked). This is the exact thing to re-verify (2.0.1 failure suspected 500 ms default timeout; always pass an explicit `timeout`).
- Local backend fallback cannot be reached by procedures (`localhost` blocked, #4546); another reason D2 (DB-as-queue) is preferred over "procedure calls backend".

---

## 4. Path C — Hybrids

| Hybrid | Feasible on procedures? | Recommendation |
|--------|-------------------------|----------------|
| **C1: stream tokens to requesting client, server keeps result authoritative** | **No.** `SyncResponse` is fully buffered; a procedure cannot read an SSE stream. Only the backend executor (D2) can stream. | Only worth it for long outputs; short outputs (NPC <= 500 tok, combat <= 400 tok) already animate via the client typewriter. Implement in D2 by writing throttled `llm_progress` rows (every ~150-250 ms) visible only to the requester via a per-player view; final text still lands via `llm_service_complete` -> `applyLlmResult`. |
| **C2: procedure writes partial rows progressively** | Only by **chunking the generation** (multiple sequential calls, each with its own `withTx` commit visible to subscribers), not by token streaming. | Use this as **staged generation** (C3). |
| **C3: staged generation (highest-value latency lever for the long routes)** | Yes, both executors. | Split world gen into stage 1 (region name/description/biome + safe starting location + first NPC, small output) applied and shown immediately, then stage 2 (remaining locations/NPCs/enemies) in the background. Same for class generation (identity + first ability, then the rest). Also shrinks structured-output schemas (see 7.4). |
| **C4: speculative pre-generation** | Yes (server-side, on schedule/enqueue). | When a character arrives at a location adjacent to an uncharted edge, enqueue a low-priority world-gen job so it is ready before they type [explore]. Hides the wait entirely; guard with budget and the dedupe lock. Later phase. |
| **C5: client-kick procedure** | Yes | = B2. Only if measured scheduler overhead justifies it. |

Do not "optimistically render" LLM output on the client; keep subscriptions authoritative (project rule).

---

## 5. Path D — Fallback backend + Workload Identity Federation

Adopt only if the spike fails S1/S2 (fetch/Anthropic reliability) or S3/S4 (dispatch latency or V8 pool/reducer impact). It also becomes the right choice later if token streaming or WIF becomes a hard requirement.

### 5.1 Recommended: D2 "database is the queue"

```
Browser --reducer--> SpacetimeDB(llm_job 'queued', private) ---subscription (service identity)---> llm-service (Node 22, Cloud Run min-instances=1)
   ^                           ^  ^                                                                    | 1 reducer llm_service_claim(jobId)
   |                           |  '--- llm_service_progress(jobId, seq, text)  (throttled) <-----------|  build request via shared claude_request.ts
   '--- sub: my_llm_jobs, my_llm_progress views --- llm_service_complete(jobId, text, usage) <----------|  Anthropic SDK messages.stream (WIF)
                                 tx: persist + applyLlmResult
```

- **Where it runs:** a host with a native workload identity so WIF actually removes the static secret: **Google Cloud Run** (metadata-server identity token, an ambient provider for WIF), AWS Lambda/ECS (IAM), or Kubernetes. Cloud Run with `min-instances=1` avoids cold start; pick the region nearest Anthropic ingress and maincloud (measure). MEDIUM confidence on the operational detail of feeding the token to the TS SDK (`ANTHROPIC_IDENTITY_TOKEN_FILE` or an identity-token provider); confirm in the Console GCP provider guide before committing. **Cloudflare Workers have no ambient OIDC identity**, so WIF there degrades to a static secret (a Worker secret holding an API key is acceptable per Anthropic docs for servers, but it is not WIF).
- **Trigger:** none from the browser. Backend holds one long-lived SpacetimeDB WebSocket, subscribed to view `service_llm_queue`.
- **Secure write-back:** service identity registered by admin (`register_llm_service`, `requireAdmin`) into a private `llm_service` allowlist. Views return rows only when `ctx.sender` is in the allowlist (index `find`, so views stay legal). Service-only reducers (`llm_service_claim/progress/complete/fail`) start with `requireLlmService(ctx)`. They never accept prompts or apply arbitrary state; `complete` just stores text + usage and calls the same `applyLlmResult` server-side. The service token is a static secret but with a tiny blast radius (can only claim/complete queued jobs); rotate by re-registering.
- **Hop count:** same as procedures: 1 client RTT + queue push to the service (server-to-server) + model + reducer call. Streaming is possible.
- **Local dev:** backend runs on localhost, connects outbound to local SpacetimeDB and to Anthropic. No tunnel. (D1 below cannot do this.)

### 5.2 Alternatives considered

| Option | Why not default |
|--------|-----------------|
| D1: scheduled procedure calls backend `POST /generate` via `ctx.http.fetch` | Still burns a V8 thread for the full duration (same risk as B), needs a public URL (loopback blocked, so a tunnel in dev), and needs its own auth. If procedure HTTP is the failure, D1 fails too. |
| D3: browser streams SSE from backend, authenticated with SpacetimeAuth OIDC JWT | Best raw token latency to the requesting tab, but adds CORS, JWKS validation, prompt/task fetch by the service, and a second identity path. Keep as an optional later add-on to D2 for long outputs. |
| D4: HTTP handler in module receives backend results | Beta, auth/limits undocumented, no advantage over service reducers. |
| Keep current Worker | Retains browser-held secret and forgeable submit; rejected by milestone goal. |

---

## 6. The executor-agnostic seam (what gets built once)

```
enqueue (reducers, ticks)                         executor (swap: procedure | service)                 apply (server-side, both)
 enqueueLlmJob(ctx, {domain, playerId,     --->   claim -> buildClaudeRequest(job, freshState)   --->   applyLlmResult(ctx, job, text)
   characterId, inputJson})                        -> POST Claude -> parseClaudeResponse                 applyLlmFailure(ctx, job, code)
 budget RESERVE, caps, dedupe                      -> persist result + usage                              settleBudget()
```

- `buildClaudeRequest` and `parseClaudeResponse` are **pure** and shared (procedure and backend import the same file; put under `spacetimedb/src/helpers/` and import from `llm-service/` via relative path or a tiny shared package).
- Per project rules every new piece ships with unit tests using `helpers/test-utils.ts`: request layering/caching bytes, stop-reason handling, budget reserve/settle, queue caps, dedupe, apply idempotency, schema privacy.

---

## 7. Claude request design

### 7.1 Per-route configuration (single source of truth, server-side)

`spacetimedb/src/data/llm_routes.ts` (new). Client must not duplicate these values.

| Domain | Model (per milestone) | Effort / thinking | max_tokens | Timeout | Notes |
|--------|-----------------------|-------------------|-----------:|--------:|-------|
| `creation_race`, `creation_class` | `claude-sonnet-5-5` | `output_config.effort: "low"` (sweep to `medium`), omit `thinking` (adaptive) | 1024 (creation) | 60 s | Player-visible wait; keep thinking short. |
| `world_gen` (stage 1 / stage 2) | `claude-sonnet-5-5` | `low` (promote to `medium` only if eval shows canon-consistency gain) | 2048 -> raise, see below | 120 s | Long structured output. |
| `skill_gen`, `renown_perk_gen` | `claude-haiku-4-5` | **no `effort` field, no `thinking`** | 1500 / 1200 | 30 s | |
| `npc_conversation` | `claude-haiku-4-5` | same | 500 | 30 s | Hottest path; optimize first. |
| `combat_narration` | `claude-haiku-4-5` | same | 400 | 20 s | Non-blocking (combat continues on failure). |

Facts behind the table (claude-api skill):
- **Haiku 4.5 rejects `effort`** and uses `budget_tokens` for thinking; omitting `thinking` means no thinking (fastest). A generic "add effort to every request" builder will 400 on Haiku routes. Route config must be per-model.
- **Sonnet 5.5**: `{type:"disabled"}` is a 400; adaptive is the default; effort default is `high` (slow for chat), so **set effort explicitly** (`low` for chat/content/extraction, per Anthropic guidance). "From `medium` up the model thinks briefly before almost every reply, adding to time-to-first-token." `thinking: {type:"between_tools"}` (effort `high` or below, no other fields) is the lowest-thinking option; test only if `low` is still too slow, and check it composes with `output_config.format` in the spike.
- Forced `tool_choice` is a 400 on Sonnet 5.5, so use **structured outputs** (`output_config.format`), not forced tool calls, for JSON.
- Raise `world_gen` `max_tokens` (start at 4096) and treat `stop_reason: "max_tokens"` as a hard error (truncated JSON); structured outputs do not protect against truncation. Also handle `stop_reason: "refusal"` (dark-fantasy combat/creation content can trip `general_harms`): on refusal, error path with refund and an in-voice Keeper line.
- Skill guidance for Sonnet 5.5 is to include server-side `fallbacks: "default"` with beta header `server-side-fallback-2026-07-01` (Claude API only). It retries only `cyber`/`frontier_llm` declines, which are unlikely here; make it a route flag, off by default, and verify in the spike that it composes with structured outputs before enabling.
- Pricing constants for cost settlement: Sonnet 5.5 $2 / $10 per MTok in/out, cache read $0.20, 5-min write $2.50, 1-h write $4. Haiku 4.5 $1 / $5, cache read $0.10, 5-min write $1.25, 1-h write $2 (multipliers 0.1x / 1.25x / 2x).

### 7.2 Prompt layout for caching (stable prefix design)

Caching is a byte-exact prefix match over `tools -> system -> messages`; volatile content anywhere early kills everything after it. Current builders violate this: `buildNpcConversationSystemPrompt` interpolates NPC identity, affinity and memory into `system`, and `buildCharacterCreationPrompt`/`buildWorldGenPrompt` interpolate `${context}` at the end of system (fine for the prefix but per-request). Restructure builders to return **layers**:

```
tools:    none (structured outputs instead of tools; no per-request tool variance)
system[0] KEEPER_BIBLE          global, never varies. Voice + mechanical vocabulary + canon rules + few-shot exemplars.
                                cache_control {type:"ephemeral", ttl:"1h"}   <- longest TTL must come first
system[1] DOMAIN_BLOCK          per-domain instructions + schema notes (fixed per route)
                                cache_control {type:"ephemeral"}            (5 min)
messages[0].user.content[]:
   [0] CANON_SLICE              per-region / per-NPC card (stable across many calls to the same region/NPC)
                                cache_control {type:"ephemeral"}
   [1] VOLATILE                 per-player state, affinity tier, NPC memory JSON, quests, the player's message,
                                nearby enemies, timestamps if any   (NO breakpoint)
```

- Uses 3 of 4 breakpoints. **Never** interpolate player/NPC/time into `system`.
- `KEEPER_BIBLE` is one source file (`data/keeper_bible.ts`) reused by every route; `NARRATOR_PREAMBLE` in `llm_prompts.ts` (about 250 tokens) is far too small to cache alone.
- **Minimum cacheable prefix**: Sonnet 5.5 **512 tokens**, **Haiku 4.5 4096 tokens**. A short prefix silently does not cache (no error; `cache_creation_input_tokens: 0`). Either (a) grow the Bible with genuinely useful stable material (mechanical vocabulary from `data/mechanical_vocabulary.ts`, style exemplars, canon rules) to >= ~4.2K tokens so Haiku routes cache, or (b) move Haiku routes to Sonnet 5.5 `low`. Decide from spike data (TTFT and cost per completed task). Caches are model-scoped, so the same Bible text is cached once per model.
- **Structured outputs interplay:** changing `output_config.format` invalidates the prompt cache for that thread, and the first use of a schema (and any use after 24 h idle) pays grammar-compile latency. Consequences: keep one fixed schema per route; never vary per request; expect a slow first call per schema after idle. `max_tokens: 0` cache **pre-warming is rejected with `output_config.format`**, so pre-warm is not available for structured routes. For the hottest short routes (NPC, combat), the spike should A/B "structured outputs" vs "JSON instructed in prompt + existing `extractJson`" on TTFT and cache-read behavior.
- Structured-output schema limits (400 "Schema is too complex", 16 union params, nested/optional blow-up): `REGION_GENERATION_SCHEMA` (`llm_prompts.ts:221`) is deep and full of optionals. Splitting world gen into stages (C3) also keeps each schema small. Verify compilation in the spike before building on it.
- TTL: game traffic is bursty. Global Bible on 1 h (2x write, break-even at three reads per hour), domain/canon blocks on 5 min. Make TTL a config value in `llm_routes.ts`; verify `usage.cache_read_input_tokens > 0` on a second identical-prefix call in a standing test and log cache hit rate per route in `llm_job`.
- Concurrent identical-prefix requests all pay full write; a cache entry becomes readable once the first response begins streaming. Not a concern for the procedure path at low concurrency; note it for pre-generation bursts (C4).

### 7.3 Region and hop considerations

- Procedure egress originates from wherever maincloud runs (region not documented; treat as unknown). **Spike measures** RTT to `api.anthropic.com` from a procedure (tiny `max_tokens: 1` call) and compares with the current Worker path. Do not pre-commit to `inference_geo` (US-only routing) for latency; it is a data-residency/price knob, not a speed one.
- Put the fallback service in the region with the lowest measured RTT to both maincloud and Anthropic; keep `min-instances >= 1`.
- Client-facing latency floor is one client RTT plus the subscription push; nothing here changes that.

---

## 8. Component inventory

### 8.1 New

| Path | Purpose |
|------|---------|
| `spacetimedb/src/data/llm_routes.ts` | Route table (model, effort/thinking, max_tokens, timeout, TTL, schema key, pricing, priority). |
| `spacetimedb/src/data/keeper_bible.ts` | Stable global prefix (voice, vocabulary, canon rules, exemplars). |
| `spacetimedb/src/helpers/claude_request.ts` (+ `.test.ts`) | Pure `buildClaudeRequest(route, layers)` and `parseClaudeResponse(status, body, headers)` (usage, stop_reason, refusal, request-id). Shared with backend. |
| `spacetimedb/src/helpers/llm_queue.ts` (+ test) | `enqueueLlmJob`, `claimJob`, `settleJob`, caps, dedupe, reserve/settle. |
| `spacetimedb/src/helpers/llm_apply.ts` (+ test) | `applyLlmResult`, `applyLlmFailure`, `extractJson`; extracted from `index.ts` `submit_llm_result`. Per-domain functions keep the existing logic. |
| `spacetimedb/src/reducers/llm_procedures.ts` | `registerLlmProcedures(deps)`: `llm_run` scheduled procedure (`procedure({ name: 'llm_run', onSchedule: LlmDispatch }, { arg: LlmDispatch.rowType }, t.unit(), fn)`). Pass `name` so the `_wrapMethod('procedure')` export collector picks it up. |
| `spacetimedb/src/schema/tables.ts` additions | `LlmJob` (private: id, playerId, characterId, domain, status, attempt, inputJson, contextJson, resultText, errorCode, usage counters, requestId, timestamps; indexes `by_player`, `by_status`), `LlmDispatch` (schedule table: scheduledId, scheduledAt, jobId), `LlmSpend` (per player/day cost) and a global cap row. |
| `spacetimedb/src/views/llm.ts` | `my_llm_jobs` (index lookup by `ctx.sender`, status columns only) to drive the UI "Keeper is thinking" indicator. |
| `src/composables/useLlmStatus.ts` | Reads `my_llm_jobs`; exposes `isLlmProcessing` (replaces `useLlmProxy` output). |
| Spike only: `spacetimedb/src/spike/llm_spike.ts` (throwaway) | Procedures S1-S5; deleted after the gate. |
| Fallback only: `llm-service/` (replaces `llm-proxy/`), `spacetimedb/src/reducers/llm_service.ts`, tables `LlmService`, `LlmProgress`, views `service_llm_queue`, `my_llm_progress` | D2. |

### 8.2 Modified

| Path | Change |
|------|--------|
| `spacetimedb/src/index.ts` | Delete `prepare_creation_llm`/`prepare_world_gen_llm`/`prepare_skill_gen` (439-708), `submit_llm_result` (943-end), move `extractJson`; call `enqueueLlmJob` from `apply_level_up` (899-940); extend `sweep_llm_errors` to `llm_job`; register procedures. |
| `spacetimedb/src/reducers/creation.ts` (423-462) | `GENERATING_RACE` / `GENERATING_CLASS` transitions enqueue in the same tx (no client `prepare`). |
| `spacetimedb/src/helpers/travel.ts:266`, `reducers/intent.ts:1398`, `reducers/creation.ts:273` | Where `world_gen_state` PENDING is inserted, also enqueue (with dedupe by `by_source_location`). |
| `spacetimedb/src/reducers/npc_interaction.ts:95` | Replace `llm_task.insert` with `enqueueLlmJob`; budget via reserve/settle; keep persona/memory building but emit layers. |
| `spacetimedb/src/helpers/combat_narration.ts:168`, `helpers/renown.ts:84` | Replace inserts; fix the renown extra-column bug; remove OpenAI model strings. |
| `spacetimedb/src/helpers/llm.ts` | Reserve/settle, cost-aware daily spend, global ceiling. |
| `spacetimedb/src/data/llm_prompts.ts` (+ `llm_prompts.test.ts`) | Builders return layers; NPC per-NPC data moves out of `system`; `buildSkillGenResponseFormat` (OpenAI `response_format`) becomes an Anthropic `output_config.format` schema. |
| `spacetimedb/src/reducers/llm.ts` | Remove `validate_llm_request` (gpt model allowlist, `llm_request`); keep `set_api_key`. |
| `spacetimedb/src/schema/tables.ts` / `scheduled_tables.ts` | Remove `LlmTask`, `LlmRequest` (drop of empty/legacy tables; prefer new tables over altering existing ones to avoid `--clear-database`); register new tables and tick. |
| `src/composables/data/useCoreData.ts` (lines 37, 70, 113, 154, 190) | Drop `llm_task` subscription; add `my_llm_jobs`. |
| `src/App.vue` (lines 40, 465, 562, 738-741, 1152) | Replace `useLlmProxy` with `useLlmStatus`. |
| `src/composables/useWorldGeneration.ts`, `useCharacterCreation.ts:127`, `useSkillChoice.ts:54` | Remove client `prepare*` calls; keep state-derived "processing" flags. |
| `README.md`, `.claude/skills/run-local/SKILL.md` | Remove `llm-proxy`/`wrangler dev`/secret instructions; add API-key setup via `set_api_key`. |
| `src/module_bindings/` (and stale `client/src/module_bindings/`) | Regenerate (`pnpm spacetime:generate`); never hand-edit. |

### 8.3 Deleted (after live verification)

`llm-proxy/` (whole package), `src/composables/useLlmProxy.ts`, `src/composables/useLlm.ts`, `localStorage.llm_proxy_secret` and `VITE_LLM_PROXY_URL`/`VITE_LLM_PROXY_SECRET` usage, `submit_llm_result` reducer, `LlmRequest`/`LlmTask` tables.

### 8.4 Component boundaries

| Component | Responsibility | Talks to |
|-----------|----------------|----------|
| Trigger reducers / ticks | Game validation, call `enqueueLlmJob` in-tx | `llm_queue`, budget |
| `llm_queue` | Reserve budget, caps, dedupe, insert job + dispatch | `llm_job`, `llm_dispatch`, `llm_spend` |
| Executor (`llm_run` procedure **or** `llm-service`) | Claim, build request, call Claude, persist result | `claude_request`, `llm_config`/WIF, Anthropic |
| `claude_request` (pure) | Layered prompt + model params + response parsing | none (shared) |
| `llm_apply` | Apply result to game tables, narrate failures | game tables, `appendPrivateEvent`, `fail` |
| Client | Render subscriptions only; show `my_llm_jobs` status; **no LLM calls, no secrets** | SpacetimeDB |

---

## 9. Data flow, target state (Path B)

```
Player types "talk to Brakka"            SpacetimeDB                                               Anthropic
 client --reducer talk_to_npc--> [tx] validate, log player line, checkBudget+reserve,
                                      insert llm_job(queued), insert llm_dispatch(now)
                                 [commit] ------------------------> scheduler -> llm_run procedure
                                      tx1 claim + build layers (fresh memory/affinity) ---------
                                      fetch POST /v1/messages (Haiku 4.5, cached Bible+NPC card) ---> model
                                      <-------------------------------------------------- text + usage
                                      tx2 persist + settle    tx3 applyLlmResult -> npc_dialog/event rows
 client <-- subscription push (event_private, npc_dialog, my_llm_jobs 'completed') ----------------
```

Client-visible hops: **1 reducer round trip**. World gen additionally drops the client-driven `prepare` round trip.

---

## 10. Patterns to follow

### Pattern 1: Enqueue in the triggering transaction
**What:** Business reducers call `enqueueLlmJob(ctx, ...)` which inserts the job and schedule row atomically.
**When:** Every generation trigger, including server ticks (combat rounds, renown rank-up).
```typescript
// helpers/llm_queue.ts (sketch)
export function enqueueLlmJob(ctx: any, args: { domain: string; playerId: any; characterId: bigint; inputJson: string }) {
  reserveBudget(ctx, args.playerId, args.domain);            // throws/returns denial -> caller uses fail()
  const job = ctx.db.llm_job.insert({ id: 0n, status: 'queued', attempt: 0, queuedAt: ctx.timestamp, ...args });
  ctx.db.llm_dispatch.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch), jobId: job.id });
  return job;
}
```

### Pattern 2: Scheduled procedure, three short transactions around one fetch
```typescript
export const llm_run = spacetimedb.procedure(
  { name: 'llm_run', onSchedule: LlmDispatch },
  { arg: LlmDispatch.rowType }, t.unit(),
  (ctx, { arg }) => {
    const plan = ctx.withTx(tx => claimAndPlan(tx, arg.jobId));          // repeatable; returns null if not claimable
    if (!plan) return {};
    let out;
    try {
      const res = ctx.http.fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: plan.headers, body: plan.body, timeout: TimeDuration.fromMillis(plan.timeoutMs),
      });
      out = parseClaudeResponse(res.status, res.text(), res.headers);
    } catch (e) { out = { ok: false, code: 'transport', retryable: true }; }
    ctx.withTx(tx => persistAndSettle(tx, plan.jobId, out));
    ctx.withTx(tx => applyOrFail(tx, plan.jobId));
    return {};
  });
```
(`TimeDuration` import path to be confirmed in the spike; `ctx.sender` is not relied on: the job row carries `playerId`.)

### Pattern 3: Persist-then-apply
Store the raw Claude text before domain logic runs so apply failures never cost a second API call.

### Pattern 4: Layered prompts, frozen prefix, volatile last (section 7.2)

### Pattern 5: Private job table + per-player view
Queue and prompts are never public; the client sees only status via an index-lookup view (`my_llm_jobs`).

---

## 11. Anti-patterns to avoid

| Anti-pattern | Why bad | Instead |
|--------------|---------|---------|
| Client posts LLM text to a reducer (`submit_llm_result`) | Forgeable game state; needs the client online | Server produces and applies results |
| Public `llm_task` with prompts | Leaks NPC secrets/memory to every client | Private `llm_job` + status view |
| Holding a transaction across `fetch` | Not allowed; would block writers | tx1 / fetch / tx2 / tx3 |
| Unbounded concurrent procedures | Each holds a V8 instance/thread, never reclaimed (#4697); Anthropic 429s | Global in-flight cap + queue |
| Interpolating player/NPC/time into `system` | Zero cache reads | Layers; volatile in last user block |
| Same request builder sending `effort` to Haiku 4.5 | 400 | Per-route/per-model params |
| Assistant prefill or forced `tool_choice` for JSON | 400 on Sonnet 5.5 | `output_config.format` |
| Pre-warming with `max_tokens: 0` on structured routes | Rejected (and format change invalidates cache) | Rely on natural traffic or prompt-JSON on hot routes |
| Building prompts at enqueue time | Stale memory/canon for queued jobs | Build in tx1 |
| Logging request headers or bodies with the key | Key in `spacetime logs` | Log job id, route, request-id, usage only |
| Trusting `ctx.sender` inside scheduled procedures | Undocumented | Carry `playerId` on the job row |

---

## 12. Scalability considerations

| Concern | ~100 users | ~10K users | ~1M users |
|---------|-----------|------------|-----------|
| Concurrent in-flight Claude calls | `LLM_MAX_INFLIGHT` 4-6 in procedures | Move to D2 backend (thread-per-call in the DB host does not scale; async procedures still only proposed) | Sharded workers; batch/pre-generate |
| Anthropic rate limits | Default tier fine | Tier upgrade, 429 backoff via re-scheduled dispatch | Dedicated capacity, per-route pools |
| Cost | Per-player daily spend cap | Cache hit-rate monitoring, Haiku-first routes | Pre-generation and shared canon reuse (race/region reuse already exists) |
| Cache | 1 h Bible TTL, low traffic may miss | Warm by natural traffic | Multiple workspaces split caches (avoid) |
| Streaming | Not needed (typewriter) | D2 progress rows for long routes | D3 direct SSE |

---

## 13. Build order (spike gates everything after it)

**Phase 1 — Procedure + Claude spike (gate).** Throwaway `spike/llm_spike.ts`; no product code depends on it.
- S1: procedure `fetch` to a public URL, local and maincloud.
- S2: Anthropic call from a procedure: Haiku 4.5 (`max_tokens: 1` for RTT/TTFB; then a real NPC-sized call) and Sonnet 5.5 `effort: low` with a real structured-output schema (the region schema, to test grammar limits). Explicit `timeout`. Record `request-id`, `usage`, error shapes (429/529/timeout).
- S3: scheduled dispatch: reducer inserts schedule row with `ScheduleAt.time(ctx.timestamp)`; measure reducer commit -> procedure start p50/p95, and whether `ctx.sender` is empty.
- S4: concurrency: 6-8 simultaneous 10-15 s calls; measure a ping reducer's latency during them, first-call cold start (new instance/module recompile), and memory/instance growth. Also a republish while a call is in flight.
- S5: cache: same Bible+domain prefix twice; assert `cache_read_input_tokens > 0`; probe Haiku (4096 min) and Sonnet (512 min); check the structured-output + cache interaction and `between_tools` composability.
- S0 (cheap baseline): timestamps on the current Path A to get real hop cost.
- **Gate (proposed):** S1/S2 succeed >= 99% over ~100 calls locally and on maincloud; S3 dispatch p95 < 250 ms; S4 reducer p95 < 2x baseline with the chosen `LLM_MAX_INFLIGHT` and cold start acceptable (or mitigated); S5 cache reads observed. **Pass -> Phase 3B. Any of S1/S2/S3/S4 fails -> Phase 3D.**

**Phase 2 — Executor-agnostic seam** (unchanged by the gate outcome; may be started as soon as S1/S2 basics are known): `llm_routes.ts`, `keeper_bible.ts`, layered prompt builders + tests, `claude_request.ts` + tests, private `llm_job`/`llm_dispatch`/`llm_spend`, `llm_queue.ts`, extraction of `llm_apply.ts` from `submit_llm_result`, `my_llm_jobs` view, sweeper. Fix renown bug. Regenerate bindings.

**Phase 3B — Procedure executor:** `llm_run`, in-flight cap, retry/backoff via re-scheduling, persist-then-apply, key handling, then cut over domain by domain in this order: `npc_conversation` (simplest, shortest), `combat_narration`, `skill_gen` + `renown_perk_gen`, `creation_*`, `world_gen`.
**Phase 3D (alternative):** `llm-service/`, service identity + allowlist reducers/views, WIF host (Cloud Run), same domain order.

**Phase 4 — Client cutover and deletion:** `useLlmStatus`, remove `prepare*` client calls, delete `useLlmProxy.ts`, `useLlm.ts`, `llm-proxy/`, localStorage secret, docs. Make `llm_task` and `submit_llm_result` disappear from bindings.

**Phase 5 — Latency levers (measure each against baseline):** cache tuning (Bible size for Haiku, TTLs, hit-rate logging), effort sweep per route, structured-outputs vs prompt-JSON on hot routes, staged world gen and class gen (C3), speculative pre-generation (C4), streaming progress rows if on D2 (C1).

**Phase 6 — Live verification** with a real Claude key end to end (creation, explore/world gen, NPC talk, combat narration, level-up skills, renown perks) with recorded latency percentiles per route.

**Dependencies:** Phase 2 needs nothing from 3. 3B/3D need 1 and 2. 4 needs 3. 5 needs 3 (and streaming needs 3D). Research flags: Phase 1 and Phase 5 need deeper phase-level research; Phases 2 and 4 are standard patterns.

---

## 14. Open questions the spike/phase research must answer

1. Does 2.10.1 keep reducers responsive while N procedures are blocked in `fetch` (PR #4663 lane status)? What is cold-start cost of a new instance for this module?
2. `ScheduleAt.time(now)` fire latency and the `ctx.sender`/identity in scheduled procedures.
3. `TimeDuration` import path and whether a procedure can read wall-clock elapsed time (fallback: compare `tx.timestamp` across `withTx` calls, or use Anthropic `request-id`/response headers).
4. Does `REGION_GENERATION_SCHEMA` compile as a structured-output schema, or must it be split/loosened?
5. Does `output_config.format` compose with `thinking: {type:"between_tools"}` and with `fallbacks: "default"`?
6. Maincloud region and RTT to `api.anthropic.com`.
7. TS SDK mechanism for feeding an ambient identity token to WIF on Cloud Run (identity-token provider vs token file).

## Sources

- Installed `spacetimedb@2.10.1` typings: `spacetimedb/node_modules/spacetimedb/dist/server/{procedures,http_internal,http_shared,http_handlers,schema}.d.ts` (HIGH)
- SpacetimeDB docs: Procedures (https://spacetimedb.com/docs/functions/procedures/), Schedule Tables (https://spacetimedb.com/docs/tables/schedule-tables/), HTTP Handlers (https://spacetimedb.com/docs/functions/http-handlers/) (HIGH/MEDIUM)
- SpacetimeDB issue #4697, V8 procedures blocking host calls and instance pool growth (https://github.com/clockworklabs/SpacetimeDB/issues/4697) (MEDIUM; status unverified for 2.10.1)
- `.planning/notes/platform-upgrade-research.md`, `.planning/todos/pending/2026-09-29-spike-procedure-http-to-retire-llm-proxy.md` (project sources; #4546, #4630)
- claude-api skill: `shared/prompt-caching.md`, `shared/model-migration.md` (Sonnet 5.5 section), model table cached 2026-09-25 (HIGH)
- Anthropic docs: Structured outputs (grammar compile latency, 24 h cache, format change invalidates prompt cache, complexity limits) (https://platform.claude.com/docs/en/build-with-claude/structured-outputs.md); Authentication and WIF (https://platform.claude.com/docs/en/manage-claude/authentication.md, https://platform.claude.com/docs/en/manage-claude/workload-identity-federation.md) (HIGH)
- Repo files read: `spacetimedb/src/index.ts`, `schema/tables.ts`, `helpers/llm.ts`, `helpers/combat_narration.ts`, `helpers/renown.ts`, `reducers/llm.ts`, `reducers/npc_interaction.ts`, `data/llm_prompts.ts`, `llm-proxy/src/index.ts`, `src/composables/useLlmProxy.ts`, `useLlm.ts`, `useWorldGeneration.ts`
