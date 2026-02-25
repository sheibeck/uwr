import { shallowRef, ref, watch } from 'vue';
import { useSpacetimeDB } from 'spacetimedb/vue';

type ConnectionState = ReturnType<typeof useSpacetimeDB>;

export function useCombatData(conn: ConnectionState) {
  const combatEncounters = shallowRef<any[]>([]);
  const combatParticipants = shallowRef<any[]>([]);
  const combatEnemies = shallowRef<any[]>([]);
  const combatEnemyEffects = shallowRef<any[]>([]);
  const combatEnemyCasts = shallowRef<any[]>([]);
  const combatResults = shallowRef<any[]>([]);
  const combatLoot = shallowRef<any[]>([]);
  const pullStates = shallowRef<any[]>([]);
  const activePets = shallowRef<any[]>([]);
  const abilityCooldowns = shallowRef<any[]>([]);
  const characterCasts = shallowRef<any[]>([]);
  const characterEffects = shallowRef<any[]>([]);
  const activeBardSongs = shallowRef<any[]>([]);
  // aggro_entry is private in v2, not subscribable
  const aggroEntries = ref([] as any[]);

  function refresh(dbConn: any) {
    combatEncounters.value = [...dbConn.db.combat_encounter.iter()];
    combatParticipants.value = [...dbConn.db.combat_participant.iter()];
    combatEnemies.value = [...dbConn.db.combat_enemy.iter()];
    combatEnemyEffects.value = [...dbConn.db.combat_enemy_effect.iter()];
    combatEnemyCasts.value = [...dbConn.db.combat_enemy_cast.iter()];
    combatResults.value = [...dbConn.db.combat_result.iter()];
    combatLoot.value = [...dbConn.db.combat_loot.iter()];
    pullStates.value = [...dbConn.db.pull_state.iter()];
    activePets.value = [...dbConn.db.active_pet.iter()];
    abilityCooldowns.value = [...dbConn.db.ability_cooldown.iter()];
    characterCasts.value = [...dbConn.db.character_cast.iter()];
    characterEffects.value = [...dbConn.db.character_effect.iter()];
    activeBardSongs.value = [...dbConn.db.active_bard_song.iter()];
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
          'SELECT * FROM combat_encounter',
          'SELECT * FROM combat_participant',
          'SELECT * FROM combat_enemy',
          'SELECT * FROM combat_enemy_effect',
          'SELECT * FROM combat_enemy_cast',
          'SELECT * FROM combat_result',
          'SELECT * FROM combat_loot',
          'SELECT * FROM pull_state',
          'SELECT * FROM active_pet',
          'SELECT * FROM ability_cooldown',
          'SELECT * FROM character_cast',
          'SELECT * FROM character_effect',
          'SELECT * FROM active_bard_song',
        ]);

      const rebind = (table: any, ref: { value: any[] }, iter: () => Iterable<any>) => {
        const rebuild = () => { ref.value = [...iter()]; };
        table.onInsert(rebuild);
        table.onUpdate(rebuild);
        table.onDelete(rebuild);
      };

      rebind(dbConn.db.combat_encounter, combatEncounters, () => dbConn.db.combat_encounter.iter());
      rebind(dbConn.db.combat_participant, combatParticipants, () => dbConn.db.combat_participant.iter());
      rebind(dbConn.db.combat_enemy, combatEnemies, () => dbConn.db.combat_enemy.iter());
      rebind(dbConn.db.combat_enemy_effect, combatEnemyEffects, () => dbConn.db.combat_enemy_effect.iter());
      rebind(dbConn.db.combat_enemy_cast, combatEnemyCasts, () => dbConn.db.combat_enemy_cast.iter());
      rebind(dbConn.db.combat_result, combatResults, () => dbConn.db.combat_result.iter());
      rebind(dbConn.db.combat_loot, combatLoot, () => dbConn.db.combat_loot.iter());
      rebind(dbConn.db.pull_state, pullStates, () => dbConn.db.pull_state.iter());
      rebind(dbConn.db.active_pet, activePets, () => dbConn.db.active_pet.iter());
      rebind(dbConn.db.ability_cooldown, abilityCooldowns, () => dbConn.db.ability_cooldown.iter());
      rebind(dbConn.db.character_cast, characterCasts, () => dbConn.db.character_cast.iter());
      rebind(dbConn.db.character_effect, characterEffects, () => dbConn.db.character_effect.iter());
      rebind(dbConn.db.active_bard_song, activeBardSongs, () => dbConn.db.active_bard_song.iter());
    },
    { immediate: true }
  );

  return {
    combatEncounters,
    combatParticipants,
    combatEnemies,
    combatEnemyEffects,
    combatEnemyCasts,
    combatResults,
    combatLoot,
    pullStates,
    activePets,
    abilityCooldowns,
    characterCasts,
    characterEffects,
    activeBardSongs,
    aggroEntries,
  };
}
