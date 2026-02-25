import { useSpacetimeDB } from 'spacetimedb/vue';
import { type Ref, shallowRef, watch } from 'vue';
import { useCoreData } from './data/useCoreData';
import { useCombatData } from './data/useCombatData';
import { useWorldData } from './data/useWorldData';
import { useSocialData } from './data/useSocialData';
import { useCraftingData } from './data/useCraftingData';
import { useQuestData } from './data/useQuestData';
import { useWorldEventData } from './data/useWorldEventData';

export const useGameData = (currentLocationId: Ref<bigint | null>) => {
  const conn = useSpacetimeDB();

  const core = useCoreData(conn);
  const combat = useCombatData(conn);
  const world = useWorldData(conn, currentLocationId);
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

      // Subscribe explicitly to event tables (event:true, excluded from regular subscriptions)
      dbConn.subscriptionBuilder().subscribe([
        'SELECT * FROM event_world',
        'SELECT * FROM event_location',
        'SELECT * FROM event_private',
        'SELECT * FROM event_group',
      ]);

      dbConn.db.event_world.onInsert((_ctx: any, row: any) => {
        worldEvents.value = [...worldEvents.value.slice(-(MAX_CLIENT_EVENTS - 1)), row];
      });
      dbConn.db.event_location.onInsert((_ctx: any, row: any) => {
        locationEvents.value = [...locationEvents.value.slice(-(MAX_CLIENT_EVENTS - 1)), row];
      });
      dbConn.db.event_private.onInsert((_ctx: any, row: any) => {
        privateEvents.value = [...privateEvents.value.slice(-(MAX_CLIENT_EVENTS - 1)), row];
      });
      dbConn.db.event_group.onInsert((_ctx: any, row: any) => {
        groupEvents.value = [...groupEvents.value.slice(-(MAX_CLIENT_EVENTS - 1)), row];
      });
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
