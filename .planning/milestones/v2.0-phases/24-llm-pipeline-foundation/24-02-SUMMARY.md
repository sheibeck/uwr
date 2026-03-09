---
phase: 24-llm-pipeline-foundation
plan: 02
subsystem: api
tags: [llm, anthropic, procedure, reducer, budget, concurrency]

requires:
  - phase: 24-01
    provides: LlmConfig/LlmRequest/LlmBudget tables, budget helpers, Anthropic request/response helpers, prompt builders
provides:
  - call_llm procedure for Anthropic API calls with retry and error handling
  - validate_llm_request reducer with budget check, concurrency control, and domain validation
  - Full request lifecycle: validate -> pending -> processing -> completed/error
affects: [24-03, 25-character-generation, 26-world-generation, 27-combat-narration]

tech-stack:
  added: []
  patterns: [three-phase-procedure-pattern, withTx-fetch-withTx, retry-once-on-failure, budget-on-success-only]

key-files:
  created: []
  modified:
    - spacetimedb/src/reducers/llm.ts
    - spacetimedb/src/index.ts

key-decisions:
  - "Procedure uses three-phase pattern: withTx(read) -> http.fetch() -> withTx(write) to avoid SpacetimeDB panics from overlapping HTTP and transactions"
  - "Budget incremented only after successful API call (not on validation), matching locked decision"
  - "Error events inserted directly into event_private table inside withTx rather than calling fail() helper, since procedure withTx callbacks should minimize external function calls"
  - "Added procedure to V2 export auto-collection monkey-patch for SpacetimeDB v2 compatibility"

patterns-established:
  - "Three-phase procedure: read state in withTx -> perform side effect outside tx -> write results in withTx"
  - "Retry pattern: max 2 attempts with console.error logging between retries"
  - "Concurrency control: check for pending/processing requests per player before creating new one"

requirements-completed: [LLM-01, LLM-03, LLM-06]

duration: 4min
completed: 2026-03-07
---

# Phase 24 Plan 02: LLM Procedure and Validation Summary

**call_llm procedure with Anthropic API integration, retry logic, and validate_llm_request reducer with budget/concurrency gating**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-07T01:03:47Z
- **Completed:** 2026-03-07T01:08:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added validate_llm_request reducer with 7-step validation: character ownership, domain, model, API key, concurrency (one active per player), budget check, and pending request creation
- Built call_llm procedure using three-phase pattern (withTx read -> http.fetch -> withTx write) with retry-once logic and thematic error messaging
- Wired procedure into V2 export auto-collection system via monkey-patch extension

## Task Commits

Each task was committed atomically:

1. **Task 1: Create validate_llm_request reducer** - `2e932c6` (feat)
2. **Task 2: Create call_llm procedure** - `ec36a63` (feat)

## Files Created/Modified
- `spacetimedb/src/reducers/llm.ts` - Added validate_llm_request reducer with budget checking via checkBudget import and concurrency enforcement
- `spacetimedb/src/index.ts` - Added call_llm procedure with Anthropic API integration, added procedure monkey-patch for V2 exports, added LLM helper imports

## Decisions Made
- Used three-phase procedure pattern (withTx/fetch/withTx) to avoid SpacetimeDB runtime panics from overlapping HTTP calls and transactions
- Inserted error events directly into event_private table inside withTx rather than calling fail() helper, to keep procedure transaction callbacks minimal
- Added `_wrapMethod('procedure', ...)` to V2 export auto-collection -- without this, the procedure would not be exported in SpacetimeDB V2 module format

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added procedure to V2 export auto-collection monkey-patch**
- **Found during:** Task 2 (Procedure creation)
- **Issue:** The existing _wrapMethod system only wraps reducer, init, clientConnected, clientDisconnected, and view. Without wrapping procedure, the call_llm procedure would not be collected into _moduleExports and would not be exported for SpacetimeDB V2
- **Fix:** Added `_wrapMethod('procedure', ...)` with name extraction from opts when 4+ args are provided
- **Files modified:** spacetimedb/src/index.ts
- **Verification:** TypeScript compiles, no new errors introduced
- **Committed in:** ec36a63 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential for correctness -- without this fix, the procedure would not be exported in SpacetimeDB V2 module format.

## Issues Encountered
- Pre-existing TypeScript errors in combat.ts, corpse.ts, location.ts, auth.ts, characters.ts (unrelated to LLM work) -- no new errors introduced by this plan

## User Setup Required
None - API key is set at runtime via the existing set_api_key reducer from plan 01.

## Next Phase Readiness
- Full LLM request lifecycle operational: validate -> pending -> processing -> completed/error
- Ready for Plan 03 (client integration or additional domain wiring)
- Procedure pattern established for any future HTTP-calling procedures

## Self-Check: PASSED

All modified files verified present. All commit hashes verified in git log.

---
*Phase: 24-llm-pipeline-foundation*
*Completed: 2026-03-07*
