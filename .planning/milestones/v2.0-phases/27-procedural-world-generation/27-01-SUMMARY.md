---
phase: 27-procedural-world-generation
plan: 01
subsystem: database
tags: [spacetimedb, procedural-generation, world-gen, llm, schema]

# Dependency graph
requires:
  - phase: 24-llm-pipeline-foundation
    provides: LLM procedure pattern, prompt architecture
  - phase: 26-narrative-character-creation
    provides: CharacterCreationState pattern, generation state machine pattern
provides:
  - Extended Region table with canonical fact fields (biome, faction, landmarks, threats, isGenerated)
  - WorldGenState table for generation lock and state machine
  - REGION_GENERATION_SCHEMA for LLM output contract
  - Ripple/discovery templates and biome hints for world generation events
  - computeRegionDanger for danger scaling on generated regions
  - buildRegionGenerationUserPrompt for LLM user message construction
  - 2 uncharted boundary locations on seeded world edges
affects: [27-02-procedure, 27-03-client, world-generation]

# Tech tracking
tech-stack:
  added: []
  patterns: [uncharted-boundary-locations, canonical-region-facts, deterministic-template-selection]

key-files:
  created:
    - spacetimedb/src/data/world_gen.ts
  modified:
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/data/llm_prompts.ts
    - spacetimedb/src/seeding/ensure_world.ts

key-decisions:
  - "Uncharted locations placed at Greywind Pass (Greyveil Moors) and Abyssal Vault (Dreadspire Ruins) as world edges"
  - "Timestamp-based pseudorandom for all template selection and danger variance (reducer determinism)"

patterns-established:
  - "terrainType 'uncharted' marks boundary locations that trigger procedural generation"
  - "Optional fields on Region table for backward-compatible canonical facts"
  - "Deterministic template selection via timestampMicros % array.length"

requirements-completed: [WORLD-02, WORLD-05]

# Metrics
duration: 3min
completed: 2026-03-07
---

# Phase 27 Plan 01: Server Schema & World Gen Data Layer Summary

**Region table extended with canonical facts, WorldGenState lock table, LLM region schema, ripple/discovery templates, and 2 uncharted boundary locations on seeded world edges**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-07T04:51:10Z
- **Completed:** 2026-03-07T04:53:46Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Extended Region table with 6 optional canonical fact fields for generated regions while maintaining backward compatibility with seeded regions
- Added WorldGenState table with by_player and by_source_location indexes for generation lock/state machine
- Created complete world generation data layer: ripple templates, discovery templates, biome hints, danger scaling, LLM JSON schema, and user prompt builder
- Seeded 2 uncharted boundary locations at world edges (Greyveil Moors and Dreadspire Ruins) connected to existing edge locations

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend Region table and add WorldGenState table** - `5f0b979` (feat)
2. **Task 2: Create world generation data layer and seed uncharted locations** - `2365c68` (feat)

## Files Created/Modified
- `spacetimedb/src/schema/tables.ts` - Extended Region with biome/faction/landmarks/threats/generatedByCharacterId/isGenerated; added WorldGenState table
- `spacetimedb/src/data/world_gen.ts` - RIPPLE_TEMPLATES, DISCOVERY_TEMPLATES, BIOME_HINTS, pickRippleMessage, pickDiscoveryMessage, computeRegionDanger
- `spacetimedb/src/data/llm_prompts.ts` - REGION_GENERATION_SCHEMA and buildRegionGenerationUserPrompt
- `spacetimedb/src/seeding/ensure_world.ts` - 2 uncharted boundary locations (The Mists Beyond Greyveil, The Veil Beyond the Abyss)

## Decisions Made
- Placed uncharted locations at Greywind Pass (Greyveil Moors edge, mountains) and Abyssal Vault (Dreadspire Ruins deepest point) -- these are true dead-end edges of the world graph
- All template selection uses `timestampMicros % BigInt(array.length)` for reducer determinism (no Math.random)
- Danger scaling uses `timestampMicros % 51n + 50` for 50-100 range variance, capped at 800n

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Schema and data layer ready for Plan 02 (generate_world_region procedure)
- WorldGenState table provides the lock/state machine the procedure needs
- REGION_GENERATION_SCHEMA defines the LLM output contract
- Uncharted locations with terrainType 'uncharted' ready for movement reducer trigger detection

---
*Phase: 27-procedural-world-generation*
*Completed: 2026-03-07*
