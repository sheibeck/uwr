<script setup lang="ts">
import { computed, inject } from 'vue';
import { PhArrowRight } from '@phosphor-icons/vue';
import { CONSOLE_KEY, GAME_KEY, createInertConsole, createInertGame } from '../game/context';
import { UNKNOWN_PLACE, describePlace } from '../session/frameView';
import { routesFrom } from './levelRange';

// Here card with the routes out (47-UI-SPEC "Context Rail Contract", CON-04). Location, region and
// destination names are server text, rendered as text nodes only.
const game = inject(GAME_KEY, createInertGame());
const consoleApi = inject(CONSOLE_KEY, createInertConsole());

const character = computed(() => game.character.value);
const connected = computed(() => game.connected.value);

const place = computed(() => {
  const locationId = character.value?.locationId;
  const described = describePlace(locationId, game.locations.value, game.regions.value);
  if (described.locationName === UNKNOWN_PLACE) return { kicker: 'Here', title: UNKNOWN_PLACE };
  const location = game.locations.value.find((l) => l.id === locationId);
  const region = location ? game.regions.value.find((r) => r.id === location.regionId) : undefined;
  return { kicker: `Here · ${region ? region.name : UNKNOWN_PLACE}`, title: described.locationName };
});

const routes = computed(() =>
  routesFrom(
    game.connections.value,
    character.value ? character.value.locationId : null,
    game.locations.value,
    game.regions.value,
  ),
);

function travel(route: { locationId: bigint; name: string }): void {
  if (!connected.value) return;
  consoleApi.travel({ id: route.locationId, name: route.name });
}
</script>

<template>
  <section v-if="!character">
    <h6>Here</h6>
    <p class="empty">Your location appears here.</p>
  </section>

  <section v-else class="card here-card" aria-label="Here">
    <span class="card-kicker">{{ place.kicker }}</span>
    <div class="card-title here-title" :title="place.title">{{ place.title }}</div>

    <ul v-if="routes.length > 0" class="routes">
      <li v-for="route in routes" :key="String(route.locationId)">
        <button
          type="button"
          class="route-row"
          :aria-disabled="connected ? undefined : 'true'"
          :title="route.name"
          @click="travel(route)"
        >
          <PhArrowRight class="route-arrow" :size="14" aria-hidden="true" />
          <span class="route-name">{{ route.name }}</span>
          <span class="tag route-tag" :class="route.level.safe ? 'tag-accent' : 'tag-neutral'">{{ route.label }}</span>
        </button>
      </li>
    </ul>
    <p v-else class="empty">No known routes.</p>
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

.here-card {
  gap: 8px;
  min-width: 0;
}

.here-title {
  overflow-wrap: anywhere;
}

.routes {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.route-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.route-row:hover {
  background: color-mix(in srgb, var(--color-text) 7%, transparent);
}

.route-row:active {
  background: color-mix(in srgb, var(--color-text) 14%, transparent);
}

.route-row:focus-visible {
  outline-offset: -2px;
}

.route-row[aria-disabled='true'] {
  opacity: 0.45;
  cursor: not-allowed;
}

.route-arrow {
  flex-shrink: 0;
  color: var(--color-neutral-500);
}

.route-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-accent-300);
}

.route-row:hover .route-name,
.route-row:focus-visible .route-name {
  text-decoration: underline;
}

.route-tag {
  flex-shrink: 0;
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 899px) {
  .route-row {
    min-height: 44px;
  }
}
</style>
