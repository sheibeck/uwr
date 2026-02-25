---
phase: quick-315
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/useGameData.ts
  - src/composables/data/useCoreData.ts
  - src/composables/data/useCombatData.ts
  - src/composables/data/useWorldData.ts
  - src/composables/data/useSocialData.ts
  - src/composables/data/useCraftingData.ts
  - src/composables/data/useQuestData.ts
  - src/composables/data/useWorldEventData.ts
autonomous: true
requirements: [QUICK-315]
must_haves:
  truths:
    - "76 individual useTable() subscription messages are replaced by ~8 batched subscriptionBuilder().subscribe([...queries]) calls"
    - "All reactive refs in useGameData return the same data shape as before — App.vue destructuring unchanged"
    - "Event table onInsert wiring (from Phase 23 Plan 02) is preserved unchanged"
    - "Game loads and all panels display data correctly after refactor"
  artifacts:
    - path: "src/composables/data/useCoreData.ts"
      provides: "Batched subscription for ~20 always-on tables (player, character, race, location, etc.)"
    - path: "src/composables/data/useCombatData.ts"
      provides: "Batched subscription for ~12 combat tables"
    - path: "src/composables/data/useWorldData.ts"
      provides: "Batched subscription for ~13 world/location tables"
    - path: "src/composables/data/useSocialData.ts"
      provides: "Batched subscription for ~8 social tables"
    - path: "src/composables/data/useCraftingData.ts"
      provides: "Batched subscription for ~3 crafting tables"
    - path: "src/composables/data/useQuestData.ts"
      provides: "Batched subscription for ~4 quest tables"
    - path: "src/composables/data/useWorldEventData.ts"
      provides: "Batched subscription for ~5 world event tables"
    - path: "src/composables/useGameData.ts"
      provides: "Thin facade that re-exports all domain refs — App.vue import unchanged"
  key_links:
    - from: "src/composables/useGameData.ts"
      to: "src/composables/data/*.ts"
      via: "import and spread from domain composables"
    - from: "src/composables/data/*.ts"
      to: "module_bindings"
      via: "conn.subscriptionBuilder().subscribe([...queries]) + conn.db.TABLE.onInsert/onUpdate/onDelete"
---

<objective>
Replace 76 individual useTable() WebSocket subscription messages with ~8 batched domain subscriptions using subscriptionBuilder().subscribe([...queries]). Split the monolithic useGameData composable into domain-specific data composables while keeping useGameData as a thin re-export facade so App.vue requires zero changes.

Purpose: Reduce WebSocket connection overhead from 76 individual Subscribe messages to ~8 batched messages. Establish domain-scoped subscription pattern for future conditional subscription activation.
Output: Domain composables in src/composables/data/, refactored useGameData.ts facade.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/phases/23-v2-subscription-optimization/23-RESEARCH.md
@.planning/phases/23-v2-subscription-optimization/23-02-SUMMARY.md
@src/composables/useGameData.ts
@src/App.vue (lines 592-693 — useGameData destructuring)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create domain data composables with batched subscriptions</name>
  <files>
    src/composables/data/useCoreData.ts
    src/composables/data/useCombatData.ts
    src/composables/data/useWorldData.ts
    src/composables/data/useSocialData.ts
    src/composables/data/useCraftingData.ts
    src/composables/data/useQuestData.ts
    src/composables/data/useWorldEventData.ts
  </files>
  <action>
Create `src/composables/data/` directory with 7 domain composables. Each composable:

1. Accepts `conn` (the reactive ConnectionState from `useSpacetimeDB()`) as a parameter
2. Creates `shallowRef<any[]>([])` for each table in its domain
3. Uses `watch(conn.isActive)` to register a single `conn.getConnection().subscriptionBuilder().subscribe([...queries])` call with all domain queries batched into one array
4. In the `onApplied` callback, populates all refs from `[...conn.getConnection().db.TABLE.iter()]`
5. Registers `onInsert`, `onUpdate`, `onDelete` callbacks on each table to keep refs reactive after initial load
6. Returns all refs as a flat object (same property names as current useGameData)

**Domain groupings (from 23-RESEARCH.md "Domain Grouping Analysis" section):**

**useCoreData (~20 tables, always active):**
- player, user, character, world_state, region, location, location_connection, race, faction, faction_standing, ability_template, item_template, item_instance, hotbar_slot, item_cooldown, item_affix, renown, renown_perk, renown_server_first, achievement, app_version, ui_panel_layout

**useCombatData (~12 tables):**
- combat_encounter, combat_participant, combat_enemy, combat_enemy_effect, combat_enemy_cast, combat_result, combat_loot, pull_state, active_pet, ability_cooldown, character_cast, character_effect, active_bard_song

**useWorldData (~13 tables):**
- enemy_spawn, enemy_spawn_member, enemy_template, enemy_role_template, enemy_ability, npc, vendor_inventory, named_enemy, resource_node, resource_gather, corpse, corpse_item, search_result

**useSocialData (~8 tables):**
- friend_request, friend, group_invite, group, group_member, trade_session, trade_item, npc_affinity, npc_dialogue_option

**useCraftingData (~3 tables):**
- recipe_template, recipe_discovered, pending_spell_cast

**useQuestData (~4 tables):**
- quest_template, quest_instance, quest_item, npc_dialog

**useWorldEventData (~5 tables):**
- world_event, event_contribution, event_spawn_enemy, event_spawn_item, event_objective

**Remaining tables (add to useCoreData):**
- travel_cooldown, character_logout_tick, my_bank_slots

**Pattern for each composable (example for useCoreData):**
```typescript
import { shallowRef, watch, type Ref } from 'vue';
import type { ConnectionState } from 'spacetimedb/vue';

export function useCoreData(conn: ConnectionState) {
  const players = shallowRef<any[]>([]);
  const characters = shallowRef<any[]>([]);
  // ... all refs

  function refresh(dbConn: any) {
    players.value = [...dbConn.db.player.iter()];
    characters.value = [...dbConn.db.character.iter()];
    // ... all tables
  }

  watch(
    () => conn.isActive,
    (isActive) => {
      if (!isActive) return;
      const dbConn = conn.getConnection();
      if (!dbConn) return;

      dbConn.subscriptionBuilder()
        .onApplied(() => refresh(dbConn))
        .subscribe([
          'SELECT * FROM player',
          'SELECT * FROM character',
          // ... all core queries
        ]);

      // Register reactive callbacks
      const rebuildPlayers = () => { players.value = [...dbConn.db.player.iter()]; };
      dbConn.db.player.onInsert(rebuildPlayers);
      dbConn.db.player.onUpdate(rebuildPlayers);
      dbConn.db.player.onDelete(rebuildPlayers);
      // ... for each table
    },
    { immediate: true }
  );

  return { players, characters, /* ... */ };
}
```

**IMPORTANT:** The `aggroEntries` ref is a special case — it's `ref([] as any[])` with no useTable call (aggro_entry is private/not subscribable). Keep it as-is, initialized in useCombatData as a plain `ref([])`.

**IMPORTANT:** The `worldEventRowsLoading` and `eventContributionsLoading` refs (from useTable's second return value) must also be exposed. Create `shallowRef(true)` for these and set to `false` in onApplied.

**DO NOT** change the event table handling (worldEvents, locationEvents, privateEvents, groupEvents). That stays in useGameData per Phase 23 Plan 02.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx tsc --noEmit --skipLibCheck 2>&1 | head -30</automated>
    <manual>Check that each composable file exists and exports the correct ref names</manual>
  </verify>
  <done>7 domain composables exist in src/composables/data/, each batching its domain's tables into a single subscriptionBuilder().subscribe() call, each returning shallowRef-based reactive refs</done>
</task>

<task type="auto">
  <name>Task 2: Refactor useGameData into thin facade over domain composables</name>
  <files>
    src/composables/useGameData.ts
  </files>
  <action>
Rewrite `useGameData.ts` to:

1. Import all 7 domain composables from `./data/`
2. Call `useSpacetimeDB()` once to get `conn`
3. Call each domain composable with `conn`
4. Keep the event table onInsert handling (worldEvents, locationEvents, privateEvents, groupEvents) EXACTLY as-is from Phase 23 Plan 02 — do not move this to a domain composable
5. Spread/return all refs from all domain composables plus event refs into one flat object
6. Return the same property names as before so App.vue destructuring is unchanged

The refactored useGameData should look approximately like:

```typescript
import { useSpacetimeDB } from 'spacetimedb/vue';
import { shallowRef, watch, ref } from 'vue';
import { useCoreData } from './data/useCoreData';
import { useCombatData } from './data/useCombatData';
import { useWorldData } from './data/useWorldData';
import { useSocialData } from './data/useSocialData';
import { useCraftingData } from './data/useCraftingData';
import { useQuestData } from './data/useQuestData';
import { useWorldEventData } from './data/useWorldEventData';

export const useGameData = () => {
  const conn = useSpacetimeDB();

  const core = useCoreData(conn);
  const combat = useCombatData(conn);
  const world = useWorldData(conn);
  const social = useSocialData(conn);
  const crafting = useCraftingData(conn);
  const quest = useQuestData(conn);
  const worldEvent = useWorldEventData(conn);

  // Event tables — onInsert pattern from Phase 23 Plan 02
  // (kept here, not in domain composable, because event:true tables
  // use a fundamentally different pattern than subscription-based tables)
  const MAX_CLIENT_EVENTS = 200;
  const worldEvents = shallowRef<any[]>([]);
  const locationEvents = shallowRef<any[]>([]);
  const privateEvents = shallowRef<any[]>([]);
  const groupEvents = shallowRef<any[]>([]);

  watch(
    () => conn.isActive,
    (isActive) => {
      if (!isActive) return;
      const dbConn = conn.getConnection();
      if (!dbConn) return;
      dbConn.subscriptionBuilder().subscribe([
        'SELECT * FROM event_world',
        'SELECT * FROM event_location',
        'SELECT * FROM event_private',
        'SELECT * FROM event_group',
      ]);
      dbConn.db.event_world.onInsert((_ctx: any, row: any) => {
        worldEvents.value = [...worldEvents.value.slice(-(MAX_CLIENT_EVENTS - 1)), row];
      });
      // ... same for location, private, group
    },
    { immediate: true }
  );

  return {
    conn,
    ...core,
    ...combat,
    ...world,
    ...social,
    ...crafting,
    ...quest,
    ...worldEvent,
    worldEvents,
    locationEvents,
    privateEvents,
    groupEvents,
  };
};
```

**CRITICAL:** Verify the return object has EXACTLY the same property names as the current useGameData. Cross-reference with App.vue lines 616-693 destructuring. Every property must match:
- conn, players, users, friendRequests, friends, groupInvites, characters, regions, locationConnections, itemTemplates, itemInstances, recipeTemplates, recipeDiscovered, itemCooldowns, resourceNodes, resourceGathers, hotbarSlots, abilityTemplates, locations, npcs, vendorInventory, enemyTemplates, enemyRoleTemplates, enemyAbilities, enemySpawns, enemySpawnMembers, pullStates, combatEncounters, combatParticipants, combatEnemies, activePets, combatEnemyEffects, combatEnemyCasts, aggroEntries, combatResults, combatLoot, groups, characterEffects, characterLogoutTicks, characterCasts, abilityCooldowns, worldEvents, locationEvents, privateEvents, groupEvents, groupMembers, npcDialogs, questTemplates, questInstances, worldState, tradeSessions, tradeItems, races, factions, factionStandings, panelLayouts, travelCooldowns, renownRows, renownPerks, renownServerFirsts, achievements, npcAffinities, npcDialogueOptions, corpses, corpseItems, pendingSpellCasts, questItems, namedEnemies, searchResults, itemAffixes, worldEventRows, worldEventRowsLoading, eventContributions, eventContributionsLoading, eventSpawnEnemies, eventSpawnItems, eventObjectives, appVersionRows, activeBardSongs, bankSlots

Remove the old `useTable` import and all individual `useTable()` calls. Remove the `_useTable` wrapper function.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx tsc --noEmit --skipLibCheck 2>&1 | head -30</automated>
    <manual>Run the app locally (npm run dev), log in, verify game loads with all panels showing data. Check browser console for WebSocket messages — should see ~8 Subscribe messages instead of ~76.</manual>
  </verify>
  <done>useGameData is a thin facade importing from 7 domain composables. App.vue destructuring works unchanged. Individual useTable() calls replaced with batched subscriptions. Event table onInsert handling preserved.</done>
</task>

</tasks>

<verification>
1. TypeScript compiles without new errors (npx tsc --noEmit --skipLibCheck)
2. App.vue destructuring of useGameData() produces no TypeScript errors
3. Run dev server (npm run dev) — game loads, all panels display data
4. Browser Network/WebSocket tab shows ~8 Subscribe messages instead of ~76 on connection
5. Event log (worldEvents, locationEvents, etc.) still receives and displays events
</verification>

<success_criteria>
- 76 individual useTable() WebSocket subscriptions replaced by ~8 batched subscriptionBuilder().subscribe([...queries]) calls
- useGameData return shape unchanged — zero changes to App.vue
- 7 domain composables created in src/composables/data/
- Event table onInsert wiring preserved from Phase 23 Plan 02
- Game functional: all data displays correctly after refactor
</success_criteria>

<output>
After completion, create `.planning/quick/315-replace-subscribetoalltables-with-scoped/315-SUMMARY.md`
</output>
