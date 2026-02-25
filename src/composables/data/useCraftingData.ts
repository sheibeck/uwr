import { shallowRef, watch } from 'vue';
import { useSpacetimeDB } from 'spacetimedb/vue';
import { toSql } from 'spacetimedb';
import { tables } from '../../module_bindings';

type ConnectionState = ReturnType<typeof useSpacetimeDB>;

export function useCraftingData(conn: ConnectionState) {
  const recipeTemplates = shallowRef<any[]>([]);
  const recipeDiscovered = shallowRef<any[]>([]);
  const pendingSpellCasts = shallowRef<any[]>([]);

  function refresh(dbConn: any) {
    recipeTemplates.value = [...dbConn.db.recipe_template.iter()];
    recipeDiscovered.value = [...dbConn.db.recipe_discovered.iter()];
    pendingSpellCasts.value = [...dbConn.db.pending_spell_cast.iter()];
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
          toSql(tables.recipe_template),
          toSql(tables.recipe_discovered),
          toSql(tables.pending_spell_cast),
        ]);

      const rebind = (table: any, ref: { value: any[] }, iter: () => Iterable<any>) => {
        const rebuild = () => { ref.value = [...iter()]; };
        table.onInsert(rebuild);
        table.onUpdate(rebuild);
        table.onDelete(rebuild);
      };

      rebind(dbConn.db.recipe_template, recipeTemplates, () => dbConn.db.recipe_template.iter());
      rebind(dbConn.db.recipe_discovered, recipeDiscovered, () => dbConn.db.recipe_discovered.iter());
      rebind(dbConn.db.pending_spell_cast, pendingSpellCasts, () => dbConn.db.pending_spell_cast.iter());
    },
    { immediate: true }
  );

  return {
    recipeTemplates,
    recipeDiscovered,
    pendingSpellCasts,
  };
}
