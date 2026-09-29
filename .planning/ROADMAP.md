# Roadmap: UWR

## Milestones

- ✅ **v1.0 MVP** -- Phases 1-23 (shipped 2026-02-25)
- ✅ **v2.0 The Living World** -- Phases 24-30 (shipped 2026-03-09)
- ✅ **v2.1 Project Cleanup** -- Phases 31, 32, 38 (shipped 2026-09-29; 33-37 parked in Backlog)
- 🚧 **v2.2 LLM — Claude Engine** -- Phases 39-44 (in progress; roadmap created 2026-09-29)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-23) -- SHIPPED 2026-02-25</summary>

See `.planning/milestones/v1.0-ROADMAP.md` for full details (if archived).

- Phases 1-23: Character creation, combat, inventory, crafting, quests, NPCs, world events, renown, travel, death/corpse, config tables, auth, subscription optimization

</details>

<details>
<summary>✅ v2.0 The Living World (Phases 24-30) -- SHIPPED 2026-03-09</summary>

- [x] Phase 24: LLM Pipeline Foundation (3/3 plans) -- completed 2026-03-07
- [x] Phase 25: Narrative UI Shell (3/3 plans) -- completed 2026-03-07
- [x] Phase 26: Narrative Character Creation (3/3 plans) -- completed 2026-03-07
- [x] Phase 27: Procedural World Generation (3/3 plans) -- completed 2026-03-07
- [x] Phase 28: Dynamic Skill Generation (3/3 plans) -- completed 2026-03-07
- [x] Phase 29: NPC & Quest Generation (3/3 plans) -- completed 2026-03-07
- [x] Phase 30: Narrative Combat (4/4 plans) -- completed 2026-03-09

See `.planning/milestones/v2.0-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v2.1 Project Cleanup (Phases 31, 32, 38) -- SHIPPED 2026-09-29</summary>

- [x] Phase 31: Test Infrastructure (3/3 plans) -- completed 2026-03-09
- [x] Phase 32: Dead Code Removal (3/3 plans) -- completed 2026-03-09
- [x] Phase 38: Platform Upgrade (8/8 plans) -- completed 2026-09-29

Phases 33-37 parked in the Backlog as 999.1-999.5. See `.planning/milestones/v2.1-ROADMAP.md` for full details.

</details>

### 🚧 v2.2 LLM — Claude Engine (Phases 39-44)

**Overview:** Replace OpenAI with Claude Sonnet 5.5 (`claude-sonnet-5-5`) as the engine behind every narrative generation call, moving from today's browser-side proxy to a server-owned pipeline with the lowest latency practical for real-time storytelling. The milestone opens with a go/no-go spike that decides the executor (a scheduled SpacetimeDB procedure calling Claude directly, or a backend service authenticated via Workload Identity Federation). It then builds the Claude request layer and job seam that are identical under either outcome, cuts every LLM-driven domain over to the chosen executor, removes the old browser pipeline, tunes latency and spend from real measurements, and closes with live end-to-end verification and owner-approved tone.

**Phase Numbering:** Continues from Phase 38, the highest number ever used. Numbers 33-37 are consumed by the parked Backlog phases 999.1-999.5, which stay untouched below.

**Milestone-wide rules:**

- Every phase ships unit tests (QUAL-04, and the standing project rule). Test seams for LLM code paths (mock procedure context with fake `ctx.http` and `withTx`) are built in Phase 40 and reused afterward.
- Local publishes only (`spacetime publish uwr -p spacetimedb`). Maincloud publishes and the maincloud legs of SPIKE-04 and QUAL-02 are manual user actions, never automatic.
- Do not use `--clear-database` unless a schema change truly requires it. It wipes the private `llm_config` row that holds the Anthropic key.

**Execution Order:** 39 → 40 → 41 → 42 → 43 → 44

- [ ] **Phase 39: Procedure-to-Claude Spike** - Go/no-go gate: measure whether SpacetimeDB 2.10 procedures can call Claude reliably and pick the executor
- [ ] **Phase 40: Claude Request Layer and Job Seam** - One model constant, one route table, a pure tested request builder/parser, layered prompts, and the private job tables, queue and offline test seam
- [ ] **Phase 41: Executor and Domain Cutover** - Run every LLM-driven action server-side end to end against real Claude, with graceful failure handling, usage tracking and admin smoke test
- [ ] **Phase 42: Client Cutover and Legacy Removal** - Move the client to the job-status view and delete the proxy, the client-trusted result reducer, the old tables and every browser credential
- [ ] **Phase 43: Latency Tuning, Staged Generation and Budget** - Tune each route from measured data, verify caching, stage world and class reveals with Keeper progress lines, and add the global spend ceiling and kill switch
- [ ] **Phase 44: Live Verification and Tone Eval** - Prove every domain with a real Claude call, drill every failure class, and get owner sign-off on tone

## Phase Details

### Phase 39: Procedure-to-Claude Spike

**Goal**: The operator knows, from measured evidence on local SpacetimeDB, whether SpacetimeDB 2.10 procedures can call Claude reliably without hurting combat ticks and reducers, and which executor the rest of the milestone will build
**Depends on**: Nothing (first phase of v2.2; follows Phase 38)
**Requirements**: SPIKE-01, SPIKE-02, SPIKE-03, SPIKE-04
**Success Criteria** (what must be TRUE):

  1. Operator can run a throwaway procedure on local SpacetimeDB 2.10 that reaches a public URL, then `GET /v1/models`, then a small `claude-sonnet-5-5` call, and each step's result plus the server logs (including the cause if the 2.0.1-style failure still reproduces) are written to the spike record
  2. The spike record shows structured-output calls using the real skill and region schemas measured at effort `low` and `medium` (latency, success, whether the region schema compiles, whether a thinking-off variant composes with structured output), and the observed failure shape of a forced timeout and of a bad key, including whether response headers such as `retry-after` and `request-id` are visible to the procedure
  3. The spike record shows scheduled-dispatch latency (p50/p95), whether `ctx.sender` is usable inside a scheduled procedure, and reducer and combat-tick latency with 6-8 concurrent in-flight calls compared against a no-call baseline
  4. A written go/no-go decision record names the executor by applying the gate on local SpacetimeDB:
     - every non-drill call succeeds
     - dispatch p95 is under about 250 ms
     - reducer/tick p95 stays under 2x baseline
     Maincloud is not part of this gate. Per the user's decision on 2026-09-29, it is proven in Phase 41.
**Gate outcome**: go selects the scheduled-procedure executor for Phase 41 (and retires `llm-proxy/` in Phase 42); no-go selects the backend-service-with-WIF executor for Phase 41. Nothing in Phases 40, 42, 43 or 44 changes shape either way.
**Also captured while the harness is up** (feeds later phases, not gate inputs): cache read on a repeated prefix, whether an in-flight call survives a publish, and current-path baseline latency. The Anthropic key used is supplied by the operator, never committed and never logged.
**Testing**: Reusable measurement helpers (percentile math, gate evaluation) are unit tested. The throwaway procedure stays isolated from the production module and is not shipped.
**Plans**: 10 plans

Plans:
**Wave 1**

- [ ] 39-01-PLAN.md — Kept measurement helpers: percentile, gate evaluator, failure classes, spend math, secret guards, results model (TDD)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 39-02-PLAN.md — Throwaway spike module: tables, request builders, scheduled/direct procedures, tick probe, temporary registration
- [ ] 39-03-PLAN.md — Harness guards (CLI, key runner, leak scanner, results store) and current-path Worker hop baseline

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 39-04-PLAN.md — Publish to local uwr-spike, generate bindings, harness core, no-spend smoke, canary-key leak scan

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 39-05-PLAN.md — No-spend measurements: rung 1, dispatch latency, ctx.sender, push legs, failure drills, idle baseline

**Wave 5** *(blocked on Wave 4 completion)*

- [ ] 39-06-PLAN.md — [checkpoint] User adds the Anthropic key; paid ladder rungs 2-3 (/v1/models, 30 Sonnet calls)

**Wave 6** *(blocked on Wave 5 completion)*

- [ ] 39-07-PLAN.md — Structured outputs (skill/region x low/medium), thinking-off, cache, #4954, publish survival

**Wave 7** *(blocked on Wave 6 completion)*

- [ ] 39-08-PLAN.md — Concurrency load at 8 in flight with step-down, baseline2 control, memory

**Wave 8** *(blocked on Wave 7 completion)*

- [ ] 39-09-PLAN.md — [checkpoint] Verdict, spike record, user confirmation, decision log in PROJECT.md and STATE.md

**Wave 9** *(blocked on Wave 8 completion)*

- [ ] 39-10-PLAN.md — Cleanup: drop local uwr-spike, delete spike module and harness, restore registration files to the start SHA

### Phase 40: Claude Request Layer and Job Seam

**Goal**: Every Claude call in the codebase is built, parsed, queued and applied through one tested, executor-agnostic layer with private job storage, so the executor phase only has to plug in a way to send the request
**Depends on**: Phase 39 (spike findings on schema compilation, `thinking` composition with structured output, and header visibility shape the builder)
**Requirements**: CLAUDE-01, CLAUDE-02, CLAUDE-03, CLAUDE-04, PIPE-03, PIPE-08, SEC-01, QUAL-04
**Success Criteria** (what must be TRUE):

  1. Every LLM route takes its model from one constants module (`claude-sonnet-5-5`) and its effort, `max_tokens`, timeout and schema from one route table, and the pure request builder produces valid Sonnet 5.5 bodies for every route (explicit effort, required `max_tokens`, none of the forbidden parameters), while the response parser reads the first `text` block and treats `max_tokens` and `refusal` stop reasons as failures. Tests fail if any other model ID, an unset effort or a forbidden parameter appears
  2. Every JSON route uses `output_config.format` with a schema that passes the subset linter (including the region schema), and the existing v2.0 validators still reject out-of-range values and over-budget abilities on model output
  3. Prompts are layered into a stable cacheable prefix (Keeper Bible plus route block) followed by a volatile tail, and player-written text appears only inside delimiter tags, including for injection-style input
  4. The new job, prompt, config and call-log tables are private (a test asserts none is `public: true`), a player's job-status view returns only their own jobs with no prompt or output text, and enqueuing the same action twice for one identity (as two tabs would) yields exactly one job
  5. A renown rank-up enqueues a valid job instead of hitting the swallowed insert error in `helpers/renown.ts` (a regression test fails on the old shape), and LLM code paths run offline in tests through a mock procedure context with fake `ctx.http` and a `withTx` that rejects promises and can be re-invoked

**Testing**: This phase is mostly tests. Body snapshots for every route, schema linter cases, parser cases for each stop reason, prompt-layering and delimiter tests, privacy and dedupe tests, the renown regression test and the mock procedure context utilities.
**Plans**: TBD

### Phase 41: Executor and Domain Cutover

**Goal**: Every LLM-driven action (creation, world gen, skills, NPC chat, combat narration, renown) runs server-side end to end against real Claude on the executor Phase 39 chose, results are applied by SpacetimeDB and survive tab close, and failures degrade gracefully, with the browser out of the LLM path
**Depends on**: Phase 40 (and the Phase 39 decision record)
**Requirements**: PIPE-01, PIPE-02, PIPE-04, PIPE-05, PIPE-06, PIPE-07, PIPE-09, SEC-04, COST-01, COST-02, OPS-01
**Success Criteria** (what must be TRUE):

  1. Admin can set the Anthropic key, fire a live smoke-test call and see key status (set / valid) plus a real Claude reply, and the smoke test warms schemas
  2. Each of the six actions is queued by its own reducer inside the same transaction and executed by the chosen executor, and the browser network tab shows no call to Anthropic or to any proxy while the player plays, creates a character, explores, chats with an NPC, fights and levels up
  3. A player who refreshes or closes the tab mid-generation finds the result applied on return, and never sees duplicates
  4. Transient failures (429 with `retry-after`, 529, 5xx, timeout) retry by rescheduling a bounded number of times, non-retryable failures (auth, spend cap, refusal, 400) fail fast, and creation and world gen never auto-retry without player action. A failed or stuck job is swept, its generation lock released, its reserved budget refunded, and the player sees an in-voice Keeper message
  5. With calls in flight, combat ticks and reducers stay responsive under the global in-flight cap, and combat narration never blocks combat and is dropped if it arrives late
  6. Maincloud proof, deferred from the Phase 39 spike: after the user manually publishes to maincloud, a live smoke-test call and one real action per domain succeed there. The Phase 39 gate thresholds are re-checked on maincloud; a failure there reopens the executor decision.
  7. Each call's four usage counts (input, output, cache-write, cache-read tokens) are recorded per route, the per-player daily budget is cost-weighted with a call-count backstop, reserved at enqueue and settled on result, and the Anthropic key exists only in private `llm_config`, never in logs (redaction test), with a key-setup and `--clear-database` recovery runbook written

**Executor branches** (success criteria hold for either):

  - **Go (scheduled procedure)**: the reducer inserts an `llm_job` row and a schedule row in its own transaction. Scheduled procedure `llm_run` claims the job, calls `https://api.anthropic.com/v1/messages` via `ctx.http.fetch` outside any transaction, persists the paid response and usage in a second transaction, then applies it in a third, so an apply failure re-runs from stored text with no second billed call. Retry reschedules with backoff, the key comes from private `llm_config` via admin `set_api_key`, and the in-flight cap (start 4 to 6) is set from Phase 39 data
  - **No-go (backend service)**: `llm-service/` hosted on Cloud Run, authenticated to Anthropic via Workload Identity Federation, claims and completes jobs through service-only views and reducers under an allowlisted service identity. Job tables stay in SpacetimeDB and the service reuses Phase 40's request builder. Planned in detail only if Phase 39 records no-go. SEC-04 then reads as "no static Anthropic key in the module, and the service-identity secret is covered by the runbook"

**Domain cutover order**: NPC chat, combat narration, skills plus renown, creation, world gen. Reducers enqueue in-transaction (no client `prepare_*` calls), and client call sites are adjusted as each domain moves so no domain is left half-wired. Old `llm_task` rows are purged at the end (code-only publish, first of the two publishes for SEC-05; table removal happens in Phase 42).
**Interim cost guard**: until COST-03 lands in Phase 43, live spend is bounded by the per-player daily budget plus a spend limit on the dedicated Anthropic Console workspace named in the runbook.
**Testing**: Unit tests for enqueue-in-transaction per domain, claim/persist/apply transitions and re-run from stored text, each error class and its retry or fail-fast path, sweeper refund and lock release, in-flight cap, late combat narration drop, reserve/settle math from all four usage fields, key redaction and admin-only gating, all through the Phase 40 mock procedure context.
**Plans**: TBD

### Phase 42: Client Cutover and Legacy Removal

**Goal**: The browser holds no LLM credential and no LLM plumbing, the client reads only its own job status, and the old pipeline, its tables and its client-trusted result reducer are gone
**Depends on**: Phase 41 (every domain must already run on the executor before deletion)
**Requirements**: SEC-02, SEC-03, SEC-05
**Success Criteria** (what must be TRUE):

  1. No client can submit or forge LLM results: `submit_llm_result` no longer exists in the regenerated bindings, and no reducer accepts client-supplied LLM output
  2. No LLM credential exists in the browser: `llm-proxy/`, `useLlmProxy` and the proxy env vars are removed, a returning player's stored `llm_proxy_secret` is cleared on first load, and grepping the built `dist/` bundle finds no proxy secret, proxy URL or key name
  3. The narrative console still shows in-progress and failure states for every LLM-driven action, now driven only by the player's own job-status view through a new `useLlmStatus` composable, with no subscription to the old `llm_task` or `llm_request` tables left
  4. The old `llm_task` and `llm_request` tables and the dead v2.0 pipeline code are removed with a two-publish removal and no `--clear-database`, the game runs normally afterward, and the local Anthropic key is still set. If SpacetimeDB refuses the removal without clearing the database, work stops and the decision goes to the user (manual action that wipes the key; the Phase 41 runbook covers recovery)

**Housekeeping**: README and the run-local skill stop referencing `llm-proxy`. Publishes are local only.
**Testing**: Unit tests for the `useLlmStatus` state mapping, the one-time `localStorage` cleanup, and the absence of forbidden reducers and tables. The full existing suite and `pnpm build` stay green after the deletions.
**Plans**: TBD
**UI hint**: yes

### Phase 43: Latency Tuning, Staged Generation and Budget

**Goal**: Generation feels fast and stays affordable: every route is tuned from measured data, caching is proven, the player enters new regions and sees new classes before full generation finishes, and total spend has a hard ceiling with a kill switch
**Depends on**: Phase 41 (live executor produces the latency and usage data), Phase 42 (staged reveals and progress lines render through the client job-status view)
**Requirements**: LAT-01, LAT-02, LAT-03, LAT-04, LAT-05, LAT-06, COST-03, OPS-02
**Success Criteria** (what must be TRUE):

  1. Admin can run `/llm stats` and see calls, cost, p50/p95 latency and errors broken down by route
  2. Each route's effort and `max_tokens` are set from an effort sweep and the measured p99 output size (values traceable to recorded measurements), and prompt caching is verified on every route's stable prefix with `cache_read_input_tokens > 0` on a repeated call
  3. A player who triggers a new region enters it, with its start location and first NPC, before the rest of the region finishes generating, and sees in-voice Keeper progress lines while generation runs
  4. A player creating a character sees class identity and first ability before the full class finishes, with Keeper progress lines while it runs. If the measured class reveal is still over about 10 s after staging, classes for both archetypes generate in parallel once the race is interpreted; if not, the measurement is recorded and parallel generation is left out
  5. Admin can flip a kill switch that halts all LLM calls with an in-voice player message, and a global daily spend ceiling halts calls automatically when reached

**Testing**: Unit tests for the stats aggregation, staged apply (stage 1 visible before stage 2 completes, and stage 2 failure leaves a playable stage 1), progress-line emission, the parallel-class path if built, ceiling and kill-switch enforcement at enqueue, and cost math against recalibrated prices.
**Plans**: TBD
**UI hint**: yes

### Phase 44: Live Verification and Tone Eval

**Goal**: Every domain is proven working with real Claude, every failure class shows the right player-facing behavior, and the owner has signed off on the Keeper's tone
**Depends on**: Phase 43 (tuned routes, kill switch and `/llm stats` are in place)
**Requirements**: QUAL-01, QUAL-02, QUAL-03
**Success Criteria** (what must be TRUE):

  1. A golden set of about 25 prompts (5 adversarial) runs with mechanical assertions (valid schema, ranges and budgets respected, injection did not break the Keeper's voice, refusals handled in-voice), and the owner reviews live outputs and approves the tone. Live runs happen only with operator approval
  2. Every domain (creation, world gen, skills, NPC chat, combat narration, renown) is verified end to end locally with a real Claude call, per-route latency percentiles are recorded, and recorded token totals reconcile with the Anthropic Console. The maincloud run is a manual user action, recorded as a user-supplied result
  3. Failure drills for truncation, refusal, 401, 429, 529, spend cap and timeout each produce the correct player-facing behavior (in-voice message, lock released, budget refunded, no unwanted auto-retry)

**Also recorded**: the streaming decision (Out of Scope stands unless measured NPC-chat latency or a no-go backend build reopens it) is written into PROJECT.md.
**Testing**: The golden-set harness runs offline against recorded or mocked responses in the normal suite. Failure drills are automated unit tests over the mock procedure context, with the live drills as operator-run confirmation.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 39 → 40 → 41 → 42 → 43 → 44

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-23 | v1.0 | All | Complete | 2026-02-25 |
| 24-30 | v2.0 | 22/22 | Complete | 2026-03-09 |
| 31, 32, 38 | v2.1 | 14/14 | Complete | 2026-09-29 |
| 39. Procedure-to-Claude Spike | v2.2 | 0/TBD | Not started | - |
| 40. Claude Request Layer and Job Seam | v2.2 | 0/TBD | Not started | - |
| 41. Executor and Domain Cutover | v2.2 | 0/TBD | Not started | - |
| 42. Client Cutover and Legacy Removal | v2.2 | 0/TBD | Not started | - |
| 43. Latency Tuning, Staged Generation and Budget | v2.2 | 0/TBD | Not started | - |
| 44. Live Verification and Tone Eval | v2.2 | 0/TBD | Not started | - |

## Backlog

### Phase 999.1: Combat Improvements (BACKLOG)

**Parked:** 2026-09-29 from v2.1 Phase 33 — on hold while core project concepts are re-imagined. Artifacts kept in `.planning/phases/999.1-*/` (files retain their original `33-` prefixes).
**State when parked:** all 5 plans' code landed; 33-03 (enemy HUD effect tags, commit 4dacfd1b) has no SUMMARY; 33-VERIFICATION.md is `human_needed` and predates gap plans 33-04/33-05 — needs 33-03 reconcile + re-verification

**Goal**: Players see complete, informative combat feedback and encounter balanced difficulty
**Originally depended on**: Phase 31 (combat tests enable safe rebalancing), Phase 32 (clean codebase) (backlog items are unsequenced)
**Requirements**: COMB-01, COMB-02, COMB-03, COMB-04, COMB-05, COMB-06, COMB-07
**Success Criteria** (what must be TRUE):

  1. Player sees per-tick damage/healing entries in the combat log with effect name and amount for every DoT and HoT
  2. Player sees buff/debuff application and expiration entries in the combat log with stat, magnitude, and duration
  3. Enemy HUD shows active DoT, HoT, and debuff icons with remaining duration countdown
  4. Player can engage multiple enemy groups simultaneously without combat state corruption
  5. Damage and healing constants are tuned and validated by passing test assertions

**Plans**: 5 plans

Plans:

- [ ] 33-01-PLAN.md -- Combat log narrative messages, buff/debuff lifecycle events, balance tuning
- [ ] 33-02-PLAN.md -- Multi-enemy pull fixes, remove puller role restriction
- [ ] 33-03-PLAN.md -- Enemy HUD effect indicators with color coding and duration countdown
- [ ] 33-04-PLAN.md -- Gap closure: fix CREATION_ABILITY_SCHEMA field mismatch (effect -> kind)
- [ ] 33-05-PLAN.md -- Gap closure: enable mid-combat pull via narrative enemy clicks

Promote with /gsd-review-backlog when ready.

### Phase 999.2: Narrative UI Integration (BACKLOG)

**Parked:** 2026-09-29 from v2.1 Phase 34 — on hold while core project concepts are re-imagined. Artifacts kept in `.planning/phases/999.2-*/` (files retain their original `34-` prefixes).
**State when parked:** 34-01 and 34-02 summarized; 34-03 code landed (commits 0e809ea4, dcbaad24, e041231a, d29430ba, eb05ef49) without a SUMMARY; no CONTEXT.md; 34-UAT.md never run — needs 34-03 reconcile + verification

**Goal**: Players can sell items, manage multiple named hotbars, and use abilities outside combat entirely through the narrative console with styled event feedback
**Originally depended on**: Phase 32 (dead code removed, shared helpers exist) (backlog items are unsequenced)
**Requirements**: NARR-01, NARR-02, NARR-03, NARR-04, NARR-05
**Success Criteria** (what must be TRUE):

  1. Player can type `sell <item>` and the item is sold with correct gold calculation including perk bonuses
  2. Player can type `sell all junk` or `sell 3 <item>` for bulk sales with a summary of what was sold
  3. Hotbar is visible at all times (not just combat) showing ability slots with cooldown timers
  4. Player can create multiple named hotbars, switch between them with arrows, and manage slots via commands
  5. Event feed entries are color-coded by kind (combat=red, reward=gold, system=gray, social=blue)

**Plans**: 3 plans

Plans:

- [ ] 34-01-PLAN.md -- Fix sell perk bonus, add sell all junk and sell N commands, complete event colors
- [ ] 34-02-PLAN.md -- Hotbar schema (Hotbar parent table), server reducers, intent commands
- [ ] 34-03-PLAN.md -- Persistent hotbar UI, multi-hotbar navigation, remove bottom action bar

Promote with /gsd-review-backlog when ready.

### Phase 999.3: Dynamic Equipment Generation (BACKLOG)

**Parked:** 2026-09-29 from v2.1 Phase 35 — on hold while core project concepts are re-imagined. Artifacts kept in `.planning/phases/999.3-*/` (files retain their original `35-` prefixes).
**State when parked:** not started (no context, research or plans)

**Goal**: Equipment drops are unique, level-appropriate, and dynamically generated -- no more selecting from a static pool
**Originally depended on**: Phase 32 (mechanical vocabulary extracted), Phase 33 (combat math stabilized) (backlog items are unsequenced)
**Requirements**: EQUIP-01, EQUIP-02, EQUIP-03, EQUIP-04, EQUIP-05
**Success Criteria** (what must be TRUE):

  1. Defeating an enemy drops equipment with stats scaled to enemy level and world tier
  2. Generated equipment stats (AC, damage, bonuses) are computed from formulas, not looked up from hardcoded tables
  3. Quest reward equipment is dynamically generated matching the quest difficulty tier
  4. The static WORLD_DROP_GEAR_DEFS constant is gone, replaced by a generation function
  5. Generated equipment names use the existing prefix/suffix affix system

**Plans**: TBD

Plans:

- [ ] 35-01: TBD
- [ ] 35-02: TBD

Promote with /gsd-review-backlog when ready.

### Phase 999.4: Ability Expansion (BACKLOG)

**Parked:** 2026-09-29 from v2.1 Phase 36 — on hold while core project concepts are re-imagined. Artifacts kept in `.planning/phases/999.4-*/` (files retain their original `36-` prefixes).
**State when parked:** all 5 plans executed and summarized; never verified (stopped at the 36-05 human-verify checkpoint); renown-perk flow depends on working LLM calls

**Goal**: The ability system covers all game systems with diverse ability types, pure buffs/debuffs, functional race abilities, per-level heritage bonuses, and renown perks unified into the dynamic ability system
**Originally depended on**: Phase 32 (mechanical vocabulary complete), Phase 33 (combat dispatch stable) (backlog items are unsequenced)
**Requirements**: ABIL-01, ABIL-02, ABIL-03, ABIL-04, ABIL-05, ABIL-06, ABIL-07, ABIL-08, ABIL-09, ABIL-10, ABIL-11
**Success Criteria** (what must be TRUE):

  1. mechanical_vocabulary.ts includes ability kinds for combat, crafting, gathering, travel, social, songs, auras, pets, fear, and summoning
  2. Server dispatch handles all new ability kinds without hardcoded special cases
  3. Pure buff abilities (stat boosts, haste) and pure debuff abilities (slow, fear) work without damage components and are castable outside combat
  4. Race abilities are functional in-game (minor passive/active effects, not just narrative text)
  5. Heritage bonuses apply every level and are shown during character creation and level-up
  6. Renown perks use the dynamic ability system with LLM-driven selection at rank-up
  7. Abilities track source (Class, Renown, Race) for display and filtering
  8. Client ability dispatch renders and activates all new ability kinds without hardcoded special cases

**Plans**: 5 plans

Plans:

- [ ] 36-01-PLAN.md -- Vocabulary expansion (new ABILITY_KINDS), schema (source/abilityKey columns), BASE_BUDGET entries
- [ ] 36-02-PLAN.md -- Heritage bonus every-level fix, race ability data definitions
- [ ] 36-03-PLAN.md -- Server dispatch for all new kinds, pure buff/debuff fix, LLM skill gen expansion, race ability granting
- [ ] 36-04-PLAN.md -- Renown perks as dynamic abilities, PendingRenownPerk table, LLM perk generation flow
- [ ] 36-05-PLAN.md -- Client-side renown perk choice UI (header notification, perk selection in console)

Promote with /gsd-review-backlog when ready.

### Phase 999.5: UX Polish (BACKLOG)

**Parked:** 2026-09-29 from v2.1 Phase 37 — on hold while core project concepts are re-imagined. Artifacts kept in `.planning/phases/999.5-*/` (files retain their original `37-` prefixes).
**State when parked:** not started (no context, research or plans)

**Goal**: Players can customize text size for comfortable reading across all UI elements
**Originally depended on**: Nothing (independent of other phases) (backlog items are unsequenced)
**Requirements**: UX-01, UX-02, UX-03, COMB-08
**Success Criteria** (what must be TRUE):

  1. Player can increase and decrease the global font size of the entire application
  2. Font size preference persists across browser sessions via localStorage
  3. Group info panel text is sized for readability at all font scale settings

**Plans**: TBD

Plans:

- [ ] 37-01: TBD

Promote with /gsd-review-backlog when ready.

---
*Last updated: 2026-09-29 after v2.2 roadmap creation (Backlog 999.1-999.5 preserved)*
