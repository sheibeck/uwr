import { useSpacetimeDB, useTable as _useTable } from 'spacetimedb/vue';
import { tables } from '../module_bindings';
import { ref, type Ref } from 'vue';

// v2 useTable returns Readonly<Ref<readonly Row[]>>. Components expect Ref<Row[]>.
// This wrapper strips the readonly since consumer code never mutates subscription data.
function useTable<T = any>(table: any): [Ref<T[]>, Ref<boolean>] {
  return _useTable(table) as unknown as [Ref<T[]>, Ref<boolean>];
}

export const useGameData = () => {
  const conn = useSpacetimeDB();
  const [players] = useTable(tables.player);
  const [users] = useTable(tables.user);
  const [friendRequests] = useTable(tables.friend_request);
  const [friends] = useTable(tables.friend);
  const [groupInvites] = useTable(tables.group_invite);
  const [characters] = useTable(tables.character);
  const [regions] = useTable(tables.region);
  const [locationConnections] = useTable(tables.location_connection);
  const [itemTemplates] = useTable(tables.item_template);
  const [itemInstances] = useTable(tables.item_instance);
  const [recipeTemplates] = useTable(tables.recipe_template);
  const [recipeDiscovered] = useTable(tables.recipe_discovered);
  const [itemCooldowns] = useTable(tables.item_cooldown);
  const [resourceNodes] = useTable(tables.resource_node);
  const [resourceGathers] = useTable(tables.resource_gather);
  const [hotbarSlots] = useTable(tables.hotbar_slot);
  const [abilityTemplates] = useTable(tables.ability_template);
  const [locations] = useTable(tables.location);
  const [npcs] = useTable(tables.npc);
  const [vendorInventory] = useTable(tables.vendor_inventory);
  const [enemyTemplates] = useTable(tables.enemy_template);
  const [enemyRoleTemplates] = useTable(tables.enemy_role_template);
  const [enemyAbilities] = useTable(tables.enemy_ability);
  const [enemySpawns] = useTable(tables.enemy_spawn);
  const [enemySpawnMembers] = useTable(tables.enemy_spawn_member);
  const [pullStates] = useTable(tables.pull_state);
  const [combatEncounters] = useTable(tables.combat_encounter);
  const [combatParticipants] = useTable(tables.combat_participant);
  const [combatEnemies] = useTable(tables.combat_enemy);
  const [activePets] = useTable(tables.active_pet);
  const [combatEnemyEffects] = useTable(tables.combat_enemy_effect);
  const [combatEnemyCasts] = useTable(tables.combat_enemy_cast);
  const aggroEntries = ref([] as any[]); // aggro_entry is private in v2, not subscribable
  const [combatResults] = useTable(tables.combat_result);
  const [combatLoot] = useTable(tables.combat_loot);
  const [groups] = useTable(tables.group);
  const [characterEffects] = useTable(tables.character_effect);
  const [characterLogoutTicks] = useTable(tables.character_logout_tick);
  const [characterCasts] = useTable(tables.character_cast);
  const [abilityCooldowns] = useTable(tables.ability_cooldown);
  const [worldEvents] = useTable(tables.event_world);
  const [locationEvents] = useTable(tables.event_location);
  const [privateEvents] = useTable(tables.event_private);
  const [groupEvents] = useTable(tables.event_group);
  const [groupMembers] = useTable(tables.group_member);
  const [npcDialogs] = useTable(tables.npc_dialog);
  const [questTemplates] = useTable(tables.quest_template);
  const [questInstances] = useTable(tables.quest_instance);
  const [worldState] = useTable(tables.world_state);
  const [tradeSessions] = useTable(tables.trade_session);
  const [tradeItems] = useTable(tables.trade_item);
  const [races] = useTable(tables.race);
  const [factions] = useTable(tables.faction);
  const [factionStandings] = useTable(tables.faction_standing);
  const [panelLayouts] = useTable(tables.ui_panel_layout);
  const [travelCooldowns] = useTable(tables.travel_cooldown);
  const [renownRows] = useTable(tables.renown);
  const [renownPerks] = useTable(tables.renown_perk);
  const [renownServerFirsts] = useTable(tables.renown_server_first);
  const [achievements] = useTable(tables.achievement);
  const [npcAffinities] = useTable(tables.npc_affinity);
  const [npcDialogueOptions] = useTable(tables.npc_dialogue_option);
  const [corpses] = useTable(tables.corpse);
  const [corpseItems] = useTable(tables.corpse_item);
  const [pendingSpellCasts] = useTable(tables.pending_spell_cast);
  const [questItems] = useTable(tables.quest_item);
  const [namedEnemies] = useTable(tables.named_enemy);
  const [searchResults] = useTable(tables.search_result);
  const [itemAffixes] = useTable(tables.item_affix);
  const [worldEventRows, worldEventRowsLoading] = useTable(tables.world_event);
  const [eventContributions, eventContributionsLoading] = useTable(tables.event_contribution);
  const [eventSpawnEnemies] = useTable(tables.event_spawn_enemy);
  const [eventSpawnItems] = useTable(tables.event_spawn_item);
  const [eventObjectives] = useTable(tables.event_objective);
  const [appVersionRows] = useTable(tables.app_version);
  const [activeBardSongs] = useTable(tables.active_bard_song);
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
