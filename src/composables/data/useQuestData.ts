import { shallowRef, watch } from 'vue';
import { useSpacetimeDB } from 'spacetimedb/vue';

type ConnectionState = ReturnType<typeof useSpacetimeDB>;

export function useQuestData(conn: ConnectionState) {
  const questTemplates = shallowRef<any[]>([]);
  const questInstances = shallowRef<any[]>([]);
  const questItems = shallowRef<any[]>([]);
  const npcDialogs = shallowRef<any[]>([]);

  function refresh(dbConn: any) {
    questTemplates.value = [...dbConn.db.quest_template.iter()];
    questInstances.value = [...dbConn.db.quest_instance.iter()];
    questItems.value = [...dbConn.db.quest_item.iter()];
    npcDialogs.value = [...dbConn.db.npc_dialog.iter()];
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
          'SELECT * FROM quest_template',
          'SELECT * FROM quest_instance',
          'SELECT * FROM quest_item',
          'SELECT * FROM npc_dialog',
        ]);

      const rebind = (table: any, ref: { value: any[] }, iter: () => Iterable<any>) => {
        const rebuild = () => { ref.value = [...iter()]; };
        table.onInsert(rebuild);
        table.onUpdate(rebuild);
        table.onDelete(rebuild);
      };

      rebind(dbConn.db.quest_template, questTemplates, () => dbConn.db.quest_template.iter());
      rebind(dbConn.db.quest_instance, questInstances, () => dbConn.db.quest_instance.iter());
      rebind(dbConn.db.quest_item, questItems, () => dbConn.db.quest_item.iter());
      rebind(dbConn.db.npc_dialog, npcDialogs, () => dbConn.db.npc_dialog.iter());
    },
    { immediate: true }
  );

  return {
    questTemplates,
    questInstances,
    questItems,
    npcDialogs,
  };
}
