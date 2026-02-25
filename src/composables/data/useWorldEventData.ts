import { shallowRef, watch } from 'vue';
import { useSpacetimeDB } from 'spacetimedb/vue';

type ConnectionState = ReturnType<typeof useSpacetimeDB>;

export function useWorldEventData(conn: ConnectionState) {
  const worldEventRows = shallowRef<any[]>([]);
  const worldEventRowsLoading = shallowRef<boolean>(true);
  const eventContributions = shallowRef<any[]>([]);
  const eventContributionsLoading = shallowRef<boolean>(true);
  const eventSpawnEnemies = shallowRef<any[]>([]);
  const eventSpawnItems = shallowRef<any[]>([]);
  const eventObjectives = shallowRef<any[]>([]);

  function refresh(dbConn: any) {
    worldEventRows.value = [...dbConn.db.world_event.iter()];
    worldEventRowsLoading.value = false;
    eventContributions.value = [...dbConn.db.event_contribution.iter()];
    eventContributionsLoading.value = false;
    eventSpawnEnemies.value = [...dbConn.db.event_spawn_enemy.iter()];
    eventSpawnItems.value = [...dbConn.db.event_spawn_item.iter()];
    eventObjectives.value = [...dbConn.db.event_objective.iter()];
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
          'SELECT * FROM world_event',
          'SELECT * FROM event_contribution',
          'SELECT * FROM event_spawn_enemy',
          'SELECT * FROM event_spawn_item',
          'SELECT * FROM event_objective',
        ]);

      const rebind = (table: any, ref: { value: any[] }, iter: () => Iterable<any>) => {
        const rebuild = () => { ref.value = [...iter()]; };
        table.onInsert(rebuild);
        table.onUpdate(rebuild);
        table.onDelete(rebuild);
      };

      rebind(dbConn.db.world_event, worldEventRows, () => dbConn.db.world_event.iter());
      rebind(dbConn.db.event_contribution, eventContributions, () => dbConn.db.event_contribution.iter());
      rebind(dbConn.db.event_spawn_enemy, eventSpawnEnemies, () => dbConn.db.event_spawn_enemy.iter());
      rebind(dbConn.db.event_spawn_item, eventSpawnItems, () => dbConn.db.event_spawn_item.iter());
      rebind(dbConn.db.event_objective, eventObjectives, () => dbConn.db.event_objective.iter());
    },
    { immediate: true }
  );

  return {
    worldEventRows,
    worldEventRowsLoading,
    eventContributions,
    eventContributionsLoading,
    eventSpawnEnemies,
    eventSpawnItems,
    eventObjectives,
  };
}
