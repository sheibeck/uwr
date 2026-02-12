# Project State

**Milestone:** RPG Milestone — Progression Systems & LLM Content Engine
**Last updated:** 2026-02-12
**Status:** Phase 1 in progress — Plan 01 (backend) complete, Plan 02 (frontend) next

---

## Current Position

Phase 1 (Races) execution started. Plan 01 complete.

**Current phase:** 01-races
**Current plan:** 02 of 02
**Next action:** Execute Plan 02 (Race selection frontend UI)

---

## Phase Status

| Phase | Name | Status |
|-------|------|--------|
| 1 | Races | In Progress (1/2 plans done) |
| 2 | Hunger | Pending |
| 3 | Renown Foundation | Pending |
| 4 | LLM Architecture | Pending |
| 5 | Quest System | Pending |
| 6 | World Events | Pending |
| 7 | Narrative Tone Rollout | Pending |
| 8 | Content Data Expansion | Pending |

---

## Key Decisions Locked

1. LLM generation uses client-triggered procedure pattern (Phase 1 simplicity; server-scheduled in v2)
2. Race as data rows (`Race.unlocked: bool`), not TypeScript enum — required for World Event unlocks
3. No hunger penalties — reward-only design confirmed
4. No faction standing decay — WoW model confirmed
5. Config table (private) for Anthropic API key storage — no native env var support in SpacetimeDB 1.12
6. Phase 1 + Phase 3 can execute in parallel; Phase 4 (LLM) requires Phase 3 first consumer
7. Human availableClasses is '' (empty string) not 'all' — isClassAllowed returns true for empty string (01-01)
8. Racial bonuses baked into baseStats at character creation, not stored as separate layer (01-01)
9. Character row stores race as display name string, not raceId — snapshot is self-contained (01-01)

---

## Performance Metrics

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 01-races | 01 | 4min | 3 | 8 |

---

## Blocked / Risks

None currently. Key risk to watch: SpacetimeDB procedures are beta — API may change on upgrade.

---

## Last Session

**Stopped at:** Completed 01-races 01-01-PLAN.md (Race backend: table, seed data, character reducer)
**Timestamp:** 2026-02-12T01:43:08Z
