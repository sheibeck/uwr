# Project Research Summary

**Project:** UWR v2.2 LLM — Claude Engine
**Domain:** Server-authoritative multiplayer narrative RPG (SpacetimeDB 2.10.1 TS module + Vue 3), migrating LLM generation from OpenAI-via-browser-proxy to Anthropic Claude
**Researched:** 2026-09-29
**Confidence:** MEDIUM-HIGH. Anthropic and SpacetimeDB API facts are HIGH. V8 concurrency, procedure HTTP error semantics and all latency numbers are unmeasured until the spike.

## Decisions that override the research files

1. **One model: `claude-sonnet-5-5` for every call. No Haiku anywhere.**
   - Superseded:
     - per-model tiering
     - the two-model `MODEL_CAPS` matrix
     - heavy/light budget pools split by model
     - the Haiku 4096-token cache floor and retirement risk
     - "omit effort on Haiku" branching
   - Kept:
     - The model ID lives in one constants module (`data/llm_models.ts`).
     - Per-route settings (effort, `max_tokens`, timeout, schema) live in `data/llm_routes.ts`.
2. **Direct first, fallback second.**
   - Phase 1 is a go/no-go spike of scheduled SpacetimeDB procedures calling Claude via `ctx.http.fetch`. Local is automatic. The maincloud leg is a manual user publish.
   - Pass: procedure executor, and retire `llm-proxy/`, `useLlmProxy` and the localStorage secret.
   - Fail: backend service (contingent). Don't plan it in detail unless the spike fails.
3. Every phase ships unit tests.

## Executive Summary

UWR needs a server-owned LLM pipeline.

- **Today:** every call takes about five hops through the player's browser tab (reducer, public `llm_task`, subscription push, Cloudflare Worker, OpenAI, `submit_llm_result`).
- **Target:**
  - A reducer inserts a private job row and a schedule row in its own transaction.
  - A scheduled procedure calls `https://api.anthropic.com/v1/messages` with raw `ctx.http.fetch`. No SDK can run in the module.
  - The result is applied server-side. Clients only subscribe to results and a status view.
- **Why:** this is mainly a security, reliability and simplicity win. Results survive tab close, there are no double-tab calls and no browser secret. Hop removal saves only about 0.1 to 0.5 s against waits of 2 to 60 s. The real latency levers are effort, output size, caching, staged generation and speculative pre-generation.

**Sonnet 5.5 rules for the request builder:**

- It thinks by default at effort `high`, so set `output_config.effort` explicitly (start `low`).
- `max_tokens` is required, and thinking counts against it.
- These are all 400s: `thinking:{type:"disabled"}`, `budget_tokens`, non-default `temperature`/`top_p`/`top_k`, prefill, forced `tool_choice`.
- Parse the first `text` block, not `content[0]`.
- Check `stop_reason` (`max_tokens`, `refusal`) before parsing.
- JSON routes use `output_config.format` with a static, subset-linted schema. The v2.0 validators stay as the real enforcement, because schemas can't express ranges.
- Sonnet's 512-token cache minimum makes caching viable on a shared Keeper preamble. The Haiku plan couldn't do that.

**Cost:** about 2x per token for the former gpt-5-mini routes (NPC chat, combat narration, skills, renown). A call at 4K in / 1.5K out is about $0.023, so an all-Sonnet 50-call day is about $1.15 per player. The flat 50-call budget must become cost-weighted, with a global ceiling and kill switch.

**Main risks:**

- **Platform:** a blocking `ctx.http.fetch` parks a V8 worker per call, and the pool never shrinks (SpacetimeDB #4697). With all-Sonnet traffic there are no fast calls to make this a non-issue.
  - Mitigate with a global in-flight cap (start 4 to 6) and tight per-route timeouts.
  - The spike must measure reducer and combat-tick latency under concurrent calls.
- **Undiagnosed 2.0.1 failure:** it was never confirmed as a timeout, and could be a DNS/egress filter. The spike must read logs and run a three-rung ladder.

## Reconciling disagreements

| Topic | Conflict | Recommendation |
|---|---|---|
| **Fallback shape** | STACK: procedure keeps `ctx.http.fetch` but targets Cloud Run with a bearer secret. ARCHITECTURE: "DB is the queue", where an allowlisted service identity subscribes and writes back through service-only reducers. | **Use ARCHITECTURE's D2 (DB as queue).** See the D2 rationale below. |
| **Queue table** | STACK: convert `llm_task` to a schedule table. ARCHITECTURE: new private `llm_job` + `llm_dispatch`. | **New tables** (`llm_job`, `llm_dispatch`, `llm_spend`, `llm_call_log`). This avoids altering populated tables and `--clear-database`, which also wipes the key. Drop the old tables in a second publish, after purging their rows. |
| **Transactions** | PITFALLS: 2. ARCHITECTURE: 3 (claim, fetch, persist+settle, apply). | **Use 3.** Persisting the paid response first lets an apply failure re-run from stored text with no second billed call. The job row is the state machine, because scheduled procedures delete the schedule row before running. |
| **Hop value** | FEATURES leans on it; the other two files estimate 0.1 to 0.5 s. | Treat hops as a reliability and security win. Don't promise latency from hops or caching. Take a real baseline in the spike. |
| **Caching** | Layered 1 h bible TTL vs skip for one-shot routes vs "cost lever only". | Cache the bible and per-route block. Use 5 min TTL, or 1 h on the bible if traffic is sparse. Put volatile content last. Adopt per route only where `cache_read_input_tokens > 0`. Keep one static schema per route. |
| **Budget pools and model branching** | FEATURES: heavy/light pools, per-model builder. | Superseded. Use one cost-weighted per-player daily spend in micro-USD (reserve then settle), plus a global ceiling and kill switch, plus a call-count backstop. Keep a test that no forbidden keys appear in any request body. |
| **Server-side `fallbacks` beta** | ARCHITECTURE: off-by-default route flag. STACK: skip. | Skip. It adds a beta header and doesn't retry `general_harms`. Handle refusal with an in-voice line and let the player rephrase. |

**D2 rationale:**

- STACK's variant still pins a V8 thread per call. That is the exact risk that would trigger the fallback.
- STACK's variant needs a public URL, because loopback is blocked and local dev would need a tunnel.
- STACK's variant fails if procedure HTTP itself is the problem.
- D2 works against local SpacetimeDB and keeps credentials out of the browser.
- D2 is the only shape that enables streaming.
- D2's cost is one long-lived service-identity secret with a tiny blast radius (claim and complete queued jobs only).
- Host on Cloud Run, where WIF has an ambient OIDC token. Cloudflare Workers can't get a workload identity, so Workers means a static API key, not WIF.

## Security and correctness defects (fix regardless of path)

1. **Public `llm_task` leaks prompts.**
   - The table is `public: true` and stores full `systemPrompt`/`userPrompt`. Any client can read every player's prompts, including NPC secrets, memory and other players' free text.
   - The new job table must be private. Clients get only a per-player status view (`my_llm_jobs`, index lookup, no prompts).
   - Add a test that `llm_config` and `llm_job` are not public.
2. **Client-trusted `submit_llm_result`.**
   - Any player can submit hand-written "LLM output" for their own task, and it gets applied (classes, abilities, regions, NPC memory, affinity).
   - Delete the reducer in the cutover phase.
   - If D2 is used, gate write-back to an allowlisted service identity.
3. **Renown insert bug.**
   - `helpers/renown.ts:84` inserts `completedAt`, `resultText` and `errorMessage`, which are not `LlmTask` columns.
   - The `try/catch` swallows it and falls back to the static perk pool, so LLM renown perks likely never fire.
   - Fix it in Phase 2 with a regression test.
4. **`maxTokens` never exercised.** The proxy never forwarded it, so the 400/500/1024/1500/2048 values have never run. Re-derive them from measured output, with thinking included.
5. **Budget races.** Budget increments at enqueue for NPC but at result for the other routes, with no reservation. Replace with reserve then settle.
6. **Browser credentials.**
   - `localStorage.llm_proxy_secret` and `VITE_LLM_PROXY_*` persist after the code is deleted.
   - Ship a one-time `removeItem` and grep `dist/`.

## Streaming decision

Procedures can't stream. `ctx.http.fetch` is synchronous and returns a fully buffered `SyncResponse`. JSON domains can't show partial output anyway. NPC chat and combat narration are short and already animated by the typewriter.

**Recommendation: keep "Streaming LLM responses" in Out of Scope for v2.2.** Revisit only if the spike fails and the D2 backend is built anyway, or if measured NPC-chat latency is unacceptable. In that case NPC and combat prose could stream through throttled progress rows. Record the decision in PROJECT.md either way.

## Key Findings

### Recommended Stack

No new npm dependencies on the primary path.

- The key stays in the private `llm_config` singleton, set by admin `set_api_key`.
- Use a dedicated Console workspace with spend and rate limits, and a single-workspace service-account key with expiry.
- WIF isn't obtainable from a module, so direct path means a scoped API key.

**Core technologies:**

- Anthropic Messages API (`anthropic-version: 2023-06-01`, `x-api-key`) via raw `ctx.http.fetch`.
- `claude-sonnet-5-5`: $2/$10 per MTok, cache read $0.20, 512-token cache minimum, retirement not before 2027-09-28.
- `effort: "low"`, sweeping `low` vs `medium`. `thinking:{type:"between_tools"}` is an untested thinking-off variant. Check in the spike that it composes with `output_config.format`.
- `output_config.format` schema mapping:
  - drop `name` and `strict`
  - `['number','null']` becomes `anyOf`
  - no min/max/length/recursion
  - `additionalProperties:false`
- SpacetimeDB 2.10.1 scheduled procedures: `procedure({name, onSchedule}, ..., t.unit(), fn)`. The `name` is required by the repo's `_wrapMethod`. Use `ctx.withTx` and an explicit `TimeDuration` (default 30 s, max 180 s).
- Fallback only: `@anthropic-ai/sdk ^0.129`, Hono, Cloud Run + WIF, Node 22.

### Expected Features

**Must have (table stakes):**

- central models/routes constants
- one pure builder/parser
- structured outputs with validators retained
- stop-reason handling
- error taxonomy (401/402/403 alert, 429 with or without `retry-after`, spend-cap no retry, 529/5xx one rescheduled retry)
- per-route timeouts
- graceful degradation with locks released and budget uncharged on failure
- cost-weighted budget from all four usage fields, plus a global cap and kill switch
- private job table and call log
- admin live smoke test (also schema warm-up)
- key status
- sweeper
- results survive refresh
- prompt layering with cache logging
- staged in-voice progress lines
- droppable combat narration
- golden-set tone eval

**Should have (after core validates):**

- staged generation (world gen stage 1 region, start location and first NPC, then stage 2 the rest; class identity and first ability first)
- speculative class generation (Warrior and Mystic in parallel)
- shared canon cache block
- coalesced combat narration
- `/llm stats`

**Defer (v2.3+):**

- streaming (conditional on D2)
- level-up skill pre-generation
- Batch API
- speculative neighbor-region generation (contradicts "world built through play")

### Architecture Approach

- `enqueueLlmJob` runs in the triggering reducer's transaction. It does budget reserve, per-player, same-target (`by_source_location`) and global in-flight caps, then inserts `llm_job` and `llm_dispatch`.
- The executor claims the job, builds the request from fresh state, calls Claude, persists the result and usage, then `applyLlmResult` (extracted from the ~700-line `submit_llm_result`) applies it.
- Retry means re-inserting a schedule row with backoff, because procedures can't sleep. The sweeper re-runs apply from stored text.

**Major components:**

1. `helpers/claude_request.ts` (pure): build, parse, classify. Shared with any fallback backend.
2. `helpers/llm_queue.ts`: enqueue, reserve/settle, caps, dedupe, claim.
3. `reducers/llm_procedures.ts`: the `llm_run` scheduled procedure.
4. `helpers/llm_apply.ts`: per-domain apply/failure.
5. `data/llm_routes.ts`, `data/llm_models.ts`, `data/keeper_bible.ts`.
6. `views/llm.ts` + `useLlmStatus.ts`: replaces `useLlmProxy`.

### Critical Pitfalls

1. **Spike misdiagnosis (DNS/SSRF/egress).** Run a three-rung ladder on local and maincloud: public URL, `GET /v1/models`, tiny Sonnet POST. Also run `nslookup`, record versions, and read logs for `errno: 21`.
2. **Blocking fetch pins a V8 instance per call.** Use an in-flight cap of 4 to 6 and explicit timeouts. Spike-test tick punctuality, same-connection reducer latency and memory at 8 concurrent calls. The client must never await an LLM procedure.
3. **Transaction boundaries and lost jobs.**
   - No fetch in `withTx`, and no async `withTx`.
   - Scheduled procedures delete the schedule row first.
   - Publish mid-flight can kill a call.
   - Anthropic has no idempotency key.
   - Use the job row as state machine, a status-guarded apply, persist-then-apply and a sweeper.
   - Never auto-retry creation or world gen without player action.
4. **OpenAI-shaped requests and Sonnet parameter rules.** Raw HTTP doesn't strip unsupported schema keywords the way the SDK does. Unit-test body snapshots and add a schema linter.
5. **Budget and key handling.**
   - Sum all four usage fields, since thinking counts as output.
   - Charge in one place.
   - `--clear-database` wipes the key, so write a runbook.
   - Redaction test: never log headers or bodies.
   - Set the key from an env var, not shell args.
6. **Tone drift and injection.** Build a golden set of about 25 prompts (5 adversarial). Use delimiter tags around player text, and an in-voice refusal line.

## Implications for Roadmap

Suggested phases: 6.

### Phase 1: Procedure + Claude Spike (go/no-go gate)

- **Rationale:** everything depends on whether procedure HTTP to Anthropic is reliable and leaves the tick loop healthy.
- **Delivers:** throwaway `spike/llm_spike.ts` plus a decision record. It covers:
  - the ladder on local, then a manual maincloud leg
  - Sonnet at `low` and `medium` with real skill and region schemas
  - `between_tools` combined with structured output
  - a forced timeout and a bad key (failure shape, header exposure for `retry-after`/`request-id`)
  - dispatch latency (`ScheduleAt.time(now)`) and `ctx.sender` in scheduled procedures
  - 6 to 8 concurrent 10 to 15 s calls alongside a ping reducer and combat tick
  - publish mid-flight
  - cache read on a repeated prefix
  - current-path baseline latency
- **Gate:** go if local and maincloud succeed, dispatch p95 is under about 250 ms, and reducer/tick p95 is under about 2x baseline at the chosen cap. Otherwise Phase 3D.
- **Avoids:** pitfalls 1, 2, 3.
- **Research flag:** YES.

### Phase 2: Claude Layer + Executor-Agnostic Seam

- **Rationale:** invariant to the gate outcome.
- **Delivers:**
  - constants modules
  - layered prompts with player text in delimiter tags
  - `claude_request.ts`
  - schema migration and linter
  - new private tables
  - `llm_queue.ts`
  - `llm_apply.ts` extraction
  - `my_llm_jobs` view
  - sweeper extension
  - the renown bug fix
  - `createMockProcCtx` test utilities (fake `ctx.http`, and `withTx` that rejects promises and can re-invoke)
- **Avoids:** pitfalls 4, 8, 9, 12, 13, 15.
- **Research flag:** skip, except verify that `REGION_GENERATION_SCHEMA` compiles.

### Phase 3: Procedure Executor and Domain Cutover (3B); or backend service D2 (3D, contingent)

- **Delivers (3B):**
  - `llm_run` with 3 transactions
  - in-flight cap
  - reschedule-based retry
  - key handling and `llm_status`
  - redaction test
  - domain cutover order: NPC, combat narration, skills + renown, creation, world gen
  - reducers enqueue in-transaction, so there are no client `prepare_*` calls
  - purge old table rows (publish 1)
- **Delivers (3D):** `llm-service/` on Cloud Run with WIF, an allowlist, and service-only reducers and views.
- **Avoids:** pitfalls 3, 4, 5, 6, 11, 12.
- **Research flag:** YES for 3B backpressure if the spike is marginal. 3D needs full research only if triggered.

### Phase 4: Client Cutover and Deletion

- **Delivers:**
  - `useLlmStatus`
  - delete `useLlmProxy.ts`, `useLlm.ts`, `llm-proxy/`, `submit_llm_result`, `validate_llm_request`
  - drop the `llm_task`/`llm_request` tables (publish 2)
  - remove the env vars
  - update README and run-local skill
  - one-time `localStorage` cleanup and `dist/` grep
  - regenerate bindings
- **Closes:** both security defects.
- **Avoids:** pitfalls 14 and 5.
- **Research flag:** skip.

### Phase 5: Latency Tuning and Budget Calibration

- **Delivers:**
  - effort sweep
  - `max_tokens` from measured p99 x 1.5
  - cache verification and TTL choice
  - structured-output vs prompt-JSON A/B on NPC and combat
  - staged world and class generation
  - staged progress lines
  - speculative class generation if the reveal is over about 10 s
  - recalibrated cost budget, global cap and kill switch
- **Research flag:** YES.

### Phase 6: Live Verification and Tone Eval

- **Delivers:**
  - operator-approved live run of every domain with per-route latency percentiles
  - failure drills: truncation, refusal, 401, 429, 529, spend-cap, timeout
  - owner-approved golden set
  - usage reconciled against the Console
  - key runbook (`--clear-database`, separate local and maincloud keys)
  - streaming decision recorded
- **Research flag:** skip.

### Phase Ordering Rationale

- The spike gates only the executor, so a failure has low recovery cost.
- Deletion is separate and uses two publishes, avoiding `--clear-database` and key loss.
- Measurement precedes optimization.
- The security defects are closed by architecture in phases 3 and 4. The renown bug is fixed in Phase 2.

### Research Flags

- Needs research: Phases 1, 5, and Phase 3 (conditional).
- Standard patterns: Phases 2, 4, 6.

## Confidence Assessment

| Area | Level | Notes |
|---|---|---|
| Stack | HIGH | Official docs, installed typings, claude-api skill. LOW spots: procedure HTTP throw semantics, `between_tools` with `output_config.format`. |
| Features | MEDIUM | API facts HIGH. Latency targets, pool sizes and per-call costs are estimates. Haiku recommendations are superseded. |
| Architecture | MEDIUM-HIGH | Typings verified. V8 concurrency is MEDIUM. Dispatch latency and scheduled-procedure identity are UNKNOWN. |
| Pitfalls | MEDIUM-HIGH | Anthropic side HIGH. Several SpacetimeDB issue fix versions are unconfirmed (#4954, #4663, #5220). |

**Overall: MEDIUM-HIGH.**

### Gaps to Address

- Why 2.0.1 failed locally: read logs in the spike.
- V8 pool growth and tick impact under all-Sonnet concurrency: measure, then set the in-flight cap from data.
- Whether `ctx.http.fetch` responses expose headers (`retry-after`, `request-id`).
- Whether an in-flight procedure survives `spacetime publish`.
- Whether `REGION_GENERATION_SCHEMA` compiles, or needs staged schemas.
- Sonnet latency per route at each effort level. No numbers exist yet.
- Initial cost-budget and global-ceiling values are guesses.
- Whether dropping `llm_task` forces `--clear-database`. That would be a manual user action and would wipe the key.
- The maincloud leg is always manual.

## Sources

The four research files (STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md), `.planning/PROJECT.md`, and the Anthropic docs, SpacetimeDB docs and installed typings, GitHub issues and repo files they cite. Primary sources are HIGH, GitHub issue summaries are MEDIUM, and the Cloudflare OIDC request plus all latency and cost estimates are LOW.

---
*Research completed: 2026-09-29*
*Ready for roadmap: yes*
