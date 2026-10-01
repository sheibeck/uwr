# Phase 43: Latency Tuning, Staged Generation and Budget - Research

**Researched:** 2026-09-30
**Domain:** Anthropic Messages API tuning (Sonnet 5.5 effort, max_tokens, structured outputs, prompt caching), staged two-job generation on SpacetimeDB 2.10.1, global spend ceiling and kill switch, admin stats
**Confidence:** HIGH for codebase facts, API behavior and schema-migration behavior (all read from code, official docs, or a scratch-server probe). MEDIUM for the per-route output-size and dollar estimates (only skill and region sizes were ever measured; everything else is estimated and exists to be replaced by the sweep).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Measuring and tuning (LAT-01, LAT-02, OPS-02)
- **Effort sweep:** low vs medium effort, 5 calls per cell, on all 7 production routes, about 70 calls, run locally against real Claude through the Phase 41 live-proof harness pattern.
  - Keep the lowest effort whose replies pass schema validation plus a Keeper-tone lint.
  - The spend cap for this phase's measurement work is $5.
- **`max_tokens`:** the measured p99 output tokens x 1.25, rounded up to a multiple of 256, with a floor of 256. Each route's value cites the committed measurement file it came from.
- **`/llm stats`:** admin-only, typed as `/llm stats` in the narrative input.
  - An admin-only view aggregates `llm_call_log` per route for the last 24 h and for all time: calls, cost, p50/p95 latency and errors.
  - The result prints as a table in the log.
  - Non-admins get an in-voice refusal.
- **Caching proof:** the sweep harness makes two calls per route with the same prefix and asserts `cache_read_input_tokens > 0` on the second. Results are committed to a measurements file in the phase directory.

#### Staged world generation (LAT-03, LAT-05)
- **Two stages.**
  - Stage 1 is a small, fast call: region name, biome, start location and first NPC.
  - Applying stage 1 enqueues stage 2: the remaining locations, NPCs and enemies, with stage 1 passed in as facts.
- **Stage-2 failure:** the region stays playable with its stage-1 content. The Keeper posts an in-voice line, and the next explore retries stage 2. This matches Phase 41's "ERROR + explore retries" decision.
- **Progress lines, both kinds:**
  - The client rotates in-voice lines every ~5 s from a pool in server data while the job is active, through Phase 42's `useLlmStatus`.
  - The server posts a milestone line when stage 1 lands.
- **Visibility:** the world is shared, so stage-1 content appears to all players at once, and stage-2 content fills in when it lands.

#### Staged class reveal (LAT-04, LAT-06)
- **Stage 1:** class name, identity blurb and first ability, in a small fast call.
- **Stage 2:** the rest of the class (stats, full ability kit), with stage 1 passed in as facts.
- **Confirmation waits for stage 2.** The player sees the stage-1 reveal immediately, but confirming the class waits until stage 2 lands, so every character is complete when it enters the world. Keeper progress lines fill the gap.
- **LAT-06 parallel archetypes:** follow the roadmap rule. Measure the class reveal after staging. Build parallel generation of both archetypes only if the reveal is still over about 10 s; otherwise record the measurement and leave it out.
- **Stage-2 failure:** stage 1 stays visible. The Keeper posts an in-voice line, and the player can retry stage 2 with one input without regenerating stage 1.

#### Spend ceiling and kill switch (COST-03)
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

#### UI scope (user decision, 2026-09-30)
- **No UI-SPEC for this phase.** A full UX overhaul milestone is coming (backlog 999.6), so this phase adds no new screens, components or styling.
- Staged-generation progress lines reuse the Phase 42 Keeper indicator as-is: the same `NarrativeConsole` region, with copy living in `spacetimedb/src/data/` and guarded by the existing voice and pronoun tests.
- `/llm stats` and the kill switch are admin slash commands that print plain text into the existing console, following the current admin-command pattern.

### Claude's Discretion
- The Keeper-tone lint rules used to judge the sweep. They should build on the Keeper Bible's banned-phrases list.
- The exact stage-1 and stage-2 JSON schemas. They must stay compatible with Phase 40's schema lint and structured-output limits, and a stage-1 schema should be as small as possible.
- The measurement file format and location, as long as every tuned value traces back to it.
- The progress-line pool contents, in-voice and following the pronoun rule.

### Deferred Ideas (OUT OF SCOPE)
None. The discussion stayed within the phase's scope.

### Additional constraints recorded in CONTEXT.md (specifics)
- In-game pronoun rule (user, 2026-09-30): the Keeper is male (he/his). Every NPC or humanoid person is male or female. The player's own character is always "you". Beasts may be "it". This applies to all progress lines and new Keeper strings. The staged world-gen schemas must keep the NPC `gender` field that 41-18 adds.
- Live measurement runs locally only. Maincloud stays user-run.

### Spec-less edge coverage (43-EDGE-COVERAGE.md, treated as binding truths by the planner)
Resolved edges: LAT-01 tie-break picks the lower effort and records the tie; a route with fewer than the documented minimum samples keeps its current values and is marked "insufficient data"; p99 uses a fixed nearest-rank rule over numerically sorted samples and the record lists routes and efforts in a fixed order. COST-03 boundary tests at ceiling minus 1, ceiling and ceiling plus 1 micro-USD (a reservation that lands exactly on the ceiling is allowed); a missing kill-switch or ceiling state row **fails closed** with the in-voice resting line; no spend for the current UTC day counts as 0; kill switch and ceiling refusing together show one line, not two; claim-time refusals refund exactly once and the sweeper never refunds again.
Flagged assumptions (LAT-02 route under the minimum cacheable length is "not cacheable" not failing; LAT-03/LAT-04 stage-2 failure leaves a playable stage 1 and never dead-ends; LAT-05 pool lives in `spacetimedb/src/data/` under the existing voice tests; LAT-06 decision made once and recorded either way; OPS-02 admin-only, reads `llm_call_log` only, plain text, nearest-rank p50/p95, a route with no calls shows zeros) are all consistent with the findings below.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LAT-01 | Each route's effort and `max_tokens` tuned from measured latency and output size (effort sweep, p99) | Sweep design and cost estimate (Sections "Effort sweep", "Don't hand-roll"); Phase 39 baseline data (effort low vs medium showed no latency difference; output tokens drive latency); `max_tokens` includes thinking tokens [CITED: platform.claude.com effort doc]; `percentile`/`summarize` already exist in `helpers/measurement.ts` |
| LAT-02 | Prompt caching active and verified per route (`cache_read_input_tokens > 0`) | Minimum cacheable prefix 512 tokens on Sonnet 5.5; Keeper Bible alone is 9,635 chars (about 2.4K tokens); `output_config.format` and effort changes invalidate caches, so cache is per route; entries only readable after the first response begins, so the proof calls must be sequential |
| LAT-03 | World gen staged: enter a region with start location and first NPC before the rest finishes | Two-job design with a new `world_gen_start` route and a `FILLING` state; existing `REGION_CORE_PROPS`/`REGION_POPULATION_PROPS` split; travel/explore/sweeper/client touch points listed |
| LAT-04 | Class reveal staged: identity and first ability before the full class | `creation_class_reveal` route, `CLASS_FILLING` and `CLASS_FILL_ERROR` steps, merge into the existing `validateClassReply` |
| LAT-05 | In-voice Keeper progress lines while generation runs | Pool in `data/llm_indicator_lines.ts` (import-free module), rotation tick in `useLlmStatus`, server milestone event; voice tests that must be extended |
| LAT-06 | Parallel archetype classes only if post-staging reveal > ~10 s | Phase 39 output rate (~110 tokens/s) predicts a stage-1 reveal of roughly 3-5 s, so the expected outcome is "measure, record, do not build"; decision rule defined |
| COST-03 | Global daily ceiling and admin kill switch halt all LLM calls | Day counter on the `llm_spend` singleton plus defaulted columns on `llm_admin_state`; enqueue and claim hooks identified; migration proven to need no `--clear-database` |
| OPS-02 | Admin `/llm stats` by route: calls, cost, p50/p95, errors | Reducer-side aggregation of `llm_call_log` (a view cannot scan), admin gate pattern, plain-text output constraints of `NarrativeMessage` |
</phase_requirements>

## Summary

Phase 43 sits on a finished executor. Everything it needs to extend is a small, well-factored seam: routes are one frozen table (`data/llm_routes.ts`), every spend mutation passes through `helpers/llm_budget.ts`, every refusal reason flows through `llmRefusalMessage`, claim-time refusals already have a refund-and-notify path (`failAtClaim` in `claimLlmJob`), and the Phase 42 indicator is a pure function over `my_llm_jobs` rows. No new packages are needed. The three hard unknowns were resolved by research: (1) a scratch SpacetimeDB 2.10.1 server proved that new tables, new indexes and new columns **with a default** publish onto a populated database without `--clear-database` (a new column without a default is refused), so the user's stored Anthropic key is safe; (2) the Anthropic docs show that `output_config.format` and effort changes invalidate prompt caches, so caching is strictly per route and the proof calls must run one after the other; (3) the real Phase 39 data shows effort low vs medium made no measurable latency difference and that latency is almost entirely output tokens (about 110 tokens/s), which is exactly why staging is the lever that matters.

The recommended shape: add two new stage-1 routes (`world_gen_start`, `creation_class_reveal`) and repurpose the existing `world_gen` and `creation_class` routes as the stage-2 "fill" jobs. This keeps churn off the indicator, console-scope, retry and sweeper tables for the routes that already exist. Stage 1 applies and, inside the same apply transaction, enqueues stage 2. New state strings (`FILLING`, `FILL_ERROR`, `CLASS_FILLING`, `CLASS_FILL_ERROR`) are plain values in existing `step` string columns, so staging needs no schema change at all. The ceiling needs two defaulted columns on the existing `llm_spend` singleton (a UTC day string and today's spent total; reserved is already the live in-flight total) and two on `llm_admin_state` (kill switch, ceiling value). Stats are computed inside a reducer, because views cannot scan tables.

The measurement runs cost about $1 against a $5 cap and must be a plan step the user approves, not something research ran. Run the sweep from a Node harness that builds requests with the real `buildClaudeRequest` and overrides only effort, so it measures exactly the bytes production sends, bypasses the per-player $1/day cap (which a ~$1 sweep would otherwise hit), and does not pollute the module's ledger.

**Primary recommendation:** Build in this order: (1) pure data and logic with unit tests (route additions, schemas, tuning/trace module, stats aggregation, ceiling math, progress pools); (2) server wiring (budget day counter, enqueue/claim hooks, staged apply, sweeper locks, `/llm` commands); (3) client rotation tick and `isCreationLlmProcessing` step list; (4) one user-approved live measurement run that fills the measurements file and sets each route's effort and `max_tokens`; (5) a second small run for the caching assertions and the class-reveal number that decides LAT-06.

## Project Constraints (from ./CLAUDE.md and memory)

- SpacetimeDB TypeScript rules (2.10.x): `table(OPTIONS, COLUMNS)`; indexes live in OPTIONS with `algorithm: 'btree'` and an `accessor`; reducers use object-syntax args; `t.u64()` ids need a `0n` placeholder on insert and `.insert()` returns the row; scheduled tables key on `scheduledId`; **views may only use index lookups, never `.iter()`**; procedures use `ctx.withTx`; client uses `useMemo`-ed connection builders and object-syntax reducer calls; never edit generated `module_bindings` (regenerate with `spacetime generate`).
- Make the smallest change necessary; do not touch unrelated files; do not invent SpacetimeDB APIs.
- Memory rules that bind this phase: prefer `fail(ctx, character, msg)` over `SenderError` where a character exists (the `/llm` commands and explore retry have one); server is source of truth (the client imports progress-line pools from `spacetimedb/src/data/`, never copies them); money in micro-USD bigints; **never auto-publish to maincloud**, local publish only; **never use `--clear-database` unless the schema requires it** (this phase's schema changes do not); all new work needs unit tests; Keeper is he/his, NPCs male or female, player is "you"; no secrets read or printed (`spacetimedb/.env.local`, `.dev.vars`, CLI token, `llm_config`).
- Project skill: `.claude/skills/run-local` launches/stops the local stack (server on 3000, publish, Vite). Publishing locally is `spacetime publish uwr -p spacetimedb` (add `-y`/`--break-clients` for the "all clients will be disconnected" prompt on view changes); regenerate bindings after the `admin_llm_status` view changes.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Effort and `max_tokens` per route | Server data module (`data/llm_routes.ts`) | Measurement harness (Node, offline) | Request builder reads only the route table; the harness produces the numbers, a test proves traceability |
| Prompt-cache verification | Measurement harness (calls Anthropic directly) | Server request builder (cache_control layout, already shipped) | Needs response `usage`; the module's `llm_call_log` also records the four counts for the later Phase 44 in-module proof |
| Stage-1/stage-2 orchestration | Database (apply transaction enqueues stage 2) | Executor (unchanged) | Stage chaining must be atomic with the stage-1 domain write; the apply tx already runs `enqueueLlmJob` safely |
| Stage visibility to other players | Database (public `region`/`location`/`npc` rows) | Client subscriptions (existing) | Shared world rows appear to all players the moment stage 1 commits |
| Progress-line copy | Server data (`llm_indicator_lines.ts`, import-free) | Client (`useLlmStatus` picks and rotates) | Project rule: server is source of truth for strings; module must stay import-free for the browser bundle |
| Progress-line rotation timing | Client (a 5 s tick) | -- | Pure presentation; no server clock needed; avoids clock-skew |
| Milestone line when stage 1 lands | Database (apply writes `event_private`/`event_creation`) | -- | Same pattern as every other Keeper message |
| Kill switch and ceiling state | Database (`llm_admin_state`, `llm_spend`) | Admin reducers and `/llm` commands | Singleton rows already hold key status and spend |
| Ceiling and kill-switch enforcement | Database (inside `enqueueLlmJob` and `claimLlmJob` transactions) | -- | Must be transactional with reservation; the claim hook already exists (`isPhaseLedgerExhausted` slot) |
| `/llm stats` aggregation | Database (reducer scan of `llm_call_log`) | Client console (plain text render) | A view cannot `.iter()`; a reducer can; output is a private event line |
| Admin gating | Database (server-side `ADMIN_IDENTITIES` check) | -- | Never trust the client for admin; non-admin refusal is an in-voice `fail()` line, not a thrown error |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| spacetimedb (npm) | 2.10.1 (installed; `^2.10.1`) | Module runtime, tables, reducers, procedures | Already the project stack [VERIFIED: `spacetimedb/package.json`, `npm view spacetimedb@2.10.1 version` returned 2.10.1] |
| vitest | 5.0.2 | Unit tests (server in `spacetimedb/`, client in repo root) | Already in use; 51 tests across two LLM data files ran green in 0.9 s [VERIFIED: ran it] |
| Anthropic Messages API, `claude-sonnet-5-5` | `anthropic-version: 2023-06-01` | The only model | Locked by `data/llm_models.ts` |

### Supporting (already in the repo, reuse; do not rewrite)
| Module | Purpose | When to use |
|--------|---------|-------------|
| `helpers/measurement.ts` `percentile`, `summarize`, `estimateCostMicroUsd` | Nearest-rank percentiles; cost from the four usage counts | `/llm stats` p50/p95 and the sweep's p99; both use the same nearest-rank rule, as the edge coverage requires |
| `helpers/claude_request.ts` `buildClaudeRequest`, `classifyClaudeResponse`, `extractUsage` | Exact production request bytes and response classification | The sweep harness imports these (they are pure) and overrides only `output_config.effort` and `max_tokens` |
| `helpers/schema_lint.ts` | Offline structured-output subset linter | Lint every new stage schema; add them to `LLM_JSON_SCHEMAS` so `llm_schemas.test.ts` covers them |
| `helpers/creation_validate.ts` `validateClassReply`, `validateRaceReply`, `helpers/skill_gen.ts` `parseSkillGenResult` | Clamping validators | "Passes schema validation" in the sweep = classifier ok plus these run offline on the reply |
| `scripts/llm/cli.mjs` `loadAnthropicKey`, `scrub` | In-process key read that never prints | Sweep harness reuses it (the key is read only by the harness at run time) |
| `scripts/llm/vitest.live.config.ts` | `*.live.ts` only, excluded from normal test runs | Put `sweep.live.ts` next to `prove-live.live.ts` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct-from-Node sweep (recommended) | Drive the real reducers like `prove-live.live.ts` | The in-module path cannot vary effort (a compile-time constant), is subject to the $1/day per-player cap (the sweep costs about $1), and pollutes the ledger. Latency differs from the in-module call by only the dispatch hop (Phase 39: 3-15 ms dispatch, in-module call p50 within 0.1 s of client e2e) |
| New stage-1 routes plus repurposed old names (recommended) | Rename to `*_stage1`/`*_stage2` and retire `world_gen`/`creation_class` | 16 test files and several tables reference the existing names; a rename adds churn for no behavior gain |
| Stats via reducer scan (recommended) | A public admin view over `llm_call_log` | CONTEXT says "view". A view must use index lookups, and `llm_call_log` has no route or time index (a new index is a no-clear change, proven). A view would also recompute on every call-log insert for any subscribed admin, and its output still has to be formatted client-side. See Open Questions 1 |

**Installation:** none. No packages are added by this phase.

**Version verification:** `spacetime --version` reports CLI 2.10.1; `spacetimedb` 2.10.1 confirmed on the registry. Pricing in `helpers/measurement.ts` (`input 2, output 10, cacheWrite 2.5, cacheRead 0.2` micro-USD per token) matches the current Sonnet 5.5 price table ($2 / $10 per MTok, 5-minute cache write $2.50, cache read $0.20) [VERIFIED: platform.claude.com prompt-caching doc fetched 2026-09-30]. The roadmap's "cost math against recalibrated prices" therefore needs a pinning test, not a code change.

## Package Legitimacy Audit

No external packages are installed by this phase. Nothing to audit. (The scratch migration probe installed `spacetimedb@2.10.1`, the same version the repo already pins, in a scratchpad directory outside the repo.)

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 player action (explore / travel to uncharted / start creation / pick archetype)
        |
        v
 reducer tx ---> enqueueLlmJob(stage-1 route)
        |            |-- kill switch off? ------------> refuse 'halted'  --+
        |            |-- state row missing? (fail closed) -> refuse 'halted' +--> ONE in-voice "Keeper is resting" line
        |            |-- global day held + r > ceiling? -> refuse 'ceiling' +
        |            |-- per-player caps (busy / $1 / 200 calls) -> existing refusals
        |            '-- reserve (player day + ledger + global day) -> llm_job pending + llm_dispatch
        v
 scheduled procedure llm_run (executor, unchanged shape)
   tx1 claim:  re-check kill switch + ceiling (own reservation already counted) -> failAtClaim('halted'|'ceiling')
               [refund once, in-voice failure line, domain lock released in the SAME tx]
   call Claude (no tx open) -> tx2 persist (usage, cost, call log) -> tx3 apply
        |
        v
 apply STAGE 1 (inside tx3)
   world:   write region + start location + first NPC, place character / open the passage, state -> FILLING,
            post milestone line, enqueueLlmJob(world_gen = stage 2, facts from DB)
   class:   write className + blurb + abilities=[first], step -> CLASS_FILLING,
            post stage-1 reveal event, enqueueLlmJob(creation_class = stage 2, facts from state)
        |   (all clients see the new public rows immediately)
        v
 stage-2 job runs the same pipeline
   success:  world: add locations / NPCs / enemies / uncharted edge, state -> COMPLETE
             class: merge stats + abilities, validateClassReply, step -> CLASS_REVEALED
   failure:  world: state -> FILL_ERROR + in-voice line ("[explore] to retry")   (region stays playable)
             class: step -> CLASS_FILL_ERROR + in-voice line (any input retries stage 2 only)

 client:  my_llm_jobs rows --> useLlmStatus --> selectLlmIndicator(rows, scope, rotation)
          5 s tick --> rotation counter --> next line from the route's pool (server data module)

 admin:   /llm stats | off | on --> submit_command --> ADMIN_IDENTITIES check --> helper
          stats: iterate llm_call_log once, group by route, percentile() --> one multi-line 'system' event
```

### Recommended Project Structure (additions only)
```
spacetimedb/src/
  data/
    llm_routes.ts            # +2 routes, tuned effort/maxTokens, timeouts (edited)
    llm_schemas.ts           # +WORLD_START_SCHEMA, REGION_FILL_SCHEMA, CLASS_REVEAL_SCHEMA, CLASS_FILL_SCHEMA (edited)
    llm_layers.ts            # +ROUTE_BLOCKS and volatile builders for the new/changed routes (edited)
    llm_indicator_lines.ts   # +per-route progress pools, rotation helper (edited, stays import-free)
    llm_limits.ts            # +ceiling default, rotation interval; retire phase cap constant (edited)
    llm_tuning.ts            # NEW: per-route {effort, maxTokens, source, p99OutputTokens, samples}; pure
  helpers/
    llm_stats.ts             # NEW: pure aggregation of call-log rows -> per-route stats + plain-text lines
    llm_budget.ts            # global day counter, ceiling check, kill-switch read (edited)
    llm_admin_state.ts       # setEnabled / setCeiling helpers (edited)
    world_gen.ts             # writeRegionStart / writeRegionFill split, fill input builder, retry (edited)
    llm_apply.ts             # stage-aware apply and failure handling (edited)
  reducers/
    llm.ts                   # llm_set_enabled, llm_set_daily_ceiling (edited)
    commands.ts              # /llm stats | on | off handling inside submit_command (edited)
scripts/llm/
  sweep.live.ts              # NEW: Node sweep + caching + class-reveal runs (paid; user-approved)
  sweep_rules.mjs            # NEW: pure rules (tone lint, effort choice, p99 rule, fixture order) + test
  sweep_fixtures.mjs         # NEW: 5 varied inputs per route (data only)
.planning/phases/43-.../
  43-measurements.json       # committed measurement record (canonical, per CONTEXT)
```

### Pattern 1: Stage chaining inside the apply transaction
**What:** The stage-1 apply writes the domain rows, then calls `enqueueLlmJob` for stage 2 in the same `tx`. If stage 2 is refused (budget, cap, kill switch, ceiling) the stage-1 content still commits and the state goes straight to the stage-2 error step.
**When to use:** world gen and class reveal.
**Why it works:** `applyStored` runs `deps.apply(tx, ...)` inside `ctx.withTx`, and `enqueueLlmJob` is duck-typed over `ctx.db`/`ctx.timestamp` (it already runs inside reducer txs and tests). `insertLlmDispatch`/`ensureLlmSweepScheduled` write ordinary rows. The stage-1 job is still `received` during apply, so it counts toward `LLM_PLAYER_MAX_ACTIVE_JOBS` (3): at most two jobs per world/class action, fine.
**Dedupe:** `buildDedupeKey` includes the route, so `SOURCE_KEYS.worldGen(genStateId)` can be reused for both stages without a collision, because the routes differ.
```typescript
// Source: pattern derived from helpers/llm_queue.ts enqueueLlmJob + helpers/world_gen.ts startWorldGeneration
const fill = enqueueLlmJob(tx, {
  route: 'world_gen',                       // stage 2 keeps the old route name
  playerId: job.playerId,                   // the stored requester, never ctx.sender
  characterId: genState.characterId,
  sourceKey: SOURCE_KEYS.worldGen(genState.id),
  request: { genStateId: genState.id.toString(), input: encodeRouteInput(buildWorldFillInput(tx, genState)) },
});
tx.db.world_gen_state.id.update({
  ...tx.db.world_gen_state.id.find(genState.id),
  step: fill.refused ? 'FILL_ERROR' : 'FILLING',
  generatedRegionId: region.id,
  updatedAt: tx.timestamp,
});
```
`buildWorldFillInput` must read facts from the database (region, start location, first NPC rows) so the same builder serves the first enqueue and the explore retry. Stage-1 text is model output: pass it through `sanitizeWorldData` in the volatile builder like all stored model text.

### Pattern 2: Route table row for a new route
Adding a route is a closed set of edits; the type system (`Record<LlmRoute, ...>`) lists most of them for you: `LLM_ROUTE_NAMES`, `LLM_ROUTES`, `ROUTE_BLOCKS` and the `buildRouteLayers` switch (`llm_layers.ts`), `ROUTE_BIGINT_PATHS` and `smokeInputFor` (`llm_inputs.ts`), `LLM_INDICATOR_LINES`, `LLM_INDICATOR_PRIORITY`, `LLM_CREATION_CONSOLE_ROUTES`/`LLM_CREATION_ONLY_ROUTES` (`llm_indicator_lines.ts`), `LLM_NO_AUTO_RETRY_ROUTES` and `LLM_SMOKE_ROUTES` (`llm_limits.ts`), `CREATION_LOCKS` and the lock-holder loop (`llm_sweeper.ts`), `applyLlmResult`/`applyLlmFailure`/`creationStateForJob` (`llm_apply.ts`). Pinned tests that enumerate routes (`llm_routes`, `llm_indicator_lines`, `llm_layers`, `llm_limits`, `llm_retry`, `llm_budget`, `llm_inputs`, `llm_queue`, `claude_request`, `views/llm`) must be edited deliberately in the same commit.

### Pattern 3: Global day counter folded into the existing ledger
**What:** Add `dayUtc: t.string().default('')` and `daySpentMicroUsd: t.u64().default(0n)` to `llm_spend`. Every ledger mutator in `llm_budget.ts` (`reserveLlmBudget`, `releaseLlmReservation`, `addLedgerSpend`, `subtractLedgerSpend`) already rewrites that one row; make each roll the day lazily (`if (row.dayUtc !== today) { daySpent = 0; dayUtc = today }`) and mirror spent changes into `daySpentMicroUsd`. Global held today = `(dayUtc === today ? daySpent : 0) + ledger.reservedMicroUsd`. `reservedMicroUsd` is already the live total of held reservations (not cumulative), so no per-job day tracking and no new job column are needed. A reservation made at 23:59 and settled at 00:01 correctly lands its spend on the new day.
**Reset:** lazy at UTC midnight with no scheduler: the check treats a stale `dayUtc` as zero spent without needing a write.
**Boundary rule:** refuse when `held + r > ceiling` (a reservation landing exactly on the ceiling is allowed). At claim the job's own reservation is already inside `reservedMicroUsd`, so the claim check is `held > ceiling`, never `held + r` (that would double-count and starve the last job).
```typescript
// Source: derived from helpers/llm_budget.ts (reserveLlmBudget / isPhaseLedgerExhausted) shape
export function globalDayHeld(ledger: any | undefined, today: string): bigint {
  if (!ledger) return 0n;
  const spent: bigint = ledger.dayUtc === today ? ledger.daySpentMicroUsd : 0n;
  return spent + ledger.reservedMicroUsd;
}
// enqueue:  if (globalDayHeld(ledger, today) + r > ceiling) refuse 'ceiling'
// claim:    if (globalDayHeld(ledger, today) > ceiling) failAtClaim('ceiling')
```

### Pattern 4: Kill switch and ceiling reasons collapse to one player line
Add refusal reasons `halted` (kill switch or missing state row) and `ceiling` to `LlmBudgetRefusal`/`LLM_REFUSAL_MESSAGES` (the `Record` type forces the map entry). Both map to the same string, so a request that trips both shows one line. Every caller (`world_gen`, `creation_generation`, `skill_offer`, `renown`, `npc_interaction`) already goes through `llmRefusalMessage`, and combat narration ignores refusals, so no per-caller change is needed. Replace the old `phase_cap` reason (its copy "The Keeper has fallen silent for now. Return later." is a good template).
**At claim:** extend the existing `failAtClaim` (status `failed`, refund with call refund, in-voice failure message written in the same tx) with error codes `halted` and `ceiling`; add both to `ACCOUNT_CLASSES` in `llm_status.ts` so `publicErrorBucket` stays `unavailable` and no number or reason leaks. CONTEXT says pending jobs "expire with refunds"; using the `failed` path rather than the `expired` status is deliberate, because only `notify(failed)` runs `applyLlmFailure`, which releases the creation or world-gen lock in the same transaction (an `expired` job would leave the lock to the sweeper's 60 s stranded-lock rule). Pass `errorCode` through `toApplyJob` so the failure copy can say "resting" instead of "something went wrong".

### Pattern 5: Progress-line rotation without new UI
`selectLlmIndicator(rows, scope)` is pure and returns one line per route. Add an optional `rotation` integer argument; the line is `pool[(rotation + Number(row.id)) % pool.length]`, with `pool[0]` equal to today's static line so existing behavior and copy tests are the rotation-0 case. `useLlmStatus` gets a `ref(0)` incremented by a `setInterval` every `LLM_PROGRESS_ROTATE_MS = 5000` (cleared on unmount) and passes it in. Counting ticks avoids comparing the client clock with the server's `createdAt`. The pool and interval constant live in `data/llm_indicator_lines.ts`, which must stay import-free (a test pins "no import statement").

### Anti-Patterns to Avoid
- **A view over `llm_call_log`:** views cannot `.iter()`; the table has only `by_job` and `by_player` indexes.
- **`requireAdmin(ctx)` for the non-admin `/llm` path:** it throws `SenderError('Admin only')`. CONTEXT wants an in-voice refusal, so check `ADMIN_IDENTITIES.has(ctx.sender.toHexString())` and answer with `fail(ctx, character, line)`.
- **Locking input during stage 2:** `useWorldGeneration.activeGeneration` filters `PENDING|GENERATING`; keep `FILLING` out of that set or the whole game console freezes for the stage-2 duration, defeating LAT-03. For creation, leave `CLASS_FILLING` out of `isCreationLlmProcessing`; the server's `switch (state.step)` answers input there with a "patience" line (same pattern as `GENERATING_CLASS`).
- **Resetting the day counter on a schedule:** lazy roll on touch is enough and avoids a new scheduled table.
- **Putting the ceiling check only at enqueue:** queued jobs (up to 10 minutes pending, retries) must stop too; the claim hook is the second half of COST-03.
- **Square brackets in `/llm stats` text:** `NarrativeMessage.renderLinks` turns `[text]` into a clickable keyword and uses `v-html`; emit only route names, numbers and plain punctuation.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Percentiles (p50/p95/p99) | A new quantile function | `percentile()`/`summarize()` in `helpers/measurement.ts` (nearest-rank, rank = ceil(p*n/100), throws on empty) | Already unit-tested; the edge coverage demands one fixed rule for stats and the sweep. Handle the empty-route case by returning zeros before calling it |
| Dollar math | A new price table | `estimateCostMicroUsd`, `CLAUDE_PRICE_MICRO_USD_PER_TOKEN` | Matches the live price table; ceil rounding already tested |
| Request building in the sweep | A second request builder | `buildClaudeRequest(route, buildRouteLayers(route, input))`, then override `body.output_config.effort` and `body.max_tokens` on the returned object | Guarantees the sweep measures production bytes, schema and cache layout |
| Response classification | Ad hoc JSON handling | `classifyClaudeResponse` (wrap the `fetch` result in the `{status, headers, text()}` shape) | Gives stop_reason, truncation, usage and schema-required-keys checks identically to the executor |
| Spend refunds at claim | A new expiry path | The existing `failAtClaim` closure in `claimLlmJob` | One refund-and-notify path already proven by the executor tests |
| Schema validity of stage schemas | Manual review | `lintSchema` plus the registry in `llm_schemas.test.ts` | Limits: at most 24 optional params and 16 union-typed params across the request; unions explode compile cost [CITED: platform.claude.com structured-outputs doc] |
| Admin identity | A new allowlist | `ADMIN_IDENTITIES` from `data/admin.ts` | Single source |
| Singleton row access | New helpers | `getAdminState`, `patchAdminState` (`llm_admin_state.ts`), `getPhaseLedger` (`llm_budget.ts`) | Existing, tested, duck-typed |
| NPC gender | New resolution | `resolveNpcGender`/`npcGender` (`data/npc_gender.ts`) | Stage-1 NPC apply must go through it |
| Keeper tone lint | A fresh banned list | `KEEPER_BANNED_PHRASES` and the Naming overuse list in `data/keeper_bible.ts` | Single source of tone rules |

**Key insight:** every cost and state mutation in this system already funnels through five small modules. The risk in this phase is not missing machinery, it is touching one funnel point and forgetting its mirror (reserve vs release vs settle vs sweeper charge; enqueue vs claim; stage-1 apply vs stage-1 failure vs sweeper stranded lock).

## Runtime State Inventory

This is not a rename/refactor phase, but it changes persistent schema on a database that holds the user's stored Anthropic key, so the schema-migration facts matter.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Local `uwr` DB: `llm_config` (key, length 108), `llm_admin_state` singleton (key status), possibly an empty `llm_spend`, `llm_job`/`llm_call_log` empty at the time of the last record (41-LOCAL-PROOF: no paid call ever made) | Use only additive, defaulted changes (table below). Do **not** clear |
| Live service config | None outside the module (proxy is gone since Phase 42) | None |
| OS-registered state | None. The user's local server (port 3000, running at research time) must not be restarted by research or probes | None |
| Secrets/env vars | `ANTHROPIC_API_KEY` in `spacetimedb/.env.local` (read only in-process by `scripts/llm/cli.mjs`); key also stored in `llm_config` | Sweep harness may reuse `loadAnthropicKey()` at run time; never print |
| Build artifacts | `src/module_bindings/` is generated; `admin_llm_status` view shape change requires `spacetime generate` | Regenerate after the view change; `llm_*` tables must still be absent from bindings (privacy test) |

### Schema migration behavior (empirical, scratch server)
Probe: isolated SpacetimeDB 2.10.1 server on 127.0.0.1:3010 with its own data dir and CLI config, scratch module with seeded rows, republished with changes and no `--delete-data`. Server stopped afterward; the user's server on 3000 and `uwr` were never contacted. [VERIFIED: scratch probe 2026-09-30]

| Change on a populated table | Result without clear |
|-----------------------------|----------------------|
| New column `t.u64().default(0n)` | Accepted; existing rows get the default (verified by `SELECT`) |
| New column `t.bool().default(false)` on a new table | Accepted |
| New column `t.string().optional()` with **no** default | **Refused**: "Adding a column note to table job requires a default value annotation" |
| New column `t.string().optional().default(undefined)` | Accepted; existing rows read as none |
| New table | Accepted |
| New btree index on an existing column | Accepted (created in place) |
| New view, then a changed view row type | Accepted (views hold no data; clients are told they are disconnected, so pass `-y`) |

Consequences for the design:
- `llm_admin_state`: add `llmEnabled: t.bool().default(true)` and `dailyCeilingMicroUsd: t.u64().default(10_000_000n)`. Existing row keeps working, kill switch defaults to "on", ceiling to $10.
- `llm_spend`: add `dayUtc: t.string().default('')` and `daySpentMicroUsd: t.u64().default(0n)`.
- Stage states are new `step` string values, no schema change.
- `llm_call_log` needs no new column for stats (route, outcome, latencyMs, costMicroUsd, createdAt, four token counts exist).
- No new tables are required. If the planner prefers a per-day table or a `by_route` index, both are also no-clear.
- The recording test mock validates inserted rows against recorded columns, so every `insert` of these tables in code and tests (`ensureAdminState`, `ensureLedger`, test fixtures) must include the new fields.
- Maincloud: the `.default()` forms are the documented auto-migratable forms; the user's later maincloud publish should still be a dry look (the Phase 42 note that the CLI, not the docs, is authoritative applies).

## Common Pitfalls

### Pitfall 1: Thin p99 from 5 samples
**What goes wrong:** nearest-rank p99 of 5 (or 10 pooled) samples is simply the maximum. A tuned `max_tokens` of max x 1.25 can still be too tight for the rare long reply, and the executor does not retry a `truncated` reply (BILLED_FAILURE_CLASSES), so a world-gen or creation player gets a failure and pays the call.
**Why it happens:** the sweep's cell size was chosen for cost, not statistics.
**How to avoid:** run the sweep with generous caps so truncation never censors the data; record `stop_reason` per sample; if the chosen effort's cell and the other effort's cell have per-cell mean output within 15 percent (Phase 39: 578 vs 592 and 1,858 vs 1,911 tokens, i.e. within 3 percent), pool both cells for the p99 (n = 10); otherwise use the chosen cell only. Make the stats table report `truncated` outcome counts per route so a too-tight cap is visible in production. Note that output tokens include thinking tokens, and thinking counts toward `max_tokens` even when not returned [CITED: platform.claude.com effort doc, Sonnet 5.5 section]; measure `usage.output_tokens`, never visible text length.
**Warning signs:** `outcome: truncated` rising in `/llm stats`; any sample with `stop_reason: max_tokens` in the sweep (re-run that cell with a higher cap before computing p99).

### Pitfall 2: Caches are per route and per effort, and need sequential calls
**What goes wrong:** the "caching works" assertion fails or is meaningless.
**Why:** `output_config.format` changes invalidate the system and message caches, and effort changes invalidate message blocks [CITED: platform.claude.com prompt-caching doc]. Different schemas therefore do not share the Keeper Bible cache entry; text routes (no format) can share it with each other at equal effort. A cache entry is only available after the first response begins, so parallel calls cannot read each other's write. The first call in each effort cell writes (1.25x), later calls read.
**How to avoid:** the proof makes call 2 only after call 1 returns, within the 5-minute TTL, at the route's final effort and unmodified schema; assert `usage.cache_read_input_tokens > 0` on call 2 (and `cache_creation_input_tokens > 0` or a read on call 1). Per the edge coverage, a prefix under 512 tokens is recorded as "not cacheable"; all routes qualify (the Bible alone is 9,635 characters, about 2.4K tokens). Do not change effort or schema between the two calls. Do not use the 1-hour TTL (2x write price, no benefit for sporadic routes).
**Warning signs:** `cache_read_input_tokens: 0` on call 2 with `cache_creation_input_tokens: 0` on call 1 (prefix below minimum or an invalidator such as a changed body byte); the request body must be byte-stable (`bodyText` is built in fixed key order).

### Pitfall 3: The sweep must not run through the module
**What goes wrong:** the in-module path cannot vary effort, hits the $1/day per-player cap about two-thirds through, and adds sweep spend to the all-time ledger and today's global total (which would push the ceiling).
**How to avoid:** Node harness, direct calls, harness-local spend guard (cumulative `estimateCostMicroUsd` of observed usage, abort before exceeding the $5 cap with a margin), sequential execution for clean latency and cache behavior. Key read in-process via `loadAnthropicKey`, every printed string through `scrub`, no prompts or completions printed (record sizes, counts, pass/fail, tone-lint rule ids only).

### Pitfall 4: Fail-closed state row breaks every enqueue test
**What goes wrong:** the edge coverage says a missing kill-switch/ceiling row fails closed. Dozens of existing tests call `enqueueLlmJob` through mock contexts that have no `llm_admin_state` row, and they would all start seeing refusals.
**How to avoid:** put a default enabled row (and a default ceiling) in the shared test context factory in `helpers/test-utils.ts` so existing tests keep their meaning, and add explicit tests for the missing-row case. In production the row exists as soon as `set_api_key` has run (it calls `patchAdminState`, which inserts the singleton), and calls cannot succeed before a key exists anyway; also seed it in `spacetimedb.init` (index.ts line 561) so a freshly cleared database is not stuck. The user's current local row already exists and gets the defaults from the migration.

### Pitfall 5: Retiring the phase cap touches more than the budget module
**What goes wrong:** `LLM_PHASE_SPEND_CAP_MICRO_USD` is read by `reserveLlmBudget`, `isPhaseLedgerExhausted` (claim hook), `llm_smoke_test` (all-or-nothing check), `views/llm.ts` (`phaseCapMicroUsd` column) and `scripts/llm/proof_rules.mjs`/`prove-live.live.ts` (`shouldStopForSpend` reads `phaseCapMicroUsd`). Existing tests pin the phase-cap behavior (budget, queue, executor, view tests) and must be flipped on purpose.
**How to avoid:** grep the constant and the three `phase_cap`/`isPhaseLedgerExhausted` sites; keep the view column name but source it from the ceiling (or rename it and update the harness in the same plan); the smoke test's all-or-nothing check becomes a ceiling and kill-switch check. Keep `llm_spend.spentMicroUsd` as the all-time record that `/llm stats` prints.

### Pitfall 6: Staged world-gen state machine ripple
**What goes wrong:** a new `FILLING` or `FILL_ERROR` state is read by several sites as "not ERROR, not PENDING/GENERATING", which is mostly right and partly wrong. `travel.ts` only skips generation quietly when the existing state is `COMPLETE` with a region (any other truthy non-ERROR state also avoids a duplicate generation, but only by accident); the `explore` intent answers "already explored" for any non-ERROR, non-PENDING/GENERATING state, which would swallow the stage-2 retry for `FILL_ERROR`.
**How to avoid:** list the readers and decide each: `travel.ts` (treat `FILLING` and `FILL_ERROR` as explored, no new gen), `intent.ts` explore (add a branch **before** the "nothing uncharted here" check: when the current location's region has a `FILL_ERROR` state, retry stage 2; after stage 1 the uncharted edge became a normal passage, so the player is usually not standing on an uncharted location), `llm_sweeper.releaseStrandedLocks` (`FILLING` with no active `world_gen` job for 60 s becomes `FILL_ERROR` with a line, not `ERROR`), `retryStarterWorldGen` (a starter in `FILLING` or `FILL_ERROR` is placed already: `none`/new branch, never a second starter), `useWorldGeneration.ts` (must not include `FILLING`). `world_gen_state` is public: error messages carry only in-voice text.

### Pitfall 7: Staged class reveal step machine
**What goes wrong:** `submit_creation_input`, `start_creation` resume text, go-back (`determineGoBackTarget`, the GENERATING exclusion list), the sweeper's `CREATION_LOCKS`, `creationStateForJob` (job domain to expected step) and the client's `useCharacterCreation` step list all know `GENERATING_CLASS`/`CLASS_REVEALED`.
**How to avoid:** add `CLASS_FILLING` (like `GENERATING_CLASS`: input answered with patience, go-back blocked, sweeper lock whose stranded release goes to `CLASS_FILL_ERROR`) and `CLASS_FILL_ERROR` (any input re-enqueues stage 2 from the state's stage-1 facts, go-back allowed). `creationStateForJob` maps `creation_class_reveal` to `GENERATING_CLASS` and `creation_class` (stage 2) to `CLASS_FILLING`, so the stale-result guard keeps working. Stage 1 stores `abilities` as a JSON array of one; stage 2 builds `{className, classDescription, stats, abilities: [first, ...rest]}` and runs the **existing** `validateClassReply`, so clamping is unchanged. `CLASS_REVEALED` (choose one of three) is reached only after stage 2, which is exactly "confirmation waits for stage 2".

### Pitfall 8: A stage-2 reply that contradicts stage 1
**What goes wrong:** stage 2 names a location the player already knows, renames the region, or returns a `connectsTo` name that matches nothing.
**How to avoid:** stage 2 never re-emits stage-1 fields (its schema has no region name, no first NPC); `connectsTo` is resolved by exact name against stage-1 start location plus the new set, unknown names dropped (the existing code already skips unmatched names); the route block says "use the given names exactly" (the Bible already says so). Stage-2 apply also runs the vendor/banker safety net for the start location, and the stage-2 failure handler runs it too, so a failed stage 2 never leaves the start location without essential services.

### Pitfall 9: Idle-room recomputation cost of a stats view (if the view option is chosen)
**What goes wrong:** a public admin view recomputes when any `llm_call_log` row changes, and has to scan by an index per route.
**How to avoid:** prefer the reducer. If the planner insists on a view, add `{ accessor: 'by_route', algorithm: 'btree', columns: ['route'] }` to `llm_call_log` (proven no-clear), loop `LLM_ROUTE_NAMES`, return `[]` for non-admins, and still format text client-side.

## Code Examples

### max_tokens rule (pure, deterministic)
```typescript
// Source: CONTEXT.md locked formula + edge coverage (nearest-rank over sorted samples)
import { percentile } from '../helpers/measurement';
export function tunedMaxTokens(outputTokens: readonly number[]): number {
  const p99 = percentile(outputTokens, 99);            // nearest-rank on the sorted copy; throws on empty
  return Math.max(256, Math.ceil((p99 * 1.25) / 256) * 256);
}
// fewer than LLM_TUNING_MIN_SAMPLES (5) successful samples -> keep the current value, record "insufficient data"
```

### Per-route stats aggregation (pure; the reducer only gathers rows and prints)
```typescript
// Source: derived from llm_call_log columns in schema/tables.ts and percentile() in helpers/measurement.ts
interface RouteStats { calls: number; costMicroUsd: bigint; p50Ms: number; p95Ms: number; errors: number; truncated: number }
function summarizeRoute(rows: { outcome: string; latencyMs: bigint; costMicroUsd: bigint }[]): RouteStats {
  const ok = rows.filter((r) => r.outcome === 'ok').map((r) => Number(r.latencyMs));
  return {
    calls: rows.length,
    costMicroUsd: rows.reduce((a, r) => a + r.costMicroUsd, 0n),
    p50Ms: ok.length ? percentile(ok, 50) : 0,         // a route with no calls shows zeros, never an error
    p95Ms: ok.length ? percentile(ok, 95) : 0,
    errors: rows.filter((r) => r.outcome !== 'ok').length,
    truncated: rows.filter((r) => r.outcome === 'truncated').length,
  };
}
// Windows: last 24 h = createdAt >= now - 86_400_000_000n micros; all time = every row. One iter() in a reducer.
// Output: one 'system' event, one line per route, no square brackets:
//   world_gen_start: 12 calls, $0.0712, p50 5.1s, p95 7.9s, 1 errors | all time 40 calls, $0.2310, p50 5.0s, p95 8.8s, 3 errors
```
Note on `costMicroUsd`: attempts of unknown billing record the reservation as cost (conservative), so cost can read slightly high.

### Admin command handler shape (inside `submit_command`, before the generic command insert)
```typescript
// Source: pattern from reducers/commands.ts (/synccontent, /unlockrace) + memory rule "fail() over SenderError"
const llmCmd = trimmed.match(/^\/llm\s+(stats|on|off)\s*$/i);
if (llmCmd) {
  if (!ADMIN_IDENTITIES.has(ctx.sender.toHexString())) {
    return fail(ctx, character, 'The Keeper does not discuss his accounts with you.');
  }
  // stats: scan llm_call_log once; on/off: patchAdminState(ctx, { llmEnabled: ... })
  return;
}
```
`submit_intent` currently inserts a `command` row for any `/` text without running these admin branches (existing behavior for `/synccontent` too); the client sends slash commands through `submit_command`, so handle `/llm` there, and optionally route `submit_intent`'s `/` branch to the same helper so the command is never silently inert.

### Kill-switch and ceiling reducers (admin only, for scripts and the console)
Two small reducers next to `set_api_key` in `reducers/llm.ts`: `llm_set_enabled({ enabled: t.bool() })` and `llm_set_daily_ceiling({ microUsd: t.u64() })` (validate `> 0` and a sane maximum). Both `requireAdmin(ctx)` (these have no character context) and write through `patchAdminState`. Slash `/llm off|on` calls the same helper from `submit_command`. Optional `/llm ceiling <dollars>` parsed with string math, no floats.

### Progress pools (illustrative copy; every line must pass the existing voice and pronoun tests)
Constraints enforced by `llm_indicator_lines.test.ts`: starts with "The Keeper", ends with three ASCII dots, no `!`, no banned phrase, **no word "it/its/they/them/their/she/her"**, no `KEEPER ... they/them/their/its` pattern, player only as "you/your". Suggested pools (rotation index 0 stays the current static line):
- `world_gen_start`: "The Keeper is deciding where you will stand..." / "The Keeper is squinting at the horizon, with visible reluctance..."
- `world_gen` (stage 2): "The Keeper is filling in the rest of the map, grudgingly..." / "The Keeper is deciding who else lives out here..." / "The Keeper is placing things that will want to eat you..." / "The Keeper is remembering the roads between places..."
- `creation_class_reveal`: "The Keeper is deciding what you are good for..." / "The Keeper is working out what you are..."
- `creation_class` (stage 2): "The Keeper is sorting out the rest of what you can do..." / "The Keeper is deciding which of your talents to admit to..."
- Server milestone lines (events, not indicator): world "The Keeper clears his throat. This ground will do for now; the rest of the region is still being remembered." and class "That is the shape of you. The rest of your abilities are still being worked out, so do not touch anything."
- Stage-2 failure lines: world "The Keeper loses the thread of the rest of the map. What he has already shown you will hold. Type [explore] and he will try again." / class "The Keeper loses the thread of your finer details. Your name and first ability stand. Say anything and he will try the rest again." (Check the second of each against the in-game pronoun tests; bracketed `[explore]` is intentionally clickable.)
- Kill switch / ceiling: "The Keeper is resting. Return later." (same string for both; the existing phase-cap copy "The Keeper has fallen silent for now. Return later." is the voice to match.)

### Effort sweep decision rule (pure, lives in `scripts/llm/sweep_rules.mjs` with a test)
For each route in fixed order, per effort in fixed order (`low`, `medium`): every sample must (a) classify `ok` with `stop_reason: end_turn`, (b) pass the offline validator for that route (`validateRaceReply`, `validateClassReply`, `parseSkillGenResult`, region/NPC reply parsers, text-route non-empty), (c) pass the tone lint. The route takes the **lowest effort with zero failures**; a tie on pass rate goes to `low` and the record notes the tie. A route with fewer than 5 successful samples is "insufficient data" and keeps its current values. Proposed tone lint (builds on `KEEPER_BANNED_PHRASES`): no banned phrase (case-insensitive) in any string field; no markdown (`**`, backticks, leading `# `, bullet lines) in any string field or in text routes; no `!` in narrative, description and class text; the Naming overuse words (Verge, Veil, Ashen, Dusk, Shadow, Gloom, Hollow, Mire, Blight, Fell) absent from region and location names; class name 1-2 words and ability names 2-3 words; NPC description and greeting must not contradict the declared `gender` (use `inferGenderFromText`); text routes: no JSON wrapper, no surrounding quotes, 2-4 sentences for narration.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Effort default `high` on Sonnet 5.5 | Explicit `low` per route (all routes already pinned to `low` by `DEFAULT_EFFORT`) | Phase 40 | The sweep can only confirm `low` or raise a failing route to `medium`; there is no level below `low` |
| Thinking off via `thinking: {type: "disabled"}` | 400 on Sonnet 5.5; `{type: "between_tools"}` is the off-switch (low/medium/high effort only) | Sonnet 5.5 | Not pursued: the request builder forbids a `thinking` key and Phase 39 measured no latency change from it. Mention only if the sweep shows thinking tokens dominating a route |
| One monolithic region/class call | Two jobs: tiny reveal call, then fill | This phase | Player waits for roughly 600 output tokens (world) or 280 (class) instead of 1,900 or 800 |
| Per-phase $2 ledger as the limit | $10/day global ceiling plus kill switch; ledger kept as all-time record | This phase | Retire `phase_cap` refusal and `isPhaseLedgerExhausted` |

**Deprecated/outdated:** `LLM_PHASE_SPEND_CAP_MICRO_USD` as a limit; the `phase_cap` refusal reason; `phaseCapMicroUsd` in `admin_llm_status` meaning "phase cap".

### Measured baselines (Phase 39, real Claude, effort low vs medium)
[CITED: .planning/phases/39-procedure-to-claude-spike/39-SPIKE-RECORD.md]
| Cell | Client e2e p50 | Mean output tokens |
|------|----------------|--------------------|
| skill, effort low | 5.27 s | 578 |
| skill, effort medium | 5.28 s | 592 |
| region, effort low | 17.36 s | 1,858 |
| region, effort medium | 17.71 s | 1,911 |
Region latency is dominated by output tokens (about 110 tokens/s); minimal call p50 about 1.0 s; cache read observed (3,727 tokens on a skill pair). The effort sweep should therefore be expected to show no meaningful latency difference between low and medium; the deciding factor will be pass rate on validation and tone.

### Expected stage timings (estimates to be replaced by the sweep) and the LAT-06 decision
[ASSUMED] at ~110 tokens/s plus ~1 s first-token latency: world stage 1 about 600 tokens, about 6 s; world stage 2 about 1,400 tokens, about 13 s; class reveal stage 1 about 280 tokens, about 3.5 s; class stage 2 about 500-600 tokens, about 6 s. The unstaged class call (about 800 tokens) is already near 8 s, so the post-staging reveal is expected to be well under the 10 s threshold and **parallel archetype generation is expected to be left out**. Decision rule to implement and record: reveal latency = stage-1 `creation_class_reveal` end-to-end (enqueue to apply is measured by the harness as API latency plus a recorded dispatch allowance of 0.3 s); build the parallel path only if its **p50 exceeds 10 s**; record p50, p95 and the verdict in `43-measurements.json` whichever way it falls. If it must be built: on `creation_race` apply (or reuse of a known race), enqueue `creation_class_reveal` for both archetypes in one transaction (two jobs, per-player cap of 3 active jobs still holds), key by archetype in the source key, and discard the unchosen one; note the two parallel calls cannot share a cache write.

## Effort Sweep: Plan, Cost and Traceability

**Routes in scope (9, fixed order):** `creation_race`, `creation_class_reveal`, `creation_class`, `world_gen_start`, `world_gen`, `skill_gen`, `renown_perk_gen`, `npc_conversation`, `combat_narration`. (`smoke_test` is a connectivity check, not a production route; skip it. The roadmap's "7 production routes" becomes 9 once the two stage-1 routes exist; the extra 20 calls are about $0.1.)

**Run A (sweep):** 9 routes x 2 efforts x 5 fixtures = 90 sequential calls. Fixtures are five varied, route-realistic inputs per route (`sweep_fixtures.mjs`), not the one-line `smokeInputFor` inputs (those would under-measure output size). For the stage-2 routes use real stage-1 outputs captured earlier in the same run as facts. Caps during the sweep: generous provisional values so nothing truncates (world fill 4096, world start 2048, class reveal 1024, class fill 2048, others at today's values).
**Run B (confirmation, after values are written to the route table):** per route two sequential calls at final effort and final `max_tokens`: assert `stop_reason: end_turn`, assert `cache_read_input_tokens > 0` on call 2, and record the class-reveal latency for LAT-06. About 18 calls.

**Cost estimate** (price $2 in / $10 out / $2.50 write / $0.20 read per MTok; input prefix about 3.5-4.5K tokens; an effort cell writes the cache once and reads four times; output sizes assumed except skill and region):
| Route | Output tokens (est.) | Basis |
|-------|---------------------|-------|
| creation_race | 350 | [ASSUMED] |
| creation_class_reveal | 280 | [ASSUMED] |
| creation_class (fill) | 550 | [ASSUMED] |
| world_gen_start | 600 | [ASSUMED] |
| world_gen (fill) | 1,400 | [ASSUMED] from region 1,858-1,911 measured |
| skill_gen | 580-590 | [CITED: Phase 39] |
| renown_perk_gen | 650 | [ASSUMED] |
| npc_conversation | 300 | [ASSUMED] |
| combat_narration | 130 | [ASSUMED] |
Output about $0.48 per 10 calls across the nine routes, plus cache writes (18 cells x about $0.01 = $0.18) and reads (about $0.07): **Run A about $0.75, Run B about $0.15, total about $0.9, plausible range $0.5-1.5, against the $5 cap.** A harness-local guard stops the run when cumulative cost approaches $4.50. Wall clock sequential: about 10 minutes for Run A. Because the module's per-player cap ($1/day) is below the sweep cost, this is another reason the sweep must not run through the reducers.

**Traceability (make "every value cites a measurement" enforceable):** a pure module `data/llm_tuning.ts` holds, per route, `{ effort, maxTokens, p99OutputTokens, samples, source: '43-measurements.json' }`, and `data/llm_routes.ts` builds its table from it. A unit test reads the committed measurement file (`node:fs` with `// @ts-ignore`, the precedent in `llm_indicator_lines.test.ts`), recomputes `tunedMaxTokens(samples)` and the effort rule, and asserts equality with `LLM_ROUTES`, and that every route either traces to a recorded measurement or is marked "insufficient data" and unchanged. Risk: the milestone-archive workflow moves phase directories; see Open Questions 3.

**Measurement file shape (fixed key order so reruns diff cleanly):** `{ schemaVersion, model, recordedAt, environment, totals: { calls, costMicroUsd }, routes: { <route in fixed order>: { efforts: { low: { samples: [ { ok, stopReason, latencyMs, inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens, schemaOk, toneFailures: [ruleIds] } ], summary }, medium: {...} }, chosenEffort, tie, p99OutputTokens, maxTokens, timeoutMs, insufficientData } }, caching: { <route>: { call1, call2, cacheReadOnCall2, pass, notCacheable } }, classReveal: { p50Ms, p95Ms, thresholdMs: 10000, parallelBuilt: false } }`. No prompts, completions or keys are stored.

**Timeouts:** CONTEXT locks only effort and `max_tokens`, but the stage routes need timeouts; recommend `max(30 s, 4 x measured p99 latency)` rounded up to 5 s, never above `ANTHROPIC_MAX_TIMEOUT_MS` (180 s, validated by `validateRoutes`), recorded in the same file. Existing generous timeouts stay otherwise.

## Staged Generation: Schema and Prompt Sketches

All fields required (no optional params), nullable via `anyOf` only where the existing ability schema already does, `additionalProperties: false`, built once at module load and deep-frozen (grammar cache keyed on byte-identical schema, 24 h TTL; the first call per schema pays compile latency, which is why the smoke test warms each JSON route: add the new routes to `LLM_SMOKE_ROUTES`).

- **`WORLD_START_SCHEMA`:** `regionName`, `regionDescription`, `biome` (existing enum), `startLocation` (`name`, `description`, `terrainType`, `isSafe`, `levelOffset`), `firstNpc` (`name`, `gender` (NPC_GENDERS enum, **required**, per the pronoun decision), `npcType`, `description`, `greeting`, `personality` object as today). No `locationName` (the NPC is at the start location). Smallest viable stage 1; `dominantFaction`, `landmarks`, `threats` move to stage 2 (a region row update), which keeps stage 1 near 600 tokens. Apply: insert region (starter-race marking unchanged), the start location (bind stone and crafting when safe, as today's first safe location), the NPC through `resolveNpcGender`, connect the start location to the source edge and turn that edge into a passage (existing logic), place the character if at location 0 and send the arrival message, ripple and discovery events as today. Skip the vendor/banker safety net and the uncharted boundary until stage 2.
- **`REGION_FILL_SCHEMA`:** `dominantFaction`, `landmarks`, `threats`, `locations` (the rest, 2-4), `npcs` (0-1 more, including any missing vendor or banker at the start location), `enemies` (2-3). Stage-1 facts in the volatile tail: region name, description, biome, start location name and description, first NPC name, type and gender. Apply: update the region row, insert locations and connect (names resolved against stage-1 start plus new), enemy templates and links, NPCs, safety net, uncharted boundary, then `COMPLETE`.
- **`CLASS_REVEAL_SCHEMA`:** `className`, `classDescription`, `firstAbility` (the existing `CLASS_ABILITY` shape). 3 union-typed fields (effect trio), well under the 16 limit.
- **`CLASS_FILL_SCHEMA`:** `stats` (existing object) and `abilities` (array, "exactly 2 more"; counts are not schema-enforceable, `validateClassReply` clamps). The route block restates the stage-1 name, description and first ability as facts and tells the model not to repeat or rename them.
- Route blocks are new static text per route (cacheable system[1]); the **volatile** tail carries all facts. Keep each block on the Keeper voice and the pronoun rules (NPC he/she; Keeper he; player "you").

## Global Ceiling and Kill Switch: Wiring Checklist

1. `data/llm_limits.ts`: `LLM_DAILY_CEILING_DEFAULT_MICRO_USD = 10_000_000n`, ceiling min/max for the admin setter, `LLM_PROGRESS_ROTATE_MS = 5000`; remove or deprecate `LLM_PHASE_SPEND_CAP_MICRO_USD`.
2. `schema/tables.ts`: the four defaulted columns above (on `llm_admin_state` and `llm_spend`); update `ensureAdminState`/`ensureLedger` inserts and test fixtures.
3. `helpers/llm_budget.ts`: day roll in every ledger mutator, `globalDayHeld`, reserve refusal order extended (pinned order today: `daily_calls`, `daily_cost`, `phase_cap`; the new `halted` check comes first, `ceiling` replaces `phase_cap`), remove `isPhaseLedgerExhausted` from the claim path.
4. `helpers/llm_queue.ts`: new refusal reasons and one shared copy line; `enqueueLlmJob` reads the admin-state row (missing = refuse) before reserving. Smoke jobs (`phase_only`) obey the kill switch and ceiling too ("halts all LLM calls").
5. `helpers/llm_executor.ts` `claimLlmJob`: replace the `isPhaseLedgerExhausted(tx)` line with the kill-switch and ceiling check (`failAtClaim('halted'|'ceiling')`), placed before the in-flight cap check so a halted job is refunded rather than deferred forever. Claim-time refusals refund exactly once (`releaseLlmReservation` is idempotent through `job.reservedMicroUsd`), so the sweeper's refund cannot double count. Two jobs competing for the last headroom are admitted in claim order by the existing transaction serialization.
6. `llm_status.ts`: `halted` and `ceiling` join `ACCOUNT_CLASSES`.
7. `reducers/llm.ts`: the two admin reducers and the smoke test's replaced cap check; `views/llm.ts`: `admin_llm_status` gains enabled flag, ceiling, today's spent and reserved, keeps spent/reserved/calls as the all-time record; regenerate bindings; update `proof_rules.mjs`/`prove-live.live.ts` field use in the same plan.
8. Tests: boundary at ceiling - 1, ceiling and ceiling + 1 micro-USD; UTC rollover (reserve at 23:59:59, check at 00:00:01); reserve/settle/release/sweeper-charge all keep `daySpent` and `reserved` consistent; kill switch plus ceiling refuse together with one line; claim-time refund once and sweeper does not refund again; missing state row fails closed; kill switch leaves in-flight jobs to finish.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Output-token sizes for every route except skill and region (race 350, class reveal 280, class fill 550, world start 600, world fill 1,400, renown 650, NPC 300, narration 130) | Effort Sweep cost; expected stage timings | Dollar estimate and timing predictions are off; the sweep replaces them with measurements, and the $5 harness guard bounds the downside |
| A2 | Stage-1 class reveal will measure well under 10 s, so LAT-06 parallel generation is left out | State of the Art / LAT-06 | If it measures over 10 s the parallel path must be built (design sketched above) |
| A3 | Pooling low and medium samples for p99 is statistically acceptable when per-cell means differ by under 15 percent | Pitfall 1 | Slightly higher or lower `max_tokens`; a too-low cap shows up as `truncated` in `/llm stats`. User may prefer chosen-cell-only |
| A4 | Using status `failed` (with refund and in-voice failure line) for kill-switch and ceiling refusals at claim satisfies CONTEXT's "expire with refunds" | Pattern 4 | If the user wants the literal `expired` status, the domain lock is then released by the 60 s sweeper rule instead of in the same transaction |
| A5 | Stage-1 world NPC may be any type; stage 2 supplies any missing vendor or banker and the safety net covers a failed stage 2 | Pitfall 8 / schemas | If the user wants the first NPC to be a service NPC, change the stage-1 route block; no structural impact |
| A6 | Stats computed in a reducer (private event line) rather than a view | Standard Stack alternatives | CONTEXT literally says "view"; see Open Questions 1 |
| A7 | Timeout rule `max(30 s, 4 x measured p99 latency)` for the new routes | Effort Sweep | Too tight a timeout fails a slow but valid call (no auto-retry on creation and world routes); the sweep records latency so it can be loosened |
| A8 | Dollar figures in this file use the current Sonnet 5.5 price table | Standard Stack | Verified against the docs on 2026-09-30; a later price change needs the one constant updated |

## Open Questions (RESOLVED)

All five are resolved in 43-PLANNING-NOTES.md. The plans follow those resolutions.

1. **RESOLVED: View vs reducer for `/llm stats`** (reducer scan with a plain-text system event (planning note 1))
   - What we know: CONTEXT says "an admin-only view aggregates `llm_call_log`" and "prints as a table in the log". Views cannot scan; `llm_call_log` has no route/time index; a client must still format the rows into console text; the no-clear probe shows an added index is safe.
   - What's unclear: whether the user cares about the mechanism or only the outcome.
   - Recommendation: reducer scan plus a private `system` event line (one tx, no standing subscription, no index change). State the interpretation in the plan; if the planner wants the literal view, add `by_route` and make the view return per-route rows.

2. **RESOLVED: Retention of `llm_call_log` and `llm_job`** (accept for now; retention todo stays open (planning note: accepted))
   - What we know: neither is pruned (Phase 42 left a retention todo); `/llm stats` iterates all call-log rows in one reducer.
   - What's unclear: when the table becomes large enough to matter (thousands of rows is fine for one reducer call).
   - Recommendation: accept now; the stats code should not assume row order and the plan can add the existing retention todo reference. Do not add pruning in this phase.

3. **RESOLVED: Where the committed measurements live** (spacetimedb/src/data/llm_measurements.json, not the phase directory (planning note 3))
   - What we know: CONTEXT says "committed to a measurements file in the phase directory"; a unit test that reads it for traceability would break if the phase directory is archived by the milestone cleanup.
   - Recommendation: keep `43-measurements.json` in the phase directory as the canonical record (per CONTEXT) and have the traceability test read it from there. To survive archival, either also commit an identical copy under `spacetimedb/src/data/` that the test reads instead (and a second assertion that the two files are byte-equal while the phase directory exists), or note in the plan that archival must move the file and update the test path together. The planner should pick one and write it into the plan.

4. **RESOLVED: Who runs the paid sweep** (checkpoint:human-verify with cost approval (planning note 4))
   - What we know: the user deferred live proofs and the sweep costs about $1; research made no live call. The harness reads the key from `spacetimedb/.env.local` inside its own process, which the user must have set up.
   - Recommendation: make the sweep a `checkpoint:human-verify` (cost approval and key presence) before it runs, and make every plan before it independent of its results (route values land in a later plan that consumes the file).

5. **RESOLVED: Unsure: should `submit_intent`'s `/` branch run the admin commands?** (submit_command only (planning note 5))
   - What we know: it currently only logs a command row; `/synccontent` and `/unlockrace` live in `submit_command` and the client uses that path.
   - Recommendation: handle `/llm` in `submit_command`; low-cost parity in `submit_intent` is optional.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | tests, sweep harness | yes | v22.23.2 | -- |
| pnpm | repo scripts | yes | 11.23.0 | -- |
| vitest | all tests | yes | 5.0.2 | -- |
| spacetime CLI | build, publish, generate, sql | yes | 2.10.1 | -- |
| Local SpacetimeDB server | local publish and any in-module check | running on 127.0.0.1:3000 at research time (user's; left untouched) | 2.10.1 | start via the run-local skill |
| Anthropic API key | the paid sweep | stored in the local module (`key_set true`, length 108 per Phase 41/42 records) and expected in `spacetimedb/.env.local` (contents not inspected by research) | -- | none: the sweep cannot run without it; user supplies/approves |
| Network to api.anthropic.com | sweep | not tested (no live call by constraint) | -- | -- |
| Scratch server for schema probes | already done | used and stopped; port 3010 free again | -- | -- |

**Missing dependencies with no fallback:** a working Anthropic key and cost approval for the paid runs (user action).
**Missing dependencies with fallback:** none.

## Validation Architecture

Nyquist validation is enabled (`workflow.nyquist_validation: true`).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 5.0.2 (server tests in `spacetimedb/`, client tests at repo root, harness-rule tests as `scripts/llm/*.test.mjs` through the root runner) |
| Config file | none for the server (defaults, includes `**/*.test.ts` under `spacetimedb/`); `vite.config.ts` test block at the root; `scripts/llm/vitest.live.config.ts` for `*.live.ts` only |
| Quick run command | `cd spacetimedb && npx vitest run src/data/llm_routes.test.ts src/data/llm_indicator_lines.test.ts src/helpers/llm_budget.test.ts` |
| Full suite command | `pnpm --dir spacetimedb test` and `pnpm test` (root: client plus script tests) |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LAT-01 | `tunedMaxTokens` formula (floor 256, round up to 256, p99 nearest-rank); effort rule (lowest passing, tie to low, insufficient data keeps values); `LLM_ROUTES` equals values recomputed from the measurement file | unit | `cd spacetimedb && npx vitest run src/data/llm_tuning.test.ts src/data/llm_routes.test.ts` | Wave 0 (new `llm_tuning.test.ts`; `llm_routes.test.ts` exists and is extended) |
| LAT-01 | Sweep rules: tone lint, fixture order, spend guard, pooling rule | unit | `pnpm exec vitest run scripts/llm/sweep_rules.test.mjs` | Wave 0 |
| LAT-02 | Cache layout unchanged (2 breakpoints, bible then route block) and the harness assertion logic (`cache_read > 0` on call 2, "not cacheable" under 512 tokens) | unit | `cd spacetimedb && npx vitest run src/helpers/claude_request.test.ts` plus `sweep_rules.test.mjs` | exists / Wave 0 |
| LAT-02 | Live: `cache_read_input_tokens > 0` per route | paid manual (Run B) | `pnpm exec vitest run --config scripts/llm/vitest.live.config.ts sweep` | Wave 0 (user-approved run) |
| LAT-03 | Stage 1 apply writes region, start location, first NPC, places the character, sets `FILLING`, enqueues stage 2; stage 1 visible before stage 2 completes; stage 2 apply fills and sets `COMPLETE`; stage-2 failure leaves a playable stage 1 with `FILL_ERROR`; explore retries stage 2; sweeper moves a stranded `FILLING` to `FILL_ERROR`; stage-2 refusal goes straight to `FILL_ERROR` | unit | `cd spacetimedb && npx vitest run src/helpers/llm_apply.test.ts src/helpers/world_gen.test.ts src/helpers/llm_sweeper.test.ts src/reducers/intent.test.ts` | exist; extended; characterization snapshots flipped on purpose |
| LAT-04 | Class stage 1 sets `CLASS_FILLING` with `abilities` of one and enqueues stage 2; stage 2 merges and reaches `CLASS_REVEALED`; stage-2 failure sets `CLASS_FILL_ERROR`, any input re-enqueues stage 2 only; go-back rules; sweeper lock | unit | `cd spacetimedb && npx vitest run src/helpers/creation_generation.test.ts src/helpers/llm_apply.test.ts src/helpers/llm_sweeper.test.ts` | exist; extended |
| LAT-05 | Pools: voice, pronoun, ellipsis, parity with route names; rotation helper deterministic; `selectLlmIndicator` with rotation 0 equals today's output; client tick wiring | unit | `cd spacetimedb && npx vitest run src/data/llm_indicator_lines.test.ts` and `pnpm exec vitest run src/composables/useLlmStatus.test.ts` | exist; extended |
| LAT-06 | Decision rule from the recorded reveal number; if built, both archetypes enqueue in one tx | unit | `cd spacetimedb && npx vitest run src/helpers/creation_generation.test.ts` | extended (only if built) |
| COST-03 | Ceiling boundary (-1, =, +1), UTC rollover, reserve/release/settle/sweeper-charge consistency, one line when both refuse, claim-time refund once, missing row fails closed, kill switch lets in-flight finish, admin reducers admin-only | unit | `cd spacetimedb && npx vitest run src/helpers/llm_budget.test.ts src/helpers/llm_queue.test.ts src/helpers/llm_executor.test.ts src/helpers/llm_admin_state.test.ts src/reducers/llm_admin.test.ts` | exist; extended; phase-cap tests flipped on purpose |
| OPS-02 | `summarizeRoute` (zeros for empty routes, nearest-rank, 24 h vs all time window edges, error and truncated counts), plain-text formatting (no `[`/`<`), non-admin in-voice refusal, admin gate | unit | `cd spacetimedb && npx vitest run src/helpers/llm_stats.test.ts src/reducers/llm_admin.test.ts` | Wave 0 (`llm_stats.test.ts`); `llm_admin.test.ts` exists |
| All | Privacy and absence guards still hold (no `llm_*` table public, bindings clean after regeneration) | unit | `cd spacetimedb && npx vitest run src/schema/llm_privacy.test.ts src/schema/llm_absence.test.ts` | exist |
| All | Model-literal guard and route-table validity | unit | `cd spacetimedb && npx vitest run src/data/model_literals.test.ts src/data/llm_routes.test.ts` | exist |

### Sampling Rate
- **Per task commit:** the quick command for the touched module (each file above runs in about 1 s).
- **Per wave merge:** `pnpm --dir spacetimedb test` and `pnpm test`.
- **Phase gate:** both full suites green, `spacetime build -p spacetimedb` succeeds, regenerated bindings have no `llm_*` tables other than the existing public view types, before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `spacetimedb/src/data/llm_tuning.test.ts` (and `llm_tuning.ts`): traceability and formula, covers LAT-01
- [ ] `spacetimedb/src/helpers/llm_stats.test.ts` (and `llm_stats.ts`): covers OPS-02
- [ ] `scripts/llm/sweep_rules.test.mjs` (and `sweep_rules.mjs`, `sweep_fixtures.mjs`): covers LAT-01/LAT-02 harness logic
- [ ] `helpers/test-utils.ts`: default enabled `llm_admin_state` row and default ceiling in the shared mock context, so existing enqueue tests keep passing under fail-closed
- [ ] Recorder/strict test updates for the new defaulted columns on `llm_admin_state` and `llm_spend`
- [ ] Framework install: none

## Security Domain

`security_enforcement` is not set to false in `.planning/config.json`, so this section applies.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no (no new auth) | existing SpacetimeDB identity |
| V3 Session Management | no | -- |
| V4 Access Control | yes | Server-side admin gate: `requireAdmin` for the two admin reducers, `ADMIN_IDENTITIES` check inside `submit_command` for `/llm` (non-admin gets an in-voice `fail()` line); `admin_llm_status` keeps returning `[]` to non-admins; never trust a client claim of admin |
| V5 Input Validation | yes | Slash-command regex with a closed verb list; ceiling setter validates a positive bounded `u64` and parses dollars as strings without floats; stage-2 facts built from DB rows and passed through `sanitizeWorldData` (stage-1 text is model output) |
| V6 Cryptography | no | no new crypto; the API key stays only in `llm_config` and the harness process |
| V7 Error handling and logging | yes | In-voice player lines carry no number, provider or limit detail; `halted`/`ceiling` stay in the `unavailable` public bucket; module logs keep using `redactSecrets`; the sweep record stores no prompts, completions or keys |
| V8 Data protection | yes | Stats print route names, counts, cost and latency only (no player ids, no text); `llm_*` tables stay private |
| V11 Business logic / abuse | yes | Global ceiling plus kill switch bound spend (a hard stop, with reservation-based accounting that over-counts); per-player limits remain under it |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Non-admin invoking `/llm off` to halt the game for everyone | Elevation of privilege / DoS | Server-side `ADMIN_IDENTITIES` check before any state write; test non-admin refusal leaves state untouched |
| Client spoofing admin in the console | Spoofing | Admin decided from `ctx.sender` only (CLAUDE.md: `ctx.sender` is the authenticated principal) |
| Cost runaway (many players, retries, large outputs) | DoS (financial) | Enqueue and claim ceiling checks counting reserved plus spent; reservations use `max_tokens`, which this phase lowers per route (more headroom, not less safety) |
| Prompt injection carried forward through stage-1 text into stage 2 | Tampering | Stage-1 model output is stored world data: `sanitizeWorldData` (escape `<`/`>`) in the stage-2 volatile builder; player text still only inside `<player_input>` |
| Stats output rendered with `v-html` | Tampering (XSS) | Output limited to route names and numbers; unit test that no `<`, `>` or `[` appears |
| Key exposure by the sweep harness | Information disclosure | Key read in-process via `loadAnthropicKey`, every printed string through `scrub`, record stores counts and rule ids only, local run only |
| Kill switch row deleted or missing | DoS / bypass | Fail closed on a missing row (edge coverage), tested |

## Sources

### Primary (HIGH confidence)
- Codebase (read directly): `spacetimedb/src/data/llm_routes.ts`, `llm_limits.ts`, `llm_models.ts`, `llm_schemas.ts`, `llm_layers.ts`, `llm_indicator_lines.ts` (+ tests), `keeper_bible.ts`, `admin.ts`, `npc_gender.ts`; `helpers/claude_request.ts`, `llm_queue.ts`, `llm_budget.ts`, `llm_executor.ts`, `llm_sweeper.ts`, `llm_apply.ts`, `llm_admin_state.ts`, `llm_inputs.ts`, `llm_status.ts`, `world_gen.ts`, `creation_generation.ts`, `travel.ts`, `measurement.ts`; `reducers/llm.ts`, `commands.ts`, `intent.ts`, `creation.ts`; `views/llm.ts`; `schema/tables.ts`; client `src/composables/useLlmStatus.ts`, `useWorldGeneration.ts`, `useCharacterCreation.ts`, `src/App.vue`, `src/components/NarrativeMessage.vue`; `scripts/llm/*`.
- Scratch SpacetimeDB 2.10.1 probe (this session): defaulted columns, new tables, new indexes and view changes migrate without clearing; an optional column without a default is refused; the scratch server was stopped and the user's server on port 3000 was untouched.
- Phase artifacts: 39-SPIKE-RECORD.md (measured latency and token baselines, cache read), 41-LOCAL-PROOF.md (live proof never run), 42-VERIFICATION.md, 42-RESEARCH.md (probe method), 43-CONTEXT.md, 43-EDGE-COVERAGE.md.
- Anthropic docs fetched 2026-09-30: https://platform.claude.com/docs/en/build-with-claude/prompt-caching (512-token minimum for Sonnet 5.5, price multipliers, prefix order, invalidation table, 20-block lookback, cache entry availability after first response begins); https://platform.claude.com/docs/en/build-with-claude/structured-outputs (supported schema subset, 24 optional / 16 union limits, 180 s compile timeout, 24 h grammar cache, `output_config.format` change invalidates prompt cache, `max_tokens` truncation breaks schema compliance); https://platform.claude.com/docs/en/build-with-claude/effort (Sonnet 5.5 levels, default `high`, recalibrated, thinking counts toward `max_tokens`, `between_tools`).
- claude-api skill reference (cached model/price table, effort and caching quick references), consistent with the docs above.

### Secondary (MEDIUM confidence)
- None used.

### Tertiary (LOW confidence)
- Output-token estimates for routes other than skill and region (flagged `[ASSUMED]` in the Assumptions Log).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, no new packages; versions and prices verified.
- Architecture: HIGH for seams and migration facts (code read, probe run); MEDIUM for the stage-1 token/timing estimates until the sweep runs.
- Pitfalls: HIGH (each traced to a line of code, a doc statement, or a probe result).
- Cost estimate: MEDIUM (range given; guarded at runtime by a $5 harness cap).

**Research date:** 2026-09-30
**Valid until:** 30 days, or until the `spacetime` CLI/SDK or the Sonnet 5.5 pricing/effort calibration changes (re-check the price constant and re-run the scratch migration probe before the user's maincloud publish).
