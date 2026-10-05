# Phase 39: Procedure-to-Claude Spike - Context

**Gathered:** 2026-09-29
**Status:** Ready for planning

<domain>
## Phase Boundary

This throwaway spike measures one thing on **local** SpacetimeDB 2.10.1: can a scheduled procedure call the Anthropic Messages API (`claude-sonnet-5-5`) via `ctx.http.fetch` reliably, without hurting reducers or combat-tick punctuality?

It ends with a written go/no-go record that picks the Phase 41 executor:
- **go:** a scheduled procedure
- **go with cap:** a scheduled procedure, with an in-flight limit
- **no-go:** a backend service using WIF

Requirements: SPIKE-01, SPIKE-02, SPIKE-03, SPIKE-04.

Out of scope here:
- production pipeline code (Phase 40/41)
- maincloud (moved to Phase 41 by user decision)
- any change to the production `uwr` database

</domain>

<decisions>
## Implementation Decisions

### Spike isolation & environment
- The spike code lives in the **real module** as `spacetimedb/src/spike/llm_spike.ts`, registered from `index.ts`. It is published **only to a separate local database named `uwr-spike`**:
  - This measures the real module size, cold-start and V8 cost, and imports the real prompt code.
  - The local `uwr` database is never touched.
  - `pnpm spacetime:publish` (which targets `uwr`) must not be used for the spike.
- **REVISED 2026-09-29 (user decision, supersedes the next bullet): maincloud decides the gate.**
  - Why: the local ping numbers are unrepresentative. The machine is low-end and was shared with another LLM build. Local ping p95 failed at every load level while server-side tick lateness passed, and the level-4 window was short on samples (147 of 200), so the local strict verdict is `incomplete`.
  - What changes:
    - Local results are recorded as **provisional context**.
    - A maincloud leg runs against a **separate maincloud database `uwr-spike`**, published and later deleted **manually by the user**. The production `uwr` database is never touched.
    - The go/no-go gate is evaluated on the **maincloud** numbers.
  - Same rules as before:
    - key storage through the leak-proof runner
    - leak scans
    - a per-database spend cap (the maincloud database starts at $0)
    - never `--clear-database`
  - Phase 41 still proves the real executor on maincloud.
- **Maincloud database and publish grant (user, 2026-09-29):**
  - The user created the maincloud database **`uwr-spike-925iv`** (identity `c200d8595d7376690d03566fdd8e9a30038dfac72f1ea53dfa594ad0a4068fd8`, empty).
  - The user then said, verbatim: "I give you permission to publish to uwr-spike db in maincloud".
  - Therefore **Claude publishes the spike module to `uwr-spike-925iv` through the guard**, never with clear or delete flags.
  - Deleting `uwr-spike-925iv` stays with the user.
  - The production `uwr` database is never touched, on any server.
  - This is a scoped exception to the "never auto-publish to maincloud" rule.
- *(Superseded)* **Maincloud is out of this phase (user decision, 2026-09-29):**
  - The gate is evaluated on local results only.
  - Maincloud behavior is proven in Phase 41, when the real executor ships. The user publishes manually; Claude never publishes to maincloud.
  - The ROADMAP and SPIKE-04 are already updated to match.
- **Cleanup:**
  - All spike code, and its registration in `index.ts`, is deleted in the phase's final commit. Git history keeps it.
  - Kept after the phase:
    - the unit-tested measurement helpers (percentile math, gate evaluation), in a non-spike location such as `spacetimedb/src/helpers/`, with tests
    - the spike record
    - the raw results JSON
  - Drop the local `uwr-spike` database at the end (`spacetime delete uwr-spike`, local only).
- **Local failure rule:** if the old 2.0.1-style failure reproduces locally, record the cause (DNS, SSRF filter, timeout, etc.) from the server logs. It is a **no-go unless a local fix is found**, because local development must be able to make LLM calls.

### API key & cost
- **Key source:**
  - The operator puts `ANTHROPIC_API_KEY=...` in **`spacetimedb/.env.local`**. It is already gitignored and not read by Vite.
  - A spike runner script reads it and passes it to `uwr-spike`.
  - The key must never appear in shell history, commits, logs, the spike record or the results JSON.
- **Key storage in `uwr-spike`:**
  - A **spike-only key reducer** writes the existing private `llm_config` row (id 1), so the procedure reads the key the same way production will.
  - The reducer is gated to the operator's CLI identity, `c200252497b98fff5aab75f8fbc675956b5a12a5b85042ab355d3a05c6ab7d6e` (from `spacetime login show`).
  - `data/admin.ts` is **not** modified. Its admin identity `c20006ce…` differs from the CLI identity, so `set_api_key` cannot be called from the CLI.
- **Key/workspace:**
  - The user creates a **dedicated Anthropic Console workspace** (e.g. "uwr-dev") with a low spend limit (~$10) and its own key.
  - Phase 41's runbook reuses this workspace.
- **Budget:**
  - Sample sizes are designed to keep total spike spend **under ~$3**.
  - Once the key is in place, Claude runs the local live calls without per-run approval. Local only.
  - The user's only action in this phase is adding the key, plus confirming the verdict.

### Measurement design
- **Sample sizes:**
  - Ladder:
    - rung 1: 10 public-URL fetches
    - rung 2: 10 `GET /v1/models`
    - rung 3: 30 small Sonnet 5.5 calls, for reliability
  - Structured outputs: skill and region schemas × effort `low`/`medium` × 5 runs each, plus 3 runs of a thinking-off variant (`thinking: {type: "between_tools"}`) combined with `output_config.format`.
  - Concurrency: 8 calls in flight × 3 rounds.
  - Failure drills: 2 each for a forced timeout and a bad key.
  - Dispatch latency: 50 no-op dispatches (no HTTP).
- **Reducer and tick latency:**
  - A **spike tick-probe** scheduled reducer, at the combat cadence (`COMBAT_LOOP_INTERVAL_MICROS` = 1 s), records lateness (actual `ctx.timestamp` minus scheduled time) in a spike table.
  - A small **Node harness** using the generated TypeScript SDK bindings measures `spike_ping` reducer round-trip time.
  - Both run first with no calls in flight (baseline), then with 6–8 calls in flight.
- **Dispatch latency:** measured server-side, as the schedule row's `scheduledAt` versus the procedure's start timestamp, recorded through `withTx`. It uses no-op procedures, so it's free. Also record whether `ctx.sender` is usable inside a scheduled procedure, and what it contains.
- **Current-path baseline:**
  - The OpenAI account has no credits, so measure only the **hop overhead** of today's path: client → Worker → stubbed provider response → `submit_llm_result`.
  - This quantifies what dropping the proxy saves. It is not a gate input.
- **Also captured, not gate inputs:**
  - a cache read on a repeated ≥512-token prefix (`cache_read_input_tokens > 0`)
  - whether an in-flight call survives a `spacetime publish` of `uwr-spike`
  - whether response headers (`retry-after`, `request-id`) are visible on the procedure's `SyncResponse`
  - how `ctx.http.fetch` fails on timeout: throws, or returns an error response
- **Schemas:**
  - `SKILL_GENERATION_SCHEMA` / `buildSkillGenResponseFormat()` is an OpenAI-shaped JSON schema. Map it to `output_config.format` (drop `name`/`strict`, turn `['number','null']` into `anyOf`).
  - `REGION_GENERATION_SCHEMA` is **an example-object string, not a JSON Schema**. The spike must hand-write an equivalent JSON Schema (with `additionalProperties: false`) to test whether it compiles, and record any complexity-limit error.

### Gate & decision record
- **Gate, evaluated on local only. Go requires all of:**
  - every non-drill call succeeds, across at least 30 reliability calls
  - dispatch p95 < 250 ms
  - `spike_ping` round-trip p95 < 2× baseline, and tick lateness p95 < 2× baseline, with 6–8 calls in flight
  - the region schema compiles, or a documented staged-schema workaround exists
- **Marginal outcome:**
  - If reliability and dispatch pass but only lower concurrency stays healthy: **"go with cap"**. The in-flight cap is set to the highest concurrency that passed, with a minimum of 2, and Phase 41 enforces it.
  - **No-go** only if even 2 calls in flight break the tick or ping gate, or reliability/dispatch fail with no local fix.
- **Record:**
  - `39-SPIKE-RECORD.md` in the phase directory: narrative, environment (versions, OS), the gate table with measured values against thresholds, the decision, and the cap.
  - `39-spike-results.json`: raw samples, no key material.
  - The decision is also logged in PROJECT.md Key Decisions and in STATE.md.
- **Verdict:** evaluated automatically from the measured numbers by the unit-tested gate-evaluation helper. Claude presents the verdict and the user confirms it before Phase 40 starts.

### Claude's Discretion
- Exact file layout of the Node harness (e.g. `scripts/spike/`) and of the runner script, and how the key reaches the spike reducer without touching shell history (e.g. read from the file inside a Node script that calls the reducer through the SDK).
- The spike's table names and shapes (all private except anything the harness must read), and the result-writing format.
- The Sonnet 5.5 request body for each rung, following the research rules:
  - explicit `output_config.effort`
  - required `max_tokens`
  - no `temperature` / `top_p` / `top_k`, no `thinking: {type: "disabled"}`, no `budget_tokens`
  - parse the first `text` block
  - check `stop_reason`
- How to stub the provider for the current-path hop measurement: a temporary stub route or env flag in `llm-proxy`, run locally only via `wrangler dev`, reverted afterwards.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `LlmConfig` table (`spacetimedb/src/schema/tables.ts:1890`, `name: 'llm_config'`, private) with `id`, `apiKey` and `updatedAt`. The spike key reducer writes row `id: 1n`.
- Prompt builders and schemas are in `spacetimedb/src/data/llm_prompts.ts`:
  - `buildSkillGenSystemPrompt`, `buildSkillGenUserPrompt`, `buildSkillGenResponseFormat()`
  - `REGION_GENERATION_SCHEMA` (an example string)
  - `buildRegionGenerationUserPrompt`, `buildWorldGenPrompt`
- `COMBAT_LOOP_INTERVAL_MICROS` (1 s) is in `spacetimedb/src/data/combat_constants.ts`.
- Generated client bindings are in `src/module_bindings/` (220 files). The Node harness needs bindings generated **from the spike build**, so it can see the spike reducers and tables. Generate them into a spike-local directory, not `src/module_bindings/`.
- The `llm-proxy/` Worker (Hono + OpenAI SDK) and `llm-proxy/scripts/smoke.sh` are the current-path hop measurement target.
- `spacetimedb/src/helpers/test-utils.ts` has the shared mock DB/ctx for unit tests of the measurement helpers. Vitest runs via `pnpm --dir spacetimedb test`.

### Established Patterns
- **Module export collection:** `index.ts` monkey-patches `spacetimedb.reducer/procedure/view` via `_wrapMethod`. Procedures are exported by name **only** if called as `procedure({ name, ... }, params, ret, fn)` with 4 args. Otherwise they get a counter name.
- **Scheduled tables:** use `scheduled: () => scheduledReducers['name']` with `scheduledId` as primary key and `scheduledAt: t.scheduleAt()`. `onSchedule` for procedures is available in the 2.10.1 typings (per research STACK.md).
- **Admin gating:** `requireAdmin(ctx)` in `spacetimedb/src/data/admin.ts` checks a hardcoded identity set. Its identity differs from the CLI identity.
- **Publishing:**
  - Local CLI default server is `local` (127.0.0.1:3000), and the CLI uses `-p` for the project path.
  - Spike publish: `spacetime publish uwr-spike -p spacetimedb` (local).
  - Never `--server maincloud`, never `--clear-database` on `uwr`.
- **Runtime:** SpacetimeDB CLI/runtime is 2.10.1 on Windows 10. The `run-local` skill documents starting the local server (`spacetime start --non-interactive --listen-addr 127.0.0.1:3000`).

### Integration Points
- `spacetimedb/src/index.ts`: register the spike module (one import plus a call), removed at phase end.
- `spacetimedb/src/schema/tables.ts` / the `schema(...)` export: spike tables must be included in the schema for publish. Keep them isolated in the spike file where possible. Adding tables to `uwr-spike` only matters for that database, but the code change must be fully reverted so `uwr`'s schema is unchanged when the phase ends.

</code_context>

<specifics>
## Specific Ideas

- The user's goal for the milestone is "the fastest experience with the best narrative results". The spike should therefore also record plain end-to-end latency per structured route at each effort level (p50/p95), as the baseline for Phase 43.
- Known pitfalls to watch for, from research PITFALLS.md:
  - loopback and private IPs are blocked from procedures (#4546)
  - DNS resolving to special-purpose ranges is blocked (#4715)
  - `withTx` callbacks must be synchronous and may re-run, and fetch must never be inside `withTx`
  - scheduled procedures delete their schedule row before running
  - V8 instance pinning from a blocking fetch (#4697)
- Research spike criteria are in `.planning/research/STACK.md`, ARCHITECTURE.md and PITFALLS.md ("Spike" sections).

</specifics>

<deferred>
## Deferred Ideas

- Maincloud spike leg: moved to Phase 41 success criterion 6 (user decision).
- Instrumenting the real `combat_loop` under a live fight: not needed. The tick probe at combat cadence is the chosen proxy.

</deferred>
