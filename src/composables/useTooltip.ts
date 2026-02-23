import { ref, Ref } from 'vue';
import { rarityColor } from '../ui/colors';

export function useTooltip(opts: { abilityLookup: Ref<Map<string, any>> }) {
  const { abilityLookup } = opts;

  const tooltip = ref<{
    visible: boolean;
    x: number;
    y: number;
    item: any | null;
    anchor: 'cursor' | 'right';
  }>({
    visible: false,
    x: 0,
    y: 0,
    item: null,
    anchor: 'cursor',
  });

  const abilityPopup = ref<{
    visible: boolean;
    x: number;
    y: number;
    name: string;
    description: string;
    stats: { label: string; value: any }[];
  }>({
    visible: false,
    x: 0,
    y: 0,
    name: '',
    description: '',
    stats: [],
  });

  const hotbarContextMenu = ref<{
    visible: boolean;
    x: number;
    y: number;
    slot: number;
    name: string;
    description: string;
    resource: string;
    resourceCost: bigint;
    castSeconds: bigint;
    cooldownSeconds: bigint;
  }>({ visible: false, x: 0, y: 0, slot: 0, name: '', description: '', resource: '', resourceCost: 0n, castSeconds: 0n, cooldownSeconds: 0n });

  const tooltipRarityColor = (item: any): Record<string, string> => {
    const key = ((item?.qualityTier ?? item?.rarity ?? 'common') as string).toLowerCase();
    return { color: rarityColor(key) };
  };

  const showTooltip = (payload: {
    item: any;
    x: number;
    y: number;
    anchor?: 'cursor' | 'right';
  }) => {
    const anchor = payload.anchor ?? 'cursor';
    const offsetX = 12;
    const offsetY = anchor === 'right' ? 0 : 12;
    tooltip.value = {
      visible: true,
      x: payload.x + offsetX,
      y: payload.y + offsetY,
      item: payload.item,
      anchor,
    };
  };

  const moveTooltip = (payload: { x: number; y: number }) => {
    if (!tooltip.value.visible || tooltip.value.anchor === 'right') return;
    tooltip.value = { ...tooltip.value, x: payload.x + 12, y: payload.y + 12 };
  };

  const hideTooltip = () => {
    tooltip.value = { visible: false, x: 0, y: 0, item: null, anchor: 'cursor' };
  };

  const showAbilityPopup = (payload: { name: string; description: string; stats: { label: string; value: any }[]; x: number; y: number }) => {
    abilityPopup.value = { visible: true, ...payload };
  };

  const hideAbilityPopup = () => {
    abilityPopup.value = { visible: false, x: 0, y: 0, name: '', description: '', stats: [] };
  };

  const hotbarAbilityDescription = (slot: any): string => {
    const liveAbility = abilityLookup.value.get(slot.abilityKey ?? '');
    return liveAbility?.description?.trim() || slot.description || `${slot.name} ability.`;
  };

  const showHotbarContextMenu = (slot: any, x: number, y: number) => {
    const ability = abilityLookup.value.get(slot.abilityKey ?? '');
    hotbarContextMenu.value = {
      visible: true,
      x,
      y,
      slot: slot.slot,
      name: slot.name || slot.abilityKey,
      description: hotbarAbilityDescription(slot),
      resource: ability?.resource ?? '',
      resourceCost: ability?.resourceCost ?? 0n,
      castSeconds: ability?.castSeconds ?? 0n,
      cooldownSeconds: ability?.cooldownSeconds ?? 0n,
    };
  };

  const hideHotbarContextMenu = () => {
    hotbarContextMenu.value.visible = false;
  };

  return {
    tooltip,
    abilityPopup,
    hotbarContextMenu,
    tooltipRarityColor,
    showTooltip,
    moveTooltip,
    hideTooltip,
    showAbilityPopup,
    hideAbilityPopup,
    showHotbarContextMenu,
    hideHotbarContextMenu,
    hotbarAbilityDescription,
  };
}
