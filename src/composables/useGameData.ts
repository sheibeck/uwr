import { useSpacetimeDB, useTable } from 'spacetimedb/vue';
import { tables } from '../module_bindings';

export const useGameData = () => {
  const conn = useSpacetimeDB();
  const [players] = useTable(tables.player);
  const [users] = useTable(tables.user);
  const [friendRequests] = useTable(tables.friendRequest);
  const [friends] = useTable(tables.friend);
  const [groupInvites] = useTable(tables.groupInvite);
  const [characters] = useTable(tables.character);
  const [regions] = useTable(tables.region);
  const [locationConnections] = useTable(tables.locationConnection);
  const [itemTemplates] = useTable(tables.itemTemplate);
  const [itemInstances] = useTable(tables.itemInstance);
  const [recipeTemplates] = useTable(tables.recipeTemplate);
  const [recipeDiscovered] = useTable(tables.recipeDiscovered);
  const [itemCooldowns] = useTable(tables.itemCooldown);
  const [resourceNodes] = useTable(tables.resourceNode);
  const [resourceGathers] = useTable(tables.resourceGather);
  const [hotbarSlots] = useTable(tables.hotbarSlot);
  const [abilityTemplates] = useTable(tables.abilityTemplate);
  const [locations] = useTable(tables.location);
  const [npcs] = useTable(tables.npc);
  const [vendorInventory] = useTable(tables.vendorInventory);
  const [enemyTemplates] = useTable(tables.enemyTemplate);
  const [enemyRoleTemplates] = useTable(tables.enemyRoleTemplate);
  const [enemyAbilities] = useTable(tables.enemyAbility);
  const [enemySpawns] = useTable(tables.enemySpawn);
  const [enemySpawnMembers] = useTable(tables.enemySpawnMember);
  const [pullStates] = useTable(tables.pullState);
  const [combatEncounters] = useTable(tables.combatEncounter);
  const [combatParticipants] = useTable(tables.combatParticipant);
  const [combatEnemies] = useTable(tables.combatEnemy);
  const [combatPets] = useTable(tables.combatPet);
  const [combatEnemyEffects] = useTable(tables.combatEnemyEffect);
  const [combatEnemyCasts] = useTable(tables.combatEnemyCast);
  const [aggroEntries] = useTable(tables.aggroEntry);
  const [combatResults] = useTable(tables.combatResult);
  const [combatLoot] = useTable(tables.combatLoot);
  const [groups] = useTable(tables.group);
  const [characterEffects] = useTable(tables.characterEffect);
  const [characterLogoutTicks] = useTable(tables.characterLogoutTick);
  const [characterCasts] = useTable(tables.characterCast);
  const [abilityCooldowns] = useTable(tables.abilityCooldown);
  const [worldEvents] = useTable(tables.eventWorld);
  const [locationEvents] = useTable(tables.eventLocation);
  const [privateEvents] = useTable(tables.eventPrivate);
  const [groupEvents] = useTable(tables.eventGroup);
  const [groupMembers] = useTable(tables.groupMember);
  const [npcDialogs] = useTable(tables.npcDialog);
  const [questTemplates] = useTable(tables.questTemplate);
  const [questInstances] = useTable(tables.questInstance);
  const [worldState] = useTable(tables.worldState);
  const [tradeSessions] = useTable(tables.tradeSession);
  const [tradeItems] = useTable(tables.tradeItem);
  const [races] = useTable(tables.race);
  const [factions] = useTable(tables.faction);
  const [factionStandings] = useTable(tables.factionStanding);
  const [panelLayouts] = useTable(tables.uiPanelLayout);
  const [travelCooldowns] = useTable(tables.travelCooldown);
  const [renownRows] = useTable(tables.renown);
  const [renownPerks] = useTable(tables.renownPerk);
  const [renownServerFirsts] = useTable(tables.renownServerFirst);
  const [achievements] = useTable(tables.achievement);
  const [npcAffinities] = useTable(tables.npcAffinity);
  const [npcDialogueOptions] = useTable(tables.npcDialogueOption);
  const [corpses] = useTable(tables.corpse);
  const [corpseItems] = useTable(tables.corpseItem);
  const [pendingSpellCasts] = useTable(tables.pendingSpellCast);
  const [questItems] = useTable(tables.questItem);
  const [namedEnemies] = useTable(tables.namedEnemy);
  const [searchResults] = useTable(tables.searchResult);
  const [itemAffixes] = useTable(tables.itemAffix);
  const [worldEventRows, worldEventRowsLoading] = useTable(tables.worldEvent);
  const [eventContributions, eventContributionsLoading] = useTable(tables.eventContribution);
  const [eventSpawnEnemies] = useTable(tables.eventSpawnEnemy);
  const [eventSpawnItems] = useTable(tables.eventSpawnItem);
  const [eventObjectives] = useTable(tables.eventObjective);
  // @ts-expect-error bindings pending regeneration — run spacetime generate after publishing
  const [appVersionRows] = useTable(tables.appVersion);

  return {
    conn,
    players,
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
    resourceNodes,
    resourceGathers,
    hotbarSlots,
    abilityTemplates,
    locations,
    npcs,
    vendorInventory,
    enemyTemplates,
    enemyRoleTemplates,
    enemyAbilities,
    enemySpawns,
    enemySpawnMembers,
    pullStates,
    combatEncounters,
    combatParticipants,
    combatEnemies,
    combatPets,
    combatEnemyEffects,
    combatEnemyCasts,
    aggroEntries,
    combatResults,
    combatLoot,
    groups,
    characterEffects,
    characterLogoutTicks,
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
    tradeSessions,
    tradeItems,
    races,
    factions,
    factionStandings,
    panelLayouts,
    travelCooldowns,
    renownRows,
    renownPerks,
    renownServerFirsts,
    achievements,
    npcAffinities,
    npcDialogueOptions,
    corpses,
    corpseItems,
    pendingSpellCasts,
    questItems,
    namedEnemies,
    searchResults,
    itemAffixes,
    worldEventRows,
    worldEventRowsLoading,
    eventContributions,
    eventContributionsLoading,
    eventSpawnEnemies,
    eventSpawnItems,
    eventObjectives,
    appVersionRows,
  };
};
