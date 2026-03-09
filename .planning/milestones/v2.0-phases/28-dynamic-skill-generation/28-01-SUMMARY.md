---
phase: 28-dynamic-skill-generation
plan: 01
subsystem: combat
tags: [ability-system, data-driven, dispatch-map, power-budget, mechanical-vocabulary]

# Dependency graph
requires:
  - phase: mechanical-vocabulary
    provides: ABILITY_KINDS, DAMAGE_TYPES, EFFECT_TYPES, TARGET_RULES, RESOURCE_TYPES, SCALING_TYPES
provides:
  - Unified resolveAbility dispatch map for all 15 ability kinds
  - AbilityTemplate table with characterId ownership and vocabulary-aligned columns
  - PendingSkill table for LLM-generated skill staging
  - skill_budget.ts power validation and clamping helpers
  - HotbarSlot and AbilityCooldown using abilityTemplateId (u64) instead of abilityKey (string)
affects: [28-02, 28-03, combat, skill-generation, client-hotbar]

# Tech tracking
tech-stack:
  added: []
  patterns: [kind-based-dispatch, character-owned-abilities, power-budget-clamping]

key-files:
  created:
    - spacetimedb/src/helpers/skill_budget.ts
  modified:
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/helpers/combat.ts
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/reducers/items.ts
    - spacetimedb/src/reducers/corpse.ts
    - spacetimedb/src/index.ts
    - spacetimedb/src/seeding/ensure_items.ts
    - spacetimedb/src/seeding/ensure_world.ts
    - spacetimedb/src/seeding/ensure_content.ts

key-decisions:
  - "Kind-based dispatch map instead of per-ability-name switch enables unlimited generated abilities"
  - "Enemy ability system retains abilityKey strings since enemies use DB-stored abilities with different lifecycle"
  - "Bard song and perk systems left as dead code — removal is cleanup, not blocking"
  - "Removed perk/bard routing from use_ability reducer since all classes are now generated"

patterns-established:
  - "resolveAbility: Single entry point for all ability execution, player and enemy alike"
  - "AbilityActor/AbilityRow: Unified types abstracting player vs enemy for dispatch"
  - "Power budget: BASE_BUDGET per kind with level scaling and min/max multipliers"

requirements-completed: [SKILL-03, SKILL-04]

# Metrics
duration: ~45min
completed: 2026-03-07
---

# Phase 28 Plan 01: Data-Driven Ability Dispatch Summary

**Unified kind-based dispatch map replacing 106-case hardcoded switch, with vocabulary-aligned AbilityTemplate schema and power budget validation**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-03-07
- **Completed:** 2026-03-07
- **Tasks:** 2
- **Files modified:** 26 (including 18 deleted)

## Accomplishments
- Replaced 106-case hardcoded ability switch (~1600 lines) with unified resolveAbility dispatch map handling all 15 ability kinds
- Restructured AbilityTemplate table from class-based (key, className) to character-owned (characterId, kind, targetRule, scaling, value1/value2)
- Created PendingSkill table for LLM-generated skill staging
- Created skill_budget.ts with validateSkillFields, clampToBudget, processGeneratedSkill
- Deleted all 17 hardcoded ability data files and ability_catalog.ts (-4082 lines of dead data)
- Switched all player-facing ability references from abilityKey string to abilityTemplateId u64

## Task Commits

Each task was committed atomically:

1. **Task 1: Restructure ability tables and add PendingSkill + skill_budget helper** - `3d2a9ea` (feat)
2. **Task 2: Replace ability dispatch with unified kind-based map and delete hardcoded abilities** - `11a685c` (feat)

## Files Created/Modified
- `spacetimedb/src/helpers/skill_budget.ts` - Power budget validation and clamping for generated abilities
- `spacetimedb/src/schema/tables.ts` - AbilityTemplate restructured, HotbarSlot/AbilityCooldown/CharacterCast switched to abilityTemplateId, PendingSkill added
- `spacetimedb/src/helpers/combat.ts` - resolveAbility dispatch map, executeAbility/executeEnemyAbility rewired, old 106-case switch removed
- `spacetimedb/src/reducers/items.ts` - use_ability accepts abilityTemplateId, set_hotbar_slot uses abilityTemplateId
- `spacetimedb/src/reducers/combat.ts` - Cast completion uses abilityTemplateId, ENEMY_ABILITIES import removed, enemy AI uses DB lookups
- `spacetimedb/src/reducers/corpse.ts` - Ability lookups by character ownership instead of by_key
- `spacetimedb/src/index.ts` - Removed ability_catalog import, ensureAbilityTemplates/ensureEnemyAbilities from deps
- `spacetimedb/src/seeding/ensure_items.ts` - Removed ensureAbilityTemplates function and 16 class ability imports
- `spacetimedb/src/seeding/ensure_world.ts` - Removed ensureEnemyAbilities function and ENEMY_ABILITIES import
- `spacetimedb/src/seeding/ensure_content.ts` - Removed ensureAbilityTemplates call
- `spacetimedb/src/data/abilities/` - All 17 files deleted
- `spacetimedb/src/data/ability_catalog.ts` - Deleted

## Decisions Made
- Kind-based dispatch map uses a Record of handler functions keyed on ability.kind from mechanical_vocabulary
- Enemy abilities retain abilityKey strings (different lifecycle from player abilities; they are DB-seeded per template)
- Bard song system and perk ability system left as dead code per plan guidance (classes are generated, not hardcoded)
- Removed perk and bard routing from use_ability reducer since these are dead in v2.0
- Corpse.ts resurrect/summon now find abilities by character ownership + name/kind match

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Removed dead perk/bard routing from use_ability reducer**
- **Found during:** Task 2 (updating use_ability reducer)
- **Issue:** The use_ability reducer had special routing for perk_ prefix and bard song keys that relied on hardcoded ability keys. These systems are dead in v2.0 with generated classes.
- **Fix:** Removed the perk and bard song routing blocks entirely. All abilities now go through the unified executeAbilityAction path.
- **Files modified:** spacetimedb/src/reducers/items.ts
- **Committed in:** 11a685c (Task 2 commit)

**2. [Rule 3 - Blocking] Updated corpse.ts to use character-owned ability lookups**
- **Found during:** Task 2 (updating all abilityKey references)
- **Issue:** corpse.ts used ability_template.by_key which no longer exists. Resurrect and corpse summon looked up abilities by hardcoded key strings.
- **Fix:** Changed to look up abilities from character's ability_template.by_character filtered by kind + name match.
- **Files modified:** spacetimedb/src/reducers/corpse.ts
- **Committed in:** 11a685c (Task 2 commit)

**3. [Rule 3 - Blocking] Inline enemy ability timing instead of helper calls**
- **Found during:** Task 2 (updating combat reducer enemy AI)
- **Issue:** enemyAbilityCastMicros/enemyAbilityCooldownMicros helper signatures changed to accept ctx + bigint id, but combat reducer already had the ability row data available.
- **Fix:** Computed cast/cooldown times inline from ability row's castSeconds/cooldownSeconds fields instead of calling helpers.
- **Files modified:** spacetimedb/src/reducers/combat.ts
- **Committed in:** 11a685c (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 missing critical, 2 blocking)
**Impact on plan:** All auto-fixes necessary for correctness and compilation. No scope creep.

## Issues Encountered
- combat.ts was too large (32K+ tokens) to read in one pass; used chunked reads and grep to navigate
- Edit tool couldn't handle removing 1600 lines of old switch code; used Node.js programmatic line removal
- 232 pre-existing TypeScript errors in the codebase (unrelated to ability changes); our changes reduced count to 231

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- resolveAbility dispatch map ready for plan 28-02 (LLM skill generation integration)
- PendingSkill table ready for staging generated abilities
- skill_budget.ts ready to validate and clamp LLM output
- Client hotbar will need updating to use abilityTemplateId (bigint) instead of abilityKey (string)

---
*Phase: 28-dynamic-skill-generation*
*Completed: 2026-03-07*

## Self-Check: PASSED
- skill_budget.ts: FOUND
- combat.ts: FOUND
- tables.ts: FOUND
- abilities/ directory: CONFIRMED DELETED
- ability_catalog.ts: CONFIRMED DELETED
- Commit 3d2a9ea (Task 1): FOUND
- Commit 11a685c (Task 2): FOUND
