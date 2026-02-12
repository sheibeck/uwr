# UWR — Project Charter

**Type:** Brownfield expansion
**Created:** 2026-02-11
**Current milestone:** RPG Milestone — Progression Systems & LLM Content Engine

---

## What This Is

UWR is a browser-based multiplayer RPG built on SpacetimeDB (1.12.0) and Vue 3. Players create
characters, form groups, engage in turn-based combat, and explore a world shaped by collective
player action. The game is narratively driven in the style of Shadeslinger — charm, wit, and
biting sarcasm throughout every message, log, and interaction.

The architecture is two-tier: SpacetimeDB TypeScript backend (server-authoritative) + Vue 3 SPA
frontend (client). All state lives in SpacetimeDB tables. The client subscribes to reactive state
via `useTable()`. Backend reducers are the only mutation path.

---

## Core Value

A world that reacts to its players — every meaningful action shapes what the game becomes.

---

## Validated Requirements (Existing Codebase)

These systems are already implemented and working:

| System | Status | Key Files |
|--------|--------|-----------|
| Character creation, class selection, leveling, stat progression | ✅ Done | `spacetimedb/src/reducers/characters.ts`, `spacetimedb/src/data/class_stats.ts` |
| Group formation, invites, fallback roster, disbanding | ✅ Done | `spacetimedb/src/reducers/groups.ts` |
| Turn-based combat with ability cooldowns, effects, enemy AI | ✅ Done | `spacetimedb/src/reducers/combat.ts`, `spacetimedb/src/data/abilities.ts` |
| Location-based world with travel between regions | ✅ Done | `spacetimedb/src/index.ts` (Location table) |
| Inventory, vendor buy/sell, item rarity tiers | ✅ Done | `spacetimedb/src/reducers/items.ts` |
| Friends list, whispers, group chat, friend requests | ✅ Done | `spacetimedb/src/reducers/social.ts` |
| Event log system (private, location, group, world scopes) | ✅ Done | `spacetimedb/src/index.ts` (Event* tables) |
| SpacetimeAuth OIDC authentication | ✅ Done | `src/spacetimeAuth.ts`, `src/main.ts` |

---

## Active Requirements (This Milestone)

These systems will be designed and built in this milestone:

| System | Priority | Description |
|--------|----------|-------------|
| **Race system** | P0 | Race definitions, race-class restrictions, racial stat bonuses |
| **Hunger system** | P0 | Time-based decay, well-fed buffs, meal crafting resource loop |
| **Renown / Faction** | P0 | Per-faction reputation tracks, rank unlocks quests and benefits |
| **World Events** | P1 | Broadcast events + LLM-generated consequences (unlock races, factions, systems) |
| **LLM Integration** | P1 | SpacetimeDB procedures + Anthropic API: quests, NPC dialogue, event consequences |
| **Quest system** | P1 | Quest tables, renown-gated unlock logic, completion tracking |
| **Narrative tone** | P2 | Shadeslinger-style LLM prompts applied to all generated text |
| **Content data expansion** | P2 | Gear sets, resources, crafting recipes, NPC catalog, enemy variety |

---

## Out of Scope (This Milestone)

- Mobile app
- Real-time voice/video chat
- Full PvP (combat between players)
- Persistent world map / dungeon instancing

---

## Key Architectural Decisions

| Decision | Rationale | Status |
|----------|-----------|--------|
| LLM via SpacetimeDB procedures | Keeps architecture server-authoritative; no external service needed | Pending |
| Hunger = reward-only (buffs for eating, no starvation penalty) | Player-friendly, not friction-based | Pending |
| Renown per-faction (not global) | Enables faction conflict, nuanced standing, different unlock paths | Pending |
| World Events fire LLM to generate consequences | Dynamic world that surprises players over time | Pending |
| Race added before other systems | Foundation for class gating, hunger modifiers, renown bonuses | Pending |
| Race as a data row (not enum) | Extensible — new races can be added as World Event unlocks | Pending |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend runtime | SpacetimeDB 1.12.0 (TypeScript SDK) |
| Backend language | TypeScript 5.6.2 |
| Frontend framework | Vue 3.5.13 + Vite 6.4.1 |
| Authentication | SpacetimeAuth OIDC |
| LLM provider | Anthropic (Claude API, via procedures) |
| Deployment | GitHub Pages (frontend) + SpacetimeDB maincloud (backend) |

---

## Critical Files for This Milestone

| File | Role |
|------|------|
| `spacetimedb/src/index.ts` | All table definitions (monolithic, ~5800 lines) — new tables added here |
| `spacetimedb/src/reducers/characters.ts` | Character creation — add race selection here |
| `spacetimedb/src/reducers/combat.ts` | Combat loop — hunger buffs and racial modifiers apply here |
| `spacetimedb/src/data/class_stats.ts` | Stat definitions — racial stat modifiers added here |
| `src/App.vue` | Main orchestrator — race picker UI, hunger bar, renown panel added here |
| `.planning/codebase/ARCHITECTURE.md` | Existing architecture reference |

---

## Milestone Success Criteria

1. Players can select a race at character creation; race affects available classes and base stats
2. Hunger decays over time; eating grants well-fed buffs that improve combat/progression
3. Performing faction-relevant actions increases renown; high renown unlocks quests and rewards
4. World Events fire and produce LLM-generated consequence text visible in the game log
5. Quests are generated by LLM, gated by renown tier, and completable for rewards
6. All LLM-generated text uses Shadeslinger narrative tone (sarcastic, charming, witty)
7. Content catalog expanded: ≥3 gear sets, ≥10 resources, ≥5 NPCs, ≥8 enemy types

---

## Narrative Tone (Non-Negotiable)

All user-visible text — event logs, quest descriptions, NPC dialogue, error messages, flavor text —
must sound like it was written by a sarcastic fantasy narrator with a deep love of dry humor.

> "Congratulations. You've achieved the bare minimum. The guild acknowledges your existence."

LLM prompts must include a system message enforcing this tone. No sterile game-copy. Ever.
