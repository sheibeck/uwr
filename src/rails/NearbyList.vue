<script setup lang="ts">
import { computed, inject } from 'vue';
import {
  PhChatCircle,
  PhCircleDashed,
  PhCube,
  PhStorefront,
  PhUser,
  PhUserCircle,
  PhUserPlus,
} from '@phosphor-icons/vue';
import type { Component } from 'vue';
import { CONSOLE_KEY, GAME_KEY, createInertConsole, createInertGame } from '../game/context';
import { nearbyRows } from './nearby';
import type { NearbyKind, NearbyRow } from './nearby';

// Nearby rows with one-click actions (47-UI-SPEC "Nearby", CON-04, CON-02). Names are server or
// player text, rendered as text nodes only. No table lists examinable objects at a location
// (research Q3, UI-SPEC A7), so `objects` stays empty and no object rows appear today.
const game = inject(GAME_KEY, createInertGame());
const consoleApi = inject(CONSOLE_KEY, createInertConsole());

const connected = computed(() => game.connected.value);

const rows = computed(() =>
  nearbyRows({
    npcs: game.npcsHere.value,
    nodes: game.nodesHere.value,
    players: game.playersHere.value,
    objects: [],
    selfId: game.characterId.value,
  }),
);

const ICONS: Record<NearbyKind, Component> = {
  npc: PhUser,
  object: PhCircleDashed,
  node: PhCube,
  player: PhUserCircle,
};

function rowKey(row: NearbyRow): string {
  return `${row.kind}-${row.id}`;
}

// Rows that carry a one-click main action (hail, examine, gather).
function hasAction(row: NearbyRow): boolean {
  if (row.kind === 'npc' || row.kind === 'object') return true;
  return row.kind === 'node' && row.nodeStatus === 'gather';
}

function act(row: NearbyRow): void {
  if (!connected.value) return;
  if (row.kind === 'npc') consoleApi.hail({ id: row.id, name: row.name });
  else if (row.kind === 'object') consoleApi.examine(row.name);
  else if (row.kind === 'node') consoleApi.gather({ id: row.id, name: row.name });
}

function trade(): void {
  if (!connected.value) return;
  consoleApi.trade();
}

function whisper(row: NearbyRow): void {
  if (!connected.value) return;
  consoleApi.whisperTo(row.name);
}

function invite(row: NearbyRow): void {
  if (!connected.value) return;
  consoleApi.invite(row.name);
}

const disabledAttr = computed(() => (connected.value ? undefined : 'true'));
</script>

<template>
  <section>
    <h6>Nearby</h6>
    <p v-if="rows.length === 0" class="empty">No one is nearby.</p>
    <ul v-else class="rows">
      <li
        v-for="row in rows"
        :key="rowKey(row)"
        class="nearby-row"
        :class="[`kind-${row.kind}`, { depleted: row.nodeStatus === 'depleted' }]"
      >
        <button
          v-if="hasAction(row)"
          type="button"
          class="row-main"
          :aria-disabled="disabledAttr"
          @click="act(row)"
        >
          <component :is="ICONS[row.kind]" class="row-icon" :size="14" aria-hidden="true" />
          <span class="row-name" :title="row.name">{{ row.name }}</span>
          <span class="row-hint">{{ row.hint }}</span>
        </button>
        <div v-else class="row-main static">
          <component :is="ICONS[row.kind]" class="row-icon" :size="14" aria-hidden="true" />
          <span class="row-name" :title="row.name">{{ row.name }}</span>
          <span class="row-hint">{{ row.hint }}</span>
        </div>

        <button
          v-if="row.kind === 'npc' && row.vendor"
          type="button"
          class="btn btn-ghost btn-icon"
          :aria-label="`Trade with ${row.name}`"
          :title="`Trade with ${row.name}`"
          :aria-disabled="disabledAttr"
          @click="trade()"
        >
          <PhStorefront :size="16" aria-hidden="true" />
        </button>
        <template v-if="row.kind === 'player'">
          <button
            type="button"
            class="btn btn-ghost btn-icon"
            :aria-label="`Whisper ${row.name}`"
            :title="`Whisper ${row.name}`"
            :aria-disabled="disabledAttr"
            @click="whisper(row)"
          >
            <PhChatCircle :size="16" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-icon"
            :aria-label="`Invite ${row.name}`"
            :title="`Invite ${row.name}`"
            :aria-disabled="disabledAttr"
            @click="invite(row)"
          >
            <PhUserPlus :size="16" aria-hidden="true" />
          </button>
        </template>
      </li>
    </ul>
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

.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nearby-row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 32px;
  min-width: 0;
}

.nearby-row.depleted {
  opacity: 0.45;
}

.row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  align-self: stretch;
  padding: 0 8px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: 12px;
  text-align: left;
}

button.row-main {
  cursor: pointer;
}

button.row-main:hover {
  background: color-mix(in srgb, var(--color-text) 7%, transparent);
}

button.row-main:active {
  background: color-mix(in srgb, var(--color-text) 14%, transparent);
}

button.row-main:focus-visible {
  outline-offset: -2px;
}

button.row-main[aria-disabled='true'] {
  opacity: 0.45;
  cursor: not-allowed;
}

.row-icon {
  flex-shrink: 0;
}

.kind-npc .row-icon {
  color: var(--color-line-npc);
}

.kind-object .row-icon {
  color: var(--color-neutral-400);
}

.kind-node .row-icon {
  color: var(--color-stamina);
}

.kind-player .row-icon {
  color: var(--color-line-whisper);
}

.row-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text);
}

.row-hint {
  flex-shrink: 0;
  margin-left: auto;
  font-size: 10px;
  color: var(--color-neutral-500);
  white-space: nowrap;
}

.nearby-row .btn-icon {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  color: var(--color-neutral-300);
}

.nearby-row .btn-icon[aria-disabled='true'] {
  opacity: 0.45;
  cursor: not-allowed;
}

@media (max-width: 899px) {
  .nearby-row {
    min-height: 44px;
  }

  .nearby-row .btn-icon {
    width: 44px;
    height: 44px;
  }
}
</style>
