<script setup lang="ts">
import { computed, inject, nextTick, ref, useTemplateRef } from 'vue';
import { GAME_KEY, createInertGame } from '../game/context';
import { LEDGER_KEY, createInertLedger } from '../ledger/ledgerContext';
import type { ActionRunner } from '../ledger/actionRunner';
import PerkChooser from './PerkChooser.vue';
import { ownedPerkNames, pendingChoice, renownView } from './statsModel';

// Renown (50-UI-SPEC "Renown" and "Perk chooser"): the rank heading, the progress bar, the points
// line, the owned perks as tags and, only while a perk choice is pending, the button that opens the
// inline chooser. Perk names are server (LLM) text and only reach the page as text nodes.
const props = withDefaults(defineProps<{ runner: ActionRunner; mobile?: boolean }>(), { mobile: false });

const game = inject(GAME_KEY, createInertGame());
const ledger = inject(LEDGER_KEY, createInertLedger());

const view = computed(() => renownView(game.renown.value[0] ?? null));
const perks = computed(() => ownedPerkNames(game.renownPerks.value, game.abilities.value));
const choice = computed(() => pendingChoice(ledger.pendingPerks.value));
const fill = computed(() => `${Math.round(Math.max(0, Math.min(1, view.value.fraction)) * 100)}%`);

const chooserOpen = ref(false);
const perkHeading = useTemplateRef<HTMLElement>('perkHeading');
const chooseButton = useTemplateRef<HTMLElement>('chooseButton');

function onTaken(): void {
  chooserOpen.value = false;
  void nextTick(() => perkHeading.value?.focus());
}

function onClose(): void {
  chooserOpen.value = false;
  void nextTick(() => chooseButton.value?.focus());
}
</script>

<template>
  <section class="renown" aria-label="Renown">
    <h6 class="renown-heading">{{ view.heading }}</h6>
    <div
      class="bar"
      role="progressbar"
      aria-label="Renown to next rank"
      :aria-valuenow="view.valueNow"
      :aria-valuemin="view.valueMin"
      :aria-valuemax="view.valueMax"
    >
      <div class="fill" :style="{ width: fill }"></div>
    </div>
    <p class="points">{{ view.text }}</p>

    <h6 ref="perkHeading" class="perk-heading sr-only" tabindex="-1">Perks</h6>
    <div class="perk-row">
      <span v-for="name in perks" :key="name" class="tag tag-accent perk-tag">{{ name }}</span>
      <span v-if="perks.length === 0" class="no-perks">No perks yet.</span>
      <button
        v-if="choice"
        ref="chooseButton"
        type="button"
        class="tag tag-outline choose-button"
        :aria-expanded="chooserOpen ? 'true' : 'false'"
        @click="chooserOpen = !chooserOpen"
      >
        Choose rank {{ choice.rank }} perk
      </button>
    </div>

    <PerkChooser
      v-if="choice && chooserOpen"
      :choice="choice"
      :runner="props.runner"
      :mobile="props.mobile"
      @close="onClose"
      @taken="onTaken"
    />
  </section>
</template>

<style scoped>
.renown {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-variant-numeric: tabular-nums;
}

h6 {
  margin: 0;
  color: var(--color-neutral-400);
}

.bar {
  height: 4px;
  border-radius: var(--radius-sm);
  background: var(--color-neutral-900);
  overflow: hidden;
}

.fill {
  height: 100%;
  background: var(--color-accent);
}

.points {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-500);
}

.perk-heading:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.perk-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.perk-tag {
  overflow-wrap: anywhere;
}

.no-perks {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-500);
}

.choose-button {
  position: relative;
  padding: 4px 8px;
  font-family: inherit;
  cursor: pointer;
}

.choose-button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
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
