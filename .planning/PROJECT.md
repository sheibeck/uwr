# UWR — Project Charter

**Type:** Brownfield expansion
**Created:** 2026-02-11
**Current milestone:** None. v2.1 shipped 2026-09-29; the LLM milestone (OpenAI → Claude) is being defined

---

## What This Is

UWR is a browser-based multiplayer RPG built on SpacetimeDB and Vue 3. Players enter a procedurally-generated living world shaped by LLM-driven narrative. Character creation is a guided narrative experience — players describe any fantasy race they can imagine, pick a base archetype (Warrior or Mystic), and receive a unique LLM-generated class from the Keeper of Knowledge. The world forms around players as they enter, creating persistent regions that evolve with play. NPCs hold conversations powered by LLM with persistent memory and affinity. Quests emerge contextually from NPC and world state. Every interaction flows through the Keeper of Knowledge — a sardonic narrator who treats the world as a story unfolding for its amusement.

The architecture is two-tier: SpacetimeDB TypeScript backend (server-authoritative) + Vue 3 SPA frontend (client). All state lives in SpacetimeDB tables. The client subscribes to reactive state via `useTable()`. Backend reducers are the only mutation path. LLM integration runs through a client-side proxy (a Cloudflare Worker) that currently calls OpenAI. It exists because SpacetimeDB procedure HTTP was broken locally on 2.0.1. The next milestone moves the engine to Anthropic's Claude API.

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
- ✓ Unit test infrastructure (shared mock DB, combat regression, inventory, equipment-gen and intent-routing tests) — v2.1
- ✓ Technical debt cleanup (v1.0 legacy purge, mechanical rules extracted, deduplicated sell logic, orphaned components removed) — v2.1
- ✓ Platform upgrade (SpacetimeDB 2.10.1, TS 6, Vite 8, Vitest 5, pnpm-only) — v2.1
- ✓ Combat log completeness, balance tuning, multi-enemy and mid-combat pull (COMB-01–04, 06, 07) — v2.1
- ✓ Sell commands and persistent multi-hotbars in narrative UI (NARR-01, 02, 04, 05) — v2.1
- ✓ Ability type expansion, race abilities and renown perks as dynamic abilities (ABIL-01–11) — v2.1

### Active

- [ ] LLM engine migrated from OpenAI to Claude (Sonnet 5.5 + Haiku 4.5), with the lowest possible latency for real-time narrative (next milestone)
- [ ] Backend LLM service authenticates to Anthropic via Workload Identity Federation instead of API keys (next milestone, pending research)

### Parked (Backlog 999.1-999.5, on hold while core concepts are re-imagined)

- [ ] Enemy HUD DoT/HoT/debuff indicators (COMB-05) — 999.1
- [ ] Hotbar inline in narrative combat HUD (NARR-03) — 999.2
- [ ] Dynamic equipment generation (EQUIP-01–05) — 999.3
- [ ] Global font scale and group info readability (UX-01–03, COMB-08) — 999.5

### Out of Scope

- Mobile app — web-first
- Real-time voice/video chat — not needed for narrative RPG
- Full PvP — not in current scope
- Classic/fixed race and class lists — uniqueness over presets
- Balanced class design — uniqueness > balance by design
- Dungeon instancing — not yet
- Streaming LLM responses — typewriter animation achieves same UX (⚠️ under review: the LLM milestone's latency goal may reopen this)
- Fallback to legacy creation — clean break, LLM is the only path

## Current State

**Shipped:** v2.1 Project Cleanup (2026-09-29). The v2.0 foundation now has test coverage and no v1.0 legacy code, and runs on SpacetimeDB 2.10.1 with current tooling. Live LLM calls are currently broken: the OpenAI account returns 429 "no credits".

## Next Milestone Goals

**LLM: migrate from OpenAI to Claude.** Context is captured in `.planning/MILESTONE-CONTEXT.md`.
- Replace gpt-5.4 with Claude Sonnet 5.5 and gpt-5-mini with Claude Haiku 4.5
- Research the fastest LLM architecture for real-time narrative: proxy vs procedure HTTP vs hybrid, streaming, prompt caching
- Keep a backend LLM service; evaluate Workload Identity Federation for its Anthropic credentials

---

## Context

Shipped v2.1 with ~50,100 LOC TypeScript + Vue (excluding generated bindings) and 19 test files (990 tests green at Phase 38).
Tech stack: SpacetimeDB 2.10.1, Vue 3.5.43, Vite 8.3.1, TypeScript 6.0, Vitest 5.
LLM calls use a client-side proxy (Cloudflare Worker + OpenAI SDK). The SpacetimeDB 2.0.1 procedure HTTP failure is likely its 500 ms timeout; retest on 2.10.
Model selection (current code): gpt-5.4 for character creation and world gen; gpt-5-mini for skill gen, NPC conversation, combat narration and renown.
v2.1 phases 33-37 were parked in the Backlog on 2026-09-29 while core concepts are re-imagined.
Combat evolved through round-based experiment back to real-time during v2.0 (quick tasks 342-348).
Keeper of Knowledge narrator replaced generic "System" narrator in quick-365.
60 quick tasks (333-391) shipped during v2.0 for polish, bug fixes, and UX refinement.

---

## Key Architectural Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| LLM via client-side proxy (not procedures) | SpacetimeDB procedure HTTP broken locally | ⚠️ Revisit — LLM milestone researches the fastest architecture |
| Chat-first UI with panel overlays | Narrative experience is core interaction model | ✓ Good — all systems narrative now |
| Wild class generation (no guardrails) | Uniqueness over balance — every character one-of-a-kind | ✓ Good — produces creative results |
| Clean break from fixed data | LLM generates everything; old data becomes schema templates | ✓ Good — 106-case switch eliminated |
| Persistent + evolving regions | World only grows, content shifts over time | ✓ Good — regions persist canonically |
| Sardonic Keeper of Knowledge narrator | Non-negotiable tone across all text | ✓ Good — consistent voice |
| 3 skills per level-up, pick 1 | Unchosen skills vanish — discovery and consequence | ✓ Good — creates tension |
| Kind-based ability dispatch map | Replaces hardcoded switch for unlimited generated abilities | ✓ Good — scales to any ability |
| Real-time combat (not round-based) | Round-based felt sluggish; reverted after experiment | ✓ Good — immediate feedback |
| Platform upgrade before feature work (Phase 38) | SpacetimeDB 2.0.1 and tooling had fallen far behind | ✓ Good — SpacetimeDB 2.10.1, TS 6, Vite 8, Vitest 5, pnpm-only; build + 990 tests green |
| Haiku/gpt-5-mini for fast generation | Sonnet HTTP fails from SpacetimeDB runtime; fast models sufficient | ⚠️ Revisit — moving to Sonnet 5.5 + Haiku 4.5 in the LLM milestone |
| Shared proxy-based mock DB for tests (v2.1) | One mock implementation instead of per-file copies | ✓ Good — 990 tests on one utility |
| Park phases 33-37 in Backlog (v2.1) | Re-imagining core concepts before more feature work | — Pending — promote with /gsd-review-backlog |
| Skip DB backups before migrations (v2.1) | Greenfield; no production data worth preserving locally | ✓ Good — upgrade went forward cleanly |
| NPC memory arrays capped at 10 | Bounded prompt size for LLM conversations | ✓ Good — keeps costs down |

---

## Constraints

- SpacetimeDB procedures can't make HTTP calls locally (ctx.http.fetch broken) -- observed on 2.0.1, likely its 500 ms HTTP timeout; retest on 2.10 in the LLM milestone
- LLM budget limits daily generation per player
- No pushes to master without user approval (production auto-deploys)
- No pushes to maincloud without user approval

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend runtime | SpacetimeDB 2.10.1 (TypeScript SDK) |
| Backend language | TypeScript 6.0 |
| Frontend framework | Vue 3.5.43 + Vite 8.3.1 |
| Authentication | SpacetimeAuth OIDC |
| LLM provider | OpenAI (gpt-5.4, gpt-5-mini) via client proxy; migrating to Claude next milestone |
| LLM proxy | Cloudflare Workers + Hono + OpenAI SDK |
| Package manager | pnpm 11 (standalone projects: root, spacetimedb/, llm-proxy/) |
| Deployment | GitHub Pages (frontend) + SpacetimeDB maincloud (backend) |

---
## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-09-29 after v2.1 milestone*
