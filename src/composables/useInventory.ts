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
  instanceId: bigint;
  name: string;
  slot: string;
  armorType: string;
  rarity: string;
  requiredLevel: bigint;
  allowedClasses: string;
  stats: { label: string; value: string }[];
  description: string;
};

type EquippedSlot = {
  slot: string;
  name: string;
  armorType: string;
  rarity: string;
  itemInstanceId: bigint | null;
  stats: { label: string; value: string }[];
  description: string;
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
        const description =
          [template?.rarity, template?.armorType, template?.slot]
            .filter((value) => value && value.length > 0)
            .join(' • ') ?? '';
        const stats = [
          template?.armorClassBonus ? { label: 'Armor Class', value: `+${template.armorClassBonus}` } : null,
          template?.weaponBaseDamage ? { label: 'Weapon Damage', value: `${template.weaponBaseDamage}` } : null,
          template?.weaponDps ? { label: 'Weapon DPS', value: `${template.weaponDps}` } : null,
          template?.strBonus ? { label: 'STR', value: `+${template.strBonus}` } : null,
          template?.dexBonus ? { label: 'DEX', value: `+${template.dexBonus}` } : null,
          template?.chaBonus ? { label: 'CHA', value: `+${template.chaBonus}` } : null,
          template?.wisBonus ? { label: 'WIS', value: `+${template.wisBonus}` } : null,
          template?.intBonus ? { label: 'INT', value: `+${template.intBonus}` } : null,
          template?.hpBonus ? { label: 'HP', value: `+${template.hpBonus}` } : null,
          template?.manaBonus ? { label: 'Mana', value: `+${template.manaBonus}` } : null,
        ].filter(Boolean) as { label: string; value: string }[];
        return {
          id: instance.id,
          instanceId: instance.id,
          name: template?.name ?? 'Unknown',
          slot: template?.slot ?? 'unknown',
          armorType: template?.armorType ?? 'none',
          rarity: template?.rarity ?? 'Common',
          requiredLevel: template?.requiredLevel ?? 1n,
          allowedClasses: template?.allowedClasses ?? 'any',
          stats,
          description,
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
      const description =
        [template?.rarity, template?.armorType, template?.slot]
          .filter((value) => value && value.length > 0)
          .join(' • ') ?? '';
      const stats = [
        template?.armorClassBonus ? { label: 'Armor Class', value: `+${template.armorClassBonus}` } : null,
        template?.weaponBaseDamage ? { label: 'Weapon Damage', value: `${template.weaponBaseDamage}` } : null,
        template?.weaponDps ? { label: 'Weapon DPS', value: `${template.weaponDps}` } : null,
        template?.strBonus ? { label: 'STR', value: `+${template.strBonus}` } : null,
        template?.dexBonus ? { label: 'DEX', value: `+${template.dexBonus}` } : null,
        template?.chaBonus ? { label: 'CHA', value: `+${template.chaBonus}` } : null,
        template?.wisBonus ? { label: 'WIS', value: `+${template.wisBonus}` } : null,
        template?.intBonus ? { label: 'INT', value: `+${template.intBonus}` } : null,
        template?.hpBonus ? { label: 'HP', value: `+${template.hpBonus}` } : null,
        template?.manaBonus ? { label: 'Mana', value: `+${template.manaBonus}` } : null,
      ].filter(Boolean) as { label: string; value: string }[];
      return {
        slot,
        name: template?.name ?? 'Empty',
        armorType: template?.armorType ?? 'none',
        rarity: template?.rarity ?? 'Common',
        itemInstanceId: instance?.id ?? null,
        stats,
        description,
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
