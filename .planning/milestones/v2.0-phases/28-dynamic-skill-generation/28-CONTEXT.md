# Phase 28: Dynamic Skill Generation - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the 106-case hardcoded ability switch with a unified kind-based dispatch map, restructure the ability schema to match mechanical_vocabulary.ts, and implement LLM-generated skill offerings at level-up. Players choose from 3 unique skills that are gone forever if not picked.

</domain>

<decisions>
## Implementation Decisions

### Ability Dispatch Migration
- Delete all 106 hardcoded abilities and the entire switch statement in combat.ts
- Delete all 17 ability data files in spacetimedb/src/data/abilities/
- Delete ability_catalog.ts and all seeding/ensure_* files for abilities
- Implement a `Record<AbilityKind, handler>` dispatch map that handles all ability resolution
- Unify player and enemy ability dispatch into the same dispatch map — one code path for all ability resolution regardless of source
- No migration needed — v2.0 starts with clear-database, clean break from v1.0

### Skill Generation Constraints
- Formula-based power budget: power = base + (level * scaling), each kind has a budget range
- Auto-clamp on validation failure: server adjusts values to fit budget (reduce damage, increase cooldown) rather than re-generating or rejecting
- Core 6 fields mandatory on every generated skill: kind, targetRule, resourceType, resourceCost, cooldownSeconds, scaling
- Remaining fields (value1, effectType, effectMagnitude, effectDuration, damageType, etc.) are optional and depend on the kind
- Biased diversity: prompt LLM to offer at least 2 different kinds among the 3 choices, but all must fit the character's class/race identity
- Every generated skill must pass schema validation against mechanical_vocabulary.ts enums before reaching the database

### Level-up Skill Presentation
- Inline narrative in the console: The System describes 3 skills with sardonic commentary
- Bracketed [skill names] are clickable keywords (same pattern as character creation)
- Narrative description + compact stat line (damage, cost, cooldown, kind) for informed choices
- Unchosen skills are deleted permanently — gone forever, may never be offered again
- Skill choice persists until chosen — no timeout, subtle HUD reminder
- Follows the same LLM proxy flow: server writes LlmTask, client proxies to LLM, submits result back

### Ability Table Schema
- Restructure ability_template to use characterId ownership (replace className + key with characterId index)
- Align columns to mechanical_vocabulary: kind, targetRule, resourceType, resourceCost, scaling, value1, value2, effectType, effectMagnitude, effectDuration, damageType, castSeconds, cooldownSeconds
- Unified schema for player and enemy abilities — same table, same columns, enemyId or characterId determines source
- New pending_skill table for the 3 offered skills at level-up. On choice: move picked skill to ability_template, delete the other 2
- Remove key, className, dotPowerSplit, debuffType, debuffMagnitude, debuffDuration, aoeTargets columns (replaced by generic vocabulary-aligned fields)

### Claude's Discretion
- Exact dispatch map function signatures and helper decomposition
- Power budget formula constants and per-level scaling curves
- LLM prompt structure for skill generation
- HUD indicator design for pending skill choice
- Error handling for edge cases (LLM timeout during level-up, etc.)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `mechanical_vocabulary.ts`: Complete enum definitions for all ability kinds, target rules, effect types, damage types, scaling types — the dispatch map keys
- Enemy ability dispatch (`combat.ts:2077+`): Working kind-based if/else chain for enemy abilities — reference implementation for the unified dispatch map
- `useLlmProxy.ts`: Client-side LLM proxy pattern (watch LlmTask table, call proxy, submit result) — reuse for skill generation
- Character creation flow (`creation.ts`): State machine pattern for multi-step LLM interactions — similar pattern needed for level-up skill choice
- `useCharacterCreation.ts`: Client-side state machine watcher for GENERATING steps — pattern for skill generation loading states

### Established Patterns
- LLM proxy flow: server reducer writes LlmTask row -> client watches for pending -> calls proxy -> submits result via reducer
- State machine steps: server stores step enum, client watches and triggers LLM when step reaches GENERATING_*
- Clickable keywords: `[bracketed text]` in narrative messages becomes clickable via `window.clickNpcKeyword()`
- JSON response parsing: `response_format: json_object` + brace extraction fallback (hardened in Phase 26)

### Integration Points
- `combat.ts:885` — The 106-case switch to replace (line 885, function `runAbility`)
- `combat.ts:2077+` — Enemy dispatch to unify into shared dispatch map
- `schema/tables.ts:593` — AbilityTemplate table definition to restructure
- `reducers/creation.ts:427` — Already inserts generated abilities with characterId pattern
- `hotbar_slot` table — Links characterId + abilityTemplateId, needs to work with new schema
- `ability_cooldown` table — Tracks cooldowns by characterId, stays as-is
- Level-up logic — wherever XP/level-up is handled, needs to trigger skill generation flow

</code_context>

<specifics>
## Specific Ideas

- The System's sardonic voice should shine during skill offerings: mock the player's choices, express disappointment or surprise at their picks
- Skills should feel genuinely unique — not "Fireball but ice" — the LLM should create abilities that reflect the character's specific journey
- The "gone forever" mechanic is a feature, not a limitation — lean into the FOMO, have The System remind players that rejected skills vanish

</specifics>

<deferred>
## Deferred Ideas

- Skill respec/unlearn mechanic — future phase
- Skill synergy system (combo abilities) — future phase
- Skill evolution (existing skills grow/transform) — future phase

</deferred>

---

*Phase: 28-dynamic-skill-generation*
*Context gathered: 2026-03-07*
