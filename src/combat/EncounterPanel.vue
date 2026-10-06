<script setup lang="ts">
import { computed, inject } from 'vue';
import { COMBAT_KEY, GAME_KEY, createInertCombat, createInertGame } from '../game/context';
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
        <HostileCard
          v-for="hostile in hostiles"
          :key="String(hostile.id)"
          :hostile="hostile"
          :variant="variant"
          @select="select"
        />
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

.empty {
  margin: 0;
  font-size: 12px;
  color: var(--color-neutral-500);
}
</style>
