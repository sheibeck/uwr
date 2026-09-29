# Milestones

## v2.1 Project Cleanup (Shipped: 2026-09-29)

**Phases completed:** 3 phases (31, 32, 38), 14 plans, 19 tasks, plus quick tasks 392-405
**Timeline:** 2026-03-09 to 2026-09-29
**Commits:** 203 | **Files changed:** 544 | **Lines:** +34,013 / -21,108 (source only: +11,196 / -12,708)
**Git range:** `7c488fb3..v2.1`
**Closeout:** override_closeout. No formal audit was run; all 3 active phases were verified (passed). Known verification overrides: 2 (see STATE.md Deferred Items).

**Key accomplishments:**

1. Test infrastructure: shared proxy-based `createMockDb`/`createMockCtx` utilities, 101 combat regression tests, and 130 inventory, equipment-gen and intent-routing tests.
2. Legacy purge: moved mechanical rules out of 5 legacy data files and deleted 11 v1.0 backend files (seeding system, data definitions, old `create_character`), 9 orphaned Vue components and 1,916 lines of dead frontend code.
3. Platform upgrade: SpacetimeDB 2.0.1 → 2.10.1, TypeScript 6, Vite 8, Vitest 5, Vue 3.5.43, pnpm-only lockfiles, and llm-proxy dependencies (hono 4.13, openai 7, wrangler 4.143). Build and 990 tests green.
4. Delivered inside later-parked phases: combat log/balance and multi-enemy pull (COMB-01–04, 06, 07), sell commands and persistent hotbars (NARR-01, 02, 04, 05), and ability expansion with race abilities and renown perks as dynamic abilities (ABIL-01–11).

### Known Gaps

Phases 33-37 were parked in the Backlog as 999.1-999.5 on 2026-09-29 while core concepts are re-imagined. Their unfinished requirements carry over:

- COMB-05: Enemy HUD DoT/HoT/debuff indicators with remaining duration (999.1)
- COMB-08: Group info panel readable font size and layout (999.5)
- NARR-03: Hotbar inline in narrative combat HUD (999.2)
- EQUIP-01 to EQUIP-05: Dynamic equipment generation (999.3, not started)
- UX-01 to UX-03: Global font size control and group panel readability (999.5, not started)

Also carried over: live LLM calls fail (OpenAI 429, no credits). This is the scope of the next milestone (LLM, OpenAI → Claude).

---

## v2.0 The Living World (Shipped: 2026-03-09)

**Phases completed:** 7 phases, 22 plans + 60 quick tasks (333-391)
**Timeline:** 3 days (2026-03-06 to 2026-03-09)
**Commits:** 297 | **Files changed:** 446 | **Lines:** +46,424 / -11,171
**Codebase:** 52,576 LOC (TypeScript + Vue)
**Git range:** `8fd2d1f..f730591`

**Key accomplishments:**

1. LLM Pipeline Foundation — SpacetimeDB procedure-based Anthropic API integration with budget controls, status tracking, and graceful degradation
2. Narrative UI Shell — Chat-first narrative console replacing traditional RPG panels, with persistent HUD and natural language intent routing
3. Narrative Character Creation — Freeform race description + archetype selection produces unique LLM-generated class through guided conversation with the Keeper of Knowledge
4. Procedural World Generation — Player arrival triggers persistent region creation with canonical world facts, ripple announcements, and generation locks
5. Dynamic Skill Generation — Level-up offers 3 LLM-generated skills with schema-constrained templates and power-budget validation; unchosen skills vanish
6. NPC & Quest Generation — Contextual NPCs with persistent memory/affinity and narrative quests generated from world state
7. Narrative Combat — Real-time combat with LLM intro narration, fully inline narrative UI, and data-driven ability dispatch (replaced 106-case hardcoded switch)

---

## v1.0 — RPG Milestone: Progression Systems & LLM Content Engine

**Status:** Complete (2026-02-25)
**Phases:** 1–23

**Delivered:**

- Character creation with races, classes, stats, leveling
- Turn-based combat with abilities, cooldowns, enemy AI, aggro management
- Groups, friends, whispers, group chat
- Inventory, vendors, item rarity tiers, crafting (29 recipes)
- Loot & gear progression with quality tiers, prefix/suffix affixes, legendary drops
- Quest system (kill/loot/explore/delivery/boss_kill types, 14 quests)
- Named NPCs with shops, affinity, dialogue chains
- World events with contribution tiers, success/failure consequences
- Renown system with 15 ranks and permanent perks (30 perks)
- Travel with stamina costs, death/corpse system
- Config table architecture for ability metadata
- SpacetimeAuth OIDC authentication
- V2 subscription optimization (event tables)

**Pending at close (deferred to v2.0):**

- LLM Architecture (Phase 5) — superseded by v2.0 pivot
- Narrative Tone Rollout (Phase 8) — superseded by v2.0 pivot
- Travelling NPCs (Phase 16) — deferred
- World Bosses (Phase 17) — deferred

**Last phase:** 23
