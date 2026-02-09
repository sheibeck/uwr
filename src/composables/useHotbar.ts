import { computed, type Ref } from 'vue';
import { reducers, type CharacterRow, type HotbarSlotRow } from '../module_bindings';
import { useReducer } from 'spacetimedb/vue';
import { abilities, abilitiesByClass } from '../data/abilities';

type UseHotbarArgs = {
  connActive: Ref<boolean>;
  selectedCharacter: Ref<CharacterRow | null>;
  hotbarSlots: Ref<HotbarSlotRow[]>;
};

export const useHotbar = ({ connActive, selectedCharacter, hotbarSlots }: UseHotbarArgs) => {
  const setHotbarReducer = useReducer(reducers.setHotbarSlot);
  const useAbilityReducer = useReducer(reducers.useAbility);

  const availableAbilities = computed(() => {
    if (!selectedCharacter.value) return [];
    return abilitiesByClass(
      selectedCharacter.value.className,
      Number(selectedCharacter.value.level)
    );
  });

  const abilityLookup = computed(() => {
    const map = new Map<string, (typeof abilities)[number]>();
    for (const ability of abilities) {
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

  const useAbility = (abilityKey: string) => {
    if (!connActive.value || !selectedCharacter.value || !abilityKey) return;
    useAbilityReducer({
      characterId: selectedCharacter.value.id,
      abilityKey,
    });
  };

  return { hotbarAssignments, availableAbilities, abilityLookup, setHotbarSlot, useAbility };
};
