import { type Ref, shallowRef, watch } from 'vue';
import { useSpacetimeDB } from 'spacetimedb/vue';
import { toSql } from 'spacetimedb';
import { tables, type SubscriptionHandle } from '../../module_bindings';

type ConnectionState = ReturnType<typeof useSpacetimeDB>;

export function useWorldData(conn: ConnectionState, currentLocationId: Ref<bigint | null>) {
  // --- Location-scoped refs (Group A: filtered by WHERE locationId) ---
  const enemySpawns = shallowRef<any[]>([]);
  const npcs = shallowRef<any[]>([]);
  const namedEnemies = shallowRef<any[]>([]);
  const resourceNodes = shallowRef<any[]>([]);
  const corpses = shallowRef<any[]>([]);
  const searchResults = shallowRef<any[]>([]);

  // --- Global/template refs (Group B: unfiltered SELECT *) ---
  const enemySpawnMembers = shallowRef<any[]>([]);
  const enemyTemplates = shallowRef<any[]>([]);
  const enemyRoleTemplates = shallowRef<any[]>([]);
  const enemyAbilities = shallowRef<any[]>([]);
  const vendorInventory = shallowRef<any[]>([]);
  const resourceGathers = shallowRef<any[]>([]);
  const corpseItems = shallowRef<any[]>([]);

  // Track the current location subscription handle for subscribe-before-unsubscribe
  let locationSubHandle: SubscriptionHandle | null = null;

  function refreshGlobal(dbConn: any) {
    enemySpawnMembers.value = [...dbConn.db.enemy_spawn_member.iter()];
    enemyTemplates.value = [...dbConn.db.enemy_template.iter()];
    enemyRoleTemplates.value = [...dbConn.db.enemy_role_template.iter()];
    enemyAbilities.value = [...dbConn.db.enemy_ability.iter()];
    vendorInventory.value = [...dbConn.db.vendor_inventory.iter()];
    resourceGathers.value = [...dbConn.db.resource_gather.iter()];
    corpseItems.value = [...dbConn.db.corpse_item.iter()];
  }

  function refreshLocationScoped(dbConn: any) {
    enemySpawns.value = [...dbConn.db.enemy_spawn.iter()];
    npcs.value = [...dbConn.db.npc.iter()];
    namedEnemies.value = [...dbConn.db.named_enemy.iter()];
    resourceNodes.value = [...dbConn.db.resource_node.iter()];
    corpses.value = [...dbConn.db.corpse.iter()];
    searchResults.value = [...dbConn.db.search_result.iter()];
  }

  watch(
    () => conn.isActive,
    (isActive) => {
      if (!isActive) return;
      const dbConn = conn.getConnection();
      if (!dbConn) return;

      // --- Group B: Global/template tables (unfiltered SELECT *) ---
      dbConn.subscriptionBuilder()
        .onApplied(() => refreshGlobal(dbConn))
        .subscribe([
          toSql(tables.enemy_spawn_member),
          toSql(tables.enemy_template),
          toSql(tables.enemy_role_template),
          toSql(tables.enemy_ability),
          toSql(tables.vendor_inventory),
          toSql(tables.resource_gather),
          toSql(tables.corpse_item),
        ]);

      // --- Rebind callbacks for ALL tables (fire on any insert/update/delete) ---
      const rebind = (table: any, ref: { value: any[] }, iter: () => Iterable<any>) => {
        const rebuild = () => { ref.value = [...iter()]; };
        table.onInsert(rebuild);
        table.onUpdate(rebuild);
        table.onDelete(rebuild);
      };

      // Group A: location-scoped (rebind still works — iter() returns local cache contents)
      rebind(dbConn.db.enemy_spawn, enemySpawns, () => dbConn.db.enemy_spawn.iter());
      rebind(dbConn.db.npc, npcs, () => dbConn.db.npc.iter());
      rebind(dbConn.db.named_enemy, namedEnemies, () => dbConn.db.named_enemy.iter());
      rebind(dbConn.db.resource_node, resourceNodes, () => dbConn.db.resource_node.iter());
      rebind(dbConn.db.corpse, corpses, () => dbConn.db.corpse.iter());
      rebind(dbConn.db.search_result, searchResults, () => dbConn.db.search_result.iter());

      // Group B: global/template
      rebind(dbConn.db.enemy_spawn_member, enemySpawnMembers, () => dbConn.db.enemy_spawn_member.iter());
      rebind(dbConn.db.enemy_template, enemyTemplates, () => dbConn.db.enemy_template.iter());
      rebind(dbConn.db.enemy_role_template, enemyRoleTemplates, () => dbConn.db.enemy_role_template.iter());
      rebind(dbConn.db.enemy_ability, enemyAbilities, () => dbConn.db.enemy_ability.iter());
      rebind(dbConn.db.vendor_inventory, vendorInventory, () => dbConn.db.vendor_inventory.iter());
      rebind(dbConn.db.resource_gather, resourceGathers, () => dbConn.db.resource_gather.iter());
      rebind(dbConn.db.corpse_item, corpseItems, () => dbConn.db.corpse_item.iter());
    },
    { immediate: true }
  );

  // --- Group A: Location-scoped subscription with WHERE filtering ---
  // Watch currentLocationId for changes and subscribe-before-unsubscribe
  watch(
    currentLocationId,
    (locId) => {
      const dbConn = conn.getConnection();
      if (!dbConn || locId == null) return;

      const oldHandle = locationSubHandle;

      const queries = [
        toSql(tables.enemy_spawn.where(r => r.locationId.eq(locId))),
        toSql(tables.npc.where(r => r.locationId.eq(locId))),
        toSql(tables.named_enemy.where(r => r.locationId.eq(locId))),
        toSql(tables.resource_node.where(r => r.locationId.eq(locId))),
        toSql(tables.corpse.where(r => r.locationId.eq(locId))),
        toSql(tables.search_result.where(r => r.locationId.eq(locId))),
      ];

      // Subscribe to new location FIRST (subscribe-before-unsubscribe)
      locationSubHandle = dbConn.subscriptionBuilder()
        .onApplied(() => {
          // Refresh location-scoped refs from the now-filtered local cache
          refreshLocationScoped(dbConn);
          // THEN unsubscribe old location (after new data is applied)
          if (oldHandle) {
            oldHandle.unsubscribe();
          }
        })
        .subscribe(queries);
    },
    { immediate: true }
  );

  return {
    enemySpawns,
    enemySpawnMembers,
    enemyTemplates,
    enemyRoleTemplates,
    enemyAbilities,
    npcs,
    vendorInventory,
    namedEnemies,
    resourceNodes,
    resourceGathers,
    corpses,
    corpseItems,
    searchResults,
  };
}
