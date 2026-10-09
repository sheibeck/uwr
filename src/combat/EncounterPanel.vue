<script setup lang="ts">
import { computed, inject } from 'vue';
import { PhEye } from '@phosphor-icons/vue';
import {
  COMBAT_KEY,
  CONSOLE_KEY,
  GAME_KEY,
  createInertCombat,
  createInertConsole,
  createInertGame,
} from '../game/context';
import RatingMark from '../rails/RatingMark.vue';
import { usePlaceView } from '../rails/useExits';
import {
  encounterHeading,
  encounterRowOf,
  encounterSourceView,
  encounterTitle,
  hostileViews,
  livingHostileIds,
} from './hostiles';
import HostileCard from './HostileCard.vue';

// The Encounter panel (48-UI-SPEC "Encounter panel", CMB-01 to CMB-03; 51.3.1.1 UI-SPEC "Encounter
// panel", D-32, D-40): the desktop right rail while in combat, and the body of the mobile encounter
// sheet. The heading names the family (or the named enemy) and the living count; the source line says
// how the fight began; each card carries a role chip and a target line; the rail ends with the place
// and its rating. The Phase 48 threat block is gone (D-40). Targeting goes through the combat
// controller; the ring follows character.combatTargetEnemyId only.
const props = withDefaults(defineProps<{ variant?: 'rail' | 'sheet' }>(), { variant: 'rail' });

const game = inject(GAME_KEY, createInertGame());
const controller = inject(COMBAT_KEY, createInertCombat());
const consoleApi = inject(CONSOLE_KEY, createInertConsole());
const place = usePlaceView();

const combat = game.combat;
const encounter = computed(() => encounterRowOf(combat));

const hostiles = computed(() =>
  hostileViews({
    enemies: combat.enemies.value,
    templates: combat.enemyTemplates.value,
    abilities: combat.enemyAbilities.value,
    casts: combat.casts.value,
    effects: combat.enemyEffects.value,
    currentRound: combat.roundNumber.value,
    playerLevel: game.character.value?.level ?? 0n,
    targetId: game.character.value?.combatTargetEnemyId ?? null,
    selfId: game.characterId.value,
    characterNames: combat.characterNames.value,
    petNames: combat.petNames.value,
    namedFight: encounter.value?.origin === 'named',
  }),
);

const livingCount = computed(() => livingHostileIds(hostiles.value).length);
const heading = computed(() => encounterHeading(encounterTitle(encounter.value, hostiles.value), livingCount.value));
const source = computed(() => encounterSourceView(encounter.value));

// '[dot] {Place} · {Rating}' (rail only). The dot carries the rating colour; until the place's pools
// apply the rating is Unknown with no word, so the line reads the place alone, never Safe.
const foot = computed(() => {
  if (props.variant !== 'rail') return null;
  const here = place.value;
  if (!here) return null;
  const word = here.rating.word;
  return { key: here.rating.key, text: word === '' ? here.title : `${here.title} · ${word}` };
});

function select(id: bigint): void {
  controller.requestTarget(id);
}

// The eye sits beside the card, never inside its button (51-UI-SPEC "Examine eye button").
function examine(name: string): void {
  if (!game.connected.value) return;
  consoleApi.examine(name);
}
</script>

<template>
  <section class="encounter-panel" :class="{ sheet: variant === 'sheet' }" aria-label="Encounter">
    <div class="panel-head">
      <h6>{{ heading }}</h6>
      <span v-if="variant === 'rail'" class="hint">Tab to cycle</span>
    </div>
    <p v-if="source" class="source" :class="{ ambush: source.tone === 'ambush' }">{{ source.text }}</p>

    <template v-if="combat.applied.value">
      <p v-if="livingCount === 0" class="empty">No hostiles left.</p>
      <div v-else class="hostiles">
        <div v-for="hostile in hostiles" :key="String(hostile.id)" class="hostile-row">
          <HostileCard :hostile="hostile" :variant="variant" @select="select" />
          <button
            type="button"
            class="btn btn-ghost btn-icon btn-eye"
            :aria-label="`Examine ${hostile.name}`"
            :title="`Examine ${hostile.name}`"
            :aria-disabled="game.connected.value ? undefined : 'true'"
            @click="examine(hostile.name)"
          >
            <PhEye :size="16" aria-hidden="true" />
          </button>
        </div>
      </div>
    </template>

    <p v-if="foot" class="encounter-foot">
      <RatingMark :rating="{ key: foot.key, word: '' }" :size="12" />
      <span class="foot-text">{{ foot.text }}</span>
    </p>
  </section>
</template>

<style scoped>
.encounter-panel {
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.encounter-panel.sheet {
  flex: 0 0 auto;
  padding: 0;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.panel-head h6 {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--color-neutral-400);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hint {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--color-neutral-500);
  white-space: nowrap;
}

/* How the fight began (D-32): Label 12; ambushes in the con orange, the rest neutral. */
.source {
  margin: 0;
  font-size: 12px;
  color: var(--color-neutral-400);
}

.source.ambush {
  color: var(--color-con-orange);
}

.hostiles {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hostile-row {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
}

.hostile-row > :first-child {
  flex: 1;
  min-width: 0;
}

.hostile-row .btn-icon {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  color: var(--color-neutral-300);
}

.hostile-row .btn-icon[aria-disabled='true'] {
  opacity: 0.45;
  cursor: not-allowed;
}

@media (max-width: 899px) {
  .hostile-row .btn-icon {
    width: 44px;
    height: 44px;
  }
}

.empty {
  margin: 0;
  font-size: 12px;
  color: var(--color-neutral-500);
}

/* The rail foot (51.3.1.1 "Rating Marks"): pinned to the rail bottom. */
.encounter-foot {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  margin: 0;
  margin-top: auto;
  font-size: 12px;
  color: var(--color-neutral-500);
}

.foot-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
