import { computed, type Ref } from 'vue';
import { reducers } from '../module_bindings';
import type { Character, ItemInstance, ItemTemplate, ItemAffix } from '../module_bindings/types';
import { useReducer } from 'spacetimedb/vue';
import { buildItemTooltipData, type ItemTooltipData } from './useItemTooltip';

type UseInventoryArgs = {
  connActive: Ref<boolean>;
  selectedCharacter: Ref<Character | null>;
  itemInstances: Ref<ItemInstance[]>;
  itemTemplates: Ref<ItemTemplate[]>;
  itemAffixes: Ref<ItemAffix[]>;
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

type InventoryItem = ItemTooltipData & {
  id: bigint;
  instanceId: bigint;
  templateId: bigint;
  isJunk: boolean;
  vendorValue: bigint;
  requiredLevel: bigint;
  equipable: boolean;
  usable: boolean;
  eatable: boolean;
  quantity: bigint;
  stackable: boolean;
};

type EquippedSlot = ItemTooltipData & {
  slot: string;
  isJunk: boolean;
  vendorValue: bigint;
  itemInstanceId: bigint | null;
};

export const useInventory = ({
  connActive,
  selectedCharacter,
  itemInstances,
  itemTemplates,
  itemAffixes,
}: UseInventoryArgs) => {
  const equipReducer = useReducer(reducers.equipItem);
  const unequipReducer = useReducer(reducers.unequipItem);
  const useItemReducer = useReducer(reducers.useItem);
  const splitStackReducer = useReducer(reducers.splitStack);
  const consolidateStacksReducer = useReducer(reducers.consolidateStacks);
  const salvageItemReducer = useReducer(reducers.salvageItem);

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
        const isJunk = template?.isJunk ?? false;
        const vendorValue = template?.vendorValue ?? 0n;
        const instanceAffixes = itemAffixes.value.filter(
          (a) => a.itemInstanceId.toString() === instance.id.toString()
        );

        const tooltipData = buildItemTooltipData({
          template,
          instance: {
            id: instance.id,
            qualityTier: instance.qualityTier,
            craftQuality: instance.craftQuality,
            displayName: instance.displayName,
            isNamed: instance.isNamed,
            quantity: instance.quantity,
          },
          affixes: instanceAffixes,
          priceOrValue: vendorValue ? { label: 'Value', value: `${vendorValue} gold` } : undefined,
        });

        const slot = template?.slot ?? 'unknown';
        const stackable = template?.stackable ?? false;
        const quantity = instance.quantity ?? 1n;
        const normalizedClass = selectedCharacter.value?.className?.toLowerCase() ?? '';
        const allowedClasses = (template?.allowedClasses ?? '')
          .split(',')
          .map((entry) => entry.trim().toLowerCase())
          .filter(Boolean);
        const classAllowed =
          allowedClasses.length === 0 ||
          allowedClasses.includes('any') ||
          allowedClasses.includes(normalizedClass);
        const equipable =
          EQUIPMENT_SLOTS.includes(slot as (typeof EQUIPMENT_SLOTS)[number]) &&
          !isJunk &&
          (!selectedCharacter.value || selectedCharacter.value.level >= (template?.requiredLevel ?? 1n)) &&
          classAllowed;
        const itemKey = (template?.name ?? '').toLowerCase().replace(/\s+/g, '_');
        const usableKeys = new Set([
          'bandage',
          'basic_poultice',
          'travelers_tea',
          'simple_rations',
          'torch',
          'whetstone',
          'kindling_bundle',
          'rough_rope',
          'charcoal',
          'crude_poison',
        ]);
        const usable =
          (template?.slot ?? '').toLowerCase() === 'consumable' && usableKeys.has(itemKey);
        const eatable = (template?.slot ?? '').toLowerCase() === 'food';

        return {
          ...tooltipData,
          id: instance.id,
          instanceId: instance.id,
          templateId: instance.templateId,
          isJunk,
          vendorValue,
          requiredLevel: template?.requiredLevel ?? 1n,
          equipable,
          usable,
          eatable,
          quantity,
          stackable,
        };
      })
      .sort((a, b) => {
        const rarityOrder: Record<string, number> = {
          legendary: 0,
          epic: 1,
          rare: 2,
          uncommon: 3,
          common: 4,
        };
        const ra = rarityOrder[(a.rarity ?? 'common').toLowerCase()] ?? 5;
        const rb = rarityOrder[(b.rarity ?? 'common').toLowerCase()] ?? 5;
        if (ra !== rb) return ra - rb;
        return a.name.localeCompare(b.name);
      })
  );

  const equippedSlots = computed<EquippedSlot[]>(() =>
    EQUIPMENT_SLOTS.map((slot) => {
      const instance = ownedInstances.value.find((row) => row.equippedSlot === slot);
      const template = instance
        ? itemTemplates.value.find((row) => row.id.toString() === instance.templateId.toString())
        : null;
      const isJunk = template?.isJunk ?? false;
      const vendorValue = template?.vendorValue ?? 0n;
      const equippedAffixes = instance
        ? itemAffixes.value.filter((a) => a.itemInstanceId.toString() === instance.id.toString())
        : [];

      const tooltipData = buildItemTooltipData({
        template,
        instance: instance
          ? {
              id: instance.id,
              qualityTier: instance.qualityTier,
              craftQuality: instance.craftQuality,
              displayName: instance.displayName,
              isNamed: instance.isNamed,
            }
          : undefined,
        affixes: equippedAffixes,
        priceOrValue: vendorValue ? { label: 'Value', value: `${vendorValue} gold` } : undefined,
      });

      // For empty slots, override name to 'Empty'
      const name = template ? tooltipData.name : 'Empty';

      return {
        ...tooltipData,
        name,
        slot,
        isJunk,
        vendorValue,
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

  const useItem = (itemInstanceId: bigint) => {
    if (!connActive.value || !selectedCharacter.value) return;
    useItemReducer({ characterId: selectedCharacter.value.id, itemInstanceId });
  };

  const splitStack = (itemInstanceId: bigint, quantity: bigint) => {
    if (!connActive.value || !selectedCharacter.value) return;
    splitStackReducer({ characterId: selectedCharacter.value.id, itemInstanceId, quantity });
  };

  const organizeInventory = () => {
    if (!connActive.value || !selectedCharacter.value) return;
    consolidateStacksReducer({ characterId: selectedCharacter.value.id });
  };

  const salvageItem = (itemInstanceId: bigint) => {
    if (!connActive.value || !selectedCharacter.value) return;
    salvageItemReducer({ characterId: selectedCharacter.value.id, itemInstanceId });
  };

  const inventoryCount = computed(() => inventoryItems.value.length);

  return {
    equippedSlots,
    inventoryItems,
    inventoryCount,
    maxInventorySlots: 50,
    equipItem,
    unequipItem,
    useItem,
    splitStack,
    organizeInventory,
    salvageItem,
  };
};
