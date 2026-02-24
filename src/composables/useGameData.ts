import { useSpacetimeDB, useTable as _useTable } from 'spacetimedb/vue';
import { tables } from '../module_bindings';
import type { Ref } from 'vue';

// v2 useTable returns Readonly<Ref<readonly Row[]>>. Components expect Ref<Row[]>.
// This wrapper strips the readonly since consumer code never mutates subscription data.
function useTable<T = any>(table: any): [Ref<T[]>, Ref<boolean>] {
  return _useTable(table) as unknown as [Ref<T[]>, Ref<boolean>];
}

export const useGameData = () => {
  const conn = useSpacetimeDB();
  const [players] = useTable(tables.Player);
  const [users] = useTable(tables.User);
  const [friendRequests] = useTable(tables.FriendRequest);
  const [friends] = useTable(tables.Friend);
  const [groupInvites] = useTable(tables.GroupInvite);
  const [characters] = useTable(tables.Character);
  const [regions] = useTable(tables.Region);
  const [locationConnections] = useTable(tables.LocationConnection);
  const [itemTemplates] = useTable(tables.ItemTemplate);
  const [itemInstances] = useTable(tables.ItemInstance);
  const [recipeTemplates] = useTable(tables.RecipeTemplate);
  const [recipeDiscovered] = useTable(tables.RecipeDiscovered);
  const [itemCooldowns] = useTable(tables.ItemCooldown);
  const [resourceNodes] = useTable(tables.ResourceNode);
  const [resourceGathers] = useTable(tables.ResourceGather);
  const [hotbarSlots] = useTable(tables.HotbarSlot);
  const [abilityTemplates] = useTable(tables.AbilityTemplate);
  const [locations] = useTable(tables.Location);
  const [npcs] = useTable(tables.Npc);
  const [vendorInventory] = useTable(tables.VendorInventory);
  const [enemyTemplates] = useTable(tables.EnemyTemplate);
  const [enemyRoleTemplates] = useTable(tables.EnemyRoleTemplate);
  const [enemyAbilities] = useTable(tables.EnemyAbility);
  const [enemySpawns] = useTable(tables.EnemySpawn);
  const [enemySpawnMembers] = useTable(tables.EnemySpawnMember);
  const [pullStates] = useTable(tables.PullState);
  const [combatEncounters] = useTable(tables.CombatEncounter);
  const [combatParticipants] = useTable(tables.CombatParticipant);
  const [combatEnemies] = useTable(tables.CombatEnemy);
  const [activePets] = useTable(tables.ActivePet);
  const [combatEnemyEffects] = useTable(tables.CombatEnemyEffect);
  const [combatEnemyCasts] = useTable(tables.CombatEnemyCast);
  const [aggroEntries] = useTable(tables.AggroEntry);
  const [combatResults] = useTable(tables.CombatResult);
  const [combatLoot] = useTable(tables.CombatLoot);
  const [groups] = useTable(tables.Group);
  const [characterEffects] = useTable(tables.CharacterEffect);
  const [characterLogoutTicks] = useTable(tables.CharacterLogoutTick);
  const [characterCasts] = useTable(tables.CharacterCast);
  const [abilityCooldowns] = useTable(tables.AbilityCooldown);
  const [worldEvents] = useTable(tables.EventWorld);
  const [locationEvents] = useTable(tables.EventLocation);
  const [privateEvents] = useTable(tables.EventPrivate);
  const [groupEvents] = useTable(tables.EventGroup);
  const [groupMembers] = useTable(tables.GroupMember);
  const [npcDialogs] = useTable(tables.NpcDialog);
  const [questTemplates] = useTable(tables.QuestTemplate);
  const [questInstances] = useTable(tables.QuestInstance);
  const [worldState] = useTable(tables.WorldState);
  const [tradeSessions] = useTable(tables.TradeSession);
  const [tradeItems] = useTable(tables.TradeItem);
  const [races] = useTable(tables.Race);
  const [factions] = useTable(tables.Faction);
  const [factionStandings] = useTable(tables.FactionStanding);
  const [panelLayouts] = useTable(tables.UiPanelLayout);
  const [travelCooldowns] = useTable(tables.TravelCooldown);
  const [renownRows] = useTable(tables.Renown);
  const [renownPerks] = useTable(tables.RenownPerk);
  const [renownServerFirsts] = useTable(tables.RenownServerFirst);
  const [achievements] = useTable(tables.Achievement);
  const [npcAffinities] = useTable(tables.NpcAffinity);
  const [npcDialogueOptions] = useTable(tables.NpcDialogueOption);
  const [corpses] = useTable(tables.Corpse);
  const [corpseItems] = useTable(tables.CorpseItem);
  const [pendingSpellCasts] = useTable(tables.PendingSpellCast);
  const [questItems] = useTable(tables.QuestItem);
  const [namedEnemies] = useTable(tables.NamedEnemy);
  const [searchResults] = useTable(tables.SearchResult);
  const [itemAffixes] = useTable(tables.ItemAffix);
  const [worldEventRows, worldEventRowsLoading] = useTable(tables.WorldEvent);
  const [eventContributions, eventContributionsLoading] = useTable(tables.EventContribution);
  const [eventSpawnEnemies] = useTable(tables.EventSpawnEnemy);
  const [eventSpawnItems] = useTable(tables.EventSpawnItem);
  const [eventObjectives] = useTable(tables.EventObjective);
  const [appVersionRows] = useTable(tables.AppVersion);
  const [activeBardSongs] = useTable(tables.ActiveBardSong);
  const [bankSlots] = useTable(tables.my_bank_slots);

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
    activePets,
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
    activeBardSongs,
    bankSlots,
  };
};
