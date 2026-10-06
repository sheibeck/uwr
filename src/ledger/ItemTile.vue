<script setup lang="ts">
import { computed } from 'vue';
import type { ItemInstance, ItemTemplate } from '../module_bindings/types';
import {
  itemCategory,
  itemIcon,
  itemName,
  itemRarity,
  nameColor,
  ringColor,
} from './itemModel';

// A backpack tile (50-UI-SPEC "Backpack > Item tile"): the icon in the rarity color, the name on
// desktop only, the quantity above 1, and a ring in the ring color (2px when selected). The item
// name is server or model text, so it only ever reaches the page as a text node, an attribute or a
// title.
const props = withDefaults(
  defineProps<{
    instance: ItemInstance;
    template: ItemTemplate;
    selected: boolean;
    mobile?: boolean;
    tabindex?: number;
  }>(),
  { mobile: false, tabindex: undefined },
);
const emit = defineEmits<{ select: [] }>();

const name = computed(() => itemName(props.instance, props.template));
const rarity = computed(() => itemRarity(props.instance, props.template));
const junk = computed(() => props.template.isJunk);
const quest = computed(() => itemCategory(props.template) === 'quest');
const icon = computed(() => itemIcon(props.template));
const showQuantity = computed(() => props.instance.quantity > 1n);

const label = computed(() => {
  let text = `${name.value}, ${rarity.value}`;
  if (showQuantity.value) text += `, quantity ${props.instance.quantity}`;
  if (junk.value) text += ', junk';
  if (quest.value) text += ', quest item';
  return text;
});

const iconStyle = computed(() => ({ color: nameColor(rarity.value, junk.value) }));
const ringStyle = computed(() => ({
  boxShadow: `inset 0 0 0 ${props.selected ? 2 : 1}px ${ringColor(rarity.value, {
    junk: junk.value,
    selected: props.selected,
  })}`,
}));
</script>

<template>
  <button
    type="button"
    class="item-tile"
    :style="ringStyle"
    :aria-label="label"
    :aria-pressed="props.selected ? 'true' : 'false'"
    :tabindex="props.tabindex"
    @click="emit('select')"
  >
    <span class="icon" :style="iconStyle" aria-hidden="true">
      <component :is="icon" :size="props.mobile ? 22 : 20" />
    </span>
    <span v-if="!props.mobile" class="name" :title="name">{{ name }}</span>
    <span v-if="showQuantity" class="quantity" aria-hidden="true">{{ props.instance.quantity }}</span>
  </button>
</template>

<style scoped>
.item-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 44px;
  min-height: 44px;
  aspect-ratio: 1;
  padding: 4px;
  border: 0;
  border-radius: var(--radius-md);
  background-color: var(--color-bg);
  color: var(--color-neutral-300);
  font-family: inherit;
  cursor: pointer;
}

.item-tile:hover {
  background-image: linear-gradient(
    color-mix(in srgb, var(--color-text) 7%, transparent),
    color-mix(in srgb, var(--color-text) 7%, transparent)
  );
}

.item-tile:active {
  background-image: linear-gradient(
    color-mix(in srgb, var(--color-text) 14%, transparent),
    color-mix(in srgb, var(--color-text) 14%, transparent)
  );
}

.item-tile:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.icon {
  display: inline-flex;
}

.name {
  max-width: 100%;
  font-size: 10px;
  line-height: 1.5;
  color: var(--color-neutral-300);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.quantity {
  position: absolute;
  right: 4px;
  bottom: 4px;
  font-size: 10px;
  line-height: 1.5;
  color: var(--color-neutral-400);
  font-variant-numeric: tabular-nums;
}
</style>
