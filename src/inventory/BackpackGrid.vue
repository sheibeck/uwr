<script setup lang="ts">
import { computed, inject, nextTick, ref, useTemplateRef } from 'vue';
import { PhBackpack } from '@phosphor-icons/vue';
import { GAME_KEY, createInertGame } from '../game/context';
import { LEDGER_KEY, createInertLedger } from '../ledger/ledgerContext';
import FilterChips from '../ledger/FilterChips.vue';
import ItemTile from '../ledger/ItemTile.vue';
import EmptyState from '../screens/EmptyState.vue';
import { BAG_FILTERS, FILTER_EMPTY_TEXT, bagTiles } from './backpack';
import type { BagFilterId } from './backpack';

// The backpack (50-UI-SPEC "Backpack"): the filter chips, the sorted item tiles and the empty tiles
// up to the capacity (under All). The grid is one tab stop with a roving tabindex: arrows move by
// one or by a row, Home and End jump, Enter and Space select through the tile's own button. Item
// names are server text and only reach the page as text nodes. The tiles stay at the Inventory
// mock's size (EXTRACT I.3, constants in backpack.ts) and never stretch with the column, per the
// owner's "squares are huge"; the grid is left-aligned and the column is no wider than the grid.
const props = withDefaults(
  defineProps<{
    selectedId: bigint | null;
    filter: BagFilterId;
    mobile?: boolean;
  }>(),
  { mobile: false },
);
const emit = defineEmits<{ select: [instanceId: bigint]; 'update:filter': [filter: BagFilterId] }>();

const game = inject(GAME_KEY, createInertGame());
const ledger = inject(LEDGER_KEY, createInertLedger());

const columns = computed(() => (props.mobile ? 5 : 6));
const tiles = computed(() => bagTiles(ledger.items.value, ledger.templates.value, props.filter));

const bagIsEmpty = computed(
  () => props.filter === 'all' && !ledger.items.value.some((item) => !item.equippedSlot),
);
const filterEmptyText = computed(() =>
  props.filter !== 'all' && tiles.value.items.length === 0 ? FILTER_EMPTY_TEXT[props.filter] : null,
);

// Roving tabindex: the tile that was last focused, else the selected tile, else the first.
const focusedId = ref<bigint | null>(null);
const tabbableId = computed<bigint | null>(() => {
  const list = tiles.value.items;
  if (list.length === 0) return null;
  const has = (id: bigint | null): id is bigint => id !== null && list.some((e) => e.instance.id === id);
  if (has(focusedId.value)) return focusedId.value;
  if (has(props.selectedId)) return props.selectedId;
  return list[0].instance.id;
});

const grid = useTemplateRef<HTMLElement>('grid');
const heading = useTemplateRef<HTMLElement>('heading');

function tileButtons(): HTMLElement[] {
  return grid.value ? Array.from(grid.value.querySelectorAll<HTMLElement>('button.item-tile')) : [];
}

function focusIndex(index: number): void {
  const list = tiles.value.items;
  if (list.length === 0) return;
  const clamped = Math.max(0, Math.min(list.length - 1, index));
  focusedId.value = list[clamped].instance.id;
  void nextTick(() => tileButtons()[clamped]?.focus());
}

function onKeydown(event: KeyboardEvent): void {
  const buttons = tileButtons();
  const current = buttons.findIndex((button) => button === event.target || button.contains(event.target as Node));
  if (current === -1) return;
  let next = -1;
  switch (event.key) {
    case 'ArrowRight':
      next = current + 1;
      break;
    case 'ArrowLeft':
      next = current - 1;
      break;
    case 'ArrowDown':
      next = current + columns.value;
      break;
    case 'ArrowUp':
      next = current - columns.value;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = buttons.length - 1;
      break;
    default:
      return;
  }
  event.preventDefault();
  // Down on the last row and Up on the first row stay where they are.
  if (next < 0 || next > buttons.length - 1) return;
  focusIndex(next);
}

function onFocusin(instanceId: bigint): void {
  focusedId.value = instanceId;
}

/** Focus the first tile, else the Backpack heading. True when a tile took focus. */
function focusFirst(): boolean {
  const first = tileButtons()[0];
  if (first) {
    focusedId.value = tiles.value.items[0].instance.id;
    first.focus();
    return true;
  }
  heading.value?.focus();
  return false;
}

/** Focus the tile of an instance when it is shown; false otherwise. */
function focusTile(instanceId: bigint): boolean {
  const index = tiles.value.items.findIndex((entry) => entry.instance.id === instanceId);
  if (index === -1) return false;
  focusedId.value = instanceId;
  tileButtons()[index]?.focus();
  return true;
}

defineExpose({ focusFirst, focusTile });
</script>

<template>
  <div class="backpack" :class="{ mobile: props.mobile }">
    <div class="head">
      <h6 ref="heading" tabindex="-1" :class="{ 'sr-only': props.mobile }">Backpack</h6>
      <FilterChips
        :options="BAG_FILTERS"
        :model-value="props.filter"
        group-label="Backpack filter"
        :mobile="props.mobile"
        :disabled="!game.connected.value"
        @update:model-value="(id) => emit('update:filter', id as BagFilterId)"
      />
    </div>

    <EmptyState
      v-if="bagIsEmpty"
      :icon="PhBackpack"
      title="Your backpack is empty."
      body="Items you pick up, buy or craft land here."
    />
    <p v-else-if="filterEmptyText" class="filter-empty">{{ filterEmptyText }}</p>
    <div
      v-else
      ref="grid"
      class="grid"
      :class="{ mobile: props.mobile }"
      role="group"
      aria-label="Backpack items"
      @keydown="onKeydown"
    >
      <ItemTile
        v-for="entry in tiles.items"
        :key="entry.instance.id.toString()"
        :instance="entry.instance"
        :template="entry.template"
        :selected="props.selectedId === entry.instance.id"
        :mobile="props.mobile"
        :tabindex="tabbableId === entry.instance.id ? 0 : -1"
        @select="emit('select', entry.instance.id)"
        @focusin="onFocusin(entry.instance.id)"
      />
      <div v-for="n in tiles.emptyCount" :key="`empty-${n}`" class="empty-tile" aria-hidden="true"></div>
    </div>
  </div>
</template>

<style scoped>
.backpack {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: calc(6 * 58px + 5 * 4px);
}

.backpack.mobile {
  max-width: calc(5 * 66px + 4 * 4px);
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.backpack.mobile .head {
  justify-content: flex-start;
}

h6 {
  margin: 0;
  color: var(--color-neutral-400);
}

h6:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(44px, 58px));
  gap: 4px;
  justify-content: start;
}

.grid.mobile {
  grid-template-columns: repeat(5, minmax(44px, 66px));
}

.empty-tile {
  aspect-ratio: 1;
  min-width: 44px;
  min-height: 44px;
  border-radius: var(--radius-md);
  box-shadow: inset 0 0 0 1px var(--color-neutral-800);
}

.filter-empty {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-500);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
