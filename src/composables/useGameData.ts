import { useSpacetimeDB, useTable } from 'spacetimedb/vue';
import { tables } from '../module_bindings';

export const useGameData = () => {
  const conn = useSpacetimeDB();
  const [players] = useTable(tables.player);
  const [myPlayer] = useTable(tables.myPlayer);
  const [users] = useTable(tables.user);
  const [friendRequests] = useTable(tables.myFriendRequests);
  const [friends] = useTable(tables.myFriends);
  const [groupInvites] = useTable(tables.myGroupInvites);
  const [characters] = useTable(tables.character);
  const [regions] = useTable(tables.region);
  const [locationConnections] = useTable(tables.locationConnection);
  const [itemTemplates] = useTable(tables.itemTemplate);
  const [itemInstances] = useTable(tables.itemInstance);
  const [hotbarSlots] = useTable(tables.hotbarSlot);
  const [locations] = useTable(tables.location);
  const [enemyTemplates] = useTable(tables.enemyTemplate);
  const [enemySpawns] = useTable(tables.enemySpawn);
  const [combatEncounters] = useTable(tables.combatEncounter);
  const [combatParticipants] = useTable(tables.combatParticipant);
  const [combatEnemies] = useTable(tables.combatEnemy);
  const [combatResults] = useTable(tables.myCombatResults);
  const [groups] = useTable(tables.group);
  const [worldEvents] = useTable(tables.eventWorld);
  const [locationEvents] = useTable(tables.myLocationEvents);
  const [privateEvents] = useTable(tables.myPrivateEvents);
  const [groupEvents] = useTable(tables.myGroupEvents);
  const [groupMembers] = useTable(tables.myGroupMembers);

  return {
    conn,
    players,
    myPlayer,
    users,
    friendRequests,
    friends,
    groupInvites,
    characters,
    regions,
    locationConnections,
    itemTemplates,
    itemInstances,
    hotbarSlots,
    locations,
    enemyTemplates,
    enemySpawns,
    combatEncounters,
    combatParticipants,
    combatEnemies,
    combatResults,
    groups,
    worldEvents,
    locationEvents,
    privateEvents,
    groupEvents,
    groupMembers,
  };
};
