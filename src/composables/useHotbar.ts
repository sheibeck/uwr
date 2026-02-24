import { computed, ref, watch, type Ref } from 'vue';
import { reducers } from '../module_bindings';
import type {
  AbilityCooldownRow,
  AbilityTemplateRow,
  CharacterCastRow,
  CharacterRow,
  HotbarSlotRow,
  ItemTemplateRow,
} from '../stdb-types';
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
  itemCount?: number;
  itemTemplateId?: bigint | null;
};

type InventoryItemRef = {
  id: bigint;
  name: string;
  slot: string;
  quantity: bigint;
  stackable: boolean;
  usable: boolean;
  eatable: boolean;
  templateId: bigint;
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
  inventoryItems?: Ref<InventoryItemRef[]>;
  itemTemplates?: Ref<ItemTemplateRow[]>;
  eatFoodFn?: (itemInstanceId: bigint) => void;
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
  selectedCorpseTarget,
  selectedCharacterTarget,
  groupId,
  pullerId,
  onTrackRequested,
  onResurrectRequested,
  onCorpseSummonRequested,
  addLocalEvent,
  inventoryItems,
  itemTemplates,
  eatFoodFn,
}: UseHotbarArgs) => {
  const setHotbarReducer = useReducer(reducers.setHotbarSlot);
  const useAbilityReducer = useReducer(reducers.useAbility);

  const localCast = ref<{ abilityKey: string; startMicros: number; durationMicros: number } | null>(
    null
  );
  const localCooldowns = ref(new Map<string, number>());
  const cooldownReceivedAt = ref(new Map<string, number>());
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
      const target = slots[row.slot - 1];
      if (!target) continue;
      target.abilityKey = row.abilityKey;
      if (row.abilityKey.startsWith('item:')) {
        const templateId = BigInt(row.abilityKey.split(':')[1]);
        const match = inventoryItems?.value.find(i => i.templateId === templateId);
        const template = itemTemplates?.value.find(t => t.id === templateId);
        target.name = match?.name ?? template?.name ?? row.abilityKey;
      } else {
        const ability = availableAbilities.value.find((item) => item.key === row.abilityKey);
        target.name = ability?.name ?? row.abilityKey;
      }
    }
    return slots;
  });

  const cooldownByAbility = computed(() => {
    if (!selectedCharacter.value) return new Map<string, { durationMicros: number; receivedAt: number }>();
    const map = new Map<string, { durationMicros: number; receivedAt: number }>();
    for (const row of abilityCooldowns.value) {
      if (row.characterId.toString() !== selectedCharacter.value.id.toString()) continue;
      const key = row.abilityKey;
      const receivedAt = cooldownReceivedAt.value.get(key) ?? Date.now() * 1000;
      map.set(key, { durationMicros: Number(row.durationMicros), receivedAt });
    }
    return map;
  });

  watch(
    () => abilityCooldowns.value,
    (rows) => {
      const charId = selectedCharacter.value?.id;
      if (!charId) return;
      const activeKeys = new Set<string>();
      for (const row of rows) {
        if (row.characterId.toString() !== charId.toString()) continue;
        const key = row.abilityKey;
        activeKeys.add(key);
        // Only record receivedAt the first time this key is seen (for reconnect case)
        // Do NOT delete localCooldowns here — local runs its full countdown as the primary display
        if (!cooldownReceivedAt.value.has(key)) {
          cooldownReceivedAt.value.set(key, Date.now() * 1000);
        }
      }
      // Clean up receivedAt entries for rows that no longer exist
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
          abilityKey: '',
          name: 'Empty',
        };
      const ability = assignment.abilityKey
        ? abilityLookup.value.get(assignment.abilityKey)
        : undefined;
      const localReadyAt = assignment.abilityKey
        ? localCooldowns.value.get(assignment.abilityKey) ?? 0
        : 0;
      const serverCd = assignment.abilityKey
        ? cooldownByAbility.value.get(assignment.abilityKey)
        : undefined;
      const localRemaining = localReadyAt ? localReadyAt - nowMicros.value : 0;
      const serverRemaining = serverCd
        ? Math.max(0, serverCd.durationMicros - (nowMicros.value - serverCd.receivedAt))
        : 0;

      const isLocallyCastingThisAbility = Boolean(
        localCast.value &&
          assignment.abilityKey &&
          localCast.value.abilityKey === assignment.abilityKey &&
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
        ability?.description?.trim() || (assignment.abilityKey ? `${assignment.name} ability.` : '');

      // Item slot handling
      const isItemSlot = assignment.abilityKey.startsWith('item:');
      let itemCount: number | undefined;
      let itemTemplateId: bigint | null | undefined;
      if (isItemSlot) {
        const templateId = BigInt(assignment.abilityKey.split(':')[1]);
        itemTemplateId = templateId;
        const matches = inventoryItems?.value.filter(i => i.templateId === templateId) ?? [];
        itemCount = matches.reduce((sum, i) => sum + Number(i.quantity), 0);
      }

      return {
        ...assignment,
        description: resolvedDescription,
        resource: ability?.resource ?? '',
        kind: isItemSlot ? 'item' : (ability?.kind ?? ''),
        level: ability?.level ?? 0n,
        cooldownSeconds: isItemSlot ? 0n : (ability?.cooldownSeconds ?? 0n),
        cooldownRemaining: isItemSlot ? 0 : cooldownRemaining,
        itemCount,
        itemTemplateId,
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
    // Item slots don't have ability tooltip data
    if (slot.abilityKey.startsWith('item:')) return null;
    const liveAbility = abilityLookup.value.get(slot.abilityKey);
    const resource = liveAbility?.resource ?? slot.resource ?? '';
    const power = liveAbility?.power ?? 0n;
    const level = liveAbility?.level ?? slot.level ?? 0n;
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
    const castLabel = castSeconds > 0n ? `${Number(castSeconds)}s` : 'Instant';
    const cooldownLabel = cooldownSeconds > 0n ? `${Number(cooldownSeconds)}s` : 'No cooldown';
    const damageType = liveAbility?.damageType;
    const stats = [
      { label: 'Level', value: slot.level || '-' },
      { label: 'Type', value: slot.kind || '-' },
      { label: 'Cost', value: costLabel },
      { label: 'Cast', value: castLabel },
      { label: 'Cooldown', value: cooldownLabel },
    ];
    if (damageType && damageType !== 'none') {
      stats.splice(2, 0, { label: 'Damage', value: damageType });
    }
    return {
      name: slot.name || slot.abilityKey,
      stats,
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
    }
    hotbarPulseKey.value = abilityKey;
    window.setTimeout(() => {
      if (hotbarPulseKey.value === abilityKey) hotbarPulseKey.value = null;
    }, 800);
  };

  const onHotbarClick = (slot: HotbarDisplaySlot) => {
    if (!selectedCharacter.value || !slot?.abilityKey) return;
    if (isCasting.value) return;

    // Item slot handler
    if (slot.abilityKey.startsWith('item:') && slot.itemTemplateId != null) {
      const templateId = slot.itemTemplateId;
      const charId = selectedCharacter.value?.id;
      if (!charId) return;
      const match = inventoryItems?.value.find(i => i.templateId === templateId && i.quantity > 0n);
      if (!match) {
        addLocalEvent?.('blocked', 'No more of that item.');
        return;
      }
      hotbarPulseKey.value = slot.abilityKey;
      window.setTimeout(() => {
        if (hotbarPulseKey.value === slot.abilityKey) hotbarPulseKey.value = null;
      }, 800);
      if (match.eatable) {
        eatFoodFn?.(match.id);
      } else {
        const conn = window.__db_conn;
        if (!conn) return;
        conn.reducers.useItem({ characterId: charId, itemInstanceId: match.id });
      }
      return;
    }

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

    // Client-side resource pre-check (server remains authoritative)
    const resource = ability?.resource ?? '';
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

    runPrediction(slot.abilityKey);

    const targetId = defensiveTargetId.value ?? undefined;
    useAbility(slot.abilityKey, targetId);
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
        // Combat just ended — clear active cast, but preserve cooldown predictions.
        // Clearing predictions here causes a window where kill-shot abilities appear
        // off cooldown before the server cooldown row arrives in the subscription.
        // The nowMicros watcher naturally expires predictions, and the 500ms
        // server-confirmation check cleans up predictions for abilities that failed.
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

      // Just check existence — if the server has a row, the ability fired (even if the row looks expired
      // by our stale receivedAt). Server-side cleanup deletes expired rows on its own schedule.
      const serverCooldownKeys = new Set(
        serverCooldowns
          .filter(cd => cd.characterId.toString() === charId.toString())
          .map(cd => cd.abilityKey)
      );

      // Clear local cooldowns that don't exist on server (ability failed)
      for (const [key, readyAt] of localCooldowns.value.entries()) {
        if (readyAt > now && !serverCooldownKeys.has(key)) {
          // Don't clear while this ability is still being cast — server won't have
          // the AbilityCooldown row until the cast tick fires (after castSeconds).
          if (localCast.value?.abilityKey === key) continue;
          if (castingState.value?.abilityKey === key) continue;
          // Local shows cooldown active, but server doesn't - ability failed
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
