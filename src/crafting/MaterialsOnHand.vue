<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { PhCaretDown, PhCaretRight, PhMagnifyingGlass } from '@phosphor-icons/vue';
import { GAME_KEY, createInertGame } from '../game/context';
import { LEDGER_KEY, createInertLedger } from '../ledger/ledgerContext';
import type { ActionRunner } from '../ledger/actionRunner';
import { materialsOnHand, stationHere } from './craftingModel';

// Materials on hand (50-UI-SPEC "Materials on hand"): the bag's materials, essences and reagents
// with their counts, as a column at 1200px and wider and as a collapsed disclosure below that and on
// mobile. The column form carries Discover recipes pinned under the scrolling grid. Names are
// server text and only reach the page as text nodes.
const props = withDefaults(
  defineProps<{
    mode: 'column' | 'disclosure';
    runner: ActionRunner;
    mobile?: boolean;
    /** The Discover recipes button (the column form pins it at the bottom). */
    showDiscover?: boolean;
  }>(),
  { mobile: false, showDiscover: false },
);

const game = inject(GAME_KEY, createInertGame());
const ledger = inject(LEDGER_KEY, createInertLedger());

const entries = computed(() => materialsOnHand(ledger.items.value, ledger.templates.value));
const expanded = ref(false);
const GRID_ID = 'materials-grid';

const offline = computed(() => !game.connected.value || ledger.reducers.value === null);
const station = computed(() =>
  stationHere(game.character.value?.locationId, game.locations.value),
);
const REASON_ID = 'discover-reason-materials';
const discoverInert = computed(
  () => offline.value || !station.value || props.runner.isPending('discover'),
);

function discover(): void {
  const reducers = ledger.reducers.value;
  const character = game.character.value;
  if (!reducers || !character || discoverInert.value) return;
  const characterId = character.id;
  void props.runner.run('discover', () => reducers.researchRecipes({ characterId }));
}
</script>

<template>
  <section class="materials" :class="[`mode-${props.mode}`, { mobile: props.mobile }]">
    <template v-if="props.mode === 'column'">
      <h6>Materials on hand</h6>
      <div class="grid-scroll">
        <p v-if="entries.length === 0" class="empty">No materials on hand.</p>
        <dl v-else class="grid">
          <template v-for="entry in entries" :key="String(entry.templateId)">
            <dt class="m-name" :style="{ color: entry.color }" :title="entry.name">{{ entry.name }}</dt>
            <dd class="m-count">{{ entry.count }}</dd>
          </template>
        </dl>
      </div>
    </template>
    <template v-else>
      <button
        type="button"
        class="btn btn-ghost disclosure"
        :aria-expanded="expanded ? 'true' : 'false'"
        :aria-controls="GRID_ID"
        @click="expanded = !expanded"
      >
        <PhCaretDown v-if="expanded" :size="14" aria-hidden="true" />
        <PhCaretRight v-else :size="14" aria-hidden="true" />
        Materials on hand · {{ entries.length }}
      </button>
      <div v-show="expanded" :id="GRID_ID" class="disclosure-body">
        <p v-if="entries.length === 0" class="empty">No materials on hand.</p>
        <dl v-else class="grid">
          <template v-for="entry in entries" :key="String(entry.templateId)">
            <dt class="m-name" :style="{ color: entry.color }" :title="entry.name">{{ entry.name }}</dt>
            <dd class="m-count">{{ entry.count }}</dd>
          </template>
        </dl>
      </div>
    </template>

    <div v-if="props.showDiscover" class="discover-slot">
      <button
        type="button"
        class="btn btn-secondary discover"
        :aria-disabled="discoverInert ? 'true' : undefined"
        :aria-describedby="station ? undefined : REASON_ID"
        @click="discover"
      >
        <PhMagnifyingGlass :size="16" aria-hidden="true" />
        Discover recipes
      </button>
      <p v-if="!station" :id="REASON_ID" class="reason">Find a crafting station to discover recipes.</p>
    </div>
  </section>
</template>

<style scoped>
.materials {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  font-variant-numeric: tabular-nums;
}

.mode-column {
  height: 100%;
}

h6 {
  flex: none;
  margin: 0;
  color: var(--color-neutral-400);
}

.grid-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.grid {
  display: grid;
  grid-template-columns: 1fr auto;
  row-gap: 8px;
  column-gap: 8px;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}

.m-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.m-count {
  margin: 0;
  text-align: right;
  color: var(--color-neutral-300);
}

.empty {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-500);
}

.disclosure {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  width: 100%;
  min-height: 32px;
  font-size: 12px;
}

.mobile .disclosure {
  min-height: 44px;
}

.disclosure-body {
  padding: 0 8px;
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
