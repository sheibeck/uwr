import { useSpacetimeDB, useTable } from 'spacetimedb/vue';
import { tables } from '../module_bindings';

export const useGameData = () => {
  const conn = useSpacetimeDB();
  const [characters] = useTable(tables.character);
  const [locations] = useTable(tables.location);
  const [enemyTemplates] = useTable(tables.enemyTemplate);
  const [combats] = useTable(tables.combat);
  const [groups] = useTable(tables.group);
  const [worldEvents] = useTable(tables.eventWorld);
  const [locationEvents] = useTable(tables.myLocationEvents);
  const [privateEvents] = useTable(tables.myPrivateEvents);
  const [groupEvents] = useTable(tables.myGroupEvents);

  return {
    conn,
    characters,
    locations,
    enemyTemplates,
    combats,
    groups,
    worldEvents,
    locationEvents,
    privateEvents,
    groupEvents,
  };
};
