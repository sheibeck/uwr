---
gsd_state_version: 1.0
milestone: v2.2
milestone_name: LLM — Claude Engine
current_phase: 39
current_phase_name: Procedure-to-Claude Spike
status: executing
stopped_at: Completed 39-04-PLAN.md
last_updated: "2026-09-29T20:20:48.702Z"
last_activity: 2026-09-29
last_activity_desc: Phase 39 execution started
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 10
  completed_plans: 4
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-29)

**Core value:** A world that writes itself around its players -- every character is unique, every region is discovered, and the narrative responds to what players actually do.
**Current focus:** Phase 39 — Procedure-to-Claude Spike

## Current Position

Phase: 39 (Procedure-to-Claude Spike) — EXECUTING
Plan: 5 of 10
Status: Ready to execute
Last activity: 2026-09-29 — Phase 39 execution started

Progress: [████░░░░░░] 40%

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

### Roadmap Evolution

- 2026-09-29: Phases 33-37 parked in Backlog as 999.1-999.5 (user decision: put on hold while re-imagining core concepts). Promote with /gsd-review-backlog.

- 2026-09-29: v2.2 roadmap created: Phases 39-44 (39 Spike, 40 Claude Layer and Job Seam, 41 Executor and Domain Cutover, 42 Client Cutover and Legacy Removal, 43 Latency Tuning and Budget, 44 Live Verification and Tone Eval). Numbering continues from 38; 33-37 are consumed by parked Backlog 999.1-999.5, which stay untouched.

- Phase 38 added: Platform Upgrade (SpacetimeDB 2.0.1 -> 2.10.x, tooling, llm-proxy deps, pnpm-only). Runs next, ahead of 33-35 and 37. Research: `.planning/notes/platform-upgrade-research.md`

### Pending Todos

- `todos/pending/2026-09-29-new-milestone-llm-reliability.md` — **NEXT MILESTONE (after v2.1 is archived):** fix the LLM pipeline (OpenAI credits/provider, procedure HTTP vs llm-proxy)

- `todos/pending/2026-09-29-spike-procedure-http-to-retire-llm-proxy.md` — test whether 2.10 procedure HTTP can replace llm-proxy
- `todos/pending/2026-09-29-migrate-client-table-handles-to-camelcase.md` — optional cleanup of deprecated snake_case table aliases

### Blockers/Concerns

- [Phase 38] Live LLM calls fail: the OpenAI account behind llm-proxy/.dev.vars returns 429 "no credits" -- deferred to the LLM milestone by user decision; v2.2 replaces the OpenAI path with Claude
- [v2.2] Maincloud legs of SPIKE-04 (Phase 39) and QUAL-02 (Phase 44) are manual user actions; the Phase 39 go/no-go decision is not final until the user supplies the maincloud results
- [v2.2] `--clear-database` wipes the private `llm_config` Anthropic key; avoid unless a schema change requires it (runbook lands in Phase 41)
- [Phase 38] First maincloud publish after the 2.10 upgrade will re-create the 14 views and need --break-clients (no data loss) -- user-run only
- [Phase 38] Lockfiles moved to pnpm-only -- check any external host's package-manager detection before the next push
- **NO PUSHES TO MASTER** -- production auto-deploys from master; all work stays local until user approves
- **NO PUSHES TO MAINCLOUD** -- local SpacetimeDB only until user says otherwise

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

Last session: 2026-09-29T20:20:48.679Z
Stopped at: Completed 39-04-PLAN.md

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

## Operator Next Steps

- Review and approve the v2.2 roadmap (.planning/ROADMAP.md)
- Then run /gsd-plan-phase 39 (spike; research flagged) to plan the go/no-go gate
- Have an Anthropic API key ready for the spike (supply via environment variable, never commit it)
