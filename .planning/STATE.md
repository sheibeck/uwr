---
gsd_state_version: 1.0
milestone: v2.2
milestone_name: LLM — Claude Engine
current_phase: 43
current_phase_name: Latency Tuning, Staged Generation and Budget
status: verifying
stopped_at: Completed 43-15-PLAN.md
last_updated: "2026-10-01T09:04:14.887Z"
last_activity: 2026-09-30
last_activity_desc: Phase 43 execution started
progress:
  total_phases: 6
  completed_phases: 3
  total_plans: 63
  completed_plans: 61
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-30)

**Core value:** A world that writes itself around its players -- every character is unique, every region is discovered, and the narrative responds to what players actually do.
**Current focus:** Phase 43 — Latency Tuning, Staged Generation and Budget

## Current Position

Phase: 43 (Latency Tuning, Staged Generation and Budget) — EXECUTING
Plan: 15 of 15
Status: Phase complete — ready for verification
Last activity: 2026-09-30 — Phase 43 execution started

Progress: [██████████] 97% (2/6 phases)

## Previous Milestones

- v1.0 RPG Milestone -- Phases 1-23 (shipped 2026-02-25)
- v2.0 The Living World -- Phases 24-30 (shipped 2026-03-09)
- v2.1 Project Cleanup -- Phases 31, 32, 38 (shipped 2026-09-29; 33-37 parked in Backlog 999.1-999.5)

See MILESTONES.md for full delivery summaries.

## Accumulated Context

### Decisions

(Archived with v2.1 milestone. See .planning/milestones/v2.1-ROADMAP.md for the full decision log. Key decisions are in PROJECT.md.)

- [Phase ?]: Phase 39-01: measurement gate is strict (dispatch p95 < 250 ms, load p95 < 2.0x baseline); thin data returns incomplete; go_with_cap cap = max(2, highest passing level)
- [Phase ?]: Phase 39-02: spike spend cap is a code constant (2.4M micro-USD); spike_reset preserves spend counters; missing spike_state fails closed
- [Phase ?]: [39-03] Spike key read via util.parseEnv (not process.env); readLogs slices whole log; only probeUwrClean may read uwr, via a fixed argument list
- [Phase ?]: Phase 39-04: runConcurrent async wrapper plus startConcurrent live handle; canary key remains in llm_config row 1 until real key stored in Plan 06
- [Phase ?]: 39-05: ctx.sender in a scheduled procedure is the module identity (no connection id); requesting player must be carried in the job row
- [Phase ?]: 39-05: ctx.http.fetch throws on timeout (platform) but returns 401 on a bad key; request-id visible, retry-after not observed
- [Phase ?]: 39-06: paid ladder rungs 2 and 3 all ok on attempt 1 (10/10 models, 30/30 Sonnet 5.5); est spend 2280 micro-USD; no re-run needed
- [Phase ?]: 39-07: region JSON Schema compiles (no staged workaround needed); thinking-off composes with output_config.format; client-called procedure does not block its own connection; publish waits for the in-flight call
- [Phase ?]: 39-08: server-side procedure concurrency is capped at 4 (in-flight never above 4 with 8 enqueued); level 8 has no ticks at in-flight >= 6
- [Phase ?]: 39-11: gate results profile and SPIKE_TARGET maincloud opt-in; maincloud (cap 8, all levels pass, spend 1.147M micro-USD) measured on uwr-spike-925iv; real key replaced by placeholder
- [Phase 39]: Phase 39: LLM executor = scheduled procedure (in-flight cap at most 8). Maincloud uwr-spike-925iv strict gate verdict go (floor-adjusted identical): dispatch p95 3.0 ms, 0/164 reliability failures, region schema compiles, ping and tick p95 at 0.96x-1.03x of baseline at 8/4/2 in flight, observed cap 8 (local 4). Local results provisional (strict incomplete). Jobs must carry the player identity (ctx.sender is the module identity). Confirmed by user 2026-09-29 ("confirm-strict"); llm-proxy retired in Phase 42; Phase 41 proves the real executor on maincloud
- [Phase 39]: [39-10] Maincloud DB uwr-spike-925iv kept briefly by the user, then deleted by the user on 2026-09-29 (describe returns 404)
- [Phase ?]: 40-01: schema_recorder loads real index.ts under a recording spacetimedb/server mock with no production edit; createMockProcCtx has no ctx.db and a module-identity sender
- [Phase ?]: 40-03: Keeper Bible 7,421 chars (~2,283 tokens); player text capped 1000 code points, truncated not rejected, all <,> escaped; combat_narration route is plain prose; NPC reply shape copied into llm_layers.ts
- [Phase ?]: [40-04] llm_job and llm_call_log are private; public llm_* set is exactly llm_task until Phase 42; enqueueLlmJob dedupes on JSON-array key with active statuses blocking
- [Phase ?]: 40-05: submit_llm_result pinned by 120 characterization cases and 116 snapshots; Plan 40-08 must pass them unmodified
- [Phase ?]: 40-05: rank-2 renown static fallback throws on bigint JSON.stringify (pinned as a throw, unfixed); creation race/class clamping gap pinned for Phase 41
- [Phase ?]: [40-06] RETRYABLE_CLASSES is a frozen array (rate_limit, overloaded, server, timeout, network); spend-cap 429 recognised by error_code alone; retryAfterSeconds only for retryable classes from a numeric header
- [Phase ?]: 40-07: perkEffectJson bigint values serialized as plain JSON numbers (safe range) so stored JSON matches the perk prompt shape; index.ts copy of the fallback still has the bigint defect (Phase 41)
- [Phase ?]: 40-08: submit_llm_result apply logic extracted verbatim to helpers/llm_apply.ts keyed on job.playerId; renown bigint throw preserved for Phase 41
- [Phase ?]: 40-09: seam test excludes only llm_config from the leak scan and normalizes auto-increment ids when comparing re-invoked-tx end state; local publish needed no --break-clients and no clear
- [Phase ?]: [40-10] Keeper Bible tone approved by the user (verbatim 'Approved', 2026-09-30) with no edits; 7,421 chars (~2,283 tokens); full suite must be run per file on this host due to memory exhaustion
- [Phase ?]: [41-01] Retry lifetime bound pinned by test (worst retrying route 303.2 s < 10 min pending expiry); llm_dispatch/llm_sweep_tick unbound until 41-07; CLI identity is an admin (user-approved, set pinned by admin.test.ts)
- [Phase ?]: 41-02: reservations use existing chars/3 reserveCostMicroUsd helper (more conservative than chars/3.25); refusal order daily_calls, daily_cost, phase_cap; unknown billing charges ledger only
- [Phase ?]: [41-03] insertStaticRenownPerkOptions returns rows inserted and is idempotent per character+rank; Keeper line only when rows were inserted
- [Phase ?]: [41-03] Creation replies clamp-and-default (never reject); legacy ability field names no longer read; nameless race not saved as race_definition
- [Phase ?]: [41-04] Retry jitter is up to 20% of the base, added on the retry-after core; defer delay is 500 ms + [0,250); jitter is a deterministic hash of job id and a second seed
- [Phase ?]: [41-04] Route inputs are snapshotted in requestJson and revived per declared bigint path only (never by an in-band tag), so model-written NPC memory is never reinterpreted
- [Phase ?]: 41-05: cap-exempt routes are combat_narration and renown_perk_gen (never refused busy); only narration is uncounted
- [Phase ?]: 41-06: claimLlmJob exported; runLlmJob composes guard, claim, call, persist, apply; unreadable-body replies treated as unknown billing (ledger charged reservation, player nothing)
- [Phase ?]: 41-06: smoke jobs record failed entries in llm_admin_state and never call applyLlmFailure; smoke resultText stored redacted
- [Phase ?]: [41-07] llm_sweep inserts its next tick unconditionally and first (like sweep_llm_errors); sweeper never runs a success apply, re-dispatches received jobs; report counters increment after status and money are written
- [Phase ?]: 41-08: key script must match log line 'llm key set, len=<n>'; admin_llm_status row type is AdminLlmStatusRow (SDK derives AdminLlmStatus from the view name); llm_smoke_test is all-or-nothing against the phase cap
- [Phase ?]: 41-09: key script transports the key via HTTP call endpoint body (not argv); maincloud needs --target maincloud plus --confirm-maincloud; storeKey flow lives in scripts/llm/cli.mjs
- [Phase ?]: 41-10: talk_to_npc enqueues via enqueueLlmJob keyed on npc_memory.lastUpdated (per-turn dedupe); the player line is echoed only after a created job
- [Phase ?]: 41-10: local publish needed --clear-database (llm_job.next_attempt_at needs a default); bindings regenerated with no diff
- [Phase ?]: 41-11: combat narration is a victory/defeat outro only, enqueued before clearCombatArtifacts; never throws, refusal is silent
- [Phase ?]: 41-12: Skill offers go through one helper (requestSkillOffer) shared by level-up, request_skill_offer and [skills]; eligibility = level>=2, no pending skills, no generated ability at current level, dedupe on character+level; failure lines name [skills]
- [Phase ?]: 41-13: creation progress lines post only when a job was enqueued; refusal reverts the step and posts creation_error; client isCreationLlmProcessing derives from GENERATING_* step
- [Phase ?]: [Phase 41-14]: World-gen failure goes to ERROR (failWorldGen), never PENDING; only the player's explore retries, including the first region (fresh starter state for a character at location 0 whose starter state is ERROR)
- [Phase ?]: [Phase 41-14]: startWorldGeneration returns reused|enqueued|duplicate|refused; the ripple line posts only on enqueued or duplicate; a refusal sets ERROR with a fixed in-voice errorMessage (world_gen_state is public)
- [Phase ?]: 41-15: live-proof harness connects with withDatabaseName('uwr') (SDK 2.10 has no withModuleName); paid mode = PROVE_LIVE_DRY unset, re-runnable; A1 settled (CLI token is an admin, admin_llm_status rows: 1)
- [Phase 41]: 41-16/41-17: live proof and maincloud proof deferred by user (2026-09-30, human_needed, not passed); key stored locally (len 108); 41-MAINCLOUD-CHECKLIST.md written for the user to run
- [Phase ?]: [41-18] NPC gender: male/female clamp (model value, text pronouns, FNV-1a name hash); npc.gender column default '' needed only --break-clients locally (no clear); Bible: Keeper is he, people he or she, beasts may be it, player is you; npcGender(row) is the only reader
- [Phase ?]: [42-01] Apply-layer characterization drives applyLlmResult/applyLlmFailure directly; llm_apply.ts writes no old call counts; llm_prompts.ts deleted and kept deleted by test
- [Phase ?]: [42-02] Indicator lines module is import-free (strings only to the browser); cleanup literal sits inside removeItem(...) for the bundle guard's one allowed span; guard output is rule id, path, offset and string/comment/code class only; calibration on pre-cutover dist: exit 1 with proxy-key-name, proxy-secret, proxy-url
- [Phase ?]: [42-03] purge_legacy_llm is admin-only, counts-only and idempotent over a fixed four-table list; sweep_llm_errors stays registered as an empty drain until the tables drop in 42-06; client-connected absence test ran the real handler
- [Phase ?]: [42-04] Only creation and world-gen state rows lock input (isLlmInputLocked); failed or expired jobs show no client error UI; removing llm-proxy/.gitignore exposed ignored leftovers, hidden via local .git/info/exclude
- [Phase ?]: [42-05] Publish 1 ran local with --break-clients only (no clear, key intact len 108); purge_legacy_llm emptied the four legacy tables (tick row removed); publish-1 commit 5968d54f; local server left running (PID 13620)
- [Phase ?]: [42-06] Publish-2 code: four legacy LLM tables, sweep_llm_errors and purge_legacy_llm deleted; public llm_* set is [] with exactly 8 private tables; absence checked at schema level (recorder, __defs, scheduledReducers, strict initScheduledTables) since the mock returns [] for unknown tables; model-literal allowlist is empty
- [Phase ?]: [42-07] Publish 2 ran local with --break-clients only (no clear, key intact len 108) and dropped llm_budget, llm_cleanup_tick, llm_request, llm_task; re-publish and second bindings regeneration are no-ops; local server stopped (PID 13620); user checklist 42-USER-CHECKLIST.md holds all Cloudflare/OpenAI/env/maincloud steps
- [Phase ?]: 43-01: global ceiling and kill switch checked in enqueueLlmJob before busy and before any write; missing llm_admin_state row fails closed; $2 phase cap constant kept until Plan 43-06
- [Phase ?]: 43-02: /llm stats aggregation is pure (imports only ./measurement); p50/p95 over ok calls only, money and latency truncate; route names stripped of [ ] < > { } for the v-html console
- [Phase ?]: 43-03: claim-time halted/ceiling end a pending job as failed (not expired) through failAtClaim so applyLlmFailure releases the domain lock; one shared resting line, public bucket unavailable
- [Phase ?]: 43-04: stage-1 schemas are the smallest reveal (no isSafe on the start location, no locationName on the first NPC); stage-2 builders tolerate older stored inputs so apply, executor and cutover suites stay green unchanged
- [Phase ?]: [43-06] Smoke test checks kill switch then today's held spend plus all smoke reservations against the ceiling (exactly at ceiling allowed); view reads a missing state row as halted with zero ceiling; $2 phase cap constant and helper deleted
- [Phase ?]: 43-07: /llm slash commands are admin-gated by ADMIN_IDENTITIES on ctx.sender with an in-voice fail() refusal; malformed /llm forms answer usage rather than falling through to the command row
- [Phase ?]: [43-08] World generation is staged: world_gen_start reveals region, safe start location and first NPC and enqueues the world_gen fill in the same apply transaction; a failed fill is FILL_ERROR with the stage-1 region playable and no automatic retry
- [Phase ?]: [43-08] writeRegionFill connects every new location to the start location by graph reachability; startWorldFill turns an unreadable stage 1 into FILL_ERROR instead of throwing; Plan 43-11 must teach the sweeper that GENERATING is held by world_gen_start and FILLING by world_gen
- [Phase ?]: [43-09] Rotation only picks a line from the winning route's pool and never changes which job wins; stage-2 steps (FILLING, FILL_ERROR, CLASS_FILLING, CLASS_FILL_ERROR) excluded from input-locking lists read from server data
- [Phase ?]: [43-10] Effort chosen by passing-sample count (ties go to low and are recorded); deriveRecordFields is the single source of derived record fields; insufficient data keeps the baseline; sweep harness dry by default with record written in finally
- [Phase ?]: [43-10] Dry run: 90 Run A + 18 Run B requests, worst-case reservation 3,998,458 micro-USD (under the 4.5M stop line); paid branches unexecuted until Plan 43-12
- [Phase ?]: [43-11] Sweeper keeps two holder sets: world_gen_start holds PENDING/GENERATING, world_gen holds FILLING; a stranded FILLING lock goes to FILL_ERROR, never ERROR; only the player's explore retries stage 2
- [Phase ?]: 43-12: paid sweep approved and run once (108 calls, $0.9221 of $5 cap); low effort chosen on all 9 routes; caching passes on all 9; LAT-06 verdict leave_out (class reveal p50 4665 ms, p95 7113 ms)
- [Phase ?]: 43-13: a class fill adding no usable ability is malformed (CLASS_FILL_ERROR); 'try again' at CLASS_FILL_ERROR retries the fill instead of going back
- [Phase ?]: [43-14] Measured tuning applied: low effort on all 9 routes, max_tokens 256-2560 derived; caching passed 9/9; LAT-06 leave_out (class reveal p50 4665 ms), parallel not built
- [Phase ?]: [43-15] Local publish used --break-clients only (view row type change, no table removed); key intact (108 before and after); kill switch/ceiling round trip at $0; pre-existing time-command getWorldState import bug deferred

### Roadmap Evolution

- 2026-09-29: Phases 33-37 parked in Backlog as 999.1-999.5 (user decision: put on hold while re-imagining core concepts). Promote with /gsd-review-backlog.

- 2026-09-29: v2.2 roadmap created: Phases 39-44 (39 Spike, 40 Claude Layer and Job Seam, 41 Executor and Domain Cutover, 42 Client Cutover and Legacy Removal, 43 Latency Tuning and Budget, 44 Live Verification and Tone Eval). Numbering continues from 38; 33-37 are consumed by parked Backlog 999.1-999.5, which stay untouched.

- Phase 38 added: Platform Upgrade (SpacetimeDB 2.0.1 -> 2.10.x, tooling, llm-proxy deps, pnpm-only). Runs next, ahead of 33-35 and 37. Research: `.planning/notes/platform-upgrade-research.md`

### Pending Todos

- `todos/pending/2026-09-29-new-milestone-llm-reliability.md` — **NEXT MILESTONE (after v2.1 is archived):** fix the LLM pipeline (OpenAI credits/provider, procedure HTTP vs llm-proxy)

- `todos/pending/2026-09-29-migrate-client-table-handles-to-camelcase.md` — optional cleanup of deprecated snake_case table aliases
- `todos/pending/2026-09-29-require-admin-for-increment-event-counter-reducer.md` — **security:** `increment_event_counter` has no `requireAdmin`, so any client can force-resolve world events

### Blockers/Concerns

- **[Milestone end, user action] Maincloud migration.** On 2026-09-30 the user deferred it "until we're all done". Run section E of 42-USER-CHECKLIST.md: publish 1 from 5968d54f, deploy the client and `/setappversion`, `purge_legacy_llm` with COUNT 0 checks, then publish 2. Publish 1 also covers 41-MAINCLOUD-CHECKLIST.md. Phase 43 adds only additive, defaulted schema, so publish 2 from the final HEAD still needs no clear.
- **[Phase 41 PARTLY DONE 2026-09-30] Smoke test passed locally (6/6 routes ok, key_valid true, ~$0.11; world_gen 23.5 s, creation_class 10.1 s). The rest of the local live proof (41-16 Task 2) is still deferred.** The user set the Anthropic key locally (keySet true, len 108, `keyValid` false until a smoke test passes) and decided on 2026-09-30 "we can skip the live proof for now". Nothing has been proven against real Claude: no smoke test, no real action per domain, no real-response usage or latency figures, no he/she pronoun check on real output. Resume: `41-LOCAL-PROOF.md` ("How to resume later"): `spacetime call uwr llm_smoke_test --server local`, then `pnpm exec vitest run --config scripts/llm/vitest.live.config.ts` (PROVE_LIVE_DRY unset). The key stays stored locally, so local play makes real calls within the caps ($1/day and 200 calls per player, $2 phase ledger). Do not `--clear-database` locally without need (it wipes the key).
- **[Phase 41 DEFERRED, user action] Maincloud proof (41-17) not run.** `41-MAINCLOUD-CHECKLIST.md` is written for the user; the user chose to defer the run. The Phase 39 gate re-check on maincloud (dispatch p95 under 250 ms, zero reliability failures, region schema, responsiveness, no browser request to Anthropic or a proxy) is deferred too. Run the local live proof first. A maincloud publish adds `npc.gender` (default '') and needs `--break-clients` (no data loss, no clear); the first publish after the 2.10 upgrade may also need it.
- [Phase 41 follow-up, cosmetic] `set-key.mjs` prints Node warning `MODULE_TYPELESS_PACKAGE_JSON` for `spacetimedb/src/helpers/measurement.ts`; adding `"type": "module"` to `spacetimedb/package.json` would silence it.
- [Phase 38, resolved by Phase 42] The OpenAI path and llm-proxy are removed; LLM calls run server-side on Claude. Revoking the old OpenAI key and deleting the Worker are on 42-USER-CHECKLIST.md
- [v2.2] The Phase 39 maincloud leg ran in Plan 39-11 on uwr-spike-925iv by user decision on 2026-09-29 and the go decision is confirmed; Phase 41 still proves the real executor on maincloud. The maincloud leg of QUAL-02 (Phase 44) remains a manual user action
- [v2.2] `--clear-database` wipes the private `llm_config` Anthropic key; avoid unless a schema change requires it (runbook lands in Phase 41)
- [Phase 38] First maincloud publish after the 2.10 upgrade will re-create the 14 views and need --break-clients (no data loss) -- user-run only
- [Phase 38] Lockfiles moved to pnpm-only -- check any external host's package-manager detection before the next push
- [Phase 40 → 41] Hand-offs:
  - The renown static fallback in `helpers/llm_apply.ts` still throws on bigint `JSON.stringify(perk.effect)`. It is pinned by characterization tests; fix it with a shared serializer and update the snapshot deliberately.
  - Creation race and class replies are not clamped. They are pinned as "Phase 41: validator gap".
  - The executor must process or expire the pending `renown_perk_gen` jobs, and add a sweeper for stuck active jobs (dedupe blocks on them, review IN-07).
  - `my_llm_jobs.errorCode` is a coarse bucket: transient, unavailable, declined or failed.
  - Review Info items IN-01 to IN-12 are in `40-REVIEW.md`.
- [Env] On 2026-09-30 the machine briefly ran out of committed virtual memory (0.5 GB free), which crashed multi-worker vitest runs. It cleared after a restart (40.8 GB free). Single-worker runs (`--maxWorkers=1`, about 19 s, 1454 tests green) stay the safe default for agents on this low-end host.
- **NO PUSHES TO MASTER** -- production auto-deploys from master; all work stays local until user approves
- **NO PUSHES TO MAINCLOUD** -- local SpacetimeDB only until user says otherwise (one exception: the Phase 39 spike database uwr-spike-925iv, published by Claude under the user's 2026-09-29 grant since deleted by the user on 2026-09-29)

### Quick Tasks Completed

(v2.1 quick tasks 392-405 archived in .planning/milestones/v2.1-ROADMAP.md.)

## Deferred Items

Items acknowledged and deferred at milestone close on 2026-09-29:

| Category | Item | Status |
|----------|------|--------|
| verification | Phase 999.1 (was 33): 33-VERIFICATION.md | human_needed (parked phase) |
| uat | Phase 999.2 (was 34): 34-UAT.md | testing, 12 pending scenarios (parked phase) |
| debug | slam-cooldown-delay-new-warrior | resolved-archived |
| quick_task | Historical quick tasks 1-405 (404 flagged) | legacy format with no status field, not actually open |
| todo | 5 pending todos (2 are LLM milestone seeds) | carried forward |
| requirements | COMB-05, COMB-08, NARR-03, EQUIP-01-05, UX-01-03 | carried with parked Backlog phases 999.1-999.5 |

## Deferred Verification

| Phase | State | Resume |
|-------|-------|--------|
| 41 | verification_deferred_human | /gsd-verify-work 41 |

Phase 41 is code-complete and verified at code level (41-VERIFICATION.md: human_needed, no gaps). The user deferred the live checks on 2026-09-30 ("we can skip the live proof for now") and chose to keep going: the local live proof (41-LOCAL-PROOF.md), the browser network-tab check and the maincloud checklist (41-MAINCLOUD-CHECKLIST.md). Phase 44 live verification picks them up. The key is set locally (length 108, not yet verified by a smoke test).

Phase 42 verification passed on 2026-09-30, after the user resolved every UAT item: 4 passed and 1 skipped. Its maincloud two-publish is deferred to the end of the milestone (see Blockers/Concerns).

## Session Continuity

**Resume file:** None

Last session: 2026-10-01T09:04:14.850Z
Stopped at: Completed 43-15-PLAN.md

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 38 P01 | 15min | 3 tasks | 20 files |
| Phase 38 P02 | 30min | 2 tasks | 1 files |
| Phase 38 P03 | 25min | 3 tasks | 21 files |
| Phase 38 P04 | 10min | 2 tasks | 2 files |
| Phase 38 P05 | 25min | 2 tasks | 5 files |
| Phase 38 P06 | 15min | 3 tasks | 3 files |
| Phase 38 P07 | 15min | 2 tasks | 7 files |
| Phase 38 P08 | 20min | 2 tasks | 0 files |
| Phase 39 P01 | 12min | 3 tasks | 4 files |
| Phase 39 P02 | 25min | 3 tasks | 7 files |
| Phase 39 P03 | 25min | 3 tasks | 10 files |
| Phase 39 P04 | 25min | 3 tasks | 3 files |
| Phase 39 P05 | 20min | 2 tasks | 4 files |
| Phase 39 P06 | 25min | 3 tasks | 2 files |
| Phase 39 P07 | 45min | 2 tasks | 4 files |
| Phase 39 P08 | 30min | 2 tasks | 2 files |
| Phase 39 P11 | 30min | 3 tasks | 10 files |
| Phase 39 P09 | resumed | 3 tasks | 6 files |
| Phase 39 P10 | 20min | 3 tasks | 27 files |
| Phase 40 P01 | 15min | 2 tasks | 4 files |
| Phase 40 P02 | 25min | 3 tasks | 9 files |
| Phase 40 P03 | 30min | 3 tasks | 4 files |
| Phase 40 P04 | 12min | 2 tasks | 4 files |
| Phase 40 P05 | 55min | 3 tasks | 4 files |
| Phase 40 P06 | 15min | 2 tasks | 35 files |
| Phase 40 P07 | 30min | 2 tasks | 7 files |
| Phase 40 P08 | 30min | 2 tasks | 3 files |
| Phase 40 P09 | 35min | 2 tasks | 4 files |
| Phase 40 P10 | 10min | 2 tasks | 0 files |
| Phase 41 P01 | 10min | 3 tasks | 10 files |
| Phase 41 P02 | 15min | 2 tasks | 2 files |
| Phase 41 P03 | 45min | 2 tasks | 9 files |
| Phase 41 P04 | 12min | 3 tasks | 8 files |
| Phase 41 P05 | 20min | 2 tasks | 5 files |
| Phase 41 P06 | 70min | 2 tasks | 5 files |
| Phase 41 P07 | 35min | 2 tasks | 7 files |
| Phase 41 P08 | 25min | 2 tasks | 10 files |
| Phase 41 P09 | 15min | 2 tasks | 4 files |
| Phase 41 P10 | 20min | 2 tasks | 3 files |
| Phase 41 P11 | 12min | 2 tasks | 5 files |
| Phase 41 P12 | 25min | 3 tasks | 13 files |
| Phase 41 P13 | ~25min | 2 tasks | 11 files |
| Phase 41 P14 | 25min | 3 tasks | 17 files |
| Phase 41 P15 | 35min | 2 tasks | 10 files |
| Phase 41 P18 | ~60min | 3 tasks | 32 files |
| Phase 41 P16 | ~10min | 1 of 2 tasks (Task 2 deferred) | 1 files |
| Phase 41 P17 | ~15min | 3 tasks (Task 2 deferred by user) | 2 files |
| Phase 42 P01 | 55min | 3 tasks | 10 files |
| Phase 42 P02 | 40min | 3 tasks | 9 files |
| Phase 42 P03 | 35min | 3 tasks | 12 files |
| Phase 42 P04 | 40min | 3 tasks | 12 files |
| Phase 42 P05 | 25min | 2 tasks | 7 files |
| Phase 42 P06 | 25min | 3 tasks | 15 files |
| Phase 42 P07 | 25min | 3 tasks | 8 files |
| Phase 43 P01 | 15min | 3 tasks | 16 files |
| Phase 43 P02 | 12min | 2 tasks | 2 files |
| Phase 43 P03 | 25min | 2 tasks | 9 files |
| Phase 43 P04 | 40min | 2 tasks | 9 files |
| Phase 43 P05 | 25min | 2 tasks | 10 files |
| Phase 43 P06 | 15min | 3 tasks | 11 files |
| Phase 43 P07 | 14min | 2 tasks | 4 files |
| Phase 43 P08 | 55min | 3 tasks | 7 files |
| Phase 43 P09 | 25min | 2 tasks | 7 files |
| Phase 43 P10 | 30min | 3 tasks | 9 files |
| Phase 43 P11 | 25min | 2 tasks | 4 files |
| Phase 43 P12 | 25min | 3 tasks | 2 files |
| Phase 43 P13 | 55min | 3 tasks | 10 files |
| Phase 43 P14 | ~15min | 2 tasks | 6 files |
| Phase 43 P15 | 35min | 3 tasks | 9 files |

## Operator Next Steps

- Review and approve the v2.2 roadmap (.planning/ROADMAP.md)
- Then run /gsd-plan-phase 39 (spike; research flagged) to plan the go/no-go gate
- Have an Anthropic API key ready for the spike (supply via environment variable, never commit it)
