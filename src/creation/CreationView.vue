<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import PreFrameHeader from '../session/PreFrameHeader.vue';
import NoticeBars from '../frame/NoticeBars.vue';
import Sheet from '../frame/Sheet.vue';
import { useBreakpoint } from '../frame/useBreakpoint';
import { useKeyboardOpen } from '../frame/useKeyboardOpen';
import { parseAbilityCards } from './abilityCards';
import ChoiceBlock from './ChoiceBlock.vue';
import { controlsFor } from './creationControls';
import { CREATION_KEY, createInertCreation } from './creationContext';
import CreationComposer from './CreationComposer.vue';
import CreationFeed from './CreationFeed.vue';
import CreationSheet from './CreationSheet.vue';
import { deriveCreationStep } from './creationSteps';
import type { StepPosition } from './creationSteps';
import { selectRaceCards } from './raceCards';
import { buildSheet } from './sheetModel';
import StepBar from './StepBar.vue';

// The creation screen (49-UI-SPEC "Layout Contract"): the one full-viewport screen shown instead
// of the frame while a player has no character or an unplaced one. It composes the step bar, the
// interview feed with its choice block, the composer and the live sheet over the injected hub.
// It holds no optimistic state: everything shown is derived from the hub's server rows.
const props = defineProps<{ reconnecting: boolean; nextRetryAt: number | null; versionPrompt: boolean }>();
const emit = defineEmits<{ logout: []; reload: [] }>();

const creation = inject(CREATION_KEY, createInertCreation());
const { isDesktop } = useBreakpoint();

let release: (() => void) | null = null;
onMounted(() => {
  release = creation.mount();
});
onBeforeUnmount(() => {
  if (release !== null) release();
  release = null;
});

// The last position derived from a known server step, so an unknown step keeps the bar in place.
const lastKnown = ref<StepPosition | null>(null);
const stepView = computed(() =>
  deriveCreationStep({
    step: creation.effectiveStep.value,
    previousStep: creation.state.value?.previousStep ?? null,
    regionFailed: creation.regionFailed.value,
    lastKnown: lastKnown.value,
  }),
);
watch(
  stepView,
  (current) => {
    if (current.known) lastKnown.value = current.position;
  },
  { immediate: true },
);

const controls = computed(() =>
  controlsFor({
    step: creation.effectiveStep.value,
    known: stepView.value.known,
    regionFailed: creation.regionFailed.value,
    startFailed: creation.startFailed.value,
    connected: creation.connected.value,
  }),
);
const inert = computed(() => creation.sending.value || controls.value.disabled);

const raceCards = computed(() => selectRaceCards(creation.races.value, creation.racesApplied.value));
const abilityCards = computed(() => parseAbilityCards(creation.state.value?.abilities));
const sheetModel = computed(() => buildSheet(creation.state.value));

function choose(text: string): void {
  void creation.send(text);
}

// Mobile: the Sheet chip opens the ledger over the feed and composer region; the keyboard
// compacts the step block to its segments.
const inputFocused = ref(false);
const { keyboardOpen } = useKeyboardOpen(inputFocused);
const sheetOpen = ref(false);
const stepBar = ref<InstanceType<typeof StepBar> | null>(null);

function onFocusChange(focused: boolean): void {
  inputFocused.value = focused;
}

function openSheet(): void {
  sheetOpen.value = true;
}

async function closeSheet(): Promise<void> {
  sheetOpen.value = false;
  await nextTick();
  stepBar.value?.focusChip();
}

watch(isDesktop, (desktop) => {
  if (desktop) sheetOpen.value = false;
});
</script>

<template>
  <div class="creation-view session-ground">
    <PreFrameHeader title="New character" @logout="emit('logout')" />
    <NoticeBars
      :reconnecting="props.reconnecting"
      :next-retry-at="props.nextRetryAt"
      :version-prompt="props.versionPrompt"
      @reload="emit('reload')"
    />
    <div v-if="isDesktop" class="body">
      <div class="center">
        <StepBar ref="stepBar" :view="stepView" :desktop="true" :keyboard-open="false" />
        <CreationFeed :entries="creation.feed.entries.value" :llm-jobs="creation.llmJobs.value" :desktop="true">
          <ChoiceBlock
            v-if="controls.choice"
            :kind="controls.choice"
            :race-cards="raceCards"
            :ability-cards="abilityCards"
            :inert="inert"
            :desktop="true"
            @choose="choose"
          />
        </CreationFeed>
        <CreationComposer
          :controls="controls"
          :inert="inert"
          :desktop="true"
          :send="creation.send"
          :start="creation.retryStart"
          @focus-change="onFocusChange"
        />
      </div>
      <CreationSheet :model="sheetModel" variant="rail" />
    </div>
    <template v-else>
      <StepBar
        ref="stepBar"
        :view="stepView"
        :desktop="false"
        :keyboard-open="keyboardOpen"
        @open-sheet="openSheet"
      />
      <div v-show="!sheetOpen" class="region">
        <CreationFeed :entries="creation.feed.entries.value" :llm-jobs="creation.llmJobs.value" :desktop="false">
          <ChoiceBlock
            v-if="controls.choice"
            :kind="controls.choice"
            :race-cards="raceCards"
            :ability-cards="abilityCards"
            :inert="inert"
            :desktop="false"
            @choose="choose"
          />
        </CreationFeed>
        <CreationComposer
          :controls="controls"
          :inert="inert"
          :desktop="false"
          :send="creation.send"
          :start="creation.retryStart"
          @focus-change="onFocusChange"
        />
      </div>
      <Sheet v-if="sheetOpen" title="The ledger so far" @close="closeSheet">
        <CreationSheet :model="sheetModel" variant="sheet" />
      </Sheet>
    </template>
  </div>
</template>

<style scoped>
.creation-view {
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.center {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.region {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
