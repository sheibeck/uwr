import { shallowRef, watch } from 'vue';
import { useSpacetimeDB } from 'spacetimedb/vue';
import { toSql } from 'spacetimedb';
import { tables } from '../../module_bindings';

type ConnectionState = ReturnType<typeof useSpacetimeDB>;

export function useQuestData(conn: ConnectionState) {
  const questTemplates = shallowRef<any[]>([]);
  const questInstances = shallowRef<any[]>([]);
  const questItems = shallowRef<any[]>([]);
  const npcDialogs = shallowRef<any[]>([]);
  const allNpcs = shallowRef<any[]>([]);

  function refresh(dbConn: any) {
    questTemplates.value = [...dbConn.db.quest_template.iter()];
    questInstances.value = [...dbConn.db.quest_instance.iter()];
    questItems.value = [...dbConn.db.quest_item.iter()];
    npcDialogs.value = [...dbConn.db.npc_dialog.iter()];
    allNpcs.value = [...dbConn.db.npc.iter()];
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
          toSql(tables.quest_template),
          toSql(tables.quest_instance),
          toSql(tables.quest_item),
          toSql(tables.npc_dialog),
          toSql(tables.npc),
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
      rebind(dbConn.db.npc, allNpcs, () => dbConn.db.npc.iter());
    },
    { immediate: true }
  );

  return {
    questTemplates,
    questInstances,
    questItems,
    npcDialogs,
    allNpcs,
  };
}
