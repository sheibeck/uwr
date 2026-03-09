# Milestones

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
