import { computed, ref, watch, onUnmounted, type Ref } from 'vue';
import { reducers } from '../module_bindings';
import type {
  Character,
  CombatEncounter,
  CombatParticipant,
  CombatEnemy,
  ActivePet,
  CombatEnemyCast,
  CombatResult,
  CombatLoot,
  EnemySpawn,
  EnemyTemplate,
  EnemyRoleTemplate,
  EnemySpawnMember,
  CombatEnemyEffect,
  EnemyAbility,
  ItemTemplate,
  Faction,
  PullState,
  AbilityTemplate,
  AbilityCooldown,
  HotbarSlot,
} from '../module_bindings/types';
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
  isBoss: boolean;
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
  selectedCharacter: Ref<Character | null>;
  combatEncounters: Ref<CombatEncounter[]>;
  combatParticipants: Ref<CombatParticipant[]>;
  combatEnemies: Ref<CombatEnemy[]>;
  activePets: Ref<ActivePet[]>;
  combatEnemyEffects: Ref<CombatEnemyEffect[]>;
  combatEnemyCasts: Ref<CombatEnemyCast[]>;
  enemyAbilities: Ref<EnemyAbility[]>;
  combatResults: Ref<CombatResult[]>;
  combatLoot: Ref<CombatLoot[]>;
  itemTemplates: Ref<ItemTemplate[]>;
  fallbackRoster: Ref<Character[]>;
  enemySpawns: Ref<EnemySpawn[]>;
  enemyTemplates: Ref<EnemyTemplate[]>;
  enemyRoleTemplates: Ref<EnemyRoleTemplate[]>;
  enemySpawnMembers: Ref<EnemySpawnMember[]>;
  pullStates: Ref<PullState[]>;
  nowMicros: Ref<number>;
  characters: Ref<Character[]>;
  factions: Ref<Faction[]>;
  // Round-based combat tables
  combatRounds: Ref<any[]>;
  combatActions: Ref<any[]>;
  combatNarratives: Ref<any[]>;  // Reserved for narrative rendering in NarrativeConsole
  hotbarSlots: Ref<HotbarSlot[]>;
  abilityTemplates: Ref<AbilityTemplate[]>;
  abilityCooldowns: Ref<AbilityCooldown[]>;
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
  combatRounds,
  combatActions,
  combatNarratives: _combatNarratives, // eslint-disable-line @typescript-eslint/no-unused-vars
  hotbarSlots,
  abilityTemplates,
  abilityCooldowns,
}: UseCombatArgs) => {
  const effectTimers = new Map<
    string,
    { seenAtMicros: number; rounds: bigint; tickSeconds: number }
  >();
  const enemyCastTimers = new Map<
    string,
    { startMicros: number; durationMicros: number; endsAtMicros: number }
  >();
  const pullArrivalTimes = new Map<string, number>();
  const startCombatReducer = useReducer(reducers.startCombat);
  const startPullReducer = useReducer(reducers.startPull);
  const startTrackedCombatReducer = useReducer(reducers.startTrackedCombat);
  const setCombatTargetReducer = useReducer(reducers.setCombatTarget);
  const fleeCombatReducer = useReducer(reducers.fleeCombat);
  const dismissResultsReducer = useReducer(reducers.dismissCombatResults);
  const takeLootReducer = useReducer(reducers.takeLoot);
  const takeAllLootReducer = useReducer(reducers.takeAllLoot);
  const submitCombatActionReducer = useReducer(reducers.submitCombatAction);

  // ---- Core combat state ----

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

  const isInCombat = computed(() => {
    if (!activeCombat.value) return false;
    return activeCombat.value.state === 'active';
  });

  // ---- Round-based combat state ----

  const currentRound = computed(() => {
    if (!activeCombat.value) return null;
    const combatId = activeCombat.value.id.toString();
    const rounds = combatRounds.value.filter(
      (r: any) => r.combatId.toString() === combatId
    );
    if (rounds.length === 0) return null;
    // Find the non-resolved round, or the highest round number
    const active = rounds.find((r: any) => r.state !== 'resolved');
    if (active) return active;
    return rounds.reduce((latest: any, current: any) =>
      Number(current.roundNumber) > Number(latest.roundNumber) ? current : latest
    );
  });

  const roundState = computed<string | null>(() => {
    return currentRound.value?.state ?? null;
  });

  const myAction = computed(() => {
    if (!activeCombat.value || !selectedCharacter.value || !currentRound.value) return null;
    const combatId = activeCombat.value.id.toString();
    const charId = selectedCharacter.value.id.toString();
    const roundNum = currentRound.value.roundNumber.toString();
    return combatActions.value.find(
      (a: any) =>
        a.combatId.toString() === combatId &&
        a.characterId.toString() === charId &&
        a.roundNumber.toString() === roundNum
    ) ?? null;
  });

  const hasSubmittedAction = computed(() => myAction.value !== null);

  // Round timer countdown using requestAnimationFrame
  const roundTimeRemaining = ref(0);
  let rafId: number | null = null;

  const updateTimer = () => {
    if (!currentRound.value || roundState.value !== 'action_select') {
      roundTimeRemaining.value = 0;
      rafId = requestAnimationFrame(updateTimer);
      return;
    }
    const expiresAtMicros = Number(currentRound.value.timerExpiresAtMicros);
    const nowUs = Date.now() * 1000;
    const remainingUs = expiresAtMicros - nowUs;
    roundTimeRemaining.value = Math.max(0, Math.round(remainingUs / 1_000_000));
    rafId = requestAnimationFrame(updateTimer);
  };

  // Start/stop timer loop based on combat state
  watch(
    () => activeCombat.value?.id?.toString() ?? null,
    (id) => {
      if (id && !rafId) {
        rafId = requestAnimationFrame(updateTimer);
      } else if (!id && rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
        roundTimeRemaining.value = 0;
      }
    },
    { immediate: true }
  );

  onUnmounted(() => {
    if (rafId) cancelAnimationFrame(rafId);
  });

  // ---- Action submission functions ----

  const submitAction = (
    actionType: string,
    abilityTemplateId?: bigint,
    targetEnemyId?: bigint,
    targetCharacterId?: bigint
  ) => {
    if (!connActive.value || !selectedCharacter.value) return;
    submitCombatActionReducer({
      characterId: selectedCharacter.value.id,
      actionType,
      abilityTemplateId: abilityTemplateId ?? undefined,
      targetEnemyId: targetEnemyId ?? undefined,
      targetCharacterId: targetCharacterId ?? undefined,
    });
  };

  const submitAbility = (abilityTemplateId: bigint, targetEnemyId: bigint) => {
    submitAction('ability', abilityTemplateId, targetEnemyId);
  };

  const submitAutoAttack = (targetEnemyId: bigint) => {
    submitAction('auto_attack', undefined, targetEnemyId);
  };

  const submitFlee = () => {
    submitAction('flee');
  };

  // ---- Action prompt building ----

  const actionPromptMessage = computed<string | null>(() => {
    if (!activeCombat.value || roundState.value !== 'action_select' || hasSubmittedAction.value) {
      return null;
    }
    const charId = selectedCharacter.value?.id;
    if (!charId) return null;

    const lines: string[] = [];
    const timer = roundTimeRemaining.value;
    lines.push(`Choose your action (${timer}s remaining):`);
    lines.push('');

    // Character abilities (all known abilities, not just hotbar)
    const charAbilities = abilityTemplates.value.filter(
      (t) => t.characterId?.toString() === charId.toString()
    );
    for (const template of charAbilities) {
      const cooldown = abilityCooldowns.value.find(
        (c) =>
          c.characterId?.toString() === charId.toString() &&
          c.abilityTemplateId.toString() === template.id.toString()
      );
      const cdRemaining = cooldown
        ? Math.max(0, Math.ceil((Number(cooldown.startedAtMicros) + Number(cooldown.durationMicros) - nowMicros.value) / 1_000_000))
        : 0;
      const manaCost = template.resourceCost ? ` (${template.resourceCost} ${template.resourceType ?? 'mana'})` : '';
      if (cdRemaining > 0) {
        lines.push(`  ~~${template.name}~~ (${cdRemaining}s)${manaCost}`);
      } else {
        lines.push(`  [${template.name}]${manaCost}`);
      }
    }

    lines.push(`  [Auto-attack]`);
    lines.push(`  [Flee]`);
    lines.push('');

    // Target list: living enemies
    const combatId = activeCombat.value.id.toString();
    const livingEnemies = combatEnemies.value.filter(
      (e) => e.combatId.toString() === combatId && e.currentHp > 0n
    );
    if (livingEnemies.length > 0) {
      lines.push('Targets:');
      for (const enemy of livingEnemies) {
        const template = enemyTemplates.value.find(
          (t) => t.id.toString() === enemy.enemyTemplateId.toString()
        );
        const name = enemy.displayName ?? template?.name ?? 'Enemy';
        const level = template?.level ?? 1n;
        lines.push(`  [${name}] (L${level})`);
      }
    }

    return lines.join('\n');
  });

  // ---- Round summary building ----

  const roundSummaryMessage = computed<string | null>(() => {
    if (!activeCombat.value) return null;
    // Build summary after a round resolves
    const round = currentRound.value;
    if (!round || round.state !== 'resolved') return null;

    const combatId = activeCombat.value.id.toString();
    const BAR_WIDTH = 18;
    const lines: string[] = [];
    lines.push(`--- Round ${round.roundNumber} ---`);

    // Enemy HP bars
    const enemies = combatEnemies.value.filter(
      (e) => e.combatId.toString() === combatId
    );
    for (const enemy of enemies) {
      const template = enemyTemplates.value.find(
        (t) => t.id.toString() === enemy.enemyTemplateId.toString()
      );
      const name = enemy.displayName ?? template?.name ?? 'Enemy';
      const level = template?.level ?? 1n;
      const hp = Number(enemy.currentHp);
      const maxHp = Number(enemy.maxHp);
      const pct = maxHp > 0 ? hp / maxHp : 0;
      const filled = Math.round(pct * BAR_WIDTH);
      const empty = BAR_WIDTH - filled;
      const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
      const color = pct > 0.5 ? '#69db7c' : pct > 0.25 ? '#ffd43b' : '#ff6b6b';
      lines.push(`{{color:${color}}}[${bar}]{{/color}} ${hp}/${maxHp} HP  ${name} (L${level})`);
    }

    lines.push('---');

    // Player HP bars
    const roster = combatParticipants.value.filter(
      (p) => p.combatId.toString() === combatId
    );
    for (const participant of roster) {
      const character = characters.value.find(
        (c) => c.id.toString() === participant.characterId.toString()
      );
      if (!character) continue;
      const hp = Number(character.hp);
      const maxHp = Number(character.maxHp);
      const pct = maxHp > 0 ? hp / maxHp : 0;
      const filled = Math.round(pct * BAR_WIDTH);
      const empty = BAR_WIDTH - filled;
      const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
      const color = pct > 0.5 ? '#69db7c' : pct > 0.25 ? '#ffd43b' : '#ff6b6b';
      lines.push(`{{color:${color}}}[${bar}]{{/color}} ${hp}/${maxHp} HP  ${character.name}`);
    }

    return lines.join('\n');
  });

  // ---- Existing combat state (kept for backward compatibility) ----

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
          characterLevel: selectedCharacter.value?.level ?? 1n,
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

    if (allLoot.length > 0 || filtered.length > 0) {
      console.log('[LOOT DEBUG] combatLoot rows:', allLoot.length, 'filtered for char:', filtered.length, 'characterId:', characterId);
    }

    return filtered
      .slice(0, 10)
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
          characterLevel: selectedCharacter.value?.level ?? 1n,
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
    const myCharId = selectedCharacter.value?.id.toString();
    return combatEnemyEffects.value
      .filter(
        (row) =>
          row.combatId.toString() === combatId && row.enemyId.toString() === enemyId
      )
      .map((effect) => {
        const seconds = effectRemainingSeconds(effect, nowMicros.value, effectTimers);
        const label = effectLabel(effect);
        const isNegative = effectIsNegative(effect);
        const isOwn = !!myCharId && effect.ownerCharacterId?.toString() === myCharId;
        return {
          id: effect.id,
          label,
          seconds,
          isNegative,
          isOwn,
        };
      })
      .sort((a, b) => (b.isOwn ? 1 : 0) - (a.isOwn ? 1 : 0));
  });

  const activeEnemyActionText = computed(() => {
    if (!activeCombat.value) return 'Idle';
    const combatId = activeCombat.value.id.toString();
    const cast = combatEnemyCasts.value.find((row) => row.combatId.toString() === combatId);
    if (cast) {
      const pretty = cast.abilityKey
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (match: string) => match.toUpperCase());
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

        const pull = pullStates.value.find(
          (p) => p.enemySpawnId.toString() === spawn.id.toString() && p.state === 'pending'
        );
        let isPulling = spawn.state === 'pulling';
        let pullProgress = 0;
        let pullType: string | null = null;

        if (isPulling && !pull) {
          isPulling = false;
        }

        if (isPulling && pull) {
          pullType = pull.pullType;
          const pullDurationMicros = pull.pullType === 'careful' ? 2_000_000 : 1_000_000;
          const spawnKey = spawn.id.toString();
          if (!pullArrivalTimes.has(spawnKey)) {
            pullArrivalTimes.set(spawnKey, nowMicros.value);
          }
          const startMicros = pullArrivalTimes.get(spawnKey)!;
          const elapsed = nowMicros.value - startMicros;
          pullProgress = Math.min(1, Math.max(0, elapsed / pullDurationMicros));

          if (elapsed > pullDurationMicros + 2_000_000) {
            isPulling = false;
            pullProgress = 0;
            pullArrivalTimes.delete(spawnKey);
          }
        } else {
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
          isBoss: !!(template?.isBoss),
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
       const myCharId = selectedCharacter.value?.id.toString();
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
           const isOwn = !!myCharId && effect.ownerCharacterId?.toString() === myCharId;
           return {
             id: effect.id,
             label,
            seconds,
            isNegative,
            isOwn,
          };
        })
        .sort((a, b) => (b.isOwn ? 1 : 0) - (a.isOwn ? 1 : 0));
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
        isBoss: !!(template?.isBoss),
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

  // ---- Action functions ----

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
    // Round-based combat
    submitAction,
    submitAbility,
    submitAutoAttack,
    submitFlee,
    currentRound,
    roundState,
    myAction,
    hasSubmittedAction,
    roundTimeRemaining,
    actionPromptMessage,
    roundSummaryMessage,
    isInCombat,
  };
};
