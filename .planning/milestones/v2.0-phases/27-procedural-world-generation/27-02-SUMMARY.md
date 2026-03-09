---
phase: 27-procedural-world-generation
plan: 02
subsystem: api
tags: [spacetimedb, procedural-generation, world-gen, llm, procedure, reducers]

# Dependency graph
requires:
  - phase: 27-procedural-world-generation
    provides: WorldGenState table, Region canonical facts, REGION_GENERATION_SCHEMA, ripple/discovery templates, computeRegionDanger
  - phase: 24-llm-pipeline-foundation
    provides: LLM procedure three-phase pattern, buildAnthropicRequest, parseAnthropicResponse
  - phase: 26-narrative-character-creation
    provides: generate_creation_content procedure pattern, brace extraction fallback
provides:
  - generate_world_region procedure for LLM-driven region generation
  - writeGeneratedRegion helper writing full region content (Region, Locations, Connections, EnemyTemplates, EnemyRoleTemplates, EnemyAbilities, LocationEnemyTemplates, NPCs, uncharted boundary)
  - buildRegionContext helper for neighbor region context injection
  - Creation COMPLETE trigger inserting WorldGenState PENDING row
  - Movement reducer uncharted location detection and WorldGenState trigger
  - Ripple announcements and personal discovery narratives
affects: [27-03-client, world-generation, exploration]

# Tech tracking
tech-stack:
  added: []
  patterns: [world-gen-trigger-pattern, generation-lock-via-worldgenstate, three-phase-procedure-with-try-catch]

key-files:
  created:
    - spacetimedb/src/helpers/world_gen.ts
  modified:
    - spacetimedb/src/index.ts
    - spacetimedb/src/reducers/creation.ts
    - spacetimedb/src/reducers/movement.ts

key-decisions:
  - "Haiku model for world generation (Sonnet HTTP fails from SpacetimeDB runtime per Phase 26 discovery)"
  - "Top-level try/catch on procedure reverts WorldGenState to ERROR for retry safety"
  - "Uncharted detection triggers once per reducer invocation (leader only for group travel)"

patterns-established:
  - "WorldGenState PENDING insert is the universal trigger pattern for world generation"
  - "writeGeneratedRegion creates complete playable content: enemies with role templates and abilities, NPCs, connections, and uncharted boundary seeding"
  - "Generation lock via by_source_location index prevents duplicate generation"

requirements-completed: [WORLD-01, WORLD-04, WORLD-06]

# Metrics
duration: 4min
completed: 2026-03-07
---

# Phase 27 Plan 02: Server Generation Procedure & Trigger Reducers Summary

**LLM-driven world generation procedure with trigger reducers for creation complete and uncharted location arrival, writing full playable region content**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-07T04:57:22Z
- **Completed:** 2026-03-07T05:01:10Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created writeGeneratedRegion helper that writes complete playable content: Region with canonical facts, 3-5 Locations, bidirectional Connections, EnemyTemplates with EnemyRoleTemplates and EnemyAbilities, LocationEnemyTemplates, NPCs, and uncharted boundary location
- Created buildRegionContext helper for injecting neighbor region biome/threats into LLM prompts
- Wired creation COMPLETE step to trigger WorldGenState PENDING for nearest uncharted location
- Wired movement reducer to detect uncharted terrainType and trigger WorldGenState PENDING with generation lock
- Built generate_world_region procedure following three-phase pattern with robust error handling, brace extraction JSON fallback, and ripple/discovery event emission

## Task Commits

Each task was committed atomically:

1. **Task 1: Create world gen helpers and trigger reducers** - `f83e97f` (feat)
2. **Task 2: Create generate_world_region procedure with ripple announcements** - `77ec1eb` (feat)

## Files Created/Modified
- `spacetimedb/src/helpers/world_gen.ts` - buildRegionContext and writeGeneratedRegion helpers
- `spacetimedb/src/index.ts` - generate_world_region procedure with three-phase LLM call pattern
- `spacetimedb/src/reducers/creation.ts` - WorldGenState PENDING trigger on creation COMPLETE
- `spacetimedb/src/reducers/movement.ts` - Uncharted location detection and WorldGenState trigger

## Decisions Made
- Used Haiku model for world generation (consistent with Phase 26 discovery that Sonnet HTTP fails from SpacetimeDB runtime)
- Top-level try/catch wraps entire procedure body and reverts WorldGenState to ERROR, enabling client retry
- Uncharted detection in movement reducer runs after all group members move, checking destination once
- 2048 max_tokens for region generation (larger than 1024 creation default, regions have more content)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Server-side world generation pipeline fully wired: triggers, procedure, content writing
- Client (Plan 03) needs to: subscribe to WorldGenState, call generate_world_region procedure on PENDING state, display ripple/discovery events
- WorldGenState table drives the entire client flow: observe PENDING -> call procedure -> observe COMPLETE

---
*Phase: 27-procedural-world-generation*
*Completed: 2026-03-07*
