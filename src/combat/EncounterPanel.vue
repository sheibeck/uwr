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
import { encounterHeading, hostileViews, livingHostileIds } from './hostiles';
import { threatView } from './threat';
import HostileCard from './HostileCard.vue';
import ThreatBlock from './ThreatBlock.vue';

// The Encounter panel (48-UI-SPEC "Encounter panel", CMB-01 to CMB-03): the desktop right rail
// while in combat, and the body of the mobile encounter sheet. Targeting goes through the combat
// controller; the ring follows character.combatTargetEnemyId only.
withDefaults(defineProps<{ variant?: 'rail' | 'sheet' }>(), { variant: 'rail' });

const game = inject(GAME_KEY, createInertGame());
const controller = inject(COMBAT_KEY, createInertCombat());
const consoleApi = inject(CONSOLE_KEY, createInertConsole());

const combat = game.combat;

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
  }),
);

const livingCount = computed(() => livingHostileIds(hostiles.value).length);
const heading = computed(() => encounterHeading(livingCount.value));
const target = computed(() => hostiles.value.find((hostile) => hostile.targeted) ?? null);

const threat = computed(() =>
  threatView({
    entries: combat.aggro.value,
    target: target.value === null ? null : { id: target.value.id, name: target.value.name },
    selfId: game.characterId.value,
    characterNames: combat.characterNames.value,
    applied: combat.aggroApplied.value,
  }),
);

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
      <ThreatBlock v-if="threat.visible && livingCount > 0" :view="threat" />
    </template>
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
}

.panel-head h6 {
  margin: 0;
  color: var(--color-neutral-400);
}

.hint {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--color-neutral-500);
  white-space: nowrap;
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
</style>
