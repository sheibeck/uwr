import { computed, type Ref } from 'vue';
import {
  reducers,
  type CharacterRow,
  type CombatEncounterRow,
  type CombatParticipantRow,
  type CombatEnemyRow,
  type CombatEnemyCastRow,
  type CombatResultRow,
  type EnemySpawnRow,
  type EnemyTemplateRow,
  type CombatEnemyEffectRow,
} from '../module_bindings';
import { useReducer } from 'spacetimedb/vue';

type EnemySummary = {
  id: bigint;
  name: string;
  level: bigint;
  conClass: string;
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
  combatEnemyEffects: Ref<CombatEnemyEffectRow[]>;
  combatEnemyCasts: Ref<CombatEnemyCastRow[]>;
  combatResults: Ref<CombatResultRow[]>;
  fallbackRoster: Ref<CharacterRow[]>;
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
  combatEnemyEffects,
  combatEnemyCasts,
  combatResults,
  fallbackRoster,
  enemySpawns,
  enemyTemplates,
  characters,
}: UseCombatArgs) => {
  const startCombatReducer = useReducer(reducers.startCombat);
  const chooseActionReducer = useReducer(reducers.chooseAction);
  const dismissResultsReducer = useReducer(reducers.dismissCombatResults);

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
  const activeEnemyConClass = computed(() => {
    if (!selectedCharacter.value || !activeEnemyTemplate.value) return 'conWhite';
    const diff = Number(activeEnemyTemplate.value.level - selectedCharacter.value.level);
    if (diff <= -5) return 'conGray';
    if (diff <= -2) return 'conLightGreen';
    if (diff === -1) return 'conBlue';
    if (diff === 0) return 'conWhite';
    if (diff === 1) return 'conYellow';
    if (diff === 2) return 'conOrange';
    return 'conRed';
  });

  const activeEnemyEffects = computed(() => {
    if (!activeCombat.value) return [];
    const combatId = activeCombat.value.id.toString();
    const negativeTypes = new Set(['damage_down', 'dot', 'skip', 'slow', 'weaken']);
    return combatEnemyEffects.value
      .filter((row) => row.combatId.toString() === combatId)
      .map((effect) => {
        const type = effect.effectType;
        const isHot = type === 'dot';
        const seconds = Number(effect.roundsRemaining) * (isHot ? 3 : 10);
        const label = effect.sourceAbility ?? type.replace(/_/g, ' ');
        const isNegative = negativeTypes.has(type) || effect.magnitude < 0n;
        return {
          id: effect.id,
          label,
          seconds,
          isNegative,
        };
      });
  });

  const activeEnemyActionText = computed(() => {
    if (!activeCombat.value) return 'Idle';
    const combatId = activeCombat.value.id.toString();
    const cast = combatEnemyCasts.value.find((row) => row.combatId.toString() === combatId);
    if (cast) {
      const pretty = cast.abilityKey
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (match) => match.toUpperCase());
      return `Casting ${pretty}`;
    }
    return 'Auto-attacking';
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
        const level = template?.level ?? 1n;
        const diff = Number(level - selectedCharacter.value!.level);
        let conClass = 'conWhite';
        if (diff <= -5) conClass = 'conGray';
        else if (diff <= -2) conClass = 'conLightGreen';
        else if (diff === -1) conClass = 'conBlue';
        else if (diff === 0) conClass = 'conWhite';
        else if (diff === 1) conClass = 'conYellow';
        else if (diff === 2) conClass = 'conOrange';
        else conClass = 'conRed';
        return {
          id: spawn.id,
          name: spawn.name,
          level,
          conClass,
        };
      });
  });

  const combatRoster = computed<CombatRosterEntry[]>(() => {
    if (!activeCombat.value) return [];
    const roster = combatParticipants.value.filter(
      (row) => row.combatId.toString() === activeCombat.value?.id.toString()
    );
    if (roster.length === 0) {
      const fallback =
        fallbackRoster.value.length > 0
          ? fallbackRoster.value
          : selectedCharacter.value
            ? [selectedCharacter.value]
            : [];
      return fallback.map((character) => ({
        id: character.id,
        name: character.name,
        level: character.level,
        hp: character.hp,
        maxHp: character.maxHp,
        mana: character.mana,
        maxMana: character.maxMana ?? 1n,
        stamina: character.stamina ?? 0n,
        maxStamina: character.maxStamina ?? 1n,
        status: character.hp === 0n ? 'dead' : 'active',
        isYou: character.id.toString() === selectedCharacter.value?.id.toString(),
      }));
    }
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
        maxMana: character?.maxMana ?? 1n,
        stamina: character?.stamina ?? 0n,
        maxStamina: character?.maxStamina ?? 1n,
        status: participant.status,
        isYou: participant.characterId === selectedCharacter.value?.id,
      };
    });
  });

  const startCombat = (enemySpawnId: bigint) => {
    if (!connActive.value || !selectedCharacter.value) return;
    startCombatReducer({ characterId: selectedCharacter.value.id, enemySpawnId });
  };

  const flee = () => {
    if (!connActive.value || !activeCombat.value || !selectedCharacter.value) return;
    chooseActionReducer({
      characterId: selectedCharacter.value.id,
      combatId: activeCombat.value.id,
      action: 'flee',
    });
  };
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
    activeEnemyConClass,
    activeEnemyEffects,
    activeEnemyActionText,
    activeEnemySpawn,
    availableEnemies,
    combatRoster,
    startCombat,
    flee,
    dismissResults,
  };
};
