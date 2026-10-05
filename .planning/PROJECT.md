# UWR — Project Charter

**Type:** Brownfield expansion
**Created:** 2026-02-11
**Current milestone:** v2.2 LLM — Claude Engine (started 2026-09-29)

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

- [ ] LLM engine migrated from OpenAI to Claude Sonnet 5.5 for every LLM call, with the lowest possible latency for real-time narrative — v2.2
- [ ] SpacetimeDB procedures call Claude directly (retire llm-proxy) if the 2.10 spike proves reliable; otherwise a backend LLM service authenticated via Workload Identity Federation — v2.2
- [ ] No LLM credentials in the browser — v2.2

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
- Streaming LLM responses — typewriter animation achieves same UX. Phase 44 decision (2026-10-05): indicative only, no live NPC-chat latency sample exists (n=0 ok calls in llm_call_log; the paid end-to-end run was deferred), so neither outcome is asserted and nothing is built in v2.2; the rule (at least 20 ok NPC-chat calls, p95 call latency over 6000 ms makes streaming a next-milestone candidate, STREAM-01) is re-applied when the live run happens
- Fallback to legacy creation — clean break, LLM is the only path

## Current State

**Shipped:** v2.1 Project Cleanup (2026-09-29). The v2.0 foundation now has test coverage and no v1.0 legacy code, and runs on SpacetimeDB 2.10.1 with current tooling. Live LLM calls are currently broken: the OpenAI account returns 429 "no credits".

**v2.2 in progress:** Phase 39 (Procedure-to-Claude Spike) is complete as of 2026-09-29.

- SpacetimeDB 2.10 procedures called Claude Sonnet 5.5 reliably on maincloud: 0 failures, dispatch p95 3 ms, no ping or tick degradation with 8 calls in flight.
- Decision, confirmed by the user: Phase 41 builds the scheduled-procedure executor with an in-flight cap of at most 8, and `llm-proxy/` is retired in Phase 42.
- Evidence is in `.planning/phases/39-procedure-to-claude-spike/39-SPIKE-RECORD.md`.

**Phase 40 (Claude Request Layer and Job Seam)** is complete as of 2026-09-30.

- Every future Claude call now goes through one tested layer:
  - one model constant (`claude-sonnet-5-5`) and an 8-route table
  - 5 structured-output JSON Schemas, checked by a subset linter
  - a pure request builder and response classifier
  - the user-approved Keeper Bible as the cached system prefix

  Player text is escaped and wrapped in `<player_input>` tags.
- Private `llm_job` and `llm_call_log` tables, with a dedupe-aware `enqueueLlmJob` and a `my_llm_jobs` own-jobs view that shows only coarse error buckets.
- `submit_llm_result`'s apply logic now lives in `helpers/llm_apply.ts`, keyed on the stored player. Renown rank-ups enqueue a valid job.
- An offline mock procedure context makes every LLM path testable without network. 1454 tests pass.
- Live call sites still use the legacy `llm_task` path until Phase 41 moves each domain over.

**Phase 41 (Executor and Domain Cutover)** is code-complete as of 2026-09-30. Verification is human_needed, because the user deferred the live proofs.

- Every LLM action runs on the server through the scheduled procedure `llm_run`. That covers creation, world gen, skills, NPC chat, the combat victory/defeat outro and renown.
  - Each action is enqueued inside its own reducer's transaction. Enqueueing reserves budget and writes a dispatch row.
  - The procedure claims the job under a global in-flight cap of 4, then calls Claude with no transaction open.
  - It persists the result with retry by class and settles the cost.
  - Apply runs from the stored text, and a failure produces an in-voice Keeper line.
- `llm_sweep` runs every 30 s. It expires stuck jobs, refunds reservations and releases stranded generation locks.
- Budget: $1 and 200 calls per player per day, plus a $2 phase ledger. Phase 43 replaces the ledger with a $10/day global ceiling and a kill switch.
- Admin controls: `set_api_key` (set via `scripts/llm/set-key.mjs`, with the key sent only in the HTTP body), `llm_smoke_test` and the `admin_llm_status` view. Runbook: `docs/runbooks/llm-key.md`.
- The `prepare_*` reducers and their client calls are deleted. The browser no longer takes part in any LLM call; Phase 42 removes the idle `useLlmProxy`, `llm_task` and `submit_llm_result`.
- In-game pronoun rule (user decision, 2026-09-30):
  - The Keeper is "he".
  - Every NPC has a stored gender, male or female, and is "he" or "she".
  - The player's own character is always "you".
  - Beasts may be "it".
- The code review ran 3 rounds and 15 findings were fixed. One Phase 36 defect is recorded as a todo: renown passive perks have no effect.
- Tests: server 2161, client 2245.
- The local live proof and the maincloud checklist are deferred to the user, and Phase 44 picks them up.

**Phase 42 (Client Cutover and Legacy Removal)** is code-complete as of 2026-09-30. Verification is human_needed (browser, visual and live checks deferred by the user).

- The client-trusted `submit_llm_result` and `validate_llm_request` reducers are gone, so no client can submit or forge LLM output.
- The browser holds no LLM credential or plumbing: `llm-proxy/`, `useLlmProxy`, `useLlm` and the stale `client/` bindings are deleted, and `main.ts` removes any stored `llm_proxy_secret` on load.
- `pnpm build` now ends with `scripts/check-bundle.mjs`, which fails the build if `dist/` contains a proxy secret, proxy URL, proxy env name or key-shaped string (one `removeItem` of the retired key name is allowed).
- The narrative console reads only the player's own `my_llm_jobs` view through `useLlmStatus`. Each route shows its Keeper line from `data/llm_indicator_lines.ts` (combat narration and smoke are silent; admin smoke jobs are filtered out), scoped per console, in an always-mounted `role="status"` region. Only creation and world gen lock input.
- The `llm_task`, `llm_request`, `llm_budget` and `llm_cleanup_tick` tables were dropped locally with two `--break-clients` publishes and an admin purge in between, with no clear; the stored key survived (length 108).
- The user cleanup and maincloud two-publish steps are in `42-USER-CHECKLIST.md` (user-run only). The old proxy secret is treated as burned.
- Tests: 2411 across client and server. The code review fixed 4 warnings; per-character indicator binding is deferred (needs a schema change), and `llm_job` retention is a todo.

**Phase 43 (Latency Tuning, Staged Generation and Budget)** is code-complete as of 2026-10-01. Verification is human_needed; the user deferred the live checks.

- Spend controls: a global daily ceiling ($10 by default, UTC day, counting reserved plus spent) and an admin kill switch, checked at enqueue and again at claim. The player sees one in-voice line, "The Keeper is resting. Return later." The $2 phase cap is retired.
- Admin console: `/llm stats` (per-route calls, cost, p50/p95 latency and errors), `/llm on|off`, and `/llm ceiling <dollars>`. Reducers `llm_set_enabled` and `llm_set_daily_ceiling`; the admin view shows the new fields.
- Staged world gen: `world_gen_start` reveals the region, start location and first NPC (about 10 s p50, down from 23.5 s for the whole region), then the `world_gen` fill completes it. A failed fill leaves the region playable, and explore retries it.
- Staged class reveal: `creation_class_reveal` shows the identity and first ability (p50 4.7 s), then the `creation_class` fill finishes it. LAT-06 parallel archetypes were measured and left out.
- Keeper progress lines rotate every 5 s from server-data pools. Stage-2 steps never lock input.
- Measured tuning: a user-approved sweep (108 calls, $0.92) picked low effort for all routes. `max_tokens` comes from p99, with 512 tokens of headroom on routes that never auto-retry. Prompt caching is proven on all 9 routes. The values trace to `spacetimedb/src/data/llm_measurements.json`.
- Fixes: combat outro narration stays in the second person and strips leaked self-corrections; the `time` command no longer panics.
- Tests: 3148. The code review fixed 9 warnings (14 info remain).

## Current Milestone: v2.2 LLM — Claude Engine

**Goal:** Replace OpenAI with Claude as the engine behind all narrative generation, with the lowest possible response latency for real-time storytelling.

**Target features:**
- Model swap: Claude Sonnet 5.5 (`claude-sonnet-5-5`) replaces both gpt-5.4 and gpt-5-mini for every LLM call (character creation, world gen, skill gen, NPC conversation, combat narration, renown). No Haiku. Model ID centralized in one constants module
- Structured outputs mapped to Claude (`output_config.format`); token usage, pricing and per-player budget recalibrated for Claude
- Architecture, direct first with fallback: spike SpacetimeDB 2.10 procedures calling Claude via `ctx.http.fetch`. If reliable and fast, move LLM calls into procedures and retire `llm-proxy/`, the client polling composable and the localStorage proxy secret. If still buggy, keep a backend LLM service authenticated to Anthropic via Workload Identity Federation
- Latency levers researched and applied: prompt caching, effort settings, hop count; streaming recorded as indicative only in Phase 44 (no live NPC-chat sample, Out of Scope stands for v2.2)
- No LLM credentials in browser storage
- Live end-to-end verification with a real Claude call

**Key context:** A previous attempt at procedure HTTP (2.0.1) failed, likely due to its 500 ms HTTP timeout (2.10 defaults to 30 s, max 180 s). Loopback/private IPs are blocked from procedures. WIF needs an OIDC token that a WASM procedure likely cannot mint, so the direct path probably means an API key held server-side in SpacetimeDB.

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
| LLM provider | OpenAI (gpt-5.4, gpt-5-mini) via client proxy; migrating to Claude Sonnet 5.5 in v2.2 |
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
*Last updated: 2026-10-01 after Phase 43*
