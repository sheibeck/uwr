import { computed, type Ref } from 'vue';
import { reducers, type CharacterRow, type ItemInstanceRow, type ItemTemplateRow, type ItemAffixRow } from '../module_bindings';
import { useReducer } from 'spacetimedb/vue';

const formatAffixStatKeyInv = (key: string): string => {
  const map: Record<string, string> = {
    strBonus: 'STR',
    dexBonus: 'DEX',
    intBonus: 'INT',
    wisBonus: 'WIS',
    chaBonus: 'CHA',
    hpBonus: 'Max HP',
    armorClassBonus: 'Armor',
    magicResistanceBonus: 'Magic Resist',
    lifeOnHit: 'Life on Hit',
    cooldownReduction: 'Cooldown Reduction %',
    manaRegen: 'Mana Regen',
    weaponBaseDamage: 'Damage',
  };
  return map[key] ?? key;
};

type UseInventoryArgs = {
  connActive: Ref<boolean>;
  selectedCharacter: Ref<CharacterRow | null>;
  itemInstances: Ref<ItemInstanceRow[]>;
  itemTemplates: Ref<ItemTemplateRow[]>;
  itemAffixes: Ref<ItemAffixRow[]>;
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
  qualityTier: string;
  tier: bigint;
  isJunk: boolean;
  vendorValue: bigint;
  requiredLevel: bigint;
  allowedClasses: string;
  stats: { label: string; value: string }[];
  affixStats: { label: string; value: string; affixName: string }[];
  description: string;
  equipable: boolean;
  usable: boolean;
  eatable: boolean;
  quantity: bigint;
  stackable: boolean;
  isNamed: boolean;
};

type EquippedSlot = {
  slot: string;
  name: string;
  armorType: string;
  rarity: string;
  qualityTier: string;
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
        const tier = template?.tier ?? 1n;
        const isJunk = template?.isJunk ?? false;
        const vendorValue = template?.vendorValue ?? 0n;
        const WELL_FED_BUFF_LABELS: Record<string, string> = {
          mana_regen: 'mana regeneration per tick',
          stamina_regen: 'stamina regeneration per tick',
          health_regen: 'health regeneration per tick',
          str: 'STR',
          dex: 'DEX',
          int: 'INT',
          wis: 'WIS',
          cha: 'CHA',
        };
        const foodDescription = (() => {
          if (template?.slot !== 'food' || !template.wellFedBuffType || !template.wellFedDurationMicros) return '';
          const durationMins = Math.round(Number(template.wellFedDurationMicros) / 60_000_000);
          const buffLabel = WELL_FED_BUFF_LABELS[template.wellFedBuffType] ?? template.wellFedBuffType;
          return `Grants Well Fed: +${template.wellFedBuffMagnitude} ${buffLabel} for ${durationMins} minutes. Replaces any active food buff.`;
        })();
        const qualityTier = instance.qualityTier ?? template?.rarity ?? 'common';
        const weaponSlots = ['weapon', 'mainHand', 'offHand'];
        const typeField = weaponSlots.includes(template?.slot ?? '')
          ? (template?.weaponType || null)
          : (template?.armorType && template.armorType !== 'none' ? template.armorType : null);
        const description =
          foodDescription ||
          ([
            qualityTier,
            typeField,
            template?.slot,
            template?.tier ? `Tier ${template.tier}` : null,
          ]
            .filter((value) => value && value.length > 0)
            .join(' • ') ?? '');
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
        // Armor type validation now handled server-side only
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
        // Affix data
        const instanceAffixes = itemAffixes.value.filter(
          (a) => a.itemInstanceId.toString() === instance.id.toString()
        );
        const affixStats = instanceAffixes.map((a) => ({
          label: formatAffixStatKeyInv(a.statKey),
          value: `+${a.magnitude}`,
          affixName: a.affixName,
        }));
        const isNamed = instance.isNamed ?? false;
        const displayName = instance.displayName ?? template?.name ?? 'Unknown';
        return {
          id: instance.id,
          instanceId: instance.id,
          name: displayName,
          slot,
          armorType: template?.armorType ?? 'none',
          rarity: template?.rarity ?? 'common',
          qualityTier,
          tier,
          isJunk,
          vendorValue,
          requiredLevel: template?.requiredLevel ?? 1n,
          allowedClasses: template?.allowedClasses ?? 'any',
          stats,
          affixStats,
          description,
          equipable,
          usable,
          eatable,
          quantity,
          stackable,
          isNamed,
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
      const equippedQualityTier = instance?.qualityTier ?? template?.rarity ?? 'common';
      const equippedWeaponSlots = ['weapon', 'mainHand', 'offHand'];
      const equippedTypeField = equippedWeaponSlots.includes(template?.slot ?? '')
        ? (template?.weaponType || null)
        : (template?.armorType && template.armorType !== 'none' ? template.armorType : null);
      const description =
        [
          equippedQualityTier,
          equippedTypeField,
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
        rarity: template?.rarity ?? 'common',
        qualityTier: instance?.qualityTier ?? template?.rarity ?? 'common',
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

  const salvageItem = (itemInstanceId: bigint) => {
    if (!connActive.value || !selectedCharacter.value) return;
    salvageItemReducer({ characterId: selectedCharacter.value.id, itemInstanceId });
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
    salvageItem,
  };
};
