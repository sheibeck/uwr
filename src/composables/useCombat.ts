import { computed, watch, type Ref } from 'vue';
import type { Infer } from 'spacetimedb';
import {
  reducers,
  CharacterRow,
  CombatEncounterRow,
  CombatParticipantRow,
  CombatEnemyRow,
  ActivePetRow,
  CombatEnemyCastRow,
  CombatResultRow,
  CombatLootRow,
  EnemySpawnRow,
  EnemyTemplateRow,
  EnemyRoleTemplateRow,
  EnemySpawnMemberRow,
  CombatEnemyEffectRow,
  EnemyAbilityRow,
  ItemTemplateRow,
  FactionRow,
  PullStateRow,
} from '../module_bindings';
import { useReducer } from 'spacetimedb/vue';
import {
  effectIsNegative,
  effectLabel,
  effectRemainingSeconds,
} from '../ui/effectTimers';
import { buildItemTooltipData } from './useItemTooltip';

type EnemySummary = {
  id: bigint;
  name: string;
  level: bigint;
  conClass: string;
  groupCount: bigint;
  memberNames: string[];
  factionName: string;
  isPulling: boolean;
  pullProgress: number;
  pullType: string | null;
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
  selectedCharacter: Ref<Infer<typeof CharacterRow> | null>;
  combatEncounters: Ref<Infer<typeof CombatEncounterRow>[]>;
  combatParticipants: Ref<Infer<typeof CombatParticipantRow>[]>;
  combatEnemies: Ref<Infer<typeof CombatEnemyRow>[]>;
  activePets: Ref<Infer<typeof ActivePetRow>[]>;
  combatEnemyEffects: Ref<Infer<typeof CombatEnemyEffectRow>[]>;
  combatEnemyCasts: Ref<Infer<typeof CombatEnemyCastRow>[]>;
  enemyAbilities: Ref<Infer<typeof EnemyAbilityRow>[]>;
  combatResults: Ref<Infer<typeof CombatResultRow>[]>;
  combatLoot: Ref<Infer<typeof CombatLootRow>[]>;
  itemTemplates: Ref<Infer<typeof ItemTemplateRow>[]>;
  fallbackRoster: Ref<Infer<typeof CharacterRow>[]>;
  enemySpawns: Ref<Infer<typeof EnemySpawnRow>[]>;
  enemyTemplates: Ref<Infer<typeof EnemyTemplateRow>[]>;
  enemyRoleTemplates: Ref<Infer<typeof EnemyRoleTemplateRow>[]>;
  enemySpawnMembers: Ref<Infer<typeof EnemySpawnMemberRow>[]>;
  pullStates: Ref<Infer<typeof PullStateRow>[]>;
  nowMicros: Ref<number>;
  characters: Ref<Infer<typeof CharacterRow>[]>;
  factions: Ref<Infer<typeof FactionRow>[]>;
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
  activePets,
  combatEnemyEffects,
  combatEnemyCasts,
  enemyAbilities,
  combatResults,
  combatLoot,
  itemTemplates,
  fallbackRoster,
  enemySpawns,
  enemyTemplates,
  enemyRoleTemplates,
  enemySpawnMembers,
  pullStates,
  nowMicros,
  characters,
  factions,
}: UseCombatArgs) => {
  const effectTimers = new Map<
    string,
    { seenAtMicros: number; rounds: bigint; tickSeconds: number }
  >();
  const enemyCastTimers = new Map<
    string,
    { startMicros: number; durationMicros: number; endsAtMicros: number }
  >();
  // Records the nowMicros value when each pull row first arrived — same frame as nowMicros,
  // so elapsed = nowMicros.value - startMicros needs no server/client clock sync.
  const pullArrivalTimes = new Map<string, number>();
  const startCombatReducer = useReducer(reducers.startCombat);
  const startPullReducer = useReducer(reducers.startPull);
  const startTrackedCombatReducer = useReducer(reducers.startTrackedCombat);
  const setCombatTargetReducer = useReducer(reducers.setCombatTarget);
  const fleeCombatReducer = useReducer(reducers.fleeCombat);
  const dismissResultsReducer = useReducer(reducers.dismissCombatResults);
  const takeLootReducer = useReducer(reducers.takeLoot);
  const takeAllLootReducer = useReducer(reducers.takeAllLoot);

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
    const results = combatResults.value.filter((row) => {
      if (row.characterId.toString() !== selectedId) return false;
      if (row.groupId && selectedCharacter.value?.groupId) {
        return row.groupId.toString() === selectedCharacter.value.groupId.toString();
      }
      return !row.groupId;
    });
    if (results.length === 0) return null;
    return results.reduce((latest, current) => {
      const latestAt = timestampToMicros(latest.createdAt);
      const currentAt = timestampToMicros(current.createdAt);
      return currentAt > latestAt ? current : latest;
    });
  });

  const activeLoot = computed(() => {
    if (!activeResult.value || !selectedCharacter.value) return [];
    const combatId = activeResult.value.combatId.toString();
    const characterId = selectedCharacter.value.id.toString();
    return combatLoot.value
      .filter(
        (row) =>
          row.combatId.toString() === combatId &&
          row.characterId.toString() === characterId
      )
      .map((row) => {
        const template = itemTemplates.value.find(
          (item) => item.id.toString() === row.itemTemplateId.toString()
        );
        const tooltipData = buildItemTooltipData({
          template,
          instance: { qualityTier: row.qualityTier },
          priceOrValue: template?.vendorValue ? { label: 'Value', value: `${template.vendorValue} gold` } : undefined,
        });
        return {
          id: row.id,
          ...tooltipData,
        };
      });
  });

  const pendingLoot = computed(() => {
    if (!selectedCharacter.value) return [];
    const characterId = selectedCharacter.value.id.toString();
    const allLoot = combatLoot.value;
    const filtered = allLoot.filter((row) => row.characterId.toString() === characterId);

    // Diagnostic logging
    if (allLoot.length > 0 || filtered.length > 0) {
      console.log('[LOOT DEBUG] combatLoot rows:', allLoot.length, 'filtered for char:', filtered.length, 'characterId:', characterId);
    }

    return filtered
      .slice(0, 10)  // Cap at 10 items
      .map((row) => {
        const template = itemTemplates.value.find(
          (item) => item.id.toString() === row.itemTemplateId.toString()
        );
        const tooltipData = buildItemTooltipData({
          template,
          instance: {
            qualityTier: row.qualityTier,
            isNamed: row.isNamed,
          },
          affixDataJson: row.affixDataJson,
          priceOrValue: template?.vendorValue ? { label: 'Value', value: `${template.vendorValue} gold` } : undefined,
        });
        return {
          id: row.id,
          ...tooltipData,
        };
      });
  });

  const lootForResult = computed(() => {
    if (!activeResult.value) return [];
    const combatId = activeResult.value.combatId.toString();
    return combatLoot.value.filter((row) => row.combatId.toString() === combatId);
  });

  const hasAnyLootForResult = computed(() => lootForResult.value.length > 0);

  const hasOtherLootForResult = computed(() => {
    if (!selectedCharacter.value || !selectedCharacter.value.groupId) return false;
    const selectedId = selectedCharacter.value.id.toString();
    return lootForResult.value.some((row) => row.characterId.toString() !== selectedId);
  });


  const activeEnemy = computed(() => {
    if (!activeCombat.value) return null;
    const combatId = activeCombat.value.id.toString();
    const enemies = combatEnemies.value.filter(
      (row) => row.combatId.toString() === combatId
    );
    const targetId = selectedCharacter.value?.combatTargetEnemyId?.toString();
    const targeted = targetId ? enemies.find((row) => row.id.toString() === targetId) : null;
    return targeted ?? enemies.find((row) => row.currentHp > 0n) ?? enemies[0] ?? null;
  });

  const activeEnemySpawn = computed(() => {
    if (!activeCombat.value || !activeEnemy.value) return null;
    return (
      enemySpawns.value.find(
        (row) => row.id.toString() === activeEnemy.value?.spawnId?.toString()
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
    if (activeEnemy.value?.displayName) return activeEnemy.value.displayName;
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
    if (!activeCombat.value || !activeEnemy.value) return [];
    const combatId = activeCombat.value.id.toString();
    const enemyId = activeEnemy.value.id.toString();
    return combatEnemyEffects.value
      .filter(
        (row) =>
          row.combatId.toString() === combatId && row.enemyId.toString() === enemyId
      )
      .map((effect) => {
        const seconds = effectRemainingSeconds(effect, nowMicros.value, effectTimers);
        const label = effectLabel(effect);
        const isNegative = effectIsNegative(effect);
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

  const activeEnemyCast = computed(() => {
    if (!activeCombat.value) return null;
    return (
      combatEnemyCasts.value.find(
        (row) =>
          row.combatId.toString() === activeCombat.value?.id.toString() &&
          row.enemyId.toString() === activeEnemy.value?.id.toString()
      ) ?? null
    );
  });

  const activeEnemyCastProgress = computed(() => {
    if (!activeEnemyCast.value) return 0;
    const ability = enemyAbilities.value.find(
      (row) => row.abilityKey === activeEnemyCast.value?.abilityKey
    );
    const duration = ability?.castSeconds ? Number(ability.castSeconds) * 1_000_000 : 0;
    if (!duration) return 0;
    const remaining = Number(activeEnemyCast.value.endsAtMicros) - nowMicros.value;
    const clamped = Math.max(0, Math.min(duration, duration - remaining));
    return clamped / duration;
  });

  const activeEnemyCastLabel = computed(() => {
    if (!activeEnemyCast.value) return '';
    const ability = enemyAbilities.value.find(
      (row) => row.abilityKey === activeEnemyCast.value?.abilityKey
    );
    return ability?.name ?? activeEnemyCast.value.abilityKey.replace(/_/g, ' ');
  });


  const availableEnemies = computed<EnemySummary[]>(() => {
    if (!selectedCharacter.value) return [];
    return enemySpawns.value
      .filter(
        (row) =>
          row.locationId.toString() === selectedCharacter.value?.locationId.toString() &&
          (row.state === 'available' || row.state === 'pulling')
      )
      .map((spawn) => {
        const template = enemyTemplates.value.find(
          (row) => row.id.toString() === spawn.enemyTemplateId.toString()
        );
        const members = enemySpawnMembers.value.filter(
          (row) => row.spawnId.toString() === spawn.id.toString()
        );
        const memberNames = members
          .map((member) => {
            const role = enemyRoleTemplates.value.find(
              (row) => row.id.toString() === member.roleTemplateId.toString()
            );
            return role?.displayName ?? template?.name ?? 'Enemy';
          })
          .filter((name) => name.length > 0);
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
        const factionName = template?.factionId
          ? factions.value.find(f => f.id.toString() === template.factionId!.toString())?.name ?? ''
          : '';

        // Find matching pull state
        const pull = pullStates.value.find(
          (p) => p.enemySpawnId.toString() === spawn.id.toString() && p.state === 'pending'
        );
        let isPulling = spawn.state === 'pulling';
        let pullProgress = 0;
        let pullType: string | null = null;

        // Safety net: if isPulling but no pull row, treat as not pulling
        if (isPulling && !pull) {
          isPulling = false;
        }

        if (isPulling && pull) {
          pullType = pull.pullType;
          const pullDurationMicros = pull.pullType === 'careful' ? 2_000_000 : 1_000_000;
          // Record arrival time the first time we see this pull row (in nowMicros frame,
          // so elapsed calculation stays in the same reference frame — no server clock sync needed).
          const spawnKey = spawn.id.toString();
          if (!pullArrivalTimes.has(spawnKey)) {
            pullArrivalTimes.set(spawnKey, nowMicros.value);
          }
          const startMicros = pullArrivalTimes.get(spawnKey)!;
          const elapsed = nowMicros.value - startMicros;
          pullProgress = Math.min(1, Math.max(0, elapsed / pullDurationMicros));

          // Orphan safety net: if elapsed exceeds duration + 2s grace, stop showing bar
          if (elapsed > pullDurationMicros + 2_000_000) {
            isPulling = false;
            pullProgress = 0;
            pullArrivalTimes.delete(spawnKey);
          }
        } else {
          // Clean up arrival time if no longer pulling
          pullArrivalTimes.delete(spawn.id.toString());
        }

        const roleTemplate = members.length > 0
          ? enemyRoleTemplates.value.find(
              (r) => r.id.toString() === members[0].roleTemplateId.toString()
            )
          : undefined;
        const fullName = roleTemplate?.displayName ?? template?.name ?? spawn.name;

        return {
          id: spawn.id,
          name: fullName,
          level,
          conClass,
          groupCount: spawn.groupCount ?? 1n,
          memberNames,
          factionName,
          isPulling,
          pullProgress,
          pullType,
        };
      });
  });

  const combatEnemiesList = computed(() => {
    if (!activeCombat.value) return [];
    const combatId = activeCombat.value.id.toString();
    const enemies = combatEnemies.value.filter(
      (row) => row.combatId.toString() === combatId
    );
    return enemies.map((enemy) => {
      const template = enemyTemplates.value.find(
        (row) => row.id.toString() === enemy.enemyTemplateId.toString()
      );
      const name = enemy.displayName ?? template?.name ?? 'Enemy';
      const level = template?.level ?? 1n;
      const diff = selectedCharacter.value
        ? Number(level - selectedCharacter.value.level)
        : 0;
      let conClass = 'conWhite';
      if (diff <= -5) conClass = 'conGray';
      else if (diff <= -2) conClass = 'conLightGreen';
      else if (diff === -1) conClass = 'conBlue';
      else if (diff === 0) conClass = 'conWhite';
      else if (diff === 1) conClass = 'conYellow';
      else if (diff === 2) conClass = 'conOrange';
      else conClass = 'conRed';
       const effects = combatEnemyEffects.value
         .filter(
           (row) =>
             row.combatId.toString() === combatId &&
             row.enemyId.toString() === enemy.id.toString()
         )
         .map((effect) => {
           const seconds = effectRemainingSeconds(effect, nowMicros.value, effectTimers);
           const label = effectLabel(effect);
           const isNegative = effectIsNegative(effect);
           return {
             id: effect.id,
             label,
            seconds,
            isNegative,
          };
        });
      const cast = combatEnemyCasts.value.find(
        (row) =>
          row.combatId.toString() === combatId &&
          row.enemyId.toString() === enemy.id.toString()
      );
      const ability = cast
        ? enemyAbilities.value.find((row) => row.abilityKey === cast.abilityKey)
        : null;
      const castDuration = ability?.castSeconds ? Number(ability.castSeconds) * 1_000_000 : 0;
      const castProgress = (() => {
        if (!cast || !castDuration) return 0;
        const endsAt = Number(cast.endsAtMicros);
        const key = `${cast.combatId.toString()}:${cast.enemyId.toString()}:${cast.abilityKey}`;
        const remaining = Math.max(0, endsAt - nowMicros.value);
        const startFromRemaining = nowMicros.value - Math.max(0, castDuration - remaining);
        const existing = enemyCastTimers.get(key);
        if (!existing || existing.endsAtMicros !== endsAt) {
          enemyCastTimers.set(key, {
            startMicros: startFromRemaining,
            durationMicros: castDuration,
            endsAtMicros: endsAt,
          });
        }
        const entry = enemyCastTimers.get(key);
        if (!entry) return 0;
        const elapsed = nowMicros.value - entry.startMicros;
        const clamped = Math.max(0, Math.min(entry.durationMicros, elapsed));
        return clamped / entry.durationMicros;
      })();
      const targetName = (() => {
        if (enemy.aggroTargetPetId) {
          return (
            activePets.value.find(
              (row) => row.id.toString() === enemy.aggroTargetPetId?.toString()
            )?.name ?? null
          );
        }
        if (!enemy.aggroTargetCharacterId) return null;
        return (
          characters.value.find(
            (row) => row.id.toString() === enemy.aggroTargetCharacterId?.toString()
          )?.name ?? null
        );
      })();
      return {
        id: enemy.id,
        name,
        level,
        hp: enemy.currentHp,
        maxHp: enemy.maxHp,
        conClass,
        isTarget: enemy.id.toString() === selectedCharacter.value?.combatTargetEnemyId?.toString(),
        effects,
        castLabel: ability?.name ?? '',
        castProgress,
        isCasting: !!cast && castDuration > 0,
        targetName,
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

  const startPull = (enemySpawnId: bigint, pullType: 'careful' | 'body') => {
    if (!connActive.value || !selectedCharacter.value) return;
    startPullReducer({ characterId: selectedCharacter.value.id, enemySpawnId, pullType });
  };

  const startTrackedCombat = (enemyTemplateId: bigint) => {
    if (!connActive.value || !selectedCharacter.value) return;
    startTrackedCombatReducer({ characterId: selectedCharacter.value.id, enemyTemplateId });
  };

  const flee = () => {
    if (!connActive.value || !activeCombat.value || !selectedCharacter.value) return;
    fleeCombatReducer({
      characterId: selectedCharacter.value.id,
    });
  };
  const dismissResults = () => {
    if (!connActive.value || !selectedCharacter.value) return;
    const inGroup = Boolean(selectedCharacter.value.groupId);
    if (hasOtherLootForResult.value) {
      const confirmDismiss = window.confirm(
        'Other group members still have unclaimed loot. Dismissing will forfeit all remaining loot. Continue?'
      );
      if (!confirmDismiss) return;
      dismissResultsReducer({ characterId: selectedCharacter.value.id, force: true });
      return;
    }
    if (activeLoot.value.length > 0) {
      const confirmDismiss = window.confirm(
        'You have unclaimed loot. Dismissing will forfeit these items. Continue?'
      );
      if (!confirmDismiss) return;
      dismissResultsReducer({ characterId: selectedCharacter.value.id, force: true });
      return;
    }
    if (inGroup) {
      const confirmDismiss = window.confirm(
        'This may forfeit unclaimed group loot. Dismiss combat results anyway?'
      );
      if (!confirmDismiss) return;
      dismissResultsReducer({ characterId: selectedCharacter.value.id, force: true });
      return;
    }
    dismissResultsReducer({ characterId: selectedCharacter.value.id, force: false });
  };

  const takeLoot = (lootId: bigint) => {
    if (!connActive.value || !selectedCharacter.value) return;
    takeLootReducer({ characterId: selectedCharacter.value.id, lootId });
  };

  const takeAllLoot = () => {
    if (!connActive.value || !selectedCharacter.value) return;
    takeAllLootReducer({ characterId: selectedCharacter.value.id });
  };

  const setCombatTarget = (enemyId: bigint | null) => {
    if (!connActive.value || !selectedCharacter.value) return;
    setCombatTargetReducer({
      characterId: selectedCharacter.value.id,
      enemyId: enemyId ?? undefined,
    });
  };

  watch(
    () => activeCombat.value?.id?.toString() ?? null,
    () => {
      effectTimers.clear();
      enemyCastTimers.clear();
    }
  );

  return {
    activeCombat,
    activeResult,
    activeLoot,
    pendingLoot,
    lootForResult,
    hasAnyLootForResult,
    hasOtherLootForResult,
    activeEnemy,
    activeEnemyName,
    activeEnemyLevel,
    activeEnemyConClass,
    activeEnemyEffects,
    activeEnemyActionText,
    activeEnemyCastProgress,
    activeEnemyCastLabel,
    activeEnemySpawn,
    availableEnemies,
    combatEnemiesList,
    combatRoster,
    startCombat,
    startPull,
    startTrackedCombat,
    setCombatTarget,
    flee,
    dismissResults,
    takeLoot,
    takeAllLoot,
  };
};
