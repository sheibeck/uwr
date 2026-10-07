<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from 'vue';
import { PhDoorOpen, PhEye, PhHourglassMedium, PhLockSimple, PhSignpost } from '@phosphor-icons/vue';
import { CONSOLE_KEY, createInertConsole } from '../game/context';
import { UNKNOWN_PLACE } from '../session/frameView';
import { aboutMinutes, formatClock } from '../map/travelTimer';
import { dangerClass, dangerText, exitLabel } from './exits';
import type { ExitRow } from './exits';
import { useExits } from './useExits';

// The rail travel panel (51-UI-SPEC "Rail Travel Panel", Console 12a): the Here card with the place,
// its danger, the region timer chip and one expandable row per exit. A row click only expands it;
// travel happens on the inner Travel or Cross button, through the console (consoleApi.travel), whose
// refusals and arrival lines print in the feed. Place, region and terrain names are server text,
// rendered as text nodes and bound attributes only. The costs, blocks and times come from
// travelChecks through useExits (the same prediction the Map uses); the server re-checks every trip.
const consoleApi = inject(CONSOLE_KEY, createInertConsole());
const { character, connected, ready, here, rows, timer, pending, beginTravel } = useExits();

const clock = computed(() => formatClock(timer.value.secondsLeft));
const minutes = computed(() => `Region travel ready in ${aboutMinutes(timer.value.secondsLeft)}`);
const disabledAttr = computed(() => (connected.value ? undefined : 'true'));

// One open row at a time, by destination id.
const openId = ref<bigint | null>(null);
const card = ref<HTMLElement | null>(null);
const titleEl = ref<HTMLElement | null>(null);

const isOpen = (row: ExitRow): boolean => openId.value === row.locationId;
const rowId = (row: ExitRow): string => `exit-row-${row.locationId}`;
const panelId = (row: ExitRow): string => `exit-panel-${row.locationId}`;
const noteId = (row: ExitRow): string => `exit-note-${row.locationId}`;

function toggle(row: ExitRow): void {
  openId.value = isOpen(row) ? null : row.locationId;
}

function go(row: ExitRow): void {
  if (!beginTravel(row)) return;
  consoleApi.travel({ id: row.locationId, name: row.name });
}

function look(): void {
  if (!connected.value) return;
  consoleApi.look();
}

function examine(row: ExitRow): void {
  if (!connected.value) return;
  consoleApi.examine(row.name);
}

// After a move every row closes. Focus that was inside the card (a row that is about to re-render)
// moves to the card title; focus elsewhere is left alone. The check runs before the DOM updates.
watch(
  () => character.value?.locationId,
  () => {
    openId.value = null;
    const active = document.activeElement;
    const inside = card.value !== null && active !== null && card.value.contains(active);
    if (!inside) return;
    void nextTick(() => titleEl.value?.focus());
  },
  { flush: 'pre' },
);
</script>

<template>
  <section v-if="!character">
    <h6>Here</h6>
    <p class="empty">Your location appears here.</p>
  </section>

  <section v-else ref="card" class="card here-card" aria-label="Here">
    <div class="kicker-row">
      <span class="card-kicker">{{ here ? here.kicker : 'Here' }}</span>
      <span v-if="ready && timer.running" class="timer-chip" title="Region travel timer">
        <PhHourglassMedium :size="12" aria-hidden="true" />
        <span class="timer-clock" aria-hidden="true">{{ clock }}</span>
        <span class="sr-only">{{ minutes }}</span>
      </span>
    </div>

    <div class="title-row">
      <div
        ref="titleEl"
        class="card-title here-title"
        tabindex="-1"
        :title="here ? here.title : UNKNOWN_PLACE"
      >{{ here ? here.title : UNKNOWN_PLACE }}</div>
      <button
        v-if="here"
        type="button"
        class="btn btn-ghost btn-icon btn-eye"
        :aria-label="`Examine ${here.title}`"
        :title="`Examine ${here.title}`"
        :aria-disabled="disabledAttr"
        @click="look()"
      >
        <PhEye :size="16" aria-hidden="true" />
      </button>
    </div>

    <div v-if="here" class="sub-line">
      <component :is="here.terrain.icon" :size="12" aria-hidden="true" />
      <span class="sub-terrain">{{ here.terrain.word }}</span>
      <span class="sub-sep" aria-hidden="true"> · </span>
      <span class="sub-danger" :class="dangerClass(here.danger)">{{ dangerText(here.danger) }}</span>
    </div>

    <template v-if="ready">
      <ul v-if="rows.length > 0" class="exits">
        <li v-for="row in rows" :key="String(row.locationId)" class="exit" :class="{ open: isOpen(row) }">
          <div class="exit-line">
            <button
              :id="rowId(row)"
              type="button"
              class="exit-row"
              :aria-expanded="isOpen(row) ? 'true' : 'false'"
              :aria-controls="isOpen(row) ? panelId(row) : undefined"
              :aria-label="exitLabel(row)"
              :title="row.title !== '' ? row.title : undefined"
              @click="toggle(row)"
            >
              <span class="ring" :class="dangerClass(row.danger)">
                <component :is="row.terrain.icon" :size="12" aria-hidden="true" />
              </span>
              <span class="exit-label">
                <span class="exit-name">{{ row.name }}</span>
                <span v-if="row.crossing" class="exit-suffix">
                  <PhDoorOpen :size="12" aria-hidden="true" />
                  · {{ row.regionName }}
                </span>
              </span>
              <span v-if="row.locked" class="exit-right locked">
                <PhLockSimple :size="12" aria-hidden="true" />
                <span>{{ row.timeText }}</span>
              </span>
              <span v-else class="exit-right" :class="dangerClass(row.danger)">{{ row.rightText }}</span>
            </button>
            <button
              type="button"
              class="btn btn-ghost btn-icon btn-eye"
              :aria-label="`Examine ${row.name}`"
              :title="`Examine ${row.name}`"
              :aria-disabled="disabledAttr"
              @click="examine(row)"
            >
              <PhEye :size="16" aria-hidden="true" />
            </button>
          </div>

          <div v-if="isOpen(row)" :id="panelId(row)" class="exit-panel">
            <p :id="noteId(row)" class="note" :class="`tone-${row.note.tone}`">
              <template v-if="row.note.timeText !== null"
                ><span aria-hidden="true">{{ row.note.text }}{{ row.note.timeText }}</span
                ><span class="sr-only">{{ row.note.srText }}</span></template
              >
              <template v-else>{{ row.note.text }}</template>
            </p>
            <button
              type="button"
              class="btn btn-primary travel-button"
              :aria-label="row.button.ariaLabel"
              :aria-disabled="row.button.disabled ? 'true' : undefined"
              :aria-describedby="row.note.tone === 'wait' || row.note.tone === 'bad' ? noteId(row) : undefined"
              :aria-busy="pending ? 'true' : undefined"
              @click="go(row)"
            >
              <PhDoorOpen v-if="row.button.icon === 'door'" :size="14" aria-hidden="true" />
              <PhSignpost v-else :size="14" aria-hidden="true" />
              <span>{{ row.button.label }}</span>
              <span v-if="row.button.timeText !== null" class="button-clock" aria-hidden="true">{{
                row.button.timeText
              }}</span>
            </button>
          </div>
        </li>
      </ul>
      <p v-else class="empty">No known routes.</p>
    </template>
  </section>
</template>

<style scoped>
h6 {
  margin: 0 0 8px;
  color: var(--color-neutral-400);
}

.empty {
  margin: 0;
  font-size: 12px;
  color: var(--color-neutral-500);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.here-card {
  gap: 8px;
  min-width: 0;
  padding: 8px 16px;
}

.kicker-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

/* The kicker gives way before the timer chip. */
.card-kicker {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timer-chip {
  flex-shrink: 0;
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: var(--color-stamina);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-stamina) 50%, transparent);
}

.title-row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.here-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.here-title:focus-visible {
  outline-offset: 2px;
}

.btn-eye {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  color: var(--color-neutral-300);
}

.btn-eye[aria-disabled='true'] {
  opacity: 0.45;
  cursor: not-allowed;
}

.sub-line {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  font-size: 12px;
  color: var(--color-neutral-400);
}

.sub-line > svg {
  flex-shrink: 0;
}

.sub-terrain,
.sub-danger {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sub-sep {
  flex-shrink: 0;
  white-space: pre;
}

.exits {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.exit {
  border-radius: var(--radius-md);
}

.exit.open {
  background: var(--color-bg);
  box-shadow: inset 0 0 0 1px var(--color-accent-700);
}

.exit-line {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.exit-row {
  flex: 1;
  min-width: 0;
  min-height: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.exit-row:hover {
  background: var(--color-neutral-800);
}

.exit-row:active {
  background: color-mix(in srgb, var(--color-text) 14%, transparent);
}

.exit-row:focus-visible {
  outline-offset: -2px;
}

/* A 24px ring in the band colour (currentColor), the terrain icon in its own neutral colour. */
.ring {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--color-surface);
  box-shadow: inset 0 0 0 2px currentColor;
}

.ring > svg {
  color: var(--color-neutral-100);
}

/* The name and the region suffix ellipsize as one span. */
.exit-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.exit-suffix {
  margin-left: 4px;
  font-size: 10px;
  color: var(--color-accent-300);
}

.exit-suffix > svg {
  vertical-align: text-bottom;
  color: var(--color-accent-300);
}

.exit-right {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.exit-right.locked {
  color: var(--color-neutral-500);
}

.lv-easy,
.lv-safe {
  color: var(--color-con-light-green);
}

.lv-even {
  color: var(--color-con-blue);
}

.lv-tough {
  color: var(--color-con-yellow);
}

.lv-deadly {
  color: var(--color-con-red);
}

.lv-unknown {
  color: var(--color-neutral-500);
}

.exit-panel {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px 8px 32px;
}

.note {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.tone-neutral {
  color: var(--color-neutral-400);
}

.tone-accent {
  color: var(--color-accent-200);
}

.tone-wait {
  color: var(--color-stamina);
}

.tone-bad {
  color: var(--color-con-red);
}

.travel-button {
  flex-shrink: 0;
  min-height: 28px;
  padding: 0 8px;
  font-size: 12px;
  font-weight: 500;
}

.button-clock {
  font-variant-numeric: tabular-nums;
}

.travel-button[aria-disabled='true'] {
  opacity: 0.45;
  cursor: not-allowed;
}

@media (max-width: 899px) {
  .exit-row {
    min-height: 44px;
  }

  .btn-eye {
    width: 44px;
    height: 44px;
  }

  .travel-button {
    min-height: 44px;
  }
}
</style>
