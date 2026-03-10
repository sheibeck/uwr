import { computed, ref, watch, type Ref } from 'vue';
import { reducers } from '../module_bindings';
import type {
  AbilityCooldown,
  AbilityTemplate,
  CharacterCast,
  Character,
  Hotbar,
  HotbarSlot,
} from '../module_bindings/types';
import { useReducer } from 'spacetimedb/vue';

type HotbarDisplaySlot = {
  slot: number;
  abilityTemplateId: bigint;
  name: string;
  description: string;
  resourceType: string;
  kind: string;
  levelRequired: bigint;
  cooldownSeconds: bigint;
  cooldownRemaining: number;
};

type UseHotbarArgs = {
  connActive: Ref<boolean>;
  selectedCharacter: Ref<Character | null>;
  hotbars: Ref<Hotbar[]>;
  hotbarSlots: Ref<HotbarSlot[]>;
  abilityTemplates: Ref<AbilityTemplate[]>;
  abilityCooldowns: Ref<AbilityCooldown[]>;
  characterCasts: Ref<CharacterCast[]>;
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

// Stable string key from bigint for Map usage
const idKey = (id: bigint) => id.toString();

export const useHotbar = ({
  connActive,
  selectedCharacter,
  hotbars,
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
  const createHotbarReducer = useReducer(reducers.createHotbar);
  const switchHotbarReducer = useReducer(reducers.switchHotbar);

  // Multi-hotbar: sorted list of hotbars for the selected character
  const hotbarList = computed<Hotbar[]>(() => {
    if (!selectedCharacter.value) return [];
    const charId = selectedCharacter.value.id;
    return hotbars.value
      .filter((h) => h.characterId === charId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  });

  // Active hotbar: first with isActive=true, or first in sorted list
  const activeHotbar = computed<Hotbar | null>(() => {
    if (!hotbarList.value.length) return null;
    return hotbarList.value.find((h) => h.isActive) ?? hotbarList.value[0];
  });

  // Local prediction state keyed by abilityTemplateId string
  const localCast = ref<{ abilityTemplateId: bigint; startMicros: number; durationMicros: number } | null>(
    null
  );
  const localCooldowns = ref(new Map<string, number>());
  const cooldownReceivedAt = ref(new Map<string, number>());
  const hotbarPulseKey = ref<string | null>(null);

  // All abilities owned by this character
  const availableAbilities = computed(() => {
    if (!selectedCharacter.value) return [];
    const charId = selectedCharacter.value.id;
    return abilityTemplates.value.filter(
      (ability) => ability.characterId === charId
    );
  });

  // Lookup by id (bigint -> AbilityTemplate)
  const abilityLookup = computed(() => {
    const map = new Map<string, AbilityTemplate>();
    for (const ability of abilityTemplates.value) {
      map.set(idKey(ability.id), ability);
    }
    return map;
  });

  const hotbarAssignments = computed(() => {
    const slots: { slot: number; abilityTemplateId: bigint; name: string }[] = [];
    for (let i = 1; i <= 10; i += 1) {
      slots.push({ slot: i, abilityTemplateId: 0n, name: 'Empty' });
    }
    if (!selectedCharacter.value) return slots;
    // If character has hotbars, use the active hotbar's slots (by hotbarId)
    // Backward compat: if no hotbars exist yet, fall back to by_character filter
    const activeHotbarId = activeHotbar.value?.id ?? null;
    for (const row of hotbarSlots.value) {
      if (activeHotbarId !== null) {
        if (row.hotbarId !== activeHotbarId) continue;
      } else {
        if (row.characterId !== selectedCharacter.value.id) continue;
      }
      const target = slots[row.slot - 1];
      if (!target) continue;
      target.abilityTemplateId = row.abilityTemplateId;
      const ability = abilityLookup.value.get(idKey(row.abilityTemplateId));
      target.name = ability?.name ?? 'Unknown';
    }
    return slots;
  });

  const cooldownByAbility = computed(() => {
    if (!selectedCharacter.value) return new Map<string, { durationMicros: number; receivedAt: number }>();
    const map = new Map<string, { durationMicros: number; receivedAt: number }>();
    for (const row of abilityCooldowns.value) {
      if (row.characterId !== selectedCharacter.value.id) continue;
      const key = idKey(row.abilityTemplateId);
      const receivedAt = cooldownReceivedAt.value.get(key) ?? Date.now() * 1000;
      map.set(key, { durationMicros: Number(row.durationMicros), receivedAt });
    }
    return map;
  });

  watch(
    () => abilityCooldowns.value,
    (rows) => {
      const charId = selectedCharacter.value?.id;
      if (charId == null) return;
      const activeKeys = new Set<string>();
      for (const row of rows) {
        if (row.characterId !== charId) continue;
        const key = idKey(row.abilityTemplateId);
        activeKeys.add(key);
        if (!cooldownReceivedAt.value.has(key)) {
          cooldownReceivedAt.value.set(key, Date.now() * 1000);
        }
      }
      for (const key of cooldownReceivedAt.value.keys()) {
        if (!activeKeys.has(key)) {
          cooldownReceivedAt.value.delete(key);
        }
      }
    },
    { deep: true }
  );

  const hotbarDisplay = computed<HotbarDisplaySlot[]>(() => {
    const slots = new Map(hotbarAssignments.value.map((slot) => [slot.slot, slot]));
    return Array.from({ length: 10 }, (_, index) => {
      const slotIndex = index + 1;
      const assignment =
        slots.get(slotIndex) ?? {
          slot: slotIndex,
          abilityTemplateId: 0n,
          name: 'Empty',
        };
      const aid = assignment.abilityTemplateId;
      const aidStr = idKey(aid);
      const ability = aid ? abilityLookup.value.get(aidStr) : undefined;
      const localReadyAt = aid ? localCooldowns.value.get(aidStr) ?? 0 : 0;
      const serverCd = aid ? cooldownByAbility.value.get(aidStr) : undefined;
      const localRemaining = localReadyAt ? localReadyAt - nowMicros.value : 0;
      const serverRemaining = serverCd
        ? Math.max(0, serverCd.durationMicros - (nowMicros.value - serverCd.receivedAt))
        : 0;

      const isLocallyCastingThisAbility = Boolean(
        localCast.value &&
          aid &&
          localCast.value.abilityTemplateId === aid &&
          nowMicros.value < localCast.value.startMicros + localCast.value.durationMicros
      );
      const effectiveLocalRemaining = isLocallyCastingThisAbility ? 0 : localRemaining;
      const remainingMicros =
        effectiveLocalRemaining > 0 ? effectiveLocalRemaining : serverRemaining;
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
        ability?.description?.trim() || (aid ? `${assignment.name} ability.` : '');

      return {
        ...assignment,
        description: resolvedDescription,
        resourceType: ability?.resourceType ?? '',
        kind: ability?.kind ?? '',
        levelRequired: ability?.levelRequired ?? 0n,
        cooldownSeconds: ability?.cooldownSeconds ?? 0n,
        cooldownRemaining,
      };
    });
  });

  const createHotbar = (name: string) => {
    if (!connActive.value || !selectedCharacter.value) return;
    createHotbarReducer({ characterId: selectedCharacter.value.id, name });
  };

  const switchHotbar = (hotbarName: string) => {
    if (!connActive.value || !selectedCharacter.value) return;
    switchHotbarReducer({ characterId: selectedCharacter.value.id, hotbarName });
  };

  const prevHotbar = () => {
    const list = hotbarList.value;
    const active = activeHotbar.value;
    if (!active || list.length <= 1) return;
    const idx = list.findIndex((h) => h.id === active.id);
    const prevIdx = idx <= 0 ? list.length - 1 : idx - 1;
    switchHotbar(list[prevIdx].name);
  };

  const nextHotbar = () => {
    const list = hotbarList.value;
    const active = activeHotbar.value;
    if (!active || list.length <= 1) return;
    const idx = list.findIndex((h) => h.id === active.id);
    const nextIdx = idx < 0 || idx >= list.length - 1 ? 0 : idx + 1;
    switchHotbar(list[nextIdx].name);
  };

  const setHotbarSlot = (slot: number, abilityTemplateId: bigint) => {
    if (!connActive.value || !selectedCharacter.value) return;
    setHotbarReducer({
      characterId: selectedCharacter.value.id,
      slot,
      abilityTemplateId,
    });
  };

  const useAbility = (abilityTemplateId: bigint, targetCharacterId?: bigint) => {
    if (!connActive.value || !selectedCharacter.value || !abilityTemplateId) return;
    useAbilityReducer({
      characterId: selectedCharacter.value.id,
      abilityTemplateId,
      targetCharacterId,
    });
  };

  const castingState = computed(() => {
    if (!selectedCharacter.value) return null;
    const row =
      characterCasts.value.find(
        (entry) => entry.characterId === selectedCharacter.value?.id
      ) ?? null;
    if (!row) return null;
    return {
      ...row,
      castingAbilityTemplateId: row.abilityTemplateId,
    };
  });

  const activeCastId = computed(() => localCast.value?.abilityTemplateId ?? castingState.value?.abilityTemplateId ?? 0n);
  const activeCastEndsAt = computed(() =>
    castingState.value?.endsAtMicros ? Number(castingState.value.endsAtMicros) : 0
  );
  const isCasting = computed(() => Boolean(activeCastId.value));

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
    const ability = activeCastId.value ? abilityLookup.value.get(idKey(activeCastId.value)) : undefined;
    const duration = toMicros(ability?.castSeconds);
    if (!duration) return 1;
    const remaining = activeCastEndsAt.value - nowMicros.value;
    const clamped = Math.max(0, Math.min(duration, duration - remaining));
    return clamped / duration;
  });

  const hotbarTooltipItem = (slot: HotbarDisplaySlot) => {
    if (!slot?.abilityTemplateId) return null;
    const liveAbility = abilityLookup.value.get(idKey(slot.abilityTemplateId));
    const resource = liveAbility?.resourceType ?? slot.resourceType ?? '';
    const castSeconds = liveAbility?.castSeconds ?? 0n;
    const cooldownSeconds = liveAbility?.cooldownSeconds ?? slot.cooldownSeconds ?? 0n;
    const resourceCost = liveAbility?.resourceCost ?? 0n;
    let costLabel: string;
    if (resource === 'mana') {
      costLabel = `${resourceCost} mana`;
    } else if (resource === 'stamina') {
      costLabel = `${resourceCost} stamina`;
    } else {
      costLabel = 'Free';
    }
    const effectiveCast = resource === 'mana' && castSeconds < 1n ? 1n : castSeconds;
    const castLabel = effectiveCast > 0n ? `${Number(effectiveCast)}s` : 'Instant';
    const cooldownLabel = cooldownSeconds > 0n ? `${Number(cooldownSeconds)}s` : 'No cooldown';
    const damageType = liveAbility?.damageType;
    const stats = [
      { label: 'Level', value: slot.levelRequired || '-' },
      { label: 'Type', value: slot.kind || '-' },
      { label: 'Cost', value: costLabel },
      { label: 'Cast', value: castLabel },
      { label: 'Cooldown', value: cooldownLabel },
    ];
    if (damageType && damageType !== 'none') {
      stats.splice(2, 0, { label: 'Damage', value: damageType });
    }
    return {
      name: slot.name || 'Ability',
      stats,
    };
  };

  const runPrediction = (abilityTemplateId: bigint) => {
    const aidStr = idKey(abilityTemplateId);
    const ability = abilityLookup.value.get(aidStr);
    const castDurationMicros = toMicros(ability?.castSeconds);
    if (castDurationMicros > 0) {
      localCast.value = {
        abilityTemplateId,
        startMicros: nowMicros.value,
        durationMicros: castDurationMicros,
      };
    }
    const cooldownMicros = toMicros(ability?.cooldownSeconds);
    if (cooldownMicros > 0) {
      const readyAt = nowMicros.value + castDurationMicros + cooldownMicros;
      localCooldowns.value.set(aidStr, readyAt);
    }
    hotbarPulseKey.value = aidStr;
    window.setTimeout(() => {
      if (hotbarPulseKey.value === aidStr) hotbarPulseKey.value = null;
    }, 800);
  };

  const onHotbarClick = (slot: HotbarDisplaySlot) => {
    if (!selectedCharacter.value || !slot?.abilityTemplateId) return;
    if (isCasting.value) return;

    const aidStr = idKey(slot.abilityTemplateId);
    const ability = abilityLookup.value.get(aidStr);

    if (activeCombat.value && !canActInCombat.value && slot.kind !== 'utility') {
      addLocalEvent?.('blocked', `Cannot act yet — waiting for combat turn.`);
      return;
    }

    // Kind-based combat state checks (replaces old combatState field)
    // 'utility' kind abilities are out-of-combat only (tracked by server)
    if (ability?.kind === 'utility' && activeCombat.value) {
      addLocalEvent?.('blocked', `${ability?.name ?? slot.name} cannot be used during combat.`);
      return;
    }

    // Special handling for resurrection kind - requires corpse target
    if (ability?.kind === 'resurrect') {
      if (!selectedCorpseTarget?.value) {
        addLocalEvent?.('blocked', 'You must target a corpse first.');
        return;
      }
      onResurrectRequested?.(selectedCorpseTarget.value);
      return;
    }

    // Special handling for corpse_summon kind - requires character target
    if (ability?.kind === 'corpse_summon') {
      if (!selectedCharacterTarget?.value) {
        addLocalEvent?.('blocked', 'You must target a character first.');
        return;
      }
      onCorpseSummonRequested?.(selectedCharacterTarget.value);
      return;
    }

    // Track ability: open track panel
    if (ability?.kind === 'track') {
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

    // Client-side resource pre-check (server remains authoritative)
    const resource = ability?.resourceType ?? '';
    const resourceCostCheck = ability?.resourceCost ?? 0n;
    const char = selectedCharacter.value;
    if (resource === 'mana') {
      if ((char.mana ?? 0n) < resourceCostCheck) {
        addLocalEvent?.('blocked', 'Not enough mana.');
        return;
      }
    } else if (resource === 'stamina') {
      if ((char.stamina ?? 0n) < resourceCostCheck) {
        addLocalEvent?.('blocked', 'Not enough stamina.');
        return;
      }
    }

    runPrediction(slot.abilityTemplateId);

    const targetId = defensiveTargetId.value ?? undefined;
    useAbility(slot.abilityTemplateId, targetId);
  };

  watch(
    () => selectedCharacter.value?.id,
    () => {
      localCast.value = null;
      localCooldowns.value.clear();
      cooldownReceivedAt.value.clear();
      hotbarPulseKey.value = null;
    }
  );

  watch(
    () => activeCombat.value,
    (newVal, oldVal) => {
      if (!newVal && oldVal) {
        localCast.value = null;
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
      if (localCast.value && !castingState.value) {
        const elapsed = now - localCast.value.startMicros;
        const buffer = 2_000_000;
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
    }
  );

  // Clear optimistic cooldowns if server doesn't confirm them (ability failed)
  let lastClearCheck = 0;
  watch(
    () => [abilityCooldowns.value, nowMicros.value, selectedCharacter.value?.id] as const,
    ([serverCooldowns, now, charId]) => {
      if (charId == null || localCooldowns.value.size === 0) return;
      if (now - lastClearCheck < 500_000) return;
      lastClearCheck = now;

      const serverCooldownIds = new Set(
        serverCooldowns
          .filter(cd => cd.characterId === charId)
          .map(cd => idKey(cd.abilityTemplateId))
      );

      for (const [key, readyAt] of localCooldowns.value.entries()) {
        if (readyAt > now && !serverCooldownIds.has(key)) {
          if (localCast.value && idKey(localCast.value.abilityTemplateId) === key) continue;
          if (castingState.value && idKey(castingState.value.abilityTemplateId) === key) continue;
          localCooldowns.value.delete(key);
        }
      }
    }
  );

  return {
    hotbarList,
    activeHotbar,
    hotbarAssignments,
    availableAbilities,
    abilityLookup,
    hotbarDisplay,
    hotbarTooltipItem,
    setHotbarSlot,
    createHotbar,
    switchHotbar,
    prevHotbar,
    nextHotbar,
    useAbility,
    onHotbarClick,
    hotbarPulseKey,
    castingState,
    activeCastId,
    isCasting,
    castProgress,
  };
};
