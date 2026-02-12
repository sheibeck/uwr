# Project State

**Milestone:** RPG Milestone — Progression Systems & LLM Content Engine
**Last updated:** 2026-02-12
**Status:** Phase 2 Plan 1 complete — hunger backend published; ready for Phase 2 Plan 2 (hunger frontend) or Phase 3

---

## Current Position

Phase 1 (Races) complete. Phase 2 Plan 1 (Hunger Backend) complete.

**Current phase:** 02-hunger
**Current plan:** 02 of TBD (Plan 01 done)
**Next action:** Begin Phase 2 Plan 2 (Hunger frontend) or Phase 3 (Renown Foundation) in parallel

---

## Phase Status

| Phase | Name | Status |
|-------|------|--------|
| 1 | Races | Complete (2/2 plans done) |
| 2 | Hunger | In Progress (1/2 plans done) |
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
10. filteredClassOptions returns null (not empty array) for "all classes allowed" — null is explicit "show everything" signal in CharacterPanel (01-02)
11. Class-clear on race switch runs in onRaceChange using races prop directly, not waiting for Vue recompute — avoids one-tick invalid state window (01-02)
12. Well Fed buff stored on Hunger row (not CharacterEffect) for direct O(1) combat lookup (02-01)
13. mana_regen/stamina_regen Well Fed buffs are display-only TODOs — Character table regen paths not yet wired for decay tick context (02-01)
14. Simple Rations stays as slot=consumable; 4 new Well Fed foods use slot=food to distinguish buff foods from utility consumables (02-01)

---

## Performance Metrics

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 01-races | 01 | 4min | 3 | 8 |
| 01-races | 02 | ~15min | 3 | 4 |
| 02-hunger | 01 | ~35min | 2 | 11 |

---

## Blocked / Risks

None currently. Key risk to watch: SpacetimeDB procedures are beta — API may change on upgrade.

---

## Last Session

**Stopped at:** Completed 02-hunger 02-01-PLAN.md (Hunger system backend: Hunger table, food templates, combat integration, published)
**Timestamp:** 2026-02-12T04:05:00Z
