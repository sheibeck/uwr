# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-06)

**Core value:** A world that writes itself around its players -- every character is unique, every region is discovered, and the narrative responds to what players actually do.
**Current focus:** Phase 24 — LLM Pipeline Foundation

## Current Position

Phase: 24 of 30 (LLM Pipeline Foundation)
Plan: — (not yet planned)
Status: Ready to plan
Last activity: 2026-03-06 — Roadmap created for v2.0 milestone (phases 24-30)

Progress: [░░░░░░░░░░] 0%

## Previous Milestone (v1.0)

See MILESTONES.md for full v1.0 delivery summary. Phases 1-23 complete (shipped 2026-02-25).

## Performance Metrics

**Velocity:**
- Total plans completed: 0 (v2.0)
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

*Updated after each plan completion*

## Accumulated Context

### Decisions

- Clean break from legacy data -- no migration, no parallel systems, no `source` field on tables
- Client-triggered procedures (reducer validates, client calls procedure for LLM)
- Schema-constrained generation for mechanical validity
- Canonical world facts in structured tables for coherence
- Sardonic System narrator throughout all generated content
- Haiku 4.5 for real-time generation, Sonnet for high-stakes one-time generation

### Pending Todos

None yet.

### Blockers/Concerns

- SpacetimeDB procedures are beta -- load test early before building on them
- Prompt caching minimum thresholds (1024 tokens Sonnet, 4096 tokens Haiku) must be verified
- **NO PUSHES TO MASTER** -- production auto-deploys from master; all v2.0 work stays local until user approves
- **NO PUSHES TO MAINCLOUD** -- local SpacetimeDB only until user says otherwise

## Session Continuity

Last session: 2026-03-06
Stopped at: Roadmap created, ready to plan Phase 24
Resume file: None
