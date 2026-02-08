import { computed, type Ref } from 'vue';
import { reducers, type CharacterRow, type ItemInstanceRow, type ItemTemplateRow } from '../module_bindings';
import { useReducer } from 'spacetimedb/vue';

type UseInventoryArgs = {
  connActive: Ref<boolean>;
  selectedCharacter: Ref<CharacterRow | null>;
  itemInstances: Ref<ItemInstanceRow[]>;
  itemTemplates: Ref<ItemTemplateRow[]>;
};

const EQUIPMENT_SLOTS = [
  'head',
  'chest',
  'wrists',
  'hands',
  'belt',
  'legs',
  'boots',
  'earrings',
  'neck',
  'cloak',
  'mainHand',
  'offHand',
] as const;

type InventoryItem = {
  id: bigint;
  name: string;
  slot: string;
  rarity: string;
  requiredLevel: bigint;
  allowedClasses: string;
};

type EquippedSlot = {
  slot: string;
  name: string;
  rarity: string;
  itemInstanceId: bigint | null;
};

export const useInventory = ({
  connActive,
  selectedCharacter,
  itemInstances,
  itemTemplates,
}: UseInventoryArgs) => {
  const equipReducer = useReducer(reducers.equipItem);
  const unequipReducer = useReducer(reducers.unequipItem);

  const ownedInstances = computed(() => {
    if (!selectedCharacter.value) return [];
    return itemInstances.value.filter(
      (instance) =>
        instance.ownerCharacterId.toString() === selectedCharacter.value?.id.toString()
    );
  });

  const inventoryItems = computed<InventoryItem[]>(() =>
    ownedInstances.value
      .filter((instance) => !instance.equippedSlot)
      .map((instance) => {
        const template = itemTemplates.value.find(
          (row) => row.id.toString() === instance.templateId.toString()
        );
        return {
          id: instance.id,
          name: template?.name ?? 'Unknown',
          slot: template?.slot ?? 'unknown',
          rarity: template?.rarity ?? 'Common',
          requiredLevel: template?.requiredLevel ?? 1n,
          allowedClasses: template?.allowedClasses ?? 'any',
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  );

  const equippedSlots = computed<EquippedSlot[]>(() =>
    EQUIPMENT_SLOTS.map((slot) => {
      const instance = ownedInstances.value.find((row) => row.equippedSlot === slot);
      const template = instance
        ? itemTemplates.value.find((row) => row.id.toString() === instance.templateId.toString())
        : null;
      return {
        slot,
        name: template?.name ?? 'Empty',
        rarity: template?.rarity ?? 'Common',
        itemInstanceId: instance?.id ?? null,
      };
    })
  );

  const equipItem = (itemInstanceId: bigint) => {
    if (!connActive.value || !selectedCharacter.value) return;
    equipReducer({ characterId: selectedCharacter.value.id, itemInstanceId });
  };

  const unequipItem = (slot: string) => {
    if (!connActive.value || !selectedCharacter.value) return;
    unequipReducer({ characterId: selectedCharacter.value.id, slot });
  };

  const inventoryCount = computed(() => inventoryItems.value.length);

  return {
    equippedSlots,
    inventoryItems,
    inventoryCount,
    maxInventorySlots: 20,
    equipItem,
    unequipItem,
  };
};
