import { computed, type Ref } from 'vue';
import {
  reducers,
  type AbilityTemplateRow,
  type CharacterRow,
  type HotbarSlotRow,
} from '../module_bindings';
import { useReducer } from 'spacetimedb/vue';

type UseHotbarArgs = {
  connActive: Ref<boolean>;
  selectedCharacter: Ref<CharacterRow | null>;
  hotbarSlots: Ref<HotbarSlotRow[]>;
  abilityTemplates: Ref<AbilityTemplateRow[]>;
};

export const useHotbar = ({
  connActive,
  selectedCharacter,
  hotbarSlots,
  abilityTemplates,
}: UseHotbarArgs) => {
  const setHotbarReducer = useReducer(reducers.setHotbarSlot);
  const useAbilityReducer = useReducer(reducers.useAbility);

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

  return { hotbarAssignments, availableAbilities, abilityLookup, setHotbarSlot, useAbility };
};
