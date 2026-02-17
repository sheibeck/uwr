import { computed, ref, watch, type Ref } from 'vue';
import { reducers } from '../module_bindings';
import type {
  AbilityCooldownRow,
  AbilityTemplateRow,
  CharacterCastRow,
  CharacterRow,
  HotbarSlotRow,
} from '../module_bindings';
import { useReducer } from 'spacetimedb/vue';

type HotbarDisplaySlot = {
  slot: number;
  abilityKey: string;
  name: string;
  description: string;
  resource: string;
  kind: string;
  level: bigint;
  cooldownSeconds: bigint;
  cooldownRemaining: number;
};

type UseHotbarArgs = {
  connActive: Ref<boolean>;
  selectedCharacter: Ref<CharacterRow | null>;
  hotbarSlots: Ref<HotbarSlotRow[]>;
  abilityTemplates: Ref<AbilityTemplateRow[]>;
  abilityCooldowns: Ref<AbilityCooldownRow[]>;
  characterCasts: Ref<CharacterCastRow[]>;
  nowMicros: Ref<number>;
  activeCombat: Ref<unknown | null>;
  canActInCombat: Ref<boolean>;
  defensiveTargetId: Ref<bigint | null>;
  selectedCorpseTarget?: Ref<bigint | null>;
  selectedCharacterTarget?: Ref<bigint | null>;
  groupId?: Ref<bigint | null | undefined>;
  pullerId?: Ref<bigint | null>;
  onTrackRequested?: () => void;
  onResurrectRequested?: (corpseId: bigint) => void;
  onCorpseSummonRequested?: (targetCharacterId: bigint) => void;
  addLocalEvent?: (kind: string, message: string) => void;
};

const toMicros = (seconds: bigint | undefined) => {
  if (!seconds || seconds <= 0n) return 0;
  return Math.round(Number(seconds) * 1_000_000);
};

const COOLDOWN_SKEW_SUPPRESS_MICROS = 10_000_000;

export const useHotbar = ({
  connActive,
  selectedCharacter,
  hotbarSlots,
  abilityTemplates,
  abilityCooldowns,
  characterCasts,
  nowMicros,
  activeCombat,
  canActInCombat,
  defensiveTargetId,
  selectedCorpseTarget,
  selectedCharacterTarget,
  groupId,
  pullerId,
  onTrackRequested,
  onResurrectRequested,
  onCorpseSummonRequested,
  addLocalEvent,
}: UseHotbarArgs) => {
  const setHotbarReducer = useReducer(reducers.setHotbarSlot);
  const useAbilityReducer = useReducer(reducers.useAbility);

  const localCast = ref<{ abilityKey: string; startMicros: number; durationMicros: number } | null>(
    null
  );
  const localCooldowns = ref(new Map<string, number>());
  const predictedCooldownReadyAt = ref(new Map<string, number>());
  const hotbarPulseKey = ref<string | null>(null);

  const availableAbilities = computed(() => {
    if (!selectedCharacter.value) return [];
    const className = selectedCharacter.value.className.toLowerCase();
    const level = Number(selectedCharacter.value.level);
    return abilityTemplates.value.filter(
      (ability) =>
        ability.className.toLowerCase() === className && Number(ability.level) <= level
    );
  });

  const abilityLookup = computed(() => {
    const map = new Map<string, AbilityTemplateRow>();
    for (const ability of abilityTemplates.value) {
      map.set(ability.key, ability);
    }
    return map;
  });

  const hotbarAssignments = computed(() => {
    const slots: { slot: number; abilityKey: string; name: string }[] = [];
    for (let i = 1; i <= 10; i += 1) {
      slots.push({ slot: i, abilityKey: '', name: 'Empty' });
    }
    if (!selectedCharacter.value) return slots;
    for (const row of hotbarSlots.value) {
      if (row.characterId.toString() !== selectedCharacter.value.id.toString()) continue;
      const ability = availableAbilities.value.find((item) => item.key === row.abilityKey);
      const target = slots[row.slot - 1];
      if (!target) continue;
      target.abilityKey = row.abilityKey;
      target.name = ability?.name ?? row.abilityKey;
    }
    return slots;
  });

  const cooldownByAbility = computed(() => {
    if (!selectedCharacter.value) return new Map<string, bigint>();
    const map = new Map<string, bigint>();
    for (const row of abilityCooldowns.value) {
      if (row.characterId.toString() !== selectedCharacter.value.id.toString()) continue;
      map.set(row.abilityKey, row.readyAtMicros);
    }
    return map;
  });

  const hotbarDisplay = computed<HotbarDisplaySlot[]>(() => {
    const slots = new Map(hotbarAssignments.value.map((slot) => [slot.slot, slot]));
    return Array.from({ length: 10 }, (_, index) => {
      const slotIndex = index + 1;
      const assignment =
        slots.get(slotIndex) ?? {
          slot: slotIndex,
          abilityKey: '',
          name: 'Empty',
        };
      const ability = assignment.abilityKey
        ? abilityLookup.value.get(assignment.abilityKey)
        : undefined;
      const readyAt = assignment.abilityKey
        ? cooldownByAbility.value.get(assignment.abilityKey)
        : undefined;
      const serverReadyAt = readyAt ? Number(readyAt) : 0;
      const localReadyAt = assignment.abilityKey
        ? localCooldowns.value.get(assignment.abilityKey) ?? 0
        : 0;
      const predictedReadyAt = assignment.abilityKey
        ? predictedCooldownReadyAt.value.get(assignment.abilityKey) ?? 0
        : 0;

      // If we made a local prediction for this ability, trust it over the server
      // until the prediction entry is fully cleaned up (10s after expiry).
      // This prevents the "cooldown refills" visual glitch from server latency.
      const hasPrediction = predictedReadyAt > 0;
      const serverRemaining = hasPrediction ? 0 : Math.max(serverReadyAt - nowMicros.value, 0);
      const localRemaining = localReadyAt ? localReadyAt - nowMicros.value : 0;

      const isLocallyCastingThisAbility = Boolean(
        localCast.value &&
          assignment.abilityKey &&
          localCast.value.abilityKey === assignment.abilityKey &&
          nowMicros.value < localCast.value.startMicros + localCast.value.durationMicros
      );
      const effectiveLocalRemaining = isLocallyCastingThisAbility ? 0 : localRemaining;
      const remainingMicros =
        effectiveLocalRemaining > 0
          ? effectiveLocalRemaining
          : Math.max(serverRemaining, 0);
      const cooldownRemainingRaw = remainingMicros > 0 ? Math.ceil(remainingMicros / 1_000_000) : 0;
      const configuredCooldownSeconds = ability?.cooldownSeconds
        ? Number(ability.cooldownSeconds)
        : 0;
      const GCD_SECONDS = 1;
      const cooldownRemaining =
        configuredCooldownSeconds > 0
          ? Math.min(cooldownRemainingRaw, configuredCooldownSeconds)
          : Math.min(cooldownRemainingRaw, GCD_SECONDS);
      const resolvedDescription =
        ability?.description?.trim() || (assignment.abilityKey ? `${assignment.name} ability.` : '');
      return {
        ...assignment,
        description: resolvedDescription,
        resource: ability?.resource ?? '',
        kind: ability?.kind ?? '',
        level: ability?.level ?? 0n,
        cooldownSeconds: ability?.cooldownSeconds ?? 0n,
        cooldownRemaining,
      };
    });
  });

  const setHotbarSlot = (slot: number, abilityKey: string) => {
    if (!connActive.value || !selectedCharacter.value) return;
    setHotbarReducer({
      characterId: selectedCharacter.value.id,
      slot,
      abilityKey,
    });
  };

  const useAbility = (abilityKey: string, targetCharacterId?: bigint) => {
    if (!connActive.value || !selectedCharacter.value || !abilityKey) return;
    useAbilityReducer({
      characterId: selectedCharacter.value.id,
      abilityKey,
      targetCharacterId,
    });
  };

  const castingState = computed(() => {
    if (!selectedCharacter.value) return null;
    const row =
      characterCasts.value.find(
        (entry) => entry.characterId.toString() === selectedCharacter.value?.id.toString()
      ) ?? null;
    if (!row) return null;
    return {
      ...row,
      castingAbilityKey: row.abilityKey,
    };
  });

  const activeCastKey = computed(() => localCast.value?.abilityKey ?? castingState.value?.abilityKey ?? '');
  const activeCastEndsAt = computed(() =>
    castingState.value?.endsAtMicros ? Number(castingState.value.endsAtMicros) : 0
  );
  const isCasting = computed(() => Boolean(activeCastKey.value));

  const castProgress = computed(() => {
    if (!isCasting.value) return 0;
    if (localCast.value) {
      const elapsed = nowMicros.value - localCast.value.startMicros;
      const duration = localCast.value.durationMicros;
      if (!duration) return 1;
      const clamped = Math.max(0, Math.min(duration, elapsed));
      return clamped / duration;
    }
    if (!activeCastEndsAt.value) return 0;
    const ability = abilityLookup.value.get(activeCastKey.value ?? '');
    const duration = toMicros(ability?.castSeconds);
    if (!duration) return 1;
    const remaining = activeCastEndsAt.value - nowMicros.value;
    const clamped = Math.max(0, Math.min(duration, duration - remaining));
    return clamped / duration;
  });

  const hotbarTooltipItem = (slot: HotbarDisplaySlot) => {
    if (!slot?.abilityKey) return null;
    const liveAbility = abilityLookup.value.get(slot.abilityKey);
    const description = liveAbility?.description?.trim() || slot.description || `${slot.name} ability.`;
    return {
      name: slot.name || slot.abilityKey,
      description,
      stats: [
        { label: 'Level', value: slot.level || '-' },
        { label: 'Type', value: slot.kind || '-' },
        { label: 'Resource', value: slot.resource || '-' },
      ],
    };
  };

  const runPrediction = (abilityKey: string) => {
    const ability = abilityLookup.value.get(abilityKey);
    const castDurationMicros = toMicros(ability?.castSeconds);
    if (castDurationMicros > 0) {
      localCast.value = {
        abilityKey,
        startMicros: nowMicros.value,
        durationMicros: castDurationMicros,
      };
    }
    const cooldownMicros = toMicros(ability?.cooldownSeconds);
    if (cooldownMicros > 0) {
      const readyAt = nowMicros.value + castDurationMicros + cooldownMicros;
      localCooldowns.value.set(abilityKey, readyAt);
      predictedCooldownReadyAt.value.set(abilityKey, readyAt);
    }
    hotbarPulseKey.value = abilityKey;
    window.setTimeout(() => {
      if (hotbarPulseKey.value === abilityKey) hotbarPulseKey.value = null;
    }, 800);
  };

  const onHotbarClick = (slot: HotbarDisplaySlot) => {
    if (!selectedCharacter.value || !slot?.abilityKey) return;
    if (isCasting.value) return;
    if (slot.abilityKey === 'ranger_track') {
      // Block Track if in group and not the puller
      if (
        groupId?.value &&
        pullerId?.value !== null &&
        pullerId?.value !== undefined &&
        pullerId?.value !== selectedCharacter.value?.id
      ) {
        addLocalEvent?.('blocked', 'You must be the puller to use this ability.');
        return;
      }
      onTrackRequested?.();
      return;
    }
    if (activeCombat.value && !canActInCombat.value && slot.kind !== 'utility') {
      addLocalEvent?.('blocked', `Cannot act yet — waiting for combat turn.`);
      return;
    }
    // Use combatState from ability template to determine if ability can be used
    const ability = abilityLookup.value.get(slot.abilityKey);
    const combatState = ability?.combatState ?? 'any';
    if (combatState === 'combat_only' && !activeCombat.value) {
      addLocalEvent?.('blocked', `${ability?.name ?? slot.name} can only be used in combat.`);
      return;
    }
    if (combatState === 'out_of_combat_only' && activeCombat.value) {
      addLocalEvent?.('blocked', `${ability?.name ?? slot.name} cannot be used during combat.`);
      return;
    }

    // Special handling for resurrection - requires corpse target
    if (slot.abilityKey === 'cleric_resurrect') {
      if (!selectedCorpseTarget?.value) {
        addLocalEvent?.('blocked', 'You must target a corpse first.');
        return;
      }
      // Call initiate_resurrect which creates PendingSpellCast for confirmation
      onResurrectRequested?.(selectedCorpseTarget.value);
      return;
    }

    // Special handling for corpse summon - requires character target (not corpse)
    if (
      slot.abilityKey === 'necromancer_corpse_summon' ||
      slot.abilityKey === 'summoner_corpse_summon'
    ) {
      if (!selectedCharacterTarget?.value) {
        addLocalEvent?.('blocked', 'You must target a character first.');
        return;
      }
      // Call initiate_corpse_summon which creates PendingSpellCast for confirmation
      onCorpseSummonRequested?.(selectedCharacterTarget.value);
      return;
    }

    runPrediction(slot.abilityKey);

    const targetId = defensiveTargetId.value ?? undefined;
    useAbility(slot.abilityKey, targetId);
  };

  watch(
    () => selectedCharacter.value?.id,
    () => {
      localCast.value = null;
      localCooldowns.value.clear();
      predictedCooldownReadyAt.value.clear();
      hotbarPulseKey.value = null;
    }
  );

  watch(
    () => activeCombat.value,
    (newVal, oldVal) => {
      if (!newVal && oldVal) {
        // Combat just ended — clear all optimistic predictions
        localCast.value = null;
        localCooldowns.value.clear();
        predictedCooldownReadyAt.value.clear();
        hotbarPulseKey.value = null;
      }
    }
  );

  watch(
    () => nowMicros.value,
    (now) => {
      if (localCast.value && now - localCast.value.startMicros >= localCast.value.durationMicros) {
        localCast.value = null;
      }
      // Safety net: clear orphaned localCast if server has no active cast and local timer expired + buffer
      if (localCast.value && !castingState.value) {
        const elapsed = now - localCast.value.startMicros;
        const buffer = 2_000_000; // 2 second grace period
        if (elapsed >= localCast.value.durationMicros + buffer) {
          localCast.value = null;
        }
      }
      if (localCooldowns.value.size === 0) return;
      for (const [key, readyAt] of localCooldowns.value.entries()) {
        if (now >= readyAt) {
          localCooldowns.value.delete(key);
        }
      }
      for (const [key, readyAt] of predictedCooldownReadyAt.value.entries()) {
        if (now >= readyAt + COOLDOWN_SKEW_SUPPRESS_MICROS) {
          predictedCooldownReadyAt.value.delete(key);
        }
      }
    }
  );

  // Clear optimistic cooldowns if server doesn't confirm them (ability failed)
  // Check every 500ms to give server time to respond
  let lastClearCheck = 0;
  watch(
    () => [abilityCooldowns.value, nowMicros.value, selectedCharacter.value?.id] as const,
    ([serverCooldowns, now, charId]) => {
      if (!charId || localCooldowns.value.size === 0) return;
      if (now - lastClearCheck < 500_000) return; // Check every 500ms
      lastClearCheck = now;

      const serverCooldownKeys = new Set(
        serverCooldowns
          .filter(cd => cd.characterId === charId && cd.readyAtMicros > now)
          .map(cd => cd.abilityKey)
      );

      // Clear local cooldowns that don't exist on server (ability failed)
      for (const [key, readyAt] of localCooldowns.value.entries()) {
        if (readyAt > now && !serverCooldownKeys.has(key)) {
          // Local shows cooldown active, but server doesn't - ability failed
          localCooldowns.value.delete(key);
          predictedCooldownReadyAt.value.delete(key);
        }
      }
    }
  );

  return {
    hotbarAssignments,
    availableAbilities,
    abilityLookup,
    hotbarDisplay,
    hotbarTooltipItem,
    setHotbarSlot,
    useAbility,
    onHotbarClick,
    hotbarPulseKey,
    castingState,
    activeCastKey,
    isCasting,
    castProgress,
  };
};
