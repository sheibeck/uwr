<script setup lang="ts">
import { computed, inject, nextTick, ref, useTemplateRef, watch } from 'vue';
import { PhHammer, PhMagnifyingGlass } from '@phosphor-icons/vue';
import { GAME_KEY, createInertGame } from '../game/context';
import { LEDGER_KEY, createInertLedger } from '../ledger/ledgerContext';
import type { ActionRunner } from '../ledger/actionRunner';
import FilterChips from '../ledger/FilterChips.vue';
import EmptyState from '../screens/EmptyState.vue';
import MaterialsOnHand from './MaterialsOnHand.vue';
import { RECIPE_FILTERS, recipeRows, stationHere } from './craftingModel';
import type { RecipeFilterId, RecipeRow } from './craftingModel';

// The recipe list (50-UI-SPEC "Recipe list", mock 9a): category chips, the Show only craftable box,
// and one row per known recipe: a 32px icon tile with the output's item icon, the name in the output's
// rarity color (muted while uncraftable, at full opacity per the house rule), the short type and one
// status line, 'Can make N' (the server's maxCraftCount times the output count) or 'Missing A, B'.
// The list holds its own filter state. On
// desktop it also keeps a visible selection: when nothing is selected, or the selection is filtered
// out, it selects the first visible row (select with null when no row is visible). Names are server
// text and only reach the page as text nodes.
const props = withDefaults(
  defineProps<{
    selectedId: bigint | null;
    mobile?: boolean;
    runner: ActionRunner;
    /** The Materials on hand disclosure inside the list (900 to 1199px and mobile). */
    showMaterialsDisclosure?: boolean;
    /** The Discover recipes button after the rows (the wide layout pins it under Materials). */
    showDiscover?: boolean;
  }>(),
  { mobile: false, showMaterialsDisclosure: false, showDiscover: false },
);
const emit = defineEmits<{ select: [recipeId: bigint | null] }>();

const game = inject(GAME_KEY, createInertGame());
const ledger = inject(LEDGER_KEY, createInertLedger());

const filter = ref<RecipeFilterId>('all');
const onlyCraftable = ref(false);

const offline = computed(() => !game.connected.value || ledger.reducers.value === null);
const station = computed(() => stationHere(game.character.value?.locationId, game.locations.value));

const craftingInput = computed(() => ({
  known: ledger.recipesKnown.value,
  recipes: ledger.recipes.value,
  templates: ledger.templates.value,
  items: ledger.items.value,
}));

const rows = computed<RecipeRow[]>(() =>
  recipeRows(craftingInput.value, { filter: filter.value, onlyCraftable: onlyCraftable.value }),
);
// The rows the category filter alone leaves (what 'Show all n recipes' would show).
const categoryRows = computed(() => recipeRows(craftingInput.value, { filter: filter.value, onlyCraftable: false }));

const noRecipesKnown = computed(() => ledger.recipesKnown.value.length === 0);
const categoryWord = computed(() => {
  const found = RECIPE_FILTERS.find((option) => option.id === filter.value);
  return found ? found.label.toLowerCase() : '';
});

const emptyText = computed(() => {
  if (rows.value.length > 0 || noRecipesKnown.value) return null;
  if (categoryRows.value.length === 0) return `No ${categoryWord.value} recipes known.`;
  return 'No craftable recipes right now.';
});

// Desktop keeps a selected row visible: the first row when nothing (or something hidden) is selected.
watch(
  () => `${rows.value.map((row) => String(row.id)).join(',')}|${String(props.selectedId)}`,
  () => {
    if (props.mobile) return;
    const list = rows.value;
    if (list.length === 0) {
      if (props.selectedId !== null) emit('select', null);
      return;
    }
    if (props.selectedId === null || !list.some((row) => row.id === props.selectedId)) {
      emit('select', list[0].id);
    }
  },
  { immediate: true },
);

const root = useTemplateRef<HTMLElement>('root');

/** Puts focus on a recipe row (the mobile back button returns to the row it came from). */
function focusRow(id: bigint): void {
  const row = root.value?.querySelector<HTMLElement>(`[data-recipe-id="${id}"]`);
  row?.focus();
}
defineExpose({ focusRow, emptyText });

// The button removes itself, so focus moves to the first recipe row that appears (never body).
async function showAll(): Promise<void> {
  onlyCraftable.value = false;
  await nextTick();
  root.value?.querySelector<HTMLElement>('.recipe-row')?.focus();
}

function setFilter(id: string): void {
  filter.value = id as RecipeFilterId;
}

const DISCOVER_REASON_ID = 'discover-reason-list';
const discoverInert = computed(() => offline.value || !station.value || props.runner.isPending('discover'));

function discover(): void {
  const reducers = ledger.reducers.value;
  const character = game.character.value;
  if (!reducers || !character || discoverInert.value) return;
  const characterId = character.id;
  void props.runner.run('discover', () => reducers.researchRecipes({ characterId }));
}
</script>

<template>
  <div ref="root" class="recipe-list" :class="{ mobile: props.mobile }">
    <template v-if="noRecipesKnown">
      <MaterialsOnHand
        v-if="props.showMaterialsDisclosure"
        mode="disclosure"
        :runner="props.runner"
        :mobile="props.mobile"
      />
      <EmptyState
        :icon="PhHammer"
        title="No recipes known yet."
        body="Discover recipes at a crafting station, or learn a recipe scroll."
      />
      <div class="discover-slot">
        <button
          type="button"
          class="btn btn-secondary discover"
          :aria-disabled="discoverInert ? 'true' : undefined"
          :aria-describedby="station ? undefined : DISCOVER_REASON_ID"
          @click="discover"
        >
          <PhMagnifyingGlass :size="16" aria-hidden="true" />
          Discover recipes
        </button>
        <p v-if="!station" :id="DISCOVER_REASON_ID" class="reason">Find a crafting station to discover recipes.</p>
      </div>
    </template>
    <template v-else>
      <MaterialsOnHand
        v-if="props.showMaterialsDisclosure && !props.mobile"
        mode="disclosure"
        :runner="props.runner"
        :mobile="false"
      />
      <FilterChips
        :options="RECIPE_FILTERS"
        :model-value="filter"
        group-label="Recipe category"
        :mobile="props.mobile"
        :disabled="offline"
        @update:model-value="setFilter"
      />
      <label class="radio only-craftable">
        <input v-model="onlyCraftable" type="checkbox" />
        <span class="dot"></span>
        <span class="only-text">Show only craftable</span>
      </label>
      <MaterialsOnHand
        v-if="props.showMaterialsDisclosure && props.mobile"
        mode="disclosure"
        :runner="props.runner"
        mobile
      />

      <div v-if="emptyText" class="empty-block">
        <p class="empty">{{ emptyText }}</p>
        <button
          v-if="onlyCraftable && categoryRows.length > 0"
          type="button"
          class="btn btn-ghost show-all"
          @click="showAll"
        >
          Show all {{ categoryRows.length }} recipes
        </button>
      </div>
      <ul v-else class="rows" aria-label="Known recipes">
        <li v-for="row in rows" :key="String(row.id)">
          <button
            type="button"
            class="recipe-row"
            :class="{ selected: row.id === props.selectedId, uncraftable: !row.craftable }"
            :data-recipe-id="String(row.id)"
            :aria-pressed="row.id === props.selectedId ? 'true' : 'false'"
            :aria-label="row.ariaLabel"
            @click="emit('select', row.id)"
          >
            <span class="row-icon" :style="{ color: row.nameColor }">
              <component :is="row.icon" :size="18" aria-hidden="true" />
            </span>
            <span class="row-text">
              <span class="line-one">
                <span class="row-name" :style="row.craftable ? { color: row.nameColor } : undefined" :title="row.name">{{ row.name }}</span>
                <span class="row-meta">{{ row.meta }}</span>
              </span>
              <span class="row-status" :class="row.statusTone">{{ row.statusText }}</span>
            </span>
          </button>
        </li>
      </ul>

      <div v-if="props.showDiscover" class="discover-slot">
        <button
          type="button"
          class="btn btn-secondary discover"
          :aria-disabled="discoverInert ? 'true' : undefined"
          :aria-describedby="station ? undefined : DISCOVER_REASON_ID"
          @click="discover"
        >
          <PhMagnifyingGlass :size="16" aria-hidden="true" />
          Discover recipes
        </button>
        <p v-if="!station" :id="DISCOVER_REASON_ID" class="reason">Find a crafting station to discover recipes.</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.recipe-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  font-variant-numeric: tabular-nums;
}

.only-craftable {
  min-height: 32px;
  font-size: 12px;
  color: var(--color-neutral-300);
}

.mobile .only-craftable {
  min-height: 44px;
}

.only-craftable .dot {
  border-radius: var(--radius-sm);
}

.only-text {
  font-size: 12px;
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.recipe-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 16px;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.mobile .recipe-row {
  min-height: 56px;
}

.recipe-row:hover {
  background: color-mix(in srgb, var(--color-text) 7%, transparent);
}

.recipe-row:active {
  background: color-mix(in srgb, var(--color-text) 14%, transparent);
}

.recipe-row:focus-visible {
  outline-offset: -2px;
}

.recipe-row.selected {
  background: var(--color-bg);
  box-shadow: inset 0 0 0 1px var(--color-accent);
}

.row-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  background: var(--color-bg);
  box-shadow: inset 0 0 0 1px var(--color-neutral-700);
}

.row-text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.line-one {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.row-name {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
}

.recipe-row.uncraftable .row-name {
  color: var(--color-neutral-400);
}

.row-meta {
  flex: none;
  font-size: 12px;
  color: var(--color-neutral-500);
}

.recipe-row.uncraftable .row-meta {
  color: var(--color-neutral-600);
}

.row-status {
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.row-status.met {
  color: var(--color-con-light-green);
}

.row-status.short {
  color: var(--color-con-red);
}

.empty-block {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.empty {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-500);
}

.show-all {
  min-height: 32px;
  font-size: 12px;
}

.mobile .show-all {
  min-height: 44px;
}

.discover-slot {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.discover {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 32px;
  font-size: 12px;
  font-weight: 500;
}

.mobile .discover {
  min-height: 44px;
}

.discover[aria-disabled='true'] {
  opacity: 0.45;
  cursor: default;
}

.reason {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-400);
  overflow-wrap: anywhere;
}
</style>
