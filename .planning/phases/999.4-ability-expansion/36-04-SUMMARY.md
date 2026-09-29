---
phase: 36-ability-expansion
plan: 04
subsystem: renown-perk-system
tags: [renown, llm-generation, ability-template, tdd, pending-perks]
dependency_graph:
  requires: [36-01]
  provides: [PendingRenownPerk-table, choose_renown_perk-reducer, renown_perk_gen-domain]
  affects: [renown system, ability_template, submit_llm_result dispatch]
tech_stack:
  added: []
  patterns: [TDD-red-green, pure-logic-extraction, LLM-generation-with-static-fallback]
key_files:
  created:
    - spacetimedb/src/reducers/renown.test.ts
    - spacetimedb/src/reducers/renown_perk.ts
  modified:
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/reducers/renown.ts
    - spacetimedb/src/helpers/renown.ts
    - spacetimedb/src/data/llm_prompts.ts
    - spacetimedb/src/index.ts
decisions:
  - "Extracted chooseRenownPerkLogic to renown_perk.ts for testability (same pattern as skill_gen helpers)"
  - "Active renown perks (non-empty kind) go to ability_template with source='Renown'"
  - "Passive renown perks (perkEffectJson set, kind empty) go to renown_perk table to preserve existing getPerkBonusByField compatibility"
  - "Static RENOWN_PERK_POOLS fallback used when LLM task insertion fails or LLM returns <3 valid perks"
  - "abilityKey format: renown_rank{rank}_{sanitized_name} for stable identification"
metrics:
  duration: ~6 minutes
  completed_date: 2026-03-10
  tasks_completed: 2
  files_changed: 7
---

# Phase 36 Plan 04: Renown Perk LLM Generation Summary

**One-liner:** Renown rank-up now triggers LLM perk generation via renown_perk_gen domain, with PendingRenownPerk table, choose_renown_perk reducer inserting ability_template(source='Renown'), and static fallback.

## What Was Built

### Task 1: PendingRenownPerk table and choose_renown_perk reducer (TDD)

**RED phase:** Created `renown.test.ts` with 5 failing tests covering:
- Active perk (non-empty kind) creates ability_template with source='Renown'
- Cleanup of ALL pending_renown_perk rows for character after choice
- Passive perk (perkEffectJson set, kind empty) goes to renown_perk table
- Rejection when no pending rows exist for character
- Rejection when perkId not found in pending rows

**GREEN phase:** Implementation:
1. `tables.ts` — Added `PendingRenownPerk` table mirroring `PendingSkill` structure plus renown-specific fields: `rank`, `perkEffectJson` (JSON passive bonus), `perkDomain` ('combat'|'crafting'|'social'). Registered in schema export.
2. `renown_perk.ts` — New module with `chooseRenownPerkLogic(ctx, {characterId, perkId})` pure function:
   - Active perk (kind != ''): inserts `ability_template` with `source='Renown'`, `abilityKey='renown_rank{rank}_{sanitized_name}'`
   - Passive perk (kind = ''): inserts `renown_perk` with perkKey for `getPerkBonusByField` compatibility
   - Deletes ALL pending_renown_perk rows for character after choice
3. `renown.ts` — Added `choose_renown_perk` reducer wrapping `chooseRenownPerkLogic` with auth checks.

All 5 tests pass.

### Task 2: LLM prompt, rank-up trigger, and submit_llm_result handler

1. `llm_prompts.ts` — Added two new functions:
   - `buildRenownPerkSystemPrompt()` — Sardonic Keeper voice with renown-specific constraints: favor utility/social/economic effects, at least 1 passive per batch, combat perks should feel reputation-earned not training-earned, no duplicates with existing perks.
   - `buildRenownPerkUserPrompt(characterName, className, raceName, rank, existingPerks)` — Character context with existing perk list for diversity.
   - `RENOWN_PERK_GENERATION_SCHEMA` — JSON schema for perk options.

2. `helpers/renown.ts` — Updated `awardRenown`:
   - On rank-up (rank >= 2), calls `triggerRenownPerkGeneration(ctx, character, rank)`
   - `triggerRenownPerkGeneration` inserts `LlmTask` with `domain='renown_perk_gen'`, contextJson includes characterId, rank, className, raceName
   - `try/catch` fallback: if LLM task insertion fails, calls `insertStaticRenownPerkOptions` to insert 3 RENOWN_PERK_POOLS entries directly as pending_renown_perk rows

3. `index.ts` — Added `renown_perk_gen` domain handler in `submit_llm_result`:
   - Parses LLM response JSON with `extractJson`
   - Validates perks array (name, description, kind or perkEffectJson)
   - On <3 valid perks: falls back to static RENOWN_PERK_POOLS, notifies player with Keeper sardonic message
   - On success: inserts up to 3 `pending_renown_perk` rows, increments LLM budget, presents perk choices to player with Keeper narration
   - Imported `RENOWN_PERK_POOLS` from `renown_data.ts` and `PendingRenownPerk` from `schema/tables`

## Deviations from Plan

None - plan executed exactly as written.

## Commits

- `2393688` — test(36-04): add failing tests for choose_renown_perk logic
- `f3cb56e` — feat(36-04): add PendingRenownPerk table and choose_renown_perk reducer
- `13d6f53` — feat(36-04): LLM perk generation, rank-up trigger, and submit_llm_result handler

## Self-Check: PASSED
