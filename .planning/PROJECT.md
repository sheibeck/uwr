# UWR — Project Charter

**Type:** Brownfield expansion
**Created:** 2026-02-11
**Current milestone:** v2.0 — The Living World

---

## What This Is

UWR is a browser-based multiplayer RPG built on SpacetimeDB and Vue 3. Players enter a procedurally-generated living world shaped by LLM-driven narrative. Character creation is a guided narrative experience — players choose any fantasy race they can imagine, pick a base archetype (Warrior or Mystic), and receive a unique LLM-generated class. The world itself forms around players as they enter, creating persistent regions that evolve over time. Every interaction flows through a sardonic system-narrator that treats the world as a story unfolding in response to player decisions.

The architecture is two-tier: SpacetimeDB TypeScript backend (server-authoritative) + Vue 3 SPA frontend (client). All state lives in SpacetimeDB tables. The client subscribes to reactive state via `useTable()`. Backend reducers are the only mutation path. LLM integration via SpacetimeDB procedures connects to Anthropic's Claude API.

---

## Core Value

A world that writes itself around its players — every character is unique, every region is discovered, and the narrative responds to what players actually do.

---

## Validated Requirements (v1.0 — Existing Infrastructure)

These systems are implemented and carry forward as reusable infrastructure:

| System | Status | Carries Forward As |
|--------|--------|-------------------|
| SpacetimeDB multiplayer backbone (auth, subscriptions, sync) | Done | Core platform |
| Chat system (whispers, group chat, friends) | Done | Social layer |
| Turn-based combat engine (abilities, cooldowns, effects, AI) | Done | Combat foundation (reworked for narrative) |
| Inventory & equipment systems | Done | Item management |
| Crafting system architecture | Done | Generation template patterns |
| Event log system (private, location, group, world scopes) | Done | Narrative delivery channel |
| Travel & movement | Done | World navigation |
| Death & corpse system | Done | Consequence mechanics |
| Config table architecture | Done | Data-driven design pattern |
| World events framework | Done | World evolution triggers |
| SpacetimeAuth OIDC | Done | Authentication |

---

## Active Requirements (v2.0 — The Living World)

| System | Priority | Description |
|--------|----------|-------------|
| **LLM Pipeline** | P0 | SpacetimeDB procedures + Anthropic API: the engine for all generation |
| **Narrative Character Creation** | P0 | Guided narrative experience: freeform race, Warrior/Mystic archetype, LLM-generated unique class |
| **Procedural World Generation** | P0 | Player arrival creates persistent, evolving regions. Ripple announcements to other players |
| **Chat-First UI** | P0 | Primary interface is narrative chat/console. Existing panels become secondary overlays |
| **Dynamic Skill Generation** | P1 | 3 LLM-generated skills offered per level-up. Unchosen skills may vanish forever |
| **Narrative Combat** | P1 | Turn-based engine with LLM-described rounds. Combat feels like story, not spreadsheet |
| **NPC Generation** | P1 | LLM creates NPCs contextual to regions, player actions, world state |
| **Quest Generation** | P1 | LLM generates quests from world context. Discovery-driven, not menu-driven |
| **The System (Narrator)** | P0 | Sardonic guide personality throughout all interactions. Witty, slightly mocking, amused |
| **Legacy Data Migration** | P1 | Clean break from fixed data. Old tables become generation schema templates |

---

## Out of Scope (v2.0)

- Mobile app
- Real-time voice/video chat
- Full PvP (player combat)
- Classic/fixed race and class lists
- Balanced class design (uniqueness > balance)
- Dungeon instancing

---

## Key Architectural Decisions

| Decision | Rationale | Status |
|----------|-----------|--------|
| LLM via SpacetimeDB procedures | Keeps architecture server-authoritative | Pending |
| Chat-first UI with panel overlays | Narrative experience is the core interaction model | Pending |
| Wild class generation (no guardrails) | Uniqueness over balance — every character one-of-a-kind | Pending |
| Clean break from fixed data | LLM generates everything; old data becomes schema templates | Pending |
| Persistent + evolving regions | World only grows, but content within regions shifts over time | Pending |
| Sardonic system narrator | Shadeslinger tone is non-negotiable across all text | Carried from v1.0 |
| 3 skills per level-up, pick 1 | Unchosen skills may vanish. Discovery and consequence | Pending |
| Ripple announcements for world growth | Players sense world shifts without knowing specifics | Pending |

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

## Narrative Tone (Non-Negotiable)

All user-visible text — event logs, quest descriptions, NPC dialogue, error messages, flavor text, the System's voice — must sound like it was written by a sarcastic fantasy narrator with a deep love of dry humor.

> "Congratulations. You've achieved the bare minimum. The guild acknowledges your existence."

The System is a character. It has opinions. It's amused by you. It's not your friend, but it's not your enemy either. It's the narrator of a story it finds endlessly entertaining.

LLM prompts must include a system message enforcing this tone. No sterile game-copy. Ever.

---

## Milestone Success Criteria (v2.0)

1. Players experience character creation as a narrative conversation with the System
2. Choosing a freeform race + archetype produces a unique LLM-generated class with description
3. Players enter a world that generates a region around them based on their character
4. Other players receive ripple announcements when the world expands
5. The primary UI is a narrative chat interface with panel overlays for inventory/social
6. Combat encounters are narrated by the LLM over the turn-based engine
7. Level-up offers 3 LLM-generated skills; unchosen skills may not return
8. NPCs and quests are generated contextually by the LLM
9. All text carries the sardonic System narrator voice

---
*Last updated: 2026-03-06 after v2.0 milestone pivot*
