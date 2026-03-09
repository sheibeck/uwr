---
phase: 26-narrative-character-creation
plan: 02
subsystem: backend
tags: [spacetimedb, llm, character-creation, anthropic, procedure]

requires:
  - phase: 26-narrative-character-creation
    provides: CharacterCreationState table and state machine (Plan 01)
  - phase: 24-llm-pipeline-foundation
    provides: LLM request/budget tables, buildAnthropicRequest, parseAnthropicResponse
provides:
  - generate_creation_content procedure for race interpretation and class generation
  - JSON schemas (RACE_INTERPRETATION_SCHEMA, CLASS_GENERATION_SCHEMA) for structured LLM output
  - buildRaceInterpretationUserPrompt and buildClassGenerationUserPrompt prompt builders
affects: [26-03-client-creation-ui]

tech-stack:
  added: []
  patterns: [creation-specific-procedure, json-schema-constrained-generation, model-tier-selection]

key-files:
  created: []
  modified:
    - spacetimedb/src/data/llm_prompts.ts
    - spacetimedb/src/index.ts
    - spacetimedb/src/reducers/creation.ts

key-decisions:
  - "Haiku for race interpretation (low-stakes), Sonnet for class generation (high-stakes one-time)"
  - "Procedure bypasses generic LLM pipeline since creation has no characterId"
  - "Error cases revert creation step to allow retry rather than leaving in broken state"
  - "Class reveal event includes full mechanical stats AND ability details for player decision"

patterns-established:
  - "Creation procedure pattern: client observes GENERATING_* step, calls procedure, procedure updates state"
  - "JSON schema in user prompt for structured LLM output parsing"

requirements-completed: [CHAR-02, CHAR-04, CHAR-06]

duration: 3min
completed: 2026-03-07
---

# Phase 26 Plan 02: Creation LLM Generation Summary

**generate_creation_content procedure with JSON-schema-constrained race interpretation (Haiku) and class generation (Sonnet), budget enforcement, and narrative event emission with full mechanical detail**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-07T03:25:56Z
- **Completed:** 2026-03-07T03:29:16Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- JSON schemas for race interpretation (name, narrative, stat bonuses) and class generation (name, stats, 3 abilities with damage/cooldown/effects)
- generate_creation_content procedure following three-phase pattern (withTx/fetch/withTx) with budget enforcement
- Narrative events include both sardonic flavor text AND mechanical stats for informed player decisions
- Model tier selection: Haiku for race interpretation, Sonnet for class generation

## Task Commits

Each task was committed atomically:

1. **Task 1: Add JSON schemas to creation prompts** - `5723316` (feat)
2. **Task 2: Create generate_creation_content procedure** - `08d79c4` (feat)

## Files Created/Modified
- `spacetimedb/src/data/llm_prompts.ts` - Added RACE_INTERPRETATION_SCHEMA, CLASS_GENERATION_SCHEMA, and two user prompt builder functions
- `spacetimedb/src/index.ts` - Added generate_creation_content procedure with race/class LLM flows, imported new prompt builders and checkBudget
- `spacetimedb/src/reducers/creation.ts` - Added client-flow documentation comments to GENERATING_RACE and GENERATING_CLASS steps

## Decisions Made
- Used Haiku for race interpretation (fast, low-stakes) and Sonnet for class generation (high-stakes one-time generation per user decision from planning)
- Procedure reads API key from llm_config table (same pattern as call_llm) rather than environment variable
- Error cases revert step to pre-generation state (AWAITING_RACE or AWAITING_ARCHETYPE) so player can retry
- Adapted plan's interface to match actual helper signatures: `parseAnthropicResponse` returns `{ ok, text }` not `{ success, content }`, `buildAnthropicRequest` returns string not object

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected LLM helper interface usage**
- **Found during:** Task 2 (procedure implementation)
- **Issue:** Plan referenced `buildAnthropicRequest(systemPrompt, userPrompt, model)` but actual signature is `buildAnthropicRequest(model, systemPrompt, userPrompt)`. Plan used `parsed.success/content` but actual response uses `parsed.ok/text`.
- **Fix:** Used correct function signatures matching the actual helpers/llm.ts implementation
- **Files modified:** spacetimedb/src/index.ts
- **Committed in:** 08d79c4

**2. [Rule 2 - Missing Critical] Added API key reading from llm_config table**
- **Found during:** Task 2 (procedure implementation)
- **Issue:** Plan noted API key is needed but didn't specify reading it from llm_config in the first withTx
- **Fix:** Added llm_config.id.find(1n) lookup and apiKey extraction in Phase 1, passed to fetch headers (matching call_llm pattern)
- **Files modified:** spacetimedb/src/index.ts
- **Committed in:** 08d79c4

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both fixes necessary for correct function signatures and API authentication. No scope creep.

## Issues Encountered
None

## User Setup Required
None - LLM API key must already be configured via set_llm_config reducer (from Phase 24).

## Next Phase Readiness
- Procedure ready for client to call when observing GENERATING_RACE or GENERATING_CLASS steps
- Plan 03 (client UI) can subscribe to CharacterCreationState and EventCreation tables
- Client flow: submit input -> observe step change -> call procedure -> observe results

---
*Phase: 26-narrative-character-creation*
*Completed: 2026-03-07*
