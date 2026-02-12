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

// Client-side copy of CLASS_ARMOR from spacetimedb/src/data/class_stats.ts
// Defines which armor types each class can wear
const CLASS_ARMOR: Record<string, string[]> = {
  bard: ['cloth'],
  enchanter: ['cloth'],
  cleric: ['cloth'],
  wizard: ['cloth'],
  druid: ['cloth'],
  necromancer: ['cloth'],
  summoner: ['cloth'],
  rogue: ['leather', 'cloth'],
  monk: ['leather', 'cloth'],
  spellblade: ['leather', 'cloth'],
  reaver: ['leather', 'cloth'],
  beastmaster: ['leather', 'cloth'],
  ranger: ['chain', 'leather', 'cloth'],
  shaman: ['chain', 'leather', 'cloth'],
  warrior: ['plate', 'chain', 'leather', 'cloth'],
  paladin: ['plate', 'chain', 'leather', 'cloth'],
};

type InventoryItem = {
  id: bigint;
  instanceId: bigint;
  name: string;
  slot: string;
  armorType: string;
  rarity: string;
  tier: bigint;
  isJunk: boolean;
  vendorValue: bigint;
  requiredLevel: bigint;
  allowedClasses: string;
  stats: { label: string; value: string }[];
  description: string;
  equipable: boolean;
  usable: boolean;
  eatable: boolean;
  quantity: bigint;
  stackable: boolean;
};

type EquippedSlot = {
  slot: string;
  name: string;
  armorType: string;
  rarity: string;
  tier: bigint;
  isJunk: boolean;
  vendorValue: bigint;
  itemInstanceId: bigint | null;
  allowedClasses: string;
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
  const useItemReducer = useReducer(reducers.useItem);
  const splitStackReducer = useReducer(reducers.splitStack);
  const consolidateStacksReducer = useReducer(reducers.consolidateStacks);

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
        const tier = template?.tier ?? 1n;
        const isJunk = template?.isJunk ?? false;
        const vendorValue = template?.vendorValue ?? 0n;
        const description =
          [
            template?.rarity,
            template?.armorType,
            template?.slot,
            template?.tier ? `Tier ${template.tier}` : null,
          ]
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
          vendorValue ? { label: 'Value', value: `${vendorValue} gold` } : null,
        ].filter(Boolean) as { label: string; value: string }[];
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
        const armorAllowed =
          !template?.armorType ||
          template.armorType === 'none' ||
          (CLASS_ARMOR[normalizedClass] ?? ['cloth']).includes(template.armorType.toLowerCase());
        const equipable =
          EQUIPMENT_SLOTS.includes(slot as (typeof EQUIPMENT_SLOTS)[number]) &&
          !isJunk &&
          (!selectedCharacter.value || selectedCharacter.value.level >= (template?.requiredLevel ?? 1n)) &&
          classAllowed &&
          armorAllowed;
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
          id: instance.id,
          instanceId: instance.id,
          name: template?.name ?? 'Unknown',
          slot,
          armorType: template?.armorType ?? 'none',
          rarity: template?.rarity ?? 'Common',
          tier,
          isJunk,
          vendorValue,
          requiredLevel: template?.requiredLevel ?? 1n,
          allowedClasses: template?.allowedClasses ?? 'any',
          stats,
          description,
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
      const tier = template?.tier ?? 1n;
      const isJunk = template?.isJunk ?? false;
      const vendorValue = template?.vendorValue ?? 0n;
      const description =
        [
          template?.rarity,
          template?.armorType,
          template?.slot,
          template?.tier ? `Tier ${template.tier}` : null,
        ]
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
        vendorValue ? { label: 'Value', value: `${vendorValue} gold` } : null,
      ].filter(Boolean) as { label: string; value: string }[];
      return {
        slot,
        name: template?.name ?? 'Empty',
        armorType: template?.armorType ?? 'none',
        rarity: template?.rarity ?? 'Common',
        tier,
        isJunk,
        vendorValue,
        itemInstanceId: instance?.id ?? null,
        allowedClasses: template?.allowedClasses ?? 'any',
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

  const inventoryCount = computed(() => inventoryItems.value.length);

  return {
    equippedSlots,
    inventoryItems,
    inventoryCount,
    maxInventorySlots: 20,
    equipItem,
    unequipItem,
    useItem,
    splitStack,
    organizeInventory,
  };
};
