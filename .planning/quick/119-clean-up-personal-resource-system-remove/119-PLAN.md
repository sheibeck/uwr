---
phase: quick-119
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/location.ts
  - spacetimedb/src/helpers/search.ts
  - spacetimedb/src/reducers/items.ts
  - spacetimedb/src/schema/tables.ts
  - spacetimedb/src/schema/scheduled_tables.ts
  - spacetimedb/src/index.ts
  - spacetimedb/src/seeding/ensure_content.ts
  - src/components/LocationGrid.vue
autonomous: true
must_haves:
  truths:
    - "No shared/public resource spawning code remains in the codebase"
    - "ResourceRespawnTick table and respawn_resource reducer are removed"
    - "Resource badge no longer appears in SEARCH section of LocationGrid"
    - "Search log message says 'You discover some resources.' not 'hidden resources'"
    - "Resource node count is tiered by roll value (1/2/3 nodes based on resourceRoll ranges)"
  artifacts:
    - path: "spacetimedb/src/helpers/location.ts"
      provides: "No ensureResourceNodesForLocation or respawnResourceNodesForLocation functions"
    - path: "spacetimedb/src/helpers/search.ts"
      provides: "Tiered node count and updated log message"
    - path: "spacetimedb/src/reducers/items.ts"
      provides: "No respawn_resource reducer, no shared node branch in finish_gather"
    - path: "spacetimedb/src/schema/tables.ts"
      provides: "No ResourceRespawnTick table definition, removed from schema()"
  key_links:
    - from: "spacetimedb/src/helpers/search.ts"
      to: "spawnResourceNode"
      via: "tiered count logic using resourceRoll ranges"
      pattern: "resourceRoll.*65n|resourceRoll.*75n|resourceRoll.*85n"
---

<objective>
Clean up the personal resource node system introduced in quick-118 by removing all shared/public resource spawning remnants, fixing the SEARCH badge display, updating the log message, and implementing tiered resource node counts.

Purpose: Finalize the personal resource system - shared spawning code is dead weight, the SEARCH badge leaks implementation detail, and flat node counts should be tiered for varied discovery.
Output: Clean codebase with only personal resource nodes, tiered discovery, and correct UI.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/helpers/location.ts
@spacetimedb/src/helpers/search.ts
@spacetimedb/src/reducers/items.ts
@spacetimedb/src/schema/tables.ts
@spacetimedb/src/index.ts
@src/components/LocationGrid.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove shared resource spawning and ResourceRespawnTick</name>
  <files>
    spacetimedb/src/helpers/location.ts
    spacetimedb/src/reducers/items.ts
    spacetimedb/src/schema/tables.ts
    spacetimedb/src/schema/scheduled_tables.ts
    spacetimedb/src/index.ts
    spacetimedb/src/seeding/ensure_content.ts
  </files>
  <action>
    **In `spacetimedb/src/helpers/location.ts`:**
    - Delete `ensureResourceNodesForLocation` function (lines 158-167)
    - Delete `respawnResourceNodesForLocation` function (lines 169-181)
    - Delete `RESOURCE_NODES_PER_LOCATION` constant (line 10) — only used by deleted functions
    - Delete `RESOURCE_RESPAWN_MICROS` constant (line 12) — only used by items.ts respawn code being deleted
    - Keep all other exports (spawnResourceNode, spawnEnemy, ensureLocationRuntimeBootstrap, etc.)

    **In `spacetimedb/src/schema/tables.ts`:**
    - Delete `ResourceRespawnTick` table definition (lines 448-458)
    - Remove `ResourceRespawnTick` from the `schema()` call (line 1530)

    **In `spacetimedb/src/schema/scheduled_tables.ts`:**
    - Remove `ResourceRespawnTick` from the re-export list (line 10)

    **In `spacetimedb/src/reducers/items.ts`:**
    - Remove `ResourceRespawnTick` from the destructured `deps` object (line 31)
    - Delete the entire `respawn_resource` reducer (lines 741-759)
    - In `finish_gather` reducer (lines 689-739): Remove the `else` branch for shared nodes (lines 723-737). The entire if/else block starting at line 720 should become just the personal node delete: `ctx.db.resourceNode.id.delete(node.id);` — no need to check `node.characterId` since ALL nodes are now personal. Also remove the local `RESOURCE_RESPAWN_MICROS` constant (line 592).

    **In `spacetimedb/src/index.ts`:**
    - Remove `ensureResourceNodesForLocation` from the import on line 162
    - Remove `respawnResourceNodesForLocation` from the import on line 163
    - Remove `RESOURCE_NODES_PER_LOCATION` from the import on line 157
    - Remove `RESOURCE_RESPAWN_MICROS` from the import on line 159
    - Remove `ResourceRespawnTick` from the import on line 15
    - Remove `ResourceRespawnTick` from the deps object passed to registerReducers (around line 355)
    - Remove line 253: `respawnResourceNodesForLocation(ctx, location.id);` from the tick_day_night reducer
    - Remove `ensureResourceNodesForLocation` from the deps object (around line 427)
    - Remove `respawnResourceNodesForLocation` from the deps object (around line 428)

    **In `spacetimedb/src/seeding/ensure_content.ts`:**
    - Remove `ensureResourceNodesForLocation` from the import on line 24
    - Check if it is called anywhere in this file. If not called, just remove the import. If called, remove the call too.
  </action>
  <verify>
    Run `grep -rn "ensureResourceNodesForLocation\|respawnResourceNodesForLocation\|ResourceRespawnTick\|respawn_resource\|RESOURCE_NODES_PER_LOCATION" spacetimedb/src/` and confirm zero matches (except possibly comments). The codebase should have no references to these removed symbols.
  </verify>
  <done>All shared resource spawning functions, the ResourceRespawnTick scheduled table, and the respawn_resource reducer are fully removed with no dangling references. finish_gather always deletes nodes immediately.</done>
</task>

<task type="auto">
  <name>Task 2: Fix search log message, implement tiered node count, and remove resource badge from LocationGrid</name>
  <files>
    spacetimedb/src/helpers/search.ts
    src/components/LocationGrid.vue
  </files>
  <action>
    **In `spacetimedb/src/helpers/search.ts`:**

    1. Change the log message on line 162 from:
       `'You notice some hidden resources in the area.'`
       to:
       `'You discover some resources.'`

    2. Replace the flat node count on line 157:
       ```
       const nodeCount = 2 + Number(seed % 2n); // 2 or 3 nodes
       ```
       with tiered count based on `resourceRoll` (already defined on line 26 as `seed % 100n`):
       ```typescript
       let nodeCount: number;
       if (resourceRoll >= 85n) {
         nodeCount = 3;
       } else if (resourceRoll >= 75n) {
         nodeCount = 2;
       } else {
         nodeCount = 1;  // roll 65-74
       }
       ```
       Note: `foundResources` is true when `resourceRoll < 65n` is FALSE, i.e., when resourceRoll >= 65. So the tiers within the "found" range (65-99) are:
       - 65-74 (10 range): 1 node
       - 75-84 (10 range): 2 nodes
       - 85-99 (15 range): 3 nodes

    **In `src/components/LocationGrid.vue`:**

    1. Remove the resource badge tile from the SEARCH section (lines 24-28):
       ```html
       <div
         v-if="searchResult.foundResources"
         :style="{ ...styles.gridTile, color: '#60a5fa' }"
       >
         Hidden resources detected nearby
       </div>
       ```
       Delete these 5 lines entirely.

    2. Update the "nothing detected" condition on line 42 from:
       ```
       v-if="!searchResult.foundResources && !searchResult.foundQuestItem && !searchResult.foundNamedEnemy"
       ```
       to:
       ```
       v-if="!searchResult.foundQuestItem && !searchResult.foundNamedEnemy"
       ```
       This means if only resources were found (but no quest item or named enemy), the SEARCH section shows "Nothing unusual detected" — resources are discovered silently via log and nodes appear in the location grid.

    3. Keep the `foundResources` field in the props type definition (line 336) — it is still used by the search system for spawning nodes and log events.
  </action>
  <verify>
    1. Grep `src/components/LocationGrid.vue` for "Hidden resources" — should return zero matches.
    2. Grep `spacetimedb/src/helpers/search.ts` for "hidden resources" — should return zero matches.
    3. Grep `spacetimedb/src/helpers/search.ts` for "discover some resources" — should return one match.
    4. Grep `spacetimedb/src/helpers/search.ts` for "nodeCount" — should show tiered logic with 85n, 75n thresholds.
  </verify>
  <done>SEARCH section only shows quest item and named enemy badges; resource-only searches show "Nothing unusual detected". Log message says "You discover some resources." Node count is tiered: 1 node (roll 65-74), 2 nodes (roll 75-84), 3 nodes (roll 85-99).</done>
</task>

</tasks>

<verification>
1. `grep -rn "ensureResourceNodesForLocation\|respawnResourceNodesForLocation\|ResourceRespawnTick\|respawn_resource\|RESOURCE_NODES_PER_LOCATION" spacetimedb/src/` returns no matches
2. `grep -n "Hidden resources" src/components/LocationGrid.vue` returns no matches
3. `grep -n "hidden resources" spacetimedb/src/helpers/search.ts` returns no matches
4. `grep -n "discover some resources" spacetimedb/src/helpers/search.ts` returns exactly one match
5. `grep -n "nodeCount" spacetimedb/src/helpers/search.ts` shows tiered logic
</verification>

<success_criteria>
- All shared resource spawning functions removed (ensureResourceNodesForLocation, respawnResourceNodesForLocation)
- ResourceRespawnTick table removed from schema and schema() registration
- respawn_resource reducer deleted
- finish_gather always deletes nodes (no shared branch)
- LocationGrid SEARCH section has no resource badge
- Search log message updated to "You discover some resources."
- Node count tiered: 1 (roll 65-74), 2 (roll 75-84), 3 (roll 85-99)
- No dangling imports or references to removed symbols
</success_criteria>

<output>
After completion, create `.planning/quick/119-clean-up-personal-resource-system-remove/119-SUMMARY.md`
</output>
