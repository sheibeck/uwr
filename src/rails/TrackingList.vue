<script setup lang="ts">
import { computed, inject } from 'vue';
import { PhCheck } from '@phosphor-icons/vue';
import { GAME_KEY, createInertGame } from '../game/context';
import { trackedQuests } from './quests';

// Tracked quests (47-UI-SPEC "Tracking", CON-04). Quest names and descriptions come from quest
// templates and are rendered as text nodes only. Not interactive, no cap (the rail scrolls).
const game = inject(GAME_KEY, createInertGame());

const quests = computed(() =>
  trackedQuests(game.quests.value, game.questTemplates.value, game.characterId.value),
);

function pct(fraction: number): string {
  return `${Math.round(fraction * 1000) / 10}%`;
}
</script>

<template>
  <section>
    <h6>Tracking</h6>
    <p v-if="quests.length === 0" class="empty">No quests tracked.</p>
    <ul v-else class="quests">
      <li v-for="quest in quests" :key="String(quest.id)" class="quest">
        <div class="quest-row">
          <PhCheck v-if="quest.ready" class="ready-icon" :size="14" aria-hidden="true" />
          <span class="quest-name" :title="quest.name">{{ quest.name }}</span>
          <span class="quest-count">{{ quest.countText }}</span>
        </div>
        <div
          v-if="quest.showBar"
          class="track"
          role="progressbar"
          :aria-label="`${quest.name} progress`"
          aria-valuemin="0"
          :aria-valuenow="Number(quest.progress)"
          :aria-valuemax="Number(quest.required)"
        >
          <div class="fill" :style="{ width: pct(quest.fraction) }"></div>
        </div>
        <p v-else-if="quest.description" class="quest-description" :title="quest.description">
          {{ quest.description }}
        </p>
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

.quests {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.quest {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.quest-row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  font-size: 12px;
}

.ready-icon {
  flex-shrink: 0;
  color: var(--color-accent);
}

.quest-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-neutral-100);
}

.quest-count {
  flex-shrink: 0;
  margin-left: auto;
  color: var(--color-neutral-500);
  font-variant-numeric: tabular-nums;
}

.track {
  height: 3px;
  border-radius: var(--radius-sm);
  background: var(--color-neutral-900);
  overflow: hidden;
}

.fill {
  height: 100%;
  background: var(--color-accent);
}

.quest-description {
  margin: 0;
  font-size: 12px;
  color: var(--color-neutral-400);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
