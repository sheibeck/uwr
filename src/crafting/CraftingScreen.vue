<script setup lang="ts">
import { computed, inject, nextTick, ref, useTemplateRef, watch } from 'vue';
import { PhBookOpen, PhCaretLeft, PhHammer, PhRecycle, PhTShirt } from '@phosphor-icons/vue';
import { canEquipItem } from '@game-data/item_usability';
import { FRAME_KEY, GAME_KEY, createInertFrame, createInertGame } from '../game/context';
import { LEDGER_KEY, createInertLedger } from '../ledger/ledgerContext';
import { createActionRunner } from '../ledger/actionRunner';
import NoticeLine from '../ledger/NoticeLine.vue';
import ResultCard from '../ledger/ResultCard.vue';
import type { ResultCardAction } from '../ledger/ResultCard.vue';
import { resultCardView } from '../ledger/resultCard';
import SegTabs from '../ledger/SegTabs.vue';
import { useActionResult } from '../ledger/useActionResult';
import EmptyState from '../screens/EmptyState.vue';
import MaterialsOnHand from './MaterialsOnHand.vue';
import RecipeDetail from './RecipeDetail.vue';
import RecipeList from './RecipeList.vue';
import SalvageDetail from './SalvageDetail.vue';
import SalvageList from './SalvageList.vue';
import { craftQuantity, stationHere } from './craftingModel';
import type { CraftChoice, CraftCountArgs } from './craftingModel';
import { salvageCountText, salvageRows } from './salvageModel';
import { useWideLayout } from './useWideLayout';

// The Crafting screen (50-UI-SPEC "Crafting Contract" and "Layout Contract > Crafting", mock 9a):
// the recipe list, the selected recipe's detail and Materials on hand (with Discover pinned under it)
// as three columns in the desktop drawer at 1200px and wider (below that Materials moves into the list
// as a disclosure beside a 320px detail), and a list view and a detail view in the mobile sheet. The selection is a local id; the subscribed rows drive every other change and nothing here
// is optimistic. One action runner is shared by Craft, Discover recipes and the notice line. A craft
// or a Discover ends on the shared result card, which shows what the server reported: Craft again
// (the last recipe and reagents, the smaller of the last count and what the bag now allows) and, on
// desktop, Equip for the crafted gear. Registration in SCREENS is Plan 23. A Craft / Salvage switch
// (mock 9a, CONTEXT default "Salvage in Crafting") puts the Salvage tab beside the craft panel: the same
// salvage reducer, rules, confirm text and result card as Inventory (plan 50-38), with Read scroll when a
// scroll was granted.
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

const MODES = [
  { id: 'craft', label: 'Craft', icon: PhHammer },
  { id: 'salvage', label: 'Salvage', icon: PhRecycle },
];
const mode = ref('craft');

const selectedId = ref<bigint | null>(null);

// The selected recipe's requirement template ids: Materials on hand highlights these rows.
const usedTemplateIds = computed<bigint[]>(() => {
  const id = selectedId.value;
  const recipe = id === null ? undefined : ledger.recipes.value.get(id);
  if (!recipe) return [];
  const ids = [recipe.req1TemplateId, recipe.req2TemplateId];
  if (recipe.req3TemplateId !== undefined && recipe.req3TemplateId !== null) ids.push(recipe.req3TemplateId);
  return ids;
});
const view = ref<'list' | 'detail'>('list');
const list = useTemplateRef<InstanceType<typeof RecipeList>>('list');

// The Salvage tab: the selected instance and, on mobile, the list or detail view.
const salvageSelectedId = ref<bigint | null>(null);
const salvageView = ref<'list' | 'detail'>('list');
const salvageList = useTemplateRef<InstanceType<typeof SalvageList>>('salvageList');
const salvageCount = computed(() => salvageRows(ledger.items.value, ledger.templates.value).length);

const backButton = useTemplateRef<HTMLButtonElement>('backButton');
const root = useTemplateRef<HTMLElement>('root');

function focusLost(): boolean {
  const active = document.activeElement;
  return active === null || active === document.body || !active.isConnected;
}

// Where focus goes when the button that started the action is gone (the mobile detail was closed):
// the selected recipe row, else the back button, else the first button. Never body.
function fallbackFocus(): void {
  if (mode.value === 'salvage') {
    if (salvageSelectedId.value !== null) salvageList.value?.focusRow(salvageSelectedId.value);
    else salvageList.value?.focusFirst();
  } else if (selectedId.value !== null) {
    list.value?.focusRow(selectedId.value);
  }
  if (!focusLost()) return;
  backButton.value?.focus();
  if (!focusLost()) return;
  root.value?.querySelector<HTMLElement>('button')?.focus();
}

// The shared result card for a craft or a Discover this screen started (never a stale row).
const result = useActionResult({
  runner,
  lastResult: ledger.lastResult,
  keys: { craft: 'craft', discover: 'discover', salvage: 'salvage' },
  fallbackFocus,
});

const resultView = computed(() =>
  result.shown.value
    ? resultCardView({
        row: result.shown.value,
        templates: ledger.templates.value,
        items: ledger.items.value,
        affixes: ledger.affixes.value,
      })
    : null,
);

// The arguments of the craft the detail last sent (it emits them as the call starts): Craft again
// repeats them.
const lastCraft = ref<{ args: CraftCountArgs } | null>(null);
function onCraftStart(payload: { args: CraftCountArgs }): void {
  lastCraft.value = payload;
}

function choiceOf(args: CraftCountArgs): CraftChoice {
  const reagentIds: bigint[] = [];
  for (const id of [args.modifier1TemplateId, args.modifier2TemplateId, args.modifier3TemplateId]) {
    if (id !== undefined) reagentIds.push(id);
  }
  return { essenceId: args.catalystTemplateId ?? null, reagentIds };
}

// The count Craft again sends: the smaller of the last count and the stepper maximum the live bag
// allows for the same recipe and reagents. Null (no button) with no station or nothing left to make.
const againCount = computed<bigint | null>(() => {
  const view = resultView.value;
  const last = lastCraft.value;
  if (view === null || view.kind !== 'craft' || last === null || !station.value) return null;
  if (view.recipeTemplateId === null || view.recipeTemplateId !== last.args.recipeTemplateId) return null;
  const recipe = ledger.recipes.value.get(last.args.recipeTemplateId);
  if (!recipe) return null;
  const max = craftQuantity(
    {
      recipe,
      station: true,
      templates: ledger.templates.value,
      items: ledger.items.value,
      choice: choiceOf(last.args),
    },
    1n,
  ).max;
  if (max < 1n) return null;
  return last.args.count < max ? last.args.count : max;
});

// Equip is offered on desktop for crafted gear the character can equip (the inspector's rule).
const canEquipMade = computed(() => {
  const view = resultView.value;
  const row = result.shown.value;
  const c = character.value;
  if (mobile.value || view === null || view.equipInstanceId === null || !row || !c) return false;
  const template = row.templateId === undefined ? undefined : ledger.templates.value.get(row.templateId);
  return template !== undefined && canEquipItem(template, c).ok;
});

const resultActions = computed<ResultCardAction[]>(() => {
  const actions: ResultCardAction[] = [];
  if (againCount.value !== null) {
    actions.push({
      id: 'craft-again',
      label: 'Craft again',
      tone: mobile.value ? 'primary' : 'secondary',
      pending: runner.isPending('craft'),
    });
  }
  if (canEquipMade.value) {
    actions.push({
      id: 'equip',
      label: 'Equip',
      icon: PhTShirt,
      tone: 'primary',
      pending: runner.isPending('item-equip'),
    });
  }
  const scrollId = resultView.value?.kind === 'salvage' ? resultView.value.scrollInstanceId : null;
  if (scrollId !== null && scrollId !== undefined) {
    actions.push({
      id: 'read-scroll',
      label: 'Read scroll',
      icon: PhBookOpen,
      tone: 'primary',
      pending: runner.isPending('item-learn'),
    });
  }
  return actions;
});

async function onResultAction(id: string): Promise<void> {
  const reducers = ledger.reducers.value;
  const c = character.value;
  if (!reducers || !c) return;
  if (id === 'read-scroll') {
    const scrollId = resultView.value?.scrollInstanceId ?? null;
    if (scrollId === null) return;
    const characterId = c.id;
    const learned = await runner.run('item-learn', () =>
      reducers.learnRecipeScroll({ characterId, itemInstanceId: scrollId }),
    );
    if (learned) result.close();
    return;
  }
  if (id === 'craft-again') {
    const last = lastCraft.value;
    const count = againCount.value;
    if (last === null || count === null) return;
    const args: CraftCountArgs = { ...last.args, count };
    lastCraft.value = { args };
    // The card stays open: the server's next craft row replaces its content.
    void runner.run('craft', () => reducers.craftRecipeCount(args));
    return;
  }
  if (id !== 'equip') return;
  const itemInstanceId = resultView.value?.equipInstanceId ?? null;
  if (itemInstanceId === null) return;
  const characterId = c.id;
  const done = await runner.run('item-equip', () => reducers.equipItem({ characterId, itemInstanceId }));
  if (done) result.close();
}

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

// The Salvage tab follows the same pattern: a selection on desktop, the detail view with All gear on mobile.
async function onSalvageSelect(id: bigint | null): Promise<void> {
  salvageSelectedId.value = id;
  if (mobile.value && id !== null) {
    salvageView.value = 'detail';
    await nextTick();
    backButton.value?.focus();
  }
}

async function backToSalvageList(): Promise<void> {
  const id = salvageSelectedId.value;
  salvageView.value = 'list';
  await nextTick();
  if (id !== null) salvageList.value?.focusRow(id);
}

// A salvaged item leaves the bag. Desktop: the list selects the next row itself. Mobile: the detail of the
// vanished item closes and the list shows again.
watch(
  () => ledger.items.value,
  (rows) => {
    const id = salvageSelectedId.value;
    if (id === null || !mobile.value || rows.some((row) => row.id === id)) return;
    salvageSelectedId.value = null;
    salvageView.value = 'list';
  },
);
</script>

<template>
  <div ref="root" class="crafting-screen" :class="{ mobile }">
    <EmptyState
      v-if="!character"
      :icon="PhHammer"
      title="No recipes known yet."
      body="Discover recipes at a crafting station, or learn a recipe scroll."
    />
    <template v-else-if="ready">
      <SegTabs v-model="mode" :tabs="MODES" label="Crafting mode" id-prefix="crafting-mode">
        <template #default="{ active }">
          <template v-if="active === 'craft'">
            <template v-if="noneKnown">
              <!-- Materials on hand stays reachable with no recipes: discovery works from what is held. -->
              <div v-if="mobile" class="empty-wrap">
                <RecipeList :selected-id="null" :runner="runner" mobile show-materials-disclosure />
              </div>
              <div v-else class="desk-grid empty-grid" :class="{ wide }">
                <div class="col list-col">
                  <RecipeList :selected-id="null" :runner="runner" :show-materials-disclosure="!wide" />
                </div>
                <div v-if="wide" class="col materials-col">
                  <MaterialsOnHand mode="column" :runner="runner" />
                </div>
              </div>
            </template>

            <div v-else-if="!mobile" class="desk-grid" :class="{ wide }">
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
                <RecipeDetail
                  v-if="selectedId !== null"
                  :recipe-id="selectedId"
                  :runner="runner"
                  :mobile="false"
                  @craft-start="onCraftStart"
                />
                <p v-else class="empty">{{ list ? list.emptyText : '' }}</p>
              </aside>
              <div v-if="wide" class="col materials-col">
                <MaterialsOnHand mode="column" :runner="runner" :used-template-ids="usedTemplateIds" show-discover />
              </div>
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
                  <RecipeDetail :recipe-id="selectedId" :runner="runner" mobile @craft-start="onCraftStart" />
                </div>
              </div>
            </template>
          </template>
          <template v-else>
            <p class="salvage-count">{{ salvageCountText(salvageCount) }}</p>
            <div v-if="!mobile" class="desk-grid" :class="{ wide }">
              <div class="col list-col">
                <SalvageList ref="salvageList" :selected-id="salvageSelectedId" @select="onSalvageSelect" />
              </div>
              <aside class="col detail-col">
                <!-- Keyed on the item: after a salvage the list auto-selects the next row, and the old
                     detail (with the Salvage button that started the call) goes away, so the card's
                     close never returns focus to a Salvage button for an item the player never picked.
                     Focus falls back to the selected row instead (WR-04, iteration 3). -->
                <SalvageDetail
                  v-if="salvageSelectedId !== null"
                  :key="String(salvageSelectedId)"
                  :instance-id="salvageSelectedId"
                  :runner="runner"
                  :mobile="false"
                />
              </aside>
              <div v-if="wide" class="col materials-col">
                <MaterialsOnHand mode="column" :runner="runner" />
              </div>
            </div>
            <template v-else>
              <div v-show="salvageView === 'list'" class="salvage-list-view">
                <SalvageList ref="salvageList" :selected-id="salvageSelectedId" mobile @select="onSalvageSelect" />
              </div>
              <div v-if="salvageView === 'detail' && salvageSelectedId !== null" class="salvage-detail-view">
                <button ref="backButton" type="button" class="btn btn-ghost back" @click="backToSalvageList">
                  <PhCaretLeft :size="20" aria-hidden="true" />
                  All gear
                </button>
                <div class="detail-slot">
                  <SalvageDetail :instance-id="salvageSelectedId" :runner="runner" mobile />
                </div>
              </div>
            </template>
          </template>
        </template>
      </SegTabs>

      <NoticeLine :rejection="runner.rejection.value" />
      <ResultCard
        :view="resultView"
        :mobile="mobile"
        :actions="resultActions"
        @close="result.close()"
        @action="onResultAction"
      />
    </template>
  </div>
</template>

<style scoped>
.crafting-screen {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}

.crafting-screen :deep(.panel) {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 8px;
  overflow: hidden;
}

.salvage-count {
  flex: none;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-400);
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
  grid-template-columns: 300px minmax(0, 1fr) 210px;
}

.desk-grid.empty-grid {
  grid-template-columns: minmax(0, 1fr);
}

.desk-grid.empty-grid.wide {
  grid-template-columns: minmax(0, 1fr) 210px;
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

.list-view,
.salvage-list-view {
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

.detail-view,
.salvage-detail-view {
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
