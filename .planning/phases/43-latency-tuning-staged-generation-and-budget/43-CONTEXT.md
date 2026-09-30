# Phase 43: Latency Tuning, Staged Generation and Budget - Context

**Gathered:** 2026-09-30
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase makes generation feel fast and keeps it affordable.

- Every route is tuned from measured data: effort and `max_tokens`.
- Prompt caching is proven on every route.
- The player enters a new region, with its start location and first NPC, before the rest of the region is generated.
- The player sees a new class's identity and first ability before the full class is ready.
- The player sees in-voice Keeper progress lines while generation runs.
- Total spend has a hard global daily ceiling and an admin kill switch.
- The admin can read per-route stats with `/llm stats`.

Requirements: LAT-01 to LAT-06, COST-03, OPS-02. Depends on Phase 41 (the live executor and call log) and Phase 42 (`useLlmStatus` renders progress).

</domain>

<decisions>
## Implementation Decisions

### Measuring and tuning (LAT-01, LAT-02, OPS-02)
- **Effort sweep:** low vs medium effort, 5 calls per cell, on all 7 production routes, about 70 calls, run locally against real Claude through the Phase 41 live-proof harness pattern.
  - Keep the lowest effort whose replies pass schema validation plus a Keeper-tone lint.
  - The spend cap for this phase's measurement work is $5.
- **`max_tokens`:** the measured p99 output tokens × 1.25, rounded up to a multiple of 256, with a floor of 256. Each route's value cites the committed measurement file it came from.
- **`/llm stats`:** admin-only, typed as `/llm stats` in the narrative input.
  - An admin-only view aggregates `llm_call_log` per route for the last 24 h and for all time: calls, cost, p50/p95 latency and errors.
  - The result prints as a table in the log.
  - Non-admins get an in-voice refusal.
- **Caching proof:** the sweep harness makes two calls per route with the same prefix and asserts `cache_read_input_tokens > 0` on the second. Results are committed to a measurements file in the phase directory.

### Staged world generation (LAT-03, LAT-05)
- **Two stages.**
  - Stage 1 is a small, fast call: region name, biome, start location and first NPC.
  - Applying stage 1 enqueues stage 2: the remaining locations, NPCs and enemies, with stage 1 passed in as facts.
- **Stage-2 failure:** the region stays playable with its stage-1 content. The Keeper posts an in-voice line, and the next explore retries stage 2. This matches Phase 41's "ERROR + explore retries" decision.
- **Progress lines, both kinds:**
  - The client rotates in-voice lines every ~5 s from a pool in server data while the job is active, through Phase 42's `useLlmStatus`.
  - The server posts a milestone line when stage 1 lands.
- **Visibility:** the world is shared, so stage-1 content appears to all players at once, and stage-2 content fills in when it lands.

### Staged class reveal (LAT-04, LAT-06)
- **Stage 1:** class name, identity blurb and first ability, in a small fast call.
- **Stage 2:** the rest of the class (stats, full ability kit), with stage 1 passed in as facts.
- **Confirmation waits for stage 2.** The player sees the stage-1 reveal immediately, but confirming the class waits until stage 2 lands, so every character is complete when it enters the world. Keeper progress lines fill the gap.
- **LAT-06 parallel archetypes:** follow the roadmap rule. Measure the class reveal after staging. Build parallel generation of both archetypes only if the reveal is still over about 10 s; otherwise record the measurement and leave it out.
- **Stage-2 failure:** stage 1 stays visible. The Keeper posts an in-voice line, and the player can retry stage 2 with one input without regenerating stage 1.

### Spend ceiling and kill switch (COST-03)
- **Global daily ceiling:** $10/day across all players, resetting at midnight UTC, changeable by an admin at runtime. The Phase 41 per-player limits ($1/day, 200 calls/day) stay in place under it.
- **Kill switch:**
  - An admin reducer, plus `/llm off` and `/llm on` in the narrative input, stored in `llm_admin_state`.
  - New requests get an in-voice refusal.
  - In-flight calls finish.
  - Pending jobs expire with refunds at claim time.
- **Ceiling enforcement:**
  - Checked at enqueue and again at claim, counting reserved plus spent, so queued jobs stop too.
  - The player gets the same in-voice "the Keeper is resting" line as the kill switch, with no numbers.
  - The block lifts on its own at the UTC reset.
- **Phase 41's $2 phase ledger:** retired as a limit and replaced by the global daily ceiling. The `llm_spend` ledger stays as the all-time spend record shown by `/llm stats`.

### Claude's Discretion
- The Keeper-tone lint rules used to judge the sweep. They should build on the Keeper Bible's banned-phrases list.
- The exact stage-1 and stage-2 JSON schemas. They must stay compatible with Phase 40's schema lint and structured-output limits, and a stage-1 schema should be as small as possible.
- The measurement file format and location, as long as every tuned value traces back to it.
- The progress-line pool contents, in-voice and following the pronoun rule.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- From Phase 41:
  - `llm_call_log`, which records four usage counts per call plus latency and cost. It is the stats source.
  - `llm_spend` ledger, `llm_player_budget` and `helpers/llm_budget.ts` (reserve, settle, release).
  - `data/llm_limits.ts`, where the constants live.
  - `llm_admin_state`, the `admin_llm_status` view and the `llm_smoke_test` reducer.
  - The live-proof harness from 41-15 and 41-16, which the sweep should extend.
- `data/llm_routes.ts` holds per-route effort and `max_tokens`, set in Phase 40 and tuned in this phase.
- `data/llm_schemas.ts` holds the frozen schemas, and `helpers/schema_lint.ts` lints them.
- `useLlmStatus` from Phase 42 drives the client's in-progress state.

### Established Patterns
- Every LLM action enqueues inside its reducer's transaction through `enqueueLlmJob`. The executor claims, calls, persists and applies. Refusals are in-voice lines.
- Money is kept in micro-USD bigints.
- Admin gating uses `ADMIN_IDENTITIES` and `requireAdmin`. Admin-only views return `[]` for non-admins and use index lookups only.

### Integration Points
- World generation: `helpers/world_gen.ts` and the post-41-14 world-gen apply path in `llm_apply`. 41-18 adds an NPC `gender` column there.
- Character creation: `helpers/creation_generation.ts` (41-13) and the creation apply path.
- The narrative input's command parsing handles `/llm stats`, `/llm off` and `/llm on`. Find where the existing `[skills]` intent and help are parsed.

</code_context>

<specifics>
## Specific Ideas

- **In-game pronoun rule (user, 2026-09-30):**
  - The Keeper is male (he/his).
  - Every NPC or humanoid person is male or female.
  - The player's own character is always "you".
  - Beasts may be "it".
  - This applies to all progress lines and new Keeper strings. The staged world-gen schemas must keep the NPC `gender` field that 41-18 adds.
- Live measurement runs locally only. Maincloud stays user-run.

</specifics>

<deferred>
## Deferred Ideas

None. The discussion stayed within the phase's scope.

</deferred>
