import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import {
  reducers,
  type CharacterRow,
  type CombatEncounterRow,
  type CombatParticipantRow,
  type CombatEnemyRow,
  type CombatResultRow,
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
  mana: bigint;
  maxMana: bigint;
  stamina: bigint;
  maxStamina: bigint;
  status: string;
  isYou: boolean;
};

type UseCombatArgs = {
  connActive: Ref<boolean>;
  selectedCharacter: Ref<CharacterRow | null>;
  combatEncounters: Ref<CombatEncounterRow[]>;
  combatParticipants: Ref<CombatParticipantRow[]>;
  combatEnemies: Ref<CombatEnemyRow[]>;
  combatResults: Ref<CombatResultRow[]>;
  enemySpawns: Ref<EnemySpawnRow[]>;
  enemyTemplates: Ref<EnemyTemplateRow[]>;
  characters: Ref<CharacterRow[]>;
};

const timestampToMicros = (timestamp: any) => {
  if (!timestamp) return 0;
  if (typeof timestamp === 'bigint') return Number(timestamp);
  if (typeof timestamp === 'number') return timestamp;
  if (typeof timestamp === 'string') return Date.parse(timestamp) * 1000;
  if (typeof timestamp === 'object') {
    if ('__timestamp_micros_since_unix_epoch__' in timestamp) {
      return Number(
        (timestamp as { __timestamp_micros_since_unix_epoch__: bigint })
          .__timestamp_micros_since_unix_epoch__
      );
    }
    if ('microsSinceUnixEpoch' in timestamp) {
      return Number((timestamp as { microsSinceUnixEpoch: bigint }).microsSinceUnixEpoch);
    }
    if ('millisSinceUnixEpoch' in timestamp) {
      return Number((timestamp as { millisSinceUnixEpoch: bigint }).millisSinceUnixEpoch) * 1000;
    }
    if ('secsSinceUnixEpoch' in timestamp) {
      return Number((timestamp as { secsSinceUnixEpoch: bigint }).secsSinceUnixEpoch) * 1_000_000;
    }
  }
  return 0;
};

export const useCombat = ({
  connActive,
  selectedCharacter,
  combatEncounters,
  combatParticipants,
  combatEnemies,
  combatResults,
  enemySpawns,
  enemyTemplates,
  characters,
}: UseCombatArgs) => {
  const startCombatReducer = useReducer(reducers.startCombat);
  const chooseActionReducer = useReducer(reducers.chooseAction);
  const dismissResultsReducer = useReducer(reducers.dismissCombatResults);
  const selectedAction = ref<'attack' | 'skip' | 'flee' | null>(null);
  const nowMicros = ref(Date.now() * 1000);
  let timer: number | undefined;

  const activeCombat = computed(() => {
    if (!selectedCharacter.value) return null;
    const selectedId = selectedCharacter.value.id.toString();
    const activeEncounters = combatEncounters.value.filter((row) => row.state === 'active');
    for (const combat of activeEncounters) {
      const match = combatParticipants.value.find(
        (row) =>
          row.characterId.toString() === selectedId &&
          row.combatId.toString() === combat.id.toString()
      );
      if (match) return combat;
    }
    return null;
  });

  const activeResult = computed(() => {
    if (!selectedCharacter.value || activeCombat.value) return null;
    const selectedId = selectedCharacter.value.id.toString();
    const results = combatResults.value.filter(
      (row) => row.characterId.toString() === selectedId
    );
    if (results.length === 0) return null;
    return results.reduce((latest, current) => {
      const latestAt = timestampToMicros(latest.createdAt);
      const currentAt = timestampToMicros(current.createdAt);
      return currentAt > latestAt ? current : latest;
    });
  });

  watch(
    () => activeCombat.value?.roundNumber,
    (next, prev) => {
      if (next !== prev) {
        selectedAction.value = null;
      }
    }
  );

  watch(
    () => activeCombat.value,
    (combat) => {
      if (!combat) {
        selectedAction.value = null;
        if (timer) {
          clearInterval(timer);
          timer = undefined;
        }
        return;
      }
      if (!timer) {
        timer = window.setInterval(() => {
          nowMicros.value = Date.now() * 1000;
        }, 250);
      }
    },
    { immediate: true }
  );

  onBeforeUnmount(() => {
    if (timer) clearInterval(timer);
  });

  const activeEnemy = computed(() => {
    if (!activeCombat.value) return null;
    return (
      combatEnemies.value.find(
        (row) => row.combatId.toString() === activeCombat.value?.id.toString()
      ) ?? null
    );
  });

  const activeEnemySpawn = computed(() => {
    if (!activeCombat.value) return null;
    return (
      enemySpawns.value.find(
        (row) => row.lockedCombatId?.toString() === activeCombat.value?.id.toString()
      ) ?? null
    );
  });

  const activeEnemyTemplate = computed(() => {
    if (!activeEnemy.value) return null;
    return (
      enemyTemplates.value.find(
        (row) => row.id.toString() === activeEnemy.value?.enemyTemplateId.toString()
      ) ?? null
    );
  });

  const activeEnemyName = computed(() => {
    if (activeEnemySpawn.value?.name) return activeEnemySpawn.value.name;
    if (activeEnemyTemplate.value?.name) return activeEnemyTemplate.value.name;
    return 'Enemy';
  });

  const activeEnemyLevel = computed(() => activeEnemyTemplate.value?.level ?? 1n);

  const roundEndsInSeconds = computed(() => {
    if (!activeCombat.value) return 0;
    const targetMicros = timestampToMicros(activeCombat.value.roundEndsAt);
    const remaining = Math.ceil((targetMicros - nowMicros.value) / 1_000_000);
    return remaining > 0 ? remaining : 0;
  });

  const availableEnemies = computed<EnemySummary[]>(() => {
    if (!selectedCharacter.value) return [];
    return enemySpawns.value
      .filter(
        (row) =>
          row.locationId.toString() === selectedCharacter.value?.locationId.toString() &&
          row.state === 'available'
      )
      .map((spawn) => {
        const template = enemyTemplates.value.find(
          (row) => row.id.toString() === spawn.enemyTemplateId.toString()
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
      (row) => row.combatId.toString() === activeCombat.value?.id.toString()
    );
    return roster.map((participant) => {
      const character = characters.value.find(
        (row) => row.id.toString() === participant.characterId.toString()
      );
      return {
        id: participant.characterId,
        name: character?.name ?? 'Unknown',
        level: character?.level ?? 1n,
        hp: character?.hp ?? 0n,
        maxHp: character?.maxHp ?? 0n,
        mana: character?.mana ?? 0n,
        maxMana: character?.maxMana ?? 0n,
        stamina: character?.stamina ?? 0n,
        maxStamina: character?.maxStamina ?? 0n,
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
    selectedAction.value = action;
  };

  const attack = () => chooseAction('attack');
  const flee = () => chooseAction('flee');
  const skip = () => chooseAction('skip');
  const dismissResults = () => {
    if (!connActive.value || !selectedCharacter.value) return;
    dismissResultsReducer({ characterId: selectedCharacter.value.id });
  };

  return {
    activeCombat,
    activeResult,
    activeEnemy,
    activeEnemyName,
    activeEnemyLevel,
    activeEnemySpawn,
    availableEnemies,
    combatRoster,
    roundEndsInSeconds,
    selectedAction,
    startCombat,
    attack,
    flee,
    skip,
    dismissResults,
  };
};
