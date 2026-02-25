import { shallowRef, watch } from 'vue';
import { useSpacetimeDB } from 'spacetimedb/vue';

type ConnectionState = ReturnType<typeof useSpacetimeDB>;

export function useWorldData(conn: ConnectionState) {
  const enemySpawns = shallowRef<any[]>([]);
  const enemySpawnMembers = shallowRef<any[]>([]);
  const enemyTemplates = shallowRef<any[]>([]);
  const enemyRoleTemplates = shallowRef<any[]>([]);
  const enemyAbilities = shallowRef<any[]>([]);
  const npcs = shallowRef<any[]>([]);
  const vendorInventory = shallowRef<any[]>([]);
  const namedEnemies = shallowRef<any[]>([]);
  const resourceNodes = shallowRef<any[]>([]);
  const resourceGathers = shallowRef<any[]>([]);
  const corpses = shallowRef<any[]>([]);
  const corpseItems = shallowRef<any[]>([]);
  const searchResults = shallowRef<any[]>([]);

  function refresh(dbConn: any) {
    enemySpawns.value = [...dbConn.db.enemy_spawn.iter()];
    enemySpawnMembers.value = [...dbConn.db.enemy_spawn_member.iter()];
    enemyTemplates.value = [...dbConn.db.enemy_template.iter()];
    enemyRoleTemplates.value = [...dbConn.db.enemy_role_template.iter()];
    enemyAbilities.value = [...dbConn.db.enemy_ability.iter()];
    npcs.value = [...dbConn.db.npc.iter()];
    vendorInventory.value = [...dbConn.db.vendor_inventory.iter()];
    namedEnemies.value = [...dbConn.db.named_enemy.iter()];
    resourceNodes.value = [...dbConn.db.resource_node.iter()];
    resourceGathers.value = [...dbConn.db.resource_gather.iter()];
    corpses.value = [...dbConn.db.corpse.iter()];
    corpseItems.value = [...dbConn.db.corpse_item.iter()];
    searchResults.value = [...dbConn.db.search_result.iter()];
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
          'SELECT * FROM enemy_spawn',
          'SELECT * FROM enemy_spawn_member',
          'SELECT * FROM enemy_template',
          'SELECT * FROM enemy_role_template',
          'SELECT * FROM enemy_ability',
          'SELECT * FROM npc',
          'SELECT * FROM vendor_inventory',
          'SELECT * FROM named_enemy',
          'SELECT * FROM resource_node',
          'SELECT * FROM resource_gather',
          'SELECT * FROM corpse',
          'SELECT * FROM corpse_item',
          'SELECT * FROM search_result',
        ]);

      const rebind = (table: any, ref: { value: any[] }, iter: () => Iterable<any>) => {
        const rebuild = () => { ref.value = [...iter()]; };
        table.onInsert(rebuild);
        table.onUpdate(rebuild);
        table.onDelete(rebuild);
      };

      rebind(dbConn.db.enemy_spawn, enemySpawns, () => dbConn.db.enemy_spawn.iter());
      rebind(dbConn.db.enemy_spawn_member, enemySpawnMembers, () => dbConn.db.enemy_spawn_member.iter());
      rebind(dbConn.db.enemy_template, enemyTemplates, () => dbConn.db.enemy_template.iter());
      rebind(dbConn.db.enemy_role_template, enemyRoleTemplates, () => dbConn.db.enemy_role_template.iter());
      rebind(dbConn.db.enemy_ability, enemyAbilities, () => dbConn.db.enemy_ability.iter());
      rebind(dbConn.db.npc, npcs, () => dbConn.db.npc.iter());
      rebind(dbConn.db.vendor_inventory, vendorInventory, () => dbConn.db.vendor_inventory.iter());
      rebind(dbConn.db.named_enemy, namedEnemies, () => dbConn.db.named_enemy.iter());
      rebind(dbConn.db.resource_node, resourceNodes, () => dbConn.db.resource_node.iter());
      rebind(dbConn.db.resource_gather, resourceGathers, () => dbConn.db.resource_gather.iter());
      rebind(dbConn.db.corpse, corpses, () => dbConn.db.corpse.iter());
      rebind(dbConn.db.corpse_item, corpseItems, () => dbConn.db.corpse_item.iter());
      rebind(dbConn.db.search_result, searchResults, () => dbConn.db.search_result.iter());
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
