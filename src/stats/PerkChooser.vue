<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { GAME_KEY, createInertGame } from '../game/context';
import { LEDGER_KEY, createInertLedger } from '../ledger/ledgerContext';
import type { ActionRunner } from '../ledger/actionRunner';
import { perkOptionTags } from './statsModel';
import type { PendingChoice } from './statsModel';

// The inline renown perk chooser (50-UI-SPEC "Perk chooser", assumption A31): pick an option, then
// Take it. The choice is permanent, so Take stays inert until an option is chosen and the note sits
// above it. Perk names and descriptions are server (LLM) text and only reach the page as text nodes.
// Esc closes only the chooser: it is caught in the capture phase and prevented, so the drawer's own
// Esc (it checks defaultPrevented) stays shut.
const props = withDefaults(
  defineProps<{
    choice: PendingChoice;
    runner: ActionRunner;
    mobile?: boolean;
  }>(),
  { mobile: false },
);
const emit = defineEmits<{ close: []; taken: [] }>();

const game = inject(GAME_KEY, createInertGame());
const ledger = inject(LEDGER_KEY, createInertLedger());

const chosenId = ref<bigint | null>(null);

const chosen = computed(() => props.choice.options.find((option) => option.id === chosenId.value) ?? null);
const offline = computed(() => !game.connected.value || ledger.reducers.value === null);
const pending = computed(() => props.runner.isPending('perk'));
const takeInert = computed(() => chosen.value === null || offline.value || pending.value);

// A different pending set (the next rank after a take) starts with no choice.
watch(
  () => props.choice.options,
  (options) => {
    if (chosenId.value !== null && !options.some((option) => option.id === chosenId.value)) {
      chosenId.value = null;
    }
  },
);

function pick(id: bigint): void {
  chosenId.value = id;
}

async function take(): Promise<void> {
  const option = chosen.value;
  const reducers = ledger.reducers.value;
  const character = game.character.value;
  if (!option || !reducers || !character || takeInert.value) return;
  const characterId = character.id;
  const perkId = option.id;
  const ok = await props.runner.run('perk', () => reducers.chooseRenownPerk({ characterId, perkId }));
  // A server refusal (fail(): no pending choice, invalid perk) resolves the call too, so a resolved
  // call is not proof of a take. The SDK applies the transaction's row updates before it resolves
  // the promise, so the chosen pending row is already gone after a take. On a refusal it is still
  // there: the chooser stays open and the notice line shows the server's text.
  if (ok && !ledger.pendingPerks.value.some((row) => row.id === perkId)) emit('taken');
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  emit('close');
}

onMounted(() => document.addEventListener('keydown', onDocumentKeydown, true));
onBeforeUnmount(() => document.removeEventListener('keydown', onDocumentKeydown, true));
</script>

<template>
  <div class="perk-chooser" :class="{ mobile: props.mobile }">
    <h6>Rank {{ props.choice.rank }} perk</h6>
    <div class="options">
      <button
        v-for="option in props.choice.options"
        :key="option.id.toString()"
        type="button"
        class="option"
        :class="{ selected: option.id === chosenId }"
        :aria-pressed="option.id === chosenId ? 'true' : 'false'"
        @click="pick(option.id)"
      >
        <span class="option-name">{{ option.name }}</span>
        <span class="option-description">{{ option.description }}</span>
        <span class="option-tags">
          <span v-for="tag in perkOptionTags(option)" :key="tag" class="tag tag-neutral">{{ tag }}</span>
        </span>
      </button>
    </div>
    <p class="permanent">Your choice is permanent.</p>
    <div class="actions">
      <button
        type="button"
        class="btn btn-primary take"
        :aria-disabled="takeInert ? 'true' : undefined"
        @click="take"
      >
        {{ chosen ? `Take ${chosen.name}` : 'Take' }}
      </button>
      <button type="button" class="btn btn-ghost not-now" @click="emit('close')">Not now</button>
    </div>
  </div>
</template>

<style scoped>
.perk-chooser {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

h6 {
  margin: 0;
  color: var(--color-neutral-400);
}

.options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.option {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  padding: 16px;
  border: 0;
  border-radius: var(--radius-md);
  background-color: var(--color-bg);
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.mobile .option {
  min-height: 44px;
}

.option:hover {
  background-image: linear-gradient(
    color-mix(in srgb, var(--color-text) 7%, transparent),
    color-mix(in srgb, var(--color-text) 7%, transparent)
  );
}

.option:active {
  background-image: linear-gradient(
    color-mix(in srgb, var(--color-text) 14%, transparent),
    color-mix(in srgb, var(--color-text) 14%, transparent)
  );
}

.option.selected {
  box-shadow: inset 0 0 0 1px var(--color-accent);
}

.option:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.option-name {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.option-description {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  overflow: hidden;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-300);
  overflow-wrap: anywhere;
}

.option-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.permanent {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-400);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.take,
.not-now {
  min-height: 32px;
}

.mobile .take,
.mobile .not-now {
  min-height: 44px;
}

.take[aria-disabled='true'] {
  opacity: 0.45;
  cursor: default;
}
</style>
