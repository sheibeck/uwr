---
phase: quick-118
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/schema/tables.ts
  - spacetimedb/src/helpers/location.ts
  - spacetimedb/src/helpers/search.ts
  - spacetimedb/src/reducers/items.ts
  - src/App.vue
autonomous: true

must_haves:
  truths:
    - "When a character arrives at a location, passive search rolls 65% chance to spawn 2-3 personal resource nodes"
    - "Personal resource nodes are only visible to the character that discovered them"
    - "After gathering a personal resource node, it is deleted (no respawn timer)"
    - "Old personal nodes at a location are cleaned up when character re-enters"
    - "Shared resource nodes no longer spawn during bootstrap or movement"
  artifacts:
    - path: "spacetimedb/src/schema/tables.ts"
      provides: "ResourceNode table with optional characterId field and by_character btree index"
      contains: "characterId"
    - path: "spacetimedb/src/helpers/search.ts"
      provides: "Personal node spawning in performPassiveSearch when foundResources=true"
      contains: "spawnResourceNode"
    - path: "spacetimedb/src/helpers/location.ts"
      provides: "spawnResourceNode accepts optional characterId, ensureLocationRuntimeBootstrap no longer calls ensureResourceNodesForLocation"
    - path: "spacetimedb/src/reducers/items.ts"
      provides: "finish_gather deletes personal nodes instead of depleting+respawning"
    - path: "src/App.vue"
      provides: "resourceNodesHere filters by characterId matching selectedCharacterId"
  key_links:
    - from: "spacetimedb/src/helpers/search.ts"
      to: "spacetimedb/src/helpers/location.ts"
      via: "spawnResourceNode call with characterId"
      pattern: "spawnResourceNode.*characterId"
    - from: "spacetimedb/src/reducers/items.ts"
      to: "ctx.db.resourceNode"
      via: "delete instead of deplete for personal nodes"
      pattern: "characterId.*delete"
    - from: "src/App.vue"
      to: "resourceNodes"
      via: "client-side characterId filter"
      pattern: "characterId"
---

<objective>
Replace the shared ResourceNode system with personal per-character resource nodes discovered via the passive search system.

Purpose: Currently all players share the same 3 pre-spawned resource nodes at each location. This makes resources feel static and non-discoverable. The new design makes resource nodes personal -- spawned only when a character's passive search succeeds (65% chance on location entry), scoped to that character, and deleted after gathering (no respawn timer). Each visit to a location re-rolls fresh nodes.

Output: Modified schema, backend helpers, reducers, and client filtering so resource nodes are personal per-character.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/schema/tables.ts (ResourceNode table definition, lines 399-416)
@spacetimedb/src/helpers/location.ts (spawnResourceNode, ensureResourceNodesForLocation, ensureLocationRuntimeBootstrap)
@spacetimedb/src/helpers/search.ts (performPassiveSearch)
@spacetimedb/src/reducers/items.ts (finish_gather reducer, respawn_resource reducer)
@src/App.vue (resourceNodesHere computed, lines 1685-1721)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Backend schema and helper changes for personal resource nodes</name>
  <files>
    spacetimedb/src/schema/tables.ts
    spacetimedb/src/helpers/location.ts
    spacetimedb/src/helpers/search.ts
  </files>
  <action>
1. **spacetimedb/src/schema/tables.ts** -- Add `characterId: t.u64().optional()` field to ResourceNode table (after `locationId`). Add a `by_character` btree index: `{ name: 'by_character', algorithm: 'btree', columns: ['characterId'] }` alongside existing `by_location` index.

2. **spacetimedb/src/helpers/location.ts** -- Modify `spawnResourceNode` to accept an optional second parameter `characterId?: bigint`. When provided, include it in the inserted row. When not provided, insert `characterId: undefined` (backward compat for any remaining shared nodes). The insert call at line 143 should include `characterId: characterId ?? undefined`.

   Remove the call to `ensureResourceNodesForLocation(ctx, location.id)` from inside `ensureLocationRuntimeBootstrap` (line 284). This stops shared resource nodes from being pre-spawned at bootstrap. Keep the `ensureResourceNodesForLocation` function exported (it may still be referenced elsewhere) but the bootstrap no longer calls it.

   NOTE: Do NOT remove `ensureResourceNodesForLocation` from `ensureSpawnsForLocation` -- that function does NOT call it (only enemy spawns). The only caller in bootstrap is `ensureLocationRuntimeBootstrap`.

3. **spacetimedb/src/helpers/search.ts** -- Import `spawnResourceNode` and `getGatherableResourceTemplates` from `./location`. When `foundResources` is true (the 65% roll succeeds):
   - First, delete any existing personal resource nodes for this character at this location: iterate `ctx.db.resourceNode.by_character.filter(character.id)` and delete those where `node.locationId === locationId`.
   - Then spawn 2-3 personal nodes: use a deterministic count from seed (`2 + Number(seed % 2n)` gives 2 or 3). Call `spawnResourceNode(ctx, locationId, character.id)` that many times. Each call already uses ctx.timestamp for randomness which will vary per insert due to the seed incorporating locationId and templateId.
   - To get varied resource types across the 2-3 spawns, before each spawn call, add a small offset to differentiate: the simplest approach is to call `spawnResourceNode` directly for each, since the existing function uses `ctx.timestamp.microsSinceUnixEpoch + locationId` as its roll seed. To get different resources per spawn, modify the spawnResourceNode function to accept an optional third parameter `seedOffset?: bigint` (default 0n) and add it to the roll seed at line 129: `let roll = (ctx.timestamp.microsSinceUnixEpoch + locationId + (seedOffset ?? 0n)) % totalWeight;` and also to quantitySeed at line 138. Then in search.ts, pass `BigInt(i) * 1000n` as seedOffset for each spawn (i = 0, 1, 2).

   When `foundResources` is false, also clean up old personal nodes for this character at this location (so stale nodes from a previous visit don't linger).
  </action>
  <verify>
    Run `cd C:/projects/uwr/spacetimedb && npx tsc --noEmit` to confirm no TypeScript errors in the backend module. Grep for `ensureResourceNodesForLocation` in `ensureLocationRuntimeBootstrap` to confirm it is removed. Grep for `spawnResourceNode` in search.ts to confirm it is called.
  </verify>
  <done>
    ResourceNode table has characterId field and by_character index. spawnResourceNode accepts optional characterId and seedOffset. ensureLocationRuntimeBootstrap no longer pre-spawns shared resource nodes. performPassiveSearch spawns 2-3 personal nodes on success and cleans up old personal nodes.
  </done>
</task>

<task type="auto">
  <name>Task 2: Gather completion and client filtering for personal nodes</name>
  <files>
    spacetimedb/src/reducers/items.ts
    src/App.vue
  </files>
  <action>
1. **spacetimedb/src/reducers/items.ts** -- In the `finish_gather` reducer (around line 720-731): After the item is added to inventory, check if the node has a `characterId` set (i.e., it's a personal node). If `node.characterId` is truthy:
   - Delete the node directly: `ctx.db.resourceNode.id.delete(node.id);`
   - Do NOT set state to 'depleted', do NOT schedule ResourceRespawnTick.
   - Skip the existing depleted/respawn logic entirely for personal nodes.
   If `node.characterId` is falsy (shared node, legacy), keep existing behavior unchanged (set state='depleted', schedule respawn).

   The modified logic should look like:
   ```
   // After addItemToInventory and logPrivateAndGroup...
   if (node.characterId) {
     // Personal node: delete after gathering, no respawn
     ctx.db.resourceNode.id.delete(node.id);
   } else {
     // Shared node: existing deplete + respawn logic
     const respawnAt = ctx.timestamp.microsSinceUnixEpoch + RESOURCE_RESPAWN_MICROS;
     ctx.db.resourceNode.id.update({
       ...node,
       state: 'depleted',
       lockedByCharacterId: undefined,
       respawnAtMicros: respawnAt,
     });
     ctx.db.resourceRespawnTick.insert({
       scheduledId: 0n,
       scheduledAt: ScheduleAt.time(respawnAt),
       nodeId: node.id,
     });
   }
   ```

2. **src/App.vue** -- In the `resourceNodesHere` computed (line 1685-1721): After the existing `.filter((node) => node.locationId.toString() === currentLocation.value?.id.toString())` filter, add an additional filter to only show personal nodes belonging to the selected character:
   ```
   .filter((node) => {
     // Show shared nodes (no characterId) OR personal nodes for this character
     if (!node.characterId) return true;
     return node.characterId.toString() === selectedCharacter.value?.id.toString();
   })
   ```
   This goes between the locationId filter and the state filter.

3. After both changes, regenerate client bindings so the ResourceNode type includes characterId:
   ```
   spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb
   ```
  </action>
  <verify>
    Run `cd C:/projects/uwr/spacetimedb && npx tsc --noEmit` for backend. Run `cd C:/projects/uwr && npx vue-tsc --noEmit` (or equivalent) for client. Verify the generated `resource_node_table.ts` binding includes `characterId` field. Grep `finish_gather` area in items.ts for `node.characterId` to confirm branching logic exists.
  </verify>
  <done>
    Personal resource nodes are deleted after gathering (no respawn timer). Shared nodes retain existing respawn behavior. Client only displays resource nodes belonging to the selected character (or shared nodes with no characterId). Bindings regenerated with new characterId field.
  </done>
</task>

</tasks>

<verification>
1. Backend compiles: `cd C:/projects/uwr/spacetimedb && npx tsc --noEmit`
2. ResourceNode schema has characterId field: grep `characterId` in tables.ts ResourceNode section
3. ensureLocationRuntimeBootstrap no longer calls ensureResourceNodesForLocation: grep confirms removal
4. performPassiveSearch spawns personal nodes: grep `spawnResourceNode` in search.ts
5. finish_gather branches on characterId: grep `node.characterId` in items.ts
6. Client filters by characterId: grep `characterId` in resourceNodesHere in App.vue
7. Generated bindings include characterId: check src/module_bindings/resource_node_table.ts
</verification>

<success_criteria>
- ResourceNode table has optional characterId column with by_character btree index
- Bootstrap and movement no longer pre-spawn shared resource nodes
- Passive search (65% roll) spawns 2-3 personal nodes per character per location entry
- Old personal nodes cleaned up on location re-entry (regardless of search roll)
- Gathering a personal node deletes it immediately (no respawn timer)
- Client filters resource nodes to show only the selected character's personal nodes
- Existing shared nodes (no characterId) still work via legacy respawn path
</success_criteria>

<output>
After completion, create `.planning/quick/118-replace-shared-resource-nodes-with-perso/118-01-SUMMARY.md`
</output>
