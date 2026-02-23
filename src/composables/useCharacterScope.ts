import { computed, Ref } from 'vue';

export function useCharacterScope(opts: {
  selectedCharacter: Ref<any>;
  npcDialogs: Ref<any[]>;
  questInstances: Ref<any[]>;
  questItems: Ref<any[]>;
  namedEnemies: Ref<any[]>;
  searchResults: Ref<any[]>;
  factionStandings: Ref<any[]>;
  renownRows: Ref<any[]>;
  renownPerks: Ref<any[]>;
  panelLayouts: Ref<any[]>;
}) {
  const {
    selectedCharacter,
    npcDialogs,
    questInstances,
    questItems,
    namedEnemies,
    searchResults,
    factionStandings,
    renownRows,
    renownPerks,
    panelLayouts,
  } = opts;

  const characterNpcDialogs = computed(() => {
    if (!selectedCharacter.value) return [];
    return npcDialogs.value.filter(
      (entry: any) => entry.characterId.toString() === selectedCharacter.value!.id.toString()
    );
  });

  const characterQuests = computed(() => {
    if (!selectedCharacter.value) return [];
    return questInstances.value.filter(
      (row: any) => row.characterId.toString() === selectedCharacter.value!.id.toString()
    );
  });

  const characterQuestItems = computed(() => {
    if (!selectedCharacter.value) return [];
    const charId = selectedCharacter.value.id;
    return questItems.value.filter((qi: any) => qi.characterId.toString() === charId.toString());
  });

  const characterNamedEnemies = computed(() => {
    if (!selectedCharacter.value) return [];
    const charId = selectedCharacter.value.id;
    return namedEnemies.value.filter((ne: any) => ne.characterId.toString() === charId.toString());
  });

  const characterSearchResult = computed(() => {
    if (!selectedCharacter.value) return null;
    const charId = selectedCharacter.value.id;
    return searchResults.value.find((sr: any) => sr.characterId.toString() === charId.toString()) ?? null;
  });

  const characterFactionStandings = computed(() => {
    if (!selectedCharacter.value) return [];
    return factionStandings.value.filter(
      (row: any) => row.characterId.toString() === selectedCharacter.value!.id.toString()
    );
  });

  const characterRenown = computed(() => {
    if (!selectedCharacter.value) return null;
    return renownRows.value.find(r => r.characterId.toString() === selectedCharacter.value!.id.toString()) ?? null;
  });

  const characterRenownPerks = computed(() => {
    if (!selectedCharacter.value) return [];
    return renownPerks.value.filter(p => p.characterId.toString() === selectedCharacter.value!.id.toString());
  });

  const characterPanelLayouts = computed(() => {
    if (!selectedCharacter.value) return [];
    return panelLayouts.value.filter(
      (row: any) => row.characterId.toString() === selectedCharacter.value!.id.toString()
    );
  });

  // Location-scoped derivations
  const locationQuestItems = computed(() => {
    if (!selectedCharacter.value) return [];
    const locId = selectedCharacter.value.locationId;
    return characterQuestItems.value.filter(
      (qi: any) => qi.locationId.toString() === locId.toString() && qi.discovered && !qi.looted
    );
  });

  const locationNamedEnemies = computed(() => {
    if (!selectedCharacter.value) return [];
    const locId = selectedCharacter.value.locationId;
    return characterNamedEnemies.value.filter(
      (ne: any) => ne.locationId.toString() === locId.toString() && ne.isAlive
    );
  });

  return {
    characterNpcDialogs,
    characterQuests,
    characterQuestItems,
    characterNamedEnemies,
    characterSearchResult,
    characterFactionStandings,
    characterRenown,
    characterRenownPerks,
    characterPanelLayouts,
    locationQuestItems,
    locationNamedEnemies,
  };
}
