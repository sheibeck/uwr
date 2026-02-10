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
  const [recipeTemplates] = useTable(tables.recipeTemplate);
  const [recipeDiscovered] = useTable(tables.recipeDiscovered);
  const [itemCooldowns] = useTable(tables.itemCooldown);
  const [hotbarSlots] = useTable(tables.hotbarSlot);
  const [locations] = useTable(tables.location);
  const [npcs] = useTable(tables.npc);
  const [vendorInventory] = useTable(tables.vendorInventory);
  const [enemyTemplates] = useTable(tables.enemyTemplate);
  const [enemyRoleTemplates] = useTable(tables.enemyRoleTemplate);
  const [enemyAbilities] = useTable(tables.enemyAbility);
  const [enemySpawns] = useTable(tables.enemySpawn);
  const [enemySpawnMembers] = useTable(tables.enemySpawnMember);
  const [combatEncounters] = useTable(tables.combatEncounter);
  const [combatParticipants] = useTable(tables.combatParticipant);
  const [combatEnemies] = useTable(tables.combatEnemy);
  const [combatEnemyEffects] = useTable(tables.combatEnemyEffect);
  const [combatEnemyCasts] = useTable(tables.combatEnemyCast);
  const [aggroEntries] = useTable(tables.aggroEntry);
  const [combatResults] = useTable(tables.myCombatResults);
  const [combatLoot] = useTable(tables.myCombatLoot);
  const [groups] = useTable(tables.group);
  const [characterEffects] = useTable(tables.myCharacterEffects);
  const [characterCasts] = useTable(tables.characterCast);
  const [abilityCooldowns] = useTable(tables.abilityCooldown);
  const [worldEvents] = useTable(tables.eventWorld);
  const [locationEvents] = useTable(tables.myLocationEvents);
  const [privateEvents] = useTable(tables.myPrivateEvents);
  const [groupEvents] = useTable(tables.myGroupEvents);
  const [groupMembers] = useTable(tables.myGroupMembers);
  const [npcDialogs] = useTable(tables.myNpcDialog);
  const [questTemplates] = useTable(tables.questTemplate);
  const [questInstances] = useTable(tables.myQuests);
  const [worldState] = useTable(tables.worldState);

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
    recipeTemplates,
    recipeDiscovered,
    itemCooldowns,
    hotbarSlots,
    locations,
    npcs,
    vendorInventory,
    enemyTemplates,
    enemyRoleTemplates,
    enemyAbilities,
    enemySpawns,
    enemySpawnMembers,
    combatEncounters,
    combatParticipants,
    combatEnemies,
    combatEnemyEffects,
    combatEnemyCasts,
    aggroEntries,
    combatResults,
    combatLoot,
    groups,
    characterEffects,
    characterCasts,
    abilityCooldowns,
    worldEvents,
    locationEvents,
    privateEvents,
    groupEvents,
    groupMembers,
    npcDialogs,
    questTemplates,
    questInstances,
    worldState,
  };
};
