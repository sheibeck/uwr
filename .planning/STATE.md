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
| 7 | Fix armor class restrictions - correct swapped armor proficiency check arguments and update armor seed data to show proper class restrictions in tooltips | 2026-02-12 | f5d9476 | [7-we-ve-added-tooltips-to-show-class-restr](./quick/7-we-ve-added-tooltips-to-show-class-restr/) |
| 8 | Add log entries for faction standing gains - show lavender-colored messages when gaining/losing standing with factions | 2026-02-12 | f6aeed2 | [8-add-log-entries-for-faction-standing-gai](./quick/8-add-log-entries-for-faction-standing-gai/) |
| 9 | Fix equipment validation to allow class-permitted weapons - skip armor proficiency check for armorType='none' items (weapons, accessories) | 2026-02-12 | fefce50 | [9-fix-equipment-validation-allow-class-per](./quick/9-fix-equipment-validation-allow-class-per/) |
| 10 | Add user feedback for blocked abilities - client-side local event system with terracotta-colored messages when abilities blocked by combat state | 2026-02-12 | 0ac90bb | [10-add-user-feedback-for-blocked-abilities-](./quick/10-add-user-feedback-for-blocked-abilities-/) |
| 11 | Add enemy popover tooltip showing individual member names and faction affiliation | 2026-02-12 | 9b94ece | [11-add-enemy-popover-tooltip-showing-indivi](./quick/11-add-enemy-popover-tooltip-showing-indivi/) |
| 12 | Fix recipe research to scope unlocks per-character - filter discoveredRecipeIds by selected character | 2026-02-12 | ca786dd | [12-fix-recipe-research-to-unlock-only-for-r](./quick/12-fix-recipe-research-to-unlock-only-for-r/) |
| 13 | Refactor UI panels to allow multiple panels - multi-panel system with independent positioning, resizing, and persistence | 2026-02-12 | d6a6d26 | [13-refactor-ui-panels-allow-multiple-panels](./quick/13-refactor-ui-panels-allow-multiple-panels/) |
| 14 | Update vendor seeding to use random subset selection - vendors stock ~13-15 tier-appropriate items instead of all 50+ items | 2026-02-12 | 859b4b2 | [14-update-vendor-seeding-to-use-random-sele](./quick/14-update-vendor-seeding-to-use-random-sele/) |
| 15 | Fix panel visibility bug - add missing closing div on Character Panel to allow independent panel rendering | 2026-02-12 | fc63cf6 | [15-fix-panel-visibility-bug-panels-incorrec](./quick/15-fix-panel-visibility-bug-panels-incorrec/) |
| 16 | Refactor location panel with flexible grid layout and context menus - replace button-heavy accordions with grid tiles and right-click menus | 2026-02-12 | 682e364 | [16-refactor-location-panel-flexible-grid-la](./quick/16-refactor-location-panel-flexible-grid-la/) |
| 17 | Fix context menu handlers - add data-context-menu attribute to prevent race condition where menu closed before click events fired | 2026-02-12 | 6c67d7f | [17-fix-context-menu-handlers-wire-up-enemy-](./quick/17-fix-context-menu-handlers-wire-up-enemy-/) |
| 18 | Align hotbar panel styling with other floating panels - remove redundant title, add panelBody wrapper, use card-style slot rows | 2026-02-12 | 992b0bc | [18-align-hotbar-panel-styling-with-other-fl](./quick/18-align-hotbar-panel-styling-with-other-fl/) |

---

## Last Session

**Stopped at:** Completed quick task 18: Align hotbar panel styling with other floating panels
**Timestamp:** 2026-02-12T17:38:29Z
