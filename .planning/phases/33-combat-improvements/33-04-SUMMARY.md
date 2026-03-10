---
phase: 33-combat-improvements
plan: 04
subsystem: character-creation
tags: [llm, character-creation, ability-schema, spacetimedb]

# Dependency graph
requires:
  - phase: 33-combat-improvements
    provides: combat ability system with kind-based dispatch
provides:
  - CREATION_ABILITY_SCHEMA aligned with SKILL_GENERATION_SCHEMA using "kind" field
  - creation.ts reads damageType and kind correctly from LLM output
  - Backward-compatible fallback for cached creation states using old "effect" field
affects: [character-creation, ability-system, combat-engine]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Schema field alignment: creation and skill generation schemas both use 'kind' as the ability type discriminator"
    - "Backward compat fallback chain: chosen.kind || chosen.effect || chosen.type || 'damage'"

key-files:
  created:
    - spacetimedb/src/data/llm_prompts.test.ts
  modified:
    - spacetimedb/src/data/llm_prompts.ts
    - spacetimedb/src/reducers/creation.ts

key-decisions:
  - "CREATION_ABILITY_SCHEMA now uses 'kind' field matching SKILL_GENERATION_SCHEMA; old 'baseDamage'/'manaCost' replaced by 'value1'/'resourceCost'"
  - "Backward compat via chosen.effect fallback in kind resolution -- supports cached creation states from old schema"
  - "creation.ts also reads chosen.damageType with 'physical' default, and falls back to chosen.baseDamage for value1"

patterns-established:
  - "Schema consistency: LLM output field names must match the code that reads them -- validate via tests"

requirements-completed: [COMB-01, COMB-02, COMB-03, COMB-04]

# Metrics
duration: 3min
completed: 2026-03-10
---

# Phase 33 Plan 04: CREATION_ABILITY_SCHEMA Field Alignment Summary

**Fixed schema field mismatch causing ALL character creation abilities to be stored as kind:'damage' -- DoTs, HoTs, buffs, and debuffs now get their correct kind from LLM output**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-10T02:37:45Z
- **Completed:** 2026-03-10T02:40:15Z
- **Tasks:** 1 (TDD)
- **Files modified:** 3 (2 source, 1 new test file)

## Accomplishments
- Updated CREATION_ABILITY_SCHEMA to use "kind" field (was "effect"), matching SKILL_GENERATION_SCHEMA exactly
- Expanded kind enum to include dot, heal, hot, buff, debuff, stun (was: none|dot|heal|buff|debuff|stun)
- Added all missing fields: targetRule, resourceType, resourceCost, scaling, value1, effectType, effectMagnitude (replaces baseDamage/manaCost)
- Updated creation.ts ability insert to read chosen.damageType with 'physical' default
- Added backward-compatible kind fallback chain: `chosen.kind || chosen.effect || chosen.type || 'damage'`
- Added 15 unit tests covering schema field alignment and kind/damageType extraction

## Task Commits

Each task was committed atomically:

1. **Task 1: Align CREATION_ABILITY_SCHEMA with SKILL_GENERATION_SCHEMA field names** - `d5c73c5` (fix + test)

## Files Created/Modified
- `spacetimedb/src/data/llm_prompts.ts` - CREATION_ABILITY_SCHEMA updated: "effect" -> "kind", expanded enum, added missing fields, removed baseDamage/manaCost
- `spacetimedb/src/reducers/creation.ts` - Added chosen.effect fallback, chosen.damageType read, backward compat for baseDamage/manaCost field names
- `spacetimedb/src/data/llm_prompts.test.ts` - 15 tests: schema field validation, kind extraction logic, damageType preservation, backward compat

## Decisions Made
- Kept backward compat fallback (chosen.effect) for any creation states already stored in DB with old LLM output format
- Also added backward compat for old field names baseDamage -> value1, manaCost -> resourceCost in creation.ts
- Did NOT change SKILL_GENERATION_SCHEMA -- it was already correct

## Deviations from Plan

None - plan executed exactly as written. The backward compat fallbacks for baseDamage/manaCost were a minor addition beyond the plan spec but clearly correct.

## Issues Encountered
None.

## Next Phase Readiness
- Creation abilities will now correctly store their kind (dot, heal, hot, buff, debuff) from LLM output
- Characters created after this fix will have correctly typed abilities that participate in the full combat effect system
- DoTs will tick, HoTs will regen, buffs/debuffs will apply -- UAT gaps 1-4 should be resolved for new characters

---
*Phase: 33-combat-improvements*
*Completed: 2026-03-10*
