<script setup lang="ts">
import { computed, inject, nextTick, ref, useTemplateRef } from 'vue';
import { PhCaretLeft, PhHammer } from '@phosphor-icons/vue';
import { FRAME_KEY, GAME_KEY, createInertFrame, createInertGame } from '../game/context';
import { LEDGER_KEY, createInertLedger } from '../ledger/ledgerContext';
import { createActionRunner } from '../ledger/actionRunner';
import NoticeLine from '../ledger/NoticeLine.vue';
import EmptyState from '../screens/EmptyState.vue';
import MaterialsOnHand from './MaterialsOnHand.vue';
import RecipeDetail from './RecipeDetail.vue';
import RecipeList from './RecipeList.vue';
import { stationHere } from './craftingModel';
import { useWideLayout } from './useWideLayout';

// The Crafting screen (50-UI-SPEC "Crafting Contract" and "Layout Contract > Crafting"): Materials on
// hand, the recipe list and the selected recipe's detail as columns in the desktop drawer (Materials
// moves into the list as a disclosure below 1200px), and a list view and a detail view in the mobile
// sheet. The selection is a local id; the subscribed rows drive every other change and nothing here
// is optimistic. One action runner is shared by Craft, Discover recipes and the notice line.
// Registration in SCREENS is Plan 23.
const frame = inject(FRAME_KEY, createInertFrame());
const game = inject(GAME_KEY, createInertGame());
const ledger = inject(LEDGER_KEY, createInertLedger());

const mobile = computed(() => !frame.isDesktop.value);
const wide = useWideLayout();
const online = computed(() => game.connected.value && ledger.reducers.value !== null);
const runner = createActionRunner({ online });

const character = computed(() => game.character.value);
const ready = computed(() => character.value !== null && ledger.recipesApplied.value);
const noneKnown = computed(() => ledger.recipesKnown.value.length === 0);
const station = computed(() => stationHere(character.value?.locationId, game.locations.value));

const selectedId = ref<bigint | null>(null);
const view = ref<'list' | 'detail'>('list');
const list = useTemplateRef<InstanceType<typeof RecipeList>>('list');

const backButton = useTemplateRef<HTMLButtonElement>('backButton');

// Desktop: the list keeps a visible selection and reports it. Mobile: choosing a row opens the
// detail, which hides the row that had focus, so focus moves to the All recipes button (never body).
async function onSelect(id: bigint | null): Promise<void> {
  selectedId.value = id;
  if (mobile.value && id !== null) {
    view.value = 'detail';
    await nextTick();
    backButton.value?.focus();
  }
}

// The mobile back button returns to the list and puts focus on the row it came from.
async function backToList(): Promise<void> {
  const id = selectedId.value;
  view.value = 'list';
  await nextTick();
  if (id !== null) list.value?.focusRow(id);
}
</script>

<template>
  <div class="crafting-screen" :class="{ mobile }">
    <EmptyState
      v-if="!character"
      :icon="PhHammer"
      title="No recipes known yet."
      body="Discover recipes at a crafting station, or learn a recipe scroll."
    />
    <template v-else-if="ready">
      <template v-if="noneKnown">
        <!-- Materials on hand stays reachable with no recipes: discovery works from what is held. -->
        <div v-if="mobile" class="empty-wrap">
          <RecipeList :selected-id="null" :runner="runner" mobile show-materials-disclosure />
        </div>
        <div v-else class="desk-grid empty-grid" :class="{ wide }">
          <div v-if="wide" class="col materials-col">
            <MaterialsOnHand mode="column" :runner="runner" />
          </div>
          <div class="col list-col">
            <RecipeList :selected-id="null" :runner="runner" :show-materials-disclosure="!wide" />
          </div>
        </div>
      </template>

      <div v-else-if="!mobile" class="desk-grid" :class="{ wide }">
        <div v-if="wide" class="col materials-col">
          <MaterialsOnHand mode="column" :runner="runner" show-discover />
        </div>
        <div class="col list-col">
          <RecipeList
            ref="list"
            :selected-id="selectedId"
            :runner="runner"
            :show-materials-disclosure="!wide"
            :show-discover="!wide"
            @select="onSelect"
          />
        </div>
        <aside class="col detail-col">
          <RecipeDetail v-if="selectedId !== null" :recipe-id="selectedId" :runner="runner" :mobile="false" />
          <p v-else class="empty">{{ list ? list.emptyText : '' }}</p>
        </aside>
      </div>

      <template v-else>
        <div v-show="view === 'list'" class="list-view">
          <div class="station-line">
            <span v-if="station" class="tag tag-accent station">
              <PhHammer :size="12" aria-hidden="true" />
              Crafting station
            </span>
            <span v-else class="no-station">No crafting station here</span>
          </div>
          <RecipeList
            ref="list"
            :selected-id="selectedId"
            :runner="runner"
            mobile
            show-materials-disclosure
            show-discover
            @select="onSelect"
          />
        </div>
        <div v-if="view === 'detail' && selectedId !== null" class="detail-view">
          <button ref="backButton" type="button" class="btn btn-ghost back" @click="backToList">
            <PhCaretLeft :size="20" aria-hidden="true" />
            All recipes
          </button>
          <div class="detail-slot">
            <RecipeDetail :recipe-id="selectedId" :runner="runner" mobile />
          </div>
        </div>
      </template>

      <NoticeLine :rejection="runner.rejection.value" />
    </template>
  </div>
</template>

<style scoped>
.crafting-screen {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.empty-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.desk-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 24px;
}

.desk-grid.wide {
  grid-template-columns: 200px 360px minmax(0, 1fr);
}

.desk-grid.empty-grid {
  grid-template-columns: minmax(0, 1fr);
}

.desk-grid.empty-grid.wide {
  grid-template-columns: 200px minmax(0, 1fr);
}

.col {
  min-width: 0;
  min-height: 0;
}

.list-col {
  overflow-y: auto;
}

.empty {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-500);
}

.list-view {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.station-line {
  flex: none;
  display: flex;
  align-items: center;
  min-height: 32px;
}

.station {
  gap: 4px;
}

.no-station {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-500);
}

.detail-view {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.back {
  flex: none;
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 4px;
  min-height: 44px;
}

.detail-slot {
  flex: 1;
  min-height: 0;
}
</style>
