<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue';
import { PhBackpack } from '@phosphor-icons/vue';
import { GAME_KEY, createInertGame } from '../game/context';
import { LEDGER_KEY, createInertLedger } from '../ledger/ledgerContext';
import FilterChips from '../ledger/FilterChips.vue';
import ItemTile from '../ledger/ItemTile.vue';
import EmptyState from '../screens/EmptyState.vue';
import { BACKPACK_COLUMNS, BAG_FILTERS, FILTER_EMPTY_TEXT, backpackColumns, bagTiles } from './backpack';
import type { BagFilterId } from './backpack';

// The backpack (50-UI-SPEC "Backpack"): the filter chips, the sorted item tiles and the empty tiles
// up to the capacity (under All). The grid is one tab stop with a roving tabindex: arrows move by
// one or by a row, Home and End jump, Enter and Space select through the tile's own button. Item
// names are server text and only reach the page as text nodes.
//
// The desktop grid fills the backpack column. The column count comes from the column's measured width
// (backpackColumns: the fewest columns whose tile is at most 72px). Mobile stays 5 columns of at most
// 66px. Under All a non-empty bag draws all MAX_INVENTORY_SLOTS cells. The empty cells are
// decorative: aria-hidden, not focusable, skipped by the arrows. This is per the owner's 2026-10-07
// decision (plan 50-39).
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

// The measured desktop column count; 6 until the column has been measured (or with no ResizeObserver).
const measured = ref<number>(BACKPACK_COLUMNS.desktop);
const columns = computed(() => (props.mobile ? BACKPACK_COLUMNS.mobile : measured.value));
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
const root = useTemplateRef<HTMLElement>('root');

// One observer on the backpack column (desktop only), feature-detected, disconnected on unmount. A ref
// only triggers on change, so an equal count does not re-render.
let observer: ResizeObserver | null = null;

function stopObserving(): void {
  if (observer !== null) observer.disconnect();
  observer = null;
}

watch(
  [root, () => props.mobile] as const,
  ([el, mobile]) => {
    stopObserving();
    if (el === null || mobile || typeof ResizeObserver === 'undefined') return;
    observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry === undefined) return;
      measured.value = backpackColumns(entry.contentRect.width, false);
    });
    observer.observe(el);
  },
  { flush: 'post', immediate: true },
);

onBeforeUnmount(stopObserving);

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
  <div ref="root" class="backpack" :class="{ mobile: props.mobile }">
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
      :style="props.mobile ? undefined : { '--bag-columns': String(columns) }"
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
  grid-template-columns: repeat(var(--bag-columns, 6), minmax(44px, 72px));
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
