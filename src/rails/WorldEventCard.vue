<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue';
import { FRAME_KEY, GAME_KEY, createInertFrame, createInertGame } from '../game/context';
import { eventCard } from './worldEvent';

// Active world event card for the context rail (47-UI-SPEC "World event card", CON-04).
// Leads with objective progress; the For/Against bar shows only once a counter has moved
// (owner decision after research). Event and objective names are server text, rendered as text nodes.
const game = inject(GAME_KEY, createInertGame());
const frame = inject(FRAME_KEY, createInertFrame());

const REFRESH_MS = 60_000;

const nowMicros = ref(game.clock.nowMicros());
let timer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  nowMicros.value = game.clock.nowMicros();
  timer = setInterval(() => {
    nowMicros.value = game.clock.nowMicros();
  }, REFRESH_MS);
});

onBeforeUnmount(() => {
  if (timer !== null) clearInterval(timer);
  timer = null;
});

const regionId = computed<bigint | null>(() => {
  const locationId = game.character.value?.locationId;
  if (locationId === undefined || locationId === null) return null;
  const location = game.locations.value.find((l) => l.id === locationId);
  return location ? location.regionId : null;
});

const card = computed(() =>
  eventCard({
    events: game.worldEvents.value,
    regionId: regionId.value,
    objectives: game.eventObjectives.value,
    contributions: game.contributions.value,
    characterId: game.characterId.value,
    nowMicros: nowMicros.value,
  }),
);

function pct(fraction: number): string {
  return `${Math.round(fraction * 1000) / 10}%`;
}

function openEvents(): void {
  frame.openScreen('events');
}
</script>

<template>
  <section v-if="card" class="card elev-sm event-card" aria-label="World event">
    <div class="kicker-row">
      <span class="card-kicker">World event</span>
      <span v-if="card.timeLeft" class="time-left">{{ card.timeLeft }}</span>
    </div>
    <div class="card-title event-title" :title="card.name">{{ card.name }}</div>

    <ul v-if="card.objectives.length > 0" class="objectives">
      <li v-for="objective in card.objectives" :key="String(objective.id)" class="objective">
        <div class="objective-row">
          <span class="objective-name" :title="objective.name">{{ objective.name }}</span>
          <span class="objective-count">{{ objective.current }}/{{ objective.target }}</span>
        </div>
        <div
          class="track"
          role="progressbar"
          :aria-label="objective.text"
          aria-valuemin="0"
          :aria-valuenow="Number(objective.current)"
          :aria-valuemax="Number(objective.target)"
        >
          <div class="fill" :style="{ width: pct(objective.fraction) }"></div>
        </div>
      </li>
    </ul>

    <template v-if="card.split">
      <div class="split" role="img" :aria-label="`For ${card.split.forPct}%, Against ${card.split.againstPct}%`">
        <div class="split-for" :style="{ width: `${card.split.forPct}%` }"></div>
        <div class="split-against" :style="{ width: `${card.split.againstPct}%` }"></div>
      </div>
      <div class="card-meta split-meta">
        <span>For {{ card.split.forPct }}%</span>
        <span class="against">Against {{ card.split.againstPct }}%</span>
      </div>
    </template>

    <p v-if="card.contribution !== null" class="contribution">Your contribution {{ card.contribution }}</p>

    <button v-if="card.more > 0" type="button" class="btn btn-ghost more" @click="openEvents">
      {{ card.more }} more
    </button>
  </section>
</template>

<style scoped>
.event-card {
  margin-top: auto;
  gap: 8px;
  min-width: 0;
}

.kicker-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.time-left {
  font-size: 12px;
  color: var(--color-neutral-400);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.event-title {
  font-size: 14px;
  font-weight: 500;
  overflow-wrap: anywhere;
}

.objectives {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.objective {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.objective-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  min-width: 0;
}

.objective-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.objective-count {
  flex-shrink: 0;
  color: var(--color-neutral-400);
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

.split {
  display: flex;
  gap: 4px;
  height: 6px;
}

.split-for,
.split-against {
  min-width: 0;
  height: 100%;
  border-radius: var(--radius-sm);
}

.split-for {
  background: var(--color-accent);
}

.split-against {
  background: var(--color-neutral-700);
}

.split-meta {
  justify-content: space-between;
  font-size: 12px;
}

.contribution {
  margin: 0;
  font-size: 12px;
  color: var(--color-neutral-500);
}

.more {
  align-self: flex-start;
  font-size: 12px;
}
</style>
