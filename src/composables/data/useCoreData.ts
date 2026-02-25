import { shallowRef, watch } from 'vue';
import { useSpacetimeDB } from 'spacetimedb/vue';

type ConnectionState = ReturnType<typeof useSpacetimeDB>;

export function useCoreData(conn: ConnectionState) {
  const players = shallowRef<any[]>([]);
  const users = shallowRef<any[]>([]);
  const characters = shallowRef<any[]>([]);
  const worldState = shallowRef<any[]>([]);
  const regions = shallowRef<any[]>([]);
  const locations = shallowRef<any[]>([]);
  const locationConnections = shallowRef<any[]>([]);
  const races = shallowRef<any[]>([]);
  const factions = shallowRef<any[]>([]);
  const factionStandings = shallowRef<any[]>([]);
  const abilityTemplates = shallowRef<any[]>([]);
  const itemTemplates = shallowRef<any[]>([]);
  const itemInstances = shallowRef<any[]>([]);
  const hotbarSlots = shallowRef<any[]>([]);
  const itemCooldowns = shallowRef<any[]>([]);
  const itemAffixes = shallowRef<any[]>([]);
  const renownRows = shallowRef<any[]>([]);
  const renownPerks = shallowRef<any[]>([]);
  const renownServerFirsts = shallowRef<any[]>([]);
  const achievements = shallowRef<any[]>([]);
  const appVersionRows = shallowRef<any[]>([]);
  const panelLayouts = shallowRef<any[]>([]);
  const travelCooldowns = shallowRef<any[]>([]);
  const characterLogoutTicks = shallowRef<any[]>([]);
  const bankSlots = shallowRef<any[]>([]);

  function refresh(dbConn: any) {
    players.value = [...dbConn.db.player.iter()];
    users.value = [...dbConn.db.user.iter()];
    characters.value = [...dbConn.db.character.iter()];
    worldState.value = [...dbConn.db.world_state.iter()];
    regions.value = [...dbConn.db.region.iter()];
    locations.value = [...dbConn.db.location.iter()];
    locationConnections.value = [...dbConn.db.location_connection.iter()];
    races.value = [...dbConn.db.race.iter()];
    factions.value = [...dbConn.db.faction.iter()];
    factionStandings.value = [...dbConn.db.faction_standing.iter()];
    abilityTemplates.value = [...dbConn.db.ability_template.iter()];
    itemTemplates.value = [...dbConn.db.item_template.iter()];
    itemInstances.value = [...dbConn.db.item_instance.iter()];
    hotbarSlots.value = [...dbConn.db.hotbar_slot.iter()];
    itemCooldowns.value = [...dbConn.db.item_cooldown.iter()];
    itemAffixes.value = [...dbConn.db.item_affix.iter()];
    renownRows.value = [...dbConn.db.renown.iter()];
    renownPerks.value = [...dbConn.db.renown_perk.iter()];
    renownServerFirsts.value = [...dbConn.db.renown_server_first.iter()];
    achievements.value = [...dbConn.db.achievement.iter()];
    appVersionRows.value = [...dbConn.db.app_version.iter()];
    panelLayouts.value = [...dbConn.db.ui_panel_layout.iter()];
    travelCooldowns.value = [...dbConn.db.travel_cooldown.iter()];
    characterLogoutTicks.value = [...dbConn.db.character_logout_tick.iter()];
    bankSlots.value = [...dbConn.db.my_bank_slots.iter()];
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
          'SELECT * FROM player',
          'SELECT * FROM user',
          'SELECT * FROM character',
          'SELECT * FROM world_state',
          'SELECT * FROM region',
          'SELECT * FROM location',
          'SELECT * FROM location_connection',
          'SELECT * FROM race',
          'SELECT * FROM faction',
          'SELECT * FROM faction_standing',
          'SELECT * FROM ability_template',
          'SELECT * FROM item_template',
          'SELECT * FROM item_instance',
          'SELECT * FROM hotbar_slot',
          'SELECT * FROM item_cooldown',
          'SELECT * FROM item_affix',
          'SELECT * FROM renown',
          'SELECT * FROM renown_perk',
          'SELECT * FROM renown_server_first',
          'SELECT * FROM achievement',
          'SELECT * FROM app_version',
          'SELECT * FROM ui_panel_layout',
          'SELECT * FROM travel_cooldown',
          'SELECT * FROM character_logout_tick',
          'SELECT * FROM my_bank_slots',
        ]);

      // Register reactive callbacks for each table
      const rebind = (table: any, ref: { value: any[] }, iter: () => Iterable<any>) => {
        const rebuild = () => { ref.value = [...iter()]; };
        table.onInsert(rebuild);
        table.onUpdate(rebuild);
        table.onDelete(rebuild);
      };

      rebind(dbConn.db.player, players, () => dbConn.db.player.iter());
      rebind(dbConn.db.user, users, () => dbConn.db.user.iter());
      rebind(dbConn.db.character, characters, () => dbConn.db.character.iter());
      rebind(dbConn.db.world_state, worldState, () => dbConn.db.world_state.iter());
      rebind(dbConn.db.region, regions, () => dbConn.db.region.iter());
      rebind(dbConn.db.location, locations, () => dbConn.db.location.iter());
      rebind(dbConn.db.location_connection, locationConnections, () => dbConn.db.location_connection.iter());
      rebind(dbConn.db.race, races, () => dbConn.db.race.iter());
      rebind(dbConn.db.faction, factions, () => dbConn.db.faction.iter());
      rebind(dbConn.db.faction_standing, factionStandings, () => dbConn.db.faction_standing.iter());
      rebind(dbConn.db.ability_template, abilityTemplates, () => dbConn.db.ability_template.iter());
      rebind(dbConn.db.item_template, itemTemplates, () => dbConn.db.item_template.iter());
      rebind(dbConn.db.item_instance, itemInstances, () => dbConn.db.item_instance.iter());
      rebind(dbConn.db.hotbar_slot, hotbarSlots, () => dbConn.db.hotbar_slot.iter());
      rebind(dbConn.db.item_cooldown, itemCooldowns, () => dbConn.db.item_cooldown.iter());
      rebind(dbConn.db.item_affix, itemAffixes, () => dbConn.db.item_affix.iter());
      rebind(dbConn.db.renown, renownRows, () => dbConn.db.renown.iter());
      rebind(dbConn.db.renown_perk, renownPerks, () => dbConn.db.renown_perk.iter());
      rebind(dbConn.db.renown_server_first, renownServerFirsts, () => dbConn.db.renown_server_first.iter());
      rebind(dbConn.db.achievement, achievements, () => dbConn.db.achievement.iter());
      rebind(dbConn.db.app_version, appVersionRows, () => dbConn.db.app_version.iter());
      rebind(dbConn.db.ui_panel_layout, panelLayouts, () => dbConn.db.ui_panel_layout.iter());
      rebind(dbConn.db.travel_cooldown, travelCooldowns, () => dbConn.db.travel_cooldown.iter());
      rebind(dbConn.db.character_logout_tick, characterLogoutTicks, () => dbConn.db.character_logout_tick.iter());
      rebind(dbConn.db.my_bank_slots, bankSlots, () => dbConn.db.my_bank_slots.iter());
    },
    { immediate: true }
  );

  return {
    players,
    users,
    characters,
    worldState,
    regions,
    locations,
    locationConnections,
    races,
    factions,
    factionStandings,
    abilityTemplates,
    itemTemplates,
    itemInstances,
    hotbarSlots,
    itemCooldowns,
    itemAffixes,
    renownRows,
    renownPerks,
    renownServerFirsts,
    achievements,
    appVersionRows,
    panelLayouts,
    travelCooldowns,
    characterLogoutTicks,
    bankSlots,
  };
}
