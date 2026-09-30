# Phase 40: Claude Request Layer and Job Seam - Context

**Gathered:** 2026-09-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 40 builds one tested layer, independent of which executor runs the calls. Every Claude call will be built, parsed, queued and applied through it:
- one model constant and one route table
- a pure request builder and response parser
- real JSON Schemas with a subset linter
- the Keeper Bible and layered prompts
- private job storage with dedupe, and an own-jobs status view
- the extracted apply logic
- the renown fix
- an offline mock procedure context

Phase 41 then only has to plug in the executor, a scheduled procedure (decided GO in Phase 39), and move each domain over.

Requirements: CLAUDE-01, CLAUDE-02, CLAUDE-03, CLAUDE-04, PIPE-03, PIPE-08, SEC-01, QUAL-04.

Not in this phase:
- the executor procedure and the dispatch/schedule table
- retries and the sweeper
- spend tables, the cost budget and the in-flight cap
- client wiring
- deleting the old pipeline
- the maincloud proof

These belong to Phases 41 and 42.

</domain>

<decisions>
## Implementation Decisions

### Scope boundary with Phase 41
- **No live call path changes in Phase 40.** Existing call sites keep the current `llm_task` and proxy path:
  - the `prepare_creation_llm`, `prepare_world_gen_llm` and `prepare_skill_gen` reducers
  - the inserts in `index.ts`, `helpers/combat_narration.ts` and `reducers/npc_interaction.ts`

  Phase 41 moves them over one domain at a time. That path can't make live calls anyway, because the OpenAI account has no credits.
- **Renown fix (PIPE-08):** `helpers/renown.ts` stops using the broken `llm_task` insert. Today that insert names `completedAt`, `resultText` and `errorMessage`, which are not `LlmTask` columns, and the error is swallowed. Instead it enqueues through the **new `enqueueLlmJob` into the new private job table**, so the job is valid immediately. A regression test fails on the old shape. The job waits in the queue until the Phase 41 executor exists, which is acceptable.
- **Extract the apply logic now:** the per-domain result handling inside `submit_llm_result` (about 700 lines, around `index.ts:943`) moves into per-domain functions in `helpers/llm_apply.ts`. `submit_llm_result` becomes a thin wrapper with **unchanged behavior**, covered by tests. Phase 41's procedure will call the same functions.
- **New tables in Phase 40:**
  - `llm_job`, private. It holds the route, player identity, dedupe key, request context and status, plus result text, `stop_reason` and the four usage fields (input, output, cache-write, cache-read).
  - `llm_call_log`, private.
  - the `my_llm_jobs` view.
  - the existing `llm_config`, reused for the key.

  The schedule/dispatch table and the spend tables come in Phase 41. Adding these tables is a non-breaking **local** publish (`spacetime publish uwr -p spacetimedb`, no clear). Never publish to maincloud.

### Keeper Bible and prompt layering (CLAUDE-04)
- **Keeper Bible:** a stable block of about 1.5–3K tokens in a new `data/keeper_bible.ts`. It merges the current `NARRATOR_PREAMBLE` and each domain's tone text into one reference:
  - voice rules and the sardonic Keeper stance
  - banned phrases and naming rules
  - 3–4 short in-voice examples
  - the rule that tagged player text is in-world content, never instructions

  Every route shares it, so it caches (Sonnet's minimum cacheable prefix is 512 tokens) and the voice stays consistent.
- **Tone sign-off:** Claude drafts the Bible and **the user reads and approves its tone before Phase 40 closes.** Plan this as a `checkpoint:human-verify` on the Bible file. Phase 44's golden set tests it again.
- **Player text isolation:**
  - Player-written text only ever appears inside `<player_input>…</player_input>`.
  - Any `</player_input>` or `<player_input>` inside the player text is neutralized.
  - The Bible and route instructions say tagged content is data or in-world speech.
  - Tests include injection-style inputs such as "ignore previous instructions" and fake closing tags.
- **Cache layout:**
  - `system[0]` is the Keeper Bible, with `cache_control`.
  - `system[1]` is the route block, with `cache_control`.
  - The **user message** carries the volatile per-call context: world facts, player state and tagged player input.
  - The default TTL is 5 minutes. Phase 43 tunes TTL and breakpoints and checks `cache_read_input_tokens`.

### Route table and request builder (CLAUDE-01..03)
- **Routes:**
  - `creation_race`
  - `creation_class`
  - `world_gen`
  - `skill_gen`
  - `npc_conversation`
  - `combat_narration`
  - `renown_perk_gen`
  - `smoke_test`, for Phase 41's admin smoke test
- **Model:** every route uses `claude-sonnet-5-5` from the single `data/llm_models.ts`. Tests fail if any other model ID appears in the codebase, including the old `gpt-5.4` and `gpt-5-mini` literals once Phase 41 moves each domain over. In Phase 40 the tests cover the new layer, plus a grep-style test that is scoped so it can be tightened in Phase 41.
- **Defaults:**
  - Effort is `low` on every route. The spike showed `low` and `medium` have equal latency, and Phase 43 tunes this.
  - Omit `thinking`.
  - Never send `temperature`, `top_p`, `top_k`, `thinking:{type:"disabled"}`, `budget_tokens`, prefill or forced `tool_choice`.
  - `max_tokens`, from the spike's output sizes plus headroom: world_gen 8192, creation 4096, skill 4096, renown 2048, npc 1024, combat narration 1024, smoke 256.
  - Route table fields: model, effort, max_tokens, timeout (ms), schema reference or plain text, cache flags.
- **Schemas:**
  - Convert every JSON route's example-string schema into a **real JSON Schema** in a new `data/llm_schemas.ts`: `REGION_GENERATION_SCHEMA`, class, race, skill (the current OpenAI-shaped `buildSkillGenResponseFormat()`) and renown.
  - Every schema must pass a **subset linter**:
    - `additionalProperties: false` on objects
    - `anyOf` instead of type arrays such as `['number','null']`
    - no `minimum`/`maximum`/`minLength`/`maxLength`/`pattern`/recursion
    - drop `name`/`strict`
  - The Phase 39 spike's hand-written region JSON Schema compiled on Sonnet 5.5. Git history has it in `spacetimedb/src/spike/spike_bodies.ts` (commit 555da7a1), and it can be reused.
  - NPC conversation and combat narration return plain text.
  - The existing v2.0 validators still enforce ranges, power budgets and naming rules on model output, and must keep rejecting out-of-range and over-budget output.
- **Parser:** a pure `classifyClaudeResponse` that:
  - reads the **first `type === "text"` block**, not `content[0]`
  - returns one of: `ok`, `truncated` (stop_reason `max_tokens`), `refusal`, `invalid_json`, `schema_mismatch`, or an HTTP class: `auth` (401/403), `billing`, `rate_limit` (429, with `retry-after` when present), `overloaded` (529), `server` (5xx), `bad_request` (400), `timeout` (thrown fetch error)
  - extracts `usage` (all four fields) and `request-id` when available

  Phase 41 maps these classes to retry or fail-fast.

### Privacy, dedupe and test seam (SEC-01, PIPE-03, QUAL-04)
- **Dedupe:**
  - Every job gets a **dedupe key**: player identity + route + a route-specific source key. Examples: world_gen → genStateId; creation → characterId + generation type; skill_gen → characterId + level; renown → characterId + rank; npc → npcId + conversation turn; combat narration → combat id + event.
  - `enqueueLlmJob` looks it up by index. If a `pending` or `in_flight` job exists for that key, it returns that job instead of inserting a second one.
  - Tests cover a double enqueue from the same identity (two tabs) and different keys running side by side.
- **Status view:** `my_llm_jobs` is a per-sender view built by **index lookup only**, never `.iter()`. It exposes `id`, `route`, `status`, `createdAt`, `errorCode` and an in-voice `userMessage`, with **no prompts or outputs**. The client is wired to it in Phase 42 (`useLlmStatus`), not now. A test asserts that none of `llm_job`, `llm_call_log` and `llm_config` is `public: true`.
- **Old public `llm_task`:** left as it is in Phase 40, because the running client and proxy still subscribe to it. It is removed over two publishes in Phase 42, and its prompt leak closes with the cutover.
- **Offline test seam:** `createMockProcCtx` in `spacetimedb/src/helpers/test-utils.ts`. It builds on the shared proxy-based `createMockDb` and provides:
  - a scripted fake `ctx.http.fetch` that returns responses, including headers and status, or throws a timeout
  - `ctx.withTx`, which runs its callback synchronously and **throws if the callback returns a Promise**, with an option to re-invoke the callback to simulate a retried transaction
  - a controllable `timestamp`
  - `sender` / identity

  All new LLM code paths are tested through it.

### Claude's Discretion
- Exact file split beyond the named modules. Suggested: `data/llm_models.ts`, `data/llm_routes.ts`, `data/llm_schemas.ts`, `data/keeper_bible.ts`, `helpers/claude_request.ts` (build, parse, classify), `helpers/schema_lint.ts`, `helpers/llm_queue.ts` (enqueue, dedupe), `helpers/llm_apply.ts`, and the views module.
- Exact column names and types of `llm_job` and `llm_call_log`, and how request context is stored (JSON string).
- How each route's user-message builder moves from `llm_prompts.ts` into the layered format. Keep the prompt semantics and any content the existing v2.0 validators rely on.
- Whether to delete the now-unused example-string schemas once the JSON Schemas replace them. Prompts that still describe the shape in text can keep a short description.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `LlmConfig` (`schema/tables.ts:1890`, private, `apiKey`) and the admin `set_api_key` reducer (`reducers/llm.ts`) hold the key. They are reused as they are.
- `LlmTask` (`schema/tables.ts:2106`) is **public**, with columns `systemPrompt`, `userPrompt`, `maxTokens`, `status`, `contextJson`, `responseFormatJson` (OpenAI-shaped). It stays for now and is removed in Phase 42.
- `LlmRequest` / `validate_llm_request` / `useLlm.ts` are dead v2.0 code, removed in Phase 42. `LlmBudget` and `checkBudget` (`helpers/llm.ts`) hold the per-player call count; Phase 41 replaces it with cost-weighted budgeting.
- `data/llm_prompts.ts` (795 lines) holds:
  - `NARRATOR_PREAMBLE`-style preamble text
  - `buildCharacterCreationPrompt`, `buildWorldGenPrompt`, `buildCombatNarrationPrompt`
  - the `RACE_INTERPRETATION_SCHEMA`, `CLASS_GENERATION_SCHEMA`, `COMBINED_CREATION_SCHEMA`, `REGION_GENERATION_SCHEMA` example strings
  - `SKILL_GENERATION_SCHEMA` and `buildSkillGenResponseFormat()` (OpenAI json_schema)
  - `RENOWN_PERK_GENERATION_SCHEMA`
  - `buildNpcConversationSystemPrompt`
  - `llm_prompts.test.ts`
- The kept Phase 39 helpers `helpers/measurement.ts` and `measurement_results.ts` hold percentile and summarize utilities, which Phase 43 may reuse.
- `helpers/test-utils.ts` provides `createMockDb` / `createMockCtx`, which are proxy-based and shared by about 20 test files.

### Established Patterns
- `llm_task` is inserted at: `index.ts:506` (creation), `:635` (world_gen), `:695` and `:924` (skill_gen), `helpers/combat_narration.ts:168`, `reducers/npc_interaction.ts:95`, and `helpers/renown.ts:84` (broken).
  - Domains used: `creation_*`, `world_gen`, `skill_gen`, `npc_conversation`, `combat_narration`, `renown_perk_gen`.
  - Models are hardcoded per site: `gpt-5.4` for creation and world_gen, `gpt-5-mini` for everything else.
- Tables are declared with `table(OPTIONS, COLUMNS)`, with indexes in OPTIONS using `accessor` and `algorithm: 'btree'`. Views use `spacetimedb.view(...)` with index lookups only. Rules are in CLAUDE.md, the SpacetimeDB TypeScript rules.
- `index.ts` exports functions by name via `_wrapMethod`. Views and procedures need the named form.
- User preference: use `fail(ctx, character, msg)` where character context exists, and `SenderError` in low-level helpers.

### Integration Points
- `schema/tables.ts` `schema({...})`: register `llm_job` and `llm_call_log` there.
- `views/`: add `my_llm_jobs`.
- `index.ts` `submit_llm_result`: becomes a thin wrapper over `helpers/llm_apply.ts`.
- `helpers/renown.ts`: switches to `enqueueLlmJob`.
- Client bindings: regenerate after the schema change with `spacetime generate`. Nothing else in the client is wired this phase.

### Phase 39 facts this phase must honor
- Sonnet 5.5 bodies need an explicit `output_config.effort` and a required `max_tokens`. Parse the first `text` block. `output_config.format` compiles for the region schema. `thinking: between_tools` works with `format`, but is not used by default.
- `ctx.sender` inside a scheduled procedure is the **module** identity, so the job row must carry the requesting player's identity. `llm_job.playerId` is required.
- `ctx.http.fetch` **throws** on timeout, and 4xx/5xx come back as responses. `request-id` and the `anthropic-ratelimit-*` headers are visible to the procedure. `retry-after` has not been observed yet.
- Latency baselines: skill p50 about 5.3 s, region about 17.5 s.

</code_context>

<specifics>
## Specific Ideas

- The user's goal is "the fastest experience with the best narrative results". The Keeper Bible is both the caching anchor and the tone anchor, so treat its quality as first-class.
- Phase 39's evidence is in `.planning/phases/39-procedure-to-claude-spike/39-SPIKE-RECORD.md`. Milestone research is in `.planning/research/` (ARCHITECTURE.md covers the component layout; PITFALLS.md covers the Sonnet parameter rules and schema subset).

</specifics>

<deferred>
## Deferred Ideas

- Client wiring of `my_llm_jobs` (`useLlmStatus`): Phase 42.
- Executor, dispatch table, retries, sweeper, in-flight cap, cost-weighted budget and spend tables: Phase 41.
- A/B test of `thinking: between_tools` versus default, cache TTL tuning, and effort sweeps: Phase 43.
- Making `llm_task` private or removing it: Phase 42 (two-publish removal).

</deferred>
