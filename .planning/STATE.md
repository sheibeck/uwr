---
gsd_state_version: 1.0
milestone: v2.2
milestone_name: LLM — Claude Engine
current_phase: 41
current_phase_name: Executor and Domain Cutover
status: planning
stopped_at: Completed 40-10-PLAN.md
last_updated: "2026-09-30T10:29:59.256Z"
last_activity: 2026-09-30
last_activity_desc: Phase 40 complete, transitioned to Phase 41
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 21
  completed_plans: 21
  percent: 33
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-29)

**Core value:** A world that writes itself around its players -- every character is unique, every region is discovered, and the narrative responds to what players actually do.
**Current focus:** Phase 40 — Claude Request Layer and Job Seam

## Current Position

Phase: 41 — Executor and Domain Cutover
Plan: Not started
Status: Ready to plan
Last activity: 2026-09-30 — Phase 40 complete, transitioned to Phase 41

Progress: [██████████] 100% (1/6 phases)

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

### Roadmap Evolution

- 2026-09-29: Phases 33-37 parked in Backlog as 999.1-999.5 (user decision: put on hold while re-imagining core concepts). Promote with /gsd-review-backlog.

- 2026-09-29: v2.2 roadmap created: Phases 39-44 (39 Spike, 40 Claude Layer and Job Seam, 41 Executor and Domain Cutover, 42 Client Cutover and Legacy Removal, 43 Latency Tuning and Budget, 44 Live Verification and Tone Eval). Numbering continues from 38; 33-37 are consumed by parked Backlog 999.1-999.5, which stay untouched.

- Phase 38 added: Platform Upgrade (SpacetimeDB 2.0.1 -> 2.10.x, tooling, llm-proxy deps, pnpm-only). Runs next, ahead of 33-35 and 37. Research: `.planning/notes/platform-upgrade-research.md`

### Pending Todos

- `todos/pending/2026-09-29-new-milestone-llm-reliability.md` — **NEXT MILESTONE (after v2.1 is archived):** fix the LLM pipeline (OpenAI credits/provider, procedure HTTP vs llm-proxy)

- `todos/pending/2026-09-29-migrate-client-table-handles-to-camelcase.md` — optional cleanup of deprecated snake_case table aliases
- `todos/pending/2026-09-29-require-admin-for-increment-event-counter-reducer.md` — **security:** `increment_event_counter` has no `requireAdmin`, so any client can force-resolve world events

### Blockers/Concerns

- [Phase 38] Live LLM calls fail: the OpenAI account behind llm-proxy/.dev.vars returns 429 "no credits" -- deferred to the LLM milestone by user decision; v2.2 replaces the OpenAI path with Claude
- [v2.2] The Phase 39 maincloud leg ran in Plan 39-11 on uwr-spike-925iv by user decision on 2026-09-29 and the go decision is confirmed; Phase 41 still proves the real executor on maincloud. The maincloud leg of QUAL-02 (Phase 44) remains a manual user action
- [v2.2] `--clear-database` wipes the private `llm_config` Anthropic key; avoid unless a schema change requires it (runbook lands in Phase 41)
- [Phase 38] First maincloud publish after the 2.10 upgrade will re-create the 14 views and need --break-clients (no data loss) -- user-run only
- [Phase 38] Lockfiles moved to pnpm-only -- check any external host's package-manager detection before the next push
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

## Session Continuity

**Resume file:** None

Last session: 2026-09-30T10:00:04.052Z
Stopped at: Completed 40-10-PLAN.md

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

## Operator Next Steps

- Review and approve the v2.2 roadmap (.planning/ROADMAP.md)
- Then run /gsd-plan-phase 39 (spike; research flagged) to plan the go/no-go gate
- Have an Anthropic API key ready for the spike (supply via environment variable, never commit it)
