---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: milestone
status: executing
stopped_at: Completed 28-01-PLAN.md
last_updated: "2026-03-07T20:00:00.000Z"
last_activity: 2026-03-07 — Completed 28-01 Data-Driven Ability Dispatch
progress:
  total_phases: 7
  completed_phases: 3
  total_plans: 12
  completed_plans: 11
  percent: 92
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-06)

**Core value:** A world that writes itself around its players -- every character is unique, every region is discovered, and the narrative responds to what players actually do.
**Current focus:** Phase 28 in progress — Dynamic Skill Generation

## Current Position

Phase: 28 of 30 (Dynamic Skill Generation)
Plan: 1 of 3 complete (Data-Driven Ability Dispatch)
Status: In progress
Last activity: 2026-03-07 — Completed 28-01 Data-Driven Ability Dispatch

Progress: [█████████░] 92%

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

### Pending Todos

None yet.

### Blockers/Concerns

- SpacetimeDB procedures are beta -- load test early before building on them
- Prompt caching minimum thresholds (1024 tokens Sonnet, 4096 tokens Haiku) must be verified
- **NO PUSHES TO MASTER** -- production auto-deploys from master; all v2.0 work stays local until user approves
- **NO PUSHES TO MAINCLOUD** -- local SpacetimeDB only until user says otherwise

## Session Continuity

Last session: 2026-03-07T20:00:00.000Z
Stopped at: Completed 28-01-PLAN.md
Resume file: .planning/phases/28-dynamic-skill-generation/28-01-SUMMARY.md
