# UWR — Project Charter

**Type:** Brownfield expansion
**Created:** 2026-02-11
**Current milestone:** Planning next milestone

---

## What This Is

UWR is a browser-based multiplayer RPG built on SpacetimeDB and Vue 3. Players enter a procedurally-generated living world shaped by LLM-driven narrative. Character creation is a guided narrative experience — players describe any fantasy race they can imagine, pick a base archetype (Warrior or Mystic), and receive a unique LLM-generated class from the Keeper of Knowledge. The world forms around players as they enter, creating persistent regions that evolve with play. NPCs hold conversations powered by LLM with persistent memory and affinity. Quests emerge contextually from NPC and world state. Every interaction flows through the Keeper of Knowledge — a sardonic narrator who treats the world as a story unfolding for its amusement.

The architecture is two-tier: SpacetimeDB TypeScript backend (server-authoritative) + Vue 3 SPA frontend (client). All state lives in SpacetimeDB tables. The client subscribes to reactive state via `useTable()`. Backend reducers are the only mutation path. LLM integration via a client-side proxy connects to Anthropic's Claude API (SpacetimeDB procedure HTTP is broken locally).

---

## Core Value

A world that writes itself around its players — every character is unique, every region is discovered, and the narrative responds to what players actually do.

---

## Requirements

### Validated

- ✓ SpacetimeDB multiplayer backbone (auth, subscriptions, sync) — v1.0
- ✓ Chat system (whispers, group chat, friends) — v1.0
- ✓ Real-time combat engine (abilities, cooldowns, effects, AI) — v1.0
- ✓ Inventory & equipment systems — v1.0
- ✓ Crafting system architecture — v1.0
- ✓ Event log system (private, location, group, world scopes) — v1.0
- ✓ Travel & movement — v1.0
- ✓ Death & corpse system — v1.0
- ✓ Config table architecture — v1.0
- ✓ World events framework — v1.0
- ✓ SpacetimeAuth OIDC — v1.0
- ✓ LLM Pipeline (procedures + budget + status tracking + graceful degradation) — v2.0
- ✓ Narrative UI (chat-first console, HUD, intent routing, typewriter, LLM indicators) — v2.0
- ✓ Narrative Character Creation (freeform race, archetype, LLM-generated class, persistence) — v2.0
- ✓ Procedural World Generation (player-triggered regions, canonical facts, ripple, generation locks) — v2.0
- ✓ Dynamic Skill Generation (3 LLM skills per level-up, schema validation, power budget) — v2.0
- ✓ NPC & Quest Generation (contextual NPCs, persistent memory/affinity, narrative quests) — v2.0
- ✓ Narrative Combat (LLM intro narration, inline UI, data-driven ability dispatch) — v2.0

### Active

(None yet — define with `/gsd:new-milestone`)

### Out of Scope

- Mobile app — web-first
- Real-time voice/video chat — not needed for narrative RPG
- Full PvP — not in current scope
- Classic/fixed race and class lists — uniqueness over presets
- Balanced class design — uniqueness > balance by design
- Dungeon instancing — not yet
- Streaming LLM responses — typewriter animation achieves same UX
- Fallback to legacy creation — clean break, LLM is the only path

---

## Context

Shipped v2.0 with 52,576 LOC TypeScript + Vue.
Tech stack: SpacetimeDB 1.12.0, Vue 3.5.13, Vite 6.4.1, Anthropic Claude API.
LLM calls use client-side proxy (SpacetimeDB procedure HTTP broken locally).
Model selection: Haiku 4.5 for real-time generation, gpt-5-mini for conversations/combat, Sonnet for high-stakes one-time generation.
Combat evolved through round-based experiment back to real-time during v2.0 (quick tasks 342-348).
Keeper of Knowledge narrator replaced generic "System" narrator in quick-365.
60 quick tasks (333-391) shipped during v2.0 for polish, bug fixes, and UX refinement.

---

## Key Architectural Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| LLM via client-side proxy (not procedures) | SpacetimeDB procedure HTTP broken locally | ✓ Works — useLlmProxy composable |
| Chat-first UI with panel overlays | Narrative experience is core interaction model | ✓ Good — all systems narrative now |
| Wild class generation (no guardrails) | Uniqueness over balance — every character one-of-a-kind | ✓ Good — produces creative results |
| Clean break from fixed data | LLM generates everything; old data becomes schema templates | ✓ Good — 106-case switch eliminated |
| Persistent + evolving regions | World only grows, content shifts over time | ✓ Good — regions persist canonically |
| Sardonic Keeper of Knowledge narrator | Non-negotiable tone across all text | ✓ Good — consistent voice |
| 3 skills per level-up, pick 1 | Unchosen skills vanish — discovery and consequence | ✓ Good — creates tension |
| Kind-based ability dispatch map | Replaces hardcoded switch for unlimited generated abilities | ✓ Good — scales to any ability |
| Real-time combat (not round-based) | Round-based felt sluggish; reverted after experiment | ✓ Good — immediate feedback |
| Haiku/gpt-5-mini for fast generation | Sonnet HTTP fails from SpacetimeDB runtime; fast models sufficient | ✓ Good — fast enough |
| NPC memory arrays capped at 10 | Bounded prompt size for LLM conversations | ✓ Good — keeps costs down |

---

## Constraints

- SpacetimeDB procedures can't make HTTP calls locally (ctx.http.fetch broken)
- LLM budget limits daily generation per player
- No pushes to master without user approval (production auto-deploys)
- No pushes to maincloud without user approval

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend runtime | SpacetimeDB 1.12.0 (TypeScript SDK) |
| Backend language | TypeScript 5.6.2 |
| Frontend framework | Vue 3.5.13 + Vite 6.4.1 |
| Authentication | SpacetimeAuth OIDC |
| LLM provider | Anthropic Claude API (via client proxy) |
| LLM proxy | Cloudflare Workers + Hono + OpenAI SDK |
| Deployment | GitHub Pages (frontend) + SpacetimeDB maincloud (backend) |

---
*Last updated: 2026-03-09 after v2.0 milestone*
