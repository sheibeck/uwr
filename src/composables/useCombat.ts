import { computed, type Ref } from 'vue';
import {
  reducers,
  type CharacterRow,
  type CombatEncounterRow,
  type CombatParticipantRow,
  type CombatEnemyRow,
  type EnemySpawnRow,
  type EnemyTemplateRow,
} from '../module_bindings';
import { useReducer } from 'spacetimedb/vue';

type EnemySummary = {
  id: bigint;
  name: string;
  level: bigint;
};

type CombatRosterEntry = {
  id: bigint;
  name: string;
  level: bigint;
  hp: bigint;
  maxHp: bigint;
  status: string;
  isYou: boolean;
};

type UseCombatArgs = {
  connActive: Ref<boolean>;
  selectedCharacter: Ref<CharacterRow | null>;
  combatEncounters: Ref<CombatEncounterRow[]>;
  combatParticipants: Ref<CombatParticipantRow[]>;
  combatEnemies: Ref<CombatEnemyRow[]>;
  enemySpawns: Ref<EnemySpawnRow[]>;
  enemyTemplates: Ref<EnemyTemplateRow[]>;
  characters: Ref<CharacterRow[]>;
};

export const useCombat = ({
  connActive,
  selectedCharacter,
  combatEncounters,
  combatParticipants,
  combatEnemies,
  enemySpawns,
  enemyTemplates,
  characters,
}: UseCombatArgs) => {
  const startCombatReducer = useReducer(reducers.startCombat);
  const chooseActionReducer = useReducer(reducers.chooseAction);

  const activeCombat = computed(() => {
    if (!selectedCharacter.value) return null;
    const participant = combatParticipants.value.find(
      (row) => row.characterId === selectedCharacter.value?.id
    );
    if (!participant) return null;
    const combat = combatEncounters.value.find((row) => row.id === participant.combatId);
    if (!combat || combat.state !== 'active') return null;
    return combat;
  });

  const activeEnemy = computed(() => {
    if (!activeCombat.value) return null;
    return (
      combatEnemies.value.find((row) => row.combatId === activeCombat.value?.id) ?? null
    );
  });

  const activeEnemySpawn = computed(() => {
    if (!activeCombat.value) return null;
    return (
      enemySpawns.value.find((row) => row.lockedCombatId === activeCombat.value?.id) ?? null
    );
  });

  const activeEnemyTemplate = computed(() => {
    if (!activeEnemy.value) return null;
    return (
      enemyTemplates.value.find((row) => row.id === activeEnemy.value?.enemyTemplateId) ?? null
    );
  });

  const activeEnemyName = computed(() => {
    if (activeEnemySpawn.value?.name) return activeEnemySpawn.value.name;
    if (activeEnemyTemplate.value?.name) return activeEnemyTemplate.value.name;
    return 'Enemy';
  });

  const activeEnemyLevel = computed(() => activeEnemyTemplate.value?.level ?? 1n);

  const availableEnemies = computed<EnemySummary[]>(() => {
    if (!selectedCharacter.value) return [];
    return enemySpawns.value
      .filter(
        (row) =>
          row.locationId === selectedCharacter.value?.locationId && row.state === 'available'
      )
      .map((spawn) => {
        const template = enemyTemplates.value.find(
          (row) => row.id === spawn.enemyTemplateId
        );
        return {
          id: spawn.id,
          name: spawn.name,
          level: template?.level ?? 1n,
        };
      });
  });

  const combatRoster = computed<CombatRosterEntry[]>(() => {
    if (!activeCombat.value) return [];
    const roster = combatParticipants.value.filter(
      (row) => row.combatId === activeCombat.value?.id
    );
    return roster.map((participant) => {
      const character = characters.value.find((row) => row.id === participant.characterId);
      return {
        id: participant.characterId,
        name: character?.name ?? 'Unknown',
        level: character?.level ?? 1n,
        hp: character?.hp ?? 0n,
        maxHp: character?.maxHp ?? 0n,
        status: participant.status,
        isYou: participant.characterId === selectedCharacter.value?.id,
      };
    });
  });

  const startCombat = (enemySpawnId: bigint) => {
    if (!connActive.value || !selectedCharacter.value) return;
    startCombatReducer({ characterId: selectedCharacter.value.id, enemySpawnId });
  };

  const chooseAction = (action: 'attack' | 'flee' | 'skip') => {
    if (!connActive.value || !activeCombat.value || !selectedCharacter.value) return;
    chooseActionReducer({
      characterId: selectedCharacter.value.id,
      combatId: activeCombat.value.id,
      action,
    });
  };

  const attack = () => chooseAction('attack');
  const flee = () => chooseAction('flee');
  const skip = () => chooseAction('skip');

  return {
    activeCombat,
    activeEnemy,
    activeEnemyName,
    activeEnemyLevel,
    activeEnemySpawn,
    availableEnemies,
    combatRoster,
    startCombat,
    attack,
    flee,
    skip,
  };
};
