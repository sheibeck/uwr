<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { PhArrowFatUp, PhUserCircle } from '@phosphor-icons/vue';
import { FRAME_KEY, GAME_KEY, createInertFrame, createInertGame } from '../game/context';
import { LEDGER_KEY, createInertLedger } from '../ledger/ledgerContext';
import { createActionRunner } from '../ledger/actionRunner';
import NoticeLine from '../ledger/NoticeLine.vue';
import SegTabs from '../ledger/SegTabs.vue';
import EmptyState from '../screens/EmptyState.vue';
import DerivedTable from './DerivedTable.vue';
import FactionList from './FactionList.vue';
import RenownPanel from './RenownPanel.vue';
import StatBars from './StatBars.vue';
import { derivedRows, factionRows, statBars, statsMobileLine } from './statsModel';

// The Stats screen (50-UI-SPEC "Stats Contract" and "Layout Contract > Stats"): base stat bars with
// the gear segment, Renown with the perk chooser, the Derived table and Faction standing, as columns
// in the desktop drawer and as four tabs under an identity row in the mobile sheet. Registration in
// SCREENS is Plan 23. The screen only draws what statsModel derives; faction and perk names are
// server text and only reach the page as text nodes.
const frame = inject(FRAME_KEY, createInertFrame());
const game = inject(GAME_KEY, createInertGame());
const ledger = inject(LEDGER_KEY, createInertLedger());

const mobile = computed(() => !frame.isDesktop.value);
const online = computed(() => game.connected.value && ledger.reducers.value !== null);
const runner = createActionRunner({ online });

const DERIVED_CAPTION = 'Derived stats';
const tab = ref('stats');
const TABS = [
  { id: 'stats', label: 'Stats' },
  { id: 'derived', label: 'Derived' },
  { id: 'renown', label: 'Renown' },
  { id: 'factions', label: 'Factions' },
];

const character = computed(() => game.character.value);
const bars = computed(() => {
  const c = character.value;
  return c ? statBars(c, ledger.items.value, ledger.templates.value, ledger.affixes.value).bars : [];
});
const derived = computed(() => (character.value ? derivedRows(character.value) : []));
const factions = computed(() =>
  factionRows(game.factionStandings.value, game.factions.value, character.value?.id ?? null),
);
const initial = computed(() => (character.value ? Array.from(character.value.name)[0] ?? '' : ''));
const mobileLine = computed(() => (character.value ? statsMobileLine(character.value) : ''));
const levelUp = computed(() => (character.value?.pendingLevels ?? 0n) > 0n);
</script>

<template>
  <div class="stats-screen" :class="{ mobile }">
    <EmptyState
      v-if="!character"
      :icon="PhUserCircle"
      title="No stats to show yet."
      body="Choose a character to see its numbers."
    />
    <template v-else>
      <div v-if="!mobile" class="desk-grid">
        <div class="col stats-col">
          <h6>Base stats<span class="heading-sub"> · base + gear</span></h6>
          <StatBars :bars="bars" />
          <hr class="hr" />
          <RenownPanel :runner="runner" />
        </div>
        <div class="col derived-col">
          <h6>Derived</h6>
          <DerivedTable :rows="derived" :caption="DERIVED_CAPTION" />
        </div>
        <div class="col factions-col">
          <h6>Faction standing</h6>
          <FactionList :rows="factions" />
        </div>
      </div>
      <template v-else>
        <div class="identity">
          <span class="avatar" aria-hidden="true">{{ initial }}</span>
          <span class="who">
            <span class="who-name">{{ character.name }}</span>
            <span class="who-line">{{ mobileLine }}</span>
          </span>
          <span v-if="levelUp" class="tag tag-outline level-up">
            <PhArrowFatUp :size="12" aria-hidden="true" />
            Level up available
          </span>
        </div>
        <SegTabs v-model="tab" :tabs="TABS" label="Stats view" id-prefix="stats">
          <template #default="{ active }">
            <div class="panel-body">
              <StatBars v-if="active === 'stats'" :bars="bars" mobile />
              <DerivedTable v-else-if="active === 'derived'" :rows="derived" :caption="DERIVED_CAPTION" />
              <RenownPanel v-else-if="active === 'renown'" :runner="runner" mobile />
              <FactionList v-else :rows="factions" />
            </div>
          </template>
        </SegTabs>
      </template>
      <NoticeLine :rejection="runner.rejection.value" />
    </template>
  </div>
</template>

<style scoped>
.stats-screen {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

h6 {
  margin: 0;
  color: var(--color-neutral-400);
}

.heading-sub {
  text-transform: none;
  letter-spacing: 0;
  color: var(--color-neutral-500);
}

.hr {
  width: 100%;
  margin: 8px 0;
}

.desk-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  grid-template-areas:
    'stats derived'
    'stats factions';
  grid-auto-rows: min-content;
  align-content: start;
  gap: 24px;
  overflow-y: auto;
}

.col {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.stats-col {
  grid-area: stats;
}

.derived-col {
  grid-area: derived;
}

.factions-col {
  grid-area: factions;
}

@media (min-width: 1200px) {
  .desk-grid {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 280px;
    grid-template-rows: minmax(0, 1fr);
    grid-template-areas: 'stats derived factions';
    overflow-y: hidden;
  }

  .col {
    min-height: 0;
    overflow-y: auto;
  }
}

.identity {
  flex: none;
  display: flex;
  align-items: center;
  gap: 16px;
  padding-bottom: 8px;
}

.avatar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  background: var(--color-accent-900);
  box-shadow: inset 0 0 0 1px var(--color-accent-700);
  color: var(--color-accent-300);
  font-size: 14px;
  font-weight: 500;
}

.who {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.who-name {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.who-line {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-400);
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.level-up {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.panel-body {
  padding: 8px 0;
}
</style>
