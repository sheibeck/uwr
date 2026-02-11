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
  onTrackRequested?: () => void;
};

const toMicros = (seconds: bigint | undefined) => {
  if (!seconds || seconds <= 0n) return 0;
  return Math.round(Number(seconds) * 1_000_000);
};

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
  onTrackRequested,
}: UseHotbarArgs) => {
  const setHotbarReducer = useReducer(reducers.setHotbarSlot);
  const useAbilityReducer = useReducer(reducers.useAbility);

  const localCast = ref<{ abilityKey: string; startMicros: number; durationMicros: number } | null>(
    null
  );
  const localCooldowns = ref(new Map<string, number>());
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
      const localReadyAt = assignment.abilityKey
        ? localCooldowns.value.get(assignment.abilityKey) ?? 0
        : 0;
      const serverRemaining = readyAt ? Number(readyAt) - nowMicros.value : 0;
      const localRemaining = localReadyAt ? localReadyAt - nowMicros.value : 0;
      const remainingMicros = Math.max(serverRemaining, localRemaining, 0);
      const cooldownRemaining = remainingMicros > 0 ? Math.ceil(remainingMicros / 1_000_000) : 0;
      return {
        ...assignment,
        description: ability?.description ?? (assignment.abilityKey ? 'Ability not defined yet.' : ''),
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
    return {
      name: slot.name || slot.abilityKey,
      description: slot.description,
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
      localCooldowns.value.set(abilityKey, nowMicros.value + castDurationMicros + cooldownMicros);
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
      onTrackRequested?.();
      return;
    }
    if (activeCombat.value && !canActInCombat.value && slot.kind !== 'utility') return;
    runPrediction(slot.abilityKey);

    const targetId =
      slot.kind === 'utility' ? defensiveTargetId.value ?? selectedCharacter.value.id : undefined;
    useAbility(slot.abilityKey, targetId);
  };

  watch(
    () => selectedCharacter.value?.id,
    () => {
      localCast.value = null;
      localCooldowns.value.clear();
      hotbarPulseKey.value = null;
    }
  );

  watch(
    () => nowMicros.value,
    (now) => {
      if (localCast.value && now - localCast.value.startMicros >= localCast.value.durationMicros) {
        localCast.value = null;
      }
      if (localCooldowns.value.size === 0) return;
      for (const [key, readyAt] of localCooldowns.value.entries()) {
        if (now >= readyAt) {
          localCooldowns.value.delete(key);
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
