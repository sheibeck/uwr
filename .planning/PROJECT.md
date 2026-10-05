# UWR — Project Charter

**Type:** Brownfield expansion
**Created:** 2026-02-11
**Current milestone:** v3.0 UX Overhaul (started 2026-10-05)

---

## What This Is

UWR is a browser-based multiplayer RPG built on SpacetimeDB and Vue 3. Players enter a procedurally-generated living world shaped by LLM-driven narrative. Character creation is a guided narrative experience — players describe any fantasy race they can imagine, pick a base archetype (Warrior or Mystic), and receive a unique LLM-generated class from the Keeper of Knowledge. The world forms around players as they enter, creating persistent regions that evolve with play. NPCs hold conversations powered by LLM with persistent memory and affinity. Quests emerge contextually from NPC and world state. Every interaction flows through the Keeper of Knowledge — a sardonic narrator who treats the world as a story unfolding for its amusement.

The architecture is two-tier: SpacetimeDB TypeScript backend (server-authoritative) + Vue 3 SPA frontend (client). All state lives in SpacetimeDB tables. The client subscribes to reactive state via `useTable()`. Backend reducers are the only mutation path. LLM calls run server-side: reducers enqueue jobs and a scheduled SpacetimeDB procedure calls Claude Sonnet 5.5 (v2.2). The browser holds no LLM credential.

---

## Current Milestone: v3.0 UX Overhaul

**Goal:** Rebuild the client to the UWR Ledger Screens and Console & Combat designs on the Nocturne design system, at desktop (1280×800) and mobile (390×844), with structured, speaker-attributed Keeper replies.

**Target features:**
- Nocturne foundation (tokens, components, Phosphor icons), a three-column frame (persistent vitals rail, feed, context rail), secondary screens as drawers (desktop) or sheets with a tab bar (mobile)
- Console while exploring and in combat (Ledger 2i/2j, Console & Combat 1a): the right rail becomes the encounter, the round timer sits on the hotbar
- The eight Ledger screens: character creation (Keeper interview + live character sheet), inventory, stats, map/travel, group & social, vendor, crafting, world events
- Structured LLM replies: narration and dialogue segments, each with a speaker; the Keeper narrates what happens around the player in the second person; the UI renders labelled lines
- Natural sentences that start with a command word reach the conversation/intent path (backlog 999.7)
- Keeper tone re-tuned to the narrator voice, with owner sign-off (QUAL-01 carry-over)

**Source design:** claude_design project `1a7a975f-7b14-488b-9a38-188bc56294cf` (`UWR Ledger Screens.dc.html`, `UWR Console & Combat.dc.html`, Nocturne `_ds/…/styles.css`). Re-import from the MCP in each phase; never work from a cached copy.

**Deferred:** Admin "Keeper's Desk" screens; 999.2 and 999.5 and the enemy cast-bar todos stay in the backlog; live end-to-end verification and the maincloud run (QUAL-02) stay owner manual items.

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
- ✓ LLM engine on Claude Sonnet 5.5 for every generation call, run server-side by a scheduled SpacetimeDB procedure (llm-proxy retired) — v2.2
- ✓ No LLM credential or plumbing in the browser; client reads only its own job status — v2.2
- ✓ Spend controls ($10/day global ceiling, kill switch, /llm admin console) and measured latency tuning with staged world and class reveals — v2.2
- ✓ Failure classes show the right player-facing behavior (QUAL-03: 364 offline drills plus 4 live drills) — v2.2

### Active

- [ ] Complete UX overhaul to the UWR Ledger Screens and Console & Combat designs (Nocturne), desktop and mobile — v3.0 (from backlog 999.6)
- [ ] Structured, speaker-attributed LLM replies, with the Keeper as a second-person scene narrator — v3.0
- [ ] Command words at the start of natural sentences no longer hijack input — v3.0 (from backlog 999.7)
- [ ] Owner tone sign-off on the narrator voice (QUAL-01 carry-over) — v3.0
- [ ] Owner manual items, outside the roadmap: live end-to-end verification, Console reconciliation and the maincloud run (QUAL-02)

### Parked (Backlog 999.1-999.5, on hold while core concepts are re-imagined)

- [ ] Enemy HUD DoT/HoT/debuff indicators (COMB-05) — 999.1
- [ ] Hotbar inline in narrative combat HUD (NARR-03) — 999.2
- [ ] Dynamic equipment generation (EQUIP-01–05) — 999.3
- [ ] Global font scale and group info readability (UX-01–03, COMB-08) — 999.5

### Out of Scope

- Native mobile app — web-first (responsive mobile web layout is in scope for v3.0)
- Real-time voice/video chat — not needed for narrative RPG
- Full PvP — not in current scope
- Classic/fixed race and class lists — uniqueness over presets
- Balanced class design — uniqueness > balance by design
- Dungeon instancing — not yet
- Streaming LLM responses — typewriter animation achieves same UX. Phase 44 decision (2026-10-05): indicative only, no live NPC-chat latency sample exists (n=0 ok calls in llm_call_log; the paid end-to-end run was deferred), so neither outcome is asserted and nothing is built in v2.2; the rule (at least 20 ok NPC-chat calls, p95 call latency over 6000 ms makes streaming a next-milestone candidate, STREAM-01) is re-applied when the live run happens
- Fallback to legacy creation — clean break, LLM is the only path

## Current State

**Shipped:** v2.2 LLM — Claude Engine (2026-10-05, override closeout). Every narrative generation call (creation, world gen, skills, NPC chat, combat narration, renown) runs server-side on Claude Sonnet 5.5 through the scheduled procedure `llm_run`, with private job tables, retry by failure class, in-voice failures, a $10/day global ceiling, an admin kill switch and the `/llm` console. The browser holds no LLM credential. World and class generation are staged so players see a first reveal in about 5-10 s.

- Verification: phases 39, 40 and 42 passed; 41, 43 and 44 are code-complete with live checks deferred by the owner (see `.planning/MILESTONES.md` Known Gaps). QUAL-03 is proven; QUAL-01 (tone: needs_fixes) and QUAL-02 (live e2e, Console reconciliation, maincloud) are open.
- The maincloud migration has not been run; production still runs the pre-v2.2 build. Steps: `42-USER-CHECKLIST.md` section E and `44-MAINCLOUD-CHECKLIST.md` (archived under `.planning/milestones/v2.2-phases/`).
- Full per-phase detail: `.planning/milestones/v2.2-ROADMAP.md`.
- Tests: 3888 across client and server (single worker on this host).

## Next Milestone Goals

- Complete UX overhaul to the "UWR Ledger Screens" design on the Nocturne design system (backlog 999.6; import via the claude_design MCP, re-import fresh). Reconcile or supersede parked 999.2 and 999.5.
- Decide LLM reply shape as part of the UX (speaker attribution, narration vs dialogue, highlighting and journals), then apply the Keeper voice: a second-person scene narrator with speaker-attributed segments (first person retracted 2026-10-05).

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
| LLM via client-side proxy (not procedures) | SpacetimeDB procedure HTTP broken locally | Superseded (Phase 39, 2026-09-29) — the spike gave GO: scheduled procedures call Claude directly via `ctx.http.fetch`; the llm-proxy is retired in Phase 42 (backend + WIF no longer needed) |
| Chat-first UI with panel overlays | Narrative experience is core interaction model | ✓ Good — all systems narrative now |
| Wild class generation (no guardrails) | Uniqueness over balance — every character one-of-a-kind | ✓ Good — produces creative results |
| Clean break from fixed data | LLM generates everything; old data becomes schema templates | ✓ Good — 106-case switch eliminated |
| Persistent + evolving regions | World only grows, content shifts over time | ✓ Good — regions persist canonically |
| Sardonic Keeper of Knowledge narrator | Non-negotiable tone across all text | ✓ Good — consistent voice |
| 3 skills per level-up, pick 1 | Unchosen skills vanish — discovery and consequence | ✓ Good — creates tension |
| Kind-based ability dispatch map | Replaces hardcoded switch for unlimited generated abilities | ✓ Good — scales to any ability |
| Real-time combat (not round-based) | Round-based felt sluggish; reverted after experiment | ✓ Good — immediate feedback |
| Platform upgrade before feature work (Phase 38) | SpacetimeDB 2.0.1 and tooling had fallen far behind | ✓ Good — SpacetimeDB 2.10.1, TS 6, Vite 8, Vitest 5, pnpm-only; build + 990 tests green |
| Haiku/gpt-5-mini for fast generation | Sonnet HTTP fails from SpacetimeDB runtime; fast models sufficient | Superseded (v2.2) — see next row |
| Sonnet 5.5 for every LLM call, no Haiku (v2.2, 2026-09-29) | User decision. Haiku 4.5 may retire as early as 2026-10-15; its 4096-token minimum cacheable prefix defeats prompt caching on short prompts; one model means one request builder and one rate-limit pool | — Pending — effort must be set explicitly (`low`) for latency; cost about 2x Haiku per token |
| Phase 39: LLM executor = scheduled procedure (in-flight cap at most 8) | Maincloud `uwr-spike-925iv` gate verdict `go` (strict; floor-adjusted identical): dispatch p95 3.0 ms (limit 250), 0 failures in 164 reliability calls, region JSON Schema compiles; ping p95 ratio 1.01x / 0.98x / 1.03x and tick p95 ratio 0.96x / 1.01x / 0.99x at 8 / 4 / 2 in flight (limit 2.0x); observed maincloud concurrency cap 8 (local runtime caps at 4). Local results are provisional context only (strict incomplete, ping@4 147/200; ping noise from a shared low-end host). `ctx.sender` in a scheduled procedure is the module identity, so jobs must carry the player identity | Confirmed by user 2026-09-29; gate evaluated on maincloud uwr-spike-925iv; Phase 41 proves the real executor on maincloud |
| Streaming stays out of scope for v2.2; decision indicative (Phase 44, 2026-10-05) | Metric: llm_call_log call latency (job end-to-end time beside it). Rule: p95 over 6000 ms across at least 20 ok NPC-chat calls makes streaming a next-milestone candidate (STREAM-01); at or under 6000 ms the out-of-scope decision stands; fewer than 20 samples is indicative. Measured: n=0, p50/p95/p99 none (the paid end-to-end run was deferred by the owner). For reference only, not the decision metric: 7 ok direct-API golden-run NPC replies took 3144 to 5272 ms | — Pending — re-apply the rule when the live end-to-end run is done |
| Shared proxy-based mock DB for tests (v2.1) | One mock implementation instead of per-file copies | ✓ Good — 990 tests on one utility |
| Park phases 33-37 in Backlog (v2.1) | Re-imagining core concepts before more feature work | — Pending — promote with /gsd-review-backlog |
| Skip DB backups before migrations (v2.1) | Greenfield; no production data worth preserving locally | ✓ Good — upgrade went forward cleanly |
| NPC memory arrays capped at 10 | Bounded prompt size for LLM conversations | ✓ Good — keeps costs down |

---

## Constraints

- LLM spend is capped ($10/day global ceiling, per-player daily caps, kill switch)
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
| LLM provider | Claude Sonnet 5.5, called from a scheduled SpacetimeDB procedure (v2.2) |
| Design system | Nocturne (claude_design), Inter, Phosphor icons — adopted in v3.0 |
| Package manager | pnpm 11 (standalone projects: root, spacetimedb/) |
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
*Last updated: 2026-10-05 at v3.0 UX Overhaul milestone start*
