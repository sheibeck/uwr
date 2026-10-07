<script setup lang="ts">
import { nextTick, onMounted, ref, useTemplateRef } from 'vue';
import { PhLockSimple, PhMapPin } from '@phosphor-icons/vue';
import type { RegionChip } from './regionChips';

// The mobile Regions listbox (51-UI-SPEC "Region chips and the Region travel pill", mobile): the
// region chips as an inline list of 44px options with the same states, locks and times as the desktop
// chips. It decides nothing: the chips, the lock flag and the time text come from the caller, which
// owns the rules (regionChips and the travel timer). Choosing an option emits the region id and the
// caller shows it; Escape emits close and the caller returns focus to its Regions button.
//
// Arrow keys, Home and End move focus between options (roving tabindex), Enter and Space choose.
// While your own timer runs every region but yours shows the lock and the server's time left; the
// option stays operable because the lock limits travel, not viewing. Names are text nodes.
const props = defineProps<{
  chips: RegionChip[];
  /** Your own region travel timer is running. */
  locked: boolean;
  /** The time left as 'm:ss'. */
  timeText: string;
  /** The time left as 'about {n} minutes', for the screen reader. */
  aboutText: string;
}>();

const emit = defineEmits<{ choose: [regionId: bigint]; close: [] }>();

const list = useTemplateRef<HTMLElement>('list');
const focusedIndex = ref(Math.max(0, props.chips.findIndex((chip) => chip.isShown)));

function lockedChip(chip: RegionChip): boolean {
  return props.locked && !chip.isYours;
}

function ariaLabel(chip: RegionChip): string {
  let label = `${chip.name}, ${chip.levelLabel}`;
  if (chip.isYours && !chip.isShown) label += ', you are here';
  if (lockedChip(chip)) label += `, region travel locked for ${props.aboutText}`;
  return label;
}

function focusOption(index: number): void {
  focusedIndex.value = index;
  void nextTick(() => {
    list.value?.querySelectorAll<HTMLElement>('[role="option"]')[index]?.focus();
  });
}

function onKeydown(event: KeyboardEvent, index: number): void {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const last = props.chips.length - 1;
  if (event.key === 'Escape') {
    // Handled here: the sheet must stay open, so the event is marked before it reaches the document.
    event.preventDefault();
    emit('close');
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    emit('choose', props.chips[index].regionId);
    return;
  }
  let next = -1;
  if (event.key === 'ArrowDown') next = Math.min(index + 1, last);
  else if (event.key === 'ArrowUp') next = Math.max(index - 1, 0);
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = last;
  if (next === -1) return;
  event.preventDefault();
  focusOption(next);
}

onMounted(() => {
  list.value?.querySelectorAll<HTMLElement>('[role="option"]')[focusedIndex.value]?.focus();
});
</script>

<template>
  <ul ref="list" class="regions-listbox" role="listbox" aria-label="Regions">
    <li
      v-for="(chip, index) in props.chips"
      :key="String(chip.regionId)"
      class="region-option"
      :class="{ shown: chip.isShown, locked: lockedChip(chip) }"
      role="option"
      :aria-selected="chip.isShown ? 'true' : 'false'"
      :aria-label="ariaLabel(chip)"
      :tabindex="index === focusedIndex ? 0 : -1"
      data-region-option
      @click="emit('choose', chip.regionId)"
      @keydown="onKeydown($event, index)"
      @focus="focusedIndex = index"
    >
      <PhMapPin v-if="chip.isYours && !chip.isShown" class="option-icon" :size="12" aria-hidden="true" />
      <PhLockSimple v-if="lockedChip(chip)" class="option-icon" :size="12" aria-hidden="true" />
      <span class="option-name">{{ chip.name }}</span>
      <span v-if="lockedChip(chip)" class="option-clock" aria-hidden="true">{{ props.timeText }}</span>
      <span v-else class="option-level">{{ chip.levelLabel }}</span>
    </li>
  </ul>
</template>

<style scoped>
.regions-listbox {
  flex: none;
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.region-option {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  min-height: 44px;
  gap: 8px;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  background: var(--color-bg);
  color: var(--color-neutral-200);
  cursor: pointer;
}

.region-option.shown {
  color: var(--color-accent);
  box-shadow: inset 0 0 0 1px var(--color-accent);
}

.region-option.locked {
  color: var(--color-neutral-500);
}

.region-option:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.option-icon {
  flex: none;
}

.option-name {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.option-level,
.option-clock {
  flex: none;
}

.option-level {
  color: var(--color-neutral-300);
}

.region-option.shown .option-level {
  color: var(--color-accent-200);
}

.option-clock {
  color: var(--color-neutral-500);
}
</style>
