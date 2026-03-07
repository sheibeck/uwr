---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: milestone
status: completed
stopped_at: Phase 29 context gathered
last_updated: "2026-03-07T20:19:02.399Z"
last_activity: "2026-03-07 - Completed quick task 333: Fix stuck Entering The Realm screen"
progress:
  total_phases: 7
  completed_phases: 4
  total_plans: 15
  completed_plans: 14
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-06)

**Core value:** A world that writes itself around its players -- every character is unique, every region is discovered, and the narrative responds to what players actually do.
**Current focus:** Phase 29 in progress — NPC & Quest Generation

## Current Position

Phase: 29 of 30 (NPC & Quest Generation)
Plan: 3 of 3 complete (Client NPC Conversation Wiring)
Status: Completed
Last activity: 2026-03-07 - Completed 29-03: Client NPC Conversation Wiring

Progress: [██████████] 100%

## Previous Milestone (v1.0)

See MILESTONES.md for full v1.0 delivery summary. Phases 1-23 complete (shipped 2026-02-25).

## Performance Metrics

**Velocity:**
- Total plans completed: 3 (v2.0)
- Average duration: 4min
- Total execution time: 13min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 24-llm-pipeline-foundation | 3/3 | 13min | 4min |

*Updated after each plan completion*
| Phase 25 P01 | 4min | 2 tasks | 3 files |
| Phase 25 P02 | 5min | 2 tasks | 6 files |
| Phase 25 P03 | 5min | 2 tasks | 7 files |
| Phase 26 P01 | 4min | 2 tasks | 6 files |
| Phase 26 P02 | 3min | 2 tasks | 3 files |
| Phase 26 P03 | 47min | 2 tasks | 18 files |
| Phase 27 P01 | 3min | 2 tasks | 4 files |
| Phase 27 P02 | 4min | 2 tasks | 4 files |
| Phase 28 P01 | 45min | 2 tasks | 26 files |
| Phase 28 P02 | 5min | 2 tasks | 5 files |
| Phase 28 P03 | 12min | 2 tasks | 16 files |
| Phase 29 P01 | 3min | 2 tasks | 4 files |
| Phase 29 P02 | 7min | 2 tasks | 6 files |
| Phase 29 P03 | 4min | 1 tasks | 11 files |

## Accumulated Context

### Decisions

- Clean break from legacy data -- no migration, no parallel systems, no `source` field on tables
- Client-triggered procedures (reducer validates, client calls procedure for LLM)
- Schema-constrained generation for mechanical validity
- Canonical world facts in structured tables for coherence
- Sardonic System narrator throughout all generated content
- Haiku 4.5 for real-time generation, Sonnet for high-stakes one-time generation
- LLM config uses singleton table pattern (id=1n) for API key storage
- Budget tracks UTC date string for simple midnight reset comparison
- Used registerLlmReducers(deps) pattern for V2 auto-collection compatibility
- Procedure uses three-phase pattern: withTx(read) -> http.fetch() -> withTx(write) to avoid runtime panics
- Added procedure to V2 export auto-collection monkey-patch for SpacetimeDB v2 compatibility
- LlmCleanupTick runs every 5 minutes to sweep error and completed requests older than 5 minutes
- useLlm composable uses direct table subscription rather than event-based fallback
- [Phase 25]: NL travel uses minimal inline movement (no stamina/cooldown/group-pull) for MVP simplicity
- [Phase 25]: Attack/ability/flee intents guide to UI rather than duplicating complex combat logic
- [Phase 25]: NarrativeConsole at z-index 1 as base layer, panels float above
- [Phase 25]: Travel panel auto-opens on combat start for CombatPanel access
- [Phase 25]: NarrativeConsole manages animation state internally rather than via props from App.vue
- [Phase 26]: CharacterCreationState uses playerId (identity) not userId for pre-registration creation flow
- [Phase 26]: EventCreation table with event: true for identity-based pre-character messaging
- [Phase 26]: GENERATING_RACE and GENERATING_CLASS are gate steps for Plan 02 LLM procedure calls
- [Phase 26]: previousStep field on creation state enables go-back decline recovery
- [Phase 26]: Creation LLM procedure bypasses generic pipeline (no characterId), reads API key from llm_config
- [Phase 26]: Haiku for race interpretation, Sonnet for class generation (model tier selection)
- [Phase 26]: Error cases revert creation step to allow retry rather than leaving broken state
- [Phase 26]: Replaced CharacterPanel entirely with NarrativeConsole creation mode
- [Phase 26]: LLM procedure triggered via direct watch on raw state array (not computed chain)
- [Phase 26]: Hardened LLM JSON parsing with response_format json_object and brace extraction fallback
- [Phase 26]: Haiku used for both race and class generation (sufficient quality, faster)
- [Phase 27]: Uncharted locations at Greywind Pass and Abyssal Vault as world edge boundary triggers
- [Phase 27]: Timestamp-based pseudorandom for template selection and danger variance (reducer determinism)
- [Phase 27]: terrainType 'uncharted' marks boundary locations for procedural generation triggers
- [Phase 27]: Haiku model for world generation (Sonnet HTTP fails from SpacetimeDB runtime)
- [Phase 27]: Top-level try/catch on generation procedure reverts WorldGenState to ERROR for retry safety
- [Phase 27]: writeGeneratedRegion creates enemies with EnemyRoleTemplates and EnemyAbilities (required for spawn/combat)
- [Phase 28]: Kind-based dispatch map replaces 106-case hardcoded switch for unlimited generated abilities
- [Phase 28]: Enemy ability system retains abilityKey strings (different lifecycle from player abilities)
- [Phase 28]: Bard/perk routing removed from use_ability reducer (dead code in v2.0 generated classes)
- [Phase 28]: gpt-5-mini for skill generation (fast, sufficient quality for ability stats)
- [Phase 28]: Client triggers prepare_skill_gen after level-up (keeps combat transaction clean)
- [Phase 28]: Unchosen PendingSkill rows permanently deleted -- no second chances
- [Phase 28]: Skill names use [brackets] in narrative for keyword click system
- [Phase 28]: All hotbar/cooldown/cast tracking uses bigint abilityTemplateId instead of string abilityKey
- [Phase 28]: Item-on-hotbar removed (incompatible with abilityTemplateId u64 schema)
- [Phase 28]: Kind-based combat state checks replace old combatState field on client
- [Phase 29]: MAX_ACTIVE_QUESTS = 4 per player (balances quest variety vs completion pressure)
- [Phase 29]: NPC memory arrays capped at 10 entries (topics, secrets, etc.) for bounded prompt size
- [Phase 29]: Default personality fallback for NPCs with empty personalityJson ensures graceful degradation
- [Phase 29]: Affinity tier mapping uses NPC_AFFINITY_THRESHOLDS bigint values from mechanical_vocabulary
- [Phase 29]: gpt-5-mini for NPC conversations (fast turnaround for interactive dialogue)
- [Phase 29]: Affinity change from LLM clamped to -5..+5 range per conversation
- [Phase 29]: Item reward stats use budget system: level*2+5 base, scaled by quest difficulty
- [Phase 29]: Conversation cooldown reduced to 30s (LLM budget is real rate limiter)
- [Phase 29]: Quest completion +10 affinity, abandonment -3 affinity
- [Phase 29]: Intent handler shows NPC greeting only; full LLM conversation via talk_to_npc reducer from client
- [Phase 29]: npc_memory is private table (server-only); client does not subscribe
- [Phase 29]: Old dialogue tree (getAvailableDialogueOptions) deprecated in favor of LLM conversation

### Pending Todos

None yet.

### Blockers/Concerns

- SpacetimeDB procedures are beta -- load test early before building on them
- Prompt caching minimum thresholds (1024 tokens Sonnet, 4096 tokens Haiku) must be verified
- **NO PUSHES TO MASTER** -- production auto-deploys from master; all v2.0 work stays local until user approves
- **NO PUSHES TO MAINCLOUD** -- local SpacetimeDB only until user says otherwise

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 333 | Fix stuck Entering The Realm screen | 2026-03-07 | operational | [333-fix-stuck-entering-the-realm-screen](./quick/333-fix-stuck-entering-the-realm-screen/) |

## Session Continuity

Last session: 2026-03-07T21:01:00Z
Stopped at: Completed 29-03-PLAN.md (checkpoint: human-verify pending)
