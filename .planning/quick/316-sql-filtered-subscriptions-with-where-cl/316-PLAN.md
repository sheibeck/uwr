---
phase: quick-316
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/data/useWorldData.ts
  - src/composables/useGameData.ts
  - src/App.vue
autonomous: true
requirements: [OPT-WHERE-01]
must_haves:
  truths:
    - "Location-scoped tables subscribe with WHERE locationId filter, not SELECT *"
    - "When player changes location, new location subscription arrives before old is removed (no flicker)"
    - "Global template tables (enemy_template, enemy_role_template, enemy_ability) still use unfiltered SELECT *"
    - "All existing location-scoped computed properties in App.vue still receive correct data"
  artifacts:
    - path: "src/composables/data/useWorldData.ts"
      provides: "WHERE-filtered subscriptions for location-scoped tables, subscribe-before-unsubscribe on location change"
  key_links:
    - from: "src/composables/data/useWorldData.ts"
      to: "src/App.vue"
      via: "useGameData facade spreads world composable refs"
      pattern: "enemySpawns|npcs|corpses|resourceNodes|namedEnemies|searchResults"
---

<objective>
Add SQL WHERE-filtered subscriptions for location-scoped tables in useWorldData.ts. Currently all 13 tables in the world domain use `SELECT * FROM "table"` with no WHERE filtering -- the client downloads ALL rows globally and filters in JS. Tables that have a `locationId` column should use `SELECT * FROM "table" WHERE "locationId" = X` to reduce bandwidth. When the player moves to a new location, use the subscribe-before-unsubscribe pattern (subscribe to new location FIRST, wait for onApplied, THEN unsubscribe old) to prevent UI flicker.

Purpose: Reduce bandwidth and client memory usage by only subscribing to location-relevant rows for the 6 location-scoped tables, while keeping global template tables unfiltered.
Output: Updated useWorldData.ts with WHERE-filtered location subscriptions and subscribe-before-unsubscribe location change handling.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/23-v2-subscription-optimization/23-RESEARCH.md
@src/composables/data/useWorldData.ts
@src/composables/useGameData.ts
@src/App.vue
@spacetimedb/src/schema/tables.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Split useWorldData into location-scoped and global subscriptions with WHERE filtering and subscribe-before-unsubscribe pattern</name>
  <files>
    src/composables/data/useWorldData.ts
    src/composables/useGameData.ts
    src/App.vue
  </files>
  <action>
Refactor useWorldData.ts to accept a `currentLocationId: Ref<bigint | null>` parameter (in addition to the existing `conn` parameter). Split the 13 tables into two groups:

**Group A: Location-scoped tables (use WHERE "locationId" = X):**
- enemy_spawn (has by_location index)
- npc (has by_location index)
- named_enemy (has by_location index)
- resource_node (has by_location index)
- corpse (has by_location index)
- search_result (has locationId column but only by_character index -- WHERE still works even without server-side index, just less efficient)

**Group B: Global/template tables (keep SELECT * -- no locationId column):**
- enemy_spawn_member (keyed by spawnId)
- enemy_template (global defs)
- enemy_role_template (global defs)
- enemy_ability (global defs)
- vendor_inventory (keyed by npcId)
- resource_gather (keyed by characterId)
- corpse_item (keyed by corpseId)

Implementation details:

1. Keep the existing subscription for Group B tables as-is (single `subscriptionBuilder().subscribe([...])` with `SELECT *` queries, unchanged).

2. For Group A tables, create a NEW subscription that uses WHERE filtering. Store the subscription handle in a `let locationSubHandle: SubscriptionHandle | null = null` variable.

3. Watch `currentLocationId` for changes. When it changes:
   - If null/undefined, do nothing (no character selected yet).
   - Build 6 WHERE-filtered queries: `SELECT * FROM "enemy_spawn" WHERE "locationId" = ${locId}` (use template literal with the BigInt value, e.g. `${locId}` -- SpacetimeDB SQL accepts numeric literals for u64 columns).
   - Subscribe to the new location queries FIRST (subscribe-before-unsubscribe per research pitfall #2).
   - In the new subscription's `onApplied` callback:
     a. Refresh all 6 location-scoped shallowRefs from `dbConn.db.*.iter()` (the iter() will now only contain rows matching the WHERE filter).
     b. THEN unsubscribe the old handle: `oldHandle.unsubscribe()`.
     c. Store the new handle as the current `locationSubHandle`.
   - Use `{ immediate: true }` on the watcher so it fires on initial connection.

4. The `rebind()` pattern (onInsert/onUpdate/onDelete listeners) should remain for ALL tables. These are table-level callbacks that fire regardless of which subscription delivered the row. The rebind for location-scoped tables still calls `[...dbConn.db.enemy_spawn.iter()]` etc. -- this is correct because iter() iterates the local cache, which the WHERE subscription populates only with matching rows.

5. In `useGameData.ts`, pass `currentLocationId` through to `useWorldData()`. Add a new parameter: extract it from the character data. Since useGameData doesn't currently have access to the selected character's locationId, add a `currentLocationId` parameter to `useGameData()` itself.

6. In `App.vue`, compute `currentLocationId` from `selectedCharacter.value?.locationId ?? null` and pass it to `useGameData()`. This ref already exists implicitly in App.vue (used in multiple computed properties). Create an explicit `const currentLocationId = computed(() => selectedCharacter.value?.locationId ?? null)` and pass it to useGameData.

NOTE: `selectedCharacter` is derived from useGameData's returned data, creating a circular dependency. To break this:
- Option A (preferred): Have useWorldData accept the locationId ref and let App.vue set it up as a standalone ref that gets updated via a watcher on selectedCharacter. This avoids the chicken-and-egg problem.
- Concretely: In App.vue, create `const currentLocationId = ref<bigint | null>(null)` and pass it to useGameData BEFORE destructuring. Then add a watcher: `watch(() => selectedCharacter.value?.locationId, (id) => { currentLocationId.value = id ?? null; })`.

7. Do NOT remove any existing client-side filtering in App.vue (npcsHere, corpsesHere, resourceNodesHere, etc.). These computed properties add additional filters beyond just locationId (e.g., character ownership, online status, state). The WHERE subscription reduces the haystack; client-side filtering narrows further. Over time these client-side filters may become unnecessary but that is out of scope.

8. Quote table names in SQL with double quotes for consistency: `SELECT * FROM "enemy_spawn" WHERE "locationId" = ${locId}`.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vue-tsc --noEmit 2>&1 | head -30</automated>
    <manual>Start the game, select a character, observe that enemy spawns/NPCs/corpses/resources appear for the current location. Travel to a different location and verify data updates without flicker or brief empty states.</manual>
  </verify>
  <done>
    - useWorldData subscribes to 6 location-scoped tables with WHERE "locationId" = X
    - 7 global tables still use unfiltered SELECT *
    - Location changes use subscribe-before-unsubscribe (new sub onApplied triggers old sub unsubscribe)
    - All existing App.vue computed properties (npcsHere, corpsesHere, resourceNodesHere, etc.) continue to work
    - TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
1. TypeScript compilation passes (`npx vue-tsc --noEmit`)
2. The 6 location-scoped SQL queries contain WHERE clauses (grep useWorldData.ts for `WHERE`)
3. The 7 global SQL queries do NOT contain WHERE clauses
4. Subscribe-before-unsubscribe pattern visible in location change watcher (new subscribe -> onApplied -> old unsubscribe)
5. No regressions in App.vue's location-scoped computed properties
</verification>

<success_criteria>
- Location-scoped tables use `SELECT * FROM "table" WHERE "locationId" = X` instead of `SELECT * FROM "table"`
- Global template tables remain unfiltered with `SELECT *`
- Location changes use subscribe-before-unsubscribe pattern (zero flicker)
- TypeScript compiles cleanly
- All existing game functionality preserved (NPC list, enemy spawns, resource nodes, corpses at current location)
</success_criteria>

<output>
After completion, create `.planning/quick/316-sql-filtered-subscriptions-with-where-cl/316-SUMMARY.md`
</output>
