<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from 'vue';
import { PhDoorOpen, PhLockSimple, PhSignpost } from '@phosphor-icons/vue';
import { CONSOLE_KEY, createInertConsole } from '../game/context';
import { aboutMinutes } from '../map/travelTimer';
import { dangerClass, dangerText, exitLabel } from './exits';
import type { ExitRow } from './exits';
import { useExits } from './useExits';

// The mobile exit chip strip and its open card (51-UI-SPEC "Mobile (Story screen, 12a A.6)"), under
// the location line on the Story screen. One chip per exit; a chip opens one card at a time with the
// place, its terrain and danger, the crossing or blocked line and a full-width Travel or Cross
// button. Travel goes through the console (consoleApi.travel); the server's arrival lines are the
// feed. The costs, blocks and times come from travelChecks through useExits. The frame hides this
// in combat, with a sheet open and with the software keyboard open. Names are server text, rendered
// as text nodes only.
const consoleApi = inject(CONSOLE_KEY, createInertConsole());
const { character, ready, here, rows, beginTravel } = useExits();

const openId = ref<bigint | null>(null);
const root = ref<HTMLElement | null>(null);
const openRow = computed<ExitRow | null>(() => rows.value.find((r) => r.locationId === openId.value) ?? null);

const chipId = (row: ExitRow): string => `exit-chip-${row.locationId}`;
const cardId = (row: ExitRow): string => `exit-card-${row.locationId}`;
const statusId = (row: ExitRow): string => `exit-status-${row.locationId}`;

function toggle(row: ExitRow): void {
  openId.value = openId.value === row.locationId ? null : row.locationId;
}

// After a move the place changes and every card closes. Focus that was inside the strip or the card
// (the Travel button about to unmount) moves to the first chip of the new place, or to the strip
// itself when the new place has none, so it never falls to the body (review WR-03, the HereCard
// rule). Focus elsewhere is left alone. The check runs before the DOM updates.
watch(
  () => character.value?.locationId,
  () => {
    openId.value = null;
    const active = document.activeElement;
    const inside = root.value !== null && active !== null && root.value.contains(active);
    if (!inside) return;
    void nextTick(() => {
      const target = root.value?.querySelector<HTMLElement>('button.chip') ?? root.value;
      target?.focus();
    });
  },
  { flush: 'pre' },
);

// The region you stand in, for 'Moving within {Region} is fine.'
const hereRegion = computed(() => here.value?.regionName ?? 'this region');

// The clock is aria-hidden; the blocked button's accessible name says whole minutes, from the
// server seconds the row carries (never re-parsed from the m:ss text).
function buttonAria(row: ExitRow): string {
  if (row.button.secondsLeft === null) return row.button.ariaLabel;
  return `Region travel locked for ${aboutMinutes(row.button.secondsLeft)}`;
}

function terrainLine(row: ExitRow): string {
  return `${row.terrain.word}${row.heardOf ? ' · heard of' : ''} · ${dangerText(row.danger)}`;
}

// The status line: the crossing, the cost, or why the trip is blocked; ' · n following' when you lead.
function statusText(row: ExitRow): string {
  const following = row.following > 0 ? ` · ${row.following} following` : '';
  if (row.crossing) return `Crosses into ${row.regionName} · starts the region travel timer${following}`;
  return `${row.costText}${following}`;
}

function go(row: ExitRow): void {
  if (!beginTravel(row)) return;
  consoleApi.travel({ id: row.locationId, name: row.name });
}
</script>

<template>
  <div ref="root" class="exit-chips" tabindex="-1">
    <template v-if="ready && rows.length > 0">
      <ul class="strip" aria-label="Exits">
        <li v-for="row in rows" :key="String(row.locationId)">
          <button
            :id="chipId(row)"
            type="button"
            class="chip"
            :class="{ open: openId === row.locationId }"
            :aria-expanded="openId === row.locationId ? 'true' : 'false'"
            :aria-controls="openId === row.locationId ? cardId(row) : undefined"
            :aria-label="exitLabel(row)"
            @click="toggle(row)"
          >
            <span class="ring" :class="dangerClass(row.danger)">
              <component :is="row.terrain.icon" :size="12" aria-hidden="true" />
            </span>
            <span class="chip-text">
              <span class="chip-name">
                <span class="chip-name-text">{{ row.name }}</span>
                <PhDoorOpen v-if="row.crossing" class="chip-door" :size="12" aria-hidden="true" />
              </span>
              <span v-if="row.locked" class="chip-line locked">
                <PhLockSimple :size="12" aria-hidden="true" />
                <span>{{ row.timeText }}</span>
              </span>
              <span v-else class="chip-line" :class="dangerClass(row.danger)">{{ dangerText(row.danger) }}</span>
            </span>
          </button>
        </li>
      </ul>

      <div v-if="openRow" :id="cardId(openRow)" class="exit-card">
        <div class="card-name">{{ openRow.name }}</div>
        <div class="card-terrain">{{ terrainLine(openRow) }}</div>
        <div
          v-if="openRow.note.timeText !== null"
          :id="statusId(openRow)"
          class="card-status tone-wait"
        >
          <span aria-hidden="true"
            >Region travel ready in {{ openRow.note.timeText }}. Moving within {{ hereRegion }} is fine.</span
          >
          <span class="sr-only">{{ openRow.note.srText }}. Moving within {{ hereRegion }} is fine.</span>
        </div>
        <div
          v-else
          :id="statusId(openRow)"
          class="card-status"
          :class="openRow.note.tone === 'bad' ? 'tone-bad' : openRow.crossing ? 'tone-accent' : 'tone-neutral'"
        >
          {{ openRow.note.tone === 'bad' ? openRow.note.text : statusText(openRow) }}
        </div>
        <button
          type="button"
          class="btn btn-primary card-button"
          :aria-label="buttonAria(openRow)"
          :aria-disabled="openRow.button.disabled ? 'true' : undefined"
          :aria-describedby="openRow.note.tone === 'wait' || openRow.note.tone === 'bad' ? statusId(openRow) : undefined"
          @click="go(openRow)"
        >
          <PhDoorOpen v-if="openRow.button.icon === 'door'" :size="14" aria-hidden="true" />
          <PhSignpost v-else :size="14" aria-hidden="true" />
          <span v-if="openRow.button.timeText !== null"
            >Region travel in <span aria-hidden="true">{{ openRow.button.timeText }}</span></span
          >
          <span v-else>{{ openRow.button.ariaLabel }}</span>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.strip {
  list-style: none;
  margin: 0;
  padding: 4px 16px 8px;
  display: flex;
  gap: 8px;
  overflow-x: auto;
}

.strip > li {
  flex: none;
}

.chip {
  flex: none;
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px 0 4px;
  border: 0;
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: inset 0 0 0 1px var(--color-neutral-800);
  color: var(--color-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.chip.open {
  box-shadow: inset 0 0 0 1px var(--color-accent);
}

.chip:hover {
  background: color-mix(in srgb, var(--color-text) 7%, var(--color-surface));
}

.chip:active {
  background: color-mix(in srgb, var(--color-text) 14%, var(--color-surface));
}

.chip:focus-visible {
  outline-offset: -2px;
}

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

/* Line 1 ellipsizes at 144px with the full name in the chip's accessible name. */
.chip-text {
  min-width: 0;
  max-width: 144px;
  display: flex;
  flex-direction: column;
}

.chip-name {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  font-size: 12px;
}

.chip-name-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip-door {
  flex-shrink: 0;
  color: var(--color-accent);
}

.chip-line {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.chip-line.locked {
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

.exit-card {
  margin: 0 16px 8px;
  padding: 8px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.card-name {
  font-size: 14px;
  font-weight: 500;
  overflow-wrap: anywhere;
}

.card-terrain,
.card-status {
  font-size: 12px;
  overflow-wrap: anywhere;
}

.card-terrain,
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

.card-button {
  width: 100%;
  min-height: 44px;
  font-size: 14px;
  font-weight: 500;
}

.card-button[aria-disabled='true'] {
  opacity: 0.45;
  cursor: not-allowed;
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
