# Project State

**Milestone:** RPG Milestone — Progression Systems & LLM Content Engine
**Last updated:** 2026-02-12
**Status:** Phase 2 Plan 2 Tasks 1-2 complete — hunger frontend built; awaiting human verification at checkpoint (Task 3)

---

## Current Position

Phase 1 (Races) complete. Phase 2 Plan 1 (Hunger Backend) complete. Phase 2 Plan 2 Tasks 1-2 complete, paused at Task 3 checkpoint.

**Current phase:** 02-hunger
**Current plan:** 02 of 02 (Plans 01 and 02 in progress)
**Next action:** Human verification of hunger system (Task 3 checkpoint) — then Phase 2 complete, Phase 3 ready

---

## Phase Status

| Phase | Name | Status |
|-------|------|--------|
| 1 | Races | Complete (2/2 plans done) |
| 2 | Hunger | In Progress (plan 02 tasks 1-2 done, task 3 is human-verify checkpoint) |
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
15. HungerBar rendered below StatsPanel in wrapper div — simpler than separate panel toggle, no new panel type needed (02-02)
16. eatable = slot === 'food' (lowercase compare) cleanly distinguishes Well Fed buff foods from consumable-slot utility items in InventoryPanel (02-02)

---

## Performance Metrics

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 01-races | 01 | 4min | 3 | 8 |
| 01-races | 02 | ~15min | 3 | 4 |
| 02-hunger | 01 | ~35min | 2 | 11 |
| 02-hunger | 02 | ~15min | 2 | 5 |

---

## Blocked / Risks

None currently. Key risk to watch: SpacetimeDB procedures are beta — API may change on upgrade.

---

## Last Session

**Stopped at:** Paused at 02-hunger 02-02-PLAN.md Task 3 checkpoint (human-verify)
**Timestamp:** 2026-02-12T03:55:00Z
