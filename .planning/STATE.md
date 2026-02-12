# Project State

**Milestone:** RPG Milestone — Progression Systems & LLM Content Engine
**Last updated:** 2026-02-12
**Status:** Phase 3 complete — renown backend + frontend both shipped and human-verified

---

## Current Position

Phase 1 (Races) complete. Phase 2 (Hunger) complete. Phase 3 (Renown Foundation) complete — backend (03-01) and frontend (03-02) both done and human-verified.

**Current phase:** 3.1-faction-hits
**Current plan:** 01 (pending)
**Next action:** Plan Phase 3.1 Faction Hits

---

## Phase Status

| Phase | Name | Status |
|-------|------|--------|
| 1 | Races | Complete (2/2 plans done) |
| 2 | Hunger | Complete (2/2 plans done, human-verified) |
| 3 | Renown Foundation | Complete (2/2 plans done, human-verified) |
| 3.1 | Faction Hits | Pending (INSERTED) |
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
17. Kill-based standing only in Phase 3; quest-completion and tribute standing deferred to future phases (03-01)
18. Single-column by_character index on FactionStanding only — multi-column indexes broken in SpacetimeDB (03-01)
19. Standing per kill: +10 to enemy's faction, -5 to rival faction (03-01)
20. FactionStanding rows initialized eagerly at character creation (4 rows for 4 factions at standing=0) (03-01)
21. Enemy faction assignments: constructs/sentinels=Iron Compact, animals/nature spirits=Verdant Circle, undead/dark humanoids=Ashen Order, humanoid outlaws=Free Blades (03-01)
22. FACTION_RANKS defined client-side as constant array with numeric min/max thresholds — no backend lookup needed (03-02)
23. Standing BigInt converted via Number() before rank threshold comparison; getProgress clamps to 100% for Exalted (Infinity-safe) (03-02)
24. Combat state restrictions data-driven via AbilityTemplate.combatState field — eliminates hardcoded ability key lists on client/server (quick-6)

---

## Performance Metrics

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 01-races | 01 | 4min | 3 | 8 |
| 01-races | 02 | ~15min | 3 | 4 |
| 02-hunger | 01 | ~35min | 2 | 11 |
| 02-hunger | 02 | ~15min | 2 | 5 |
| 03-renown-foundation | 01 | 14min | 2 | 10 |
| 03-renown-foundation | 02 | ~10min | 2 | 4 |

---

## Accumulated Context

### Roadmap Evolution
- Phase 3.1 inserted after Phase 3: Faction Hits (URGENT)

---

## Blocked / Risks

None currently. Key risk to watch: SpacetimeDB procedures are beta — API may change on upgrade.

---

## Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Fix ability cooldown trigger - only apply cooldown when ability actually executes, not when denied due to combat state | 2026-02-12 | 6a57726 | [1-fix-ability-cooldown-trigger-only-apply-](./quick/1-fix-ability-cooldown-trigger-only-apply-/) |
| 2 | Fix pet summon cooldown - prevent false cooldown display when pet summons clicked outside combat | 2026-02-12 | a524111 | [2-fix-pet-summon-cooldown-prevent-cooldown](./quick/2-fix-pet-summon-cooldown-prevent-cooldown/) |
| 3 | Fix group log messages to show character names instead of "You" | 2026-02-12 | a2ece2f | [3-fix-group-log-messages-to-show-character](./quick/3-fix-group-log-messages-to-show-character/) |
| 4 | Fix equipment type restrictions - add armor proficiency check and tooltip class/armor info | 2026-02-12 | aa50ee2 | [4-equipment-of-any-type-is-currently-usabl](./quick/4-equipment-of-any-type-is-currently-usabl/) |
| 5 | Fix Nature's Mark cooldown - prevent false cooldown display when clicked in combat | 2026-02-12 | 8a11c55 | [5-fix-nature-s-mark-cooldown-prevent-coold](./quick/5-fix-nature-s-mark-cooldown-prevent-coold/) |
| 6 | Refactor cooldown guards & generalize combat state - eliminate hardcoded ability key lists with data-driven combatState field | 2026-02-12 | e53aca4 | [6-refactor-cooldown-guards-generalize-comb](./quick/6-refactor-cooldown-guards-generalize-comb/) |

---

## Last Session

**Stopped at:** 2026-02-12 - Completed quick task 6: Refactor cooldown guards & generalize combat state
**Timestamp:** 2026-02-12T14:41:29Z
