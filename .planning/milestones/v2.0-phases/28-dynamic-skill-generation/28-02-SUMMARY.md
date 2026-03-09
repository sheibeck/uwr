---
phase: 28-dynamic-skill-generation
plan: 02
subsystem: combat
tags: [skill-generation, llm-pipeline, level-up, pending-skill, ability-template, narrator]

# Dependency graph
requires:
  - phase: 28-01
    provides: AbilityTemplate table, PendingSkill table, skill_budget.ts (processGeneratedSkill), resolveAbility dispatch map
  - phase: 24-llm-pipeline-foundation
    provides: LlmTask table, submit_llm_result reducer, incrementBudget/checkBudget helpers, client LLM proxy flow
provides:
  - SKILL_GENERATION_SCHEMA JSON schema for LLM skill generation
  - buildSkillGenSystemPrompt() and buildSkillGenUserPrompt() prompt builders
  - parseSkillGenResult() with JSON extraction, validation, and budget clamping
  - insertPendingSkills() helper for PendingSkill row management
  - prepare_skill_gen reducer (LlmTask creation for skill_gen domain)
  - skill_gen domain handler in submit_llm_result (parse, validate, present)
  - choose_skill reducer (move to ability_template, auto-hotbar, delete unchosen)
  - Level-up narrative hints in combat and quest turn-in paths
affects: [28-03, client-skill-ui, client-hotbar]

# Tech tracking
tech-stack:
  added: []
  patterns: [skill-gen-pipeline, llm-result-validation-clamping, bracketed-skill-names]

key-files:
  created:
    - spacetimedb/src/helpers/skill_gen.ts
  modified:
    - spacetimedb/src/data/llm_prompts.ts
    - spacetimedb/src/index.ts
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/reducers/commands.ts

key-decisions:
  - "gpt-5-mini model for skill generation (fast, sufficient quality for ability stats)"
  - "Skill names use [brackets] in narrative for existing keyword click system"
  - "Client triggers prepare_skill_gen after level-up (keeps combat transaction clean)"
  - "Unchosen skills permanently deleted -- gone forever, no second chances"
  - "Auto-assign to first empty hotbar slot (0-5), overwrite slot 0 if all full"

patterns-established:
  - "Skill gen pipeline: level-up hint -> client calls prepare_skill_gen -> LlmTask -> proxy -> submit_llm_result -> PendingSkill rows -> choose_skill -> ability_template"
  - "parseSkillGenResult: extractJson + processGeneratedSkill per skill + error aggregation"

requirements-completed: [SKILL-01, SKILL-02, SKILL-04]

# Metrics
duration: 5min
completed: 2026-03-07
---

# Phase 28 Plan 02: Skill Generation Pipeline Summary

**Server-side LLM skill generation pipeline with prompt builders, result parsing/validation/clamping, level-up triggers, and choose_skill reducer**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-07T19:10:56Z
- **Completed:** 2026-03-07T19:16:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Full server-side skill generation pipeline from level-up to ability acquisition
- SKILL_GENERATION_SCHEMA with all valid enum values from mechanical_vocabulary
- parseSkillGenResult with JSON extraction, validation via skill_budget, and power clamping
- prepare_skill_gen reducer with ownership validation, budget check, concurrency guard, and diversity context
- skill_gen domain handler in submit_llm_result with sardonic System narrator presentation
- choose_skill reducer that permanently deletes unchosen skills and auto-assigns hotbar slot
- Level-up narrative hints in combat victory, combat defeat, quest turn-in, and delivery completion paths

## Task Commits

Each task was committed atomically:

1. **Task 1: Add skill generation prompts and parsing helper** - `3c24dd1` (feat)
2. **Task 2: Wire level-up trigger, submit_llm_result handler, and choose_skill reducer** - `a43a36a` (feat)

## Files Created/Modified
- `spacetimedb/src/helpers/skill_gen.ts` - LLM result parsing, validation, PendingSkill insertion
- `spacetimedb/src/data/llm_prompts.ts` - SKILL_GENERATION_SCHEMA, buildSkillGenSystemPrompt, buildSkillGenUserPrompt
- `spacetimedb/src/index.ts` - prepare_skill_gen reducer, skill_gen domain in submit_llm_result, choose_skill reducer
- `spacetimedb/src/reducers/combat.ts` - Level-up narrative hints (victory + defeat XP paths)
- `spacetimedb/src/reducers/commands.ts` - Level-up narrative hints (quest turn-in + delivery)

## Decisions Made
- Used gpt-5-mini for skill generation (fast, cost-effective for ability stats)
- Skill names rendered with [brackets] to leverage existing keyword click system in NarrativeConsole
- Client triggers prepare_skill_gen after seeing level-up event (keeps combat reducer transaction clean)
- Unchosen PendingSkill rows are permanently deleted when player picks one -- no backsies
- Auto-assigns chosen skill to first available hotbar slot (0-5); overwrites slot 0 with warning if all full
- Kept buildSkillGenPrompt as legacy alias for backward compatibility

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Full server pipeline ready for Plan 03 (client integration)
- Client needs to: watch for level-up events, call prepare_skill_gen, handle PendingSkill table, call choose_skill
- Existing useLlmProxy composable handles the LlmTask -> proxy -> submit_llm_result flow automatically

---
*Phase: 28-dynamic-skill-generation*
*Completed: 2026-03-07*

## Self-Check: PASSED
- skill_gen.ts: FOUND
- Commit 3c24dd1 (Task 1): FOUND
- Commit a43a36a (Task 2): FOUND
- skill_gen domain in submit_llm_result: FOUND
- prepare_skill_gen reducer: FOUND
- choose_skill reducer: FOUND
- SKILL_GENERATION_SCHEMA: FOUND
- Level-up hints in combat.ts: FOUND
- Level-up hints in commands.ts: FOUND
