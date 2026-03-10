---
phase: quick-393
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/world_gen.ts
  - spacetimedb/src/helpers/world_gen.test.ts
  - spacetimedb/src/schema/tables.ts
  - spacetimedb/src/index.ts
autonomous: true
requirements: [QUICK-393]
must_haves:
  truths:
    - "Starter regions (sourceRegionId=0n) always get dangerMultiplier=100n so baseLevel=1"
    - "Enemy level clamping in starter regions heavily favors level 1"
    - "Second player choosing the same race starts in the same starter region"
  artifacts:
    - path: "spacetimedb/src/helpers/world_gen.ts"
      provides: "Starter region danger pinned at 100n, enemy level weighting toward L1"
    - path: "spacetimedb/src/schema/tables.ts"
      provides: "Region.starterForRace column linking starter regions to races"
    - path: "spacetimedb/src/index.ts"
      provides: "Race-based starter region lookup before generating new region"
  key_links:
    - from: "spacetimedb/src/index.ts"
      to: "spacetimedb/src/schema/tables.ts"
      via: "region.starterForRace lookup"
      pattern: "starterForRace"
    - from: "spacetimedb/src/helpers/world_gen.ts"
      to: "spacetimedb/src/data/combat_scaling.ts"
      via: "enemy level clamping in writeGeneratedRegion"
      pattern: "baseLevel"
---

<objective>
Fix two issues with starting regions: (1) Starter regions have inflated danger (150-200) causing level 2-3 enemies to spawn against level 1 characters. Pin starter region danger to 100n so enemies are level 1. (2) Players of the same race should share a starting region. Add a `starterForRace` column to the Region table and look up existing starter regions before generating new ones.

Purpose: Level 1 combat is punishing because enemies spawn at levels 1-3 in starter regions. Same-race players should find each other naturally.
Output: Modified world_gen.ts, tables.ts, index.ts with tests.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/helpers/world_gen.ts
@spacetimedb/src/schema/tables.ts
@spacetimedb/src/index.ts
@spacetimedb/src/helpers/world_gen.test.ts
@spacetimedb/src/reducers/creation.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pin starter region danger to 100n and weight enemies toward level 1</name>
  <files>spacetimedb/src/helpers/world_gen.ts, spacetimedb/src/helpers/world_gen.test.ts</files>
  <behavior>
    - Test: computeRegionDanger with sourceRegionDanger=100n (starter) returns exactly 100n, not 150-200
    - Test: writeGeneratedRegion with sourceRegionId=0n produces region with dangerMultiplier=100n
    - Test: Enemy level clamping in starter regions (dangerMultiplier=100n) forces all enemies to level 1
    - Test: Non-starter regions still get normal danger increase (existing behavior preserved)
  </behavior>
  <action>
    1. In `computeRegionDanger`: Add an `isStarter` boolean parameter (default false). When true, return 100n directly (no increase). This keeps starter regions at danger 100 = baseLevel 1.

    2. In `writeGeneratedRegion`: Detect starter region by checking `genState.sourceRegionId === 0n`. When starter, call `computeRegionDanger` with `isStarter=true` to get 100n.

    3. In the enemy level clamping section of `writeGeneratedRegion` (lines 234-239): When dangerMultiplier is 100n (baseLevel=1n), force ALL enemies to level 1 by setting both minLevel and maxLevel to 1n. Currently `minLevel = baseLevel - 1n` could be 0n (clamped to 1n) and `maxLevel = baseLevel + 1n = 2n`, allowing level 2 enemies. Change: when baseLevel <= 1n, set minLevel=1n, maxLevel=1n.

    4. Update existing tests and add new tests for the starter pinning behavior.
  </action>
  <verify>
    <automated>cd spacetimedb && npx vitest run src/helpers/world_gen.test.ts</automated>
  </verify>
  <done>Starter regions always have dangerMultiplier=100n. All enemies in starter regions are level 1. Non-starter regions behave as before.</done>
</task>

<task type="auto">
  <name>Task 2: Share starter regions by race</name>
  <files>spacetimedb/src/schema/tables.ts, spacetimedb/src/index.ts</files>
  <action>
    1. In `spacetimedb/src/schema/tables.ts`, add an optional `starterForRace` column to the Region table:
       ```
       starterForRace: t.string().optional(),  // Race name (lowercase) this region was generated as starter for
       ```
       This is a schema change so will require `--clear-database` on publish.

    2. In `spacetimedb/src/helpers/world_gen.ts`, modify `writeGeneratedRegion` to accept an optional `starterRace` parameter. When provided, set `region.starterForRace = starterRace` on the inserted region row.

    3. In `spacetimedb/src/index.ts`, in the `submit_llm_result` handler for domain `world_gen` (around line 920), after `writeGeneratedRegion` is called and the character is being placed (the `character.locationId === 0n` block):
       - Read the character's race from the character row.
       - After region insert, update the region with `starterForRace: character.race.toLowerCase()`.

    4. In `spacetimedb/src/index.ts`, in the `prepare_world_gen_llm` reducer (around line 516), BEFORE creating the LLM task, check if this is a starter region request (`genState.sourceRegionId === 0n`). If so:
       - Read the character's race.
       - Scan all regions for one with matching `starterForRace` (case-insensitive match on race name lowercase).
       - If found: skip LLM generation entirely. Instead:
         a. Find the home location of that existing starter region (first safe, non-uncharted location).
         b. Place the character there (set locationId and boundLocationId).
         c. Call `ensureSpawnsForLocation` for the home location.
         d. Update the world_gen_state to COMPLETE with the existing region's id.
         e. Send the arrival narrative message.
         f. Return early (no LLM task created).
       - If not found: proceed with normal LLM generation (existing code).

    5. Also handle the race lookup in `submit_llm_result` for world_gen: after `writeGeneratedRegion`, set `starterForRace` on the region so future same-race characters can find it.

    Note: Since Region table doesn't have a by_starterForRace index and multi-column indexes are broken, use `.iter()` to scan regions. There are very few regions so this is fine.
  </action>
  <verify>
    <automated>cd spacetimedb && npx vitest run src/helpers/world_gen.test.ts</automated>
  </verify>
  <done>Second player choosing same race reuses existing starter region. Different races get different starter regions. Region table has starterForRace column.</done>
</task>

</tasks>

<verification>
- Publish locally with --clear-database (schema change): `spacetime publish uwr -p spacetimedb --clear-database -y`
- Create a Halfling character -> generates starter region with dangerMultiplier=100n
- All enemies in the starter region are level 1
- Create another Halfling character -> placed in same starter region (no LLM generation triggered)
- Create an Elf character -> generates a new, different starter region
</verification>

<success_criteria>
- Starter regions always have dangerMultiplier=100n (baseLevel=1)
- All enemy templates in starter regions are clamped to level 1
- Same-race characters share the same starter region
- Different races get different starter regions
- Non-starter region generation is unchanged
- Tests pass
</success_criteria>

<output>
After completion, create `.planning/quick/393-weight-level-1-enemies-in-starting-regio/393-SUMMARY.md`
</output>
