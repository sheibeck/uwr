<script setup lang="ts">
import { computed, inject, nextTick, ref, useTemplateRef, watch } from 'vue';
import { PhBackpack } from '@phosphor-icons/vue';
import { FRAME_KEY, GAME_KEY, createInertFrame, createInertGame } from '../game/context';
import { LEDGER_KEY, createInertLedger } from '../ledger/ledgerContext';
import { createActionRunner } from '../ledger/actionRunner';
import { itemCategory } from '../ledger/itemModel';
import NoticeLine from '../ledger/NoticeLine.vue';
import SegTabs from '../ledger/SegTabs.vue';
import EmptyState from '../screens/EmptyState.vue';
import BackpackGrid from './BackpackGrid.vue';
import EquippedSlots from './EquippedSlots.vue';
import Inspector from './Inspector.vue';
import type { BagFilterId } from './backpack';

// The Inventory screen (50-UI-SPEC "Inventory Contract" and "Layout Contract > Inventory"): the
// equipment slots and the backpack with the inspector, as three columns in the desktop drawer and as
// two tabs with an inspector dock in the mobile sheet. The selection is a local id; the subscribed
// rows drive every other change, and nothing here is optimistic. Registration in SCREENS is Plan 23.
const frame = inject(FRAME_KEY, createInertFrame());
const game = inject(GAME_KEY, createInertGame());
const ledger = inject(LEDGER_KEY, createInertLedger());

const mobile = computed(() => !frame.isDesktop.value);
const online = computed(() => game.connected.value && ledger.reducers.value !== null);
const runner = createActionRunner({ online });

const selectedId = ref<bigint | null>(null);
const filter = ref<BagFilterId>('all');
const tab = ref('backpack');
const TABS = [
  { id: 'backpack', label: 'Backpack' },
  { id: 'equipped', label: 'Equipped' },
];

const root = useTemplateRef<HTMLElement>('root');
const grid = useTemplateRef<InstanceType<typeof BackpackGrid>>('grid');

const hasCharacter = computed(() => game.character.value !== null);
const ready = computed(() => hasCharacter.value && ledger.itemsApplied.value);

// The slot a selected bag gear item would fill: the comparison target.
const compareSlot = computed<string | null>(() => {
  const id = selectedId.value;
  if (id === null) return null;
  const item = ledger.items.value.find((row) => row.id === id);
  if (!item || item.equippedSlot) return null;
  const template = ledger.templates.value.get(item.templateId);
  return template && itemCategory(template) === 'gear' ? template.slot : null;
});

function toggle(id: bigint): void {
  selectedId.value = selectedId.value === id ? null : id;
}

function focusLost(): boolean {
  const active = document.activeElement;
  return active === null || active === document.body || !active.isConnected;
}

// Focus after the selected item vanished (UI-SPEC focus table): the first tile, else the Backpack
// heading; on the mobile Equipped tab, where there is no grid, the selected tab. Never body.
function restoreFocusAfterRemoval(): void {
  if (!focusLost()) return;
  if (grid.value) {
    grid.value.focusFirst();
    return;
  }
  const tabButton = root.value?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
  tabButton?.focus();
}

watch(
  () => ledger.items.value,
  (rows) => {
    const id = selectedId.value;
    if (id === null || rows.some((row) => row.id === id)) return;
    selectedId.value = null;
    void nextTick(restoreFocusAfterRemoval);
  },
);

// Closing the dock deselects and returns focus to the tile (or slot card) that was selected.
function closeDock(): void {
  const pressed = root.value?.querySelector<HTMLElement>(
    'button.item-tile[aria-pressed="true"], button.slot-card[aria-pressed="true"]',
  );
  selectedId.value = null;
  void nextTick(() => {
    if (pressed && pressed.isConnected) pressed.focus();
  });
}
</script>

<template>
  <div ref="root" class="inventory-screen" :class="{ mobile }">
    <EmptyState
      v-if="!hasCharacter"
      :icon="PhBackpack"
      title="Your backpack is empty."
      body="Items you pick up, buy or craft land here."
    />
    <template v-else-if="ready">
      <div v-if="!mobile" class="desk-grid">
        <div class="col equipped-col">
          <EquippedSlots :selected-id="selectedId" :compare-slot="compareSlot" @select="toggle" />
        </div>
        <div class="col backpack-col">
          <BackpackGrid
            ref="grid"
            v-model:filter="filter"
            :selected-id="selectedId"
            @select="toggle"
          />
        </div>
        <aside class="col inspector-col">
          <Inspector :instance-id="selectedId" variant="card" :runner="runner" />
        </aside>
      </div>
      <template v-else>
        <SegTabs
          v-model="tab"
          :tabs="TABS"
          label="Inventory view"
          id-prefix="inventory"
        >
          <template #default="{ active }">
            <div class="panel-body">
              <BackpackGrid
                v-if="active === 'backpack'"
                ref="grid"
                v-model:filter="filter"
                :selected-id="selectedId"
                mobile
                @select="toggle"
              />
              <EquippedSlots
                v-else
                :selected-id="selectedId"
                :compare-slot="compareSlot"
                mobile
                @select="toggle"
              />
            </div>
          </template>
        </SegTabs>
        <div v-if="selectedId !== null" class="dock-slot">
          <Inspector :instance-id="selectedId" variant="dock" :runner="runner" @close="closeDock" />
        </div>
      </template>
      <NoticeLine :rejection="runner.rejection.value" />
    </template>
  </div>
</template>

<style scoped>
.inventory-screen {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.desk-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  grid-template-areas:
    'equipped inspector'
    'backpack inspector';
  grid-auto-rows: min-content;
  align-content: start;
  gap: 24px;
  overflow-y: auto;
}

.equipped-col {
  grid-area: equipped;
}

.backpack-col {
  grid-area: backpack;
}

.inspector-col {
  grid-area: inspector;
  align-self: start;
  position: sticky;
  top: 0;
}

@media (min-width: 1200px) {
  .desk-grid {
    grid-template-columns: 300px minmax(0, 1fr) 260px;
    grid-template-rows: minmax(0, 1fr);
    grid-template-areas: 'equipped backpack inspector';
    overflow-y: hidden;
  }

  .col {
    min-height: 0;
    overflow-y: auto;
  }
}

.panel-body {
  padding: 8px 0;
}

.dock-slot {
  flex: none;
  display: flex;
  flex-direction: column;
  padding-top: 8px;
}
</style>
