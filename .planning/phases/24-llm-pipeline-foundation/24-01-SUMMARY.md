---
phase: 24-llm-pipeline-foundation
plan: 01
subsystem: api
tags: [llm, anthropic, budget, prompts, narrator]

requires:
  - phase: none
    provides: n/a
provides:
  - LlmConfig, LlmRequest, LlmBudget private tables for LLM pipeline
  - Budget check/increment helpers with UTC midnight reset
  - Anthropic Messages API request builder and response parser
  - Four domain prompt builders with sardonic narrator preamble
  - Admin set_api_key reducer with requireAdmin guard
affects: [24-02, 24-03, 24-04, 25-character-generation, 26-world-generation, 27-combat-narration]

tech-stack:
  added: []
  patterns: [singleton-config-table, daily-budget-with-date-string-reset, prompt-caching-with-ephemeral-cache-control]

key-files:
  created:
    - spacetimedb/src/helpers/llm.ts
    - spacetimedb/src/data/llm_prompts.ts
    - spacetimedb/src/reducers/llm.ts
  modified:
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/reducers/index.ts

key-decisions:
  - "Used registerLlmReducers(deps) pattern matching existing reducer registration convention"
  - "LlmConfig uses non-autoInc id (singleton pattern, always id=1) for API key storage"
  - "Budget tracks resetDate as UTC date string for simple midnight comparison"

patterns-established:
  - "LLM config singleton: single row with id=1n, upsert pattern in set_api_key reducer"
  - "Daily budget: per-player row with callCount + resetDate, auto-reset on date mismatch"
  - "Prompt architecture: shared NARRATOR_PREAMBLE + domain-specific builder functions accepting context string"

requirements-completed: [LLM-02, LLM-04, LLM-05]

duration: 4min
completed: 2026-03-07
---

# Phase 24 Plan 01: LLM Pipeline Data Foundation Summary

**Three private LLM tables (config, request tracking, budget), budget helpers with UTC reset, Anthropic request/response helpers, four domain prompt builders with sardonic narrator voice, and admin API key reducer**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-07T00:56:55Z
- **Completed:** 2026-03-07T01:00:27Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Defined three private tables (LlmConfig singleton, LlmRequest with by_player index, LlmBudget with by_player index) -- none exposed to clients
- Created budget helpers with 50-call daily limit and UTC midnight reset logic
- Built Anthropic Messages API request builder with prompt caching (cache_control: ephemeral) and response parser
- Created four domain prompt builders (character creation, world gen, combat narration, skill gen) sharing a sardonic narrator preamble
- Added admin-only set_api_key reducer with requireAdmin guard

## Task Commits

Each task was committed atomically:

1. **Task 1: Define LLM tables and register in schema** - `b16315e` (feat)
2. **Task 2: Create LLM helpers, prompt templates, and admin reducer** - `f8a31f4` (feat)

## Files Created/Modified
- `spacetimedb/src/schema/tables.ts` - Added LlmConfig, LlmRequest, LlmBudget table definitions and schema registration
- `spacetimedb/src/helpers/llm.ts` - Budget check/increment, Anthropic request builder, response parser, UTC date helper
- `spacetimedb/src/data/llm_prompts.ts` - NARRATOR_PREAMBLE and four domain prompt builder functions
- `spacetimedb/src/reducers/llm.ts` - Admin set_api_key reducer using registerLlmReducers pattern
- `spacetimedb/src/reducers/index.ts` - Import and registration of LLM reducers

## Decisions Made
- Used `registerLlmReducers(deps)` pattern instead of direct `spacetimedb.reducer()` import to match existing codebase convention and ensure monkey-patched auto-collection works correctly
- LlmConfig uses non-autoInc `id: t.u64().primaryKey()` (singleton pattern, always id=1n) rather than autoInc
- Budget resetDate stored as UTC date string ("YYYY-MM-DD") for simple string comparison on midnight reset

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Changed reducer registration pattern to match codebase convention**
- **Found during:** Task 2 (Admin reducer creation)
- **Issue:** Plan specified `import spacetimedb from '../schema/tables'` and direct `spacetimedb.reducer(...)` call, but this imports the raw schema object before monkey-patching in index.ts, so the reducer would not be auto-collected for V2 exports
- **Fix:** Used `registerLlmReducers(deps)` pattern matching all other reducer files, receiving the patched spacetimedb via deps
- **Files modified:** spacetimedb/src/reducers/llm.ts, spacetimedb/src/reducers/index.ts
- **Verification:** TypeScript compiles cleanly, reducer registered via existing flow
- **Committed in:** f8a31f4 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential for correctness -- without this fix, the set_api_key reducer would not be exported in SpacetimeDB V2 module format.

## Issues Encountered
- Pre-existing TypeScript errors in combat.ts, corpse.ts, location.ts (unrelated to LLM work) -- no new errors introduced by this plan

## User Setup Required
None - no external service configuration required. API key will be set at runtime via the set_api_key reducer.

## Next Phase Readiness
- All tables, helpers, and prompts ready for Plan 02 (LLM procedure implementation)
- Admin can set API key via reducer after module is published
- Budget system ready for integration with procedure calls

## Self-Check: PASSED

All created files verified present. All commit hashes verified in git log.

---
*Phase: 24-llm-pipeline-foundation*
*Completed: 2026-03-07*
