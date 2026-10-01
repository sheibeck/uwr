# Requirements: UWR v2.2 LLM — Claude Engine

**Defined:** 2026-09-29
**Core Value:** A world that writes itself around its players — every character is unique, every region is discovered, and the narrative responds to what players actually do.

**Milestone goal:** Replace OpenAI with Claude Sonnet 5.5 as the engine behind all narrative generation, with the fastest possible experience and the best narrative results.

**Terminology:** "Server-side", "server-owned" and "private tables" all refer to the SpacetimeDB module. Private tables are SpacetimeDB tables without `public: true`: only the module's reducers, procedures and views can read them, and clients cannot subscribe to them. No separate server is involved on the primary path. Only on a spike no-go (PIPE-09) does a separate backend service execute calls, and even then the job tables stay in SpacetimeDB.

## v2.2 Requirements

### Spike (go/no-go gate)

- [x] **SPIKE-01**: Operator can run a throwaway SpacetimeDB 2.10 procedure locally that reaches a public URL, `GET /v1/models`, and a small Sonnet 5.5 call, with results and server logs recorded
- [x] **SPIKE-02**: The spike measures structured-output calls with the real skill and region schemas at effort `low` and `medium`, and records the failure shape of a forced timeout and a bad key
- [x] **SPIKE-03**: The spike measures:
  - scheduled-dispatch latency
  - `ctx.sender` in scheduled procedures
  - reducer and combat-tick latency with 6–8 concurrent in-flight calls
- [x] **SPIKE-04**: A written go/no-go decision record picks the executor.
  - Gate:
    - every non-drill call succeeds
    - dispatch p95 < ~250 ms
    - reducer and tick p95 < 2× baseline
  - The gate is evaluated on a separate maincloud `uwr-spike` database, which the user publishes and deletes manually (revised 2026-09-29). Local results are provisional context, because the local machine is unrepresentative.

### Claude Request Layer

- [x] **CLAUDE-01**: Every LLM call uses `claude-sonnet-5-5`. The model ID is defined in one constants module, and per-route settings (effort, max_tokens, timeout, schema) live in one route table.
- [x] **CLAUDE-02**: A pure, unit-tested request builder and response parser handle Sonnet 5.5 bodies.
  - The builder produces valid bodies: explicit effort, required `max_tokens`, no forbidden params.
  - The parser reads the first `text` block and treats `max_tokens` and `refusal` stop reasons as failures.
- [x] **CLAUDE-03**: Every JSON route uses Claude structured outputs (`output_config.format`) with schemas that pass a subset linter. The existing v2.0 validators still enforce ranges and power budgets.
- [x] **CLAUDE-04**: Prompts are layered into a stable cacheable prefix (Keeper Bible + route block) and a volatile tail. Player-written text is wrapped in delimiter tags.

### Server-Owned Pipeline (SpacetimeDB)

- [x] **PIPE-01**: Every LLM-driven action (creation, world gen, skills, NPC chat, combat narration, renown) is queued in a private SpacetimeDB table inside the triggering reducer's transaction. The client never calls the LLM or a proxy.
- [x] **PIPE-02**: SpacetimeDB applies LLM results, and they survive the player refreshing or closing the tab mid-generation.
- [x] **PIPE-03**: Two tabs on the same identity cannot trigger duplicate LLM calls for the same action.
- [x] **PIPE-04**: Failures are handled by error class:
  - Transient errors (429 with `retry-after`, 529, 5xx, timeout) retry by rescheduling, with a bounded number of attempts.
  - Non-retryable errors (auth, spend cap, refusal, 400) fail fast.
  - Creation and world gen never auto-retry without player action.
- [x] **PIPE-05**: Stuck jobs are swept. On failure, generation locks release, the reserved budget is refunded, and the player sees an in-voice Keeper message.
- [x] **PIPE-06**: A global in-flight LLM call cap keeps combat ticks and reducers responsive while calls run.
- [x] **PIPE-07**: Combat narration never blocks combat and is dropped if it arrives late.
- [x] **PIPE-08**: Renown perk generation actually reaches the LLM (the swallowed insert bug in `helpers/renown.ts` is fixed), covered by a regression test.
- [x] **PIPE-09**: Jobs are executed by the executor SPIKE-04 chooses:
  - go: a scheduled SpacetimeDB procedure calling Claude via `ctx.http.fetch`
  - no-go: a backend service authenticated to Anthropic via Workload Identity Federation, which reads and writes the SpacetimeDB job tables through service-only views and reducers

### Security

- [x] **SEC-01**: No client can read another player's prompts, NPC secrets or LLM outputs. Job and prompt tables are private in SpacetimeDB, and clients see only their own job status through a view.
- [x] **SEC-02**: No client can submit or forge LLM results (`submit_llm_result` removed).
- [x] **SEC-03**: No LLM credential exists in the browser.
  - `llm-proxy/`, `useLlmProxy` and the proxy env vars are removed.
  - Existing `localStorage.llm_proxy_secret` values are cleared once.
  - The built bundle greps clean.
- [x] **SEC-04**: The Anthropic credential is held server-side only and is never logged. On go, the API key lives in the private SpacetimeDB `llm_config` table. On no-go, the backend service uses WIF and there is no static Anthropic key; its service-identity secret is covered by the runbook. Key setup and `--clear-database` recovery are documented in a runbook.
- [x] **SEC-05**: The old `llm_task`/`llm_request` tables and dead v2.0 pipeline code are removed without `--clear-database`, using a two-publish removal.

### Cost

- [x] **COST-01**: Every call's usage (input, output, cache-write, cache-read tokens) is recorded per route.
- [x] **COST-02**: The per-player daily budget is cost-weighted, with a call-count backstop. Cost is reserved at enqueue and settled on result.
- [x] **COST-03**: A global daily spend ceiling and an admin kill switch halt all LLM calls.

### Latency

- [x] **LAT-01**: Each route's effort and `max_tokens` are tuned from measured latency and output size, using an effort sweep and `max_tokens` from the measured p99.
- [x] **LAT-02**: Prompt caching is active on the stable prefix and verified per route (`cache_read_input_tokens > 0`).
- [x] **LAT-03**: World gen is staged. The player can enter a new region, with its start location and first NPC, before the rest finishes generating.
- [x] **LAT-04**: Class reveal is staged. The player sees class identity and first ability before the full class finishes.
- [x] **LAT-05**: The player sees in-voice Keeper progress lines while generation runs.
- [x] **LAT-06**: Classes for both archetypes are generated in parallel once race is interpreted. This applies only if the measured class reveal is still over ~10 s after LAT-04.

### Operations

- [x] **OPS-01**: Admin can fire a live smoke-test call and see key status (set / valid). The smoke test also warms schemas.
- [x] **OPS-02**: Admin can view `/llm stats`: calls, cost, p50/p95 latency and errors by route.

### Quality & Verification

- [ ] **QUAL-01**: A golden set of ~25 prompts (5 adversarial) runs with mechanical assertions. Live runs are operator-approved, and the owner approves the tone.
- [ ] **QUAL-02**: Every domain is verified end-to-end with a real Claude call locally, with per-route latency percentiles recorded. The maincloud run is manual by the user.
- [ ] **QUAL-03**: Failure drills (truncation, refusal, 401, 429, 529, spend cap, timeout) each produce the correct player-facing behavior.
- [x] **QUAL-04**: Every phase ships unit tests. LLM code paths are testable offline through a mock procedure context (fake `ctx.http`, `withTx`).

## Future Requirements

Deferred. Tracked but not in the v2.2 roadmap.

- **STREAM-01**: Stream NPC chat and combat narration through progress rows. Only possible if the backend-service executor is built.
- **PREGEN-01**: Pre-generate level-up skill offers before the player levels.
- **BATCH-01**: Use the Batch API for non-interactive generation.
- **COAL-01**: Coalesce combat narration across rapid combat events.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Haiku 4.5 (or any second model) | User decision: Sonnet 5.5 for every call |
| Streaming LLM responses | Procedures can't stream (buffered `ctx.http.fetch`); typewriter covers short text. Revisit only via STREAM-01 |
| Speculative neighbor-region generation | Contradicts "world built through play" |
| Client-side retries or client-held credentials | Server owns all LLM calls |
| Server-side `fallbacks` beta | Adds a beta header and doesn't cover `general_harms` refusals; handle refusals in-voice instead |
| Opus/Fable-tier models for narration | Latency and cost; Sonnet 5.5 is the quality target |
| Second LLM call to moderate NPC messages | Doubles latency and cost; delimiter tags + in-voice refusal cover it |

## Traceability

Filled by roadmap creation (2026-09-29). Each requirement maps to exactly one phase.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SPIKE-01 | Phase 39 | Complete |
| SPIKE-02 | Phase 39 | Complete |
| SPIKE-03 | Phase 39 | Complete |
| SPIKE-04 | Phase 39 | Complete |
| CLAUDE-01 | Phase 40 | Complete |
| CLAUDE-02 | Phase 40 | Complete |
| CLAUDE-03 | Phase 40 | Complete |
| CLAUDE-04 | Phase 40 | Complete |
| PIPE-01 | Phase 41 | Complete |
| PIPE-02 | Phase 41 | Complete |
| PIPE-03 | Phase 40 | Complete |
| PIPE-04 | Phase 41 | Complete |
| PIPE-05 | Phase 41 | Complete |
| PIPE-06 | Phase 41 | Complete |
| PIPE-07 | Phase 41 | Complete |
| PIPE-08 | Phase 40 | Complete (job enqueued + regression test; the Phase 41 executor sends it to Claude) |
| PIPE-09 | Phase 41 | Complete |
| SEC-01 | Phase 40 | Complete (llm_* tables private + own-jobs view; public `npc`/`npc_memory`/`npc_dialog` exposure tracked in todo 2026-09-29-make-npc-secret-and-memory-tables-private; `llm_task` closes in Phase 42) |
| SEC-02 | Phase 42 | Complete |
| SEC-03 | Phase 42 | Complete |
| SEC-04 | Phase 41 | Complete |
| SEC-05 | Phase 42 | Complete |
| COST-01 | Phase 41 | Complete |
| COST-02 | Phase 41 | Complete |
| COST-03 | Phase 43 | Complete |
| LAT-01 | Phase 43 | Complete |
| LAT-02 | Phase 43 | Complete |
| LAT-03 | Phase 43 | Complete |
| LAT-04 | Phase 43 | Complete |
| LAT-05 | Phase 43 | Complete |
| LAT-06 | Phase 43 | Complete |
| OPS-01 | Phase 41 | Complete (code; live smoke test with the real key deferred by the user, see 41-VERIFICATION.md) |
| OPS-02 | Phase 43 | Complete |
| QUAL-01 | Phase 44 | Pending |
| QUAL-02 | Phase 44 | Pending |
| QUAL-03 | Phase 44 | Pending |
| QUAL-04 | Phase 40 | Complete |

**Coverage:**

- v2.2 requirements: 37 total
- Mapped to phases: 37
- Unmapped: 0

**By phase:**

- Phase 39 (Procedure-to-Claude Spike): 4 (SPIKE-01 to SPIKE-04)
- Phase 40 (Claude Request Layer and Job Seam): 8 (CLAUDE-01 to CLAUDE-04, PIPE-03, PIPE-08, SEC-01, QUAL-04)
- Phase 41 (Executor and Domain Cutover): 11 (PIPE-01, PIPE-02, PIPE-04 to PIPE-07, PIPE-09, SEC-04, COST-01, COST-02, OPS-01)
- Phase 42 (Client Cutover and Legacy Removal): 3 (SEC-02, SEC-03, SEC-05)
- Phase 43 (Latency Tuning, Staged Generation and Budget): 8 (LAT-01 to LAT-06, COST-03, OPS-02)
- Phase 44 (Live Verification and Tone Eval): 3 (QUAL-01 to QUAL-03)

Note: QUAL-04 (every phase ships unit tests) is mapped to Phase 40, where the offline mock procedure context is built, but it binds every phase.

---
*Requirements defined: 2026-09-29*
*Last updated: 2026-09-29 after roadmap creation (traceability filled)*
